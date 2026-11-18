// node src/core/__perception.test.mjs — unit tests for the monster senses (no browser needed).
import * as THREE from 'three';
import { createPerception } from './perception.js';
import { senseProfile } from '../shared/senses.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
function rig({ wall = null } = {}) {
  const game = { world: { getHeight: (x, z) => (wall && x > wall[0] && x < wall[1] ? 30 : 0) } };
  const m = { position: new THREE.Vector3(0, 0, 0), yaw: 0, target: null }; // facing +z
  return { game, m };
}
function run(P, m, hunters, secs, dt = 1 / 30, each) {
  let noticed = null, lost = false;
  for (let t = 0; t < secs; t += dt) { each?.(t); P.update(dt, hunters); if (P.noticed) { noticed = P.noticed; m.target = P.noticed; } if (P.lost) lost = true; }
  return { noticed, lost };
}
const S = senseProfile('varkhul');

{ // in front, standing still at 30 m → noticed by sight within ~2.5 s
  const { game, m } = rig(); const P = createPerception(game, m, S);
  const h = { id: 'a', position: new THREE.Vector3(0, 0, 30), state: 'idle' };
  ok(run(P, m, [h], 2.5).noticed === h, 'sees a hunter standing 30 m ahead');
}
{ // directly behind, standing still at 30 m → not noticed (outside cone, too quiet, beyond smell)
  const { game, m } = rig(); const P = createPerception(game, m, S);
  const h = { id: 'a', position: new THREE.Vector3(0, 0, -30), state: 'idle' };
  ok(!run(P, m, [h], 6).noticed, 'does not sense a quiet hunter 30 m behind');
}
{ // far away beyond every sense (120 m ahead) → never noticed (no more "infinite" detection)
  const { game, m } = rig(); const P = createPerception(game, m, S);
  const h = { id: 'a', position: new THREE.Vector3(0, 0, 120), state: 'sprint' };
  ok(!run(P, m, [h], 6).noticed, 'ignores a hunter 120 m away');
}
{ // a ridge between them blocks sight
  const { game, m } = rig({ wall: [-1e9, 1e9] }); game.world.getHeight = (x, z) => (z > 10 && z < 14 ? 30 : 0);
  const P = createPerception(game, m, S);
  const h = { id: 'a', position: new THREE.Vector3(0, 0, 35), state: 'idle' };
  ok(!run(P, m, [h], 5).noticed, 'terrain ridge blocks line of sight');
}
{ // sprinting behind at 18 m → heard
  const { game, m } = rig(); const P = createPerception(game, m, S);
  const h = { id: 'a', position: new THREE.Vector3(-20, 0, -18), state: 'sprint' };
  ok(run(P, m, [h], 4, 1 / 30, (t) => { h.position.x = -20 + t * 8; }).noticed === h, 'hears a sprinting hunter 18 m behind');
}
{ // engaged, then the hunter runs far away → contact lost after the search window
  const { game, m } = rig(); const P = createPerception(game, m, S);
  const h = { id: 'a', position: new THREE.Vector3(0, 0, 10), state: 'idle' };
  m.target = h; P.engage(h);
  const r = run(P, m, [h], 20, 1 / 30, (t) => { h.position.z = 10 + t * 12; });
  ok(r.lost && !P.target, 'gives up a hunter who fled');
}
{ // engaged and the hunter stays close → never lost
  const { game, m } = rig(); const P = createPerception(game, m, S);
  const h = { id: 'a', position: new THREE.Vector3(0, 0, 12), state: 'light1' }; m.target = h; P.engage(h);
  ok(!run(P, m, [h], 20).lost, 'keeps a nearby hunter engaged');
}
{ // leash: hunter kites the monster's target point beyond the leash from home (monster stays home)
  const { game, m } = rig(); const P = createPerception(game, m, S);
  const h = { id: 'a', position: new THREE.Vector3(0, 0, 10), state: 'idle' }; m.target = h; P.engage(h);
  const r = run(P, m, [h], 20, 1 / 30, (t) => { h.position.z = 10 + t * 10; m.position.z = Math.max(0, h.position.z - 15); });
  ok(r.lost, 'leash: stops pursuing far from home');
}
console.log(fails ? `${fails} FAILED` : 'all perception tests passed');
process.exit(fails ? 1 : 0);
