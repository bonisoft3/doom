// Monster behaviour, keyed by catalog.js's monster names. speed is map units
// per step and chaseTics the tics between steps, as in the original's state
// tables; attacks fire `fireAt` tics into an attack lasting `attackTics`.
// painChance is out of 256.

export const MONSTERS = Object.freeze({
  zombieman: {
    speed: 8, chaseTics: 4, painChance: 200, painTics: 6, mass: 100, countsKill: true, drop: 2007,
    missile: { kind: "bullets", pellets: 1 }, attackTics: 26, fireAt: 10, sight: "posit",
  },
  shotgunguy: {
    speed: 8, chaseTics: 3, painChance: 170, painTics: 6, mass: 100, countsKill: true, drop: 2001,
    missile: { kind: "bullets", pellets: 3 }, attackTics: 26, fireAt: 10, sight: "posit",
  },
  imp: {
    speed: 8, chaseTics: 3, painChance: 200, painTics: 4, mass: 100, countsKill: true,
    melee: { dice: 8, mult: 3 }, missile: { kind: "impball" }, attackTics: 22, fireAt: 16, sight: "bgsit",
  },
  demon: {
    speed: 10, chaseTics: 2, painChance: 180, painTics: 4, mass: 400, countsKill: true,
    melee: { dice: 10, mult: 4 }, attackTics: 24, fireAt: 16, sight: "sgtsit",
  },
  spectre: {
    speed: 10, chaseTics: 2, painChance: 180, painTics: 4, mass: 400, countsKill: true,
    melee: { dice: 10, mult: 4 }, attackTics: 24, fireAt: 16, sight: "sgtsit",
  },
  lostsoul: {
    speed: 8, chaseTics: 6, painChance: 256, painTics: 6, mass: 50, countsKill: false,
    missile: { kind: "charge", speed: 20, dice: 8, mult: 3 }, attackTics: 10, fireAt: 10, sight: null,
  },
  baron: {
    speed: 8, chaseTics: 3, painChance: 50, painTics: 4, mass: 1000, countsKill: true,
    melee: { dice: 8, mult: 10 }, missile: { kind: "baronball" }, attackTics: 24, fireAt: 16, sight: "brssit",
  },
});

// Projectiles: speed in units per tic, damage = (random % dice + 1) * mult,
// splash radius for rockets.
export const MISSILES = Object.freeze({
  impball: { speed: 10, radius: 6, height: 8, dice: 8, mult: 3 },
  baronball: { speed: 15, radius: 6, height: 16, dice: 8, mult: 8 },
  rocket: { speed: 20, radius: 11, height: 8, dice: 8, mult: 20, splash: 128 },
  plasma: { speed: 25, radius: 13, height: 8, dice: 8, mult: 5 },
  bfg: { speed: 25, radius: 13, height: 8, dice: 8, mult: 100, spray: true },
});
