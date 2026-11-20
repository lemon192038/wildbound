// node src/field/__dragons.test.mjs — dragon ecology (src/field/dragonLife.js) on a mocked island, no browser.
// The wyvern AI itself is not loaded: the mock dragon simply flies where m.wander tells it (what wyvern.js does when unaware).
import * as THREE from 'three';
import { createDragonLife, DRAGON_LIFE } from './dragonLife.js';

let fails = 0;
const ok = (c, msg, info = '') => { if (!c) { fails++; console.log('FAIL', msg, info); } else console.log('ok  ', msg, info); };
const F = { half: 1152, height: () => 20 };
const W = { island: F, getHeight: () => 20, canWalk: (x, z) => Math.hypot(x, z) < 1000 };
function dragon(id, x, z) {
  const m = { kind: 'wyvern', islandId: id, state: 'idle', aggro: false, action: null, position: new THREE.Vector3(x, 26, z), yaw: 0, perception: { setHome() {} } };
  m.fly = (dt) => { const w = m.wander; if (!w) return; const v = new THREE.Vector3(w.pos.x - m.position.x, 0, w.pos.z - m.position.z); const d = v.length(); if (d > 0.1) m.position.addScaledVector(v.normalize(), Math.min(d, w.speed * dt)); m.position.y += ((20 + (w.alt ?? 13)) - m.position.y) * Math.min(1, dt * 1.5); };
  return m;
}
function world(dragons, creatures = [], nests = []) {
  const killed = [];
  const game = { world: W, monsters: dragons, events: { emit() {} }, broods: { nests },
    fauna: { list: creatures, kill: (c, by) => { c.dead = true; killed.push([c.sp, by.islandId]); } } };
  const homes = [{ id: 'flame', home: [0, 0] }, { id: 'venom', home: [300, 0] }, { id: 'flameUpper', home: [-300, 0] }];
  let active = new Set(dragons);
  const life = createDragonLife(game, homes, (m) => active.has(m));
  const run = (sec, dt = 0.1) => { for (let t = 0; t < sec; t += dt) { life.update(dt); for (const m of dragons) if (active.has(m)) m.fly(dt); for (const c of creatures) if (c.sp === 'bird' && !c.dead) c.pos.y = 20 + c.alt; } };
  return { game, life, run, killed, setActive: (s) => { active = s; } };
}
const critter = (sp, x, z, extra = {}) => ({ sp, pos: new THREE.Vector3(x, 20, z), dead: false, stage: 2, alt: 0, ai: 'roam', ...extra });

{ // roles follow the species' sexes: Venom-fang females hold territories, Flame males roam the sky
  ok(DRAGON_LIFE.venom.role === 'resident' && DRAGON_LIFE.cindaryl.role === 'resident' && DRAGON_LIFE.flame.role === 'roamer' && DRAGON_LIFE.wyvern.role === 'roamer', 'females resident, males roaming');
}
{ // a roamer patrols far across the island at altitude (even while frozen far from hunters)
  const m = dragon('flame', 0, 0); const { run, setActive, life } = world([m]);
  let maxD = 0; setActive(new Set()); for (let i = 0; i < 120; i++) { run(1); maxD = Math.max(maxD, Math.hypot(m.position.x, m.position.z)); }
  ok(maxD > 250 && m.position.y - 20 > 20, `roaming Flame Dragon travels far (${maxD.toFixed(0)} m from home) high up (${(m.position.y - 20).toFixed(0)} m)`, JSON.stringify(life.stats));
}
{ // it stoops on an Ash Bird in the air and takes it
  const m = dragon('flame', 0, 0); const bird = critter('bird', 60, 10, { alt: 18 }); const { run, killed, life } = world([m], [bird]);
  life.states.get(m) || run(0.1); [...life.states.values()][0].hunger = 1; run(30);
  ok(bird.dead && killed.some(([sp]) => sp === 'bird'), 'a roaming Flame Dragon catches an Ash Bird in flight', JSON.stringify(life.stats));
}
{ // ground prey: a boar in the open; a mated male then flies food to his female's nest
  const m = dragon('flame', 0, 0); const boar = critter('boar', -50, 30, { stage: 1 }); const nest = { home: 'venom', x: 300, z: 0 };
  const { run, killed, life } = world([m], [boar], [nest]); run(0.1); [...life.states.values()][0].hunger = 1; run(40);
  ok(boar.dead && killed.some(([sp]) => sp === 'boar'), 'it stoops on a young Crystal Boar on the ground');
  run(120); ok(life.stats.provisions >= 1 || [...life.states.values()][0].mode === 'feed' || life.stats.kills.boar, `after the kill: provisions the mate's nest or feeds (${life.stats.provisions} provisions)`);
}
{ // provisioning: a mated male flies to his female's nest, lands beside it, then soars off again
  const m = dragon('flame', 0, 0); const nest = { home: 'venom', x: 300, z: 0 }; const { run, life } = world([m], [], [nest]); run(0.1);
  const st = [...life.states.values()][0]; st.mode = 'provision'; st.t = 0; let closest = 1e9; for (let i = 0; i < 80; i++) { run(1); closest = Math.min(closest, Math.hypot(m.position.x - 309, m.position.z - 9)); }
  ok(life.stats.provisions === 1 && closest < 8, `the Flame male lands at the Venom-fang nest with food (closest ${closest.toFixed(1)} m, ${life.stats.provisions} provision)`);
  ok(st.mode === 'patrol', 'then goes back to patrolling the sky');
}
{ // too small to bother with: beetles and slimes are ignored
  const m = dragon('flame', 0, 0); const b = critter('beetle', 20, 0), s = critter('slime', -20, 0); const { run, life } = world([m], [b, s]); run(0.1); [...life.states.values()][0].hunger = 1; run(20);
  ok(!b.dead && !s.dead, 'beetles and slimes are not dragon prey');
}
{ // a resident female stays in her territory and hunts only inside it
  const m = dragon('venom', 300, 0); const inside = critter('drake', 340, 20), outside = critter('boar', 600, 0); const { run, life } = world([m], [inside, outside]);
  run(0.1); const st = [...life.states.values()][0]; st.hunger = 1; let maxR = 0; for (let i = 0; i < 90; i++) { run(1); maxR = Math.max(maxR, Math.hypot(m.position.x - 300, m.position.z)); }
  ok(inside.dead && !outside.dead, 'the Venom-fang female hunts inside her territory only');
  ok(maxR < DRAGON_LIFE.venom.range + 20, `she never leaves her ground (${maxR.toFixed(0)} m ≤ ${DRAGON_LIFE.venom.range})`);
  ok(m.position.y - 20 < 8, 'she keeps to the ground (low)');
}
{ // a Venom-fang female with eggs keeps close to her clutch (user request: females guard near the eggs)
  const m = dragon('venom', 300, 0); const nest = { home: 'venom', x: 360, z: 20, eggs: 2 }; const { run } = world([m], [], [nest]);
  let maxD = 0; for (let i = 0; i < 120; i++) { run(1); if (i > 15) maxD = Math.max(maxD, Math.hypot(m.position.x - nest.x, m.position.z - nest.z)); }
  ok(maxD < 50, `she keeps within ${maxD.toFixed(0)} m of her eggs`);
}
{ // a dragon that notices a hunter is left to its boss AI
  const m = dragon('flame', 0, 0); const { run } = world([m]); run(1); m.aggro = true; run(0.2);
  ok(m.wander === null, 'aggro: the ecology driver lets go');
}
console.log(fails ? `${fails} FAILED` : 'all dragon ecology tests passed');
process.exit(fails ? 1 : 0);
