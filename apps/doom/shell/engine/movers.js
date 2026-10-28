// Line specials and the sector movers they start, after the original engine's
// p_doors / p_plats / p_floor / p_switch / p_telept. Speeds are map units per
// tic and waits are tics, as in the original.

import { BOSS_DEATHS, LINE_SPECIALS, THING_TYPES } from "./catalog.js";
import { levelIndex, sectorAt } from "./level.js";
import {
  ceilOf, floorOf, highestNeighborFloor, lowestNeighborCeil, lowestNeighborFloor,
  nextHigherNeighborFloor, sectorProp, setSector,
} from "./sectors.js";
import { heightClip } from "./collide.js";
import { ANG_FULL, q } from "./constants.js";

const DOOR_SPEED = { normal: 2, fast: 8 };
const DOOR_WAIT = 150;
const LIFT_SPEED = { normal: 4, fast: 8 };
const PLAT_WAIT = 105;
const FLOOR_SPEED = { slow: 1, fast: 4 };
const STAIR_SPEED = 0.25;
const BUTTON_TICS = 35;

const KEY_MESSAGE = { blue: "You need a blue key to open this door", yellow: "You need a yellow key to open this door", red: "You need a red key to open this door" };

function moverOn(world, sector, plane) {
  return world.movers.find((m) => m.sector === sector && m.plane === plane);
}

function actorsNear(world, level, s) {
  const [x0, y0, x1, y1] = levelIndex(level).sectorBox[s];
  const near = (a) => a.x + a.radius >= x0 && a.x - a.radius <= x1 && a.y + a.radius >= y0 && a.y - a.radius <= y1;
  const out = [];
  if (near(world.player)) out.push(world.player);
  for (const m of world.monsters) if (m.health > 0 && near(m)) out.push(m);
  for (const b of world.barrels) if (b.health > 0 && near(b)) out.push(b);
  return out;
}

// Moves a sector's floor or ceiling one step toward dest. Things standing on a
// moving floor ride it; a move that would squeeze a thing is undone.
function movePlane(world, level, s, plane, speed, dest, dir) {
  const cur = plane === "floor" ? floorOf(world, level, s) : ceilOf(world, level, s);
  const next = dir < 0 ? Math.max(dest, cur - speed) : Math.min(dest, cur + speed);
  setSector(world, s, { [plane]: q(next) });
  const squeezing = plane === "floor" ? dir > 0 : dir < 0;
  const actors = actorsNear(world, level, s);
  let fits = true;
  for (const a of actors) if (!heightClip(world, level, a)) fits = false;
  if (!fits && squeezing) {
    setSector(world, s, { [plane]: cur });
    for (const a of actors) heightClip(world, level, a);
    return "blocked";
  }
  return next === dest ? "pastdest" : "ok";
}

function startDoor(world, level, s, type, speed) {
  const floor = floorOf(world, level, s);
  const top = lowestNeighborCeil(world, level, s) - 4;
  const m = { plane: "ceil", kind: "door", sector: s, type, speed: DOOR_SPEED[speed], top, dir: type === "close" ? -1 : 1, wait: 0 };
  if (type === "close" && ceilOf(world, level, s) === floor) return false;
  world.movers.push(m);
  world.events.push(type === "close" ? "door-close" : "door-open");
  return true;
}

function startLift(world, level, s, speed) {
  world.movers.push({
    plane: "floor", kind: "plat", type: "lift", sector: s, speed: LIFT_SPEED[speed],
    low: Math.min(lowestNeighborFloor(world, level, s), floorOf(world, level, s)),
    high: floorOf(world, level, s), status: "down", wait: 0,
  });
  world.events.push("lift-start");
  return true;
}

function startPlat(world, level, s, type, frontSector, rand) {
  const floor = floorOf(world, level, s);
  if (type === "perpetual") {
    world.movers.push({
      plane: "floor", kind: "plat", type, sector: s, speed: 1,
      low: Math.min(lowestNeighborFloor(world, level, s), floor),
      high: Math.max(highestNeighborFloor(world, level, s), floor),
      status: rand() < 0.5 ? "up" : "down", wait: 0,
    });
  } else {
    setSector(world, s, { floorFlat: sectorProp(world, level, frontSector, "floorFlat"), special: 0 });
    world.movers.push({ plane: "floor", kind: "plat", type, sector: s, speed: 0.5, low: floor, high: nextHigherNeighborFloor(world, level, s), status: "up", wait: 0 });
  }
  world.events.push("lift-start");
  return true;
}

