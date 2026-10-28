// Doom picture format, flats and PNG output. Images are RGBA; a transparent
// pixel has alpha 0.

export interface Image {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface Picture extends Image {
  left: number;
  top: number;
}

export type Palette = Uint8Array;

export function decodePicture(bytes: Uint8Array, palette: Palette): Picture {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = v.getUint16(0, true);
  const height = v.getUint16(2, true);
  const left = v.getInt16(4, true);
  const top = v.getInt16(6, true);
  if (width === 0 || height === 0 || 8 + width * 4 > bytes.length) throw new Error(`picture: bad header ${width}x${height}`);
  const rgba = new Uint8Array(width * height * 4);
  for (let x = 0; x < width; x++) {
    let at = v.getUint32(8 + x * 4, true);
    // Posts: topdelta, length, pad, pixels…, pad; 0xFF ends the column.
    for (;;) {
      if (at >= bytes.length) throw new Error(`picture: column ${x} runs past the lump`);
      const top = bytes[at];
      if (top === 0xFF) break;
      const length = bytes[at + 1];
      for (let j = 0; j < length; j++) {
        const y = top + j;
        if (y >= height) continue;
        const c = bytes[at + 3 + j];
        const p = (y * width + x) * 4;
        rgba[p] = palette[c * 3];
        rgba[p + 1] = palette[c * 3 + 1];
        rgba[p + 2] = palette[c * 3 + 2];
        rgba[p + 3] = 255;
      }
      at += length + 4;
    }
  }
  return { width, height, left, top, rgba };
}

export function decodeFlat(bytes: Uint8Array, palette: Palette): Image {
  if (bytes.length < 4096) throw new Error(`flat: ${bytes.length} bytes, expected 4096`);
  const rgba = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 4096; i++) {
    const c = bytes[i];
    rgba[i * 4] = palette[c * 3];
    rgba[i * 4 + 1] = palette[c * 3 + 1];
    rgba[i * 4 + 2] = palette[c * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  return { width: 64, height: 64, rgba };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(parts: Uint8Array[]): number {
  let c = 0xFFFFFFFF;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePng(img: Image): Promise<Uint8Array> {
  const raw = new Uint8Array(img.height * (img.width * 4 + 1));
  for (let y = 0; y < img.height; y++) {
    raw.set(img.rgba.subarray(y * img.width * 4, (y + 1) * img.width * 4), y * (img.width * 4 + 1) + 1);
  }
  const chunk = (type: string, data: Uint8Array) => {
    const t = new TextEncoder().encode(type);
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(t, 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32([t, data]));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, img.width);
  hv.setUint32(4, img.height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
