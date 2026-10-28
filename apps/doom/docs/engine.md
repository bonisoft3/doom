# Sector engine

How the game turns FreeDoom's Episode 1 into play. The decision behind it is
[[archive/2026-10-11-sector-engine]].

## Assets

`scripts/compile_freedoom.ts` downloads FreeDoom 0.13.0 by pinned URL and
sha256 (cached in `scripts/.cache/`) and writes, under `shell/assets/`:

- `levels/<name>.json`: a level in format 2 (below), one per E1 map.
- `levels/index.json`: the episode (titles, `next`, `secretNext`), every texture
  with its size, the flats, animation sequences, switch pairs, the sky.
- `textures/`, `flats/`: PNGs composed from the WAD's patches and palette.
- `things/`: front-facing sprite frames (rotation 1, or 0) named prefix + frame
  letter, and `index.json` with each frame's size and offsets.

The output is committed; play and tests never need the WAD. Rerun the
compiler after changing `catalog.js` or `sprites.js`:

    deno run --config scripts/deno.json --lock scripts/deno.lock -A scripts/compile_freedoom.ts

## Format 2

The WAD's own data in map units: `vertices`, `lines` (`v1, v2, flags, special,
tag, front, back` with `back = -1` for one-sided), `sides` (`sector, xoff,
yoff, upper, middle, lower`), `sectors` (`floor, ceil, floorFlat, ceilFlat,
light, special, tag`), `things` (`type, x, y, angle, flags`), `nodes` (a child
`>= 0` is a node, `< 0` is subsector `-(child + 1)`), `subsectors` (sector and
convex polygon, from clipping the bounds by each partition and seg), and a
128-unit `blockmap`. `level.js` answers which sector holds a point by
descending the BSP.

## Catalog

`shell/engine/catalog.js` lists every line special, sector special and thing
type the engine implements, keyed by the WAD's numbers, and the boss-death
rules. The compiler refuses a level that uses anything else.

## State

`simulation.js` is a kinetic engine: `advanceFrame(world, cmd)` is pure and runs
at 35 Hz. The level stays out of the world, registered by name; the world holds
what changes:

- `sectors`: overrides of moved or changed sectors (`floor`, `ceil`,
  `floorFlat`, `light`, `special`).
- `movers`: doors, lifts, platforms, floors and stairs in motion.
- `switches` (line → tics until it reverts, `-1` for good), `usedLines` (spent
  one-shot lines), `heard` (sectors a gunshot reached).
- `player`, `monsters`, `barrels`, `projectiles`, `puffs`; `pickups` (thing
  indices on this skill), `collected`, `drops`.
- `stats` for the intermission; `exit`, `bossDone`, `phase`, menus.

Positions keep 16 bits of fraction; angles are integers, 65536 to a turn.

## Rules

- Movement: a move fits when no impassable line or solid thing overlaps the
  box, the step up is at most 24, the gap is at least the thing's height, and
  a monster's drop is at most 24. Blocked moves slide along one axis.
- Lines fire by walking over them (the centre changes side), using them (the
  first line within 64 in front, front side only) or shooting them. Monsters
  use plain doors and the lifts and teleporters marked for them.
- Movers run at the original speeds and waits; a closing door reopens on a
  thing; a rising floor that would squeeze a thing goes back.
- Items are touched from any spot where the boxes overlap and the item is at
  most 56 above or 8 below the player's feet.
- Slime hurts every 32 tics unless the radiation suit is on; a secret counts
  once; noise wakes monsters in every sector it reaches.
- The relational plane scores the living player's kills (`demon-dead`); other
  deaths are `monster-dead`.

## Rendering

`renderer.js` draws a level with Babylon.js at 1/64 scale. Static floors,
ceilings and walls merge per material; sectors that can move or change light,
and the walls touching them, keep their own meshes. Walls follow Doom's
pegging. Light effects, animated textures and scrolling walls are functions of
the tic. `sprites.js` maps thing states to frames.

## Verification

- `tests/level_format.test.ts`: the compiled assets agree with the WAD.
- `tests/engine.test.ts`: rules at real locations in E1M1, E1M2, E1M4, E1M8.
- `tests/routes.test.ts`: a solver proves every exit and E1M3's secret exit
  reachable from the start.
- `tests/kinetic_engine.test.ts`, `tests/simulation.test.ts`: determinism,
  rollback and replay; no ambient authority in any engine module.
