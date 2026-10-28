export interface Lump {
  name: string;
  bytes: Uint8Array;
}

export interface Wad {
  lumps: Lump[];
  lump(name: string): Uint8Array;
  has(name: string): boolean;
  // The ten lumps that follow a map marker, by name.
  mapLumps(marker: string): Record<string, Uint8Array>;
  // Lumps between a namespace's START and END markers (S_, P_, F_), nested
  // namespaces (P1_START…) included, markers excluded.
  namespace(prefix: string): Lump[];
}

const MAP_LUMPS = ["THINGS", "LINEDEFS", "SIDEDEFS", "VERTEXES", "SEGS", "SSECTORS", "NODES", "SECTORS", "REJECT", "BLOCKMAP"];

export function name8(bytes: Uint8Array, offset: number): string {
  let s = "";
  for (let i = 0; i < 8; i++) {
    const c = bytes[offset + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.toUpperCase();
}

export function parseWad(bytes: Uint8Array): Wad {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ident = String.fromCharCode(...bytes.subarray(0, 4));
  if (ident !== "IWAD" && ident !== "PWAD") throw new Error(`wad: bad identifier ${ident}`);
  const count = view.getInt32(4, true);
  const dir = view.getInt32(8, true);
  const lumps: Lump[] = [];
  for (let i = 0; i < count; i++) {
    const at = dir + i * 16;
    const pos = view.getInt32(at, true);
    const size = view.getInt32(at + 4, true);
    lumps.push({ name: name8(bytes, at + 8), bytes: bytes.subarray(pos, pos + size) });
  }
  // The last lump of a name wins, as in the engine's lookup.
  const byName = new Map<string, Lump>();
  for (const l of lumps) byName.set(l.name, l);
  const index = (name: string) => {
    const i = lumps.findIndex((l) => l.name === name);
    if (i < 0) throw new Error(`wad: no lump ${name}`);
    return i;
  };
  return {
    lumps,
    has: (name) => byName.has(name),
    lump(name) {
      const l = byName.get(name);
      if (!l) throw new Error(`wad: no lump ${name}`);
      return l.bytes;
    },
    mapLumps(marker) {
      const at = index(marker);
      const out: Record<string, Uint8Array> = {};
      MAP_LUMPS.forEach((n, k) => {
        const l = lumps[at + 1 + k];
        if (!l || l.name !== n) throw new Error(`wad: ${marker} lump ${k + 1} is ${l?.name}, expected ${n}`);
        out[n] = l.bytes;
      });
      return out;
    },
    namespace(prefix) {
      const start = index(`${prefix}_START`);
      const end = index(`${prefix}_END`);
      return lumps.slice(start + 1, end).filter((l) => !/_(START|END)$/.test(l.name));
    },
  };
}
