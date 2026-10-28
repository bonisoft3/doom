# Sector engine: FreeDoom E1 as designed

**Status**: Archived (Built; contract moved to [[../engine]])
**Component**: `shell/engine/*`, `scripts/wad/*`, `showcase.html`

## Problem

The engine began as a deathmatch arena on a hand-made grid: one floor height,
walls as segments, doors as the only special. FreeDoom maps were later squeezed
into that model and lost what makes their routes work. E1M1's blue key sits on
a 136-unit ledge reached by a lift; flattened, it is an unmarked corner of a
hall, and every map loses its lifts, floor triggers, teleporters and hazards
the same way.

Goal: every FreeDoom E1 map (E1M1–E1M9) plays as designed — routes, lifts,
keys, secrets, hazards. Not a goal: Doom-exact monster AI or movement physics.

## Decision

Adopt Doom's own data model in our deterministic kinetic engine.

- **Levels** are the WAD's geometry in map units (format 2, built by
  `scripts/compile_freedoom_maps.ts`): vertices, lines, sides, sectors with
  heights, things with flags, the BSP with a convex polygon per subsector, and a
  blockmap. `catalog.js` lists every special and thing type the engine
  implements; the compiler refuses a level that needs anything else.
- **State** keeps the level out of the snapshot (immutable, by name) and holds
  what moves: sector heights that changed, movers, switch states, used lines,
  things, the player, stats. Positions are rounded to 1/65536 each tick;
  angles are integers (65536 per turn) over a fixed sine table.
- **Movement** follows Doom's opening rules: step up 24, 56 of headroom,
  gravity, monsters refuse drops over 24. Sliding is axis-split, not
  Doom-exact.
- **Specials** follow the WAD: walk-over by crossing between ticks, use by the
  first line within 64 units, gunfire by hitscan impact; doors, lifts, floors,
  platforms, stairs, teleporters, exits, lights at Doom's speeds and waits.
- **Rendering** builds a mesh per sector floor and ceiling from the subsector
  polygons and upper/middle/lower wall pieces per side with the WAD's
  textures; moving sectors move their meshes. Light effects, animated
  textures and scrolling walls are functions of the tick, not state. Monsters
  show their front frames only.

## Alternatives

- **A height grid on the old engine** (16-unit cells with sampled heights):
  smaller simulation change, but jagged ledges and stairs, imprecise collision
  at sector edges, blocky rendering, and per-map workarounds.
- **Embedding a real Doom port** (a source port compiled to WebAssembly):
  exact behaviour almost for free, but it bypasses the kinetic engine and the
  relational bridge this app exists to demonstrate, and brings the GPL.

## Verification

- A route solver per level proves the exit (and E1M3's secret exit) reachable
  from the start, with keys, triggers and movers modelled as state changes.
- Engine tests at real map locations: the E1M1 lift, the locked blue door,
  nukage damage, teleporters.
- The kinetic contract tests (isomorphism, rollback, replay) are unchanged.
