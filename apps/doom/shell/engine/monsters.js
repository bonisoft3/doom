// Monster thinking, after the original's A_Look, A_Chase, P_NewChaseDir,
// P_CheckMeleeRange, P_CheckMissileRange and the attack actions. Monsters
// only ever target the player.

import { THING_TYPES } from "./catalog.js";
import { sectorAt } from "./level.js";
import { checkPosition, tryMove, xyMovement, zMovement } from "./collide.js";
import { activateLine } from "./movers.js";
import { aim, checkSight, lineAttack } from "./trace.js";
import { damage, monsterDef, shootables } from "./combat.js";
import { spawnMissile } from "./projectiles.js";
import { ANG180, ANG90, MELEERANGE, MISSILERANGE, angleTo, cosOf, normAngle, q, sinOf } from "./constants.js";

const NODIR = -1;
const DIAG = Math.SQRT1_2;
const XSPEED = [1, DIAG, 0, -DIAG, -1, -DIAG, 0, DIAG];
const YSPEED = [0, DIAG, 1, DIAG, 0, -DIAG, -1, -DIAG];
const OPPOSITE = [4, 5, 6, 7, 0, 1, 2, 3];
// Indexed by (dy < 0) * 2 + (dx > 0): NW, NE, SW, SE.
const DIAGONALS = [3, 1, 5, 7];
const RESPAWN_TICS = 12 * 35;
const FLOATSPEED = 4;

const eyeZ = (m) => m.z + m.height - (m.height >> 2);

function canSee(world, level, m) {
  const p = world.player;
  return checkSight(world, level, m.x, m.y, eyeZ(m), p.x, p.y, p.z, p.z + p.height);
}

function meleeRange(world, level, m) {
  const p = world.player;
  return Math.hypot(p.x - m.x, p.y - m.y) < MELEERANGE - 20 + p.radius && canSee(world, level, m);
}

function missileRange(world, level, m, def, random) {
  if (!canSee(world, level, m)) return false;
  if (m.justHit) { m.justHit = false; return true; }
  if (m.reaction > 0) return false;
  let dist = Math.hypot(world.player.x - m.x, world.player.y - m.y) - 64;
  if (!def.melee) dist -= 128;
  if (THING_TYPES[m.type].monster === "lostsoul") dist /= 2;
  return random() >= Math.min(200, dist);
}

// P_Move: one step in moveDir. Bumping a usable line (a door) uses it.
function move(world, level, m, def, random) {
  if (m.moveDir === NODIR) return false;
  const tx = m.x + def.speed * XSPEED[m.moveDir], ty = m.y + def.speed * YSPEED[m.moveDir];
  const r = tryMove(world, level, m, tx, ty);
  if (!r.moved) {
    if (m.float && r.pos.ok) {
      m.z = q(m.z + (m.z < r.pos.floorz ? FLOATSPEED : -FLOATSPEED));
      return true;
    }
    let used = false;
    for (const i of r.pos.spechit) used = activateLine(world, level, i, m, "use", 0, random) || used;
    return used;
  }
  for (const c of r.crossed) activateLine(world, level, c.line, m, "cross", c.side, random);
  if (!m.float) m.z = m.floorz;
  return true;
}

function tryWalk(world, level, m, def, random) {
  if (!move(world, level, m, def, random)) return false;
  m.moveCount = random() & 15;
  return true;
}

function newChaseDir(world, level, m, def, random) {
  const dx = world.player.x - m.x, dy = world.player.y - m.y;
  const old = m.moveDir;
  const turnaround = old === NODIR ? NODIR : OPPOSITE[old];
  let d1 = dx > 10 ? 0 : dx < -10 ? 4 : NODIR;
  let d2 = dy < -10 ? 6 : dy > 10 ? 2 : NODIR;
  const attempt = (dir) => {
    m.moveDir = dir;
    return tryWalk(world, level, m, def, random);
  };
  if (d1 !== NODIR && d2 !== NODIR) {
    const dir = DIAGONALS[(dy < 0 ? 2 : 0) + (dx > 0 ? 1 : 0)];
    if (dir !== turnaround && attempt(dir)) return;
  }
  if (random() > 200 || Math.abs(dy) > Math.abs(dx)) [d1, d2] = [d2, d1];
  if (d1 === turnaround) d1 = NODIR;
  if (d2 === turnaround) d2 = NODIR;
  if (d1 !== NODIR && attempt(d1)) return;
  if (d2 !== NODIR && attempt(d2)) return;
  if (old !== NODIR && attempt(old)) return;
  const order = random() & 1 ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  for (const dir of order) if (dir !== turnaround && attempt(dir)) return;
  if (turnaround !== NODIR && attempt(turnaround)) return;
  m.moveDir = NODIR;
}

function wake(world, m, def) {
  m.target = true;
  m.state = "chase";
  m.tics = def.chaseTics;
  if (def.sight) world.events.push("demon-sight");
}

// A_Look: hearing the player in this sector, or seeing them in front (or
// close behind).
function look(world, level, m, def) {
  const p = world.player;
  if (p.health <= 0) return;
  const heard = world.heard.includes(sectorAt(level, m.x, m.y));
  if (heard && !m.ambush) return wake(world, m, def);
  if (!canSee(world, level, m)) return;
  const an = normAngle(angleTo(m.x, m.y, p.x, p.y) - m.angle);
  if (!heard && an > ANG90 && an < ANG90 * 3 && Math.hypot(p.x - m.x, p.y - m.y) > MELEERANGE) return;
  wake(world, m, def);
}

