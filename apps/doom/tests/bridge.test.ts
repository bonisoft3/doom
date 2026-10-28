import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { createDoomBridge, BridgeDisposedError } from "../shell/engine/bridge.js";
import { render3D } from "../shell/engine/renderer.js";
import { doomKineticEngine } from "../shell/engine/simulation.js";
import { facingLine, level } from "./engine_fixtures.ts";
import { evaluateRole } from "../omnishell/interpreter/jessie.js";

const refereeSource = Deno.readTextFileSync(new URL("../shell/handlers/referee.js", import.meta.url));
// deno-lint-ignore no-explicit-any
const referee = (await evaluateRole(refereeSource, "handler")) as (state: any, action: any) => any;
const defaultOnFatal = (_err: any) => {};

// Kills, a death and stat changes on command, so these tests exercise the
// bridge's relational bookkeeping without staging fights in a real level.
const scripted = {
  ...doomKineticEngine,
  advanceFrame(world: any, cmd: any = {}) {
    const { script, ...rest } = cmd;
    const next = doomKineticEngine.advanceFrame(world, rest);
    if (!script) return next;
    // The player acts before monsters within a tick: kills, then the death.
    for (let i = 0; i < (script.kills ?? 0); i++) {
      next.player.fragsUs += 1;
      next.events.push("demon-dead");
    }
    if (script.die) {
      next.player.health = 0;
      next.player.status = "over";
      next.player.fragsThem += 1;
      next.player.damageFlash = 6;
      next.events.push("player-dead");
    }
    if (script.stats) Object.assign(next.player, script.stats);
    return next;
  },
};
const KILL = { script: { kills: 1 } };
const neutral = (bridge: any, n: number) => { for (let i = 0; i < n; i++) bridge.host.stepTick(); };

function createMockStore(options: { failOnWrite?: boolean } = {}) {
  let failOnWrite = !!options.failOnWrite;
  const tables: Record<string, Record<string, any>> = {
    match: {},
    player: {},
    frag: {}
  };

  return {
    tables,
    setFailOnWrite(val: boolean) {
      failOnWrite = val;
    },
    async query(table: string, _order?: string, _opts: { filter?: string } = {}) {
      if (!tables[table]) return [];
      return Object.values(tables[table]);
    },
    async write(table: string, edits: Array<{ key: string; row: any }>, onRefused?: (err: any) => void) {
      if (failOnWrite) {
        const err = new Error("store: write refused");
        if (onRefused) onRefused(err);
        throw err;
      }
      if (!tables[table]) tables[table] = {};
      for (const e of edits) {
        tables[table][e.key] = { ...e.row };
      }
    },
    async add(table: string, rows: any[], onRefused?: (err: any) => void) {
      if (failOnWrite) {
        const err = new Error("store: add refused");
        if (onRefused) onRefused(err);
        throw err;
      }
      if (!tables[table]) tables[table] = {};
      for (const r of rows) {
        tables[table][r.id] = { ...r };
      }
    },
    async dropWhere(table: string, _filter: string, onRefused?: (err: any) => void) {
      if (failOnWrite) {
        const err = new Error("store: dropWhere refused");
        if (onRefused) onRefused(err);
        throw err;
      }
      tables[table] = {};
    }
  };
}

Deno.test("bridge: constructor enforces fail-loud invariants on store, referee, onFatal, and frag counts", () => {
  const store = createMockStore();
  assertThrows(() => createDoomBridge({ engine: scripted, store: null as any, referee, onFatal: defaultOnFatal }), TypeError);
  assertThrows(() => createDoomBridge({ engine: scripted, store: store as any, referee: null as any, onFatal: defaultOnFatal }), TypeError);
  assertThrows(() => createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: null as any }), TypeError);
  assertThrows(() => createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, initialFragCount: -1 }), TypeError);
  assertThrows(() => createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, initialFragCount: 1.5 as any }), TypeError);
  assertThrows(() => createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, epochTick: -5 }), TypeError);
});

