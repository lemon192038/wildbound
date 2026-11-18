// Headless soak test for the streamed island: walks the hunter across the island, then checks streaming invariants.
// Usage: (vite preview on :4173) node tools/island-test.mjs
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.BASE || 'http://localhost:4173';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
const t0 = Date.now();
await page.goto(`${base}/?mode=field&field=island&shot=1&low=1`, { timeout: 600000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
const bootMs = Date.now() - t0;
const result = await page.evaluate(async () => {
  const g = window.__game, W = g.world, C = W.chunks, P = g.player;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mem0 = { ...g.renderer.info.memory };
  const route = [[40, 700], [300, 500], [600, 150], [500, -400], [0, -650], [-500, -350], [-700, 100], [-400, 600], [40, 700]];
  let maxActive = 0, holes = 0, maskMismatch = 0, steps = 0, maxQueue = 0; const heightErr = [];
  for (let k = 0; k < route.length - 1; k++) {
    const [ax, az] = route[k], [bx, bz] = route[k + 1]; const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 24);
    for (let i = 1; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      P.position.set(x, W.getHeight(x, z), z); steps++;
      await wait(60);
      const s = C.stats(); maxActive = Math.max(maxActive, s.counts.ACTIVE); maxQueue = Math.max(maxQueue, s.queue);
      // invariant: the tile under the hunter is always drawn by something (ACTIVE near tile, or the far layer)
      const [tx, tz] = C.tileOf(x, z); const T = C.tiles.get(tz * C.NT + tx);
      const bit = C.maskTex.image.data[(tz * C.NT + tx) * 4] > 0;
      if (bit && T?.state !== 'ACTIVE') holes++;
      if (T?.state === 'ACTIVE' && !bit) maskMismatch++;
      // collision height == mesh source (analytic) within interpolation error
      if (T?.state === 'ACTIVE') { const a = W.getHeight(x + 0.37, z + 0.61), b = W.island.height(x + 0.37, z + 0.61); heightErr.push(Math.abs(a - b)); }
    }
  }
  // let the queue drain at the end
  for (let i = 0; i < 100 && C.stats().queue > 0; i++) await wait(100);
  // global mask ↔ state consistency
  let bad = 0; for (let tz = 0; tz < C.NT; tz++) for (let tx = 0; tx < C.NT; tx++) { const T = C.tiles.get(tz * C.NT + tx); const bit = C.maskTex.image.data[(tz * C.NT + tx) * 4] > 0; if (bit !== (T?.state === 'ACTIVE')) bad++; }
  const mem1 = { ...g.renderer.info.memory };
  heightErr.sort((a, b) => a - b);
  return { steps, maxActive, maxQueue, holes, maskMismatch, maskBadEnd: bad, stats: C.stats(), mem0, mem1, heightErrP95: heightErr[Math.floor(heightErr.length * 0.95)], heightErrMax: heightErr[heightErr.length - 1], boot: W.stats.boot, phases: g.loading.times };
});
console.log(JSON.stringify({ bootMs, ...result, errors: errs.slice(0, 20) }, null, 1));
await browser.close();
