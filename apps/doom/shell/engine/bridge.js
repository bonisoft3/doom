import { createKineticHost, createKineticInput } from "/omnishell/interpreter/kinetic.js";
import { doomKineticEngine } from "./simulation.js";

export class BridgeDisposedError extends Error {
  constructor(message = "bridge: disposed") {
    super(message);
    this.name = "BridgeDisposedError";
  }
}

export const DEFAULT_PLAYER = {
  id: "player-local",
  handle: "Doomguy",
  health: 100,
  armor: 0,
  ammo: 50,
  weapon: "pistol",
  in_pain: "false",
  is_god: "false",
  health_tier: "healthy"
};

/**
 * @param {object} options
 * @param {any} [options.engine] the kinetic engine; the game's own unless a test scripts one
 * @param {any} options.store
 * @param {any} options.referee
 * @param {any} options.onFatal
 * @param {any} [options.canvas]
 * @param {((world: any, cvs?: any, asts?: any, opts?: any) => void) | null} [options.render3D]
 * @param {any} [options.assets]
 * @param {any} [options.sfx]
 * @param {number} [options.rateHz]
 * @param {number} [options.seed]
 * @param {number} [options.historyLimit]
 * @param {any} [options.onRender]
 * @param {any} [options.initialMatch]
 * @param {Record<string, any>} [options.initialPlayer]
 * @param {number} [options.initialFragCount]
 * @param {number} [options.epochTick]
 */
