import { assert, assertEquals, assertGreater, assertLess } from "@std/assert";
import { E, episode, facingLine, fits, level, pointIn, rise, start, step, teleport } from "./engine_fixtures.ts";
import { pointOnLineSide, sectorAt } from "../shell/engine/level.js";
import { LINE_FLAGS, THING_TYPES } from "../shell/engine/catalog.js";
import { checkSight } from "../shell/engine/trace.js";
import { damage } from "../shell/engine/combat.js";
import { angleTo } from "../shell/engine/constants.js";

const e1m1 = level("e1m1");
const sectorOf = (w: { player: { x: number; y: number } }) => sectorAt(e1m1, w.player.x, w.player.y);

Deno.test("a new game puts the player on E1M1's start, on the floor, with a pistol", () => {
  const w = start();
  assertEquals([w.player.x, w.player.y, w.player.z], [-416, 256, 0]);
  assertEquals(sectorOf(w), 140);
  assertEquals(w.player.weapon, "pistol");
  assertEquals(w.player.ammo, 50);
  assert(w.pickups.some((i: number) => e1m1.things[i].type === 5), "the blue key is a pickup on medium skill");
});

Deno.test("skill flags decide which monsters spawn", () => {
  const counts = [0, 2, 4].map((s) => start("e1m1", s).monsters.length);
  assertLess(counts[0], counts[1]);
  assertLess(counts[1], counts[2]);
});

Deno.test("walking forward builds momentum along the facing angle and friction stops it", () => {
  let w = start();
  w = step(w, { forward: true }, 20);
  assertGreater(w.player.x, -416 + 60);
  assertEquals(w.player.y, 256);
  w = step(w, {}, 60);
  assertEquals([w.player.momx, w.player.momy], [0, 0]);
});

// A floor more than 24 units above the player's is a wall; within 24 is a step.
Deno.test("the player climbs steps of 24 or less and is stopped by anything taller", () => {
  const w0 = start();
  const usable = (i: number) => {
    const l = e1m1.lines[i];
    const [a, b] = [e1m1.vertices[l.v1], e1m1.vertices[l.v2]];
    return l.back >= 0 && !(l.flags & LINE_FLAGS.BLOCKING) && Math.hypot(b[0] - a[0], b[1] - a[1]) >= 96 &&
      rise(e1m1, i).room >= 64 && fits(w0, e1m1, facingLine(e1m1, i, 40, true)) && fits(w0, e1m1, facingLine(e1m1, i, 24));
  };
  const lines = e1m1.lines.map((_, i) => i).filter(usable);
  const tall = lines.find((i) => rise(e1m1, i).lift > 40)!;
  const low = lines.find((i) => rise(e1m1, i).lift > 0 && rise(e1m1, i).lift <= 24)!;
  for (const [i, climbs] of [[tall, false], [low, true]] as const) {
    let w = teleport(start(), facingLine(e1m1, i, 40, true));
    let crossed = false;
    for (let t = 0; t < 40 && !crossed; t++) {
      w = step(w, { forward: true });
      crossed = pointOnLineSide(e1m1, e1m1.lines[i], w.player.x, w.player.y) === 0;
    }
    assertEquals(crossed, climbs, `line ${i}: rise ${rise(e1m1, i).lift}`);
    if (climbs) assertEquals(w.player.z, rise(e1m1, i).top);
  }
});

Deno.test("the E1M1 lift lowers when its switch is used, waits, and carries the player up to the ledge", () => {
  // Sector 101 is an 8-unit sill in front of the lift; the switch is used from beyond it.
  let w = teleport(start(), facingLine(e1m1, 620, 30));
  w = step(w, { use: true });
  assert(w.movers.some((m: { sector: number }) => m.sector === 103), "the lift (sector 103) is moving");
  w = step(w, {}, 40);
  const low = w.sectors[103].floor;
  assertLess(low, 136);
  // Fully onto the lift: straddling the low-ceilinged sill would stop it rising.
  for (let t = 0; t < 40 && !(sectorOf(w) === 103 && w.player.x > 1272 + 48); t++) w = step(w, { forward: true });
  assertEquals(sectorOf(w), 103, "the player stepped onto the lowered lift");
  // Monsters can retrigger the walk-over lift line, so check as it arrives.
  for (let t = 0; t < 300 && !w.events.includes("lift-stop"); t++) w = step(w);
  assertEquals(w.sectors[103].floor, 136);
  assertEquals(w.player.z, 136, "the player rode the lift up");
});

