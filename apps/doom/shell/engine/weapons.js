// The player's arsenal, after the original's A_Punch / A_Saw / A_FirePistol /
// A_FireShotgun / A_FireCGun / A_FireMissile / A_FirePlasma / A_FireBFG.
// cooldown is the tics until the weapon can fire again.

import { aim, lineAttack } from "./trace.js";
import { damage, shootables } from "./combat.js";
import { spawnMissile } from "./projectiles.js";
import { activateLine } from "./movers.js";
import { pointOnLineSide } from "./level.js";
import { noiseAlert } from "./noise.js";
import { MELEERANGE, MISSILERANGE, angleTo } from "./constants.js";

export const WEAPONS = Object.freeze({
  fist: { slot: 1, ammo: null, use: 0, cooldown: 22, event: "punch" },
  chainsaw: { slot: 1, ammo: null, use: 0, cooldown: 4, event: "saw" },
  pistol: { slot: 2, ammo: "bullets", use: 1, cooldown: 14, event: "pistol" },
  shotgun: { slot: 3, ammo: "shells", use: 1, cooldown: 37, event: "shot" },
  chaingun: { slot: 4, ammo: "bullets", use: 1, cooldown: 4, event: "pistol" },
  rocketlauncher: { slot: 5, ammo: "rockets", use: 1, cooldown: 20, event: "rocket" },
  plasmarifle: { slot: 6, ammo: "cells", use: 1, cooldown: 3, event: "plasma" },
  bfg: { slot: 7, ammo: "cells", use: 40, cooldown: 60, event: "bfg" },
});

// P_CheckAmmo's preference when the current weapon runs dry.
const FALLBACK = ["plasmarifle", "chaingun", "shotgun", "pistol", "chainsaw", "rocketlauncher", "bfg", "fist"];

export function hasAmmoFor(p, w) {
  const def = WEAPONS[w];
  return !def.ammo || p[def.ammo] >= def.use;
}

export function bestWeapon(p) {
  return FALLBACK.find((w) => p.weapons.includes(w) && hasAmmoFor(p, w));
}

// Selects a weapon by name or slot number; slot 1 toggles fist and chainsaw.
export function selectWeapon(p, choice) {
  let w = String(choice).toLowerCase();
  if (/^[1-7]$/.test(w)) {
    const slot = Number(w);
    const inSlot = Object.keys(WEAPONS).filter((n) => WEAPONS[n].slot === slot && p.weapons.includes(n));
    if (!inSlot.length) return false;
    w = inSlot.length > 1 && inSlot[0] === p.weapon ? inSlot[1] : inSlot.includes("chainsaw") && p.weapon !== "chainsaw" && !p.powers.strength ? "chainsaw" : inSlot[0];
  }
  if (!(w in WEAPONS) || !p.weapons.includes(w) || p.weapon === w) return false;
  p.weapon = w;
  return true;
}

function spread(random) {
  return (random() - random()) << 2;
}

// P_BulletSlope: aim straight, then a little to either side.
function autoaim(world, level, p, angle, range) {
  const targets = shootables(world);
  for (const an of [angle, angle + 1024, angle - 1024]) {
    const hit = aim(world, level, p, an, range, targets);
    if (hit) return hit.slope;
  }
  return 0;
}

function bullet(world, level, p, angle, slope, dmg, random, weapon) {
  const res = lineAttack(world, level, p, angle, MISSILERANGE, slope, shootables(world));
  shootLines(world, level, p, res.shotLines, random);
  if (res.target) damage(world, res.target, null, p, dmg, random, weapon);
  else world.puffs.push({ x: res.x, y: res.y, z: res.z, tics: 8 });
}

function shootLines(world, level, p, lines, random) {
  for (const i of lines) activateLine(world, level, i, p, "shoot", pointOnLineSide(level, level.lines[i], p.x, p.y), random);
}

function melee(world, level, p, dmg, range, random, weapon) {
  const angle = p.angle + spread(random);
  const hit = aim(world, level, p, angle, range, shootables(world));
  const res = lineAttack(world, level, p, angle, range, hit ? hit.slope : 0, shootables(world));
  if (!res.target) return false;
  damage(world, res.target, null, p, dmg, random, weapon);
  p.angle = angleTo(p.x, p.y, res.target.x, res.target.y);
  return true;
}

export function fireWeapon(world, level, p, random) {
  const w = p.weapon;
  const def = WEAPONS[w];
  if (def.ammo) p[def.ammo] -= def.use;
  p.shootTimer = def.cooldown;
  world.events.push(def.event);
  switch (w) {
    case "fist": {
      const dmg = ((random() % 10) + 1) * 2 * (p.powers.strength ? 10 : 1);
      melee(world, level, p, dmg, MELEERANGE, random, w);
      break;
    }
    case "chainsaw":
      if (melee(world, level, p, ((random() % 10) + 1) * 2, MELEERANGE + 1, random, w)) world.events.push("saw-hit");
      break;
    case "pistol":
    case "chaingun": {
      const slope = autoaim(world, level, p, p.angle, 1024);
      bullet(world, level, p, p.refire ? p.angle + spread(random) : p.angle, slope, 5 * ((random() % 3) + 1), random, w);
      noiseAlert(world, level, p);
      break;
    }
    case "shotgun": {
      const slope = autoaim(world, level, p, p.angle, 1024);
      for (let i = 0; i < 7; i++) bullet(world, level, p, p.angle + spread(random), slope, 5 * ((random() % 3) + 1), random, w);
      noiseAlert(world, level, p);
      break;
    }
    case "rocketlauncher":
    case "plasmarifle":
    case "bfg": {
      const slope = autoaim(world, level, p, p.angle, 1024);
      spawnMissile(world, p, w === "rocketlauncher" ? "rocket" : w === "plasmarifle" ? "plasma" : "bfg", p.angle, { slope });
      noiseAlert(world, level, p);
      break;
    }
    default:
      throw new Error(`weapon ${w} is not implemented`);
  }
  p.recoil = Math.min(24, def.cooldown);
}
