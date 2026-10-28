import { assert } from "@std/assert";
import { episode, level } from "./engine_fixtures.ts";
import { solve } from "./route_solver.ts";

// Each level's exit must be reachable from its start through the routes the
// map was built with: keys, doors, lifts, floor triggers and teleporters.
for (const { name } of episode.levels) {
  Deno.test(`${name}: the exit is reachable from the start`, () => {
    const route = solve(level(name));
    assert(route.exits.has("normal"), `${name}: reached ${route.reached.size} sectors, keys [${[...route.keys]}], no exit`);
  });
}

Deno.test("e1m3: the secret exit to E1M9 is reachable", () => {
  assert(solve(level("e1m3")).exits.has("secret"));
});
