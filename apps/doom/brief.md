---
pronto: alpha
name: doom
business: free — open deathmatch arena and single-player survival slice
stage: production-shaped multiplayer slice
team: studio
cluster: mecha
terminal: omnishell
loop: sayt
build: bayt
---

# Doom Arena — 90s Deathmatch on Phobos

This app is a port of Freedoom and belongs to the clone group.

Step into the UAC Phobos installation. Grab a shotgun, pick up armor, strafe around corners, and frag opponents in high-speed arena combat. The game runs identically in an offline browser tab against simulated bots or connected over WebTransport to edge arena shards.

## Data

- `Match` — one match session: map name, frag limit, time limit, elapsed ticks, current phase (`warmup`, `active`, `over`), and winner handle.
- `Player` — one marine in the arena: handle, shirt color, health (0–100), armor (0–100), active weapon, ammo inventory, score (frags), and ping.
- `Frag` — a registered kill event: match id, killer id, victim id, weapon used, and tick timestamp.
- `Item` — an arena pickup entity: type (health, armor, ammo, shotgun, chaingun, rocket), position (x, y, z), and respawn cooldown ticks.
- `Tick` — the monotonic 35Hz simulation step counter.

## Screens

Two screens: the Arena and the Lobby.

### 1. The Arena (`/`)

The main tactical view:
- **Central Viewport**: Hardware-accelerated 3D world rendering the `e1m1.gltf` facility with dynamic sector lighting and billboard sprite actors.
- **Top-Right Frag Feed**: Real-time list of recent frags (`Slayer [SSG] Zombie`), fading after 5 seconds.
- **Bottom Status Bar (HUD)**:
  - Left: Digital Ammo counter.
  - Center-Left: Health % counter with danger glow below 25%.
  - Center: Animated Doomguy face mugshot reacting to damage and kills.
  - Center-Right: Armor % counter.
  - Right: Arms matrix showing possessed weapons (2: Pistol, 3: Shotgun, 4: Chaingun, 5: Rocket).
- **Match Intermission Overlay**: When frag limit is reached, displays match winner, final frag tallies, and an affordance for another match.

### 2. The Lobby (`/lobby`)

Pre-match staging screen:
- Player handle input.
- Marine armor tint selector (Green, Indigo, Brown, Crimson).
- Frag limit and time limit options.
- "Enter Arena" action button.
