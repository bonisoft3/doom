import { assertEquals, assert, assertThrows } from "@std/assert";
import "./engine_fixtures.ts";
import { doomKineticEngine } from "../shell/engine/simulation.js";
import { WEAPONS } from "../shell/engine/weapons.js";
import { createKineticHost } from "/omnishell/interpreter/kinetic.js";

Deno.test("kinetic-engine: saveState and loadState satisfy algebraic isomorphism", () => {
  const state0 = doomKineticEngine.initState(0x1337);
  const snapshot = doomKineticEngine.saveState(state0);
  const loaded = doomKineticEngine.loadState(snapshot);

  assertEquals(loaded, state0);
  assertEquals(doomKineticEngine.saveState(loaded), snapshot);
});

Deno.test("kinetic-engine: state remains JSON-safe without NaN or undefined under random inputs", () => {
  let state = doomKineticEngine.initState(0xCAFE);
  const inputs = [
    { forward: true, turnLeft: true, rotDelta: 0.05 },
    { fire: true, backward: true },
    { strafeLeft: true, rotDelta: -0.02 },
    { strafeRight: true, reload: true }
  ];

  for (const input of inputs) {
    state = doomKineticEngine.advanceFrame(state, input);
    const jsonStr = doomKineticEngine.saveState(state);
    assert(!jsonStr.includes("NaN"), "Serialized state must not contain NaN");
    assert(!jsonStr.includes("null"), "Serialized state must not contain null fields");
    const reloaded = doomKineticEngine.loadState(jsonStr);
    assertEquals(reloaded.tick, state.tick);
  }
});

Deno.test("kinetic-engine: advanceFrame is referentially transparent (deterministic)", () => {
  const seed = 0x5EED;
  const stateA0 = doomKineticEngine.initState(seed);
  const stateB0 = doomKineticEngine.initState(seed);

  let stateA = stateA0;
  let stateB = stateB0;

  for (let i = 0; i < 20; i++) {
    const input = { forward: i % 2 === 0, fire: i === 5 || i === 12, turnLeft: i % 3 === 0 };
    stateA = doomKineticEngine.advanceFrame(stateA, input);
    stateB = doomKineticEngine.advanceFrame(stateB, input);
    assertEquals(stateA, stateB);
  }
});

Deno.test("kinetic-engine: rollback invariance — rewinding, loading snapshot and re-simulating yields bit-exact state", () => {
  const host = createKineticHost({
    engine: doomKineticEngine,
    rateHz: 35,
    seed: 0x9999,
    historyLimit: 100
  });

  const script = [
    { forward: true },
    { forward: true, turnLeft: true },
    { fire: true },
    { backward: true },
    { strafeRight: true }
  ];

  for (const cmd of script) {
    host.stepTick(cmd);
  }

  const liveState = host.getState();
  const liveTick = host.getCurrentTick();

  // Seek back to tick 2 and get snapshot
  const pastState = host.seek(2);
  assertEquals(host.getDisplayTick(), 2);
  assertEquals(pastState.tick, 2);

  // Restore snapshot and re-simulate to liveTick using recorded inputs
  let replayed = pastState;
  for (let t = 3; t <= liveTick; t++) {
    replayed = doomKineticEngine.advanceFrame(replayed, host.getInputLog(t));
  }

  assertEquals(replayed, liveState);
});

Deno.test("kinetic-engine: replay from input log reconstructs live head bit-for-bit", () => {
  const host = createKineticHost({
    engine: doomKineticEngine,
    rateHz: 35,
    seed: 0xBEEF,
    historyLimit: 50
  });

  const inputs = [
    { forward: true },
    { turnRight: true, rotDelta: 0.04 },
    { fire: true },
    { strafeLeft: true },
    { forward: true }
  ];

  for (const cmd of inputs) {
    host.stepTick(cmd);
  }

  const headState = host.getState();
  const headTick = host.getCurrentTick();

  let replayed = doomKineticEngine.initState(0xBEEF);
  for (let t = 1; t <= headTick; t++) {
    const recordedInput = host.getInputLog(t);
    replayed = doomKineticEngine.advanceFrame(replayed, recordedInput);
  }

  assertEquals(replayed, headState);
});

Deno.test("kinetic-engine: host branching on alternate timeline forks deterministically", () => {
  const host = createKineticHost({
    engine: doomKineticEngine,
    rateHz: 35,
    seed: 42,
    historyLimit: 50
  });

  for (let i = 0; i < 15; i++) {
    host.stepTick({ forward: true });
  }

  // Branch at tick 10
  host.branch(10);
  assertEquals(host.getCurrentTick(), 10);

  // Advance on alternate timeline
  host.stepTick({ fire: true });
  assertEquals(host.getCurrentTick(), 11);
  assertEquals(host.getState().player.shootTimer, WEAPONS.pistol.cooldown);

  // Branching out of bounds throws RangeError (fail-loud)
  assertThrows(() => host.branch(9999), RangeError);
  assertThrows(() => host.branch(-1), RangeError);
});

Deno.test("kinetic-engine: pause cancels loop and play resumes frame progression", () => {
  let scheduledFn: ((now: number) => void) | null = null;
  let scheduledId = 0;
  let cancelledId: number | null = null;

  const schedule = (fn: (now: number) => void) => {
    scheduledFn = fn;
    return ++scheduledId;
  };
  const cancel = (id: number) => {
    cancelledId = id;
    scheduledFn = null;
  };

  const host = createKineticHost({
    engine: doomKineticEngine,
    rateHz: 35,
    schedule,
    cancel
  });

  host.start();
  assertEquals(scheduledId, 1);

  // Initial rAF timestamp establishes lastTime
  scheduledFn!(100);
  assertEquals(host.getCurrentTick(), 0);

  // Subsequent frame advances tick
  scheduledFn!(135);
  assertEquals(host.getCurrentTick(), 1);

  // Pause cancels the scheduled id
  host.pause();
  assert(cancelledId !== null);

  // Play resumes scheduling
  host.play();
  assert(scheduledFn !== null);

  const resumeFn = scheduledFn as ((now: number) => void);
  resumeFn(200);
  resumeFn(235);
  assertEquals(host.getCurrentTick(), 2);

  host.stop();
});

Deno.test("kinetic-engine: pump clamps frame delta to 250ms (spiral-of-death guard)", () => {
  let steppedTicks = 0;
  const host = createKineticHost({
    engine: doomKineticEngine,
    rateHz: 35,
    onStep: () => {
      steppedTicks++;
    }
  });

  host.play();
  host.pump(1000);
  assertEquals(steppedTicks, 8);
  assertEquals(host.getCurrentTick(), 8);
});
