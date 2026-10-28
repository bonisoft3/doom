import { assertEquals, assertThrows } from "@std/assert";
import { evaluateRole } from "../omnishell/interpreter/jessie.js";

const source = Deno.readTextFileSync(new URL("../shell/handlers/referee.js", import.meta.url));
// deno-lint-ignore no-explicit-any
const reduce = (await evaluateRole(source, "handler")) as (state: any, action: any) => any;

Deno.test("referee rejects missing match row", () => {
  assertThrows(() => reduce(null, { type: "START" }), Error);
  assertThrows(() => reduce(null, { type: "FRAG" }), Error);
});

Deno.test("referee START transitions from warmup to active", () => {
  const state = { frags_us: 0, frags_them: 0, frag_limit: 10, status: "warmup" };
  const next = reduce(state, { type: "START" });
  assertEquals(next.status, "active");

  assertThrows(() => reduce(next, { type: "START" }));
});

Deno.test("referee tracks frags for player and opponent", () => {
  let state = { frags_us: 0, frags_them: 0, frag_limit: 10, status: "active" };

  state = reduce(state, { type: "FRAG", killer: "us", victim: "Imp", weapon: "shotgun" });
  assertEquals(state.frags_us, 1);
  assertEquals(state.frags_them, 0);
  assertEquals(state.status, "active");

  state = reduce(state, { type: "FRAG", killer: "them", victim: "Doomguy", weapon: "chaingun" });
  assertEquals(state.frags_us, 1);
  assertEquals(state.frags_them, 1);
  assertEquals(state.status, "active");
});

Deno.test("referee terminates match and sets winner when frag limit is reached", () => {
  const state = { frags_us: 9, frags_them: 5, frag_limit: 10, status: "active" };
  const next = reduce(state, { type: "FRAG", killer: "us", victim: "Zombie", weapon: "pistol" });

  assertEquals(next.frags_us, 10);
  assertEquals(next.status, "over");
  assertEquals(next.winner, "us");

  // FRAG after match is over throws (invariant violation)
  assertThrows(() => reduce(next, { type: "FRAG", killer: "us" }));
});

Deno.test("referee rejects unknown killer and unknown action type", () => {
  const state = { frags_us: 0, frags_them: 0, frag_limit: 10, status: "active" };
  assertThrows(() => reduce(state, { type: "FRAG", killer: "spectator" }), RangeError);
  assertThrows(() => reduce(state, { type: "INVALID_ACTION" }), TypeError);
});

Deno.test("referee handles RESET event back to warmup", () => {
  const state = { frags_us: 10, frags_them: 8, status: "over", winner: "us" };
  const next = reduce(state, { type: "RESET", frag_limit: 20 });

  assertEquals(next.frags_us, 0);
  assertEquals(next.frags_them, 0);
  assertEquals(next.frag_limit, 20);
  assertEquals(next.status, "warmup");
  assertEquals(next.winner, "");
});

Deno.test("referee maps click events to lifecycle transitions and rejects unknown clicks", () => {
  const warmupMatch = { id: "match-99", frags_us: 0, frags_them: 0, frag_limit: 10, status: "warmup", winner: "" };
  const started = reduce(warmupMatch, { type: "click", from: "btn-start" });
  assertEquals(started.status, "active");

  const overMatch = { id: "match-99", frags_us: 10, frags_them: 8, frag_limit: 10, status: "over", winner: "us" };
  const reset = reduce(overMatch, { type: "click", from: "btn-rematch" });
  assertEquals(reset.status, "warmup");
  assertEquals(reset.frags_us, 0);
  assertEquals(reset.frags_them, 0);

  assertThrows(
    () => reduce(warmupMatch, { type: "click", from: "btn-unknown" }),
    TypeError,
    "referee: unhandled click from btn-unknown"
  );
  assertThrows(
    () => reduce(warmupMatch, { type: "click" }),
    TypeError,
    "referee: unhandled click from undefined"
  );
  assertThrows(
    () => reduce(warmupMatch, { type: "UNKNOWN_ACTION" }),
    TypeError,
    "referee: unknown action type UNKNOWN_ACTION"
  );
});

// The simulation ends a campaign on the player's first death; a referee that
// waited for frag_limit kept the relational match active and the bridge died
// on the score divergence 18s into E1M1.
Deno.test("referee ends a campaign on the player's death, whatever the frag limit", () => {
  const state = { mode: "campaign", frags_us: 100, frags_them: 0, frag_limit: 100, status: "active" };
  const kill = reduce({ ...state, frags_us: 3 }, { type: "FRAG", killer: "us", victim: "Imp", weapon: "pistol" });
  assertEquals(kill.status, "active");

  const death = reduce(state, { type: "FRAG", killer: "them", victim: "Doomguy", weapon: "claw" });
  assertEquals(death.status, "over");
  assertEquals(death.winner, "them");
});
