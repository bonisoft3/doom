// Which sprite frames show a thing in each state. Frame strings list the
// WAD's frame letters in order; sprites are the WAD's four-letter prefixes.

export const MONSTER_FRAMES = Object.freeze({
  zombieman: { walk: "ABCD", attack: "EF", pain: "G", death: "HIJKL" },
  shotgunguy: { walk: "ABCD", attack: "EF", pain: "G", death: "HIJKL" },
  imp: { walk: "ABCD", attack: "EFG", pain: "H", death: "IJKLM" },
  demon: { walk: "ABCD", attack: "EFG", pain: "H", death: "IJKLMN" },
  spectre: { walk: "ABCD", attack: "EFG", pain: "H", death: "IJKLMN" },
  lostsoul: { walk: "AB", attack: "CD", pain: "E", death: "FGHIJK" },
  baron: { walk: "ABCD", attack: "EFG", pain: "H", death: "IJKLMNO" },
});

export const MISSILE_FRAMES = Object.freeze({
  impball: { sprite: "BAL1", fly: "AB", burst: "BAL1", explode: "CDE" },
  baronball: { sprite: "BAL7", fly: "AB", burst: "BAL7", explode: "CDE" },
  rocket: { sprite: "MISL", fly: "A", burst: "MISL", explode: "BCD" },
  plasma: { sprite: "PLSS", fly: "AB", burst: "PLSE", explode: "ABCDE" },
  bfg: { sprite: "BFS1", fly: "AB", burst: "BFE1", explode: "ABCDEF" },
});

export const EFFECT_FRAMES = Object.freeze({
  puff: { sprite: "PUFF", frames: "ABCD" },
  barrel: { sprite: "BAR1", frames: "AB" },
  barrelBurst: { sprite: "BEXP", frames: "ABCDE" },
});

// The weapon in hand (frame A at rest, the rest while firing) and its muzzle flash.
export const WEAPON_FRAMES = Object.freeze({
  fist: { sprite: "PUNG", fire: "BCD" },
  chainsaw: { sprite: "SAWG", fire: "AB" },
  pistol: { sprite: "PISG", fire: "BC", flash: "PISF" },
  shotgun: { sprite: "SHTG", fire: "BCD", flash: "SHTF" },
  chaingun: { sprite: "CHGG", fire: "AB", flash: "CHGF" },
  rocketlauncher: { sprite: "MISG", fire: "B", flash: "MISF" },
  plasmarifle: { sprite: "PLSG", fire: "B", flash: "PLSF" },
  bfg: { sprite: "BFGG", fire: "BC", flash: "BFGF" },
});
