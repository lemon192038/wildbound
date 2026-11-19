// Weapon classes + grappling hook on the player test bench (deterministic 60 Hz stepping through window.__step).
// Usage: node src/player/__weapons.test.mjs   (BASE or http://localhost:5203; starts vite on 5203 if nothing is listening)
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
let results = [], table = null;
try {
  await page.goto(BASE + '/src/player/__harness.html?shot=1&flat=1', { timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  const out = await page.evaluate(async () => {
    window.__manual = true;
    const g = window.__game, P = g.player, m = g.monsters[0], step = window.__step, res = [], table = {};
    const check = (name, pass, info = {}) => res.push({ name, pass: !!pass, ...info });
    const press = (k, extra = {}) => (i) => (i === 0 ? { [k]: true, ...extra } : extra);
    const away = () => m.position.set(0, -50, -40);
    const reset = (cls) => { P.setWeaponClass(cls); P.debug.setDrawn(false); P.hp = P.maxHp; P.stamina = P.maxStamina; P.sharpness = 1; P.lockTarget = null; P.position.set(0, 0, 6); P.facing = Math.PI; P.setState('idle'); step(0.6); P.position.set(0, 0, 6); away(); m.hits.length = 0; };
    const front = (d) => m.position.set(P.position.x + Math.sin(P.facing) * d, 1.4, P.position.z + Math.cos(P.facing) * d);
    const CLS = Object.keys(window.__WC || {}).length ? Object.keys(window.__WC) : ['greatsword', 'sword', 'dual', 'longsword', 'hammer', 'lance', 'bow', 'tri', 'machete', 'mace', 'horn', 'cannonlance', 'shiftaxe', 'bulwarkaxe', 'staff', 'lightxbow', 'heavyxbow', 'pistol', 'machinegun', 'anchor'];
    const RANGED = new Set(['bow', 'lightxbow', 'heavyxbow', 'pistol', 'machinegun']);
    for (const cls of CLS) {
      reset(cls); P.debug.setDrawn(true); step(0.1);
      front(RANGED.has(cls) ? 12 : cls === 'lance' || cls === 'cannonlance' ? 3.2 : 2.3); if (RANGED.has(cls)) P.lockTarget = m;
      const hp0 = m.hp, s0 = P.sharpness; let presses = 0;
      step(4, (i) => { const at = i % 24 === 0; if (at) presses++; return at ? { lightAttack: true } : {}; }); // mash light for 4 s
      const dmg = hp0 - m.hp, hits = m.hits.length; const wear = (s0 - P.sharpness) / Math.max(1, hits);
      const br = m.hits[0]?.breakMul;
      table[cls] = { dps: Math.round(dmg / 4), hits, wearPerHit: +wear.toFixed(4), breakMul: br, state: P.state, clip: P.view.anim };
      check(`${cls}: light chain hits (${hits} hits, ${Math.round(dmg / 4)} dmg/s)`, hits >= 2 && dmg > 0, table[cls]);
      m.hp = m.maxHp;
    }
    // balance: sustained light-chain damage within a band of the great sword's
    const ref = table.greatsword.dps; check('light-chain damage per second: melee 0.5×–1.6×, ranged 0.45×–1.2× of the great sword (ranged trades damage for safety)', Object.entries(table).every(([k, r]) => (RANGED.has(k) ? r.dps > ref * 0.45 && r.dps < ref * 1.2 : r.dps > ref * 0.5 && r.dps < ref * 1.6)), { ref });
    check('part-break aptitude differs (hammer > bow)', table.hammer.breakMul > 1.3 && table.bow.breakMul < 0.8, { hammer: table.hammer.breakMul, bow: table.bow.breakMul });
    check('machete wears fastest, guns do not wear, mace breaks parts better than the sword', table.machete.wearPerHit > table.sword.wearPerHit && table.pistol.wearPerHit === 0 && table.mace.breakMul > table.sword.breakMul, { machete: table.machete.wearPerHit, mace: table.mace.breakMul });
    check('edge wear differs (dual blades wear fastest per hit, hammer least, bow none)', table.dual.wearPerHit > table.hammer.wearPerHit && table.bow.wearPerHit === 0, { dual: table.dual.wearPerHit, hammer: table.hammer.wearPerHit });
    // charges: hammer level 3 → spin; bow level 3 → 4 arrows
    reset('hammer'); P.debug.setDrawn(true); step(0.1); step(1.9, (i) => ({ heavyAttack: i === 0, heavyHeld: true })); const lv = P.chargeLevel; step(0.05);
    check('hammer: charge to level 3 (walking) → spinning finisher', lv === 3 && P.state === 'hm_spin', { lv, state: P.state });
    reset('bow'); P.debug.setDrawn(true); step(0.1); front(14); P.lockTarget = m; m.hits.length = 0;
    step(1.5, (i) => ({ heavyAttack: i === 0, heavyHeld: true })); step(0.6);
    check('bow: a full draw looses several arrows that fly to the target', m.hits.length >= 3 && m.hits.every((h) => h.motion === 'arrow'), { hits: m.hits.length });
    // guard per class
    for (const [cls, expect] of [['sword', 0.22], ['lance', 0.06]]) {
      reset(cls); P.debug.setDrawn(true); step(0.05); step(0.3, { guard: true }); const st = P.state; const hp = P.hp;
      P.receiveHit({ damage: 100, knockback: 6, from: { x: P.position.x + Math.sin(P.facing) * 3, y: 0, z: P.position.z + Math.cos(P.facing) * 3 } });
      check(`${cls}: shield guard takes ~${expect * 100}% (${Math.round(hp - P.hp)} of 100)`, st === 'guard' && Math.abs((hp - P.hp) - 100 * expect) < 3, { st, clip: P.view.anim });
    }
    reset('dual'); P.debug.setDrawn(true); step(0.05); step(0.3, { guard: true }); check('dual blades cannot guard', P.state !== 'guard', { state: P.state });
    // roll distance per class, draw speed per class
    const roll = (cls) => { reset(cls); const z = P.position.z; step(0.8, press('dodge')); return Math.abs(P.position.z - z); };
    const rl = roll('lance'), rd = roll('dual'); check(`lance hops short (${rl.toFixed(1)} m), dual blades roll far (${rd.toFixed(1)} m)`, rl < 2.3 && rd > 3.1);
    const drawT = (cls) => { reset(cls); let n = 0; step(2, (i) => { if (!P.weaponDrawn) n++; return i === 0 ? { heavyAttack: true } : {}; }); return n / 60; };
    const dS = drawT('sword'), dH = drawT('hammer'); check(`draw time per class: sword ${dS.toFixed(2)} s < hammer ${dH.toFixed(2)} s`, dS < dH);
    check('remote sync carries the weapon class', P.serialize().wc === 'hammer');
    // long sword Focus: cuts build it, the spirit roundslash spends it and raises the level
    reset('longsword'); P.debug.setDrawn(true); step(0.1); front(2.3);
    step(6, (i) => (i % 24 === 0 ? { lightAttack: true } : {})); const f0 = P.focus.gauge;
    for (let k = 0; k < 3; k++) { step(0.05, press('heavyAttack')); step(0.4); } step(1.2); // thrust → rising slash → spirit roundslash
    check('long sword: cuts build Focus; the spirit roundslash spends it for a Focus level', f0 >= 0.5 && P.focus.level >= 1, { gauge: f0, level: P.focus.level });

    // ---------------- stage 6c mechanics ----------------
    // guns: the clip empties, a reload refills it; the machine gun overheats under sustained fire
    reset('pistol'); P.debug.setDrawn(true); step(0.1); front(10); P.lockTarget = m; m.hits.length = 0;
    step(4, (i) => (i % 18 === 0 ? { lightAttack: true } : {})); const reloaded = P.res.ammo;
    check(`pistol: shots hit at range, the clip empties and reloads (${m.hits.length} hits)`, m.hits.length >= 8 && reloaded > 0, { ammo: reloaded });
    reset('machinegun'); P.debug.setDrawn(true); step(0.1); front(10); P.lockTarget = m; m.hits.length = 0;
    step(3.5, (i) => ({ heavyAttack: i === 0, heavyHeld: true })); const heat = P.res.heat, lock = P.res.lock;
    check(`machine gun: held fire hits repeatedly and overheats (${m.hits.length} hits)`, m.hits.length >= 12 && lock > 0, { heat, lock, state: P.state });
    reset('heavyxbow'); P.debug.setDrawn(true); step(0.1); front(14); P.lockTarget = m; m.hits.length = 0;
    step(1.6, (i) => ({ heavyAttack: i === 0, heavyHeld: true })); step(0.6); const big = m.hits[0]?.damage || 0;
    step(0.05, press('lightAttack')); step(0.6); const small = m.hits[1]?.damage || 0;
    check('heavy crossbow: a charged cannon shot hits harder than a normal slug', big > small * 1.5 && small > 0, { big: Math.round(big), small: Math.round(small) });
    // cannon lance shells: blast damage that ignores the edge, uses ammo
    reset('cannonlance'); P.debug.setDrawn(true); step(0.1); front(2.6); m.hits.length = 0; const a0 = P.res.ammo;
    step(0.05, press('heavyAttack')); step(0.7); P.sharpness = 0.05; step(0.05, press('heavyAttack')); step(0.7);
    check('cannon lance: shells blast the target, use the clip, and ignore sharpness', m.hits.length >= 2 && P.res.ammo === a0 - 2 && Math.abs(m.hits[0].damage - m.hits[1].damage) < 1, { ammo: P.res.ammo, d: m.hits.map((h) => Math.round(h.damage)) });
    // shift axe: GUARD switches to sword mode, sword attacks spend the gauge and hit harder
    reset('shiftaxe'); P.debug.setDrawn(true); step(0.1); front(2.4); m.hits.length = 0;
    step(0.05, press('lightAttack')); step(0.9); const axeDmg = m.hits[0]?.damage; step(0.05, { guard: true }); step(0.8); const mode = P.res.mode, g0 = P.res.gauge;
    step(0.05, press('lightAttack')); step(0.7); const swDmg = m.hits[m.hits.length - 1]?.damage;
    check('shift axe: GUARD transforms to sword mode; sword swings spend the gauge', mode === 'sword' && P.res.gauge < g0 && swDmg > 0 && axeDmg > 0, { g0, g: P.res.gauge, axeDmg: Math.round(axeDmg), swDmg: Math.round(swDmg) });
    // bulwark axe: sword hits build energy, HEAVY stores vials, GUARD+HEAVY morphs, axe HEAVY bursts them
    reset('bulwarkaxe'); P.debug.setDrawn(true); step(0.1); front(2.3); m.hits.length = 0;
    step(3, (i) => (i % 24 === 0 ? { lightAttack: true } : {})); const en = P.res.energy; step(0.4);
    step(0.05, press('heavyAttack')); step(1.0); const vials = P.res.vials;
    step(0.3, { guard: true }); step(0.05, { guard: true, heavyAttack: true }); step(1.0); const bmode = P.res.mode;
    const hb0 = m.hits.length; step(0.05, press('heavyAttack')); step(1.3);
    check(`bulwark axe: energy ${Math.round(en * 100)}% → ${vials} vials → axe burst (${m.hits.length - hb0} hits)`, en > 0.2 && vials >= 1 && bmode === 'axe' && P.res.vials === 0 && m.hits.length - hb0 >= vials, { bmode });
    // war horn: notes a-a-b make a melody; GUARD performs it → attack up
    reset('horn'); P.debug.setDrawn(true); step(0.1); away();
    step(0.05, press('lightAttack')); step(0.5); step(0.05, press('lightAttack')); step(0.5); step(0.05, press('heavyAttack')); step(1.2); const mel = [...P.res.melodies];
    step(0.05, { guard: true }); step(1.6);
    check('war horn: a-a-b completes a melody; performing it grants attack up', mel.includes('aab') && P.res.buff.atk > 50, { mel, buff: P.res.buff.atk });
    // vault staff: HEAVY vaults into the air, LIGHT in the air slashes and bounces off the target
    reset('staff'); P.debug.setDrawn(true); step(0.1); front(5); m.position.y = 2.2; m.hits.length = 0;
    step(0.05, press('heavyAttack')); step(0.3); const up = P.airborne, y1 = P.position.y; step(0.05, press('lightAttack')); step(0.4);
    check('vault staff: vault into the air and strike from it', up && y1 > 0.8 && m.hits.length >= 1 && m.hits[0].motion === 'st_air', { y1: +y1.toFixed(2), hits: m.hits.length });
    step(2);
    // ancient anchor: the chain throw reaches far
    reset('anchor'); P.debug.setDrawn(true); step(0.1); front(8); m.hits.length = 0;
    step(0.05, press('heavyAttack')); step(1.3);
    check('ancient anchor: the chain throw hits a target 8 m away', m.hits.length >= 1 && m.hits[0].motion === 'an_throw', { hits: m.hits.length });
    // three-blade style: three blades cut — more hits per swing than dual blades
    check('three-blade style lands more hits per chain than the sword', table.tri.hits > table.sword.hits, { tri: table.tri.hits, sword: table.sword.hits });

    // ---------------- aiming + part lock-on ----------------
    reset('bow'); P.debug.setDrawn(true); step(0.1); front(14); m.hits.length = 0;
    step(0.1, { guard: true }); const aimOn = P.aiming;
    g.camera.position.set(P.position.x, 1.8, P.position.z); g.camera.lookAt(m.position); g.camera.updateMatrixWorld();
    const cp = P.crosshairPoint(); const onTarget = cp.distanceTo(m.position) < 1.6;
    window.__manualCam = true;
    check('aiming: GUARD with a bow aims (crosshair point lands on the monster in the crosshair)', aimOn && onTarget, { d: +cp.distanceTo(m.position).toFixed(2) });
    const hbSave = m.getHitboxes; const head = new g.THREE.Vector3();
    m.getHitboxes = () => { head.set(m.position.x, m.position.y + 1.6, m.position.z); return [{ part: 'body', sphere: new g.THREE.Sphere(m.position, 1.4) }, { part: 'head', sphere: new g.THREE.Sphere(head, 0.6) }]; };
    P.lockTarget = null; step(0.05, press('lockOn')); const p1 = P.lockPart; step(0.05, press('lockOn')); const p2 = P.lockPart, lp = P.lockPointOf().y; step(0.05, press('lockOn')); const p3 = P.lockTarget;
    m.getHitboxes = hbSave;
    check('lock-on by part: nearest monster → body → head → off', p1 === 'body' && p2 === 'head' && Math.abs(lp - head.y) < 0.01 && p3 === null, { p1, p2 });

    // ---------------- grappling hook ----------------
    reset('greatsword'); away();
    const tgt = new g.THREE.Vector3(P.position.x, 0, P.position.z - 16);
    const ok1 = P.grappleTo({ point: tgt, kind: 'ground' }); step(0.1); const st1 = P.state; step(0.3); const st2 = P.state, vis = g.scene.getObjectByName('grapple-rope').visible;
    let path = []; step(2.5, () => { path.push(P.state); return {}; });
    const near = Math.hypot(P.position.x - tgt.x, P.position.z - tgt.z);
    check('rope: fire → pull → release; the hunter travels to the anchor (no teleport)', ok1 && st1 === 'ropeFire' && st2 === 'ropePull' && vis && near < 3 && path.includes('ropePull') && path.includes('jump'), { st1, st2, near: +near.toFixed(1) });
    check('rope hidden after release, 5 s cooldown running', !g.scene.getObjectByName('grapple-rope').visible && P.ropeCooldown > 0 && P.grappleTo({ point: tgt, kind: 'ground' }) === false, { cd: P.ropeCooldown });
    // monster anchor follows the monster; a dead target releases safely
    step(6); front(14); m.hp = m.maxHp; const hb = m.getHitboxes()[0];
    P.grappleTo({ point: hb.sphere.center.clone(), kind: 'monster', target: m, part: 'body', offset: new g.THREE.Vector3(0, 0, 1.4) });
    step(0.3); for (let i = 0; i < 30; i++) { m.position.x += 0.15; step(1 / 60); }
    const dx = P.position.x; step(0.6);
    check('rope on a moving monster: the anchor follows and drags the hunter along', dx > 0.8 || P.position.x > 1.5, { x: +P.position.x.toFixed(2) });
    step(6); P.position.set(0, 0, 6); front(14); m.hp = m.maxHp;
    P.grappleTo({ point: hb.sphere.center.clone(), kind: 'monster', target: m, part: 'body', offset: new g.THREE.Vector3() }); step(0.3); m.hp = 0; step(0.1);
    check('target dies mid-pull → rope released safely', !P.rope && !['ropeFire', 'ropePull'].includes(P.state), { state: P.state });
    m.hp = m.maxHp;
    // death / respawn leave no rope
    step(6); P.grappleTo({ point: tgt, kind: 'ground' }); step(0.3); P.receiveHit({ damage: 9999, from: { x: 0, y: 0, z: 0 } }); step(6);
    check('death and respawn leave no rope or pull state', !P.rope && !g.scene.getObjectByName('grapple-rope').visible && !P.airborne, { state: P.state });
    // targeting ray: the crosshair finds the ground / a monster in front
    P.setState('idle'); P.position.set(0, 0, 6); away(); g.cameraRig.update(0.1, { look: { x: 0, y: 0.35 }, move: { x: 0, y: 0 } }); for (let i = 0; i < 30; i++) g.cameraRig.update(1 / 60, { look: { x: 0, y: 0 }, move: { x: 0, y: 0 } });
    const pk = P.ropePick('center');
    check('targeting: the crosshair ray finds a hook point', pk && (pk.point || pk.refused), { kind: pk?.kind, refused: pk?.refused });
    // keyboard: hold G + double-click = target; the clicks do not attack
    g.input.pressed.add('KeyG'); g.input.poll(); const cv = g.renderer.domElement; const md = () => cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 320, clientY: 200 }));
    md(); md(); const sIn = g.input.poll(); const sAfter = g.input.poll(); window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    check('G (one press) + double-click gives a hook target, no light attack, then the hook disarms', !!sIn.ropeTarget && !sIn.lightAttack && sIn.ropeHeld && !sAfter.ropeHeld);
    // touch: hold ROPE, double-tap the open screen
    const { TouchControls } = await import('/src/core/touch.js'); const tc = new TouchControls(); tc.show();
    const btn = [...tc.root.querySelectorAll('.tc-btn')].find((b) => b.dataset.act === 'rope');
    const T = (target, x, y, id) => new Touch({ identifier: id, target, clientX: x, clientY: y });
    const fire = (type, target, t) => target.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    const bt = T(btn, 1, 1, 1); fire('touchstart', btn, bt);
    const right = tc.root.querySelector('.tc-right');
    for (let k = 0; k < 2; k++) { const tt = T(right, 400, 150, 10 + k); fire('touchstart', right, tt); fire('touchend', right, tt); }
    const s2 = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } }; tc.apply(s2); fire('touchend', btn, bt);
    check('touch: tap ROPE once + double-tap → hook target at the tapped point', s2.ropeHeld && s2.ropeTarget && s2.ropeTarget.x === 400, { t: s2.ropeTarget });
    const s3 = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } }; const tt3 = T(right, 300, 100, 20); fire('touchstart', right, tt3); fire('touchend', right, tt3); tc.apply(s3);
    check('touch: a tap without ROPE held never fires the hook', !s3.ropeTarget);
    tc.hide(); tc.root.remove();
    return { res, table };
  });
  results = out.res; table = out.table;
} catch (e) { results.push({ name: 'harness', pass: false, error: e.message }); }
for (const r of results) console.log(r.pass ? 'ok  ' : 'FAIL', r.name, JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'name' && k !== 'pass'))));
if (table) console.table(table);
if (errors.length) console.log('errors:', errors.slice(0, 8));
const pass = results.length && results.every((r) => r.pass) && !errors.length;
console.log(pass ? 'all weapon / grapple tests passed' : 'weapon / grapple tests FAILED');
await browser.close(); server?.kill();
process.exit(pass ? 0 : 1);
