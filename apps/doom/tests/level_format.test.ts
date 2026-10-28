import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { clipPolygon, polygonArea, type Level, type Point } from "../scripts/wad/level.ts";
import { sectorAt, subsectorAt } from "../shell/engine/level.js";
import { LINE_SPECIALS, SECTOR_SPECIALS, THING_TYPES } from "../shell/engine/catalog.js";

const assets = new URL("../shell/assets/", import.meta.url);
const index = JSON.parse(Deno.readTextFileSync(new URL("levels/index.json", assets)));
const levels: Level[] = index.levels.map((l: { name: string }) =>
  JSON.parse(Deno.readTextFileSync(new URL(`levels/${l.name}.json`, assets)))
);
const e1m1 = levels[0];

Deno.test("clipPolygon keeps the requested side of a directed line", () => {
  const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  // The line x = 4 pointing up: its right side is x > 4.
  const right = clipPolygon(square, 4, 0, 0, 1, true);
  const left = clipPolygon(square, 4, 0, 0, 1, false);
  assertAlmostEquals(polygonArea(right), 60, 1e-9);
  assertAlmostEquals(polygonArea(left), 40, 1e-9);
  assert(right.every(([x]) => x >= 4 - 1e-9));
});

Deno.test("every E1 level compiles to format 2 with the episode's progression", () => {
  assertEquals(levels.map((l) => l.name), ["e1m1", "e1m2", "e1m3", "e1m4", "e1m5", "e1m6", "e1m7", "e1m8", "e1m9"]);
  for (const l of levels) assertEquals(l.format, 2);
  assertEquals(index.levels.find((l: { name: string }) => l.name === "e1m3").secretNext, "e1m9");
  assertEquals(index.levels.find((l: { name: string }) => l.name === "e1m9").next, "e1m4");
});

Deno.test("every special and thing a level uses is in the catalog", () => {
  for (const l of levels) {
    for (const line of l.lines) if (line.special) assert(line.special in LINE_SPECIALS, `${l.name}: line special ${line.special}`);
    for (const s of l.sectors) if (s.special) assert(s.special in SECTOR_SPECIALS, `${l.name}: sector special ${s.special}`);
    for (const t of l.things) assert(t.type in THING_TYPES, `${l.name}: thing ${t.type}`);
  }
});

// A subsector's polygon and the BSP walk must agree, or the renderer would
// draw a floor where the simulation thinks another sector is.
Deno.test("each subsector's polygon contains points the BSP assigns back to it", () => {
  for (const l of levels) {
    let checked = 0;
    l.subsectors.forEach((ss, i) => {
      if (polygonArea(ss.polygon) < 1) return;
      const cx = ss.polygon.reduce((s, p) => s + p[0], 0) / ss.polygon.length;
      const cy = ss.polygon.reduce((s, p) => s + p[1], 0) / ss.polygon.length;
      assertEquals(subsectorAt(l, cx, cy), i, `${l.name}: centroid of subsector ${i}`);
      checked++;
    });
    assert(checked > l.subsectors.length * 0.95, `${l.name}: only ${checked}/${l.subsectors.length} subsectors have area`);
  }
});

Deno.test("every sector is covered by subsector polygons", () => {
  for (const l of levels) {
    const area = new Array(l.sectors.length).fill(0);
    for (const ss of l.subsectors) area[ss.sector] += polygonArea(ss.polygon);
    area.forEach((a, s) => assert(a > 0, `${l.name}: sector ${s} has no floor`));
  }
});

// Facts read independently from freedoom1.wad: E1M1's blue key sits on a
// ledge (floor 136) reached by the lift, not at the player's level.
Deno.test("E1M1 keeps the WAD's heights: the blue key is on the raised ledge", () => {
  const key = e1m1.things.find((t) => t.type === 5)!;
  assertEquals([key.x, key.y], [2192, 576]);
  assertEquals(sectorAt(e1m1, key.x, key.y), 35);
  assertEquals(e1m1.sectors[35].floor, 136);
  const start = e1m1.things.find((t) => t.type === 1)!;
  assertEquals(sectorAt(e1m1, start.x, start.y), 140);
  assertEquals([e1m1.sectors[140].floor, e1m1.sectors[140].ceil], [0, 128]);
});

Deno.test("the blockmap lists every line in a cell it crosses", () => {
  for (const l of levels) {
    const { x, y, size, cols, cells } = l.blockmap;
    l.lines.forEach((line, i) => {
      const [ax, ay] = l.vertices[line.v1];
      const [bx, by] = l.vertices[line.v2];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const cell = Math.floor((my - y) / size) * cols + Math.floor((mx - x) / size);
      assert(cells[cell].includes(i), `${l.name}: line ${i} missing from the cell of its midpoint`);
    });
  }
});

Deno.test("every texture and flat a level shows was emitted", () => {
  for (const l of levels) {
    for (const s of l.sides) {
      for (const t of [s.upper, s.middle, s.lower]) if (t) assert(t in index.textures, `${l.name}: texture ${t}`);
    }
    for (const s of l.sectors) {
      for (const f of [s.floorFlat, s.ceilFlat]) {
        if (f !== index.sky.flat) assert(index.flats.includes(f), `${l.name}: flat ${f}`);
      }
    }
  }
  for (const t of Object.keys(index.textures)) Deno.statSync(new URL(`textures/${t.toLowerCase()}.png`, assets));
  for (const f of index.flats) Deno.statSync(new URL(`flats/${f.toLowerCase()}.png`, assets));
});

// The renderer throws on a frame missing from the sprite index mid-game; this
// finds it at test time instead.
Deno.test("every sprite frame the renderer can show was extracted", async () => {
  const { MONSTER_FRAMES, MISSILE_FRAMES, EFFECT_FRAMES, WEAPON_FRAMES } = await import("../shell/engine/sprites.js");
  const sprites = JSON.parse(Deno.readTextFileSync(new URL("things/index.json", assets)));
  const need = (frame: string) => assert(frame in sprites, `sprite frame ${frame}`);
  for (const def of Object.values(THING_TYPES)) {
    if (def.kind === "monster") {
      const fr = MONSTER_FRAMES[def.monster as keyof typeof MONSTER_FRAMES];
      for (const letter of fr.walk + fr.attack + fr.pain + fr.death) need(def.sprite + letter);
    } else if (def.sprite) need(def.sprite + (def.frame ?? "A"));
  }
  for (const m of Object.values(MISSILE_FRAMES)) {
    for (const l of m.fly) need(m.sprite + l);
    for (const l of m.explode) need(m.burst + l);
  }
  for (const e of Object.values(EFFECT_FRAMES)) for (const l of e.frames) need(e.sprite + l);
  for (const w of Object.values(WEAPON_FRAMES)) for (const l of "A" + w.fire) need(w.sprite + l);
});
