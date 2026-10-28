// Movement against the level and other things, after the original engine's
// P_CheckPosition / P_TryMove: a move fits when no blocking line or solid
// thing overlaps the box, the step up is at most MAXSTEP, the gap is tall
// enough, and (for monsters) the drop is at most MAXSTEP.

import { LINE_FLAGS } from "./catalog.js";
import { boxOnLineSide, isTwoSided, levelIndex, linesInBox, pointOnLineSide, sectorAt } from "./level.js";
import { ceilOf, floorOf } from "./sectors.js";
import { FRICTION, GRAVITY, MAXMOVE, MAXSTEP, STOPSPEED, q } from "./constants.js";

// Everything solid a mover can bump into, except the mover itself.
export function solidsExcept(world, level, self) {
  const out = levelIndex(level).staticSolids.map((s) => ({ x: s.x, y: s.y, radius: s.radius, actor: null }));
  if (world.player !== self && world.player.health > 0) out.push({ x: world.player.x, y: world.player.y, radius: world.player.radius, actor: world.player });
  for (const m of world.monsters) if (m !== self && m.health > 0) out.push({ x: m.x, y: m.y, radius: m.radius, actor: m });
  for (const b of world.barrels) if (b !== self && b.health > 0) out.push({ x: b.x, y: b.y, radius: b.radius, actor: b });
  return out;
}

// The vertical gap a two-sided line leaves.
export function lineOpening(world, level, lineIndex) {
  const ix = levelIndex(level);
  const f = ix.lineFront[lineIndex], b = ix.lineBack[lineIndex];
  const ff = floorOf(world, level, f), fc = ceilOf(world, level, f);
  const bf = floorOf(world, level, b), bc = ceilOf(world, level, b);
  return { top: Math.min(fc, bc), bottom: Math.max(ff, bf), lowFloor: Math.min(ff, bf) };
}

// Where a thing of the given radius could stand at (x, y): the floor and
// ceiling it would get, the lowest floor under its box, and the special lines
// its box touches. ok is false when a wall or a solid thing is in the way.
export function checkPosition(world, level, actor, x, y, solids = solidsExcept(world, level, actor)) {
  const r = actor.radius;
  const x0 = x - r, y0 = y - r, x1 = x + r, y1 = y + r;
  const s = sectorAt(level, x, y);
  const res = { ok: true, floorz: floorOf(world, level, s), ceilingz: ceilOf(world, level, s), dropoffz: 0, spechit: [], blocker: null, line: -1 };
  res.dropoffz = res.floorz;

  for (const o of solids) {
    const reach = o.radius + r;
    if (Math.abs(o.x - x) < reach && Math.abs(o.y - y) < reach) {
      res.ok = false;
      res.blocker = o.actor;
      return res;
    }
  }

  const ix = levelIndex(level);
  const isMonster = actor.kind === "monster";
  for (const i of linesInBox(level, x0, y0, x1, y1)) {
    const b = ix.lineBox[i];
    if (x1 <= b[0] || x0 >= b[2] || y1 <= b[1] || y0 >= b[3]) continue;
    const line = level.lines[i];
    if (boxOnLineSide(level, line, x0, y0, x1, y1) !== -1) continue;
    if (!isTwoSided(line) || (line.flags & LINE_FLAGS.BLOCKING) || (isMonster && (line.flags & LINE_FLAGS.BLOCK_MONSTERS))) {
      res.ok = false;
      res.line = i;
      return res;
    }
    const o = lineOpening(world, level, i);
    if (o.top < res.ceilingz) res.ceilingz = o.top;
    if (o.bottom > res.floorz) res.floorz = o.bottom;
    if (o.lowFloor < res.dropoffz) res.dropoffz = o.lowFloor;
    if (line.special) res.spechit.push(i);
  }
  return res;
}

