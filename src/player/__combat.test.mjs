// Combat mechanics on the player test bench (deterministic 60 Hz stepping through window.__step):
//   long-press sheathe → counter stance → parry (success / miss), roll distance + i-frame window (no lingering),
//   jump + landing, plunging attack, drink time + dodge cancel (nothing consumed), sleep / stun / confusion / silence.
// Usage: node src/player/__combat.test.mjs   (BASE or http://localhost:5203; starts vite on 5203 if nothing is listening)
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5203';
let server = null;
const up = async () => { try { await fetch(BASE + '/src/player/__harness.html'); return true; } catch { return false; } };
if (!(await up())) {
  server = spawn('npx', ['vite', '--port', new URL(BASE).port || '5203', '--strictPort'], { cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let results = [];
try {
  await page.goto(BASE + '/src/player/__harness.html?shot=1&flat=1', { timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  results = await page.evaluate(() => {
    window.__manual = true;
    const g = window.__game, P = g.player, m = g.monsters[0], S = g.status, step = window.__step, out = [];
    const check = (name, pass, info = {}) => out.push({ name, pass: !!pass, ...info });
    const press = (k) => (i) => (i === 0 ? { [k]: true } : {});
    const reset = () => { S.clear(); for (const k in S.immune) S.immune[k] = 0; for (const k in S.wards) S.wards[k] = 0; P.debug.setDrawn(false); P.parryReady = false; P.hp = P.maxHp; P.stamina = P.maxStamina; P.position.set(0, 0, 6); P.facing = Math.PI; P.setState('idle'); step(0.8); P.position.set(0, 0, 6); step(0.1); };
    m.position.set(0, -50, -40); // stub out of the way unless a test places it
    // 1) tap while drawn = slash; hold 0.45 s = sheathe into the counter stance
    reset(); P.debug.setDrawn(true); step(0.1, (i) => (i === 0 ? { lightAttack: true, lightHeld: true } : {}));
    check('tap while drawn → slash', P.state === 'light1', { state: P.state });
    reset(); P.debug.setDrawn(true); step(1.6, (i) => ({ lightAttack: i === 0, lightHeld: true }));
    check('hold while drawn → sheathe into counter stance', !P.weaponDrawn && P.parryReady, { state: P.state, drawn: P.weaponDrawn, ready: P.parryReady });
    // 2) parry: press & release while sheathed in the stance; a physical blow inside the window is caught
    step(0.05, press('lightAttack')); const st = P.state;
    const src = { isFauna: true, S: {}, staggerT: 0, position: { x: 0, z: 3 } };
    const hp0 = P.hp; const r = P.receiveHit({ damage: 40, knockback: 8, from: { x: 0, y: 0, z: 3 }, kind: 'physical', source: src });
    check('parry window catches a physical blow', st === 'parry' && r === false && P.hp === hp0 && src.staggerT > 0 && P.state === 'light2' && P.weaponDrawn, { st, r, state: P.state, stagger: src.staggerT });
    // a projectile / burst is never parryable
    reset(); P.parryReady = true; step(0.05, press('lightAttack'));
    const r2 = P.receiveHit({ damage: 20, from: { x: 0, y: 0, z: 3 }, kind: 'aoe', source: src });
    check('area bursts are not parryable', r2 !== false && P.hp < P.maxHp);
    // missing: the window closes into a short recovery that a roll cancels
    reset(); P.parryReady = true; step(0.05, press('lightAttack')); step(0.3);
    const miss = P.state; step(0.05, press('dodge'));
    check('missed parry → recovery, dodge-cancelable', miss === 'parryMiss' && P.state === 'dodge', { miss, state: P.state });
    // 3) roll: distance and the invulnerable window
    reset(); const z0 = P.position.z; const tr = []; step(0.75, (i) => { if (i % 3 === 0 && i > 30) tr.push(P.state + ':' + P.position.z.toFixed(2)); return i === 0 ? { dodge: true } : {}; }); const dist = Math.abs(P.position.z - z0);
    check(`roll covers ~${P.roll.dist} m`, Math.abs(dist - P.roll.dist) < 0.6, { dist: +dist.toFixed(2), tr });
    reset(); step(2 / 60, press('dodge')); let firstVuln = null, invulnSeen = false;
    for (let i = 1; i < 40; i++) { step(1 / 60); const before = P.hp; const hit = P.receiveHit({ damage: 1, from: { x: 0, y: 0, z: P.position.z + 2 } }); if (hit === false) invulnSeen = true; else if (invulnSeen) { firstVuln = i / 60; break; } else P.hp = P.maxHp; }
    check('i-frames end with the window (no lingering)', invulnSeen && firstVuln != null && Math.abs(firstVuln - P.roll.iEnd) < 0.05, { firstVuln });
    // 4) jump & land, plunge hits on landing
    reset(); step(0.05, press('jump')); const air = P.airborne, y = P.position.y; step(1.2);
    check('jump leaves the ground and lands', air && y > 0.1 && !P.airborne && P.position.y === 0, { air, y: +y.toFixed(2), state: P.state });
    reset(); P.debug.setDrawn(true); m.position.set(0, 1.4, 4.2); m.hits.length = 0;
    step(0.25, press('jump')); step(0.05, press('lightAttack')); const pl = P.state; step(1.2);
    check('plunging attack hits on landing', pl === 'plunge' && m.hits.length > 0, { pl, hits: m.hits.length });
    m.position.set(0, -50, -40);
    // 5) drink time and cancel
    reset(); let used = 0; P.useItem('potion', { id: 'antidote', heal: 0, drink: 1.2, onUse: () => used++ });
    step(0.6); step(0.05, press('dodge'));
    check('dodge before the swallow cancels without using the item', used === 0 && P.state === 'dodge', { used, state: P.state });
    reset(); used = 0; P.useItem('potion', { id: 'antidote', heal: 0, drink: 1.2, onUse: () => used++ }); step(1.1); const early = used; step(0.2);
    check('effect lands at the drink time (1.2 s)', early === 0 && used === 1, { early, used });
    // 6) ailments drive the hunter
    reset(); S.apply('sleep'); step(0.1); const sl = P.state; P.receiveHit({ damage: 10, from: { x: 0, y: 0, z: 9 } });
    check('sleep lays the hunter down; a hit wakes them', sl === 'sleep' && !S.has('sleep'), { sl });
    reset(); S.apply('stun', 'long'); step(0.1); const stn = P.state; step(3.5);
    check('stun holds the hunter, then wears off', stn === 'stun' && P.state !== 'stun', { stn, after: P.state });
    reset(); S.apply('confusion', 'long'); const zc = P.position.z; step(1, { worldMove: new g.THREE.Vector3(0, 0, -1) });
    check('long confusion reverses movement', P.position.z > zc + 0.5, { dz: +(P.position.z - zc).toFixed(2) });
    reset(); S.apply('silence'); P.parryReady = true; step(0.05, press('lightAttack'));
    check('silence blocks the parry', P.state !== 'parry' && P.state !== 'parryPrep', { state: P.state });
    reset(); S.apply('speedDown'); const zs = P.position.z; step(1, { worldMove: new g.THREE.Vector3(0, 0, -1) }); const slow = zs - P.position.z;
    reset(); const zn = P.position.z; step(1, { worldMove: new g.THREE.Vector3(0, 0, -1) }); const norm = zn - P.position.z;
    check('speed down slows walking', slow < norm * 0.85, { slow: +slow.toFixed(2), norm: +norm.toFixed(2) });
    return out;
  });
} catch (e) { results.push({ name: 'harness', pass: false, error: e.message }); }
for (const r of results) console.log(r.pass ? 'ok  ' : 'FAIL', r.name, JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'name' && k !== 'pass'))));
if (errors.length) console.log('errors:', errors);
const pass = results.length && results.every((r) => r.pass) && !errors.length;
console.log(pass ? 'all combat tests passed' : 'combat tests FAILED');
await browser.close(); server?.kill();
process.exit(pass ? 0 : 1);