Deno.test("a blue door refuses the player without the key and opens with it", () => {
  let w = teleport(start(), facingLine(e1m1, 421, 40));
  w = step(w, { use: true });
  assert(w.events.includes("door-locked"));
  assert(w.events.includes("msg:You need a blue key to open this door"));
  assertEquals(w.movers.length, 0);
  w.player.keys.blue = true;
  w = step(w, {}, 2);
  w = step(w, { use: true });
  assert(w.events.includes("door-open"));
  w = step(w, {}, 40);
  assertGreater(w.sectors[71].ceil, e1m1.sectors[71].floor + 56, "the door sector opened tall enough to pass");
});

Deno.test("the blue key on the raised ledge is picked up there", () => {
  const key = e1m1.things.findIndex((t) => t.type === 5);
  const w = teleport(start(), { x: e1m1.things[key].x, y: e1m1.things[key].y });
  assertEquals(w.player.z, 136);
  assert(w.player.keys.blue);
  assert(w.collected.includes(key));
  assert(w.events.includes("msg:Picked up a blue keycard."));
});

Deno.test("slime floors hurt every 32 tics unless the player wears a radiation suit", () => {
  const spot = pointIn(e1m1, 23);
  let w = teleport(start(), { x: spot[0], y: spot[1] });
  const hp = w.player.health;
  w = step(w, {}, 64);
  assertEquals(hp - w.player.health, 10, "two hits of 5");
  w = teleport(start(), { x: spot[0], y: spot[1] });
  w.player.powers.ironfeet = 1000;
  w = step(w, {}, 64);
  assertEquals(w.player.health, hp);
});

Deno.test("entering a secret sector counts it once", () => {
  const spot = pointIn(e1m1, 128);
  let w = teleport(start(), { x: spot[0], y: spot[1] });
  w = step(w, {}, 3);
  assertEquals(w.stats.secrets, 1);
  w = step(w, {}, 3);
  assertEquals(w.stats.secrets, 1);
});

Deno.test("the exit switch ends E1M1 and the intermission leads to E1M2 with the inventory", () => {
  let w = teleport(start(), facingLine(e1m1, 407, 30));
  w.player.shells = 7;
  w = step(w, { use: true });
  assertEquals(w.phase, "intermission");
  assertEquals(w.intermission.nextMap, "e1m2");
  w = step(w, { enter: true });
  assertEquals(w.mapName, "e1m2");
  assertEquals(w.player.shells, 7);
});

// Most E1 teleporter pads sit behind a mover (a closed or raised sector until
// a trigger moves it); this takes the first one walkable as the level starts.
Deno.test("crossing a teleporter line from the front moves the player to its destination", () => {
  type Found = { name: string; l: ReturnType<typeof level>; i: number };
  const found: Found | undefined = episode.levels.map((e: { name: string }): Found => {
    const l = level(e.name);
    const w0 = start(e.name);
    const i = l.lines.findIndex((line, k) =>
      line.special === 97 && -rise(l, k).lift <= 24 && rise(l, k).room >= 56 && fits(w0, l, facingLine(l, k, 24)));
    return { name: e.name, l, i };
  }).find((f: Found) => f.i >= 0);
  assert(found, "a teleporter the player can walk across");
  const { name, l, i } = found;
  const tag = l.lines[i].tag;
  const dest = l.things.find((t) => THING_TYPES[t.type].kind === "teleport-destination" && l.sectors[sectorAt(l, t.x, t.y)].tag === tag)!;
  let w = teleport(start(name), facingLine(l, i, 24));
  let jumped = false;
  for (let t = 0; t < 20 && !jumped; t++) {
    w = step(w, { forward: true });
    jumped = w.events.includes("teleport");
  }
  assert(jumped, `the teleport on ${name} line ${i} fired`);
  assertEquals([w.player.x, w.player.y], [dest.x, dest.y]);
});

