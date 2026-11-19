# Wildbound: Volcanic Island implementation plan

The source is the user's consolidated instruction document: the open world, ecosystem, part system, combat extensions, the Volcano Slime event, MMO and stability. Monster lore comes from the user's monster design document (LAVA_SNAKE.md and the related species sheets).

This file is the roadmap; `PROGRESS.md` tracks status. Stages follow the user's order. Within a stage, related features ship together and each stage ends with tests.

## Current state (surveyed 2026-11-18, before stage 1)

| Area | State |
|---|---|
| Rendering | Three.js r187 with a post stack (SSAO, bloom, grade). Fully procedural assets; Cindral's mesh is user-made. |
| Fields | 3 separate boss arenas (`foothills`, `wastes`, `hollow`), each 600 m square with a playable radius of about 120 m, built as one heightmap in 16 static mesh pieces. **No open world, no streaming.** |
| Bosses | Varkhul, Cindral, Gorvath: full AI, attacks, part breaks and ailments. Aggro was a plain distance check (38 to 48 m) with no line of sight; Cindral and Gorvath never dropped aggro. |
| Player | Great sword only. Light combo, 3-level charged slash, tackle into true charge, guard, dodge roll (about 0.22 s i-frames), sprint, sheathe/draw animations (automatic, not on a held button), potion and whetstone use. **No jump, falling attack, grapple or parry.** |
| Ailments | burn (small/large), poison (normal/deadly), blastblight, in `src/core/status.js`. Sleep, stun tiers, flinch tiers, confusion, silence and stat debuffs are not implemented. |
| Parts | Per-part HP, breaks and hitzones exist. A hit lowers part HP **and** body HP; the spec's separate part HP with one-time break damage is not implemented. |
| Economy | Server-authoritative: shop, forge, upgrade, alchemy, item box, quests, delivery. Supabase Postgres in production. |
| Online | Rooms of up to 4 over WebSocket (Render free plan); the host simulates the monster, with server-side damage sanity checks. **No world server, no interest management.** |
| Town | Port Halvane hub, NPCs, facility panels, world map expeditions. |

## Stages

1. **Foundation** (this stage)
   - Survey and these documents.
   - Open-island streaming foundation: chunk state machine, far-layer fallback, regions, props, real loading progress, failure and retry.
   - Monster perception: senses, line of sight, bounded pursuit; fixes the "infinite detection" problem.
   - Developer overlay and logging.
   - Island entry from the world map.
2. **Island content**
   - Caves and lava tubes: separate meshes, since a heightfield cannot overhang.
   - Ruins, giant crystals, nests and gathering points per region.
   - Place the 3 bosses in their island territories; their old arenas stay as quest "special combat areas".
   - Captain or camp travel between the island and the port.
   - Island quests and server expeditions.
3. **Monsters** (new species, each with model, motions, movement/combat AI, diet, territory, reactions)
   - Low tier: Lava Snake, Ash Bird, Magma Beetle, Magma Slime.
   - Mid tier: Fire Lizard; Crystal Boar (the Crystal Tusk is a large individual); Stone Mole (the Grand Mole is an old giant individual); Magma Wolf (always in packs, with a leader).
   - Varkhul stays mid tier. 燼皮 (Emberhide Drake) is ground-only and never flies.
   - Apex: the Flame Dragon / Venom-fang Dragon pair (male and female of one species). Cindral is the special male; Cindaryl is the special female.
   - Golem (rock mimic); Gorvath is its mutant individual.
   - Shared rig and animation tooling first, then species in dependency order (prey before predators).
4. **Part system v2**
   - Part HP separate from body HP; break damage applied once; hardness against weapon durability.
   - Loss of function plus substitute behaviour, regeneration timers, visual break states.
   - The same pipeline for monster-versus-monster fights.
   - Requires rebalancing all three bosses, because body HP is no longer drained by part hits.
5. **Materials and gear**
   - Per-part materials with damage-based rights; dropped parts and corpses carved on the field (server-arbitrated, idempotent).
   - Armour slots (head, chest, arms, waist, legs) and weapon categories through a shared attack engine (data-driven moves).
   - Enchanting (10 slots, rarities, curses).
   - Combat extras: sheathe on long press, parry, the full ailment set, potions with drink times, jump, falling attack, roll distance and i-frames are **implemented (stage 6a)**; grapple and 6 weapon classes (sword & shield, dual blades, long sword, hammer, lance, bow) are **implemented (stage 6b)**. The other 14 listed classes are **implemented (stage 6c)**, 20 in total.
6. **Ecosystem** — **implemented (stage 6)**: see PROGRESS.md; open items are terrain visuals for environment change and boss populations.
   - Server-side population model: breeding and growth (no instant respawns), migration, carcass decay and use, per-individual learning, long-term environment change.
   - Three levels of detail: detailed AI near players, a simple AI in the same region, statistical simulation far away.
7. **Volcano Slime** (hidden world event) — **implemented (stage 7)**, see PROGRESS.md
   - World counters and state persisted server-side: slime kills, lava flow, the magma chamber, a crater-devour counter with an atomic 100th trigger, the victim player, boss HP 100,000, phases.
   - The victim rules exactly as specified; slime rampage effects on the ecosystem.
   - The NPC "マメ・チシキー" with lore hints and no monster names.
8. **MMO**
   - An authoritative world server (zones, interest management by spatial grid, delta snapshots).
   - Separate AI simulation, load tests at 1/5/10/25/50/75/100 bots.
9. **Polish**
   - iPad tuning (on real hardware), LOD and instancing, memory, graphics: day/night, weather, volcanic activity.

## Infrastructure reality for "about 100 players" (stage 8)

- **Render free web service:** 512 MB RAM, a shared fraction of a CPU, and it sleeps after 15 minutes idle (cold start takes 30 s or more). One process. It cannot host a 100-player authoritative simulation with monster AI. A paid instance of at least 1 to 2 dedicated vCPUs, or Fly.io machines, is needed.
- **Supabase free:** a 500 MB database. Fine for accounts, saves and world counters. Positions and combat must **not** go through the database (only state changes and periodic checkpoints).
- **Supabase Realtime** is not a fit for authoritative combat simulation. Keep our WebSocket server and use Supabase only for persistence.
- **Proposed design:**
  - A zone server process per island region group (in-memory world).
  - A spatial-hash interest set per player.
  - Snapshots at 10 to 15 Hz for nearby entities, 2 Hz for mid range, none beyond.
  - Event IDs for idempotent hits.
  - A per-user mutex already exists for the economy.
  - Write-behind persistence batched every 10 to 30 s plus on critical events (world-event counters use atomic SQL).
- No paid service is ordered or changed without the user's decision.

## Key design decisions (stage 1)

- **Streaming:**
  - The far layer (8 m grid, whole island, never unloaded) plus near tiles (64 m at 2 m spacing).
  - A tile mask texture makes the far layer discard itself under ACTIVE near tiles. The swap happens in one frame, so there is never a hole or transparent ground.
  - Skirts on near tiles hide seams.
- **Collision** never depends on streaming: it reads the tile grid if loaded, otherwise the same analytic height function.
- **Props:** one InstancedMesh per prop type for the whole loaded area, so draw calls do not grow with the tile count. Placement is deterministic per tile, so every client gets the same island.
- **Perception:**
  - Sight is a range, a view cone and terrain line of sight; hearing scales with the hunter's noise (speed, attacks); smell has a short radius.
  - An awareness meter fills before the monster engages. Pursuit ends past `chaseEnd` or `leash`, followed by a search window and a return home.
  - Profiles are data (`src/shared/senses.js`).
