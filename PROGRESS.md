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
| Stone Mole: lives underground (no hitboxes, a moving mound + dust when near), tracks footsteps by vibration, waits below a still hunter, bursts up under a hunter moving above it / when the mound is struck / on heavy-hit tremors; claw swipes and digging charge on the surface, digs back down after a while or when hurt; eats burrowed beetles; avoids lava snakes | ✅ | unit-tested; HP 7,200 |
| Grand Mole = old giant Stone Mole individual (≈8 % of moles): back crystals, longer chases | ✅ | HP 15,000 |
| Boulder Golem: rock mimicry with distance-graded wake-up (alert → faint core glow → rises → hostile); some wait until the hunter has passed; rock fist, ground slam, rock throw, short charge; defends its territory only, then walks home and settles back into a rock; Ash Birds perch on dormant golems and burst away when they wake | ✅ | unit-tested; HP 12,000 (Gorvath stays the existing mutant boss) |
| 燼皮 (Cinderskin Drake): flightless low dragon (wings unusable, flare in threat display), roams its territory, hunts grounded birds / beetles / slimes / juvenile lizards, scavenges carcasses, flees wolf packs and Crystal Tusks, fights intruders (bite, tail, charge, ember spit) | ✅ | unit-tested; HP 5,200 ASSUMED |
| One dragon species, 4 new island individuals with their own territories, built on Cindral's mesh (loaded once, cloned per individual): Flame Dragon ♂ lower (11,000) and elder (15,500) — air combat with fire, no rock bombs; Venom-fang Dragon ♀ (13,000) — flies to close in, lands to fight, fangs / tail / landing strike all poison; Cindaryl 猛毒姫 (19,500) — nearly every attack venomous (deadly poison), tail/charge-type hits lethal venom, venom breath; Cindral stays the special ♂ | ✅ | dragon HP values ASSUMED; venom fx tinted green-violet |
| New ailment tier: lethal venom (`poison:lethal`, 8 HP/s for 24 s; a draught only trims it) | ✅ | dedicated cure = stage 5 potions |
| Dragons hunting fauna, dragon-vs-dragon territory disputes, mating season contact | ⬜ | stage 6 |

## Stage 4: Part system v2 (2026-11-19)

