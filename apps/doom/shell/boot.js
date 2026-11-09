import { createShell } from "/omnishell/interpreter/shell.js";
import { assetURL } from "/omnishell/interpreter/preloads.js";
import { scriptURL } from "/omnishell/interpreter/script-url.js";
import { createDoomBridge, BridgeDisposedError } from "./engine/bridge.js";
import { render3D } from "./engine/renderer.js";
import { loadDoomAssets, resolveDoomAsset } from "./engine/assets.js";
import { createAudioSystem } from "./engine/audio.js";
import { WEAPONS } from "./engine/weapons.js";
import { WEAPON_FRAMES } from "./engine/sprites.js";

const babylon = document.createElement("script");
babylon.src = scriptURL(assetURL("/shell/vendor/babylon/babylon.js", document).href);
await new Promise((resolve, reject) => {
  babylon.onload = resolve;
  babylon.onerror = () => reject(new Error("boot: Babylon failed to load"));
  document.head.append(babylon);
});

const mount = document.getElementById("app");
if (!mount) throw new Error("boot: #app mount missing");

const SLOT_WEAPONS = {
  "1": "fist",
  "2": "pistol",
  "3": "shotgun",
  "4": "chaingun",
  "5": "rocketlauncher",
  "6": "plasmarifle",
  "7": "bfg"
};

