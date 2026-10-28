import { name8, type Wad } from "./wad.ts";
import { LINE_SPECIALS, SECTOR_SPECIALS, THING_TYPES } from "../../shell/engine/catalog.js";

export type Point = [number, number];

export interface Level {
  format: 2;
  name: string;
  title: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  vertices: Point[];
  lines: { v1: number; v2: number; flags: number; special: number; tag: number; front: number; back: number }[];
  sides: { sector: number; xoff: number; yoff: number; upper: string; middle: string; lower: string }[];
  sectors: { floor: number; ceil: number; floorFlat: string; ceilFlat: string; light: number; special: number; tag: number }[];
  things: { type: number; x: number; y: number; angle: number; flags: number }[];
  // A child >= 0 is a node index; a child < 0 is subsector -(child + 1).
  nodes: { x: number; y: number; dx: number; dy: number; right: number; left: number }[];
  subsectors: { sector: number; polygon: Point[] }[];
  blockmap: { x: number; y: number; size: number; cols: number; rows: number; cells: number[][] };
}

const NONE = 0xFFFF;
const BLOCK = 128;
const EPS = 1e-6;

const texture = (bytes: Uint8Array, at: number) => {
  const n = name8(bytes, at);
  return n === "-" ? "" : n;
};

function records<T>(bytes: Uint8Array, size: number, read: (v: DataView, at: number) => T): T[] {
  if (bytes.length % size !== 0) throw new Error(`level: lump of ${bytes.length} bytes is not a multiple of ${size}`);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: T[] = [];
  for (let at = 0; at < bytes.length; at += size) out.push(read(v, at));
  return out;
}

// cross(d, p - o): negative on the right of the directed line o + t·d.
const side = (ox: number, oy: number, dx: number, dy: number, p: Point) => dx * (p[1] - oy) - dy * (p[0] - ox);

