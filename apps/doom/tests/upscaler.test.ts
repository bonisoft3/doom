import { assertEquals, assert } from "@std/assert";
import { xbrzScale, xbrzColorFormat, xbrzConfig } from "../shell/units/upscaler/xbrz.js";

Deno.test("upscaler: xbrzScale scales 4x4 image to 8x8 with 2x factor", () => {
  const config = xbrzConfig();
  const w = 4;
  const h = 4;
  const scale = 2;
  const src = new Uint32Array(w * h).fill(0xFF112233);
  const dst = new Uint32Array(w * scale * h * scale);

  xbrzScale(scale, src, dst, w, h, xbrzColorFormat.argb, config);

  assertEquals(dst.length, 64);
  assert(dst[0] !== 0);
});

Deno.test("upscaler: xbrzScale scales 4x4 image to 12x12 with 3x factor", () => {
  const config = xbrzConfig();
  const w = 4;
  const h = 4;
  const scale = 3;
  const src = new Uint32Array(w * h).fill(0xFFAABBCC);
  const dst = new Uint32Array(w * scale * h * scale);

  xbrzScale(scale, src, dst, w, h, xbrzColorFormat.argb, config);

  assertEquals(dst.length, 144);
  assert(dst[0] !== 0);
});

Deno.test("upscaler: NOTICE.md checksums match vendored files", async () => {
  const notice = await Deno.readTextFile(new URL("../shell/units/upscaler/NOTICE.md", import.meta.url));
  const xbrzBytes = await Deno.readFile(new URL("../shell/units/upscaler/xbrz.js", import.meta.url));
  const licenseBytes = await Deno.readFile(new URL("../shell/units/upscaler/LICENSE", import.meta.url));

  const hexOf = async (b: Uint8Array) => {
    const hash = await crypto.subtle.digest("SHA-256", b as unknown as BufferSource);
    return Array.from(new Uint8Array(hash)).map((x) => x.toString(16).padStart(2, "0")).join("");
  };

  const xbrzSha = await hexOf(xbrzBytes);
  const licenseSha = await hexOf(licenseBytes);

  assert(notice.includes(xbrzSha), `NOTICE.md must contain xbrz.js sha256 (${xbrzSha})`);
  assert(notice.includes(licenseSha), `NOTICE.md must contain LICENSE sha256 (${licenseSha})`);
});
