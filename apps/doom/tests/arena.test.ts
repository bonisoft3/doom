import { assertEquals, assert } from "@std/assert";
import { parseHTML } from "linkedom";

const ARENA_HTML_PATH = new URL("../shell/screens/arena.html", import.meta.url);

function loadArenaDoc() {
  const html = Deno.readTextFileSync(ARENA_HTML_PATH);
  const dom = parseHTML(html) as unknown as { document: Document };
  return { document: dom.document, html };
}

Deno.test("accept-instant-arena: arena mounts viewport canvas and status bar", () => {
  const { document } = loadArenaDoc();
  const screen = document.querySelector('.screen[data-screen="arena"]');
  assert(screen !== null, "Arena screen element must exist");

  const canvas = document.getElementById("renderCanvas");
  assert(canvas !== null, "3D viewport canvas must exist");
  assertEquals(canvas.getAttribute("aria-label"), "Arena 3D Viewport");
});

Deno.test("accept-status-hud: ammo, health, armor and arms status displays exist", () => {
  const { document } = loadArenaDoc();
  const hud = document.querySelector(".doom-hud");
  assert(hud !== null, "Doom HUD status bar must exist");

  const ammo = hud.querySelector(".ammo-block .hud-value");
  assert(ammo !== null, "Ammo digital counter must exist");

  const health = hud.querySelector(".health-block .hud-value");
  assert(health !== null, "Health digital counter must exist");

  const armor = hud.querySelector(".armor-block .hud-value");
  assert(armor !== null, "Armor digital counter must exist");

  const arms = hud.querySelector(".arms-block .arms-grid");
  assert(arms !== null, "Arms matrix grid must exist");
});

Deno.test("accept-doomguy-face: mugshot face block renders with eyes, mouth and reactive attributes", () => {
  const { document } = loadArenaDoc();
  const face = document.querySelector(".doomguy-face") as HTMLElement;
  assert(face !== null, "Doomguy face mugshot element must exist");

  const leftEye = face.querySelector(".face-eye.left") as HTMLElement;
  const rightEye = face.querySelector(".face-eye.right") as HTMLElement;
  const mouth = face.querySelector(".face-mouth") as HTMLElement;

  assert(leftEye !== null, "Left eye must exist");
  assert(rightEye !== null, "Right eye must exist");
  assert(mouth !== null, "Mouth must exist");

  assertEquals(face.getAttribute("data-tier"), "{health_tier}");
  assertEquals(face.getAttribute("data-pain"), "{in_pain}");
  assertEquals(face.getAttribute("data-god"), "{is_god}");
});

Deno.test("accept-frag-feed: frag feed template supports dynamic kill registration", () => {
  const { document } = loadArenaDoc();
  const feed = document.querySelector(".frag-feed");
  assert(feed !== null, "Frag feed list must exist");

  const template = feed.querySelector("template[data-item]");
  assert(template !== null, "Frag feed template must exist");
  assert(template.innerHTML.includes("{killer}"), "template must bind killer");
  assert(template.innerHTML.includes("{weapon}"), "template must bind weapon");
  assert(template.innerHTML.includes("{victim}"), "template must bind victim");
});

Deno.test("accept-weapon-switch: arms grid reflects weapon possession slots 2 to 7", () => {
  const { document } = loadArenaDoc();
  const slots = document.querySelectorAll(".arms-grid .arm-slot");
  assertEquals(slots.length, 6, "Must have 6 weapon slots (2 to 7)");

  const slot2 = document.querySelector('.arm-slot[data-has="2"]');
  const slot3 = document.querySelector('.arm-slot[data-has="3"]');
  assert(slot2?.classList.contains("active"), "Slot 2 (Pistol) must be active initially");
  assert(slot3?.classList.contains("active"), "Slot 3 (Shotgun) must be active initially");
  for (const s of [4, 5, 6, 7]) {
    const slot = document.querySelector(`.arm-slot[data-has="${s}"]`);
    assert(slot !== null, `Slot ${s} must exist`);
    assert(!slot.classList.contains("active"), `Slot ${s} must be inactive initially`);
  }
});

Deno.test("accept-match-over: game over overlay displays winner and rematch affordance", () => {
  const { document } = loadArenaDoc();
  const overlay = document.querySelector(".overlay-game-over");
  assert(overlay !== null, "Game over overlay element must exist");

  const title = overlay.querySelector(".title-over");
  assert(title !== null, "Game over title must exist");

  const rematchBtn = document.getElementById("btn-rematch");
  assert(rematchBtn !== null, "Rematch button must exist");
  assertEquals(rematchBtn.textContent, "Outra Partida");
});

Deno.test("accept-offline: service worker script caches static assets and screen contains no unmanaged scripts", () => {
  const { html } = loadArenaDoc();
  const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
  for (const tag of scriptTags) {
    assert(tag.includes('type="application/json"'), `Unmanaged script tag detected: ${tag}`);
  }

  const swSrc = Deno.readTextFileSync(new URL("../offline-first-sw.js", import.meta.url));
  assert(swSrc.includes("ADDRESSED_CACHE"), "offline-first-sw.js must keep the release's addressed files");
  assert(swSrc.includes("ENTRY_CACHE"), "offline-first-sw.js must keep the entry a navigation paints offline");
  assert(swSrc.includes('addEventListener("install"'), "offline-first-sw.js must handle install event");
  assert(swSrc.includes('addEventListener("fetch"'), "offline-first-sw.js must handle fetch event for offline cache");
});
