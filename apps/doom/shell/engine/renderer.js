// Babylon.js view of a sector level. Map units scale by 1/64 into scene
// units; map (x, y) is scene (x, z) and heights are scene y. Static geometry
// is merged per material; sectors that can move (and walls touching them)
// keep their own meshes and follow the world's sector heights.

import { LINE_FLAGS, LINE_SPECIALS, SECTOR_SPECIALS, THING_TYPES } from "./catalog.js";
import { getLevel, levelIndex, sectorAt } from "./level.js";
import { ceilOf, floorOf, sectorProp } from "./sectors.js";
import { EFFECT_FRAMES, MISSILE_FRAMES, MONSTER_FRAMES } from "./sprites.js";
import { MONSTERS } from "./monsters_table.js";
import { ANG_FULL, ANG180, ANG90, PLAYER, cosOf, sinOf } from "./constants.js";
import { WEAPONS } from "./weapons.js";

const S = 1 / 64;
const SKY_FLAT = "F_SKY1";
const ANIM_TICS = 8;
const LIGHT_BUCKETS = 16;

// Doom's sector light effects as a function of the tic: deterministic, so
// rewinding the simulation replays them.
function hash(a, b) {
  let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b, 0xC2B2AE35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function neighborMinLight(world, level, s) {
  const own = sectorProp(world, level, s, "light");
  let min = own;
  for (const n of levelIndex(level).neighbors[s]) min = Math.min(min, sectorProp(world, level, n, "light"));
  return min === own ? 0 : min;
}

export function lightAt(world, level, s, tick) {
  const light = sectorProp(world, level, s, "light");
  const effect = SECTOR_SPECIALS[sectorProp(world, level, s, "special")]?.light;
  if (!effect) return light;
  const low = neighborMinLight(world, level, s);
  switch (effect) {
    case "blink-random":
    case "flicker":
      return hash(s, tick >> 2) < 0.5 ? light : low;
    case "strobe-fast":
    case "strobe-fast-sync":
      return (tick + (effect === "strobe-fast" ? s * 7 : 0)) % 20 < 5 ? light : low;
    case "strobe-slow":
      return (tick + s * 7) % 40 < 5 ? light : low;
    case "glow": {
      const span = Math.max(1, light - low);
      const t = (tick * 8) % (span * 2);
      return low + (t < span ? span - t : t - span);
    }
    default:
      throw new Error(`sector light effect ${effect} is not implemented`);
  }
}

const brightness = (light) => Math.max(0.08, Math.min(1, light / 255));

// Sectors whose heights, flats or light can change: their floors, ceilings and
// adjacent walls stay individual meshes.
function dynamicSectors(level) {
  const ix = levelIndex(level);
  const out = new Set();
  level.lines.forEach((line, i) => {
    const def = LINE_SPECIALS[line.special];
    if (!def || def.action === "exit" || def.action === "teleport" || def.action === "scroll") return;
    if (def.trigger[0] === "D") { if (ix.lineBack[i] >= 0) out.add(ix.lineBack[i]); }
    else for (const s of ix.tagSectors.get(line.tag) || []) out.add(s);
  });
  level.sectors.forEach((s, i) => { if (SECTOR_SPECIALS[s.special]?.light) out.add(i); });
  return out;
}

class LevelView {
  constructor(B, scene, level, assets) {
    this.B = B;
    this.scene = scene;
    this.level = level;
    this.assets = assets;
    this.meshes = [];
    this.materials = new Map();
    this.textures = new Map();
    this.dynamic = dynamicSectors(level);
    this.sectorMeshes = new Map();
    this.wallPieces = [];
    this.lastHeights = new Map();
    this.animated = new Map();
    for (const group of [...assets.graphics.animations.textures, ...assets.graphics.animations.flats]) {
      group.forEach((name, k) => this.animated.set(name, { group, offset: k }));
    }
    this.build();
  }

  // Sprites and masked middle textures are alpha-tested; everything else is opaque.
  texture(kind, name, alpha = kind === "things") {
    const key = `${kind}/${name}/${alpha}`;
    let t = this.textures.get(key);
    if (!t) {
      const mode = kind === "things" ? this.B.Texture.NEAREST_SAMPLINGMODE : this.B.Texture.BILINEAR_SAMPLINGMODE;
      t = new this.B.Texture(`${this.assets.basePath}${kind}/${name.toLowerCase()}.png`, this.scene, false, true, mode);
      if (kind !== "things") {
        t.anisotropicFilteringLevel = 4;
      }
      t.hasAlpha = alpha;
      this.textures.set(key, t);
    }
    return t;
  }

  material(kind, name, masked = false) {
    const key = `${kind}/${name}/${masked}`;
    let m = this.materials.get(key);
    if (!m) {
      const B = this.B;
      // Unlit: the texture times the vertex colour (the sector's light).
      m = new B.StandardMaterial(key, this.scene);
      m.diffuseTexture = this.texture(kind, name, masked);
      m.disableLighting = false;
      m.maxSimultaneousLights = 6;
      m.emissiveColor = new B.Color3(1, 1, 1);
      m.diffuseColor = new B.Color3(0.5, 0.5, 0.5);
      m.specularColor = new B.Color3(0, 0, 0);
      m.backFaceCulling = !masked;
      if (masked) {
        // The alpha test reads the material's alpha, which comes from the texture only with this flag.
        m.useAlphaFromDiffuseTexture = true;
        m.transparencyMode = B.Material.MATERIAL_ALPHATEST;
      }
      m.doomAnim = this.animated.get(name) ? { kind, name, masked } : null;
      this.materials.set(key, m);
    }
    return m;
  }

  mesh(name, positions, indices, uvs, colors, material) {
    const B = this.B;
    const mesh = new B.Mesh(name, this.scene);
    const vd = new B.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.uvs = uvs;
    vd.colors = colors;
    const normals = [];
    B.VertexData.ComputeNormals(positions, indices, normals);
    vd.normals = normals;
    vd.applyToMesh(mesh, true);
    mesh.material = material;
    this.meshes.push(mesh);
    return mesh;
  }

  // Floor or ceiling of a sector: its subsector polygons, flat-aligned UVs,
  // built at height 0 so moving the sector only moves the mesh.
  plane(s, which, buf) {
    const flipped = which === "ceil";
    for (const ss of this.level.subsectors) {
      if (ss.sector !== s || ss.polygon.length < 3) continue;
      const base = buf.positions.length / 3;
      for (const [x, y] of ss.polygon) {
        buf.positions.push(x * S, 0, y * S);
        buf.uvs.push(x / 64, -y / 64);
        buf.colors.push(buf.light, buf.light, buf.light, 1);
      }
      for (let k = 1; k + 1 < ss.polygon.length; k++) {
        if (flipped) buf.indices.push(base, base + k + 1, base + k);
        else buf.indices.push(base, base + k, base + k + 1);
      }
    }
  }

  // The visible pieces of one side of a line, given current heights.
  sidePieces(world, i, back) {
    const level = this.level;
    const line = level.lines[i];
    const sideIndex = back ? line.back : line.front;
    if (sideIndex < 0) return [];
    const side = level.sides[sideIndex];
    const ix = levelIndex(level);
    const s = back ? ix.lineBack[i] : ix.lineFront[i];
    const o = back ? ix.lineFront[i] : ix.lineBack[i];
    const f = floorOf(world, level, s), c = ceilOf(world, level, s);
    const out = [];
    if (o < 0) {
      if (side.middle) out.push({ kind: "middle", texture: side.middle, bottom: f, top: c, textop: line.flags & LINE_FLAGS.LOWER_UNPEGGED ? f + this.texHeight(side.middle) : c });
      return out;
    }
    const of = floorOf(world, level, o), oc = ceilOf(world, level, o);
    const sky = sectorProp(world, level, s, "ceilFlat") === SKY_FLAT && sectorProp(world, level, o, "ceilFlat") === SKY_FLAT;
    if (oc < c && side.upper && !sky) {
      out.push({ kind: "upper", texture: side.upper, bottom: oc, top: c, textop: line.flags & LINE_FLAGS.UPPER_UNPEGGED ? c : oc + this.texHeight(side.upper) });
    }
    if (of > f && side.lower) {
      out.push({ kind: "lower", texture: side.lower, bottom: f, top: of, textop: line.flags & LINE_FLAGS.LOWER_UNPEGGED ? c : of });
    }
    if (side.middle) {
      const lo = Math.max(f, of), hi = Math.min(c, oc);
      const h = this.texHeight(side.middle);
      const textop = line.flags & LINE_FLAGS.LOWER_UNPEGGED ? lo + h : hi;
      const top = Math.min(hi, textop + side.yoff), bottom = Math.max(lo, textop + side.yoff - h);
      if (top > bottom) out.push({ kind: "middle", texture: side.middle, bottom, top, textop, masked: true });
    }
    return out;
  }

  texHeight(name) {
    const t = this.assets.graphics.textures[name];
    if (!t) throw new Error(`texture ${name} is not in the graphics index`);
    return t.height;
  }

  quad(i, back, piece, buf, light) {
    const level = this.level;
    const line = level.lines[i];
    const side = level.sides[back ? line.back : line.front];
    const [ax, ay] = level.vertices[back ? line.v2 : line.v1];
    const [bx, by] = level.vertices[back ? line.v1 : line.v2];
    const len = Math.hypot(bx - ax, by - ay);
    const { width, height } = this.assets.graphics.textures[piece.texture];
    const u0 = side.xoff / width, u1 = (side.xoff + len) / width;
    const v = (z) => -(piece.textop - z + (piece.masked ? 0 : side.yoff)) / height;
    const base = buf.positions.length / 3;
    buf.positions.push(ax * S, piece.bottom * S, ay * S, bx * S, piece.bottom * S, by * S, bx * S, piece.top * S, by * S, ax * S, piece.top * S, ay * S);
    buf.uvs.push(u0, v(piece.bottom), u1, v(piece.bottom), u1, v(piece.top), u0, v(piece.top));
    for (let k = 0; k < 4; k++) buf.colors.push(light, light, light, 1);
    buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build() {
    const level = this.level;
    const world0 = { sectors: {} };
    const ix = levelIndex(level);
    const merged = new Map();
    const bufFor = (key) => {
      if (!merged.has(key)) merged.set(key, { positions: [], indices: [], uvs: [], colors: [] });
      return merged.get(key);
    };

    level.sectors.forEach((sec, s) => {
      for (const which of ["floor", "ceil"]) {
        const flat = which === "floor" ? sec.floorFlat : sec.ceilFlat;
        if (flat === SKY_FLAT) continue;
        const light = brightness(sec.light);
        if (this.dynamic.has(s)) {
          const buf = { positions: [], indices: [], uvs: [], colors: [], light: 1 };
          this.plane(s, which, buf);
          if (!buf.indices.length) continue;
          const mesh = this.mesh(`sector${s}_${which}`, buf.positions, buf.indices, buf.uvs, buf.colors, this.material("flats", flat));
          mesh.position.y = (which === "floor" ? sec.floor : sec.ceil) * S;
          this.sectorMeshes.set(`${s}/${which}`, { mesh, flat });
        } else {
          const buf = bufFor(`flats|${flat}|${which}`);
          buf.light = light;
          const start = buf.positions.length;
          this.plane(s, which, buf);
          const h = (which === "floor" ? sec.floor : sec.ceil) * S;
          for (let k = start + 1; k < buf.positions.length; k += 3) buf.positions[k] = h;
        }
      }
    });

    level.lines.forEach((line, i) => {
      const def = LINE_SPECIALS[line.special];
      const special = def && (def.trigger[0] === "S" || def.trigger[0] === "G" || def.action === "scroll");
      for (const back of [false, true]) {
        const s = back ? ix.lineBack[i] : ix.lineFront[i];
        const o = back ? ix.lineFront[i] : ix.lineBack[i];
        if (s < 0) continue;
        const dyn = special || this.dynamic.has(s) || (o >= 0 && this.dynamic.has(o));
        if (dyn) {
          for (const kind of ["upper", "middle", "lower"]) this.wallPieces.push({ line: i, back, kind, sector: s, mesh: null, geom: "" });
          continue;
        }
        const light = brightness(level.sectors[s].light);
        for (const piece of this.sidePieces(world0, i, back)) this.quad(i, back, piece, bufFor(`textures|${piece.texture}|${piece.masked ? 1 : 0}`), light);
      }
    });

    for (const [key, buf] of merged) {
      if (!buf.indices.length) continue;
      const [kind, name, flag] = key.split("|");
      this.mesh(`static_${key}`, buf.positions, buf.indices, buf.uvs, buf.colors, this.material(kind, name, kind === "textures" && flag === "1"));
    }

    this.skyName = this.assets.graphics.sky.texture;
  }

  update(world, tick) {
    const level = this.level;
    for (const s of this.dynamic) {
      const f = floorOf(world, level, s), c = ceilOf(world, level, s);
      const ff = sectorProp(world, level, s, "floorFlat");
      const key = `${f}/${c}/${ff}`;
      if (this.lastHeights.get(s) !== key) {
        this.lastHeights.set(s, key);
        const floor = this.sectorMeshes.get(`${s}/floor`);
        if (floor) {
          floor.mesh.position.y = f * S;
          if (floor.flat !== ff) { floor.flat = ff; floor.mesh.material = this.material("flats", ff); }
        }
        const ceil = this.sectorMeshes.get(`${s}/ceil`);
        if (ceil) ceil.mesh.position.y = c * S;
      }
      const light = brightness(lightAt(world, level, s, tick));
      for (const which of ["floor", "ceil"]) {
        const m = this.sectorMeshes.get(`${s}/${which}`);
        if (m && m.light !== light) { m.light = light; setMeshLight(this.B, m.mesh, light); }
      }
    }
    // Dynamic wall pieces rebuild only when their geometry, texture or light changed.
    for (const w of this.wallPieces) {
      const switched = world.switches[w.line] !== undefined;
      const scroll = LINE_SPECIALS[level.lines[w.line].special]?.action === "scroll" ? tick : 0;
      const piece = this.sidePieces(world, w.line, w.back).find((p) => p.kind === w.kind);
      const light = brightness(lightAt(world, level, w.sector, tick));
      const geomKey = `${switched}/${piece ? `${piece.bottom}/${piece.top}/${piece.texture}` : "none"}/${light}/${scroll}`;
      if (w.geom === geomKey) continue;
      if (w.mesh) { w.mesh.dispose(); this.meshes = this.meshes.filter((m) => m !== w.mesh); w.mesh = null; }
      w.geom = geomKey;
      if (!piece || piece.top <= piece.bottom) continue;
      let name = piece.texture;
      if (switched) name = swapSwitch(this.assets.graphics.switches, name);
      const buf = { positions: [], indices: [], uvs: [], colors: [] };
      this.quad(w.line, w.back, { ...piece, texture: name }, buf, light);
      if (scroll) for (let k = 0; k < buf.uvs.length; k += 2) buf.uvs[k] += scroll / this.assets.graphics.textures[name].width;
      w.mesh = this.mesh(`wall${w.line}_${w.back ? 1 : 0}_${w.kind}`, buf.positions, buf.indices, buf.uvs, buf.colors, this.material("textures", name, Boolean(piece.masked)));
    }
    for (const m of this.materials.values()) {
      if (!m.doomAnim) continue;
      const { group, offset } = this.animated.get(m.doomAnim.name);
      const frame = group[(offset + Math.floor(tick / ANIM_TICS)) % group.length];
      m.diffuseTexture = this.texture(m.doomAnim.kind, frame, m.doomAnim.masked);
    }
  }

  dispose() {
    for (const m of this.meshes) m.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.meshes = [];
    this.materials.clear();
  }
}

function setMeshLight(B, mesh, light) {
  const n = mesh.getTotalVertices();
  const colors = new Array(n * 4);
  for (let k = 0; k < n; k++) { colors[k * 4] = colors[k * 4 + 1] = colors[k * 4 + 2] = light; colors[k * 4 + 3] = 1; }
  mesh.setVerticesData(B.VertexBuffer.ColorKind, colors, true);
}

function swapSwitch(switches, name) {
  for (const [off, on] of switches) {
    if (name === off) return on;
    if (name === on) return off;
  }
  return name;
}

// A sprite frame for each visible thing: [frameName, x, y, z, sector, options].
function thingSprites(world, level, sprites, tick, prevWorld = null, alpha = 1) {
  const out = [];
  const frames = (prefix) => Object.keys(sprites).filter((k) => k.startsWith(prefix)).map((k) => k[4]).sort().join("");
  const cycle = (prefix, every) => {
    const f = frames(prefix);
    return prefix + f[Math.floor(tick / every) % f.length];
  };
  const at = (x, y) => sectorAt(level, x, y);

  const prevMonsters = prevWorld?.monsters ? new Map(prevWorld.monsters.map((m) => [m.id, m])) : null;
  const prevProjectiles = prevWorld?.projectiles ? new Map(prevWorld.projectiles.map((p) => [p.id, p])) : null;
  const a = Math.max(0, Math.min(1, typeof alpha === "number" ? alpha : 1));

  for (const m of world.monsters) {
    const name = THING_TYPES[m.type].monster;
    const fr = MONSTER_FRAMES[name];
    const sprite = THING_TYPES[m.type].sprite;
    let letter;
    if (m.health <= 0) {
      const k = Math.floor(m.frame / 5);
      if (name === "lostsoul" && k >= fr.death.length) continue;
      letter = fr.death[Math.min(fr.death.length - 1, k)];
    } else if (m.state === "pain") letter = fr.pain;
    else if (m.state === "attack" || m.state === "skullfly") {
      const def = MONSTERS[name];
      letter = fr.attack[Math.min(fr.attack.length - 1, Math.floor((m.frame * fr.attack.length) / def.attackTics))];
    } else letter = fr.walk[m.frame % fr.walk.length];

    let mx = m.x, my = m.y, mz = m.z;
    if (prevMonsters) {
      const pm = prevMonsters.get(m.id);
      if (pm && pm.health > 0) {
        mx = pm.x + (m.x - pm.x) * a;
        my = pm.y + (m.y - pm.y) * a;
        mz = pm.z + (m.z - pm.z) * a;
      }
    }

    out.push({ frame: sprite + letter, x: mx, y: my, z: mz, sector: at(m.x, m.y), ghost: name === "spectre" });
  }
  for (const b of world.barrels) {
    if (b.state === "dead") continue;
    const frame = b.state === "exploding" ? EFFECT_FRAMES.barrelBurst.sprite + EFFECT_FRAMES.barrelBurst.frames[Math.max(0, 4 - b.tics)] : cycle(EFFECT_FRAMES.barrel.sprite, 6);
    out.push({ frame, x: b.x, y: b.y, z: b.z, sector: at(b.x, b.y) });
  }
  const pickup = (type, x, y) => {
    const def = THING_TYPES[type];
    const s = at(x, y);
    out.push({ frame: cycle(def.sprite, 6), x, y, z: floorOf(world, level, s), sector: s });
  };
  for (const i of world.pickups) if (!world.collected.includes(i)) pickup(level.things[i].type, level.things[i].x, level.things[i].y);
  for (const d of world.drops) pickup(d.type, d.x, d.y);
  for (const t of level.things) {
    const def = THING_TYPES[t.type];
    if (def.kind !== "decor") continue;
    const s = at(t.x, t.y);
    const frame = def.frame === "A" ? cycle(def.sprite, 8) : def.sprite + def.frame;
    const z = def.hanging ? ceilOf(world, level, s) - sprites[frame].height : floorOf(world, level, s);
    out.push({ frame, x: t.x, y: t.y, z, sector: s });
  }
  for (const p of world.projectiles) {
    const fr = MISSILE_FRAMES[p.missile];
    const frame = p.state === "explode"
      ? fr.burst + fr.explode[Math.min(fr.explode.length - 1, Math.floor(((8 - p.tics) * fr.explode.length) / 8))]
      : fr.sprite + fr.fly[Math.floor(tick / 4) % fr.fly.length];

    let px = p.x, py = p.y, pz = p.z;
    if (prevProjectiles && p.state === "fly") {
      const pp = prevProjectiles.get(p.id);
      if (pp && pp.state === "fly") {
        px = pp.x + (p.x - pp.x) * a;
        py = pp.y + (p.y - pp.y) * a;
        pz = pp.z + (p.z - pp.z) * a;
      }
    }

    out.push({ frame, x: px, y: py, z: pz, sector: at(p.x, p.y), bright: true });
  }
  for (const p of world.puffs) {
    const f = EFFECT_FRAMES.puff.frames;
    out.push({ frame: EFFECT_FRAMES.puff.sprite + f[Math.min(f.length - 1, 8 - p.tics >> 1)], x: p.x, y: p.y, z: p.z, sector: at(p.x, p.y), bright: true });
  }
  return out;
}

export class DoomBabylonRenderer {
  constructor(canvas, assets) {
    const B = globalThis.BABYLON;
    if (!B) throw new Error("DoomBabylonRenderer: BABYLON is required");
    this.B = B;
    this.canvas = canvas;
    this.assets = assets;
    this.engine = new B.Engine(canvas, false, { preserveDrawingBuffer: true, stencil: false });
    this.scene = new B.Scene(this.engine);
    this.scene.clearColor = new B.Color4(0, 0, 0, 1);
    this.scene.fogMode = B.Scene.FOGMODE_LINEAR;
    this.scene.fogColor = new B.Color3(0, 0, 0);
    this.scene.fogStart = 6.0;
    this.scene.fogEnd = 30.0;
    this.camera = new B.TargetCamera("doomCam", new B.Vector3(0, 1, 0), this.scene);
    this.camera.fovMode = B.Camera.FOVMODE_HORIZONTAL_FIXED;
    this.camera.fov = Math.PI / 2;
    this.camera.minZ = 0.05;
    this.camera.maxZ = 400;
    this.sky = new B.Layer("sky", `${assets.basePath}textures/${assets.graphics.sky.texture}.png`, this.scene, true);
    this.view = null;
    this.pool = [];
    this.spriteMaterials = new Map();

    // Selective glow for bright energy projectiles and muzzle flashes
    if (B.GlowLayer) {
      this.glow = new B.GlowLayer("doomGlow", this.scene, { mainTextureRatio: 0.5, blurKernelSize: 16 });
      this.glow.intensity = 0.75;
      this.glow.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
        if (mesh.doomPlasma) {
          result.set(0.3, 0.7, 1.0, 1);
        } else if (mesh.doomGreen) {
          result.set(0.2, 1.0, 0.3, 1);
        } else if (mesh.doomBright) {
          result.set(1.0, 0.8, 0.3, 1);
        } else {
          result.set(0, 0, 0, 0);
        }
      };
    }

    // Atmospheric tone & vignette post-processing
    if (B.DefaultRenderingPipeline) {
      this.pipeline = new B.DefaultRenderingPipeline("doomPipeline", true, this.scene, [this.camera]);
      if (this.pipeline.imageProcessing) {
        this.pipeline.imageProcessing.vignetteEnabled = true;
        this.pipeline.imageProcessing.vignetteWeight = 1.6;
        this.pipeline.imageProcessing.vignetteStretch = 0.5;
        this.pipeline.imageProcessing.vignetteColor = new B.Color4(0, 0, 0, 0);
        this.pipeline.imageProcessing.contrast = 1.12;
        this.pipeline.imageProcessing.exposure = 1.05;
      }
    }

    // Dynamic projectile & muzzle flash point lights
    this.lights = [];
    if (B.PointLight) {
      for (let i = 0; i < 6; i++) {
        const light = new B.PointLight(`dynLight_${i}`, new B.Vector3(0, 0, 0), this.scene);
        light.intensity = 1.2;
        light.range = 8.0;
        light.setEnabled(false);
        this.lights.push(light);
      }
    }

    // Contact drop shadows for grounding actors
    this.shadowPool = [];
    if (B.DynamicTexture && B.StandardMaterial) {
      this.shadowMaterial = new B.StandardMaterial("shadowMat", this.scene);
      this.shadowMaterial.diffuseColor = new B.Color3(0, 0, 0);
      this.shadowMaterial.emissiveColor = new B.Color3(0, 0, 0);
      this.shadowMaterial.specularColor = new B.Color3(0, 0, 0);
      this.shadowMaterial.alpha = 0.5;
      this.shadowMaterial.disableLighting = true;
      this.shadowMaterial.backFaceCulling = false;

      const dt = new B.DynamicTexture("shadowTex", 32, this.scene, false);
      const ctx = dt.getContext();
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, "rgba(0,0,0,0.7)");
      grad.addColorStop(0.6, "rgba(0,0,0,0.35)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
      dt.update();
      this.shadowMaterial.diffuseTexture = dt;
      this.shadowMaterial.useAlphaFromDiffuseTexture = true;
      this.shadowMaterial.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    }
  }

  resize() {
    this.engine.resize();
  }

  spriteMaterial(frame, light, ghost) {
    const bucket = Math.round(light * (LIGHT_BUCKETS - 1));
    const key = `${frame}/${bucket}/${ghost}`;
    let m = this.spriteMaterials.get(key);
    if (!m) {
      const B = this.B;
      m = new B.StandardMaterial(`sprite_${key}`, this.scene);
      m.diffuseTexture = this.view.texture("things", frame);
      m.useAlphaFromDiffuseTexture = true;
      m.transparencyMode = ghost ? B.Material.MATERIAL_ALPHATESTANDBLEND : B.Material.MATERIAL_ALPHATEST;
      m.alpha = ghost ? 0.3 : 1;
      m.disableLighting = false;
      m.maxSimultaneousLights = 6;
      m.emissiveColor = new B.Color3(bucket / (LIGHT_BUCKETS - 1), bucket / (LIGHT_BUCKETS - 1), bucket / (LIGHT_BUCKETS - 1));
      m.diffuseColor = new B.Color3(0.5, 0.5, 0.5);
      m.specularColor = new B.Color3(0, 0, 0);
      m.backFaceCulling = false;
      this.spriteMaterials.set(key, m);
    }
    return m;
  }

  render(world, opts = {}) {
    const B = this.B;
    const level = getLevel(world.mapName);
    if (!this.view || this.view.level !== level) {
      if (this.view) this.view.dispose();
      for (const m of this.spriteMaterials.values()) m.dispose();
      this.spriteMaterials.clear();
      this.view = new LevelView(B, this.scene, level, this.assets);
    }
    const tick = world.tick;
    this.view.update(world, tick);

    const p = world.player;
    const sameMap = opts?.prev?.mapName === world.mapName;
    const prevP = sameMap ? opts?.prev?.player : null;
    const prevWorld = sameMap ? opts?.prev : null;
    let px = p.x, py = p.y, pz = p.z, pAngle = p.angle;
    if (prevP && typeof opts?.alpha === "number") {
      const a = Math.max(0, Math.min(1, opts.alpha));
      if (Math.hypot(p.x - prevP.x, p.y - prevP.y) < 128) {
        px = prevP.x + (p.x - prevP.x) * a;
        py = prevP.y + (p.y - prevP.y) * a;
        pz = prevP.z + (p.z - prevP.z) * a;
      }
      let dAngle = p.angle - prevP.angle;
      if (dAngle > ANG180) dAngle -= ANG_FULL;
      else if (dAngle < -ANG180) dAngle += ANG_FULL;
      pAngle = prevP.angle + dAngle * a;
    }

    const cd = WEAPONS[p.weapon]?.cooldown || 14;
    const elapsed = p.shootTimer > 0 ? (cd - p.shootTimer) : 999;
    const isFlashing = (p.weapon === "shotgun" && elapsed < 7) ||
                       (p.weapon === "pistol" && elapsed < 3) ||
                       (p.weapon === "chaingun" && p.shootTimer > 0) ||
                       (p.weapon === "rocketlauncher" && elapsed < 12) ||
                       (p.weapon === "plasmarifle" && p.shootTimer > 0) ||
                       (p.weapon === "bfg" && elapsed >= 20 && elapsed < 40);
    this.scene.fogStart = isFlashing ? 16.0 : 6.0;
    this.scene.fogEnd = isFlashing ? 50.0 : 30.0;

    const eye = p.health > 0 ? PLAYER.viewHeight : 8;

    // Dynamic light pool allocation
    let lightIdx = 0;
    if (isFlashing && lightIdx < this.lights.length) {
      const l = this.lights[lightIdx++];
      l.position.set(px * S, (pz + eye) * S, py * S);
      l.diffuse.set(1.0, 0.85, 0.4);
      l.intensity = 1.8;
      l.range = 10.0;
      l.setEnabled(true);
    }

    if (Array.isArray(world.projectiles)) {
      for (const pr of world.projectiles) {
        if (lightIdx >= this.lights.length) break;
        const l = this.lights[lightIdx++];
        l.position.set(pr.x * S, (pr.z + 16) * S, pr.y * S);
        l.intensity = 1.4;
        l.range = 7.5;
        if (pr.missile === "plasma") {
          l.diffuse.set(0.3, 0.7, 1.0);
        } else if (pr.missile === "bfg" || pr.missile === "baronball") {
          l.diffuse.set(0.2, 1.0, 0.3);
        } else {
          l.diffuse.set(1.0, 0.5, 0.1);
        }
        l.setEnabled(true);
      }
    }

    for (let i = lightIdx; i < this.lights.length; i++) {
      this.lights[i].setEnabled(false);
    }

    const ca = cosOf(pAngle), sa = sinOf(pAngle);
    this.camera.position.set(px * S, (pz + eye) * S, py * S);
    this.camera.setTarget(new B.Vector3((px + ca * 64) * S, (pz + eye) * S, (py + sa * 64) * S));
    this.sky.texture.uOffset = -pAngle / ANG90;
    this.sky.texture.wrapU = B.Texture.WRAP_ADDRESSMODE;

    const rx = sinOf(pAngle), ry = -cosOf(pAngle);
    const sprites = thingSprites(world, level, this.assets.sprites, tick, prevWorld, opts.alpha);
    let shadowIdx = 0;

    for (let i = 0; i < sprites.length; i++) {
      const sp = sprites[i];
      const info = this.assets.sprites[sp.frame];
      if (!info) throw new Error(`sprite frame ${sp.frame} is not in the sprite index`);
      let mesh = this.pool[i];
      if (!mesh) {
        mesh = B.MeshBuilder.CreatePlane(`thing${i}`, { size: 1 }, this.scene);
        mesh.billboardMode = B.Mesh.BILLBOARDMODE_Y;
        this.pool[i] = mesh;
      }
      mesh.isVisible = true;

      // Glow layer tags
      mesh.doomBright = Boolean(sp.bright);
      mesh.doomPlasma = sp.frame.startsWith("PLSS") || sp.frame.startsWith("PLSE");
      mesh.doomGreen = sp.frame.startsWith("BFS") || sp.frame.startsWith("BFE") || sp.frame.startsWith("BAL7");

      const light = sp.bright ? 1 : brightness(lightAt(world, level, sp.sector, tick));
      mesh.material = this.spriteMaterial(sp.frame, light, Boolean(sp.ghost));
      mesh.scaling.set(info.width * S, info.height * S, 1);
      const off = info.width / 2 - info.left;
      mesh.position.set((sp.x + rx * off) * S, (sp.z + info.top - info.height / 2) * S, (sp.y + ry * off) * S);

      // Contact drop shadows for actors grounded on the floor
      if (this.shadowMaterial && !sp.bright && !sp.ghost && sp.sector >= 0) {
        const floorZ = floorOf(world, level, sp.sector, tick);
        if (Math.abs(sp.z - floorZ) <= 16) {
          let shadow = this.shadowPool[shadowIdx];
          if (!shadow) {
            shadow = B.MeshBuilder.CreateDisc(`shadow_${shadowIdx}`, { radius: 0.5, tessellation: 16 }, this.scene);
            shadow.rotation.x = Math.PI / 2;
            shadow.material = this.shadowMaterial;
            this.shadowPool[shadowIdx] = shadow;
          }
          shadow.isVisible = true;
          const radius = Math.max(0.3, (info.width * S) * 0.45);
          shadow.scaling.set(radius, radius, 1);
          shadow.position.set(sp.x * S, (floorZ * S) + 0.005, sp.y * S);
          shadowIdx++;
        }
      }
    }
    for (let i = sprites.length; i < this.pool.length; i++) this.pool[i].isVisible = false;
    for (let i = shadowIdx; i < this.shadowPool.length; i++) this.shadowPool[i].isVisible = false;

    this.scene.render();
  }
}

export function render3D(world, canvas, assets, opts = {}) {
  if (!world || !world.player) throw new TypeError("render3D: world with player is required");
  if (!canvas) throw new TypeError("render3D: canvas element is required");
  if (!assets || !assets.graphics || !assets.sprites) throw new TypeError("render3D: assets from loadDoomAssets are required");
  if (!canvas.__doomBabylonRenderer) canvas.__doomBabylonRenderer = new DoomBabylonRenderer(canvas, assets);
  canvas.__doomBabylonRenderer.render(world, opts);
}

