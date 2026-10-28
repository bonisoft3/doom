import { assert, assertEquals } from "@std/assert";
import { episode, level } from "./engine_fixtures.ts";

// Every module the simulation reaches, dependencies first.
const ENGINE = [
  "constants", "catalog", "level", "sectors", "collide", "trace", "monsters_table", "combat", "noise",
  "movers", "projectiles", "weapons", "player", "monsters", "actors", "simulation",
];
const source = (m: string) => Deno.readTextFileSync(new URL(`../shell/engine/${m}.js`, import.meta.url));

Deno.test("the engine's module list covers every import the simulation reaches", () => {
  const seen = new Set<string>();
  const visit = (m: string) => {
    if (seen.has(m)) return;
    seen.add(m);
    for (const [, dep] of source(m).matchAll(/from\s*"\.\/([a-z_]+)\.js"/g)) visit(dep);
  };
  visit("simulation");
  assertEquals([...seen].sort(), [...ENGINE].sort());
});

Deno.test("the engine reaches no ambient authority (rollback and replay depend on it)", () => {
  for (const m of ENGINE) {
    const code = source(m).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    for (const name of ["Math\\.random", "Date", "performance", "window", "document", "globalThis",
                        "setTimeout", "setInterval", "requestAnimationFrame", "crypto", "fetch"]) {
      assert(!new RegExp(`\\b${name}\\b`).test(code), `ambient ${name} in ${m}.js`);
    }
  }
});

Deno.test("the engine runs inside an SES Compartment with only the PRNG endowed", async () => {
  const { ensureSes, evaluateCaged } = await import("../omnishell/interpreter/jessie.js");
  await ensureSes();
  const script = ENGINE.map((m) => source(m)
    .replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, "")
    .replace(/^[ \t]*export[ \t]+/gm, "")
    .replace(/^export \{[^}]*\};?$/gm, "")).join("\n") +
    "\nregisterEpisode(EPISODE);\nregisterLevel(LEVEL);\nharden(doomKineticEngine);\ndoomKineticEngine;";
  const { prngStep } = await import("../omnishell/interpreter/kinetic.js");
  // deno-lint-ignore no-explicit-any
  const engine = (await evaluateCaged(script, { prngStep, EPISODE: episode, LEVEL: level("e1m1") })) as any;
  let w = engine.initState(0x1337);
  for (let i = 0; i < 10; i++) w = engine.advanceFrame(w, { forward: true, fire: true });
  assertEquals(w.seed, 0x1337);
  assertEquals(w.tick, 10);
});
