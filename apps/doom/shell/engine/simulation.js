// The kinetic engine: a pure function from (world, input) to the next world
// at 35 Hz. Levels are registered by name and stay out of the snapshot.

import { prngStep } from "/omnishell/interpreter/prng.js";
import { THING_TYPES, SECTOR_SPECIALS } from "./catalog.js";
import { getLevel, nextLevel } from "./level.js";
import { heightClip } from "./collide.js";
import { bossDeath, tickMovers } from "./movers.js";
import { playerThink } from "./player.js";
import { monstersThink } from "./monsters.js";
import { tickProjectiles } from "./projectiles.js";
import { barrelsThink } from "./combat.js";
import { newPlayer, pickupThings, spawnBarrels, spawnMonsters } from "./actors.js";
import { WEAPONS } from "./weapons.js";
import { TICRATE, normAngle } from "./constants.js";

export const PISTOL_START = Object.freeze({
  health: 100, armor: 0, armorType: 0, bullets: 50, shells: 0, rockets: 0, cells: 0,
  backpack: false, weapons: ["fist", "pistol"], weapon: "pistol", strength: false,
});

const MENU_ITEMS = 4;
const SKILLS = 5;
const PAUSE_ITEMS = 3;

function int(name, v, lo, hi) {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new RangeError(`doomKineticEngine.initState: ${name} must be an integer in [${lo}, ${hi}], got ${v}`);
  return v;
}

function checkLoadout(l) {
  int("health", l.health, 1, 200);
  int("armor", l.armor, 0, 200);
  int("armorType", l.armorType, 0, 2);
  for (const a of ["bullets", "shells", "rockets", "cells"]) int(a, l[a], 0, 600);
  for (const w of l.weapons) if (!(w in WEAPONS)) throw new RangeError(`doomKineticEngine.initState: unknown weapon ${w}`);
  if (!l.weapons.includes(l.weapon)) throw new RangeError(`doomKineticEngine.initState: weapon ${l.weapon} is not carried`);
  return l;
}

// Replaces -0 with 0 and refuses NaN or infinities, so a snapshot round-trips.
function normalize(v) {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new RangeError(`doomKineticEngine: non-finite number ${v} in the world`);
    return v === 0 ? 0 : v;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = normalize(v[i]);
    return v;
  }
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) v[k] = normalize(v[k]);
  }
  return v;
}

// A key newly pressed this tic.
function edge(cmd, last, ...keys) {
  return keys.some((k) => cmd[k] && !last[k]);
}

function keepCmd(cmd) {
  const out = {};
  for (const k of ["forward", "backward", "up", "down", "enter", "escape", "fire", "use"]) if (cmd[k]) out[k] = true;
  return out;
}

function intermissionOf(world, level) {
  const s = world.stats;
  return {
    levelName: level.title,
    kills: s.kills, totalKills: s.totalKills,
    items: s.items, totalItems: s.totalItems,
    secrets: s.secrets, totalSecrets: s.totalSecrets,
    time: Math.floor((world.tick - world.levelStart) / TICRATE),
    nextMap: nextLevel(level.name, world.exit === "secret"),
  };
}

function carried(p) {
  return {
    health: p.health, armor: p.armor, armorType: p.armorType,
    bullets: p.bullets, shells: p.shells, rockets: p.rockets, cells: p.cells,
    backpack: p.backpack, weapons: [...p.weapons], weapon: p.weapon, strength: false,
  };
}

// A level the engine enters on its own keeps what belongs to the match, not
// the level: the score the relational plane mirrors, and the clock.
function enter(w, options) {
  const p = w.player;
  const next = doomKineticEngine.initState(w.seed, { skill: w.skill, fragLimit: p.fragLimit, fragsUs: p.fragsUs, fragsThem: p.fragsThem, ...options });
  next.tick = w.tick;
  next.levelStart = w.tick;
  return next;
}