Deno.test("bridge: exposes initial match and player states", () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal });

  const match = bridge.getMatch();
  assertEquals(match.status, "warmup");
  assertEquals(match.frags_us, 0);
  assertEquals(match.frags_them, 0);
  assertEquals(match.frag_limit, 10);

  const player = bridge.getPlayer();
  assertEquals(player.handle, "Doomguy");
  assertEquals(player.health, 100);
  assertEquals(player.armor, 0);
  assertEquals(player.health_tier, "healthy");
  assertEquals(player.weapon, "pistol");
});

Deno.test("bridge: demon-dead milestone creates Frag entity and updates Match entity via referee", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();

  neutral(bridge, 8);
  bridge.host.stepTick(KILL);
  await bridge.flush();

  // 1. Verify Frag entity created in store
  const fragEntries = Object.values(store.tables.frag);
  assertEquals(fragEntries.length, 1);
  assertEquals(fragEntries[0].killer, "Doomguy");
  assertEquals(fragEntries[0].victim, "Imp");
  assertEquals(fragEntries[0].weapon, "pistol");
  assertEquals(fragEntries[0].tick, 9);

  // 2. Verify Match entity updated via referee
  const match = bridge.getMatch();
  assertEquals(match.frags_us, 1);
  assertEquals(match.frags_them, 0);
  assertEquals(store.tables.match[match.id].frags_us, 1);

  assertEquals(bridge.getPlayer().ammo, 50);
});

Deno.test("bridge: player-dead milestone records opponent frag and health tier dead", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();

  bridge.host.stepTick({ script: { die: true } });
  await bridge.flush();

  // Opponent frag recorded
  const fragEntries = Object.values(store.tables.frag);
  assertEquals(fragEntries.length, 1);
  assertEquals(fragEntries[0].killer, "Imp");
  assertEquals(fragEntries[0].victim, "Doomguy");
  assertEquals(fragEntries[0].weapon, "claws");

  const match = bridge.getMatch();
  assertEquals(match.frags_them, 1);

  assertEquals(match.status, "over");
  const player = bridge.getPlayer();
  assertEquals(player.health, 0);
  assertEquals(player.health_tier, "dead");
  assertEquals(player.in_pain, "true");
});

Deno.test("bridge: in a campaign, kills never end the match and the player's death does", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({
    engine: scripted,
    store: store as any,
    referee,
    onFatal: defaultOnFatal,
    rateHz: 35,
    initialMatch: { id: "match-test", mode: "campaign", map: "e1m1", status: "active", frag_limit: 2, frags_us: 0, frags_them: 0, winner: "" }
  });

  bridge.host.stepTick({ script: { kills: 3 } });
  await bridge.flush();
  assertEquals(bridge.getMatch().status, "active");
  assertEquals(bridge.getMatch().frags_us, 3);

  bridge.host.stepTick({ script: { die: true } });
  await bridge.flush();
  const match = bridge.getMatch();
  assertEquals(match.status, "over");
  assertEquals(match.winner, "them");
  assertEquals(store.tables.match[match.id].status, "over");
});

Deno.test("bridge: player stats (health, armor, ammo) sync reactively to relational store", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();

  bridge.host.stepTick({ script: { stats: { health: 18, armor: 0 } } });
  await bridge.flush();

  const player = bridge.getPlayer();
  assertEquals(player.health, 18);
  assertEquals(player.armor, 0);
  assertEquals(player.health_tier, "critical");
  assertEquals(store.tables.player[player.id].health, 18);
  assertEquals(store.tables.player[player.id].armor, 0);
  assertEquals(store.tables.player[player.id].health_tier, "critical");
});

Deno.test("bridge: consecutive frags generate distinct sequential frag IDs", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();

  neutral(bridge, 8);
  bridge.host.stepTick(KILL);
  await bridge.flush();
  neutral(bridge, 8);
  bridge.host.stepTick(KILL);
  await bridge.flush();

  const fragKeys = Object.keys(store.tables.frag);
  assertEquals(fragKeys.length, 2);
  assertEquals(fragKeys[0], "frag_000009_001");
  assertEquals(fragKeys[1], "frag_000018_002");
});