function getWeaponAnimation(curW, shootTimer, tick) {
  if (shootTimer === 0) {
    if (curW === "chainsaw") {
      const frameLetter = (Math.floor(tick / 4) % 2 === 0) ? "A" : "B";
      return { frame: `SAWG${frameLetter}`, flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1 };
    }
    const prefix = WEAPON_FRAMES[curW]?.sprite || "PISG";
    return { frame: `${prefix}A`, flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1 };
  }

  const cd = WEAPONS[curW]?.cooldown || 14;
  const elapsed = cd - shootTimer;

  switch (curW) {
    case "shotgun": {
      if (elapsed < 3) return { frame: "SHTGA", flash: "SHTFA", recoilX: 0, recoilY: -10, recoilRot: 0, recoilScale: 1.03 };
      if (elapsed < 7) return { frame: "SHTGA", flash: "SHTFB", recoilX: 0, recoilY: -3, recoilRot: 0, recoilScale: 1.0 };
      if (elapsed < 12) return { frame: "SHTGB", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
      if (elapsed < 18) return { frame: "SHTGC", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
      if (elapsed < 24) return { frame: "SHTGD", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
      if (elapsed < 30) return { frame: "SHTGC", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
      if (elapsed < 34) return { frame: "SHTGB", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
      return { frame: "SHTGA", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
    }
    case "pistol": {
      if (elapsed < 3) return { frame: "PISGA", flash: "PISFA", recoilX: 0, recoilY: -8, recoilRot: -1.5, recoilScale: 1.02 };
      if (elapsed < 7) return { frame: "PISGB", flash: null, recoilX: 0, recoilY: 2, recoilRot: -0.5, recoilScale: 1.0 };
      if (elapsed < 11) return { frame: "PISGC", flash: null, recoilX: 0, recoilY: 1, recoilRot: 0, recoilScale: 1.0 };
      return { frame: "PISGA", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
    }
    case "chaingun": {
      const alt = (Math.floor(elapsed / 2) % 2 === 0);
      const jx = (shootTimer % 2 === 0 ? 1 : -1);
      const jy = (shootTimer % 2 === 0 ? -3 : 2);
      return {
        frame: alt ? "CHGGA" : "CHGGB",
        flash: alt ? "CHGFA" : "CHGFB",
        recoilX: jx,
        recoilY: jy,
        recoilRot: 0,
        recoilScale: 1.01
      };
    }
    case "rocketlauncher": {
      if (elapsed < 4) return { frame: "MISGB", flash: "MISFA", recoilX: 0, recoilY: -14, recoilRot: 0, recoilScale: 1.04 };
      if (elapsed < 8) return { frame: "MISGB", flash: "MISFB", recoilX: 0, recoilY: -7, recoilRot: 0, recoilScale: 1.02 };
      if (elapsed < 12) return { frame: "MISGB", flash: "MISFC", recoilX: 0, recoilY: 4, recoilRot: 0, recoilScale: 1.0 };
      if (elapsed < 16) return { frame: "MISGB", flash: "MISFD", recoilX: 0, recoilY: 2, recoilRot: 0, recoilScale: 1.0 };
      return { frame: "MISGA", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
    }
    case "plasmarifle": {
      const alt = (elapsed % 2 === 0);
      return {
        frame: alt ? "PLSGA" : "PLSGB",
        flash: alt ? "PLSFA" : "PLSFB",
        recoilX: 0,
        recoilY: alt ? -3 : 1,
        recoilRot: 0,
        recoilScale: 1.01
      };
    }
    case "bfg": {
      if (elapsed < 20) {
        const shake = Math.sin(elapsed * 1.5) * 2;
        return { frame: "BFGGA", flash: null, recoilX: shake, recoilY: shake, recoilRot: 0, recoilScale: 1.0 };
      }
      if (elapsed < 30) return { frame: "BFGGB", flash: "BFGFA", recoilX: 0, recoilY: -18, recoilRot: 0, recoilScale: 1.05 };
      if (elapsed < 40) return { frame: "BFGGB", flash: "BFGFB", recoilX: 0, recoilY: -10, recoilRot: 0, recoilScale: 1.02 };
      if (elapsed < 50) return { frame: "BFGGC", flash: null, recoilX: 0, recoilY: 4, recoilRot: 0, recoilScale: 1.0 };
      return { frame: "BFGGA", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
    }
    case "fist": {
      let frame = "PUNGA";
      if (elapsed < 4) frame = "PUNGB";
      else if (elapsed < 9) frame = "PUNGC";
      else if (elapsed < 14) frame = "PUNGD";
      else if (elapsed < 18) frame = "PUNGC";
      else frame = "PUNGB";
      return { frame, flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
    }
    case "chainsaw": {
      const alt = (Math.floor(tick / 2) % 2 === 0);
      const jx = (tick % 2 === 0 ? 1 : -1);
      const jy = (tick % 2 === 0 ? -2 : 2);
      return { frame: alt ? "SAWGC" : "SAWGD", flash: null, recoilX: jx, recoilY: jy, recoilRot: 0, recoilScale: 1.0 };
    }
    default:
      return { frame: "PISGA", flash: null, recoilX: 0, recoilY: 0, recoilRot: 0, recoilScale: 1.0 };
  }
}

function startArena(store) {
  let activeBridge = null;
let cleanupListeners = null;
let mountedCanvas = null;
let isMounting = false;
let remountQueued = false;
let cachedAssets = null;
let cachedReferee = null;
let cachedSfx = null;
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
      const res = await fetch(assetURL("/shell/handlers/referee.js", document).href);
      if (!res.ok) throw new Error(`boot: referee.js fetch failed with HTTP ${res.status}`);
      const src = await res.text();
      cachedReferee = await evaluateRole(src, "handler");
    }
    if (fatal) throw fatal;

    if (!cachedAssets) cachedAssets = await loadDoomAssets("/shell/assets/");
    if (!cachedSfx) cachedSfx = createAudioSystem(null, {}, "/shell/assets/sounds/");
    if (fatal) throw fatal;
    if (!canvas.isConnected) {
      cleanup();
      return;
    }

    let currentBobX = 0;
    let currentBobY = 0;
    let msgTimer = null;
    cleanups.push(() => {
      if (msgTimer) clearTimeout(msgTimer);
    });

    const updateArenaOverlay = (world, alpha = 1, tick = 0) => {
      if (!world || !world.player) return;
      const p = world.player;
      const weaponStage = document.getElementById("doom-weapon-stage");
      const weaponImg = document.getElementById("doom-weapon-img");
      const flashImg = document.getElementById("doom-flash-img");
      const faceImg = document.getElementById("doom-face-img");
      const flashEl = document.getElementById("doom-damage-flash");
      const msgBanner = document.getElementById("doom-msg-banner");

      if (flashEl) {
        flashEl.style.background = p.damageFlash > 0
          ? `rgba(220, 20, 20, ${0.15 + (p.damageFlash / 6) * 0.35})`
          : "transparent";
      }

      if (faceImg) {
        let fSrc = "/shell/assets/sprites/face_normal.png";
        if (p.status === "over" && p.health <= 0) fSrc = "/shell/assets/sprites/face_dead.png";
        else if (p.shootTimer > 0) fSrc = "/shell/assets/sprites/face_evil.png";
        else if (p.damageFlash > 0) fSrc = "/shell/assets/sprites/face_kill.png";
        else if (p.faceLook < 0) fSrc = "/shell/assets/sprites/face_left.png";
        else if (p.faceLook > 0) fSrc = "/shell/assets/sprites/face_right.png";
        const resolvedFace = resolveDoomAsset(fSrc);
        if (faceImg.dataset.src !== resolvedFace) {
          faceImg.src = resolvedFace;
          faceImg.dataset.src = resolvedFace;
        }
      }

      if (weaponStage && weaponImg && flashImg && cachedAssets?.sprites) {
        const curW = p.weapon;
        const anim = getWeaponAnimation(curW, p.shootTimer, tick);
        const viewH = canvas.clientHeight || (window.innerHeight - 64);
        const S = Math.max(1.8, Math.min(3.8, viewH / 190));

        if (p.health <= 0) {
          weaponStage.style.transform = `translate3d(0, ${300 * (S / 3)}px, 0)`;
          flashImg.hidden = true;
        } else {
          const frameMeta = cachedAssets.sprites[anim.frame];
          if (frameMeta) {
            const xRelCenter = -frameMeta.left - 160;
            const yFromStatus = 168 - (-frameMeta.top + frameMeta.height);
            weaponImg.style.insetInlineStart = `${xRelCenter * S}px`;
            weaponImg.style.insetBlockEnd = `${yFromStatus * S}px`;
            weaponImg.style.inlineSize = `${frameMeta.width * S}px`;
            weaponImg.style.blockSize = `${frameMeta.height * S}px`;
            const wSrc = resolveDoomAsset(`/shell/assets/things/${anim.frame.toLowerCase()}.png`);
            if (weaponImg.dataset.src !== wSrc) {
              weaponImg.src = wSrc;
              weaponImg.dataset.src = wSrc;
            }
          }

          if (anim.flash) {
            const flashMeta = cachedAssets.sprites[anim.flash];
            if (flashMeta) {
              const xRelCenter = -flashMeta.left - 160;
              const yFromStatus = 168 - (-flashMeta.top + flashMeta.height);
              flashImg.style.insetInlineStart = `${xRelCenter * S}px`;
              flashImg.style.insetBlockEnd = `${yFromStatus * S}px`;
              flashImg.style.inlineSize = `${flashMeta.width * S}px`;
              flashImg.style.blockSize = `${flashMeta.height * S}px`;
              const fSrc = resolveDoomAsset(`/shell/assets/things/${anim.flash.toLowerCase()}.png`);
              if (flashImg.dataset.src !== fSrc) {
                flashImg.src = fSrc;
                flashImg.dataset.src = fSrc;
              }
              flashImg.hidden = false;
            } else {
              flashImg.hidden = true;
            }
          } else {
            flashImg.hidden = true;
          }

          weaponImg.style.filter = anim.flash ? "brightness(1.28) contrast(1.08)" : "none";

          const speed = Math.hypot(p.momx || 0, p.momy || 0);
          if (speed > 0.2) {
            const subTick = tick + (typeof alpha === "number" ? alpha : 0);
            const bobPhase = subTick * 0.38;
            const targetBobX = Math.sin(bobPhase) * Math.min(10, speed * 0.7) * (S / 3);
            const targetBobY = Math.abs(Math.sin(bobPhase)) * Math.min(6, speed * 0.5) * (S / 3);
            currentBobX += (targetBobX - currentBobX) * 0.3;
            currentBobY += (targetBobY - currentBobY) * 0.3;
          } else {
            currentBobX *= 0.8;
            currentBobY *= 0.8;
          }

          const finalX = (anim.recoilX * (S / 3)) + currentBobX;
          const finalY = (anim.recoilY * (S / 3)) + currentBobY;
          weaponStage.style.transform = `translate3d(${finalX}px, ${finalY}px, 0) rotate(${anim.recoilRot}deg) scale(${anim.recoilScale})`;
        }
      }

      if (Array.isArray(p.weapons)) {
        document.querySelectorAll(".arm-slot[data-has]").forEach((slot) => {
          const slotNum = slot.getAttribute("data-has");
          const wName = SLOT_WEAPONS[slotNum];
          const owned = wName ? p.weapons.includes(wName) : false;
          slot.classList.toggle("owned", owned);
          slot.classList.toggle("active", wName === p.weapon);
        });
      }

      if (msgBanner && Array.isArray(world.events)) {
        for (const ev of world.events) {
          if (typeof ev === "string" && ev.startsWith("msg:")) {
            msgBanner.textContent = ev.slice(4).toUpperCase();
            msgBanner.hidden = false;
            if (msgTimer) clearTimeout(msgTimer);
            msgTimer = setTimeout(() => {
              msgBanner.hidden = true;
            }, 3000);
          }
        }
      }
    };

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
                updateArenaOverlay(world, 1, world.tick ?? 0);
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
      sfx: cachedSfx,
      rateHz: 35,
      initialMatch: { mode: "campaign", ...m },
      initialPlayer: p,
      initialFragCount: frags ? frags.length : 0,
      epochTick,
      onRender(_prev, world, alpha, tick) {
        updateArenaOverlay(world, alpha, tick);
      }
    });

    render3D(bridge.host.getState(), canvas, cachedAssets);
    updateArenaOverlay(bridge.host.getState(), 1, 0);

    cleanups.push(() => {
      bridge.pause();
      bridge.dispose();
    });

    const isArenaActive = () => canvas.isConnected && (!screenEl || !screenEl.hidden);

    const ensureAudioAndWarmup = (autoStart = false) => {
      cachedSfx.resume().catch(() => {});
      if (autoStart && bridge.getMatch().status === "warmup") {
        const startBtn = document.getElementById("btn-start");
        if (startBtn) startBtn.click();
      }
    };

    const onKeyDown = (e) => {
      if (!isArenaActive()) return;
      ensureAudioAndWarmup(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "enter"].includes(e.key.toLowerCase()));
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
      ensureAudioAndWarmup(true);
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

    const onDocClick = (e) => {
      if (!isArenaActive()) return;
      cachedSfx.resume().catch(() => {});
      const slot = e.target?.closest?.(".arm-slot[data-has]");
      if (slot) {
        const slotNum = slot.getAttribute("data-has");
        if (slotNum) bridge.setKey(slotNum, true);
      }
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
    document.addEventListener("click", onDocClick);
    cleanups.push(() => document.removeEventListener("click", onDocClick));

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
            render3D(bridge.host.getState(), canvas, cachedAssets);
            updateArenaOverlay(bridge.host.getState(), 1, 0);
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