import { createShell } from "/omnishell/interpreter/shell.js";
import { scriptURL } from "/omnishell/interpreter/script-url.js";
import { createDoomBridge, BridgeDisposedError } from "./engine/bridge.js";
import { render3D } from "./engine/renderer.js";
import { loadDoomAssets } from "./engine/assets.js";

const babylon = document.createElement("script");
babylon.src = scriptURL("/shell/vendor/babylon/babylon.js");
await new Promise((resolve, reject) => {
  babylon.onload = resolve;
  babylon.onerror = () => reject(new Error("boot: Babylon failed to load"));
  document.head.append(babylon);
});

const mount = document.getElementById("app");
if (!mount) throw new Error("boot: #app mount missing");

function startArena(store) {
  let activeBridge = null;
let cleanupListeners = null;
let mountedCanvas = null;
let isMounting = false;
let remountQueued = false;
let cachedAssets = null;
let cachedReferee = null;
let wasVisible = false;
let fatal = null;
let retiring = Promise.resolve();

function latch(err) {
  if (fatal) return;
  fatal = err;
  observer.disconnect();
  remountQueued = false;
  if (cleanupListeners) {
    cleanupListeners();
    cleanupListeners = null;
  }
  activeBridge = null;
  mountedCanvas = null;
  const fatalBanner = document.getElementById("fatal-banner") || document.createElement("div");
  fatalBanner.id = "fatal-banner";
  fatalBanner.className = "fatal-error-banner";
  fatalBanner.textContent = `Doom Arena Fatal Error: ${err?.message || err}`;
  mount.prepend(fatalBanner);
}

function onFatal(err) {
  latch(err);
}

async function checkAndMountArena() {
  if (fatal) throw fatal;
  const canvas = document.getElementById("renderCanvas");
  if (!canvas || canvas !== mountedCanvas) {
    if (activeBridge) {
      retiring = activeBridge.settled();
      activeBridge.pause();
      activeBridge.dispose();
      if (cleanupListeners) cleanupListeners();
      activeBridge = null;
      cleanupListeners = null;
      mountedCanvas = null;
    }
    wasVisible = false;
    if (!canvas) {
      if (isMounting) remountQueued = true;
      return;
    }
  }

  const screenEl = canvas.closest(".shell-screen");
  const isVisible = canvas.isConnected && (!screenEl || !screenEl.hidden);

  if (activeBridge) {
    if (isVisible === wasVisible) return;
    wasVisible = isVisible;
    if (!isVisible) {
      activeBridge.pause();
    } else if (activeBridge.getMatch().status === "active" && !activeBridge.isTransitioning()) {
      activeBridge.play();
    }
    return;
  }
  wasVisible = isVisible;

  if (isMounting) {
    remountQueued = true;
    return;
  }
  isMounting = true;

  const cleanups = [];
  const cleanup = () => {
    while (cleanups.length > 0) cleanups.pop()();
  };

  try {
    await retiring;
    if (fatal) throw fatal;
    if (!cachedReferee) {
      const { evaluateRole } = await import("/omnishell/interpreter/jessie.js");
      const res = await fetch("./handlers/referee.js");
      if (!res.ok) throw new Error(`boot: referee.js fetch failed with HTTP ${res.status}`);
      const src = await res.text();
      cachedReferee = await evaluateRole(src, "handler");
    }
    if (fatal) throw fatal;

    if (!cachedAssets) cachedAssets = await loadDoomAssets("/shell/assets/");
    if (fatal) throw fatal;
    if (!canvas.isConnected) {
      cleanup();
      return;
    }

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          if (activeBridge) {
            const world = activeBridge.host.getState();
            if (world) {
              try {
                render3D(world, canvas, cachedAssets);
              } catch (err) {
                latch(err);
              }
            }
          }
        }
      }
    };
    resizeCanvas();

    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvas);
    cleanups.push(() => resizeObserver.disconnect());

    const [m] = await store.query("match", undefined, { filter: "id=eq.match-01" });
    const [p] = await store.query("player", undefined, { filter: "id=eq.player-local" });
    const frags = await store.query("frag");
    if (fatal) throw fatal;
    if (!canvas.isConnected) {
      cleanup();
      return;
    }
    if (!m || !p) throw new Error("boot: seeded match or player row missing");

    let epochTick = 0;
    if (Array.isArray(frags) && frags.length > 0) {
      for (const f of frags) {
        if (typeof f.tick === "number" && f.tick > epochTick) {
          epochTick = f.tick;
        }
      }
    }

    const bridge = createDoomBridge({
      store,
      referee: cachedReferee,
      onFatal,
      canvas,
      render3D,
      assets: cachedAssets,
      rateHz: 35,
      initialMatch: m,
      initialPlayer: p,
      initialFragCount: frags ? frags.length : 0,
      epochTick
    });

    render3D(bridge.host.getState(), canvas, cachedAssets);

    cleanups.push(() => {
      bridge.pause();
      bridge.dispose();
    });

    const isArenaActive = () => canvas.isConnected && (!screenEl || !screenEl.hidden);

    const onKeyDown = (e) => {
      if (!isArenaActive()) return;
      bridge.setKey(e.key, true);
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        bridge.fireWeapon();
      }
      if (e.key.toLowerCase() === "r") {
        bridge.reloadWeapon();
      }
    };

    const onKeyUp = (e) => {
      bridge.setKey(e.key, false);
    };

    let isDragging = false;
    let lastMouseX = 0;
    const onMouseDown = (e) => {
      if (!isArenaActive()) return;
      isDragging = true;
      lastMouseX = e.clientX;
      bridge.fireWeapon();
    };
    const onMouseMove = (e) => {
      if (!isDragging || !isArenaActive()) return;
      const deltaX = e.clientX - lastMouseX;
      lastMouseX = e.clientX;
      bridge.addMouseLook(deltaX * 0.003);
    };
    const onMouseUp = () => {
      isDragging = false;
    };

    const onBlur = () => {
      isDragging = false;
      for (const k of ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "q", "e"]) {
        bridge.setKey(k, false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    cleanups.push(() => window.removeEventListener("keydown", onKeyDown));
    window.addEventListener("keyup", onKeyUp);
    cleanups.push(() => window.removeEventListener("keyup", onKeyUp));
    window.addEventListener("resize", resizeCanvas);
    cleanups.push(() => window.removeEventListener("resize", resizeCanvas));
    window.addEventListener("blur", onBlur);
    cleanups.push(() => window.removeEventListener("blur", onBlur));

    canvas.addEventListener("mousedown", onMouseDown);
    cleanups.push(() => canvas.removeEventListener("mousedown", onMouseDown));
    window.addEventListener("mousemove", onMouseMove);
    cleanups.push(() => window.removeEventListener("mousemove", onMouseMove));
    window.addEventListener("mouseup", onMouseUp);
    cleanups.push(() => window.removeEventListener("mouseup", onMouseUp));

    let isSyncing = false;
    let syncQueued = false;
    const syncWithStoreMatch = async () => {
      if (isSyncing) {
        syncQueued = true;
        return;
      }
      isSyncing = true;
      try {
        do {
          if (bridge.isDisposed()) return;
          syncQueued = false;
          const rows = await store.query("match", undefined, { filter: "id=eq.match-01" });
          if (bridge.isDisposed()) return;
          const m = rows?.[0];
          if (!m) throw new Error("boot: match row match-01 missing from store");
          if (m.status === "active" && bridge.getMatch().status === "warmup") {
            await bridge.startMatch();
            if (isArenaActive()) bridge.play();
          } else if (m.status === "warmup" && (bridge.getMatch().status !== "warmup" || bridge.getMatch().frags_us !== 0 || bridge.getMatch().frags_them !== 0)) {
            await bridge.resetMatch(m.frag_limit);
          }
        } while (syncQueued);
      } catch (err) {
        if (err instanceof BridgeDisposedError && bridge.isDisposed()) return;
        onFatal(err);
      } finally {
        isSyncing = false;
      }
    };

    const unsubMatch = store.subscribe("match", () => {
      syncWithStoreMatch().catch(onFatal);
    });
    cleanups.push(() => unsubMatch());

    activeBridge = bridge;
    mountedCanvas = canvas;
    cleanupListeners = cleanup;

    await syncWithStoreMatch();
    if (isArenaActive() && bridge.getMatch().status === "active" && !bridge.isTransitioning()) {
      bridge.play();
    }
  } catch (err) {
    cleanup();
    activeBridge = null;
    mountedCanvas = null;
    cleanupListeners = null;
    latch(err);
    throw err;
  } finally {
    isMounting = false;
    if (remountQueued && !fatal) {
      remountQueued = false;
      checkAndMountArena().catch(onFatal);
    }
  }
}

  const observer = new MutationObserver(() => {
    checkAndMountArena().catch(onFatal);
  });
  observer.observe(mount, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  checkAndMountArena().catch(onFatal);
}

if ("serviceWorker" in navigator) {
  await navigator.serviceWorker.register(scriptURL("/offline-first-sw.js"));
}

const shell = await createShell({ config: "./shell.json", mount });
if (!shell.storybook) {
  if (!shell.store) throw new Error("boot: pronto store missing");
  startArena(shell.store);
}