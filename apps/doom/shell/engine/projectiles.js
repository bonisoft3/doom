// Missiles (P_SpawnMissile / P_XYMovement for MF_MISSILE / P_ExplodeMissile).

import { checkPosition } from "./collide.js";
import { damage, radiusAttack, shootables } from "./combat.js";
import { aim } from "./trace.js";
import { sectorAt } from "./level.js";
import { ANG90, MAXMOVE, MAXSTEP, cosOf, q, sinOf } from "./constants.js";
import { MISSILES } from "./monsters_table.js";
import { sectorProp } from "./sectors.js";

const SKY = "F_SKY1";

export function ownerOf(world, owner) {
  return owner === "player" ? world.player : world.monsters.find((m) => m.id === owner) ?? null;
}

// Launches a missile from source along angle; momz comes from slope (player
// autoaim) or from aiming at target's feet (monsters).
export function spawnMissile(world, source, kind, angle, { slope = 0, target = null } = {}) {
  const def = MISSILES[kind];
  const z = source.z + 32;
  let momz = slope * def.speed;
  if (target) {
    const dist = Math.max(1, Math.hypot(target.x - source.x, target.y - source.y) / def.speed);
    momz = (target.z - source.z) / dist;
  }
  const momx = cosOf(angle) * def.speed, momy = sinOf(angle) * def.speed;
  world.projectiles.push({
    kind: "missile", missile: kind, id: `${kind}_${world.tick}_${world.projectiles.length}`,
    owner: source.kind === "player" ? "player" : source.id, angle,
    x: q(source.x + momx / 2), y: q(source.y + momy / 2), z: q(z),
    momx: q(momx), momy: q(momy), momz: q(momz),
    radius: def.radius, height: def.height, state: "fly", tics: 0,
  });
  world.events.push(kind === "impball" || kind === "baronball" ? "fireball" : kind);
}

function explode(world, level, p, target, random) {
  const def = MISSILES[p.missile];
  const owner = ownerOf(world, p.owner);
  if (target) damage(world, target, p, owner, ((random() % def.dice) + 1) * def.mult, random, p.missile);
  if (def.splash) radiusAttack(world, level, p, owner, def.splash, random);
  if (def.spray && owner) {
    for (let i = 0; i < 40; i++) {
      const an = p.angle - ANG90 / 2 + (ANG90 / 40) * i;
      const hit = aim(world, level, owner, an, 1024, shootables(world));
      if (!hit) continue;
      let dmg = 0;
      for (let k = 0; k < 15; k++) dmg += (random() & 7) + 1;
      damage(world, hit.target, null, owner, dmg, random, "bfg");
    }
  }
  p.state = "explode";
  p.tics = 8;
  p.momx = p.momy = p.momz = 0;
  world.events.push("explode");
}

const skyAt = (world, level, x, y) => sectorProp(world, level, sectorAt(level, x, y), "ceilFlat") === SKY;

function step(world, level, p, nx, ny, random) {
  const owner = ownerOf(world, p.owner);
  for (const t of shootables(world)) {
    if (t === owner) continue;
    const reach = t.radius + p.radius;
    if (Math.abs(t.x - nx) >= reach || Math.abs(t.y - ny) >= reach) continue;
    if (p.z > t.z + t.height || p.z + p.height < t.z) continue;
    explode(world, level, p, t, random);
    return false;
  }
  const pos = checkPosition(world, level, p, nx, ny, []);
  const fits = pos.ok && pos.ceilingz - pos.floorz >= p.height && pos.ceilingz - p.z >= p.height && pos.floorz - p.z <= MAXSTEP;
  if (!fits) {
    // A missile flying into the sky vanishes instead of exploding.
    if (pos.ok && p.z + p.height > pos.ceilingz && skyAt(world, level, nx, ny)) p.state = "gone";
    else explode(world, level, p, null, random);
    return false;
  }
  p.x = q(nx);
  p.y = q(ny);
  p.floorz = pos.floorz;
  p.ceilingz = pos.ceilingz;
  return true;
}

export function tickProjectiles(world, level, random) {
  for (const p of world.projectiles) {
    if (p.state === "explode") {
      if (--p.tics <= 0) p.state = "gone";
      continue;
    }
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.momx), Math.abs(p.momy)) / (MAXMOVE / 2)));
    let alive = true;
    for (let i = 0; i < steps && alive; i++) alive = step(world, level, p, p.x + p.momx / steps, p.y + p.momy / steps, random);
    if (!alive) continue;
    p.z = q(p.z + p.momz);
    if (p.z + p.height >= p.ceilingz && skyAt(world, level, p.x, p.y)) p.state = "gone";
    else if (p.z <= p.floorz || p.z + p.height >= p.ceilingz) explode(world, level, p, null, random);
  }
  world.projectiles = world.projectiles.filter((p) => p.state !== "gone");
}

