// Damage, death and splash, after the original engine's P_DamageMobj and
// P_RadiusAttack. random() returns an integer 0–255 like P_Random.

import { THING_TYPES } from "./catalog.js";
import { checkSight } from "./trace.js";
import { angleTo, cosOf, q, sinOf } from "./constants.js";
import { MONSTERS } from "./monsters_table.js";

const NAMES = { zombieman: "Zombieman", shotgunguy: "Shotgun Guy", imp: "Imp", demon: "Demon", spectre: "Spectre", lostsoul: "Lost Soul", baron: "Baron of Hell" };

export const monsterDef = (m) => MONSTERS[THING_TYPES[m.type].monster];

// Every thing a shot or blast can hurt.
export function shootables(world) {
  const out = [];
  if (world.player.health > 0) out.push(world.player);
  for (const m of world.monsters) if (m.health > 0) out.push(m);
  for (const b of world.barrels) if (b.health > 0) out.push(b);
  return out;
}

function sourceName(source) {
  if (!source) return "the world";
  if (source.kind === "player") return "Doomguy";
  if (source.kind === "barrel") return "a barrel";
  return NAMES[THING_TYPES[source.type].monster];
}

function kill(world, target, source, weapon) {
  if (target.kind === "player") {
    target.health = 0;
    target.status = "over";
    target.fragsThem += 1;
    world.events.push("player-dead");
    world.feed = [{ killer: sourceName(source), weapon, victim: "Doomguy" }, ...world.feed.slice(0, 4)];
    return;
  }
  if (target.kind === "barrel") {
    target.state = "exploding";
    target.tics = 5;
    target.byPlayer = source?.kind === "player";
    world.events.push("barrel-explode");
    return;
  }
  const def = monsterDef(target);
  target.state = "dead";
  target.tics = 0;
  target.frame = 0;
  target.momx = target.momy = 0;
  if (def.countsKill) world.stats.kills += 1;
  // The relational plane scores the living player's kills only: a rocket
  // landing after its shooter died earns nothing.
  if (source?.kind === "player" && world.player.health > 0) {
    world.player.fragsUs += 1;
    world.events.push("demon-dead");
  } else world.events.push("monster-dead");
  world.feed = [{ killer: sourceName(source), weapon, victim: NAMES[THING_TYPES[target.type].monster] }, ...world.feed.slice(0, 4)];
  if (def.drop) world.drops.push({ id: `drop_${world.tick}_${target.id}`, type: def.drop, x: target.x, y: target.y, dropped: true });
}

// Applies damage from inflictor (a projectile or blast point, for knockback)
// caused by source. Returns whether the target died.
export function damage(world, target, inflictor, source, amount, random, weapon = "") {
  if (target.health <= 0 || amount <= 0) return false;
  let dmg = amount;
  if (target.kind === "player") {
    if (world.skill === 0) dmg >>= 1;
    if (target.armorType) {
      let saved = target.armorType === 1 ? Math.floor(dmg / 3) : Math.floor(dmg / 2);
      if (target.armor <= saved) { saved = target.armor; target.armorType = 0; }
      target.armor -= saved;
      dmg -= saved;
    }
    target.damageFlash = Math.min(12, target.damageFlash + Math.max(3, dmg >> 2));
    world.events.push("player-hurt");
  }
  if (inflictor && target.kind !== "barrel") {
    const mass = target.kind === "player" ? 100 : monsterDef(target).mass;
    const ang = angleTo(inflictor.x, inflictor.y, target.x, target.y);
    const thrust = (amount * 12.5) / mass;
    target.momx = q(target.momx + cosOf(ang) * thrust);
    target.momy = q(target.momy + sinOf(ang) * thrust);
  }
  target.health -= dmg;
  if (target.health <= 0) {
    kill(world, target, source, weapon);
    return true;
  }
  if (target.kind === "monster") {
    const def = monsterDef(target);
    if (random() < def.painChance && target.state !== "skullfly") {
      target.state = "pain";
      target.tics = def.painTics;
      world.events.push("demon-hurt");
    }
    if (source?.kind === "player") {
      target.target = true;
      target.reaction = 0;
      if (target.state === "idle") target.state = "chase";
    }
  }
  return false;
}

// Splash damage around spot: full damage at the centre falling off by
// distance, only to things the blast can see.
export function radiusAttack(world, level, spot, source, amount, random) {
  for (const t of shootables(world)) {
    const dist = Math.max(0, Math.max(Math.abs(t.x - spot.x), Math.abs(t.y - spot.y)) - t.radius);
    if (dist >= amount) continue;
    if (!checkSight(world, level, spot.x, spot.y, spot.z, t.x, t.y, t.z, t.z + t.height)) continue;
    damage(world, t, spot, source, amount - dist, random, "explosion");
  }
}

// A shot barrel bursts a few tics later, hurting everything nearby (and
// possibly the next barrel).
export function barrelsThink(world, level, random) {
  for (const b of world.barrels) {
    if (b.state !== "exploding") continue;
    if (--b.tics > 0) continue;
    b.state = "dead";
    radiusAttack(world, level, { x: b.x, y: b.y, z: b.z + b.height / 2 }, b.byPlayer ? world.player : b, 128, random);
  }
}