Deno.test("bridge: time travel scrubbing is non-destructive until milestone boundary", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();

  // Advance to tick 9 and create a frag milestone
  neutral(bridge, 8);
  bridge.host.stepTick(KILL);
  await bridge.flush();
  assertEquals(bridge.host.getStats().currentTick, 9);
  assertEquals(Object.keys(store.tables.frag).length, 1);

  // Advance 2 more neutral ticks (ticks 10, 11)
  bridge.host.stepTick();
  bridge.host.stepTick();
  assertEquals(bridge.host.getStats().currentTick, 11);

  // Scrub backward to tick 2 (after milestone 9) - should succeed non-destructively
  bridge.host.seek(2);
  assertEquals(bridge.host.getStats().displayTick, 2);

  // Attempting to branch past milestone (tick 2 < milestone 9) must throw RangeError
  assertThrows(
    () => bridge.host.branch(2),
    RangeError,
    "orphan milestone"
  );

  // Attempting to stepTick while behind head must throw RangeError
  assertThrows(
    () => bridge.host.stepTick(),
    RangeError,
    "play() or branch() first"
  );

  // Attempting host.reset() through proxy must throw Error
  assertThrows(
    () => bridge.host.reset(),
    Error,
    "bridge: host.reset() bypasses the relational plane; use bridge.resetMatch()"
  );
});

Deno.test("bridge: throws and halts host if kinetic score diverges from relational plane", async () => {
  let fatalError: any = null;
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    onFatal: (err: any) => { fatalError = err; },
    rateHz: 35
  });
  await bridge.startMatch();

  // The kinetic score jumps to 10 while the relational match is at 0.
  assertThrows(
    () => bridge.host.stepTick({ script: { stats: { fragsUs: 10 } } }),
    Error,
    "diverged from relational match"
  );

  // Host should be stopped and onFatal called
  assertEquals(bridge.host.getStats().isPlaying, false);
  assertEquals(fatalError !== null, true);
});

Deno.test("bridge: store write refusal latches failure, pauses host, and throws loudly", async () => {
  let fatalError: any = null;
  const failingStore = createMockStore({ failOnWrite: true });
  const bridge = createDoomBridge({ engine: scripted,
    store: failingStore as any,
    referee,
    onFatal: (err: any) => { fatalError = err; },
    rateHz: 35
  });

  await assertRejects(
    () => bridge.startMatch(),
    Error,
    "store: write refused"
  );

  assertEquals(bridge.host.getStats().isPlaying, false);
  assertEquals(fatalError?.message, "store: write refused");

  // Subsequent steps must fail with latched failure
  assertThrows(
    () => bridge.host.stepTick(),
    Error,
    "store: write refused"
  );
});

Deno.test("bridge: late store refusal calls onFatal and halts host", async () => {
  let refusedCallback: any = null;
  let fatalError: any = null;
  const store = {
    tables: { match: {}, player: {}, frag: {} },
    write: async (_table: string, _rows: any, onRefused?: (err: any) => void) => {
      refusedCallback = onRefused;
    },
    add: async (_table: string, _rows: any, onRefused?: (err: any) => void) => {
      refusedCallback = onRefused;
    },
    dropWhere: async () => {}
  };
  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    rateHz: 35,
    onFatal: (err: any) => { fatalError = err; }
  });
  await bridge.startMatch();

  // Simulate late refusal arrival after promise resolution
  const err = new Error("store: late lease expiration");
  refusedCallback(err);
  assertEquals(fatalError?.message, "store: late lease expiration");
  assertEquals(bridge.host.getStats().isPlaying, false);
});

Deno.test("bridge: rejected milestone in warmup latches failure without promoting milestone tick", () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });

  neutral(bridge, 8);
  assertThrows(
    () => bridge.host.stepTick(KILL),
    Error,
    "cannot FRAG from status warmup"
  );

  // Host is paused
  assertEquals(bridge.host.getStats().isPlaying, false);

  // Stepping again throws latched failure
  assertThrows(
    () => bridge.host.stepTick(),
    Error,
    "cannot FRAG from status warmup"
  );
});

