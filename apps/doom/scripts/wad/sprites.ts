import type { Wad } from "./wad.ts";
import { decodePicture, type Palette, type Picture } from "./picture.ts";

// A sprite frame seen from the front: rotation 1, or 0 for frames drawn the
// same from every angle.
export interface Frame {
  name: string;
  picture: Picture;
}

// Every front-facing frame of the given four-letter sprite prefixes.
export function frontFrames(wad: Wad, prefixes: Set<string>, pal: Palette): Frame[] {
  const out: Frame[] = [];
  const seen = new Set<string>();
  for (const l of wad.namespace("S")) {
    const prefix = l.name.slice(0, 4);
    if (!prefixes.has(prefix)) continue;
    // Name: PPPP F R [F R]; the second pair is the mirrored rotation.
    for (let at = 4; at + 1 < l.name.length; at += 2) {
      const frame = l.name[at], rot = l.name[at + 1];
      if (rot !== "0" && rot !== "1") continue;
      const name = prefix + frame;
      if (seen.has(name)) throw new Error(`sprite ${name} has two front-facing lumps`);
      seen.add(name);
      out.push({ name, picture: decodePicture(l.bytes, pal) });
    }
  }
  for (const p of prefixes) if (![...seen].some((n) => n.startsWith(p))) throw new Error(`sprite ${p} has no front-facing frames`);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