function startFloor(world, level, s, type, speed) {
  const floor = floorOf(world, level, s);
  let dest, dir;
  if (type === "lowest-neighbor") { dest = lowestNeighborFloor(world, level, s); dir = -1; }
  else if (type === "highest-neighbor") { dest = highestNeighborFloor(world, level, s); dir = -1; }
  else if (type === "highest-neighbor-plus-8") {
    dest = highestNeighborFloor(world, level, s);
    if (dest !== floor) dest += 8;
    dir = -1;
  } else if (type === "raise-24") { dest = floor + 24; dir = 1; }
  else throw new Error(`floor type ${type} is not implemented`);
  world.movers.push({ plane: "floor", kind: "floor", sector: s, speed: FLOOR_SPEED[speed], dest, dir });
  return true;
}

// EV_BuildStairs: each step is the next sector, reached through a two-sided
// line whose front faces the current step, sharing the first step's flat.
function buildStairs(world, level, s, step) {
  const ix = levelIndex(level);
  const flat = sectorProp(world, level, s, "floorFlat");
  let height = floorOf(world, level, s) + step;
  let sec = s;
  for (;;) {
    world.movers.push({ plane: "floor", kind: "floor", sector: sec, speed: STAIR_SPEED, dest: height, dir: 1 });
    let next = -1;
    for (const i of ix.sectorLines[sec]) {
      if (ix.lineFront[i] !== sec || ix.lineBack[i] < 0) continue;
      const t = ix.lineBack[i];
      if (sectorProp(world, level, t, "floorFlat") !== flat || moverOn(world, t, "floor")) continue;
      next = t;
      break;
    }
    if (next < 0) return true;
    height += step;
    sec = next;
  }
}

function teleport(world, level, line, actor) {
  const ix = levelIndex(level);
  for (const s of ix.tagSectors.get(line.tag) || []) {
    const dest = ix.teleportDest.get(s);
    if (dest === undefined) continue;
    const t = level.things[dest];
    actor.x = t.x;
    actor.y = t.y;
    actor.z = floorOf(world, level, sectorAt(level, t.x, t.y));
    actor.floorz = actor.z;
    actor.angle = Math.round((t.angle * ANG_FULL) / 360) % ANG_FULL;
    actor.momx = actor.momy = actor.momz = 0;
    if (actor.kind === "player") actor.reaction = 18;
    heightClip(world, level, actor);
    world.events.push("teleport");
    return true;
  }
  return false;
}

// Fires line i for actor, reached by "cross", "use" or "shoot" from side
// (0 front, 1 back). Returns whether the special did anything.
export function activateLine(world, level, i, actor, how, side, rand) {
  const line = level.lines[i];
  const def = LINE_SPECIALS[line.special];
  if (!def || world.usedLines.includes(i)) return false;
  const trigger = def.trigger[0];
  if ((how === "cross") !== (trigger === "W") || (how === "use") !== (trigger === "S" || trigger === "D") || (how === "shoot") !== (trigger === "G")) return false;
  const isPlayer = actor.kind === "player";
  if (isPlayer ? def.monstersOnly : !(def.monsters || def.monstersOnly)) return false;
  if (how === "use" && side !== 0) return false;
  if (def.key && !(isPlayer && actor.keys[def.key])) {
    if (isPlayer) world.events.push("door-locked", `msg:${KEY_MESSAGE[def.key]}`);
    return false;
  }

  const ix = levelIndex(level);
  const tagged = () => ix.tagSectors.get(line.tag) || [];
  let done = false;
  switch (def.action) {
    case "door":
      if (trigger === "D") {
        const s = ix.lineBack[i];
        if (s < 0) return false;
        const m = moverOn(world, s, "ceil");
        if (m) {
          if (def.door !== "open-wait-close" || def.trigger !== "DR") return false;
          if (m.dir === -1) m.dir = 1;
          else if (isPlayer) m.dir = -1;
          done = true;
        } else done = startDoor(world, level, s, def.door, def.speed);
      } else {
        for (const s of tagged()) if (!moverOn(world, s, "ceil")) done = startDoor(world, level, s, def.door, def.speed) || done;
      }
      break;
    case "lift":
      for (const s of tagged()) if (!moverOn(world, s, "floor")) done = startLift(world, level, s, def.speed) || done;
      break;
    case "plat":
      for (const s of tagged()) if (!moverOn(world, s, "floor")) done = startPlat(world, level, s, def.plat, ix.lineFront[i], rand) || done;
      break;
    case "floor":
      for (const s of tagged()) if (!moverOn(world, s, "floor")) done = startFloor(world, level, s, def.floor, def.speed) || done;
      break;
    case "stairs":
      for (const s of tagged()) if (!moverOn(world, s, "floor")) done = buildStairs(world, level, s, def.step) || done;
      break;
    case "teleport":
      done = side === 0 && teleport(world, level, line, actor);
      break;
    case "exit":
      world.exit = def.exit;
      done = true;
      break;
    case "light":
      for (const s of tagged()) setSector(world, s, { light: def.light });
      done = true;
      break;
    case "scroll":
      return false;
    default:
      throw new Error(`line special ${line.special}: action ${def.action} is not implemented`);
  }

  if (done && (trigger === "S" || trigger === "G")) {
    world.switches[i] = def.trigger[1] === "R" ? BUTTON_TICS : -1;
    world.events.push("switch");
  }
  if (def.trigger[1] === "1" && (trigger === "W" || done)) world.usedLines.push(i);
  return done;
}

