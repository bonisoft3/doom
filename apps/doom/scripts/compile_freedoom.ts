// Compiles FreeDoom's Episode 1 from the pinned release: level JSON
// (format 2), every wall texture and flat the levels show, and the
// front-facing sprite frames of every thing, effect and weapon.
//   deno run --config scripts/deno.json --lock scripts/deno.lock -A scripts/compile_freedoom.ts

import { freedoom1 } from "./wad/source.ts";
import { decodeLevel } from "./wad/level.ts";
import { closure, composeTexture, flat, palette } from "./wad/textures.ts";
import { encodePng } from "./wad/picture.ts";
import { frontFrames } from "./wad/sprites.ts";
import { THING_TYPES } from "../shell/engine/catalog.js";
import { EFFECT_FRAMES, MISSILE_FRAMES, WEAPON_FRAMES } from "../shell/engine/sprites.js";

const ASSETS = new URL("../shell/assets/", import.meta.url);

// Episode order: E1M3's secret exit leads to E1M9, which returns to E1M4.
const EPISODE = [
  { marker: "E1M1", title: "Outer Prison", next: "e1m2" },
  { marker: "E1M2", title: "Communications Center", next: "e1m3" },
  { marker: "E1M3", title: "Waste Disposal", next: "e1m4", secretNext: "e1m9" },
  { marker: "E1M4", title: "Supply Depot", next: "e1m5" },
  { marker: "E1M5", title: "Armory", next: "e1m6" },
  { marker: "E1M6", title: "Training Facility", next: "e1m7" },
  { marker: "E1M7", title: "Xenobiotic Materials Lab", next: "e1m8" },
  { marker: "E1M8", title: "Outpost Quarry", next: null },
  { marker: "E1M9", title: "Nutrient Recycling", next: "e1m4" },
];
const SKY = "SKY1";
const SKY_FLAT = "F_SKY1";

const json = (v: unknown) => JSON.stringify(v) + "\n";

async function write(dir: string, file: string, data: string | Uint8Array) {
  const url = new URL(`${dir}/${file}`, ASSETS);
  await Deno.mkdir(new URL(".", url), { recursive: true });
  if (typeof data === "string") await Deno.writeTextFile(url, data);
  else await Deno.writeFile(url, data);
}

const wad = await freedoom1();
const pal = palette(wad);
const textures = new Set<string>([SKY]);
const flats = new Set<string>();

for (const e of EPISODE) {
  const level = decodeLevel(wad, e.marker, `${e.marker}: ${e.title}`);
  for (const s of level.sides) for (const t of [s.upper, s.middle, s.lower]) if (t) textures.add(t);
  for (const s of level.sectors) for (const f of [s.floorFlat, s.ceilFlat]) if (f !== SKY_FLAT) flats.add(f);
  await write("levels", `${level.name}.json`, json(level));
  console.log(`${level.name}: ${level.sectors.length} sectors, ${level.lines.length} lines, ${level.things.length} things`);
}

const graphics = closure(wad, textures, flats);
for (const def of graphics.defs) await write("textures", `${def.name.toLowerCase()}.png`, await encodePng(composeTexture(wad, def, pal)));
for (const name of graphics.flats) await write("flats", `${name.toLowerCase()}.png`, await encodePng(flat(wad, name, pal)));

await write("levels", "index.json", json({
  levels: EPISODE.map((e) => ({ name: e.marker.toLowerCase(), title: `${e.marker}: ${e.title}`, next: e.next, secretNext: e.secretNext ?? null })),
  sky: { texture: SKY.toLowerCase(), flat: SKY_FLAT },
  textures: Object.fromEntries(graphics.defs.map((d) => [d.name, { width: d.width, height: d.height }])),
  flats: graphics.flats,
  animations: graphics.animations,
  switches: graphics.switches,
}));
console.log(`${graphics.defs.length} textures, ${graphics.flats.length} flats`);

const prefixes = new Set<string>();
for (const def of Object.values(THING_TYPES)) if (def.sprite) prefixes.add(def.sprite);
for (const m of Object.values(MISSILE_FRAMES)) { prefixes.add(m.sprite); prefixes.add(m.burst); }
for (const e of Object.values(EFFECT_FRAMES)) prefixes.add(e.sprite);
for (const w of Object.values(WEAPON_FRAMES)) { prefixes.add(w.sprite); if ("flash" in w) prefixes.add(w.flash); }
const frames = frontFrames(wad, prefixes, pal);
for (const f of frames) await write("things", `${f.name.toLowerCase()}.png`, await encodePng(f.picture));
await write("things", "index.json", json(Object.fromEntries(frames.map((f) => [f.name, { width: f.picture.width, height: f.picture.height, left: f.picture.left, top: f.picture.top }]))));
console.log(`${frames.length} sprite frames`);