Deno.test("bridge: resetMatch clears latched failure and restores playable bridge", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });

  // Cause failure in warmup
  neutral(bridge, 8);
  assertThrows(() => bridge.host.stepTick(KILL), Error, "cannot FRAG from status warmup");

  // Reset match clears failure and returns warmup state
  const match = await bridge.resetMatch(10);
  assertEquals(match.status, "warmup");
  assertEquals(match.frags_us, 0);
  assertEquals(match.frags_them, 0);

  // Stepping succeeds now that failure is cleared
  bridge.host.stepTick();
  assertEquals(bridge.host.getStats().currentTick, 1);
});

Deno.test("bridge: concurrent demon-dead and player-dead milestones record both frags", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();

  neutral(bridge, 8);
  // One tick both kills a monster and kills the player.
  bridge.host.stepTick({ script: { kills: 1, die: true } });

  await bridge.flush();
  const match = bridge.getMatch();
  assertEquals(match.frags_us, 1, "Player frag must be registered");
  assertEquals(match.frags_them, 1, "Opponent frag must be registered");
  assertEquals(match.status, "over");
  assertEquals(Object.keys(store.tables.frag).length, 2, "Both frag records must exist in store");
});

Deno.test("bridge: mouse rotation does not accumulate when paused", () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });

  // Pause host
  bridge.host.pause();
  assertEquals(bridge.host.getStats().isPlaying, false);

  bridge.addMouseLook(5.0);
  bridge.addMouseRotation(500);

  // Stepping while paused should not have accumulated rotation
  const world = bridge.host.stepTick();
  assertEquals(world.player.faceLook, 0);
});

Deno.test("bridge: startMatch is idempotent when active and keeps host playing", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();
  bridge.play();
  assertEquals(bridge.getMatch().status, "active");
  assertEquals(bridge.host.getStats().isPlaying, true);

  // Calling startMatch again while active must not pause or throw
  const match2 = await bridge.startMatch();
  assertEquals(match2.status, "active");
  assertEquals(bridge.host.getStats().isPlaying, true);
  bridge.pause();
});

Deno.test("bridge: startMatch throws loudly before pause when status is over", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    onFatal: defaultOnFatal,
    rateHz: 35,
    initialMatch: { id: "match-test", map: "e1m1", status: "over", frag_limit: 1, frags_us: 1, frags_them: 0, winner: "us" }
  });

  await assertRejects(
    () => bridge.startMatch(),
    Error,
    "cannot start match from status over"
  );
  assertEquals(bridge.host.getStats().isPlaying, false);
});

Deno.test("bridge: resetMatch recovers cleanly after store refusal without latching old rejection", async () => {
  const store = createMockStore({ failOnWrite: true });
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });

  // startMatch fails due to store write refusal
  await assertRejects(() => bridge.startMatch(), Error, "store: write refused");

  // Store heals
  store.setFailOnWrite(false);

  // resetMatch must succeed and clear the failure completely
  const match = await bridge.resetMatch(10);
  assertEquals(match.status, "warmup");
  assertEquals(bridge.getMatch().status, "warmup");

  // Subsequent startMatch and stepping must work without old error resurfacing
  await bridge.startMatch();
  bridge.play();
  assertEquals(bridge.getMatch().status, "active");
  assertEquals(bridge.host.getStats().isPlaying, true);
  bridge.pause();
});

Deno.test("bridge: frag IDs use 6-digit zero-padded ticks matching numeric ordering", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();

  neutral(bridge, 8);
  bridge.host.stepTick(KILL);
  await bridge.flush();

  const fragKeys = Object.keys(store.tables.frag);
  assertEquals(fragKeys.length, 1);
  assertEquals(fragKeys[0], "frag_000009_001");
});