export function bossDeath(world, level) {
  const rule = BOSS_DEATHS[level.name];
  if (!rule || world.bossDone) return;
  const bosses = world.monsters.filter((m) => THING_TYPES[m.type].monster === rule.monster);
  if (!bosses.length || bosses.some((m) => m.health > 0)) return;
  world.bossDone = true;
  const ix = levelIndex(level);
  for (const s of ix.tagSectors.get(rule.tag) || []) if (!moverOn(world, s, "floor")) startFloor(world, level, s, rule.floor, "slow");
}

export function tickMovers(world, level) {
  const keep = [];
  for (const m of world.movers) {
    if (m.kind === "door") {
      if (m.dir === 0) {
        if (--m.wait <= 0) { m.dir = -1; world.events.push("door-close"); }
        keep.push(m);
      } else if (m.dir === -1) {
        const r = movePlane(world, level, m.sector, "ceil", m.speed, floorOf(world, level, m.sector), -1);
        if (r === "pastdest") continue;
        if (r === "blocked" && m.type !== "close") { m.dir = 1; world.events.push("door-open"); }
        keep.push(m);
      } else {
        const r = movePlane(world, level, m.sector, "ceil", m.speed, m.top, 1);
        if (r === "pastdest") {
          if (m.type !== "open-wait-close") continue;
          m.dir = 0;
          m.wait = DOOR_WAIT;
        }
        keep.push(m);
      }
    } else if (m.kind === "plat") {
      if (m.status === "waiting") {
        if (--m.wait <= 0) m.status = floorOf(world, level, m.sector) === m.low ? "up" : "down";
        keep.push(m);
      } else if (m.status === "up") {
        const r = movePlane(world, level, m.sector, "floor", m.speed, m.high, 1);
        if (r === "blocked") { m.status = "down"; keep.push(m); continue; }
        if (r === "pastdest") {
          world.events.push("lift-stop");
          if (m.type !== "perpetual") continue;
          m.status = "waiting";
          m.wait = PLAT_WAIT;
        }
        keep.push(m);
      } else {
        const r = movePlane(world, level, m.sector, "floor", m.speed, m.low, -1);
        if (r === "pastdest") { m.status = "waiting"; m.wait = PLAT_WAIT; world.events.push("lift-stop"); }
        keep.push(m);
      }
    } else if (m.kind === "floor") {
      const r = movePlane(world, level, m.sector, "floor", m.speed, m.dest, m.dir);
      if (r !== "pastdest") keep.push(m);
    } else {
      throw new Error(`mover kind ${m.kind} is not implemented`);
    }
  }
  world.movers = keep;
  for (const k of Object.keys(world.switches)) {
    if (world.switches[k] > 0 && --world.switches[k] === 0) delete world.switches[k];
  }
}
