// What the engine implements, keyed by the WAD's own numbers. The compiler
// refuses a map that uses anything missing here, so a map cannot silently
// lose a mechanic.

// trigger: how a line fires — W walk over, S switch (use), D door (use, back
// side only matters for doors), G gunfire; 1 once, R repeatable. "none" lines
// act every tick (scrollers).
// speed: "slow" | "normal" | "fast" (blazing doors, turbo floors, fast lifts).
/** @type {Readonly<Record<number, { trigger: string, action: string, [k: string]: any }>>} */
export const LINE_SPECIALS = Object.freeze({
  1: { trigger: "DR", action: "door", door: "open-wait-close", speed: "normal", monsters: true },
  2: { trigger: "W1", action: "door", door: "open", speed: "normal" },
  7: { trigger: "S1", action: "stairs", step: 8, speed: "slow" },
  11: { trigger: "S1", action: "exit", exit: "normal" },
  19: { trigger: "W1", action: "floor", floor: "highest-neighbor", speed: "slow" },
  20: { trigger: "S1", action: "plat", plat: "next-higher-change-texture", speed: "slow" },
  22: { trigger: "W1", action: "plat", plat: "next-higher-change-texture", speed: "slow" },
  23: { trigger: "S1", action: "floor", floor: "lowest-neighbor", speed: "slow" },
  26: { trigger: "DR", action: "door", door: "open-wait-close", speed: "normal", key: "blue" },
  27: { trigger: "DR", action: "door", door: "open-wait-close", speed: "normal", key: "yellow" },
  28: { trigger: "DR", action: "door", door: "open-wait-close", speed: "normal", key: "red" },
  31: { trigger: "D1", action: "door", door: "open", speed: "normal" },
  32: { trigger: "D1", action: "door", door: "open", speed: "normal", key: "blue" },
  33: { trigger: "D1", action: "door", door: "open", speed: "normal", key: "red" },
  34: { trigger: "D1", action: "door", door: "open", speed: "normal", key: "yellow" },
  36: { trigger: "W1", action: "floor", floor: "highest-neighbor-plus-8", speed: "fast" },
  38: { trigger: "W1", action: "floor", floor: "lowest-neighbor", speed: "slow" },
  46: { trigger: "GR", action: "door", door: "open", speed: "normal" },
  48: { trigger: "none", action: "scroll", scroll: "left" },
  51: { trigger: "S1", action: "exit", exit: "secret" },
  52: { trigger: "W1", action: "exit", exit: "normal" },
  53: { trigger: "W1", action: "plat", plat: "perpetual", speed: "slow" },
  58: { trigger: "W1", action: "floor", floor: "raise-24", speed: "slow" },
  61: { trigger: "SR", action: "door", door: "open", speed: "normal" },
  62: { trigger: "SR", action: "lift", speed: "normal" },
  63: { trigger: "SR", action: "door", door: "open-wait-close", speed: "normal" },
  71: { trigger: "S1", action: "floor", floor: "highest-neighbor-plus-8", speed: "fast" },
  75: { trigger: "WR", action: "door", door: "close", speed: "normal" },
  88: { trigger: "WR", action: "lift", speed: "normal", monsters: true },
  97: { trigger: "WR", action: "teleport", monsters: true },
  102: { trigger: "S1", action: "floor", floor: "highest-neighbor", speed: "slow" },
  103: { trigger: "S1", action: "door", door: "open", speed: "normal" },
  105: { trigger: "WR", action: "door", door: "open-wait-close", speed: "fast" },
  107: { trigger: "WR", action: "door", door: "close", speed: "fast" },
  109: { trigger: "W1", action: "door", door: "open", speed: "fast" },
  112: { trigger: "S1", action: "door", door: "open", speed: "fast" },
  114: { trigger: "SR", action: "door", door: "open-wait-close", speed: "fast" },
  117: { trigger: "DR", action: "door", door: "open-wait-close", speed: "fast" },
  120: { trigger: "WR", action: "lift", speed: "fast" },
  123: { trigger: "SR", action: "lift", speed: "fast" },
  125: { trigger: "W1", action: "teleport", monstersOnly: true },
  126: { trigger: "WR", action: "teleport", monstersOnly: true },
  133: { trigger: "S1", action: "door", door: "open", speed: "fast", key: "blue" },
  138: { trigger: "SR", action: "light", light: 255 },
});

