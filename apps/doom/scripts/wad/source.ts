import { unzipSync } from "fflate";
import { parseWad, type Wad } from "./wad.ts";

const RELEASE = {
  url: "https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip",
  sha256: "3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59",
  entry: "freedoom-0.13.0/freedoom1.wad",
};

const CACHE = new URL("../.cache/freedoom-0.13.0.zip", import.meta.url);

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The pinned FreeDoom release, downloaded once and verified on every read.
export async function freedoom1(): Promise<Wad> {
  let zip: Uint8Array;
  try {
    zip = await Deno.readFile(CACHE);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
    const res = await fetch(RELEASE.url);
    if (!res.ok) throw new Error(`freedoom: ${RELEASE.url} answered ${res.status}`);
    zip = new Uint8Array(await res.arrayBuffer());
    await Deno.mkdir(new URL(".", CACHE), { recursive: true });
    await Deno.writeFile(CACHE, zip);
  }
  const got = await sha256(zip);
  if (got !== RELEASE.sha256) throw new Error(`freedoom: ${CACHE.pathname} has sha256 ${got}, expected ${RELEASE.sha256}`);
  const files = unzipSync(zip, { filter: (f) => f.name === RELEASE.entry });
  const wad = files[RELEASE.entry];
  if (!wad) throw new Error(`freedoom: ${RELEASE.entry} missing from the release zip`);
  return parseWad(wad);
}
