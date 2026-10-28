// The player's tic: turning, thrust, walk-over and use triggers, weapons,
// pickups, and the floor under them (P_PlayerThink, P_MovePlayer, P_UseLines,
// P_TouchSpecialThing, P_PlayerInSpecialSector).

import { THING_TYPES, SECTOR_SPECIALS } from "./catalog.js";
import { isTwoSided, pointOnLineSide, sectorAt } from "./level.js";
import { lineOpening, xyMovement, zMovement } from "./collide.js";
import { activateLine } from "./movers.js";
import { intercepts } from "./trace.js";
import { damage } from "./combat.js";
import { WEAPONS, bestWeapon, fireWeapon, hasAmmoFor, selectWeapon } from "./weapons.js";
import { floorOf, sectorProp, setSector } from "./sectors.js";
import { ANG90, ANG_FULL, PLAYER, TICRATE, USERANGE, cosOf, normAngle, q, sinOf } from "./constants.js";

export const MAX_AMMO = { bullets: 200, shells: 50, rockets: 50, cells: 300 };
// Ammo a weapon pickup carries.
const WEAPON_AMMO = { chainsaw: null, shotgun: ["shells", 8], chaingun: ["bullets", 20], rocketlauncher: ["rockets", 2], plasmarifle: ["cells", 40], bfg: ["cells", 40] };
const SMALL_AMMO = { bullets: 10, shells: 4, rockets: 1, cells: 20 };

const MESSAGES = {
  2007: "Picked up a clip.", 2048: "Picked up a box of bullets.", 2008: "Picked up 4 shotgun shells.", 2049: "Picked up a box of shotgun shells.",
  2010: "Picked up a rocket.", 2046: "Picked up a box of rockets.", 2047: "Picked up an energy cell.", 17: "Picked up an energy cell pack.",
  8: "Picked up a backpack full of ammo!", 2011: "Picked up a stimpack.", 2012: "Picked up a medikit.", 2014: "Picked up a health bonus.", 2015: "Picked up an armor bonus.",
  2018: "Picked up the armor.", 2019: "Picked up the MegaArmor!", 2013: "Supercharge!", 2023: "Berserk!", 2024: "Partial Invisibility",
  2025: "Radiation Shielding Suit", 2026: "Computer Area Map", 5: "Picked up a blue keycard.", 6: "Picked up a yellow keycard.",
  13: "Picked up a red keycard.", 2005: "A chainsaw!  Find some meat!", 2001: "You got the shotgun!", 2002: "You got the chaingun!",
  2003: "You got the rocket launcher!", 2004: "You got the plasma gun!", 2006: "You got the BFG9000!  Oh, yes.",
};

const maxAmmo = (p, type) => MAX_AMMO[type] * (p.backpack ? 2 : 1);

function giveAmmo(world, p, type, amount) {
  if (p[type] >= maxAmmo(p, type)) return false;
  const n = world.skill === 0 || world.skill === 4 ? amount * 2 : amount;
  p[type] = Math.min(maxAmmo(p, type), p[type] + n);
  return true;
}

function giveWeapon(world, p, weapon, dropped) {
  const ammo = WEAPON_AMMO[weapon];
  const gotAmmo = ammo ? giveAmmo(world, p, ammo[0], dropped ? ammo[1] / 2 : ammo[1]) : false;
  if (p.weapons.includes(weapon)) return gotAmmo;
  p.weapons.push(weapon);
  p.weapon = weapon;
  return true;
}

// Applies a pickup; returns whether the player took it.
function touch(world, p, type, dropped) {
  const def = THING_TYPES[type];
  let message = MESSAGES[type];
  switch (def.kind) {
    case "weapon":
      if (!giveWeapon(world, p, def.weapon, dropped)) return false;
      world.events.push("pickup-weapon");
      break;
    case "ammo":
      if (!giveAmmo(world, p, def.ammo, dropped ? def.amount / 2 : def.amount)) return false;
      world.events.push("pickup-ammo");
      break;
    case "key":
      p.keys[def.key] = true;
      world.events.push("pickup-item");
      break;
    case "item":
      switch (def.item) {
        case "stimpack":
        case "medikit":
          if (p.health >= 100) return false;
          if (def.item === "medikit" && p.health < 25) message = "Picked up a medikit that you REALLY need!";
          p.health = Math.min(100, p.health + (def.item === "stimpack" ? 10 : 25));
          break;
        case "health-bonus": p.health = Math.min(200, p.health + 1); break;
        case "soulsphere": p.health = Math.min(200, p.health + 100); break;
        case "armor-bonus":
          p.armor = Math.min(200, p.armor + 1);
          if (!p.armorType) p.armorType = 1;
          break;
        case "green-armor":
          if (p.armor >= 100) return false;
          p.armor = 100; p.armorType = 1;
          break;
        case "blue-armor":
          if (p.armor >= 200) return false;
          p.armor = 200; p.armorType = 2;
          break;
        case "berserk":
          p.health = Math.max(p.health, 100);
          p.powers.strength = true;
          p.weapon = "fist";
          break;
        case "invisibility": p.powers.invisibility = 60 * TICRATE; break;
        case "radiation-suit": p.powers.ironfeet = 60 * TICRATE; break;
        case "computer-map": p.powers.allmap = true; break;
        case "backpack":
          if (!p.backpack) p.backpack = true;
          for (const [t, n] of Object.entries(SMALL_AMMO)) giveAmmo(world, p, t, n);
          break;
        default:
          throw new Error(`item ${def.item} is not implemented`);
      }
      world.events.push(def.item.endsWith("armor") || def.item === "armor-bonus" ? "pickup-armor" : "pickup-health");
      break;
    default:
      throw new Error(`thing type ${type} is not a pickup`);
  }
  if (def.countsAsItem && !dropped) world.stats.items += 1;
  world.events.push(`msg:${message}`);
  p.bonusFlash = 6;
  return true;
}

