# Wildbound — standing rules for AI developers

Read this first, then `PROGRESS.md` (what exists / what is next) and `IMPLEMENTATION_PLAN.md` (the roadmap). Module contracts: `CONTRACTS.md`.

## Never
- Never delete or simplify existing features: the 3 bosses (Varkhul `src/monster/monster.js`, Cindral `wyvern.js`, Gorvath `brute.js`), their fields (`src/world/fields.js`), the town, the economy, accounts, co-op.
- Never report something as done, verified or "100-player ready" without having run it. Mark items **implemented / partial / not implemented / unverified**.
- Never let the client decide economy or world-event results. Server is authoritative (`server/economy.js`, `store.mutateSave`).
- Never store secrets in the repo, client code or chat. `DATABASE_URL` lives only in Render's dashboard.
- Never put model identifiers in commits, code or docs.
- Never change the user's monster lore (species relations, diets, names, male/female pairs, special individuals). The source of truth is the user's design document. If it is technically problematic, explain the problem first.
- Never recreate copyrighted game content (names, art, music, levels, look). Mechanics may be inspired; everything else is original.

## Always
- Survey before building and reuse existing systems. Keep `PROGRESS.md` current before stopping.
- Run the tests:
  - `node server/test.mjs`
  - `node --experimental-sqlite server/api.test.mjs`
  - `STORE=pgmem node server/api.test.mjs`
  - `node src/core/__perception.test.mjs`
  - `node src/fauna/__fauna.test.mjs`
  - `node src/core/__parts.test.mjs`
  - `node src/player/__test.mjs`
  - Build with `npx vite build`, then run the headless checks with `npx vite preview --port 4173`:
    - `node tools/island-test.mjs`
    - `node tools/shot.mjs <png> "<query>"`
- Design for iPad Safari: touch-only play, low render path (`?low=1`), per-frame work budgets.
- Branching: work-in-progress goes to a feature branch. `main` auto-deploys GitHub Pages; the server deploys from Render (`render.yaml`).
- The DB is Supabase Postgres in production and SQLite locally. Schema changes go in `supabase/schema.sql`, plus idempotent DDL in `server/store.js`. Use migrations; never drop user data.

## Layout
- **`src/world/island/`:** the open volcanic island (streamed chunks, regions, props).
- **`src/core/perception.js` + `src/shared/senses.js`:** monster senses.
- **`src/fauna/`:** small island fauna (species data, AI, census, instanced render).
- **`src/core/parts.js`:** shared part rules: part HP vs body HP, one-time break damage, hardness/deflect/wear, regrowth, lost abilities, part targeting.
- **`src/ui/debugOverlay.js`:** the developer overlay, `?debug=1` (`?debug=2` adds gizmos; F3 toggles).
- **`src/core/log.js`:** throttled diagnostics.
- **URLs:**
  - Island: `?mode=field&field=island`.
  - Boss fields: `?hunt=varkhul|wyvern|brute` or a server expedition `?quest=<iid>`.
  - Town: the default.
