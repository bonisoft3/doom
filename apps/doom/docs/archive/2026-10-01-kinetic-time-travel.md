# Kinetic Engine & Time-Travel Debugging Architecture

**Status**: Archived (Built; contract moved to [`plugins/omnishell/docs/kinetic.md`](../../../../plugins/omnishell/docs/kinetic.md))  
**Component**: `plugins/omnishell/interpreter/kinetic.js`, `apps/doom/shell/engine/simulation.js`, `apps/doom/showcase.html`  
**Pronto Tier**: Kinetic Plane (Below `tab`)  

---

## 1. Problem Statement

Pronto's relational plane provides deterministic time-travel and auditability for database records and UI views through pure Jessie reducers evaluated in SES compartments. However, 3D kinetic simulations and action games have historically fallen into the "ad-hoc imperative script" trap:
1. **Frame-Rate Coupling**: Physics loops tied directly to `requestAnimationFrame` produce non-deterministic results across 60Hz, 120Hz, and 144Hz displays.
2. **Ambient Authority Leaks**: Uncontrolled usage of `Math.random()`, `Date.now()`, and asynchronous `setTimeout` makes states impossible to reproduce or rewind.
3. **In-Place Mutation**: Mutating entity coordinates in memory destroys past frames, preventing time-travel scrubbing, frame-by-frame debugging, and deterministic rewind/replay within the client runtime.

Rather than forcing every game or simulation to invent its own bespoke loop, the **Omnishell Platform** must provide a first-class **Kinetic Host runtime**.

---

## 2. The Architectural Solution

### The Separation of Planes

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. RELATIONAL PLANE (Durable Truth · Low Frequency)                    │
│    • Stored in Postgres & Electric SQL (`live` / `server` durability)  │
│    • Match seed, rules, frags, winners, checkpoints                   │
│    • Driven by pure Jessie handlers in SES compartments                │
├────────────────────────────────────────────────────────────────────────┤
│ 2. KINETIC PLANE (Ephemeral Simulation · High Frequency 35/60/120Hz)   │
│    • Platform-owned `KineticHost` (Omnishell runtime)                  │
│    • Fixed-step accumulator clock                                      │
│    • In-memory snapshot ring buffer & time-travel controller           │
│    • Pure `#KineticEngine` contract (advance, save, load, init)        │
├────────────────────────────────────────────────────────────────────────┤
│ 3. DISPLAY PLANE (Inert Renderer · Variable Refresh Rate)              │
│    • Canvas 2D / Babylon.js / WebGPU Viewport                          │
│    • Sub-frame alpha interpolation: Pos = Lerp(Pos_prev, Pos_cur, α)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The Platform Primitive: `createKineticHost`

The platform exposes a standard factory in [`plugins/omnishell/interpreter/kinetic.js`](../../../../plugins/omnishell/interpreter/kinetic.js):

```typescript
export interface KineticEngine<S, C, B> {
  initState(seed: number, options?: any): S;
  advanceFrame(state: S, cmd: C): S;
  saveState(state: S): B;
  loadState(snapshot: B): S;
}

export interface KineticHostOptions<S, C, B> {
  engine: KineticEngine<S, C, B>;
  rateHz?: number;
  seed?: number;
  historyLimit?: number;
  initOptions?: any;
  getInput?: () => C;
  onStep?: (state: S, tick: number) => void;
  onRender?: (prev: S, curr: S, alpha: number, tick: number, isHistorical: boolean) => void;
}
```

### Core Invariants Guaranteed by `KineticHost`:
1. **Fixed-Step Clock Accumulator**: Simulation steps advance strictly by `1000 / rateHz` milliseconds. Frame rate variations on the display never alter simulation physics.
2. **State Ring Buffer**: Holds the last $N$ frames of serializable snapshots with automatic eviction of the oldest frames.
3. **Time-Travel Navigation**:
   - `pause()`: Halts progression.
   - `seek(tick)`: Restores state at `tick` via `loadState()` and triggers an immediate render with `isHistorical = true`.
   - `stepBackward(n)` / `stepForward(n)`: Frame-by-frame single-step inspection.
   - `branch(tick)`: Discards future history after `tick`, allowing alternate gameplay branches from a past instant.
   - `reset(seed, options)`: Resets simulation to tick 0.
4. **Deterministic Mulberry32 PRNG**: Built-in seeded linear generator ensuring reproducible sequences.
5. **Integrated Scrubbing UI**: `host.mountControls(container)` mounts a fully-styled timeline scrubber, play/pause toggle, frame-step buttons, and live/historical status badge.

---

## 4. Application Integration: Doom Single Player

[`apps/doom/shell/engine/simulation.js`](../../shell/engine/simulation.js) implements the `#KineticEngine` specification:
- **`initState(seed)`**: Returns a pure, immutable world object (`tick`, `player`, `demon`, `particles`, `rngState`).
- **`advanceFrame(world, cmd)`**: Evaluates movement, collision clamping against the E1M1 glTF arena bounds, demon AI approach, hitscan shotgun spread, and blood particle physics. All timers (`flashTicks`, `demonRespawnTicks`) tick down deterministically.
- **`saveState(world)`** / **`loadState(snapshot)`**: Complete JSON state serialization satisfying the algebraic isomorphism $\text{load} \circ \text{save} = \text{id}$.
- **`showcase.html`**: Converted to an ESM module connecting `createKineticHost` with `doomKineticEngine`, mounting the time-travel bar into `#timeTravelMount`, and drawing a `REPRODUÇÃO HISTÓRICA (MODO DEPURAÇÃO)` watermark during time travel.

---

## 5. Formal Verification Strategy

### Algebraic & Property Invariants:
1. **Algebraic Isomorphism**:
   $$\text{loadState}(\text{saveState}(s)) \equiv s$$
   Verified across distinct game phases (warmup, moving, firing, demon injured, game over).
2. **Referential Transparency (Determinism)**:
   $$\text{advanceFrame}(s, cmd) = \text{advanceFrame}(s, cmd)$$
   Simulating frames twice with identical seeds yields identical state hashes.
3. **Rollback Invariance**:
   Simulating frames $0 \to 60$, saving state at tick 30, rewinding to tick 30, and re-simulating to tick 60 produces the exact same state as the linear run without rollback.
4. **Timeline Branching**:
   Branching at tick 30 with alternate inputs causes state to diverge from the original timeline while keeping ticks $0 \to 30$ bit-exact.