function touchPickups(world, level, p) {
  const reachable = (x, y) => {
    if (Math.abs(x - p.x) >= 20 + p.radius || Math.abs(y - p.y) >= 20 + p.radius) return false;
    const dz = floorOf(world, level, sectorAt(level, x, y)) - p.z;
    return dz <= p.height && dz >= -8;
  };
  for (const i of world.pickups) {
    if (world.collected.includes(i)) continue;
    const t = level.things[i];
    if (reachable(t.x, t.y) && touch(world, p, t.type, false)) world.collected.push(i);
  }
  world.drops = world.drops.filter((d) => !(reachable(d.x, d.y) && touch(world, p, d.type, true)));
}

// P_UseLines: the first line within reach in front of the player; a two-sided
// line without a special and with a gap lets the search continue past it.
function useLines(world, level, p, random) {
  const x2 = p.x + cosOf(p.angle) * USERANGE, y2 = p.y + sinOf(p.angle) * USERANGE;
  for (const it of intercepts(level, p.x, p.y, x2, y2)) {
    const line = level.lines[it.line];
    if (line.special) {
      activateLine(world, level, it.line, p, "use", pointOnLineSide(level, line, p.x, p.y), random);
      return;
    }
    if (!isTwoSided(line)) break;
    const o = lineOpening(world, level, it.line);
    if (o.top - o.bottom <= 0) break;
  }
  world.events.push("noway");
}

function underfoot(world, level, p, random) {
  if (p.z !== p.floorz) return;
  const s = sectorAt(level, p.x, p.y);
  const special = sectorProp(world, level, s, "special");
  const def = SECTOR_SPECIALS[special];
  if (!def) return;
  if (def.secret) {
    world.stats.secrets += 1;
    setSector(world, s, { special: 0 });
    world.events.push("secret", "msg:A secret is revealed!");
  }
  if (def.damage && (world.tick & 31) === 0 && (!p.powers.ironfeet || (def.damage === 20 && random() < 5))) {
    damage(world, p, null, null, def.damage, random, "slime");
  }
}

export function playerThink(world, level, cmd, last, random) {
  const p = world.player;
  if (p.health <= 0) {
    p.momx = p.momy = 0;
    zMovement(p);
    return;
  }
  const frozen = p.reaction > 0;
  if (frozen) p.reaction -= 1;

  if (!frozen) {
    const turn = cmd.run ? PLAYER.runTurn : PLAYER.turn;
    let da = 0;
    if (cmd.turnLeft) da += turn;
    if (cmd.turnRight) da -= turn;
    if (cmd.rotDelta) da -= Math.round((cmd.rotDelta * ANG_FULL) / (2 * Math.PI));
    p.angle = normAngle(p.angle + da);
    p.faceLook = da > 0 ? -1 : da < 0 ? 1 : 0;

    if (p.z <= p.floorz) {
      const thrust = cmd.run ? PLAYER.runThrust : PLAYER.walkThrust;
      const fwd = (cmd.forward ? 1 : 0) - (cmd.backward ? 1 : 0);
      const side = (cmd.strafeRight ? 1 : 0) - (cmd.strafeLeft ? 1 : 0);
      if (fwd) {
        p.momx += cosOf(p.angle) * thrust * fwd;
        p.momy += sinOf(p.angle) * thrust * fwd;
      }
      if (side) {
        p.momx += cosOf(p.angle - ANG90) * thrust * side;
        p.momy += sinOf(p.angle - ANG90) * thrust * side;
      }
    }
  }

  for (const c of xyMovement(world, level, p)) activateLine(world, level, c.line, p, "cross", c.side, random);
  zMovement(p);

  if (!frozen && cmd.use && !last.use) useLines(world, level, p, random);

  if (cmd.switchWeapon && selectWeapon(p, cmd.switchWeapon)) world.events.push("switch");
  if (p.shootTimer > 0) p.shootTimer -= 1;
  if (cmd.fire && p.shootTimer === 0 && !frozen) {
    if (!hasAmmoFor(p, p.weapon)) {
      p.weapon = bestWeapon(p);
      world.events.push("switch");
    } else {
      fireWeapon(world, level, p, random);
      p.refire += 1;
    }
  }
  if (!cmd.fire) p.refire = 0;

  touchPickups(world, level, p);
  underfoot(world, level, p, random);

  for (const k of ["invisibility", "ironfeet"]) if (p.powers[k] > 0) p.powers[k] -= 1;
  if (p.damageFlash > 0) p.damageFlash -= 1;
  if (p.bonusFlash > 0) p.bonusFlash -= 1;
  if (p.recoil > 0) p.recoil = Math.max(0, p.recoil - 3);
  const ammoType = WEAPONS[p.weapon].ammo;
  p.ammo = ammoType ? p[ammoType] : 0;
  p.momx = q(p.momx);
  p.momy = q(p.momy);
}