// Moves the actor to (x, y) when it fits. Returns the special lines whose side
// the actor's centre changed, so walk-over triggers can fire, or null.
export function tryMove(world, level, actor, x, y, opts = {}) {
  const pos = checkPosition(world, level, actor, x, y);
  if (!pos.ok) return { moved: false, pos };
  if (pos.ceilingz - pos.floorz < actor.height) return { moved: false, pos };
  if (pos.ceilingz - actor.z < actor.height) return { moved: false, pos };
  if (pos.floorz - actor.z > MAXSTEP) return { moved: false, pos };
  if (actor.kind === "monster" && !actor.float && !opts.dropoff && pos.floorz - pos.dropoffz > MAXSTEP) return { moved: false, pos };
  const crossed = [];
  for (const i of pos.spechit) {
    const line = level.lines[i];
    if (pointOnLineSide(level, line, actor.x, actor.y) !== pointOnLineSide(level, line, x, y)) {
      crossed.push({ line: i, side: pointOnLineSide(level, line, actor.x, actor.y) });
    }
  }
  actor.x = q(x);
  actor.y = q(y);
  actor.floorz = pos.floorz;
  actor.ceilingz = pos.ceilingz;
  return { moved: true, pos, crossed };
}

// Applies momentum in steps no longer than half the move limit, sliding along
// whatever blocks a step. Returns every special line crossed on the way.
export function xyMovement(world, level, actor) {
  const crossed = [];
  if (actor.momx === 0 && actor.momy === 0) return crossed;
  let mx = Math.max(-MAXMOVE, Math.min(MAXMOVE, actor.momx));
  let my = Math.max(-MAXMOVE, Math.min(MAXMOVE, actor.momy));
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(my)) / (MAXMOVE / 2)));
  const sx = mx / steps, sy = my / steps;
  let blockedX = false, blockedY = false;
  for (let i = 0; i < steps; i++) {
    const tx = blockedX ? 0 : sx, ty = blockedY ? 0 : sy;
    if (tx === 0 && ty === 0) break;
    let r = tryMove(world, level, actor, actor.x + tx, actor.y + ty);
    if (!r.moved && tx !== 0 && ty !== 0) {
      r = tryMove(world, level, actor, actor.x + tx, actor.y);
      if (r.moved) blockedY = true;
      else {
        r = tryMove(world, level, actor, actor.x, actor.y + ty);
        if (r.moved) blockedX = true;
      }
    }
    if (!r.moved) {
      blockedX = blockedY = true;
      break;
    }
    crossed.push(...r.crossed);
  }
  if (blockedX) mx = 0;
  if (blockedY) my = 0;
  const onGround = actor.z <= actor.floorz;
  if (onGround) {
    mx *= FRICTION;
    my *= FRICTION;
  }
  actor.momx = Math.abs(mx) < STOPSPEED && Math.abs(my) < STOPSPEED && onGround ? 0 : q(mx);
  actor.momy = Math.abs(mx) < STOPSPEED && Math.abs(my) < STOPSPEED && onGround ? 0 : q(my);
  return crossed;
}

// Gravity and the floor and ceiling clamps (P_ZMovement).
export function zMovement(actor) {
  actor.z += actor.momz;
  if (actor.z <= actor.floorz) {
    actor.z = actor.floorz;
    if (actor.momz < 0) actor.momz = 0;
  } else if (!actor.float) {
    actor.momz = actor.momz === 0 ? -GRAVITY * 2 : actor.momz - GRAVITY;
  }
  if (actor.z + actor.height > actor.ceilingz) {
    if (actor.momz > 0) actor.momz = 0;
    actor.z = Math.max(actor.floorz, actor.ceilingz - actor.height);
  }
  actor.z = q(actor.z);
  actor.momz = q(actor.momz);
}

// Re-reads the floor and ceiling under an actor after sectors moved; one that
// stood on the floor rides it. Returns false when the actor no longer fits.
export function heightClip(world, level, actor) {
  const onFloor = actor.z === actor.floorz;
  const pos = checkPosition(world, level, actor, actor.x, actor.y, []);
  actor.floorz = pos.floorz;
  actor.ceilingz = pos.ceilingz;
  if (onFloor || actor.z < actor.floorz) actor.z = actor.floorz;
  else if (actor.z + actor.height > actor.ceilingz) actor.z = Math.max(actor.floorz, actor.ceilingz - actor.height);
  return actor.ceilingz - actor.floorz >= actor.height;
}
