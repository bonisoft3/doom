import { resolveDoomAsset } from "./assets.js";

export function createAudioSystem(scene = null, meshes = {}, basePath = "/shell/assets/sounds/") {
  let ctx = null;
  const audioBuffers = new Map();
  const soundDefs = {
    shot: "shotgun.wav",
    "shotgun-cock": "shotgun_cock.wav",
    pistol: "pistol.wav",
    punch: "punch.wav",
    saw: "punch.wav",
    "saw-hit": "claw.wav",
    rocket: "fireball.wav",
    plasma: "fireball.wav",
    bfg: "fireball.wav",
    switch: "switch.wav",
    "door-open": "door_open.wav",
    "door-close": "door_close.wav",
    "door-locked": "switch.wav",
    "lift-start": "door_open.wav",
    "lift-stop": "switch.wav",
    teleport: "fireball.wav",
    noway: "player_pain.wav",
    secret: "pickup_weapon.wav",
    "pickup-item": "pickup_item.wav",
    "pickup-weapon": "pickup_weapon.wav",
    fireball: "fireball.wav",
    explode: "explode.wav",
    "barrel-explode": "explode.wav",
    claw: "claw.wav",
    bite: "claw.wav",
    "skull-attack": "demon_sight.wav",
    "demon-sight": "demon_sight.wav",
    "demon-hurt": "demon_pain.wav",
    "demon-dead": "demon_death.wav",
    "monster-dead": "demon_death.wav",
    "player-hurt": "player_pain.wav",
    "player-dead": "player_death.wav",
    "menu-move": "switch.wav",
    "menu-select": "pistol.wav",
    "level-exit": "switch.wav",
    "level-start": "shotgun_cock.wav",
    "episode-end": "explode.wav"
  };

  function getAudioContext() {
    if (!ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }
    return ctx;
  }

  async function loadBuffer(name, file) {
    const c = getAudioContext();
    if (!c) return null;
    if (audioBuffers.has(name)) return audioBuffers.get(name);
    try {
      const resp = await fetch(resolveDoomAsset(`${basePath}${file}`));
      if (!resp.ok) return null;
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await c.decodeAudioData(arrayBuf);
      audioBuffers.set(name, audioBuf);
      return audioBuf;
    } catch {
      return null;
    }
  }

  if (typeof window !== "undefined") {
    for (const [name, file] of Object.entries(soundDefs)) {
      loadBuffer(name, file).catch(() => {});
    }
  }

  function playSound(name, volume = 0.6) {
    const c = getAudioContext();
    if (!c) return;
    if (c.state === "suspended") {
      c.resume().catch(() => {});
    }
    const buf = audioBuffers.get(name);
    if (buf) {
      const source = c.createBufferSource();
      source.buffer = buf;
      const gain = c.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(c.destination);
      source.start(0);
    } else if (soundDefs[name]) {
      loadBuffer(name, soundDefs[name]).then(b => {
        if (b && c) {
          const source = c.createBufferSource();
          source.buffer = b;
          const gain = c.createGain();
          gain.gain.value = volume;
          source.connect(gain);
          gain.connect(c.destination);
          source.start(0);
        }
      }).catch(() => {});
    }
  }

  return {
    bindScene(s, m) {},
    async resume() {
      const c = getAudioContext();
      if (c && c.state === "suspended") {
        await c.resume();
      }
    },
    shot() { playSound("shot"); },
    shotgun() { playSound("shot"); },
    "shotgun-cock"() { playSound("shotgun-cock"); },
    pistol() { playSound("pistol"); },
    punch() { playSound("punch"); },
    saw() { playSound("saw", 0.45); },
    "saw-hit"() { playSound("saw-hit", 0.6); },
    rocket() { playSound("rocket", 0.7); },
    plasma() { playSound("plasma", 0.5); },
    bfg() { playSound("bfg", 0.8); },
    switch() { playSound("switch", 0.4); },
    switchWeapon() { playSound("switch", 0.4); },
    "door-open"() { playSound("door-open"); },
    doorOpen() { playSound("door-open"); },
    "door-close"() { playSound("door-close"); },
    doorClose() { playSound("door-close"); },
    "door-locked"() { playSound("door-locked", 0.7); },
    "lift-start"() { playSound("lift-start", 0.6); },
    "lift-stop"() { playSound("lift-stop", 0.5); },
    teleport() { playSound("teleport", 0.7); },
    noway() { playSound("noway", 0.5); },
    secret() { playSound("secret", 0.8); },
    "pickup-item"() { playSound("pickup-item", 0.5); },
    "pickup-ammo"() { playSound("pickup-item", 0.5); },
    "pickup-health"() { playSound("pickup-item", 0.5); },
    "pickup-armor"() { playSound("pickup-item", 0.5); },
    "pickup-weapon"() { playSound("pickup-weapon", 0.7); },
    fireball() { playSound("fireball", 0.6); },
    explode() { playSound("explode", 0.7); },
    "barrel-explode"() { playSound("barrel-explode", 0.7); },
    claw() { playSound("claw", 0.6); },
    bite() { playSound("bite", 0.6); },
    "skull-attack"() { playSound("skull-attack", 0.6); },
    "demon-sight"() { playSound("demon-sight"); },
    "demon-hurt"() { playSound("demon-hurt"); },
    "demon-dead"() { playSound("demon-dead"); },
    "monster-dead"() { playSound("monster-dead"); },
    "player-hurt"() { playSound("player-hurt"); },
    "player-dead"() { playSound("player-dead"); },
    "menu-move"() { playSound("menu-move", 0.4); },
    "menu-select"() { playSound("menu-select", 0.6); },
    "level-exit"() { playSound("level-exit", 0.7); },
    "level-start"() { playSound("level-start", 0.6); },
    "episode-end"() { playSound("episode-end", 0.8); },
    "game-start"() { playSound("shot"); },
    pause() {},
    resumeSound() {}
  };
}
