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

**Co-op from the GitHub Pages site:** set the repo variable `WILDBOUND_SERVER_URL` to `wss://<your-render-host>` (Settings → Secrets and variables → Actions → Variables), then re-run the Pages workflow. The server accepts the Pages origin via `ALLOWED_ORIGINS` (set in `render.yaml`/`Dockerfile`).

**Fly.io (alternative):** `fly launch --copy-config --no-deploy` (choose a unique app name), then `fly deploy`. It uses `Dockerfile` and `fly.toml`.

Server env: `PORT`, `ALLOWED_ORIGINS` (comma-separated page origins), `TRUST_PROXY=1` (client IP from X-Forwarded-For), `ALLOW_ANY_ORIGIN=1`.
