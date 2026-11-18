# Progress

Status legend: ✅ implemented and tested here · 🟡 partial · ⬜ not implemented · ❓ implemented but unverified on the target (iPad Safari / multiplayer at scale).

## Stage 1: Foundation (2026-11-18)

| Item | Status | Notes |
|---|---|---|
| Survey + CLAUDE.md / IMPLEMENTATION_PLAN.md / PROGRESS.md | ✅ | |
| Open island field (analytic terrain, 10 regions, lava rivers/lakes, summit crater lake, sea) | ✅ | `src/world/island/islandField.js`, preview: `node tools/island-preview.mjs out.ppm` |
| Chunk streaming (UNLOADED→REQUESTED→LOADING→BUILDING→READY→ACTIVE→UNLOADING, FAILED+retry, frame budget, view priority) | ✅ | `chunks.js`; the soak test walked about 4 km of route: 0 holes, 0 mask mismatches, collision height error ≤ 0.06 m |
| Far-layer fallback (never transparent while streaming) | ✅ | tile-mask discard in terrain + lava shaders |
| Seams | 🟡 | near-tile skirts hide cracks; a small step can show where a near tile meets the coarser far layer (at about 166 m, inside fog) |
| Props (boulders, basalt columns, pines, dead trees, giant fungi, crystals) + colliders | ✅ | constant draw calls (one InstancedMesh per type) |
| Caves / lava tubes / ruins / nests / gathering points on the island | ⬜ | stage 2 |
| Bosses on the island | ⬜ | stage 2 (the arenas are unchanged and still used by quests) |
| Island entry (world map → "火山島を探索（β）"), return to port from the pause menu, region toasts | ✅ | build OK; the world-map button was not clicked in a browser (needs a login) ❓ |
| Loading screen: real weighted progress (no time-based easing), phase label, error + retry/back-to-port | ✅ | fields and island |
| Perception (sight cone + terrain line of sight, hearing by noise, smell, awareness meter, chase end / leash / search / return) | ✅ | 8 unit tests; all 3 bosses notice a hunter standing about 36 m in front (Gorvath is slower: poor eyes) |
| Bosses drop pursuit and walk home | ✅ | Cindral/Gorvath previously never dropped aggro; Gorvath's final ring phase never drops |
| Debug overlay `?debug=1` (FPS, frame ms, draw calls, triangles, memory, chunks, AI senses, boot timings, log) + gizmos (`?debug=2`/F3) | ✅ | |
| Throttled logging + WebGL context-loss logging | ✅ | `src/core/log.js` |
| Spatial hash for monster↔hunter queries | ⬜ | perception accepts `game.spatial.queryHunters`; rooms are ≤4 players today |

### Measurements (headless Chromium + SwiftShader, CPU rendering — NOT representative of iPad)
- Island boot to first frame: about 2.8 s total.
  - World setup 0.58 s, far terrain 0.33 s, macro splat 1.16 s, near tiles 0.15 s.
- Near tile build: average 3.9 ms, maximum 19 ms. The work is spread across frames by generators, with a 3 ms (low) or 5 ms per-frame budget.
- Renderer: 213 draw calls, about 250k triangles at the spawn view (desktop path, shadows on).
- FPS under SwiftShader (5 fps) is meaningless. **The real iPad FPS is unmeasured.**

### Tests run
- `node server/test.mjs`: 66 passed.
- `node --experimental-sqlite server/api.test.mjs`: 64 passed.
- `node src/core/__perception.test.mjs`: 8 passed.
- `node src/player/__test.mjs`: no errors.
- `node tools/island-test.mjs`: passed.
- Boss notice check (scratch script): passed.

### Known issues / next
- The macro splat build takes 1.2 s on desktop CPU and will be slower on iPad: move it to a worker or reduce its resolution (stage 9 / earlier if needed).
- Far terrain is flat-coloured at 8 m texels; volcano flanks look uniform from afar.
- No co-op on the island yet (offline only).

## Stage 2: Island content (partial, 2026-11-19)

