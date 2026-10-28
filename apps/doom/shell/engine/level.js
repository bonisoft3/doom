// Queries over a compiled level (format 2, see scripts/wad/level.ts). Levels
// are immutable; what moves at runtime lives in the world state.

import { LINE_FLAGS, THING_TYPES } from "./catalog.js";

const registry = new Map();

export function registerLevel(level) {
  if (!level || level.format !== 2 || typeof level.name !== "string") {
    throw new TypeError("registerLevel: a format 2 level is required");
  }
  registry.set(level.name, level);
}

export function getLevel(name) {
  const level = registry.get(name);
  if (!level) throw new Error(`level ${name} is not registered`);
  return level;
}

let episode = null;

// The episode index (levels/index.json): titles and what follows each level.
export function registerEpisode(index) {
  if (!index || !Array.isArray(index.levels)) throw new TypeError("registerEpisode: an episode index is required");
  episode = index;
}

export function nextLevel(name, secret) {
  if (!episode) throw new Error("no episode is registered");
  const entry = episode.levels.find((l) => l.name === name);
  if (!entry) throw new Error(`level ${name} is not in the episode`);
  return (secret && entry.secretNext) || entry.next || "";
}

// The subsector containing (x, y), found by descending the BSP the way the
// original engine does: a point exactly on a partition goes left.
export function subsectorAt(level, x, y) {
  let c = level.nodes.length - 1;
  while (c >= 0) {
    const n = level.nodes[c];
    const cross = n.dx * (y - n.y) - n.dy * (x - n.x);
    c = cross < 0 ? n.right : n.left;
  }
  return -c - 1;
}

export function sectorAt(level, x, y) {
  return level.subsectors[subsectorAt(level, x, y)].sector;
}

// 0 for the front (right) side of a line, 1 for the back.
export function pointOnLineSide(level, line, x, y) {
  const [ax, ay] = level.vertices[line.v1];
  const [bx, by] = level.vertices[line.v2];
  return (bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0 ? 0 : 1;
}

// The side of a line an axis-aligned box lies on, or -1 when it straddles.
export function boxOnLineSide(level, line, x0, y0, x1, y1) {
  const a = pointOnLineSide(level, line, x0, y0);
  if (pointOnLineSide(level, line, x1, y0) !== a) return -1;
  if (pointOnLineSide(level, line, x0, y1) !== a) return -1;
  if (pointOnLineSide(level, line, x1, y1) !== a) return -1;
  return a;
}

// Line indices from every blockmap cell the box touches, each once.
export function linesInBox(level, x0, y0, x1, y1) {
  const { x, y, size, cols, rows, cells } = level.blockmap;
  const c0 = Math.max(0, Math.floor((x0 - x) / size)), c1 = Math.min(cols - 1, Math.floor((x1 - x) / size));
  const r0 = Math.max(0, Math.floor((y0 - y) / size)), r1 = Math.min(rows - 1, Math.floor((y1 - y) / size));
  if (c0 === c1 && r0 === r1) return cells[r0 * cols + c0];
  const seen = new Set();
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (const i of cells[r * cols + c]) seen.add(i);
  return [...seen];
}

const indices = new WeakMap();

// Lookups derived once per level.
export function levelIndex(level) {
  let ix = indices.get(level);
  if (ix) return ix;
  const sectorOfSide = (s) => (s < 0 ? -1 : level.sides[s].sector);
  const lineFront = level.lines.map((l) => sectorOfSide(l.front));
  const lineBack = level.lines.map((l) => sectorOfSide(l.back));
  const lineBox = level.lines.map((l) => {
    const [ax, ay] = level.vertices[l.v1];
    const [bx, by] = level.vertices[l.v2];
    return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
  });
  const sectorLines = level.sectors.map(() => []);
  level.lines.forEach((_, i) => {
    sectorLines[lineFront[i]].push(i);
    if (lineBack[i] >= 0 && lineBack[i] !== lineFront[i]) sectorLines[lineBack[i]].push(i);
  });
  const sectorBox = sectorLines.map((ls) => {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const i of ls) {
      b[0] = Math.min(b[0], lineBox[i][0]); b[1] = Math.min(b[1], lineBox[i][1]);
      b[2] = Math.max(b[2], lineBox[i][2]); b[3] = Math.max(b[3], lineBox[i][3]);
    }
    return b;
  });
  const neighbors = level.sectors.map((_, s) => {
    const out = new Set();
    for (const i of sectorLines[s]) {
      const other = lineFront[i] === s ? lineBack[i] : lineFront[i];
      if (other >= 0 && other !== s) out.add(other);
    }
    return [...out];
  });
  const tagSectors = new Map();
  level.sectors.forEach((sec, s) => {
    if (!sec.tag) return;
    if (!tagSectors.has(sec.tag)) tagSectors.set(sec.tag, []);
    tagSectors.get(sec.tag).push(s);
  });
  const teleportDest = new Map();
  const staticSolids = [];
  level.things.forEach((t, i) => {
    const def = THING_TYPES[t.type];
    if (def.kind === "teleport-destination") teleportDest.set(sectorAt(level, t.x, t.y), i);
    if (def.kind === "decor" && def.solid) staticSolids.push({ x: t.x, y: t.y, radius: def.radius, thing: i });
  });
  ix = { lineFront, lineBack, lineBox, sectorLines, sectorBox, neighbors, tagSectors, teleportDest, staticSolids };
  indices.set(level, ix);
  return ix;
}

export function isTwoSided(line) {
  return line.back >= 0 && (line.flags & LINE_FLAGS.TWO_SIDED) !== 0;
}
