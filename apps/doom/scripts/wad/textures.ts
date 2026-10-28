import { name8, type Wad } from "./wad.ts";
import { decodeFlat, decodePicture, type Image, type Palette } from "./picture.ts";

export interface TextureDef {
  name: string;
  width: number;
  height: number;
  patches: { x: number; y: number; patch: string }[];
}

// The original engine's animation table: each entry cycles every texture (or
// flat) from first to last in WAD order, 8 tics per frame.
const ANIMATED_FLATS: [string, string][] = [
  ["NUKAGE1", "NUKAGE3"], ["FWATER1", "FWATER4"], ["SWATER1", "SWATER4"], ["LAVA1", "LAVA4"],
  ["BLOOD1", "BLOOD3"], ["RROCK05", "RROCK08"], ["SLIME01", "SLIME04"], ["SLIME05", "SLIME08"], ["SLIME09", "SLIME12"],
];
const ANIMATED_TEXTURES: [string, string][] = [
  ["BLODGR1", "BLODGR4"], ["SLADRIP1", "SLADRIP3"], ["BLODRIP1", "BLODRIP4"], ["FIREWALA", "FIREWALL"],
  ["GSTFONT1", "GSTFONT3"], ["FIRELAV3", "FIRELAVA"], ["FIREMAG1", "FIREMAG3"], ["FIREBLU1", "FIREBLU2"],
  ["ROCKRED1", "ROCKRED3"], ["BFALL1", "BFALL4"], ["SFALL1", "SFALL4"], ["WFALL1", "WFALL4"], ["DBRAIN1", "DBRAIN4"],
];

export function palette(wad: Wad): Palette {
  return wad.lump("PLAYPAL").subarray(0, 768);
}

export function textureDefs(wad: Wad): TextureDef[] {
  const pn = wad.lump("PNAMES");
  const pv = new DataView(pn.buffer, pn.byteOffset, pn.byteLength);
  const pnames = Array.from({ length: pv.getInt32(0, true) }, (_, i) => name8(pn, 4 + i * 8));
  const defs: TextureDef[] = [];
  for (const lump of ["TEXTURE1", "TEXTURE2"]) {
    if (!wad.has(lump)) continue;
    const t = wad.lump(lump);
    const v = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const n = v.getInt32(0, true);
    for (let i = 0; i < n; i++) {
      const at = v.getInt32(4 + i * 4, true);
      const count = v.getInt16(at + 20, true);
      defs.push({
        name: name8(t, at),
        width: v.getInt16(at + 12, true),
        height: v.getInt16(at + 14, true),
        patches: Array.from({ length: count }, (_, k) => {
          const p = at + 22 + k * 10;
          const index = v.getInt16(p + 4, true);
          if (!pnames[index]) throw new Error(`texture ${name8(t, at)}: patch index ${index} out of PNAMES`);
          return { x: v.getInt16(p, true), y: v.getInt16(p + 2, true), patch: pnames[index] };
        }),
      });
    }
  }
  return defs;
}

export function composeTexture(wad: Wad, def: TextureDef, pal: Palette): Image {
  const patches = new Map(wad.namespace("P").map((l) => [l.name, l.bytes]));
  const rgba = new Uint8Array(def.width * def.height * 4);
  for (const p of def.patches) {
    const bytes = patches.get(p.patch);
    if (!bytes) throw new Error(`texture ${def.name}: patch ${p.patch} not in the WAD`);
    const pic = decodePicture(bytes, pal);
    for (let y = 0; y < pic.height; y++) {
      const ty = p.y + y;
      if (ty < 0 || ty >= def.height) continue;
      for (let x = 0; x < pic.width; x++) {
        const tx = p.x + x;
        if (tx < 0 || tx >= def.width) continue;
        const s = (y * pic.width + x) * 4;
        if (pic.rgba[s + 3] === 0) continue;
        rgba.set(pic.rgba.subarray(s, s + 4), (ty * def.width + tx) * 4);
      }
    }
  }
  return { width: def.width, height: def.height, rgba };
}

export function flat(wad: Wad, name: string, pal: Palette): Image {
  const lump = wad.namespace("F").find((l) => l.name === name);
  if (!lump) throw new Error(`flat ${name} not in the WAD`);
  return decodeFlat(lump.bytes, pal);
}

function ranges(order: string[], table: [string, string][]): string[][] {
  const out: string[][] = [];
  for (const [first, last] of table) {
    const a = order.indexOf(first), b = order.indexOf(last);
    if (a < 0 || b < 0) continue;
    if (b <= a) throw new Error(`animation ${first}..${last} is out of order in the WAD`);
    out.push(order.slice(a, b + 1));
  }
  return out;
}

// Everything a set of levels shows: the named textures and flats, every frame
// of an animation one of them is in, and the other state of each switch.
export function closure(wad: Wad, textures: Set<string>, flats: Set<string>) {
  const defs = textureDefs(wad);
  const textureOrder = defs.map((d) => d.name);
  const flatOrder = wad.namespace("F").map((l) => l.name);
  const textureAnims = ranges(textureOrder, ANIMATED_TEXTURES).filter((r) => r.some((n) => textures.has(n)));
  const flatAnims = ranges(flatOrder, ANIMATED_FLATS).filter((r) => r.some((n) => flats.has(n)));
  for (const r of textureAnims) r.forEach((n) => textures.add(n));
  for (const r of flatAnims) r.forEach((n) => flats.add(n));
  const switches: [string, string][] = [];
  for (const n of [...textures]) {
    const m = /^SW([12])(.*)$/.exec(n);
    if (!m) continue;
    const other = `SW${m[1] === "1" ? "2" : "1"}${m[2]}`;
    if (!textureOrder.includes(other)) throw new Error(`switch ${n} has no ${other} in the WAD`);
    textures.add(other);
    const pair: [string, string] = m[1] === "1" ? [n, other] : [other, n];
    if (!switches.some(([a]) => a === pair[0])) switches.push(pair);
  }
  for (const n of textures) if (!textureOrder.includes(n)) throw new Error(`texture ${n} not in the WAD`);
  for (const n of flats) if (!flatOrder.includes(n)) throw new Error(`flat ${n} not in the WAD`);
  return {
    defs: defs.filter((d) => textures.has(d.name)),
    flats: [...flats].sort(),
    animations: { textures: textureAnims, flats: flatAnims },
    switches: switches.sort(([a], [b]) => a.localeCompare(b)),
  };
}