export function createDoomBridge({
  engine = doomKineticEngine,
  store,
  referee,
  onFatal,
  canvas = null,
  hudCanvas = null,
  render3D = null,
  assets = null,
  sfx = null,
  rateHz = 35,
  seed = 0x1337,
  // A level's snapshot is tens of kilobytes; ten seconds of history.
  historyLimit = 350,
  onRender = null,
  initialMatch = { id: "match-01", mode: "campaign", map: "e1m1", status: "warmup", frag_limit: 10, frags_us: 0, frags_them: 0, winner: "" },
  initialPlayer = DEFAULT_PLAYER,
  initialFragCount = 0,
  epochTick = 0,
  initialPhase = "active",
  mapName = "e1m1",
  skill = 2
}) {
  if (!store || typeof store.write !== "function") {
    throw new TypeError("bridge: store with write method is required");
  }
  if (!referee || typeof referee !== "function") {
    throw new TypeError("bridge: pure referee reducer function is required");
  }
  if (typeof onFatal !== "function") {
    throw new TypeError("bridge: onFatal callback function is required");
  }
  if (!Number.isInteger(initialFragCount) || initialFragCount < 0) {
    throw new TypeError("bridge: initialFragCount must be non-negative integer");
  }
  if (!Number.isInteger(epochTick) || epochTick < 0) {
    throw new TypeError("bridge: epochTick must be non-negative integer");
  }

  let matchState = { ...initialMatch };
  let playerState = { ...initialPlayer };
  let currentMapName = mapName;
  let currentSkill = skill;
  let fragCounter = initialFragCount;
  let currentEpochTick = epochTick;
  let firePending = false;
  let reloadPending = false;
  let enterPending = false;
  let escapePending = false;
  let usePending = false;
  let pendingWeapon = null;
  let mouseRotAccum = 0;
  let pending = Promise.resolve();
  let inflight = Promise.resolve();
  let failure = null;
  let disposed = false;
  let staged = null;
  let lastMilestoneTick = 0;
  const keys = {};

  const kineticInput = createKineticInput({
    bindings: {
      forward: ["KeyW", "ArrowUp", "w", "arrowup", "gamepad:axis:1:-"],
      backward: ["KeyS", "ArrowDown", "s", "arrowdown", "gamepad:axis:1:+"],
      strafeLeft: ["KeyA", "a", "gamepad:button:4"],
      strafeRight: ["KeyD", "d", "gamepad:button:5"],
      turnLeft: ["ArrowLeft", "KeyQ", "arrowleft", "q", "gamepad:axis:0:-"],
      turnRight: ["ArrowRight", "arrowright", "gamepad:axis:0:+"],
      run: ["ShiftLeft", "ShiftRight", "shift", "gamepad:button:10"],
      fire: ["ControlLeft", "ControlRight", "control", "gamepad:button:7"],
      use: ["Space", "KeyE", " ", "e", "gamepad:button:0"],
      reload: ["KeyR", "r", "gamepad:button:2"],
      enter: ["Enter", "NumpadEnter", "enter", "gamepad:button:9"],
      escape: ["Escape", "KeyP", "escape", "p", "gamepad:button:8"],
    },
  });

  let pendingTeleport = null;

  function getInput() {
    const poll = kineticInput.poll();
    const cmd = {
      forward: poll.forward || !!(keys["w"] || keys["arrowup"]),
      backward: poll.backward || !!(keys["s"] || keys["arrowdown"]),
      strafeLeft: poll.strafeLeft || !!keys["a"],
      strafeRight: poll.strafeRight || !!keys["d"],
      turnLeft: poll.turnLeft || !!(keys["arrowleft"] || keys["q"]),
      turnRight: poll.turnRight || !!keys["arrowright"],
      up: poll.forward || !!(keys["w"] || keys["arrowup"]),
      down: poll.backward || !!(keys["s"] || keys["arrowdown"]),
      enter: enterPending || poll.enter || !!(keys["enter"] || keys["numpadenter"]),
      escape: escapePending || poll.escape || !!(keys["escape"] || keys["p"]),
      rotDelta: mouseRotAccum,
      run: poll.run || !!(keys["shift"] || keys["shiftleft"] || keys["shiftright"]),
      fire: firePending || poll.fire || !!(keys[" "] || keys["control"]),
      reload: reloadPending || poll.reload,
      use: usePending || poll.use || !!(keys["e"] || keys["enter"]),
      switchWeapon: pendingWeapon || null,
      teleport: pendingTeleport || undefined
    };
    mouseRotAccum = 0;
    firePending = false;
    reloadPending = false;
    enterPending = false;
    escapePending = false;
    usePending = false;
    pendingWeapon = null;
    pendingTeleport = null;
    return cmd;
  }

  let isTransitioning = false;

  const fail = (err) => {
    const e = err instanceof Error ? err : new Error(String(err));
    if (failure) {
      if (e !== failure) (failure.suppressed ??= []).push(e);
      return failure;
    }
    failure = e;
    host.stop();
    onFatal(e);
    return e;
  };

  const handleRefused = (err) => {
    fail(err instanceof Error ? err : new Error("bridge: store write refused"));
  };

  function stageMilestone(world, tick) {
    if (tick <= lastMilestoneTick) {
      throw fail(new Error(`bridge: tick ${tick} replays over promoted milestone at ${lastMilestoneTick}`));
    }

    const killers = (world.events || [])
      .filter((e) => e === "demon-dead" || e === "player-dead")
      .map((e) => (e === "demon-dead" ? "us" : "them"));

    if (killers.length === 0) return null;

    let stagedMatch = matchState;
    const frags = [];
    try {
      for (const killer of killers) {
        if (stagedMatch.status === "over") break;
        const nextMatch = referee(stagedMatch, { type: "FRAG", killer });
        stagedMatch = { ...stagedMatch, ...nextMatch };
        const fragNum = fragCounter + frags.length + 1;
        frags.push({
          id: `frag_${String(world.tick + currentEpochTick).padStart(6, "0")}_${String(fragNum).padStart(3, "0")}`,
          killer: killer === "us" ? playerState.handle : "Imp",
          victim: killer === "us" ? "Imp" : playerState.handle,
          weapon: killer === "us" ? playerState.weapon : "claws",
          tick: world.tick + currentEpochTick
        });
      }
    } catch (err) {
      throw fail(err);
    }

    if (frags.length === 0) return null;
    return { match: stagedMatch, frags, tick };
  }

  function commitMilestone(stagedInfo) {
    matchState = stagedInfo.match;
    fragCounter += stagedInfo.frags.length;
    lastMilestoneTick = stagedInfo.tick;
    const targetMatch = { ...matchState };
    const frags = stagedInfo.frags;

    pending = pending
      .then(async () => {
        await store.add("frag", frags, handleRefused);
        await store.write("match", [{ key: targetMatch.id, row: targetMatch }], handleRefused);
      })
      .catch((err) => {
        throw fail(err);
      });
  }

  let playerDirty = null;
  let playerFlushQueued = false;

  function syncPlayer(world) {
    const wp = world.player;
    const tier = wp.health > 75 ? "healthy" : wp.health > 50 ? "scratched" : wp.health > 25 ? "bloody" : wp.health > 0 ? "critical" : "dead";
    const pain = wp.damageFlash > 0 ? "true" : "false";

    if (
      wp.health !== playerState.health ||
      wp.armor !== playerState.armor ||
      wp.ammo !== playerState.ammo ||
      wp.weapon !== playerState.weapon ||
      tier !== playerState.health_tier ||
      pain !== playerState.in_pain
    ) {
      playerState = {
        ...playerState,
        health: wp.health,
        armor: wp.armor,
        ammo: wp.ammo,
        weapon: wp.weapon,
        health_tier: tier,
        in_pain: pain
      };
      playerDirty = { ...playerState };
      if (playerFlushQueued) return;
      playerFlushQueued = true;
      pending = pending
        .then(async () => {
          playerFlushQueued = false;
          const row = playerDirty;
          playerDirty = null;
          if (row) {
            await store.write("player", [{ key: row.id, row }], handleRefused);
          }
        })
        .catch((err) => {
          throw fail(err);
        });
    }
  }

  const host = createKineticHost({
    engine,
    rateHz,
    seed,
    historyLimit,
    initOptions: {
      fragLimit: matchState.frag_limit,
      fragsUs: matchState.frags_us,
      fragsThem: matchState.frags_them,
      phase: initialPhase,
      mapName: currentMapName,
      skill: currentSkill
    },
    getInput,
    onFault: (err) => {
      fail(err);
    },
    onBranch(tick) {
      if (failure) throw failure;
      if (tick < lastMilestoneTick) {
        throw new RangeError(`bridge: branch to tick ${tick} would orphan milestone promoted at ${lastMilestoneTick}`);
      }
    },
    onReset() {
      if (failure) throw failure;
      if (lastMilestoneTick > 0) {
        throw new RangeError(`bridge: host.reset() would orphan milestone promoted at ${lastMilestoneTick}; use bridge.resetMatch() instead`);
      }
    },
    onStep(world, tick) {
      staged = null;
      if (disposed) throw new BridgeDisposedError();
      if (failure) throw failure;
      if (isTransitioning) {
        throw fail(new Error("bridge: cannot step while match lifecycle transition is in flight"));
      }
      if (!world || !world.player) {
        throw fail(new TypeError("bridge: invalid world snapshot on step"));
      }

      const hasMilestone = Array.isArray(world.events) && world.events.some((e) => e === "demon-dead" || e === "player-dead");
      staged = hasMilestone ? stageMilestone(world, tick) : null;

      const targetMatch = staged ? staged.match : matchState;
      if (
        world.player.fragsUs !== targetMatch.frags_us ||
        world.player.fragsThem !== targetMatch.frags_them ||
        (world.player.status === "over" && targetMatch.status !== "over") ||
        (targetMatch.status === "over" && world.player.status !== "over")
      ) {
        throw fail(new Error(`bridge: kinetic score (${world.player.fragsUs}/${world.player.fragsThem}, ${world.player.status}) diverged from relational match (${targetMatch.frags_us}/${targetMatch.frags_them}, ${targetMatch.status})`));
      }
    },
    onCommit(world) {
      if (failure) return;
      if (staged) {
        commitMilestone(staged);
        staged = null;
      }

      syncPlayer(world);

      if (Array.isArray(world.events) && sfx) {
        try {
          for (const ev of world.events) {
            if (typeof sfx[ev] === "function") {
              sfx[ev]();
            }
          }
        } catch (err) {
          throw fail(err);
        }
      }
    },
    onRender(prev, world, alpha, tick, isHistorical) {
      try {
        if (render3D && canvas) {
          render3D(world, canvas, assets, { hudCanvas, isHistorical, prev, alpha });
        }
        if (typeof onRender === "function") {
          onRender(prev, world, alpha, tick, isHistorical);
        }
      } catch (err) {
        throw fail(err);
      }
    }
  });

  const hostProxy = {
    ...host,
    play: () => api.play(),
    togglePlay() {
      if (host.isPlaying()) host.pause();
      else api.play();
      return host.isPlaying();
    },
    start() {
      throw new Error("bridge: host.start() bypasses match lifecycle; use bridge.play()");
    },
    reset() {
      throw new Error("bridge: host.reset() bypasses the relational plane; use bridge.resetMatch()");
    },
    stepTick(cmd) {
      if (disposed) throw new BridgeDisposedError();
      if (isTransitioning) {
        throw new Error("bridge: cannot step while match lifecycle transition is in flight");
      }
      return host.stepTick(cmd);
    },
    branch(tick) {
      if (disposed) throw new BridgeDisposedError();
      if (isTransitioning) {
        throw new Error("bridge: cannot branch while match lifecycle transition is in flight");
      }
      return host.branch(tick);
    }
  };

  const api = {
    host: hostProxy,
    getMatch: () => ({ ...matchState }),
    getPlayer: () => ({ ...playerState }),
    flush: () => pending,
    startMatch: async () => {
      if (disposed) throw new BridgeDisposedError();
      if (failure) throw failure;
      if (isTransitioning) throw new Error("bridge: match lifecycle transition already in progress");
      if (matchState.status === "active") return { ...matchState };
      if (matchState.status !== "warmup") {
        throw new Error(`bridge: cannot start match from status ${matchState.status}`);
      }
      host.pause();
      isTransitioning = true;
      const op = (async () => {
        try {
          await pending;
          if (disposed) throw new BridgeDisposedError();
          if (failure) throw failure;
          const nextMatch = referee(matchState, { type: "START" });
          pending = pending
            .then(async () => {
              await store.write("match", [{ key: matchState.id, row: nextMatch }], handleRefused);
            })
            .catch((err) => {
              throw fail(err);
            });
          await pending;
          if (disposed) throw new BridgeDisposedError();
          if (failure) throw failure;
          matchState = { ...matchState, ...nextMatch };
          return { ...matchState };
        } finally {
          isTransitioning = false;
        }
      })();
      inflight = Promise.allSettled([inflight, op]);
      return op;
    },
    resetMatch: async (fragLimit = 10, options = {}) => {
      if (disposed) throw new BridgeDisposedError();
      if (isTransitioning) throw new Error("bridge: match lifecycle transition already in progress");
      if (options.skill !== undefined) {
        if (!Number.isInteger(options.skill) || options.skill < 0 || options.skill > 4) {
          throw new RangeError(`bridge.resetMatch: skill must be integer between 0 and 4, got ${options.skill}`);
        }
        currentSkill = options.skill;
      }
      if (options.mapName) currentMapName = options.mapName;
      const nextMatch = referee(matchState, { type: "RESET", frag_limit: fragLimit });
      const nextPlayer = { ...DEFAULT_PLAYER, id: playerState.id, handle: playerState.handle };
      const resetOptions = { fragLimit, mapName: currentMapName, skill: currentSkill, phase: options.phase ?? "active" };
      engine.initState(seed, resetOptions);
      host.pause();
      isTransitioning = true;
      const op = (async () => {
        try {
          await pending.then(() => {}, (err) => { if (err !== failure) throw err; });
          if (disposed) throw new BridgeDisposedError();
          failure = null;
          pending = Promise.resolve();

          pending = pending
            .then(async () => {
              await store.write("match", [{ key: matchState.id, row: nextMatch }], handleRefused);
              await store.write("player", [{ key: nextPlayer.id, row: nextPlayer }], handleRefused);
              await store.dropWhere("frag", "tick=gte.0", handleRefused);
            })
            .catch((err) => {
              throw fail(err);
            });
          await pending;
          if (disposed) throw new BridgeDisposedError();
          if (failure) throw failure;

          lastMilestoneTick = 0;
          currentEpochTick = 0;
          fragCounter = 0;
          playerDirty = null;
          playerFlushQueued = false;
          matchState = { ...matchState, ...nextMatch };
          playerState = nextPlayer;

          firePending = false;
          reloadPending = false;
          mouseRotAccum = 0;
          for (const k of Object.keys(keys)) delete keys[k];

          host.reset(seed, resetOptions);
          return { ...matchState };
        } finally {
          isTransitioning = false;
        }
      })();
      inflight = Promise.allSettled([inflight, op]);
      return op;
    },
    restartMatch: async (fragLimit = 10, options = {}) => {
      await api.resetMatch(fragLimit, options);
      await api.startMatch();
      api.play();
      return { ...matchState };
    },
    getMapName: () => currentMapName,
    loadMap: async (name, fragLimit = 10) => {
      if (typeof name !== "string") throw new TypeError("bridge.loadMap: a registered level name is required");
      currentMapName = name;
      matchState.map = name;
      return await api.restartMatch(fragLimit, { mapName: name });
    },
    getSkill: () => currentSkill,
    setSkill: (s) => {
      if (!Number.isInteger(s) || s < 0 || s > 4) {
        throw new RangeError(`setSkill: skill must be integer between 0 and 4, got ${s}`);
      }
      currentSkill = s;
      host.stepTick({ skill: s });
      return currentSkill;
    },
    isTransitioning: () => isTransitioning,
    isDisposed: () => disposed,
    settled: async () => {
      await inflight;
      return pending;
    },
    play: () => {
      if (disposed) throw new BridgeDisposedError();
      if (failure) throw failure;
      if (!isTransitioning && matchState.status === "active") {
        host.play();
      }
    },
    resume: () => {
      if (disposed) throw new BridgeDisposedError();
      if (failure) throw failure;
      if (!isTransitioning && matchState.status === "active") {
        host.play();
      }
    },
    clearInputs: () => {
      kineticInput.clear?.();
      for (const k of Object.keys(keys)) delete keys[k];
      enterPending = false;
      escapePending = false;
      firePending = false;
      reloadPending = false;
      usePending = false;
      pendingWeapon = null;
    },
    pause: () => {
      host.pause();
    },
    dispose: () => {
      disposed = true;
      kineticInput.destroy();
      host.stop();
    },
    fireWeapon: () => {
      if (!disposed && host.getStats().isPlaying && matchState.status === "active") {
        firePending = true;
      }
    },
    reloadWeapon: () => {
      if (!disposed && host.getStats().isPlaying && matchState.status === "active") {
        reloadPending = true;
      }
    },
    useAction: () => {
      if (!disposed && host.getStats().isPlaying && matchState.status === "active") {
        usePending = true;
      }
    },
    getWeapon: () => playerState.weapon,
    setWeapon: (w) => {
      if (typeof w !== "string") {
        throw new TypeError("setWeapon: weapon name must be a string");
      }
      pendingWeapon = w;
      playerState.weapon = w;
      return w;
    },
    setKey: (key, pressed) => {
      if (typeof key !== "string") {
        throw new TypeError("setKey: key must be string");
      }
      const lower = key.toLowerCase();
      keys[lower] = !!pressed;
      kineticInput.inputs._handleKeyEvent(key, !!pressed, { code: key, key });
      if (pressed) {
        if (lower === "enter" || lower === "numpadenter") enterPending = true;
        if (lower === "escape" || lower === "p") escapePending = true;
        if (lower === "e" || lower === " ") usePending = true;
        const slot = /^(?:digit|numpad)?([1-7])$/.exec(lower);
        if (slot) pendingWeapon = slot[1];
      }
    },
    addMouseRotation: (dx) => {
      if (!Number.isFinite(dx)) {
        throw new TypeError("addMouseRotation: dx must be finite number");
      }
      if (host.getStats().isPlaying) {
        mouseRotAccum += dx * 0.005;
      }
    },
    addMouseLook: (delta) => {
      if (!Number.isFinite(delta)) {
        throw new TypeError("addMouseLook: delta must be finite number");
      }
      if (host.getStats().isPlaying) {
        mouseRotAccum += delta;
      }
    },
    audio: sfx,
    sfx,
    teleport: (x, y, angle) => {
      pendingTeleport = { x, y, ...(Number.isInteger(angle) ? { angle } : {}) };
    }
  };

  return api;
}
