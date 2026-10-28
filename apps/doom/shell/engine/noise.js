// P_NoiseAlert: a gunshot is heard through every open two-sided line; lines
// flagged to block sound stop it on the second such crossing. Monsters idle in
// a sector that heard the player wake up.

import { LINE_FLAGS } from "./catalog.js";
import { isTwoSided, levelIndex, sectorAt } from "./level.js";
import { lineOpening } from "./collide.js";

export function noiseAlert(world, level, emitter) {
  const ix = levelIndex(level);
  // Fewest sound blocks crossed to reach each sector.
  const best = new Map();
  const visit = (s, blocks) => {
    if (best.has(s) && best.get(s) <= blocks) return;
    best.set(s, blocks);
    for (const i of ix.sectorLines[s]) {
      const line = level.lines[i];
      if (!isTwoSided(line)) continue;
      const o = lineOpening(world, level, i);
      if (o.top - o.bottom <= 0) continue;
      const other = ix.lineFront[i] === s ? ix.lineBack[i] : ix.lineFront[i];
      if (line.flags & LINE_FLAGS.BLOCK_SOUND) {
        if (blocks === 0) visit(other, 1);
      } else visit(other, blocks);
    }
  };
  visit(sectorAt(level, emitter.x, emitter.y), 0);
  const heard = new Set(world.heard);
  for (const s of best.keys()) heard.add(s);
  world.heard = [...heard].sort((a, b) => a - b);
}
