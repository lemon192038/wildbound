// Usage: node tools/shot.mjs <out.png> [query] [waitMs] [script.js]
// Builds nothing: expects `npx vite preview --port 4173` or dev server at BASE (default http://localhost:4173).
// Optional script: JS evaluated in page after ready (e.g. drive __game). Prints console errors.
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const [out = 'shot.png', query = 'shot=1', wait = '2500', script] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:4173';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
page.setDefaultTimeout(600000); await page.goto(`${base}/?${query}`, { timeout: 600000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 }).catch(() => errs.push('[timeout] __ready never set'));
if (script) { const fs = await import('fs'); await page.evaluate(fs.readFileSync(script, 'utf8')).catch((e) => errs.push('[script] ' + e.message)); }
await page.waitForTimeout(+wait);
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r((n * 1000) / (performance.now() - t0)); }; requestAnimationFrame(f); }));
await page.screenshot({ path: out, timeout: 600000 });
console.log(JSON.stringify({ out, fps: +fps.toFixed(1), errors: errs.slice(0, 30) }, null, 1));
await browser.close();