| Item | Status | Notes |
|---|---|---|
| Shared part engine `src/core/parts.js` (bosses + all fauna, hunter and creature hits) | ✅ | 12 unit tests |
| Part HP separate from body HP. A hit on an intact breakable part lowers only that part. The break deals a set body damage once (= the part's max HP, so hunt length is preserved). Non-part regions and broken parts damage the body directly | ✅ | verified on all 3 bosses in the browser |
| Hardness per part: glancing blows (blunt edge vs very hard part: ×0.35 damage, "DEFLECTED!", clang); harder parts wear sharpness faster; heavy swings bite harder | ✅ | weapon *types* do not exist yet (great sword only) |
| Function loss + substitute behaviour, bosses: Varkhul (horns → no charge, bites instead; forelegs → no leap; tail → no tail sweep, turns and bites; back → softer body). Dragons (wings → grounded, no dives/rock bombs/gust until regrown; head → no fireballs; tail → no tail spin). Gorvath (one fist → the other fist punches, no double punch; both fists → brow and tail; brow → no head slam; tail → no tail swipe) | ✅ | |
| Function loss, fauna: | ✅ | unit-tested |
| — Beetle: shell → curling useless, burrows instead | ✅ | |
| — Bird: wings → grounded, flees on foot | ✅ | |
| — Lizard / drake: jaw → no bite/fire, uses its tail; tail → no tail swipe | ✅ | |
| — Snake: fangs → no lava balls, cannot seize prey | ✅ | |
| — Boar: legs → no charge, slow, herd withdraws; tusks → no gore; crystals → softer | ✅ | |
| — Wolf: jaw → no lunges; legs → slow | ✅ | |
| — Mole: claws → cannot dig or claw, rams instead | ✅ | |
| — Golem: arm → no fist/throw, slams; core → no throw | ✅ | |
| Regrowth per part (timer × nutrition × health); some parts never regrow (Varkhul's horns/tail/back, dragons' tails, Gorvath's tail = permanent injuries). A regrown part comes back at 60 % HP | ✅ | |
| Creature-vs-creature hits aim at parts (size in metres, posture, attack style; broken parts are not chosen again), e.g. wolves bite a boar's legs → crippled → the herd withdraws; the injury persists after the fight | ✅ | unit-tested |
| Visible break states: bosses (existing models); fauna via an instanced bitmask (shattered crystals, tail stumps, drooping wings, missing golem arm, chipped claws, cracked shell, limping leg) | ✅ | screenshot-checked |
| HUD: part list of the focused monster (intact / damaged / badly damaged / broken / regrowing %), regrowth toast; break banner names the creature that broke | ✅ | |
| Part state sync in co-op: breaks are sent; regrowth on the host is not yet sent to other clients | 🟡 | stage 8 |
| Damage numbers balance pass for the new rules | 🟡 | break damage = part max HP keeps totals close; needs real play-testing |

### Stage 4 tests (2026-11-19)
- `node src/core/__parts.test.mjs`: 12 passed.
- `node src/fauna/__fauna.test.mjs`: 64 passed.
  - Wing hits lower only wing HP; the break costs the body once; the bird is grounded, shows the break and regrows its wings.
  - Beetle shell breaks.
  - Wolves break a limping boar's legs; the herd withdraws; the boar can no longer charge.
- Browser, all 3 boss fields, no errors:
  - A part hit does not touch body HP; the break costs exactly the part's max HP (3,150 / 3,400 / 2,600); later hits reach the body.
  - Cindral is grounded by a wing break.
  - The HUD shows the part list.
- Bugs found and fixed:
  - Far creatures lost regrowth time to the AI step cap.
  - Size comparisons used model scale instead of real size.
  - The break banner named the wrong monster when several were around.
- Observed in simulation: an adult boar herd broke the wolves' jaws, and the jawless pack retreated.

## Stage 5a: Materials, rights and field carving (2026-11-19)

| Item | Status | Notes |
|---|---|---|
| Island materials: 61 new items (every species, special individuals and the 3 new dragons) with an `attr` hint for the forge (fire / poison / hardness / crystal / weight / agility…) | ✅ | `src/shared/islandLoot.js`; JA + EN names |
| Loot tables: body carve table + number of body carves per carcass + material per broken part; the 3 original bosses use their own carve/break tables | ✅ | |
| Rights: part material only for hunters who damaged THAT part; body material for anyone who damaged the creature anywhere; nobody else; not decided by the last hit | ✅ | `src/core/rights.js`, recorded by the client that dealt the damage |
| Broken parts drop as glowing pieces on the ground (only the right-holders can pick them up); they crumble after 150 s | ✅ | |
| Carcasses stay; carving = walk up + E / touch CARVE (weapon sheathed); never auto-added to the inventory; a carcass you have rights to is kept ≥ 150 s; scavenged or decayed carcasses cannot be carved | ✅ | |
| Server-authoritative carving: `departIsland` / `islandCarve` / `returnIsland`. The material is decided by the server and goes straight into the item box; carve ids are idempotent; per-carcass and per-part limits; kill-rate limits; 1 boss carcass per 8 min; 400 carves per expedition; nothing claimable after returning | ✅ | 14 API tests (SQLite + pg-mem) |
| World map: sailing to the island registers the expedition (resume works); the pause menu returns to port through the server; offline play still works but shows that nothing is recorded | ✅ | the world-map button was not clicked in a browser (login UI) ❓ |
| Simultaneous carving by several players | 🟡 | the server handles concurrent requests per user (5 parallel → 1 grant). Fauna are not shared between co-op clients yet, so each hunter carves their own copy (stage 8) |
| The kill itself is not server-verified | 🟡 | the island is not server-simulated yet (stage 8); rate limits and caps bound abuse |
| Potions used on the island are not deducted (carried items return in full) | 🟡 | stage 5b (potions / item use) |
| Island gear: 8 great swords (Carapace, Pack Fang, Crystal Tusk Cleaver, Obsidian Fang [fire], Golem Slab [heavy], Flame Dragon [strong fire], Venom-fang [poison], Venom Empress's Blade [very strong poison, durable edge]) and 8 armour sets × 5 slots (head / chest / arms / waist / legs) forged and upgraded from island materials; skills reuse the existing working skills (antivenom, heatward, steadfast…) | ✅ | `src/shared/islandGear.js`; the forge lists them with stats, comparison vs. equipped, owned/required materials |
| New element: poison (weapons, UI colour and names) | ✅ | poison *build-up* on monsters is part of the status-effect stage |
| Weapon categories beyond the great sword, enchanting, potions with drink times, jump / grapple | ⬜ | next |

### Stage 5a tests (2026-11-19)
- `server/api.test.mjs`: 80 passed, on both SQLite and pg-mem (+14 island tests):
  - Idempotent carve id; 5 parallel carves of one slot → exactly 1 grant.
  - A boar has only 3 body carves; a boar has no wings.
  - Unknown creatures are rejected.
  - Cindral uses its own break table, and there is a boss cooldown.
  - Lizard kill-rate limit.
  - Return to port; nothing is claimable afterwards.
- End-to-end (real local server + headless browser):
  - Landed with the expedition id.
  - A carcass killed by another creature is not carvable.
  - A boar I fought: its broken crystal dropped as a piece; E picked up the piece and made 3 body carves.
  - The server item box shows Crystal Boar Hide ×3 + Mineral Crystal ×1.
  - The prompt disappears when nothing is left. No errors.
- Bug found and fixed: the carving lock counted frames, not real time (at 2 fps a carve took ~27 s).

## Stage 6a: Combat extras (2026-11-19)
**Implemented:**
- **Sheathe / parry** (`src/player/player.js`):
  - holding light attack 0.45 s while drawn sheathes into a counter stance; a tap still slashes (decided on release);
  - in the stance, press → hold pose, release → parry with a 0.25 s window;
  - only direct physical blows that carry a `source` can be parried (no roars, area bursts, projectiles or ailments);
  - success: no damage, sparks, clang, hitstop, the attacker reels (fauna `staggerT`; bosses play `flinch`; `m.parried` counts), and the blade comes out straight into a counter slash;
  - miss: 0.45 s recovery, dodge-cancelable.
- **Ailments** (`src/core/status.js`):
  - burn medium;
  - sleep: woken by a hit, which deals ×1.5;
  - stun short / long: mashing shortens it;
  - flinch short / long: instant stagger;
  - confusion short / long: scrambled / reversed movement;
  - silence: no tackle, no True Charge, no parry;
  - 10 stat-downs, applied through `mods()`: attack, defence, speed, attack speed, affinity, crit damage, element, element resistance, healing, stamina regeneration;
  - rules:
    - no stacking: a stronger level replaces, the same level refreshes, a weaker one is ignored;
    - immunity after sleep and stun;
    - wards;
    - `cure([...])`;
  - burn large also applies attack down; lethal venom also applies healing down;
  - HUD chips (JA/EN).
- **Fauna attacks:**
  - send `source` / `kind` (`aoe` for bursts and slams, `projectile` for shots);
  - boar charge → stun short; crystal tusk charge → stun long; golem fist → stun short; golem slam → flinch long; mole burst → flinch long; lizard fire → burn medium;
  - fixed a crash when a golem rock (no status) hit the player.
- **Cure items with drink times** (`gamedata.js` `drink`, `use: 'cure'`, `cure`, `ward`):
  - antidote 1.2 s: lethal venom weakens to deadly;
  - new: Deepwater Antidote 1.8 s, Brightleaf Tonic 1.0 s (sleep), Sharpsalt 1.2 s (stun), Stillmoss Draught 1.5 s (confusion), Throatbalm 1.3 s (silence), Ironroot Vigor 1.4 s (stat-downs + flinch ward), Allheal Elixir 2.5 s (all);
  - alchemy recipes and shop stock added;
  - effect and consumption happen only at the swallow; a dodge before it cancels and uses nothing; a hit interrupts.
- **Jump** (C / gamepad A / touch JUMP):
  - gravity and landing; walking off a ledge (>0.9 m drop) starts a fall; falls over 6 m knock down (no damage);
  - light/heavy in the air = **plunging attack**: the overhead slam plays on landing, with motion value 0.7 + up to 0.5 by fall height.
- **Roll:**
  - `P.roll = { dist: 3.2, iStart: 0.03, iEnd: 0.3 }` (was ~2.5 m);
  - i-frames end the frame the window closes;
  - dodge now also cancels guard, a light hit (not stuns), and drinking at any time.

**Partial / unverified:**
- Boss parry stagger is applied locally (`debug.play('flinch')`); in co-op only the host's boss AI is authoritative, so a client's parry may not flinch the shared boss.
- No dedicated parry/jump animations beyond reused clips (guard pose, new tuck clip, light3 slam).
- Grapple, enchanting and weapon categories are not implemented.
- Not checked on an iPad.

### Stage 6a tests (2026-11-19)
- Status unit test, `node src/core/__status.test.mjs`: **18/18 passed**.
- Combat bench, `node src/player/__combat.test.mjs`: **16/16 passed**. Checks:
  - tap / hold;
  - parry success / not parryable / miss → dodge;
  - roll 3.2 m, i-frames end at 0.3 s;
  - jump and landing; plunge hits;
  - drink cancel uses nothing; the effect lands at 1.2 s;
  - sleep woken by a hit; stun; confusion reverses movement; silence blocks parry; speed down.
- All suites passed: `server/test` 67, api ×2 85 / 85, perception, fauna, parts, player.
- `npx vite build` passed. `tools/island-test.mjs`: 0 failed, no errors.
- Island screenshot (JA): chips for confusion [long], defence down, burn [medium] and silence; counter stance pose.

## Stage 6: Ecosystem (2026-11-19)
**Implemented:**
- **Three-level simulation:**
  - near hunters: full individual AI;
  - same region: the same AI at the reduced LOD rate;
  - everywhere: the statistical model in `src/shared/ecosystem.js`, one record per 64 m tile:
    - populations by age class (juvenile / young / adult / elder) and herds / packs with their composition;
    - nests, carcasses and the environment;
    - hunting pressure and learned wariness.
- **Breeding** (per species, `ECO` table):
  - eggs, live birth, splitting (slime) or none (golem);
  - breeding seasons on a 4-hour cycle;
  - clutches, nests that hatch after incubation, growth juvenile → young → adult → elder;
  - nest protection (boars, wolves), and raiders thin unguarded nests;
  - solitary species meet a mate from the neighbouring ground only in season;
  - elders can emerge as Grand Moles;
  - nothing respawns instantly: a hunted-out tile stays empty until breeding or migration refills it;
  - refuge seeding only when a species falls below 40 % of its starting count island-wide.
- **Regulation:**
  - environment food vs. tile capacity (logistic);
  - predators keep a food reserve refilled by real kills (juveniles are easiest);
  - starvation and old age;
  - scavengers eat carrion.
- **Migration:** individuals move only to a clearly better neighbour tile. Reasons:
  - food shortage, predators, crowding, volcanic heat or lava damage;
  - hunting pressure, breeding season (nest ground), injury;
  - packs that fall apart merge into the nearest pack (no lone wolves).
- **Carcasses:**
  - states: fresh → eaten → rotten (insects, fungi) → remains (bones / shell) → gone;
  - rotting bodies feed fungi and insects; scavengers feed on them.
  - In the field:
    - fresh / eaten / rotten carcasses become real dead bodies that darken as they rot, with flies, and scavengers find them;
    - remains are instanced bones;
    - nests are egg clutches or den mounds.
- **Environment:**
  - ash, heat, minerals, fungi, plants, insects, carrion and lava damage per tile;
  - deterministic volcanic activity and eruptions: ash and heat near the summit, lava floods kill and destroy nests;
  - cooled lava brings minerals, old ash fertilises plants, fresh heavy ash smothers them.
- **Learning:**
  - **Per tile (persistent on the server):** wariness of the species rises when hunters kill its kin or intrude on its nests, scaled by intelligence (slime 0.05 … wolf 0.85).
  - **Per individual** (`c.mem`): hits by hunters (which move, which element), kin killed nearby, nest intruded, young attacked.
  - **Effects:**
    - sharper senses;
    - early retreat from hunters;
    - wary birds lift off early;
    - side-stepping a charged attack that hurt it twice;
    - extra caution against the element that hurt it;
    - protective herds turn on a hunter who attacks their young or intrudes on the den.
- **Server** (`server/world.js`):
  - the world is authoritative, stepped every 30 s;
  - saved to the new `world_state` table every 2 min and on shutdown; on start it catches up the time the server slept;
  - `GET /api/eco` returns nearby tiles (no login);
  - `POST /api/eco/report` (login) takes kills by this hunter, nest intrusions and injuries:
    - event ids are idempotent and the calls are rate limited;
    - a report can only remove a creature that exists there.
  - Schema: `supabase/schema.sql` + idempotent DDL in `server/store.js` (RLS on, API roles revoked).
- **Client** (`src/fauna/ecoClient.js`):
  - uses the server's world when it answers (spawning waits ≤ 4 s for it); otherwise the same model runs locally (offline);
  - reports only kills made by this hunter (the model handles predation and age itself).
- Fixed: lizard / drake prey catch radius now grows with body size (adult lizards could never catch prey).

**Assumptions to confirm with the design document (flagged):**
- All timings (season length, incubation, growth, lifespans, clutch sizes).
- Golems do not breed: new golems slowly form in mineral-rich ground. The document does not say how golems reproduce.
- Bosses (Varkhul, the dragons, Cindral / Cindaryl) are not in the population model yet.

**Partial / not implemented:**
- Long-term environment change is simulated but not yet shown on the terrain (ash cover, plant growth); it is visible in data only.
- In co-op each client still simulates its own nearby individuals (the server shares the far layer).
- Nest / carcass / bones meshes were confirmed by instance counts in the headless run, not visually inspected.

### Stage 6 tests (2026-11-19)
- `node src/shared/__eco.test.mjs`: **24/24 passed**. Checks:
  - 48 h without extinction or explosion; births, deaths, predation, migration and eruptions all happen;
  - packs only; carcass states;
  - a hunted-out tile stays empty for 5 min and is refilled within hours;
  - nests and hatching; no bird nests out of season;
  - lava + hunting push animals out;
  - wolves learn faster than slimes;
  - ash after eruptions; carcasses feed fungi;
  - save / load.
- `server/api.test.mjs`: **94/94 on SQLite and pg-mem** (9 new eco checks: public read, login for reports, kill removes, carcass and pressure, idempotent, cannot invent deaths, unknown species, save / reload, catch-up after 3 h asleep).
- **End-to-end with the real server** (`server/server.js`, world warmed 6 h, headless Chromium):
  - client in server mode, spawned from server data;
  - a hunter kill reported: server count 6 → 5;
  - 1 den, 18 bones and 2 carcasses placed; no errors.
- All other suites passed: server 67, perception, fauna (two tests made robust to random stages), parts, status, player, combat 16/16.
- `tools/island-test.mjs`: 0 failed, no errors.

## Stage 6b: Weapon classes + grappling hook (2026-11-19)
**Implemented:**
- **Weapon classes**, all balance data in one table (`src/shared/weaponClasses.js`):
  - the great sword (unchanged) plus six new classes:
    - sword & shield (片手剣)
    - dual blades (双剣)
    - long sword (太刀)
    - hammer (ハンマー)
    - lance (ランス)
    - bow (弓)
  - Each class has its own move set and animation clips (`src/player/weaponClips.js`): reach, attack speed, motion values, part-break aptitude (`breakMul`, passed to `resolvePartHit` for bosses and fauna), edge wear, damage type, draw / sheathe time, parry window, drawn walk speed, guard type and roll distance.
  - **Damage types:**
    - blunt (hammer, shield bash) never glances off hard parts and breaks hard parts better;
    - pierce (lance, thrusts) glances only off the hardest;
    - bow arrows are projectiles: gravity, distance falloff, no edge wear.
  - **Class mechanics:**
    - sword & shield: 4-hit chain, shield bash, shield guard (22 %), can drink with the weapon drawn;
    - dual blades: every swing hits twice, stamina-hungry blade dance, cannot guard, fast roll;
    - long sword: cuts build Focus; the thrust → rising slash → spirit roundslash spends it for Focus levels (+6 % damage each, decaying);
    - hammer: charge while walking (levels 1–3 → upswing / overhead / spinning finisher);
    - lance: thrusts, a multi-hit shield-charge dash with super armour, tower guard (6 %, little push), short hop;
    - bow: quick shots and a held draw (1–4 arrows by level), strafing to the aim; lock-on or the crosshair aims.
  - **Models:** short sword + round shield, twin blades (the second in the left hand), curved longblade, hammer, lance + tower shield, bow held in the left hand. Both blades of the dual set cut.
  - **Gear and data:**
    - 12 new craftable weapons (`src/shared/classGear.js`), 2 per class, with JA names;
    - `loadoutStats` / `weaponStats` now report `cls`, so the equipped loadout picks the class (expeditions and the island);
    - the forge shows the class; remote hunters sync the class (`wc`);
    - `?weapon=<class>` lets you try a class.
- **Grappling hook** (`src/player/grapple.js` + `player.js`):
  - **Controls:** hold ROPE (touch button / G / gamepad LB) and double-tap (touch) or double-click the target. With the mouse captured, or with LB + A on a gamepad, it fires at the crosshair. Clicks and taps do not attack while aiming; a plain tap never fires.
  - **Targets:**
    - ground, walls (steep terrain), trees, rocks, ruins, monsters, fauna, each switchable in `GRAPPLE.targets`; any collider can opt out (`grapple: false`);
    - lava, sea and crystals are refused, with a message;
    - colliders now carry `kind` / `h`.
  - **States and physics:**
    - `ropeFire` (hook flight 0.22 s) → `ropePull` → release into the air (plunge attack possible) or idle;
    - the pull is velocity-based along the rope (no teleport), with gravity, the terrain floor and normal collision;
    - a monster anchor follows its hitbox and drags the hunter.
  - **Release** happens on contact, timeout, interruption (hit / knockdown / death), a dead target or respawn.
  - **Rope drawing:** a camera-facing ribbon from the waist with sag when slack; never through the ground.
  - 30 s cooldown from use, shown on the ROPE button and the HUD. The rope deals no damage.

**Partial / not implemented:**
- 14 of the listed classes are not implemented: 三刀流, 鉈, メイス, 狩猟笛, ガンランス, スラッシュアックス, チャージアックス, 操虫棍, ライト/ヘビィボウガン, 拳銃, マシンガン, 古の碇. They need their own move sets and models; the engine (class table + clips) is ready for them.
- Animations are hand-keyed and functional, not motion-captured quality; checked in headless renders only.
- Roll i-frames are still validated on the client only (server validation belongs to the MMO stage).
- Not checked on an iPad.

### Stage 6b tests (2026-11-19)
- `node src/player/__weapons.test.mjs`: **28/28 passed**.
  - Every class's light chain lands. Damage per second: great sword 156, sword 144, dual 140, long sword 171, hammer 218, lance 150, bow 108.
  - Break aptitude: hammer 1.5 vs bow 0.7.
  - Wear per hit: dual 0.019 > hammer 0.006, bow 0.
  - Hammer level-3 spin; bow full draw → 4 arrow hits; shield guard 22 % / tower 6 %; dual cannot guard.
  - Roll: lance 1.8 m vs dual 3.6 m. Draw: sword 0.25 s vs hammer 0.43 s. Class synced.
  - Long sword Focus → spirit level.
  - Rope: fire → pull → release at the anchor; cooldown and refusal; a moving monster drags the hunter; dead target / death / respawn leave no rope; crosshair pick; G + double-click; touch hold + double-tap; a tap without ROPE does nothing.
- `server/api.test.mjs`: **97/97 on SQLite and pg-mem** (forge + equip a hammer → loadout `cls: 'hammer'`).
- All other suites passed (server 67, perception, fauna, parts, status, eco, player, combat 16/16).
- Island test: 0 failed. Headless pose renders reviewed for each class.

## Not started (see IMPLEMENTATION_PLAN.md)
- **Stages 2–9:**
  - island content
  - all new species
  - part system v2
  - materials, carving and gear expansion
  - the remaining weapon classes (see stage 6b)
  - enchanting
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

### Stage 3d tests (mole / golem, 2026-11-19)
- `node src/fauna/__fauna.test.mjs`: 51 passed.
- Mole:
  - Underground and untouchable; follows the footsteps.
  - Bursts out under a moving hunter (30 dmg), then digs back down.
  - The Grand Mole is a mole with 15,000 HP.
- Golem:
  - Stays a rock at 15 m and rises at 5 m.
  - Attacks (138 dmg), returns home and settles without leaving its territory.
  - Striking a dormant golem wakes it hostile.
  - A bird perched on a golem bursts away when the golem moves.
- Bug found and fixed: the mole's surface timer did not run while it was attacking, so a mole fighting a hunter at close range never dug back down.
- Browser (headless): the mole burst out and knocked the hunter down; the woken golem fought; the far golem stayed a rock. No errors.

### Stage 3e tests (dragons / 燼皮, 2026-11-19)
- `node src/fauna/__fauna.test.mjs`: 55 passed.
  - 燼皮: roams instead of ambushing, scavenges a carcass, flees a wolf pack, fights an intruder.
- Browser (headless):
  - All 7 island bosses load (Varkhul, Cindral, Gorvath, Flame Dragon, Flame Dragon elder, Venom-fang Dragon, Cindaryl). No errors.
  - The 4 new dragons are cloned from the shared mesh in 1–3 ms each.
- Combat over 30 s of game time per dragon:
  - Venom-fang lands to fight and applies normal poison.
  - Cindaryl applies deadly poison and lethal venom.
  - The Flame Dragon only burns.
  - Cindral is unchanged (burns plus deadly-poison talon dive).
- The original Cindral boss field (`?hunt=wyvern`) still loads normally with its original colours, with no errors.

### Stage 5b tests (2026-11-19)
- `server/api.test.mjs`: 85 passed on SQLite and pg-mem (+5 tests):
  - An island weapon needs island materials.
  - Forging the Venom-fang Greatsword consumes the materials; upgrading it works.
  - Equipped, it gives poison 440.
  - A Crystal Boar chest piece can be forged.
- A flaky test assumption was fixed: random carves had left materials in the account.
- End-to-end (local server + headless browser):
  - Materials earned through real carving API calls (boar carcasses + a crystal piece) show in the forge.
  - 結晶牙の大鉈 is listed with its stats; the comparison against the equipped blade shows attack +168 and sharpness +0.20; owned/required counts are shown per material.
  - No errors.