// damage is health lost every 32 tics while standing on the floor.
/** @type {Readonly<Record<number, { light?: string, damage?: number, secret?: boolean }>>} */
export const SECTOR_SPECIALS = Object.freeze({
  1: { light: "blink-random" },
  2: { light: "strobe-fast" },
  3: { light: "strobe-slow" },
  5: { damage: 10 },
  7: { damage: 5 },
  8: { light: "glow" },
  9: { secret: true },
  12: { light: "strobe-fast-sync" },
  16: { damage: 20 },
  17: { light: "flicker" },
});

// radius and height in map units; sprite is the WAD's four-letter prefix,
// frame the letter a static thing shows.
const decor = (sprite, solid, extra = {}) => ({ kind: "decor", sprite, frame: "A", solid, radius: 16, height: 16, ...extra });

/** @type {Readonly<Record<number, { kind: string, [k: string]: any }>>} */
export const THING_TYPES = Object.freeze({
  1: { kind: "player-start", player: 1 },
  2: { kind: "player-start", player: 2 },
  3: { kind: "player-start", player: 3 },
  4: { kind: "player-start", player: 4 },
  11: { kind: "deathmatch-start" },
  14: { kind: "teleport-destination" },

  3004: { kind: "monster", monster: "zombieman", sprite: "POSS", radius: 20, height: 56, health: 20 },
  9: { kind: "monster", monster: "shotgunguy", sprite: "SPOS", radius: 20, height: 56, health: 30 },
  3001: { kind: "monster", monster: "imp", sprite: "TROO", radius: 20, height: 56, health: 60 },
  3002: { kind: "monster", monster: "demon", sprite: "SARG", radius: 30, height: 56, health: 150 },
  58: { kind: "monster", monster: "spectre", sprite: "SARG", radius: 30, height: 56, health: 150 },
  3006: { kind: "monster", monster: "lostsoul", sprite: "SKUL", radius: 16, height: 56, health: 100 },
  3003: { kind: "monster", monster: "baron", sprite: "BOSS", radius: 24, height: 64, health: 1000 },

  2005: { kind: "weapon", weapon: "chainsaw", sprite: "CSAW", radius: 20 },
  2001: { kind: "weapon", weapon: "shotgun", sprite: "SHOT", radius: 20 },
  2002: { kind: "weapon", weapon: "chaingun", sprite: "MGUN", radius: 20 },
  2003: { kind: "weapon", weapon: "rocketlauncher", sprite: "LAUN", radius: 20 },
  2004: { kind: "weapon", weapon: "plasmarifle", sprite: "PLAS", radius: 20 },
  2006: { kind: "weapon", weapon: "bfg", sprite: "BFUG", radius: 20 },

  2007: { kind: "ammo", ammo: "bullets", amount: 10, sprite: "CLIP", radius: 20 },
  2048: { kind: "ammo", ammo: "bullets", amount: 50, sprite: "AMMO", radius: 20 },
  2008: { kind: "ammo", ammo: "shells", amount: 4, sprite: "SHEL", radius: 20 },
  2049: { kind: "ammo", ammo: "shells", amount: 20, sprite: "SBOX", radius: 20 },
  2010: { kind: "ammo", ammo: "rockets", amount: 1, sprite: "ROCK", radius: 20 },
  2046: { kind: "ammo", ammo: "rockets", amount: 5, sprite: "BROK", radius: 20 },
  2047: { kind: "ammo", ammo: "cells", amount: 20, sprite: "CELL", radius: 20 },
  17: { kind: "ammo", ammo: "cells", amount: 100, sprite: "CELP", radius: 20 },
  8: { kind: "item", item: "backpack", sprite: "BPAK", radius: 20 },

  2011: { kind: "item", item: "stimpack", sprite: "STIM", radius: 20 },
  2012: { kind: "item", item: "medikit", sprite: "MEDI", radius: 20 },
  2014: { kind: "item", item: "health-bonus", sprite: "BON1", radius: 20, countsAsItem: true },
  2015: { kind: "item", item: "armor-bonus", sprite: "BON2", radius: 20, countsAsItem: true },
  2018: { kind: "item", item: "green-armor", sprite: "ARM1", radius: 20 },
  2019: { kind: "item", item: "blue-armor", sprite: "ARM2", radius: 20 },
  2013: { kind: "item", item: "soulsphere", sprite: "SOUL", radius: 20, countsAsItem: true },
  2023: { kind: "item", item: "berserk", sprite: "PSTR", radius: 20, countsAsItem: true },
  2024: { kind: "item", item: "invisibility", sprite: "PINS", radius: 20, countsAsItem: true },
  2025: { kind: "item", item: "radiation-suit", sprite: "SUIT", radius: 20 },
  2026: { kind: "item", item: "computer-map", sprite: "PMAP", radius: 20, countsAsItem: true },

  5: { kind: "key", key: "blue", sprite: "BKEY", radius: 20 },
  6: { kind: "key", key: "yellow", sprite: "YKEY", radius: 20 },
  13: { kind: "key", key: "red", sprite: "RKEY", radius: 20 },

  2035: { kind: "barrel", sprite: "BAR1", frame: "A", solid: true, radius: 10, height: 42, health: 20 },
  2028: decor("COLU", true),
  10: decor("PLAY", false, { frame: "W" }),
  12: decor("PLAY", false, { frame: "W" }),
  15: decor("PLAY", false, { frame: "N" }),
  18: decor("POSS", false, { frame: "L" }),
  19: decor("SPOS", false, { frame: "L" }),
  20: decor("TROO", false, { frame: "M" }),
  21: decor("SARG", false, { frame: "N" }),
  22: decor("HEAD", false, { frame: "L" }),
  24: decor("POL5", false),
  26: decor("POL6", true),
  30: decor("COL1", true),
  31: decor("COL2", true),
  32: decor("COL3", true),
  34: decor("CAND", false),
  35: decor("CBRA", true),
  36: decor("COL5", true),
  42: decor("FSKU", true),
  43: decor("TRE1", true),
  44: decor("TBLU", true),
  45: decor("TGRN", true),
  46: decor("TRED", true),
  47: decor("SMIT", true),
  48: decor("ELEC", true),
  53: decor("GOR5", true, { hanging: true }),
  54: decor("TRE2", true, { radius: 32 }),
  55: decor("SMBT", true),
  56: decor("SMGT", true),
  57: decor("SMRT", true),
  59: decor("GOR2", false, { hanging: true }),
  60: decor("GOR4", false, { hanging: true }),
  62: decor("GOR5", false, { hanging: true }),
  63: decor("GOR1", false, { hanging: true }),
});

// A_BossDeath: when every monster of the kind on the level is dead, the
// sectors with the tag run the floor action (E1M8's exit is behind it).
/** @type {Readonly<Record<string, { monster: string, tag: number, floor: string }>>} */
export const BOSS_DEATHS = Object.freeze({
  e1m8: { monster: "baron", tag: 666, floor: "lowest-neighbor" },
});

// Thing flags (the WAD's own bits).
export const THING_FLAGS = Object.freeze({ EASY: 1, MEDIUM: 2, HARD: 4, AMBUSH: 8, MULTIPLAYER: 16 });

// Line flags (the WAD's own bits).
export const LINE_FLAGS = Object.freeze({
  BLOCKING: 1, BLOCK_MONSTERS: 2, TWO_SIDED: 4, UPPER_UNPEGGED: 8, LOWER_UNPEGGED: 16,
  SECRET: 32, BLOCK_SOUND: 64, NEVER_ON_MAP: 128, ALWAYS_ON_MAP: 256,
});
