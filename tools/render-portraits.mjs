// Renders the world-map boss portraits with the REAL monster code (no hand-drawn art):
//   node tools/render-portraits.mjs            → public/portraits/{varkhul,wyvern,brute}.webp
// Starts a Vite dev server on the project root, opens tools/portraits/index.html?boss=… in headless Chromium
// (SwiftShader WebGL), and post-processes the frame with sharp (vignette + webp ≤ 200 KB).
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');
const { createServer } = await import('vite');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/portraits'); fs.mkdirSync(outDir, { recursive: true });
const server = await createServer({ root, configFile: path.join(root, 'vite.config.js'), server: { port: 5199, strictPort: false }, logLevel: 'warn' });
await server.listen(); const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const bosses = process.argv.slice(2).length ? process.argv.slice(2) : ['varkhul', 'wyvern', 'brute'];
try {
  for (const boss of bosses) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${boss}] ${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => console.log(`[${boss}] pageerror: ${e.message}`));
    page.setDefaultTimeout(600000);
    await page.goto(`${base}/tools/portraits/index.html?boss=${boss}`, { timeout: 600000 });
    await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 });
    console.log(boss, JSON.stringify(await page.evaluate(() => window.__shot)));
    const png = await page.locator('canvas').screenshot({ timeout: 600000 });
    // vignette overlay, then encode
    const vig = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="576"><defs><radialGradient id="g" cx="50%" cy="48%" r="70%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.75"/></radialGradient></defs><rect width="768" height="576" fill="url(#g)"/></svg>`);
    let q = 82, buf;
    do { buf = await sharp(png).resize(768, 576, { fit: "cover" }).composite([{ input: vig }]).webp({ quality: q }).toBuffer(); q -= 8; } while (buf.length > 200 * 1024 && q > 30);
    fs.writeFileSync(path.join(outDir, `${boss}.webp`), buf); console.log(`→ public/portraits/${boss}.webp ${(buf.length / 1024).toFixed(0)} KB`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