// Keeps the part of a convex polygon where keep(side) holds (Sutherland–Hodgman).
export function clipPolygon(poly: Point[], ox: number, oy: number, dx: number, dy: number, keepRight: boolean): Point[] {
  const out: Point[] = [];
  const inside = (p: Point) => (keepRight ? side(ox, oy, dx, dy, p) <= EPS : side(ox, oy, dx, dy, p) >= -EPS);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const sa = side(ox, oy, dx, dy, a);
      const sb = side(ox, oy, dx, dy, b);
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// Whether segment a–b touches the axis-aligned box (Liang–Barsky).
function segmentHitsBox(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

const round3 = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

export function decodeLevel(wad: Wad, marker: string, title: string): Level {
  const L = wad.mapLumps(marker);
  const vertices = records(L.VERTEXES, 4, (v, at): Point => [v.getInt16(at, true), v.getInt16(at + 2, true)]);
  const sectors = records(L.SECTORS, 26, (v, at) => ({
    floor: v.getInt16(at, true),
    ceil: v.getInt16(at + 2, true),
    floorFlat: texture(L.SECTORS, at + 4),
    ceilFlat: texture(L.SECTORS, at + 12),
    light: v.getInt16(at + 20, true),
    special: v.getInt16(at + 22, true),
    tag: v.getInt16(at + 24, true),
  }));
  const sides = records(L.SIDEDEFS, 30, (v, at) => ({
    sector: v.getUint16(at + 28, true),
    xoff: v.getInt16(at, true),
    yoff: v.getInt16(at + 2, true),
    upper: texture(L.SIDEDEFS, at + 4),
    lower: texture(L.SIDEDEFS, at + 12),
    middle: texture(L.SIDEDEFS, at + 20),
  }));
  const lines = records(L.LINEDEFS, 14, (v, at) => {
    const front = v.getUint16(at + 10, true);
    const back = v.getUint16(at + 12, true);
    return {
      v1: v.getUint16(at, true),
      v2: v.getUint16(at + 2, true),
      flags: v.getUint16(at + 4, true),
      special: v.getUint16(at + 6, true),
      tag: v.getUint16(at + 8, true),
      front,
      back: back === NONE ? -1 : back,
    };
  });
  const things = records(L.THINGS, 10, (v, at) => ({
    x: v.getInt16(at, true),
    y: v.getInt16(at + 2, true),
    angle: v.getInt16(at + 4, true),
    type: v.getInt16(at + 6, true),
    flags: v.getInt16(at + 8, true),
  }));
  const segs = records(L.SEGS, 12, (v, at) => ({
    v1: v.getUint16(at, true),
    v2: v.getUint16(at + 2, true),
    line: v.getUint16(at + 6, true),
    direction: v.getInt16(at + 8, true),
  }));
  const ssectors = records(L.SSECTORS, 4, (v, at) => ({ count: v.getUint16(at, true), first: v.getUint16(at + 2, true) }));
  const child = (c: number) => (c & 0x8000 ? -((c & 0x7FFF) + 1) : c);
  const nodes = records(L.NODES, 28, (v, at) => ({
    x: v.getInt16(at, true),
    y: v.getInt16(at + 2, true),
    dx: v.getInt16(at + 4, true),
    dy: v.getInt16(at + 6, true),
    right: child(v.getUint16(at + 24, true)),
    left: child(v.getUint16(at + 26, true)),
  }));

  validate(marker, { vertices, sectors, sides, lines, things, segs, ssectors, nodes });

  const xs = vertices.map((p) => p[0]);
  const ys = vertices.map((p) => p[1]);
  const bounds = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };

  const subsectors: Level["subsectors"] = ssectors.map((ss) => {
    const seg = segs[ss.first];
    const line = lines[seg.line];
    const sideIndex = seg.direction === 0 ? line.front : line.back;
    if (sideIndex < 0) throw new Error(`level ${marker}: subsector seg on the missing side of line ${seg.line}`);
    return { sector: sides[sideIndex].sector, polygon: [] };
  });

  const pad = 64;
  const box: Point[] = [
    [bounds.minX - pad, bounds.minY - pad], [bounds.maxX + pad, bounds.minY - pad],
    [bounds.maxX + pad, bounds.maxY + pad], [bounds.minX - pad, bounds.maxY + pad],
  ];
  const walk = (c: number, poly: Point[]) => {
    if (c < 0) {
      const i = -c - 1;
      const ss = ssectors[i];
      let p = poly;
      for (let k = 0; k < ss.count; k++) {
        const s = segs[ss.first + k];
        const a = vertices[s.v1], b = vertices[s.v2];
        p = clipPolygon(p, a[0], a[1], b[0] - a[0], b[1] - a[1], true);
      }
      subsectors[i].polygon = p.map(([x, y]) => [round3(x), round3(y)]);
      return;
    }
    const n = nodes[c];
    walk(n.right, clipPolygon(poly, n.x, n.y, n.dx, n.dy, true));
    walk(n.left, clipPolygon(poly, n.x, n.y, n.dx, n.dy, false));
  };
  walk(nodes.length - 1, box);

  const bx = Math.floor(bounds.minX) - 8;
  const by = Math.floor(bounds.minY) - 8;
  const cols = Math.ceil((bounds.maxX - bx + 1) / BLOCK);
  const rows = Math.ceil((bounds.maxY - by + 1) / BLOCK);
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  lines.forEach((l, i) => {
    const a = vertices[l.v1], b = vertices[l.v2];
    const c0 = Math.floor((Math.min(a[0], b[0]) - bx) / BLOCK), c1 = Math.floor((Math.max(a[0], b[0]) - bx) / BLOCK);
    const r0 = Math.floor((Math.min(a[1], b[1]) - by) / BLOCK), r1 = Math.floor((Math.max(a[1], b[1]) - by) / BLOCK);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x0 = bx + c * BLOCK, y0 = by + r * BLOCK;
        if (segmentHitsBox(a, b, x0, y0, x0 + BLOCK, y0 + BLOCK)) cells[r * cols + c].push(i);
      }
    }
  });

  return {
    format: 2,
    name: marker.toLowerCase(),
    title,
    bounds,
    vertices,
    lines,
    sides,
    sectors,
    things,
    nodes,
    subsectors,
    blockmap: { x: bx, y: by, size: BLOCK, cols, rows, cells },
  };
}

function validate(marker: string, m: {
  vertices: Point[];
  sectors: { special: number }[];
  sides: { sector: number }[];
  lines: { v1: number; v2: number; special: number; front: number; back: number }[];
  things: { type: number }[];
  segs: { v1: number; v2: number; line: number }[];
  ssectors: { count: number; first: number }[];
  nodes: unknown[];
}) {
  const fail = (msg: string) => { throw new Error(`level ${marker}: ${msg}`); };
  m.lines.forEach((l, i) => {
    if (!m.vertices[l.v1] || !m.vertices[l.v2]) fail(`line ${i} references a missing vertex`);
    if (!m.sides[l.front]) fail(`line ${i} has no front side`);
    if (l.back >= 0 && !m.sides[l.back]) fail(`line ${i} references missing back side ${l.back}`);
    if (l.special && !(l.special in LINE_SPECIALS)) fail(`line ${i} uses unsupported special ${l.special}`);
  });
  m.sides.forEach((s, i) => { if (!m.sectors[s.sector]) fail(`side ${i} references missing sector ${s.sector}`); });
  m.sectors.forEach((s, i) => { if (s.special && !(s.special in SECTOR_SPECIALS)) fail(`sector ${i} uses unsupported special ${s.special}`); });
  m.things.forEach((t, i) => { if (!(t.type in THING_TYPES)) fail(`thing ${i} has unsupported type ${t.type}`); });
  m.segs.forEach((s, i) => { if (!m.vertices[s.v1] || !m.vertices[s.v2] || !m.lines[s.line]) fail(`seg ${i} references missing data`); });
  m.ssectors.forEach((s, i) => { if (s.count === 0 || !m.segs[s.first + s.count - 1]) fail(`subsector ${i} has no segs`); });
  if (m.nodes.length === 0) fail("has no BSP nodes");
}
