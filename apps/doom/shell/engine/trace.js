// Rays through the level: sight, autoaim and hitscan, after the original
// engine's P_CheckSight / P_AimLineAttack / P_LineAttack. A ray meets lines
// and things in order of distance; two-sided lines narrow the vertical window
// it can pass through.

import { isTwoSided, levelIndex } from "./level.js";
import { lineOpening } from "./collide.js";
import { ceilOf, floorOf } from "./sectors.js";
import { cosOf, sinOf } from "./constants.js";

// Lines the segment may cross, from the blockmap cells it passes through.
function linesAlong(level, x1, y1, x2, y2) {
  const { x, y, size, cols, rows, cells } = level.blockmap;
  let cx = Math.floor((x1 - x) / size), cy = Math.floor((y1 - y) / size);
  const ex = Math.floor((x2 - x) / size), ey = Math.floor((y2 - y) / size);
  const dx = x2 - x1, dy = y2 - y1;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tdx = dx === 0 ? Infinity : Math.abs(size / dx);
  const tdy = dy === 0 ? Infinity : Math.abs(size / dy);
  let tx = dx === 0 ? Infinity : ((dx > 0 ? (cx + 1) * size + x - x1 : x1 - (cx * size + x)) / Math.abs(dx));
  let ty = dy === 0 ? Infinity : ((dy > 0 ? (cy + 1) * size + y - y1 : y1 - (cy * size + y)) / Math.abs(dy));
  const out = new Set();
  for (let guard = 0; guard < cols + rows + 2; guard++) {
    if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) for (const i of cells[cy * cols + cx]) out.add(i);
    if (cx === ex && cy === ey) break;
    if (tx < ty) { tx += tdx; cx += stepX; } else { ty += tdy; cy += stepY; }
  }
  return out;
}

// Fraction along p1→p2 where it crosses line i, or -1.
function crossLine(level, i, x1, y1, x2, y2) {
  const line = level.lines[i];
  const [ax, ay] = level.vertices[line.v1];
  const [bx, by] = level.vertices[line.v2];
  const dx = x2 - x1, dy = y2 - y1, ex = bx - ax, ey = by - ay;
  const den = dx * ey - dy * ex;
  if (den === 0) return -1;
  const t = ((ax - x1) * ey - (ay - y1) * ex) / den;
  const u = ((ax - x1) * dy - (ay - y1) * dx) / den;
  return t > 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

// Fraction along p1→p2 where it enters a thing's circle, or -1.
function crossThing(t, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - t.x, fy = y1 - t.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - t.radius * t.radius;
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  if (t0 > 0 && t0 <= 1) return t0;
  return c <= 0 ? 0 : -1;
}

// Lines and things on the segment, nearest first.
export function intercepts(level, x1, y1, x2, y2, things = []) {
  const out = [];
  for (const i of linesAlong(level, x1, y1, x2, y2)) {
    const f = crossLine(level, i, x1, y1, x2, y2);
    if (f >= 0) out.push({ frac: f, line: i });
  }
  for (const t of things) {
    const f = crossThing(t, x1, y1, x2, y2);
    if (f >= 0) out.push({ frac: f, thing: t });
  }
  return out.sort((a, b) => a.frac - b.frac || (a.line ?? -1) - (b.line ?? -1));
}

// Whether an eye at z1 can see any part of the span [zBottom, zTop] at (x2, y2).
export function checkSight(world, level, x1, y1, z1, x2, y2, zBottom, zTop) {
  let top = zTop - z1, bottom = zBottom - z1;
  for (const it of intercepts(level, x1, y1, x2, y2)) {
    const line = level.lines[it.line];
    if (!isTwoSided(line)) return false;
    const o = lineOpening(world, level, it.line);
    if (o.bottom >= o.top) return false;
    const slopeBottom = (o.bottom - z1) / it.frac;
    const slopeTop = (o.top - z1) / it.frac;
    if (slopeBottom > bottom) bottom = slopeBottom;
    if (slopeTop < top) top = slopeTop;
    if (top <= bottom) return false;
  }
  return true;
}

export const shootZ = (a) => a.z + a.height / 2 + 8;

// The vertical slope toward the first shootable thing visible along angle, or
// null (P_AimLineAttack).
export function aim(world, level, shooter, angle, range, targets) {
  const x1 = shooter.x, y1 = shooter.y;
  const x2 = x1 + cosOf(angle) * range, y2 = y1 + sinOf(angle) * range;
  const z = shootZ(shooter);
  let top = 100 / 160, bottom = -100 / 160;
  for (const it of intercepts(level, x1, y1, x2, y2, targets.filter((t) => t !== shooter))) {
    const dist = it.frac * range;
    if (it.line !== undefined) {
      const line = level.lines[it.line];
      if (!isTwoSided(line)) return null;
      const o = lineOpening(world, level, it.line);
      if (o.bottom >= o.top || dist === 0) return null;
      const ix = levelIndex(level);
      const f = ix.lineFront[it.line], b = ix.lineBack[it.line];
      if (floorOf(world, level, f) !== floorOf(world, level, b)) bottom = Math.max(bottom, (o.bottom - z) / dist);
      if (ceilOf(world, level, f) !== ceilOf(world, level, b)) top = Math.min(top, (o.top - z) / dist);
      if (top <= bottom) return null;
      continue;
    }
    if (dist === 0) continue;
    const t = it.thing;
    const thingTop = (t.z + t.height - z) / dist;
    const thingBottom = (t.z - z) / dist;
    if (thingTop < bottom || thingBottom > top) continue;
    return { slope: (Math.min(thingTop, top) + Math.max(thingBottom, bottom)) / 2, target: t };
  }
  return null;
}

// Fires a hitscan along angle with a vertical slope. Returns what it struck:
// a target, or the wall point (for puffs), plus any gunfire-triggered lines it
// passed or hit.
export function lineAttack(world, level, shooter, angle, range, slope, targets) {
  const x1 = shooter.x, y1 = shooter.y;
  const x2 = x1 + cosOf(angle) * range, y2 = y1 + sinOf(angle) * range;
  const z = shootZ(shooter);
  const shotLines = [];
  const at = (frac) => ({ x: x1 + (x2 - x1) * frac, y: y1 + (y2 - y1) * frac, z: z + slope * frac * range });
  for (const it of intercepts(level, x1, y1, x2, y2, targets.filter((t) => t !== shooter))) {
    const dist = it.frac * range;
    if (it.line !== undefined) {
      const line = level.lines[it.line];
      if (line.special) shotLines.push(it.line);
      if (!isTwoSided(line)) return { target: null, ...at(Math.max(0, it.frac - 4 / range)), shotLines };
      const o = lineOpening(world, level, it.line);
      const hz = z + slope * dist;
      if (hz < o.bottom || hz > o.top) return { target: null, ...at(Math.max(0, it.frac - 4 / range)), shotLines };
      continue;
    }
    const t = it.thing;
    const hz = z + slope * dist;
    if (hz > t.z + t.height || hz < t.z) continue;
    return { target: t, ...at(it.frac), shotLines };
  }
  return { target: null, ...at(1), shotLines };
}