Deno.test("bridge: play and pause govern host execution and respect match status", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });

  // In warmup, play() does not start loop
  assertEquals(bridge.host.getStats().isPlaying, false);
  bridge.play();
  assertEquals(bridge.host.getStats().isPlaying, false);

  await bridge.startMatch();
  // startMatch does not auto-play
  assertEquals(bridge.host.getStats().isPlaying, false);

  bridge.play();
  assertEquals(bridge.host.getStats().isPlaying, true);

  bridge.pause();
  assertEquals(bridge.host.getStats().isPlaying, false);

  bridge.play();
  assertEquals(bridge.host.getStats().isPlaying, true);
  bridge.pause();
});

Deno.test("bridge: host proxy guards play, togglePlay, start, and reset", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });

  // host.start() is blocked
  assertThrows(
    () => bridge.host.start(),
    Error,
    "bridge: host.start() bypasses match lifecycle; use bridge.play()"
  );

  // host.reset() is blocked
  assertThrows(
    () => bridge.host.reset(),
    Error,
    "bridge: host.reset() bypasses the relational plane; use bridge.resetMatch()"
  );

  // In warmup: host.play() and host.togglePlay() must not start playback
  bridge.host.play();
  assertEquals(bridge.host.getStats().isPlaying, false);
  bridge.host.togglePlay();
  assertEquals(bridge.host.getStats().isPlaying, false);

  // Transition to active
  await bridge.startMatch();
  assertEquals(bridge.host.getStats().isPlaying, false);

  // In active: togglePlay starts playing
  bridge.host.togglePlay();
  assertEquals(bridge.host.getStats().isPlaying, true);

  // togglePlay again pauses
  bridge.host.togglePlay();
  assertEquals(bridge.host.getStats().isPlaying, false);

  bridge.host.play();
  assertEquals(bridge.host.getStats().isPlaying, true);
  bridge.pause();
});

Deno.test("bridge: fireWeapon and reloadWeapon are ignored while paused or in warmup", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });

  // In warmup: fireWeapon should not arm pending shot
  bridge.fireWeapon();
  await bridge.startMatch();
  // Tick 1 after startMatch: player should still have initial ammo 50
  bridge.host.stepTick();
  assertEquals(bridge.getPlayer().ammo, 50);

  // When paused: fireWeapon should not arm pending shot
  bridge.pause();
  bridge.fireWeapon();
  bridge.play();
  bridge.host.stepTick();
  assertEquals(bridge.getPlayer().ammo, 50);
  bridge.pause();
});

Deno.test("bridge: resetMatch validates referee before clearing latched failure", async () => {
  // deno-lint-ignore no-explicit-any
  let fatalError: any = null;
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    onFatal: (err: any) => { fatalError = err; },
    rateHz: 35
  });
  await bridge.startMatch();

  store.write = () => Promise.reject(new Error("store: database down"));
  neutral(bridge, 8);
  bridge.host.stepTick(KILL);
  await assertRejects(() => bridge.flush(), Error, "store: database down");

  await assertRejects(
    () => bridge.resetMatch(0),
    RangeError,
    "referee: invalid frag_limit 0"
  );
  assertEquals(bridge.isTransitioning(), false);
  assertEquals(fatalError?.message.includes("store: database down"), true);
});

Deno.test("bridge: mid-match remount seeds health, armor, ammo, and preserves frag tick order", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    onFatal: defaultOnFatal,
    rateHz: 35,
    initialMatch: { id: "match-01", map: "e1m1", status: "active", frag_limit: 10, frags_us: 3, frags_them: 2, winner: "" },
    initialPlayer: { id: "player-local", handle: "Doomguy", health: 42, armor: 15, ammo: 28, weapon: "shotgun", in_pain: "false", is_god: "false", health_tier: "scratched" },
    initialFragCount: 5,
    epochTick: 120
  });

  assertEquals(bridge.getPlayer().health, 42);
  assertEquals(bridge.getPlayer().armor, 15);
  assertEquals(bridge.getPlayer().ammo, 28);
  neutral(bridge, 8);
  bridge.host.stepTick(KILL);
  await bridge.flush();
  const [frag] = Object.values(store.tables.frag) as any[];
  assertEquals(frag.tick, 129, "epochTick 120 + world tick 9 keeps ordering monotonic across remounts");
  assertEquals(frag.id, "frag_000129_006");
});