| Item | Status | Notes |
|---|---|---|
| The 3 existing bosses live in island territories (Varkhul: southern heartland, Cindral: ash plain, Gorvath: northern highlands) | ✅ | `src/field/islandBosses.js`; homes come from `F.findSite` (flat, dry, away from lava); the boss arenas are unchanged for quests |
| Staged boss loading (the hunter can move first; one boss per frame batch, fixed order for co-op indices) | ✅ | |
| AI level of detail: a boss farther than 260 m from every hunter is frozen and hidden | ✅ | far bosses do not simulate yet (ecosystem simulation = stage 6) |
| Lava avoidance for walking bosses on the island | ✅ | |
| HUD follows the engaged / nearest boss (`game.focusMonster`), one "sighted" card per boss | ✅ | |
| Gorvath's final ring forms around its home on the island (arena behaviour unchanged) | ✅ | |
| Set pieces: Ancient Ruins, giant crystal spires, boss nests, landing camp (tent, crates, fire) + colliders | ✅ | `src/world/island/landmarks.js` |
| Island co-op: separate room kind `island`, host simulates all bosses, late-loaded bosses handled | 🟡 | server test added; a two-browser island session was not run here ❓ |
| Far bosses also hide the lights / fx they added to the scene | ✅ | 7 boss point lights are hidden while their owners rest |
| Caves / lava tubes (need non-heightfield meshes) | ⬜ | |
| Gathering points, carving, rewards on the island; server expedition for the island | ⬜ | island is free exploration (no rewards) until stage 5 |
| Boss death on the island | 🟡 | the carcass stays for the session; no respawn (breeding/migration = stage 6) |

## Stage 3: Monsters (in progress, 2026-11-19)

| Item | Status | Notes |
|---|---|---|
| Shared fauna base: species data, per-tile session census, spawn/despawn around hunters, spatial hash, AI LOD (near: every frame, far: every 4th), instanced rendering with shader animation (1 draw call per species) | ✅ | `src/fauna/` |
| Magma Beetle: forage, antennae alert, curl on contact (armour ×0.3), burrow when struck, heat burst when cornered, hides from diving birds, burrows during eruptions | ✅ | unit-tested |
| Magma Slime: graze/flatten, harmless until attacked, spit hot mucus + body slam, split on heavy hit (mature+), flatten near predators | ✅ | unit-tested |
| Ash Bird: soar over home, land to sweep ash, hunt beetles / small slimes by diving (prey that curls/burrows escapes), takes off near hunters, flees below 40 % HP, climbs during eruptions | ✅ | unit-tested (predation observed in simulation) |
| Fauna share the hunter's weapon hit pipeline (damage numbers, hit sfx) | ✅ | |
| No instant respawn; regrowth +1 adult per stored tile every 3 min | 🟡 | provisional until the stage-6 breeding model |
| Carving / drops from fauna | ⬜ | stage 5 (drop ids are already in `species.js`) |
| Fauna in co-op | ⬜ | each client simulates its own fauna (stage 8) |
| Bird nests, breeding-season aggression, juveniles staying at nests | ⬜ | stage 6 |
| Remaining species: Lava Snake, Fire Lizard, Crystal Boar, Stone Mole, Magma Wolf pack, 燼皮, Flame Dragon / Venom-fang Dragon, Cindaryl, Golem | ⬜ | next |

## Not started (see IMPLEMENTATION_PLAN.md)
- **Stages 2–9:**
  - island content
  - all new species
  - part system v2
  - materials, carving and gear expansion
  - combat extras (sheathe/parry, full ailments, potions with drink time, jump, falling attack, grapple, roll i-frames)
  - weapon categories
  - enchanting
  - ecosystem
  - Volcano Slime event
  - MMO world server and 100-player load tests
  - iPad device verification

### Stage 2 tests (2026-11-19)
- Headless island run:
  - All 3 bosses load in about 3 s after the first frame, with no errors.
  - Each boss notices a hunter placed 30 m in front of it (1.0–2.5 s of game time).
  - The HUD focuses the right boss.
  - Each boss rests hidden again once the hunter leaves.
- `tools/island-test.mjs`: 0 holes, 0 mask mismatches, maximum height error 0.03 m.
- Server tests: 67 passed. API tests: 64 + 64 passed. Perception tests: 8 passed. Combat test: no errors.
- SwiftShader FPS varies between runs (2–4 fps) and cannot be used for comparisons. A real-device measurement is still needed.
