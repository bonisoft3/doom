// Registers the compiled episode and offers ways to put the player somewhere
// in a real level.

import { registerEpisode, registerLevel, getLevel, sectorAt, subsectorAt } from "../shell/engine/level.js";
import { doomKineticEngine } from "../shell/engine/simulation.js";
import { checkPosition } from "../shell/engine/collide.js";
import { PLAYER } from "../shell/engine/constants.js";
import { angleTo } from "../shell/engine/constants.js";
import { polygonArea, type Level } from "../scripts/wad/level.ts";

const base = new URL("../shell/assets/levels/", import.meta.url);
export const episode = JSON.parse(Deno.readTextFileSync(new URL("index.json", base)));
registerEpisode(episode);
for (const l of episode.levels) registerLevel(JSON.parse(Deno.readTextFileSync(new URL(`${l.name}.json`, base))));

export const level = (name: string): Level => getLevel(name);

// deno-lint-ignore no-explicit-any
export type World = any;
export type Cmd = Record<string, unknown>;

export const E = doomKineticEngine;

export function start(mapName = "e1m1", skill = 2, loadout?: Record<string, unknown>): World {
  return E.initState(0x1337, { mapName, skill, ...(loadout ? { loadout } : {}) });
}

export function step(w: World, cmd: Cmd = {}, tics = 1): World {
  for (let i = 0; i < tics; i++) w = E.advanceFrame(w, cmd);
  return w;
}

// The centre of the sector's largest subsector.
export function pointIn(l: Level, sector: number): [number, number] {
  let best: [number, number][] = [];
  for (const ss of l.subsectors) if (ss.sector === sector && polygonArea(ss.polygon) > polygonArea(best)) best = ss.polygon;
  if (!best.length) throw new Error(`sector ${sector} has no area`);
  const x = best.reduce((s, p) => s + p[0], 0) / best.length;
  const y = best.reduce((s, p) => s + p[1], 0) / best.length;
  if (sectorAt(l, x, y) !== sector || l.subsectors[subsectorAt(l, x, y)].sector !== sector) throw new Error(`centroid escapes sector ${sector}`);
  return [x, y];
}

// A spot `dist` in front of line i (on its front side, or back side when
// asked), facing the line's midpoint.
export function facingLine(l: Level, i: number, dist: number, back = false) {
  const line = l.lines[i];
  const [ax, ay] = l.vertices[line.v1];
  const [bx, by] = l.vertices[line.v2];
  const len = Math.hypot(bx - ax, by - ay);
  const sign = back ? -1 : 1;
  const nx = ((by - ay) / len) * sign, ny = (-(bx - ax) / len) * sign;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const x = mx + nx * dist, y = my + ny * dist;
  return { x, y, angle: angleTo(x, y, mx, my) };
}

export function teleport(w: World, spot: { x: number; y: number; angle?: number }): World {
  return E.advanceFrame(w, { teleport: { x: spot.x, y: spot.y, ...(spot.angle !== undefined ? { angle: spot.angle } : {}) } });
}

// Whether a player could stand at the spot: nothing overlaps them and the
// gap above the floor is tall enough.
export function fits(w: World, l: Level, spot: { x: number; y: number }): boolean {
  const pos = checkPosition(w, l, { kind: "player", radius: PLAYER.radius }, spot.x, spot.y, []);
  return pos.ok && pos.ceilingz - pos.floorz >= PLAYER.height;
}

// The floor rise from a line's back sector to its front sector, and the
// headroom over the front floor.
export function rise(l: Level, i: number) {
  const line = l.lines[i];
  const f = l.sectors[l.sides[line.front].sector], b = l.sectors[l.sides[line.back].sector];
  return { lift: f.floor - b.floor, room: Math.min(f.ceil, b.ceil) - Math.max(f.floor, b.floor), top: f.floor };
}