Deno.test("bridge: rejected step in onStep leaves simulation history intact", () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  const headBefore = bridge.host.getCurrentTick();
  // In warmup, a kill makes the referee throw "cannot FRAG from status warmup"
  assertThrows(
    () => {
      neutral(bridge, 8);
      bridge.host.stepTick(KILL);
    },
    Error,
    "cannot FRAG from status warmup"
  );
  // Current tick in snapshot ring buffer has not advanced past tick 8
  assertEquals(bridge.host.getCurrentTick(), headBefore + 8);
});

Deno.test("renderer: render3D enforces fail-loud invariant on invalid inputs", () => {
  assertThrows(() => render3D(null as any, {} as any, {} as any), TypeError);
  assertThrows(() => render3D({ player: {} } as any, null as any, {} as any), TypeError);
  assertThrows(() => render3D({ player: {} } as any, {} as any, null as any), TypeError);
});

Deno.test("bridge: rejected step in onStep with staged milestone does not leak side-effects to store or matchState", async () => {
  const store = createMockStore();
  const customReferee = (m: any, a: any) => {
    if (a.type === "START") return { ...m, status: "active" };
    if (a.type === "FRAG") {
      return { ...m, frags_us: 99 };
    }
    return referee(m, a);
  };
  let fatalError: any = null;
  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee: customReferee,
    onFatal: (err: any) => { fatalError = err; },
    rateHz: 35
  });
  await bridge.startMatch();

  neutral(bridge, 8);
  assertThrows(
    () => bridge.host.stepTick(KILL),
    Error,
    "diverged from relational match"
  );

  await bridge.flush();

  assertEquals(Object.keys(store.tables.frag).length, 0);
  assertEquals(bridge.getMatch().frags_us, 0);
  assertEquals(fatalError !== null, true);
});

Deno.test("bridge: onFatal disposing bridge preserves original failure message", async () => {
  const store = createMockStore();
  let bridge: any;
  let caughtFatal: any = null;
  bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    onFatal: (err: any) => {
      caughtFatal = err;
      bridge.dispose();
    },
    rateHz: 35
  });
  await bridge.startMatch();

  assertThrows(
    () => bridge.host.stepTick({ script: { stats: { fragsUs: 10 } } }),
    Error,
    "diverged from relational match"
  );

  assertEquals(caughtFatal?.message.includes("diverged from relational match"), true);
});

Deno.test("bridge: disposed bridge rejects startMatch, resetMatch, play", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  bridge.dispose();

  assertEquals(bridge.isDisposed(), true);
  await assertRejects(() => bridge.startMatch(), BridgeDisposedError, "bridge: disposed");
  await assertRejects(() => bridge.resetMatch(10), BridgeDisposedError, "bridge: disposed");
  assertThrows(() => bridge.play(), BridgeDisposedError, "bridge: disposed");
});

Deno.test("bridge: disposal during in-flight transition rejects with BridgeDisposedError", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });

  let resolveWrite!: () => void;
  const writeBlocked = new Promise<void>((resolve) => { resolveWrite = resolve; });
  const origWrite = store.write;
  store.write = (table: string, edits: any[], onRefused?: any) => {
    if (table === "match") {
      return writeBlocked.then(() => origWrite(table, edits, onRefused));
    }
    return origWrite(table, edits, onRefused);
  };

  const startPromise = bridge.startMatch();
  assertEquals(bridge.isTransitioning(), true);
  bridge.dispose();
  assertEquals(bridge.isDisposed(), true);
  resolveWrite();

  await assertRejects(() => startPromise, BridgeDisposedError, "bridge: disposed");
});

