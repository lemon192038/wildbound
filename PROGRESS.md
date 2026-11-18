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
| Fire Lizard: rock-mimicry ambush at its home rock, short charge (no long pursuit), territory threat display → fight (hot bite, tail swipe at flankers, charge, fire spit with long cooldown), hides from bosses, flees a surfacing snake, retreats when badly hurt; hunts beetles / small slimes / grounded birds | ✅ | unit-tested; HP 2,800 |
| Lava Snake: lives in the lava (spawns only in lava bodies), lurks head-up, swims fast along rivers, lunges ≤12 m onto the bank at prey/hunters then slides back, lava balls (also shoots low-flying birds), ignores hunters far from lava, dives untouchable when struck and resurfaces elsewhere; segmented body follows its swim path | ✅ | unit-tested; HP 8,500 |
| HUD shows an engaged lizard / snake like a boss (name, HP, sighted card) | ✅ | |
| Group framework: herds / packs as units (group brain + member roles), group census (stored packs keep composition and HP), creature-vs-creature damage through the shared hit() | ✅ | `src/fauna/herds.js` |
| Crystal Boar herds (3–6, juveniles in the middle): graded warnings (observe → paw/snort → tusks → charge), ring around juveniles, whole herd hostile when one is struck, straight charges with poor turning, stand down when the hunter backs off | ✅ | unit-tested; HP 3,800 |
| Crystal Tusk = a large boar individual (not a species): leads the defence, crystal charge + rest, stays by the juveniles | ✅ | HP 8,500 |
| Magma Wolf packs (never alone, exactly one leader): den with juveniles, patrol behind the leader, alert on sighting, encircle and attack in turns from the flanks (leader head-on), leader's howl orders retreat (half down / leader hurt / boss near) | ✅ | unit-tested. Wolf HP 1,600 / leader 4,200 are ASSUMED: the design document gives no numbers |
| Wolves hunt juvenile / weak boars (a guarding Tusk often makes them give up), lizards, beetles, small slimes, grounded birds; feed on carcasses; herds fight back | ✅ | observed in simulation |
| Remaining species: Stone Mole (+Grand Mole), 燼皮, Flame Dragon / Venom-fang Dragon, Cindaryl, Golem | ⬜ | next |

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

### Stage 3 tests (2026-11-19)
- `node src/fauna/__fauna.test.mjs`: 15 passed.
  - Spawning stays local to hunters.
  - Beetle: curl / burrow / re-emerge / heat burst.
  - Slime: split into two halves, spit only when provoked.
  - Bird: predation (3 kills in 3 simulated minutes), flees when wounded.
  - Despawn conserves the census, and killed animals do not respawn instantly.
- Headless browser run on the island, 0 errors:
  - About 70 creatures live around the hunter.
  - Beetle curls on contact; a provoked slime spits.
  - A slime split into two halves.
  - Cindral (whose territory is nearby) attacked the hunter on its own.
- Tuning after the browser run:
  - Eruptions are frequent, so only some beetles burrow each time, more often nearer the summit (before, all beetles stayed underground).
  - Birds may still hunt during eruptions.
  - Slime glow toned down.

### Stage 3b tests (Lizard / Snake, 2026-11-19)
- `node src/fauna/__fauna.test.mjs`: 21 passed.
  - Lizard: threat display → fight (56 dmg to the hunter); gives up a hunter 60 m away; ambushes a beetle.
  - Snake: spawns in the lava; ignores a hunter far from it; lunges at a hunter on the bank (50 dmg); slides back into the lava; dives untouchable when struck.
- Browser (headless), standing on a lava riverbank: the snake lunged out, knocked the hunter down and applied burn. No errors.
- Visual tuning:
  - Snake glow reduced, so it reads as black rock with seams.
  - Island lava point lights halved: they flooded the narrow canyon walls.

### Stage 3c tests (herds and packs, 2026-11-19)
- `node src/fauna/__fauna.test.mjs`: 30 passed.
- Wolves:
  - Every wolf is in a pack with one leader (pack sizes 5, 7, 4).
  - The pack engages the hunter and lands 4 bites (112 dmg).
  - It retreats once half the pack is down.
- Boars:
  - The herd grazes while the hunter is far, warns at mid range, charges a close hunter (94 dmg) and stands down when the hunter leaves.
  - The Tusk is a boar with 8,500 HP.
  - One struck boar turns the whole herd hostile.
- Ecology: a hungry pack killed an unguarded juvenile boar, and the herd defended against it.
- Browser (headless): a herd and a pack interacted next to the hunter, with no errors.
- Crystal glow was toned down after the screenshot.