export const doomKineticEngine = {
  rateHz: TICRATE,

  initState(seed = 0x1337, options = {}) {
    int("seed", seed, -0x80000000, 0x7FFFFFFF);
    const skill = int("skill", options.skill ?? 2, 0, SKILLS - 1);
    const mapName = options.mapName ?? "e1m1";
    const level = getLevel(mapName);
    const loadout = checkLoadout({ ...PISTOL_START, ...(options.loadout || {}) });
    const world = {
      tick: 0,
      levelStart: 0,
      seed,
      rngState: seed,
      phase: options.phase ?? "active",
      mode: "campaign",
      mapName,
      skill,
      menuIndex: 0,
      menuSub: "",
      pauseIndex: 0,
      sectors: {},
      movers: [],
      switches: {},
      usedLines: [],
      heard: [],
      player: null,
      monsters: [],
      barrels: [],
      pickups: pickupThings(level, skill),
      collected: [],
      drops: [],
      projectiles: [],
      puffs: [],
      feed: [],
      stats: { kills: 0, totalKills: 0, items: 0, totalItems: 0, secrets: 0, totalSecrets: 0 },
      exit: "",
      bossDone: false,
      intermission: false,
      events: [],
      lastCmd: {},
    };
    world.player = newPlayer(world, level, { ...loadout, fragLimit: options.fragLimit ?? 100 });
    // A remounted match resumes the relational score.
    world.player.fragsUs = int("fragsUs", options.fragsUs ?? 0, 0, 100000);
    world.player.fragsThem = int("fragsThem", options.fragsThem ?? 0, 0, 100000);
    world.monsters = spawnMonsters(world, level, skill);
    world.barrels = spawnBarrels(world, level, skill);
    for (const a of [world.player, ...world.monsters, ...world.barrels]) heightClip(world, level, a);
    world.player.ammo = WEAPONS[world.player.weapon].ammo ? world.player[WEAPONS[world.player.weapon].ammo] : 0;
    world.stats.totalKills = world.monsters.filter((m) => THING_TYPES[m.type].monster !== "lostsoul").length;
    world.stats.totalItems = world.pickups.filter((i) => THING_TYPES[level.things[i].type].countsAsItem).length;
    world.stats.totalSecrets = level.sectors.filter((s) => SECTOR_SPECIALS[s.special]?.secret).length;
    return normalize(world);
  },

  advanceFrame(world, cmd = {}) {
    const w = JSON.parse(JSON.stringify(world));
    let rng = w.rngState;
    const random = () => {
      const [v, next] = prngStep(rng);
      rng = next;
      return Math.floor(v * 256);
    };
    const last = w.lastCmd;
    w.events = [];
    w.tick += 1;
    if (cmd.skill !== undefined) w.skill = int("skill", cmd.skill, 0, SKILLS - 1);

    const finish = () => {
      w.rngState = rng;
      w.lastCmd = keepCmd(cmd);
      return normalize(w);
    };
    const down = edge(cmd, last, "down", "backward");
    const up = edge(cmd, last, "up", "forward");
    const select = edge(cmd, last, "enter", "fire");
    const back = edge(cmd, last, "escape");

    if (w.phase === "menu") {
      const count = w.menuSub === "skill" ? SKILLS : MENU_ITEMS;
      if (down) { w.menuIndex = (w.menuIndex + 1) % count; w.events.push("menu-move"); }
      else if (up) { w.menuIndex = (w.menuIndex + count - 1) % count; w.events.push("menu-move"); }
      else if (select) {
        if (w.menuSub === "skill") {
          const next = enter(w, { mapName: w.mapName, skill: w.menuIndex });
          next.events = ["game-start"];
          return next;
        }
        w.events.push("menu-select");
        if (w.menuSub) { w.menuSub = ""; w.menuIndex = 0; }
        else {
          w.menuSub = ["skill", "options", "controls", "credits"][w.menuIndex];
          w.menuIndex = w.menuSub === "skill" ? 2 : 0;
        }
      } else if (back && w.menuSub) { w.menuSub = ""; w.menuIndex = 0; w.events.push("menu-select"); }
      return finish();
    }

    if (w.phase === "intermission") {
      if (edge(cmd, last, "enter", "use", "fire")) {
        const nextMap = w.intermission.nextMap;
        if (!nextMap) {
          const menu = enter(w, { mapName: "e1m1", phase: "menu" });
          menu.events = ["episode-end"];
          return menu;
        }
        const next = enter(w, { mapName: nextMap, loadout: carried(w.player) });
        next.events = ["level-start"];
        return next;
      }
      return finish();
    }

    if (w.phase === "paused") {
      if (down) { w.pauseIndex = (w.pauseIndex + 1) % PAUSE_ITEMS; w.events.push("menu-move"); }
      else if (up) { w.pauseIndex = (w.pauseIndex + PAUSE_ITEMS - 1) % PAUSE_ITEMS; w.events.push("menu-move"); }
      else if (select) {
        if (w.pauseIndex === 0) { w.phase = "active"; w.events.push("resume"); }
        else return enter(w, { mapName: w.mapName, phase: w.pauseIndex === 1 ? "active" : "menu" });
      } else if (back) { w.phase = "active"; w.events.push("resume"); }
      return finish();
    }

    if (back) {
      w.phase = "paused";
      w.pauseIndex = 0;
      w.events.push("pause");
      return finish();
    }

    const level = getLevel(w.mapName);
    if (cmd.teleport) {
      const p = w.player;
      p.x = cmd.teleport.x;
      p.y = cmd.teleport.y;
      if (Number.isInteger(cmd.teleport.angle)) p.angle = normAngle(cmd.teleport.angle);
      p.momx = p.momy = p.momz = 0;
      heightClip(w, level, p);
      p.z = p.floorz;
    }
    playerThink(w, level, cmd, last, random);
    tickMovers(w, level);
    monstersThink(w, level, random);
    bossDeath(w, level);
    tickProjectiles(w, level, random);
    barrelsThink(w, level, random);
    w.puffs = w.puffs.filter((p) => --p.tics > 0);

    if (w.exit) {
      w.intermission = intermissionOf(w, level);
      w.phase = "intermission";
      w.events.push("level-exit");
      w.exit = "";
    }
    return finish();
  },

  saveState(state) {
    if (!state || typeof state !== "object") throw new TypeError(`doomKineticEngine.saveState: expected a state object, got ${typeof state}`);
    return JSON.stringify(state, (k, v) => {
      if (typeof v === "number" && (!Number.isFinite(v) || Object.is(v, -0))) {
        throw new RangeError(`doomKineticEngine.saveState: ${k}=${v} is not a JSON-representable finite number`);
      }
      return v;
    });
  },

  loadState(snapshot) {
    if (typeof snapshot !== "string") throw new TypeError(`doomKineticEngine.loadState: expected a JSON snapshot string, got ${typeof snapshot}`);
    return JSON.parse(snapshot);
  },
};
