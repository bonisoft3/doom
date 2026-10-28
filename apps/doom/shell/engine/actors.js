// Things spawned from a level's thing list. Pickups and decorations stay in
// the level; the world tracks only what changes (monsters, barrels, the
// player, collected and dropped items).

import { THING_FLAGS, THING_TYPES } from "./catalog.js";
import { sectorAt } from "./level.js";
import { floorOf, ceilOf } from "./sectors.js";
import { ANG_FULL, PLAYER } from "./constants.js";

const SKILL_BIT = [THING_FLAGS.EASY, THING_FLAGS.EASY, THING_FLAGS.MEDIUM, THING_FLAGS.HARD, THING_FLAGS.HARD];

export function spawnsOnSkill(thing, skill) {
  return (thing.flags & THING_FLAGS.MULTIPLAYER) === 0 && (thing.flags & SKILL_BIT[skill]) !== 0;
}

const thingAngle = (t) => Math.round((t.angle * ANG_FULL) / 360) % ANG_FULL;

function placed(world, level, x, y) {
  const s = sectorAt(level, x, y);
  const z = floorOf(world, level, s);
  return { x, y, z, floorz: z, ceilingz: ceilOf(world, level, s), momx: 0, momy: 0, momz: 0 };
}

export function newPlayer(world, level, loadout) {
  const start = level.things.find((t) => THING_TYPES[t.type].kind === "player-start" && THING_TYPES[t.type].player === 1);
  if (!start) throw new Error(`level ${level.name} has no player 1 start`);
  return {
    kind: "player",
    ...placed(world, level, start.x, start.y),
    angle: thingAngle(start),
    radius: PLAYER.radius,
    height: PLAYER.height,
    health: loadout.health,
    armor: loadout.armor,
    armorType: loadout.armorType,
    bullets: loadout.bullets,
    shells: loadout.shells,
    rockets: loadout.rockets,
    cells: loadout.cells,
    backpack: loadout.backpack,
    weapons: [...loadout.weapons],
    weapon: loadout.weapon,
    ammo: 0,
    keys: { blue: false, yellow: false, red: false },
    powers: { invisibility: 0, ironfeet: 0, strength: loadout.strength },
    reaction: 0,
    shootTimer: 0,
    refire: 0,
    recoil: 0,
    damageFlash: 0,
    bonusFlash: 0,
    faceLook: 0,
    fragsUs: 0,
    fragsThem: 0,
    fragLimit: loadout.fragLimit,
    status: "active",
  };
}

export function spawnMonsters(world, level, skill) {
  const out = [];
  level.things.forEach((t, i) => {
    const def = THING_TYPES[t.type];
    if (def.kind !== "monster" || !spawnsOnSkill(t, skill)) return;
    out.push({
      kind: "monster",
      id: i,
      type: t.type,
      ...placed(world, level, t.x, t.y),
      angle: thingAngle(t),
      radius: def.radius,
      height: def.height,
      health: def.health,
      float: def.monster === "lostsoul",
      ambush: (t.flags & THING_FLAGS.AMBUSH) !== 0,
      state: "idle",
      tics: 0,
      target: false,
      reaction: 8,
      moveDir: -1,
      moveCount: 0,
      frame: i % 4,
      respawn: 0,
    });
  });
  return out;
}

export function spawnBarrels(world, level, skill) {
  const out = [];
  level.things.forEach((t, i) => {
    const def = THING_TYPES[t.type];
    if (def.kind !== "barrel" || !spawnsOnSkill(t, skill)) return;
    out.push({ kind: "barrel", id: i, ...placed(world, level, t.x, t.y), radius: def.radius, height: def.height, health: def.health, state: "idle", tics: 0 });
  });
  return out;
}

// Indices of the level's pickup things present on this skill.
export function pickupThings(level, skill) {
  const out = [];
  level.things.forEach((t, i) => {
    const k = THING_TYPES[t.type].kind;
    if ((k === "weapon" || k === "ammo" || k === "item" || k === "key") && spawnsOnSkill(t, skill)) out.push(i);
  });
  return out;
}
