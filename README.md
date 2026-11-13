# Wildbound

An original co-op monster-hunting action game in Three.js. Everything is procedural: meshes, textures, animation, sound and music are generated in code, with no asset files.

## Run

```bash
npm install
```

```bash
npm start            # builds dist/ and serves game + co-op server on http://localhost:8080
```

For development (hot reload), run `node server/server.js` alongside `npm run dev`, then open http://localhost:5173/?online=1.

Open the page in two browser windows to hunt together (up to 4 per room, auto-matchmade; `?room=NAME` for a private room).

## Controls

| Action | Keys |
|---|---|
| Move / camera | WASD / mouse (gamepad supported) |
| Sprint / dodge | Shift / Space |
| Light combo | Left mouse |
| Charged slash (3 levels) | Hold right mouse, release |
| Shoulder tackle → True Charge | Left mouse while charging, then hold right mouse |
| Guard | Q |
| Use item / select item | R / 1–4 or wheel |
| Lock-on | F or Tab |
| Chat / menu | Enter / Esc |

## Quarries

Choose on the title screen, or use the URL: `?hunt=wyvern`.

- **Varkhul, the Emberhide:** a ground beast built fully procedurally (default).
- **Cindral, the Ashwing:** a flying wyvern. Its mesh was made by the project owner, and `tools/rig-wyvern.mjs` processes it offline: simplify (300k → 48k triangles), compress textures to WebP, then auto-rig (24 joints with computed skin weights) into `public/models/wyvern.glb`.
  - **Moveset:**
    - **Hover rock-bombing:** timed rock bombs swell and glow, then blast a wide area (large burn).
    - **Forced detonation:** a fireball shot or a bite sets the bombs off early, and blasts chain to nearby bombs.
    - **Back-jump rock spit:** leaves a short-fuse bomb at the hunter's feet.
    - **Great roar:** a long, wide stun that always leads into a back-jump spit or a dive.
    - **Dragon wind pressure:** landing, takeoff and the gust cause a long stun.
    - **Sweeping breath:** a fan of flame from the ground or the air, leaving burning ground.
    - **Chained talon dives:** 2–3 dives, 3 when enraged, inflicting deadly poison.
  - **Ailments** (`src/core/status.js`):
    - **Burn:** each dodge roll smothers 4 s.
    - **Deadly poison:** about 6 HP/s for 16 s. Drinking a draught halves what remains.
  - **How to fight it:** while it hovers, hit its tail and legs. When it lands after a dive, or while it is exhausted, go for the head. Breaking the wings or tail crashes it to the ground.
  - **Re-rigging a new export:** `node tools/rig-wyvern.mjs <source.glb> public/models/wyvern.glb`
- **Co-op:** rooms are matched per quarry.

**Quest loop:** slaying the boss shows QUEST COMPLETE with spoils and a countdown. After 30 s (set with `?respawn=N` seconds) a fresh boss of the same quarry appears and the quest restarts. The hunter is restored: HP, stamina, sharpness, 10 potions. A timed-out quest (QUEST FAILED) restarts the same way. In co-op the host decides when the respawn happens; snapshots carry a quest generation, so every client switches over together (`src/core/quest.js`).

## Structure

See `CONTRACTS.md`. `src/world` (terrain, foliage, sky, water, post), `src/monster` (Varkhul: rig, AI, attacks, part breaks), `src/player` (hunter, combat, camera), `src/ui`, `src/audio`, `src/net` + `server/` (WebSocket rooms, host-authoritative monster and damage validation).

Tests: `node server/test.mjs` (net), `node src/player/__test.mjs` (combat).
Debug URL params: `?low=1`, `?hq=1`, `?autoplay=1`, `?shot=1`, `?cam=x,y,z,tx,ty,tz`, `?monsterAttack=<name>`, `?online=0|1`.

## Tablets (iPad Safari)

Touch devices get on-screen controls automatically (force with `?touch=1`). Drag anywhere on the left half for a floating move stick (push past the rim to sprint) and drag on the right half to look. The buttons are ATTACK (tap), HEAVY (hold, then release), DODGE, GUARD (hold), ITEM, NEXT (cycle item), LOCK and MENU. Touch devices also default to the low-cost render path; add `?hq=1` to override.

Static offline build (no co-op server): `VITE_STATIC=1 npx vite build --outDir <dir>`.

## Deploy

**Solo, GitHub Pages:** pushing to `main` runs `.github/workflows/pages.yml` (tests, then a static build) and publishes to https://lemon192038.github.io/wildbound/. One-time setup: Settings → Pages → Source: **GitHub Actions**.

**Co-op server, Render (free):** Render → New → Blueprint → this repo (uses `render.yaml`). The server also hosts the full game at its own URL, e.g. `https://wildbound.onrender.com`; co-op works there directly.

**Co-op from the GitHub Pages site:** the Pages build connects to `wss://wildbound-jl72.onrender.com` by default. To use a different server, set the repo variable `WILDBOUND_SERVER_URL` (Settings → Secrets and variables → Actions → Variables), then re-run the Pages workflow. The server accepts the Pages origin via `ALLOWED_ORIGINS` (set in `render.yaml`/`Dockerfile`).

**Fly.io (alternative):** `fly launch --copy-config --no-deploy` (choose a unique app name), then `fly deploy`. It uses `Dockerfile` and `fly.toml`.

Server env: `PORT`, `ALLOWED_ORIGINS` (comma-separated page origins), `TRUST_PROXY=1` (client IP from X-Forwarded-For), `ALLOW_ANY_ORIGIN=1`.