Deno.test("bridge: stepping during lifecycle transition rejects cleanly without fatal latch", async () => {
  const store = createMockStore();
  let fatalCalled = false;
  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    onFatal: (_err: any) => { fatalCalled = true; },
    rateHz: 35
  });

  let resolveWrite!: () => void;
  const writeTriggered = new Promise<void>((ready) => {
    const origWrite = store.write;
    store.write = (table: string, edits: any[], onRefused?: any) => {
      if (table === "match") {
        return new Promise<void>((resolve) => {
          resolveWrite = () => origWrite(table, edits, onRefused).then(resolve);
          ready();
        });
      }
      return origWrite(table, edits, onRefused);
    };
  });

  const startPromise = bridge.startMatch();
  assertEquals(bridge.isTransitioning(), true);

  assertThrows(
    () => bridge.host.stepTick(),
    Error,
    "bridge: cannot step while match lifecycle transition is in flight"
  );
  assertEquals(fatalCalled, false);

  await writeTriggered;
  resolveWrite();
  await startPromise;
  assertEquals(bridge.isTransitioning(), false);
  bridge.pause();
});

Deno.test("bridge: loop error in onRender or sfx routes to fail and onFatal", async () => {
  const store = createMockStore();
  let fatalError: any = null;
  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    onFatal: (err: any) => { fatalError = err; },
    render3D: () => {
      throw new Error("simulated render3D failure");
    },
    canvas: {} as any,
    rateHz: 35
  });
  await bridge.startMatch();

  assertThrows(
    () => bridge.host.stepTick(),
    Error,
    "simulated render3D failure"
  );
  assertEquals(fatalError?.message.includes("simulated render3D failure"), true);
});

Deno.test("bridge: render3D receives prev and alpha options for temporal interpolation", async () => {
  const store = createMockStore();
  let receivedOpts: any = null;
  const bridge = createDoomBridge({
    engine: scripted,
    store: store as any,
    referee,
    onFatal: defaultOnFatal,
    render3D: (_world: any, _canvas: any, _assets: any, opts: any) => {
      receivedOpts = opts;
    },
    canvas: {} as any,
    rateHz: 35,
  });
  await bridge.startMatch();
  bridge.host.stepTick();

  assertEquals(receivedOpts !== null, true);
  assertEquals(receivedOpts.alpha, 1.0);
  assertEquals(typeof receivedOpts.prev, "object");
});

Deno.test("bridge: store refusal arriving after bridge disposal reports refusal error to onFatal without overwrite", async () => {
  const store = createMockStore();
  let caughtFatal: any = null;
  let triggerRefusal!: () => void;
  const addInvoked = new Promise<void>((ready) => {
    store.add = (_table: string, _rows: any[], onRefused?: any) => {
      return new Promise((_, reject) => {
        triggerRefusal = () => {
          const err = new Error("store: late refusal on frag add");
          try {
            if (onRefused) onRefused(err);
          } finally {
            reject(err);
          }
        };
        ready();
      });
    };
  });

  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    onFatal: (err: any) => {
      caughtFatal = err;
    },
    rateHz: 35
  });
  await bridge.startMatch();

  neutral(bridge, 8);
  bridge.host.stepTick(KILL);

  await addInvoked;
  bridge.dispose();
  assertEquals(bridge.isDisposed(), true);

  triggerRefusal();

  await assertRejects(() => bridge.settled(), Error, "store: late refusal on frag add");
  assertEquals(caughtFatal?.message.includes("store: late refusal on frag add"), true);
});

Deno.test("bridge: resetMatch restores default 100 health even after mid-match remount with damaged stats", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted,
    store: store as any,
    referee,
    onFatal: defaultOnFatal,
    rateHz: 35,
    initialMatch: { id: "match-01", map: "e1m1", status: "active", frag_limit: 10, frags_us: 3, frags_them: 2, winner: "" },
    initialPlayer: { id: "player-local", handle: "Doomguy", health: 42, armor: 15, ammo: 28, weapon: "shotgun", in_pain: "false", is_god: "false", health_tier: "scratched" }
  });

  assertEquals(bridge.getPlayer().health, 42);
  await bridge.resetMatch(10);

  assertEquals(bridge.getPlayer().health, 100);
  assertEquals(bridge.getPlayer().armor, 0);
  assertEquals(bridge.getPlayer().ammo, 50);
  assertEquals(bridge.getPlayer().health_tier, "healthy");
});