function faceTarget(world, m, random) {
  const p = world.player;
  m.angle = angleTo(m.x, m.y, p.x, p.y);
  if (p.powers.invisibility > 0) m.angle = normAngle(m.angle + ((random() - random()) << 5));
}

function startAttack(world, m, def, kind) {
  m.state = "attack";
  m.attack = kind;
  m.tics = def.attackTics;
  m.frame = 0;
}

function fire(world, level, m, def, random) {
  const p = world.player;
  faceTarget(world, m, random);
  const name = THING_TYPES[m.type].monster;
  if (def.melee && meleeRange(world, level, m)) {
    world.events.push(name === "demon" || name === "spectre" ? "bite" : "claw");
    damage(world, p, m, m, ((random() % def.melee.dice) + 1) * def.melee.mult, random, "claws");
    return;
  }
  if (!def.missile) return;
  const kind = def.missile.kind;
  if (kind === "bullets") {
    const hit = aim(world, level, m, m.angle, MISSILERANGE, shootables(world));
    const slope = hit ? hit.slope : 0;
    world.events.push(def.missile.pellets > 1 ? "shot" : "pistol");
    for (let i = 0; i < def.missile.pellets; i++) {
      const an = normAngle(m.angle + ((random() - random()) << 4));
      const res = lineAttack(world, level, m, an, MISSILERANGE, slope, shootables(world));
      if (res.target) damage(world, res.target, null, m, ((random() % 5) + 1) * 3, random, "gun");
      else world.puffs.push({ x: res.x, y: res.y, z: res.z, tics: 8 });
    }
  } else if (kind === "charge") {
    const dist = Math.max(1, Math.hypot(p.x - m.x, p.y - m.y) / def.missile.speed);
    m.state = "skullfly";
    m.momx = q(cosOf(m.angle) * def.missile.speed);
    m.momy = q(sinOf(m.angle) * def.missile.speed);
    m.momz = q((p.z + p.height / 2 - m.z) / dist);
    world.events.push("skull-attack");
  } else {
    spawnMissile(world, m, kind, m.angle, { target: p });
  }
}

// A lost soul in flight: moves until it hits something, biting what it hits.
function skullfly(world, level, m, def, random) {
  const r = tryMove(world, level, m, m.x + m.momx, m.y + m.momy);
  m.z = q(Math.max(m.floorz, Math.min(m.ceilingz - m.height, m.z + m.momz)));
  if (r.moved) return;
  if (r.pos.blocker === world.player) damage(world, world.player, m, m, ((random() % def.missile.dice) + 1) * def.missile.mult, random, "skull");
  m.momx = m.momy = m.momz = 0;
  m.state = "chase";
  m.tics = def.chaseTics;
}

function chase(world, level, m, def, random) {
  if (m.reaction > 0) m.reaction -= 1;
  if (world.player.health <= 0) {
    m.state = "idle";
    m.target = false;
    return;
  }
  if (m.moveDir !== NODIR) m.angle = m.moveDir * (ANG180 / 4);
  if (m.justAttacked) {
    m.justAttacked = false;
    newChaseDir(world, level, m, def, random);
    return;
  }
  if (def.melee && meleeRange(world, level, m)) return startAttack(world, m, def, "melee");
  if (def.missile && (world.skill === 4 || m.moveCount === 0) && missileRange(world, level, m, def, random)) {
    m.justAttacked = true;
    return startAttack(world, m, def, "missile");
  }
  if (--m.moveCount < 0 || !move(world, level, m, def, random)) newChaseDir(world, level, m, def, random);
  m.frame = (m.frame + 1) % 4;
}

function respawn(world, level, m, random) {
  if (world.skill !== 4) return;
  if (++m.respawn < RESPAWN_TICS || (world.tick & 31) !== 0 || random() > 4) return;
  const t = level.things[m.id];
  const def = THING_TYPES[m.type];
  if (!checkPosition(world, level, m, t.x, t.y).ok) return;
  Object.assign(m, { x: t.x, y: t.y, momx: 0, momy: 0, momz: 0, health: def.health, state: "idle", tics: 0, target: false, respawn: 0, frame: 0 });
  const pos = checkPosition(world, level, m, t.x, t.y, []);
  m.z = m.floorz = pos.floorz;
  m.ceilingz = pos.ceilingz;
  world.events.push("teleport");
}

export function monstersThink(world, level, random) {
  for (const m of world.monsters) {
    const def = monsterDef(m);
    if (m.momx || m.momy) xyMovement(world, level, m);
    if (m.state !== "skullfly") zMovement(m);
    if (m.health <= 0) {
      m.frame += 1;
      respawn(world, level, m, random);
      continue;
    }
    if (m.state === "skullfly") { skullfly(world, level, m, def, random); continue; }
    if (m.state === "pain") {
      if (--m.tics <= 0) { m.state = "chase"; m.tics = def.chaseTics; m.justHit = true; }
      continue;
    }
    if (m.state === "attack") {
      m.frame += 1;
      if (def.attackTics - m.tics === def.fireAt) fire(world, level, m, def, random);
      else if (m.tics === def.attackTics) faceTarget(world, m, random);
      if (--m.tics <= 0 && m.state === "attack") { m.state = "chase"; m.tics = def.chaseTics; }
      continue;
    }
    if (--m.tics > 0) continue;
    m.tics = def.chaseTics;
    if (m.state === "idle") look(world, level, m, def);
    else chase(world, level, m, def, random);
  }
}

