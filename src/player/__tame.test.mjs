// Taming / riding on the player test bench (deterministic 60 Hz stepping through window.__step): summon → mount →
// dismount on the spot, speed, lava (blocked vs lava swimmer), flight, unseen / camo, heat / poison immunity,
// thrown off by hits (sturdy holds on), no attacks while mounted, input bindings (T / touch RIDE / pad).
// Usage: node src/player/__tame.test.mjs   (BASE or http://localhost:5203; starts vite on 5203 if nothing is listening)
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
const page = await browser.newPage({ viewport: { width: 640, height: 400 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let results = [];
try {
  await page.goto(BASE + '/src/player/__harness.html?shot=1&flat=1&nomon=1', { timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  results = await page.evaluate(async () => {
    window.__manual = true;
    const g = window.__game, P = g.player, step = window.__step, res = [];
    const check = (name, pass, info = {}) => res.push({ name, pass: !!pass, ...info });
    const { createRide } = await import('/src/tame/ride.js');
    const { TAMES } = await import('/src/shared/tame.js');
    // a lava strip across x ∈ [8, 14] on the flat bench, surface at y = 0
    g.world.lavaAt = (x) => x > 8 && x < 14; g.world.lavaSurfaceAt = (x, z) => (g.world.lavaAt(x, z) ? 0 : null); g.world.colliders = [];
    const ride = createRide(g); g.tame = ride; P.ride = ride;
    const tick = (sec, inp = {}) => step(sec, (i) => { ride.update(1 / 60); return typeof inp === 'function' ? inp(i) : inp; });
    const use = async (sp) => { if (ride.active) ride.dismount(P); g.tameOverride = sp; P.position.set(0, 0, 0); P.facing = Math.PI / 2; P.setState('idle'); P.hp = P.maxHp; g.status.clear(); tick(0.2); await ride.whenReady(); }; // the real model loads asynchronously
    const press = (i) => (i === 0 ? { summon: true } : {});

    // --- the button cycle: summon → mount → dismount on the spot
    await use('wolf');
    tick(0.1, press); const s1 = ride.summoned && !ride.active && ride.model?.root.visible;
    tick(0.1, press); const s2 = ride.active;
    const pMount = P.position.clone();
    check('RIDE: 1st press summons the construct beside you, 2nd press mounts it on the spot', s1 && s2, { s1, s2 });
    check('mounting sheathes the weapon and lifts the hunter onto the saddle', !P.weaponDrawn && pMount.y > 0.5, { y: +pMount.y.toFixed(2) });
    // speed (+x is "right" in camera space; drive with a world move along +z instead)
    P.position.set(0, P.position.y, 0); const z0 = ride.position.z; tick(2, { worldMove: new g.THREE.Vector3(0, 0, -1) });
    const v = Math.abs(ride.position.z - z0) / 2;
    check('riding is much faster than running on foot (4.7 m/s)', v > 9, { mps: +v.toFixed(1), wolf: TAMES.wolf.speed });
    tick(0.1, { lightAttack: true, heavyAttack: true, item: true }); check('no attacks / items while mounted (constructs never fight)', ride.active && !/light|heavy|slash|potion|drink/.test(P.state), { state: P.state });
    const at = ride.position.clone(); tick(0.1, press);
    check('a press while riding dismounts on the spot', !ride.active && Math.hypot(P.position.x - at.x, P.position.z - at.z) < 2.5 && P.position.y < 0.2 && P.state === 'idle', { d: +Math.hypot(P.position.x - at.x, P.position.z - at.z).toFixed(2) });
    // --- lava: blocked for an ordinary construct, crossed by the artificial Lava Snake
    tick(0.1, press); P.position.set(2, 0, 0); ride.mount(P); tick(3, { worldMove: new g.THREE.Vector3(1, 0, 0) });
    check('an ordinary construct stops at the lava edge', ride.position.x < 8.2 && ride.stats.lavaBlocked > 0, { x: +ride.position.x.toFixed(2) });
    await use('snake'); tick(0.1, press); tick(0.1, press); P.position.set(2, 0, 0); ride.mount(P);
    let inLava = 0, safe = true; tick(2.5, (i) => { if (g.world.lavaAt(ride.position.x)) { inLava++; if (!P.lavaSafe) safe = false; } return { worldMove: new g.THREE.Vector3(1, 0, 0) }; });
    check('人造ラヴァスネーク swims across the lava', ride.position.x > 14 && inLava > 10, { x: +ride.position.x.toFixed(1), frames: inLava });
    check('…and its rider is lava-safe and cannot be burned', safe && g.status.apply('burn', 'large') === false && !g.status.has?.('burn'), {});
    // --- flight: the artificial Flame Dragon
    await use('flame'); tick(0.1, press); tick(0.1, press); const gy = ride.position.y;
    tick(2, (i) => (i % 15 === 0 ? { jump: true } : {})); const alt = ride.position.y - gy;
    check('人造火焔龍 flies (jump climbs)', ride.flying && alt > 8, { alt: +alt.toFixed(1) });
    tick(0.6, { worldMove: new g.THREE.Vector3(1, 0, 0) }); check('…and flies over lava', ride.position.x > 0 && ride.flying, { x: +ride.position.x.toFixed(1) });
    tick(4, (i) => (i % 10 === 0 ? { dodge: true } : {})); check('dodge descends until it lands', !ride.flying && ride.position.y < 0.05, { y: +ride.position.y.toFixed(2) });
    check('a fire-dragon rider cannot be burned (heatproof)', g.status.apply('burn', 'small') === false);
    // --- unseen: the artificial Stone Mole; camo: the artificial Boulder Golem only while still
    await use('mole'); tick(0.1, press); tick(0.1, press); tick(0.3);
    check('人造ストーンモール: its rider is never targeted (P.unseen)', P.unseen === true);
    ride.dismount(P); check('…and is seen again on foot', P.unseen === false);
    await use('golem'); tick(0.1, press); tick(0.1, press); tick(0.3, { worldMove: new g.THREE.Vector3(0, 0, 1) }); const moving = P.unseen; tick(2.5);
    check('golem construct: hidden only when standing still (rock mimicry)', moving === false && P.unseen === true, { moving, active: ride.active, sp: ride.sp, st: P.state, sum: ride.summoned });
    // perception: an unseen hunter is not a candidate
    const { createPerception } = await import('/src/core/perception.js');
    const mon = { position: P.position.clone().add(new g.THREE.Vector3(0, 0, 3)), yaw: 0 };
    const perc = createPerception(g, mon); let noticed = false; for (let i = 0; i < 120; i++) { perc.update(1 / 20, [P]); if (perc.state === 'AGGRESSIVE') noticed = true; }
    check('monster perception ignores an unseen rider', !noticed && perc.state !== 'AGGRESSIVE', { state: perc.state });
    ride.dismount(P); const perc2 = createPerception(g, { position: P.position.clone().add(new g.THREE.Vector3(0, 0, 3)), yaw: Math.PI }); let seen2 = false; for (let i = 0; i < 120; i++) { perc2.update(1 / 20, [P]); if (perc2.state === 'AGGRESSIVE' || perc2.alert > 0.3) seen2 = true; }
    check('control: the same hunter on foot is noticed', seen2, { state: perc2.state, alert: +perc2.alert.toFixed(2) });
    // --- poison: venom dragon construct
    await use('venom'); tick(0.1, press); tick(0.1, press); check('venom-fang construct: rider cannot be poisoned', g.status.apply('poison', 'deadly') === false);
    ride.dismount(P); check('…on foot poison applies again', g.status.apply('poison', 'normal') !== false); g.status.clear();
    // --- hits: thrown off (not sturdy) vs sturdy
    await use('wolf'); tick(0.1, press); tick(0.1, press); P.receiveHit({ damage: 10, knockback: 3, from: P.position.clone().add(new g.THREE.Vector3(1, 0, 0)), kind: 'physical' });
    check('a hit throws the rider off an ordinary construct', !ride.active && ride.stats.thrown >= 1);
    tick(1.5); await use('tusk'); tick(0.1, press); tick(0.1, press); P.receiveHit({ damage: 10, knockback: 3, from: P.position.clone().add(new g.THREE.Vector3(1, 0, 0)), kind: 'physical' });
    check('a sturdy construct (Crystal Tusk) keeps its rider on', ride.active);
    // --- bounce
    await use('slime'); tick(0.1, press); tick(0.1, press); let top = 0; tick(1.2, (i) => { top = Math.max(top, ride.position.y); return i === 0 ? { jump: true } : {}; });
    check('slime construct: great leap', top > 4, { top: +top.toFixed(1) });
    ride.dismount(P);
    // --- every species builds a model with a saddle
    const { createMountModel } = await import('/src/tame/mountModel.js'); let built = 0;
    const seats = {}; for (const sp of Object.keys(TAMES)) { const m = await createMountModel(sp); const s = m.seatWorld(new g.THREE.Vector3()); seats[sp] = +s.y.toFixed(2); if (s.y > 0.5 && s.y < 9 && m.model.parts.length) built++; m.dispose(); }
    check(`all ${Object.keys(TAMES).length} constructs use the real monster model with a saddle on its back`, built === Object.keys(TAMES).length, { built, seats });
    // --- input bindings
    const inp = g.input; inp.pressed.add('KeyT'); const sk = inp.poll(); check('keyboard T = RIDE', !!sk.summon);
    const btn = [...(inp.touch?.root?.querySelectorAll('.tc-btn') || [])].find((b) => b.dataset.act === 'summon');
    check('touch RIDE button exists', !!btn || !inp.touch, { touch: !!inp.touch });
    return res;
  });
} finally {
  await browser.close(); if (server) server.kill();
}
let fail = 0;
for (const r of results) { console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`, Object.keys(r).length > 2 ? JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'name' && k !== 'pass'))) : ''); if (!r.pass) fail++; }
if (errors.length) { console.log('page errors:', errors.slice(0, 10)); }
console.log(fail || errors.length ? `${fail} taming test(s) failed` : 'all taming tests passed');
process.exit(fail || errors.length ? 1 : 0);
