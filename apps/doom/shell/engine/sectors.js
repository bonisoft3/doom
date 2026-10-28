// A sector's live properties: the level's values unless the world has moved or
// changed them. world.sectors maps a sector index to its overrides.

import { levelIndex } from "./level.js";

export function sectorProp(world, level, s, prop) {
  const o = world.sectors[s];
  return o && prop in o ? o[prop] : level.sectors[s][prop];
}

export const floorOf = (world, level, s) => sectorProp(world, level, s, "floor");
export const ceilOf = (world, level, s) => sectorProp(world, level, s, "ceil");

export function setSector(world, s, patch) {
  world.sectors[s] = { ...(world.sectors[s] || {}), ...patch };
}

function neighborValues(world, level, s, prop) {
  return levelIndex(level).neighbors[s].map((n) => sectorProp(world, level, n, prop));
}

export function lowestNeighborFloor(world, level, s) {
  return Math.min(floorOf(world, level, s), ...neighborValues(world, level, s, "floor"));
}

// Doom's P_FindHighestFloorSurrounding starts from -500 and ignores the sector itself.
export function highestNeighborFloor(world, level, s) {
  return Math.max(-500, ...neighborValues(world, level, s, "floor"));
}

export function nextHigherNeighborFloor(world, level, s) {
  const own = floorOf(world, level, s);
  const higher = neighborValues(world, level, s, "floor").filter((h) => h > own);
  return higher.length ? Math.min(...higher) : own;
}

export function lowestNeighborCeil(world, level, s) {
  const vals = neighborValues(world, level, s, "ceil");
  return vals.length ? Math.min(...vals) : ceilOf(world, level, s);
}