Deno.test("bridge: resetMatch validates fragLimit and rejects without modifying state or store", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();
  assertEquals(bridge.getMatch().status, "active");

  await assertRejects(() => bridge.resetMatch(0), RangeError, "referee: invalid frag_limit 0");
  assertEquals(bridge.getMatch().status, "active");
  const [match] = await store.query("match");
  assertEquals(match.status, "active");
});

Deno.test("bridge: loadMap switches level, updates relational match.map, and re-seeds entities", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();
  assertEquals(bridge.getMapName(), "e1m1");

  await bridge.loadMap("e1m2");
  assertEquals(bridge.getMapName(), "e1m2");
  assertEquals(bridge.getMatch().map, "e1m2");
  assertEquals(bridge.getMatch().status, "active");

  const start = level("e1m2").things.find((t) => t.type === 1)!;
  const world = bridge.host.getState();
  assertEquals([world.mapName, world.player.x, world.player.y], ["e1m2", start.x, start.y]);
  assertEquals(world.monsters.length > 0, true);
  bridge.pause();
});

Deno.test("bridge: getSkill, setSkill, and resetMatch with skill option enforce boundaries and propagate to state", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();

  // Default skill is 2 ("Hurt me plenty")
  assertEquals(bridge.getSkill(), 2);
  assertEquals(bridge.host.getState().skill, 2);

  // setSkill updates skill and advances frame
  bridge.setSkill(4);
  assertEquals(bridge.getSkill(), 4);
  assertEquals(bridge.host.getState().skill, 4);

  // Bounds validation
  assertThrows(() => bridge.setSkill(-1 as any), RangeError);
  assertThrows(() => bridge.setSkill(5 as any), RangeError);
  assertThrows(() => bridge.setSkill(1.5 as any), RangeError);

  // resetMatch with skill updates skill
  await bridge.resetMatch(10, { skill: 0 });
  assertEquals(bridge.getSkill(), 0);
  assertEquals(bridge.host.getState().skill, 0);

  // resetMatch rejects invalid skill
  await assertRejects(() => bridge.resetMatch(10, { skill: 9 as any }), RangeError);
});

Deno.test("bridge: getWeapon and setWeapon manage player weapon state and input dispatch", async () => {
  const store = createMockStore();
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: defaultOnFatal, rateHz: 35 });
  await bridge.startMatch();

  assertEquals(bridge.getWeapon(), "pistol");

  bridge.setWeapon("pistol");
  assertEquals(bridge.getWeapon(), "pistol");

  bridge.setWeapon("fist");
  assertEquals(bridge.getWeapon(), "fist");

  assertThrows(() => bridge.setWeapon(123 as any), TypeError);
});




// Entering E1M2 with kills on the board used to halt the bridge: the engine
// restarted the score the relational match still held.
Deno.test("bridge: finishing a level with kills and entering the next keeps the game running", async () => {
  const store = createMockStore();
  let fatal: any = null;
  const bridge = createDoomBridge({ engine: scripted, store: store as any, referee, onFatal: (e: any) => { fatal = e; }, rateHz: 35 });
  await bridge.startMatch();
  bridge.host.stepTick(KILL);
  const exit = facingLine(level("e1m1"), 407, 30);
  bridge.host.stepTick({ teleport: exit });
  bridge.host.stepTick({ use: true });
  assertEquals(bridge.host.getState().phase, "intermission");
  bridge.host.stepTick({ enter: true });
  neutral(bridge, 5);
  await bridge.flush();
  assertEquals(fatal, null);
  assertEquals(bridge.host.getState().mapName, "e1m2");
  assertEquals(bridge.getMatch().frags_us, 1);
});