Deno.test("pistol shots kill a Zombieman the player can see and count the kill", () => {
  let w = start();
  const zombie = w.monsters.find((m: { type: number }) => m.type === 3004);
  let spot = null;
  for (let a = 0; a < 16 && !spot; a++) {
    const x = zombie.x + Math.cos((a * Math.PI) / 8) * 160, y = zombie.y + Math.sin((a * Math.PI) / 8) * 160;
    const s = sectorAt(e1m1, x, y);
    const floor = e1m1.sectors[s].floor;
    if (Math.abs(floor - zombie.z) > 8) continue;
    if (checkSight(w, e1m1, x, y, floor + 41, zombie.x, zombie.y, zombie.z, zombie.z + 56)) spot = { x, y, angle: angleTo(x, y, zombie.x, zombie.y) };
  }
  assert(spot, "a spot with a view of the zombieman");
  w = teleport(w, spot);
  for (let i = 0; i < 20 && w.monsters.find((m: { id: number }) => m.id === zombie.id).health > 0; i++) {
    const z = w.monsters.find((m: { id: number }) => m.id === zombie.id);
    w.player.angle = angleTo(w.player.x, w.player.y, z.x, z.y);
    w.player.health = 100;
    w = step(w, { fire: true });
    w = step(w, {}, 14);
  }
  assertEquals(w.monsters.find((m: { id: number }) => m.id === zombie.id).health <= 0, true);
  assertEquals(w.stats.kills, 1);
});

Deno.test("a gunshot wakes every non-ambush monster in a sector that heard it", () => {
  const zombie = start().monsters.find((m: { ambush: boolean }) => !m.ambush);
  const spot = pointIn(e1m1, sectorAt(e1m1, zombie.x, zombie.y));
  let w = teleport(start(), { x: spot[0], y: spot[1] });
  w = step(w, { fire: true });
  assert(w.heard.includes(sectorAt(e1m1, w.player.x, w.player.y)));
  w = step(w, {}, 10);
  const deaf = w.monsters.filter((m: { ambush: boolean; target: boolean; health: number; x: number; y: number }) =>
    m.health > 0 && !m.ambush && !m.target && w.heard.includes(sectorAt(e1m1, m.x, m.y)));
  assertEquals(deaf.length, 0);
  assert(w.monsters.find((m: { id: number }) => m.id === zombie.id).target);
});

Deno.test("the simulation is deterministic and every snapshot round-trips", () => {
  const run = () => {
    let w = start("e1m2", 3);
    const states = [];
    for (let i = 0; i < 200; i++) {
      w = E.advanceFrame(w, { forward: i % 40 < 25, turnLeft: i % 60 > 50, fire: i % 4 === 0, use: i % 30 === 0 });
      states.push(E.saveState(w));
    }
    return states;
  };
  const a = run(), b = run();
  assertEquals(a, b);
  for (const s of a.slice(-5)) assertEquals(E.saveState(E.loadState(s)), s);
});

// A rocket landing after its shooter died used to score a kill the relational
// match no longer accepted, and the bridge halted the game on the mismatch.
Deno.test("a monster killed by the player's missile after the player died is not scored", () => {
  const w = start();
  const m = w.monsters[0];
  w.player.health = 0;
  damage(w, m, null, w.player, 10000, () => 0);
  assertEquals(m.health <= 0, true);
  assertEquals(w.player.fragsUs, 0);
  assert(w.events.includes("monster-dead") && !w.events.includes("demon-dead"));
});

Deno.test("killing every Baron on E1M8 lowers the floor tagged 666 toward the exit", () => {
  const e1m8 = level("e1m8");
  let w = start("e1m8");
  const tagged = e1m8.sectors.map((s, i) => [i, s.tag]).filter(([, t]) => t === 666).map(([i]) => i);
  const barons = w.monsters.filter((m: { type: number }) => m.type === 3003);
  assert(barons.length > 0 && tagged.length > 0);
  for (const b of barons.slice(1)) damage(w, b, null, w.player, 10000, () => 0);
  w = step(w);
  assertEquals(w.movers.length, 0, "one Baron still stands");
  damage(w, w.monsters.find((m: { type: number; health: number }) => m.type === 3003 && m.health > 0), null, w.player, 10000, () => 0);
  w = step(w, {}, 400);
  for (const s of tagged) assertLess(w.sectors[s].floor, e1m8.sectors[s].floor);
});

// The kill score belongs to the match, not the level: the next level used to
// start it at 0 while the relational match kept the kills, and the bridge
// halted the game on the mismatch as E1M2 appeared.
Deno.test("the next level keeps the match score and the clock running", () => {
  let w = teleport(start(), facingLine(e1m1, 407, 30));
  damage(w, w.monsters[0], null, w.player, 10000, () => 0);
  assertEquals(w.player.fragsUs, 1);
  w = step(w, { use: true });
  const exitTick = w.tick;
  w = step(w, { enter: true });
  assertEquals(w.mapName, "e1m2");
  assertEquals([w.player.fragsUs, w.player.fragsThem, w.player.fragLimit], [1, 0, 100]);
  assertEquals(w.tick, exitTick + 1);
});
