// Proves what a level lets the player reach without simulating play: sectors
// joined by walkable lines, keys picked up, and every special the player can
// trigger applied in its end state, repeated until nothing changes. Lifts are
// walkable at either end of their travel. Gaps narrower than the player are not
// modelled; the engine tests cover movement itself.

import { BOSS_DEATHS, LINE_FLAGS, LINE_SPECIALS, THING_TYPES } from "../shell/engine/catalog.js";
import { levelIndex, sectorAt } from "../shell/engine/level.js";
import { PLAYER, MAXSTEP } from "../shell/engine/constants.js";
import type { Level } from "../scripts/wad/level.ts";

export interface Route {
  reached: Set<number>;
  keys: Set<string>;
  exits: Set<string>;
  fired: Set<number>;
}

export function solve(level: Level, skillBit = 2): Route {
  const ix: {
    lineFront: number[]; lineBack: number[]; sectorLines: number[][]; neighbors: number[][];
    tagSectors: Map<number, number[]>; teleportDest: Map<number, number>;
  } = levelIndex(level);
  const floor = level.sectors.map((s) => s.floor);
  const ceil = level.sectors.map((s) => s.ceil);
  const lift = new Map<number, [number, number]>();
  const teleportArrivals = new Set<number>();
  const route: Route = { reached: new Set(), keys: new Set(), exits: new Set(), fired: new Set() };

  const neighbors = (s: number) => ix.neighbors[s];
  const lowestNeighborFloor = (s: number) => Math.min(floor[s], ...neighbors(s).map((n) => floor[n]));
  const highestNeighborFloor = (s: number) => Math.max(-500, ...neighbors(s).map((n) => floor[n]));
  const nextHigherFloor = (s: number) => neighbors(s).map((n) => floor[n]).filter((h) => h > floor[s]).sort((a, b) => a - b)[0] ?? floor[s];
  const lowestNeighborCeil = (s: number) => Math.min(...neighbors(s).map((n) => ceil[n]));
  const heights = (s: number) => (lift.has(s) ? lift.get(s)! : [floor[s], floor[s]]);

  // Whether the player can walk from sector a into b across line i.
  const walkable = (i: number, a: number, b: number) => {
    const line = level.lines[i];
    if (ix.lineBack[i] < 0 || line.flags & LINE_FLAGS.BLOCKING) return false;
    for (const fa of heights(a)) {
      for (const fb of heights(b)) {
        const top = Math.min(ceil[a], ceil[b]);
        if (fb - fa <= MAXSTEP && top - Math.max(fa, fb) >= PLAYER.height && ceil[b] - fb >= PLAYER.height) return true;
      }
    }
    return false;
  };

  const flood = () => {
    const start = level.things.find((t) => t.type === 1)!;
    const queue = [sectorAt(level, start.x, start.y), ...route.reached, ...teleportArrivals];
    for (const s of queue) route.reached.add(s);
    while (queue.length) {
      const a = queue.pop()!;
      for (const i of ix.sectorLines[a]) {
        const b = ix.lineFront[i] === a ? ix.lineBack[i] : ix.lineFront[i];
        if (b < 0 || route.reached.has(b) || !walkable(i, a, b)) continue;
        route.reached.add(b);
        queue.push(b);
      }
    }
  };

  const tagged = (tag: number) => ix.tagSectors.get(tag) || [];

  // P_TouchSpecialThing: the player picks an item up from any reached floor
  // whose edge comes within the two radii, if the item is at most a player's
  // height above (or 8 below) that floor: a key on a console is taken from
  // beside it.
  const touchable = (x: number, y: number, z: number, radius: number) => {
    const reach = radius + PLAYER.radius;
    return level.subsectors.some((ss) => {
      if (!route.reached.has(ss.sector)) return false;
      const dz = z - floor[ss.sector];
      if (dz > PLAYER.height || dz < -8) return false;
      return distanceToPolygon(x, y, ss.polygon) < reach;
    });
  };

  const apply = (i: number): boolean => {
    const line = level.lines[i];
    const def = LINE_SPECIALS[line.special];
    switch (def.action) {
      case "door": {
        // A closing door only takes paths away; reaching stays monotonic.
        if (def.door === "close") return false;
        const sectors = def.trigger[0] === "D" ? [ix.lineBack[i]] : tagged(line.tag);
        for (const s of sectors) ceil[s] = Math.max(ceil[s], lowestNeighborCeil(s) - 4);
        return sectors.length > 0;
      }
      case "lift":
        for (const s of tagged(line.tag)) lift.set(s, [Math.min(lowestNeighborFloor(s), floor[s]), floor[s]]);
        return true;
      case "plat":
        for (const s of tagged(line.tag)) {
          if (def.plat === "perpetual") lift.set(s, [Math.min(lowestNeighborFloor(s), floor[s]), Math.max(highestNeighborFloor(s), floor[s])]);
          else floor[s] = nextHigherFloor(s);
        }
        return true;
      case "floor":
        for (const s of tagged(line.tag)) {
          if (def.floor === "lowest-neighbor") floor[s] = lowestNeighborFloor(s);
          else if (def.floor === "highest-neighbor") floor[s] = highestNeighborFloor(s);
          else if (def.floor === "highest-neighbor-plus-8") {
            const h = highestNeighborFloor(s);
            floor[s] = h === floor[s] ? h : h + 8;
          } else if (def.floor === "raise-24") floor[s] += 24;
          else throw new Error(`solver: floor ${def.floor} is not modelled`);
        }
        return true;
      case "stairs":
        for (const s of tagged(line.tag)) {
          const flat = level.sectors[s].floorFlat;
          let sec = s, h = floor[s] + def.step;
          const seen = new Set<number>();
          while (sec >= 0 && !seen.has(sec)) {
            seen.add(sec);
            floor[sec] = h;
            h += def.step;
            const next = ix.sectorLines[sec].find((k) => ix.lineFront[k] === sec && ix.lineBack[k] >= 0 && level.sectors[ix.lineBack[k]].floorFlat === flat && !seen.has(ix.lineBack[k]));
            sec = next === undefined ? -1 : ix.lineBack[next];
          }
        }
        return true;
      case "teleport":
        for (const s of tagged(line.tag)) if (ix.teleportDest.has(s)) teleportArrivals.add(s);
        return true;
      case "exit":
        route.exits.add(def.exit);
        return true;
      case "light":
      case "scroll":
        return false;
      default:
        throw new Error(`solver: action ${def.action} is not modelled`);
    }
  };

  // Whether the player can fire line i given what is reached now.
  const usable = (i: number) => {
    const line = level.lines[i];
    const def = LINE_SPECIALS[line.special];
    if (!def || def.monstersOnly || def.trigger === "none") return false;
    if (def.key && !route.keys.has(def.key)) return false;
    const f = ix.lineFront[i], b = ix.lineBack[i];
    switch (def.trigger[0]) {
      case "S":
      case "D":
        return route.reached.has(f);
      case "G":
        return route.reached.has(f) || (b >= 0 && route.reached.has(b));
      case "W":
        if (def.action === "teleport") return route.reached.has(f) && walkable(i, f, b);
        return (route.reached.has(f) && walkable(i, f, b)) || (b >= 0 && route.reached.has(b) && walkable(i, b, f));
      default:
        throw new Error(`solver: trigger ${def.trigger} is not modelled`);
    }
  };

  let bossDone = false;
  for (let changed = true; changed;) {
    changed = false;
    flood();
    level.things.forEach((t) => {
      const def = THING_TYPES[t.type];
      if (def.kind !== "key" || !(t.flags & skillBit) || route.keys.has(def.key)) return;
      if (touchable(t.x, t.y, floor[sectorAt(level, t.x, t.y)], def.radius)) { route.keys.add(def.key); changed = true; }
    });
    level.lines.forEach((line, i) => {
      if (!line.special || route.fired.has(i) || !usable(i)) return;
      route.fired.add(i);
      if (apply(i)) changed = true;
    });
    // Bosses the player can reach are assumed killed.
    const boss = BOSS_DEATHS[level.name];
    if (boss && !bossDone) {
      const bosses = level.things.filter((t) => THING_TYPES[t.type].monster === boss.monster && t.flags & skillBit);
      if (bosses.length && bosses.every((t) => route.reached.has(sectorAt(level, t.x, t.y)))) {
        bossDone = true;
        for (const s of tagged(boss.tag)) floor[s] = lowestNeighborFloor(s);
        changed = true;
      }
    }
  }
  return route;
}

function distanceToPolygon(x: number, y: number, poly: [number, number][]): number {
  let inside = false, best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return inside ? 0 : best;
}
