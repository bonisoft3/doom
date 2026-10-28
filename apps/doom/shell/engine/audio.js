export function createAudioSystem(scene = null, meshes = {}, basePath = "shell/assets/sounds/") {
  let ctx = null;
  const audioBuffers = new Map();
  const soundDefs = {
    shot: "shotgun.wav",
    "shotgun-cock": "shotgun_cock.wav",
    pistol: "pistol.wav",
    punch: "punch.wav",
    switch: "switch.wav",
    "door-open": "door_open.wav",
    "door-close": "door_close.wav",
    "door-locked": "switch.wav",
    "pickup-item": "pickup_item.wav",
    "pickup-weapon": "pickup_weapon.wav",
    fireball: "fireball.wav",
    explode: "explode.wav",
    claw: "claw.wav",
    "demon-sight": "demon_sight.wav",
    "demon-hurt": "demon_pain.wav",
    "demon-dead": "demon_death.wav",
    "player-hurt": "player_pain.wav",
    "player-dead": "player_death.wav"
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
      const resp = await fetch(`${basePath}${file}`);
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
    switch() { playSound("switch", 0.4); },
    switchWeapon() { playSound("switch", 0.4); },
    "door-open"() { playSound("door-open"); },
    doorOpen() { playSound("door-open"); },
    "door-close"() { playSound("door-close"); },
    doorClose() { playSound("door-close"); },
    "door-locked"() { playSound("door-locked", 0.7); },
    "pickup-item"() { playSound("pickup-item", 0.5); },
    "pickup-ammo"() { playSound("pickup-item", 0.5); },
    "pickup-health"() { playSound("pickup-item", 0.5); },
    "pickup-armor"() { playSound("pickup-item", 0.5); },
    "pickup-weapon"() { playSound("pickup-weapon", 0.7); },
    fireball() { playSound("fireball", 0.6); },
    explode() { playSound("explode", 0.7); },
    claw() { playSound("claw", 0.6); },
    "demon-sight"() { playSound("demon-sight"); },
    "demon-hurt"() { playSound("demon-hurt"); },
    "demon-dead"() { playSound("demon-dead"); },
    "player-hurt"() { playSound("player-hurt"); },
    "player-dead"() { playSound("player-dead"); },
    "game-start"() { playSound("shot"); },
    pause() {},
    resumeSound() {}
  };
}
