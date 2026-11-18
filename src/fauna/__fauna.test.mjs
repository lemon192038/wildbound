// node src/fauna/__fauna.test.mjs — fauna AI / ecology tests on a mocked flat world (no browser).
import * as THREE from 'three';
import { createFauna } from './fauna.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

function setup(region = 'ashplain') {
  const handlers = {};
  const events = { on: (k, f) => (handlers[k] ||= []).push(f), emit: (k, e) => (handlers[k] || []).forEach((f) => f(e)) };
  const half = 1152;
  const F = { half, seed: 1337, regionAt: () => region, lava: (x, z, o = {}) => { o.sd = 100; o.level = -10; return o; } };
  const world = { island: F, low: true, colliders: [], getHeight: () => 5, canWalk: () => true, spawnDust() {}, spawnSplash() {}, chunks: { tileOf: (x, z) => [Math.floor((x + half) / 64), Math.floor((z + half) / 64)] } };
  const damage = { taken: 0, hits: 0 };
  const player = { position: new THREE.Vector3(0, 5, 0), state: 'idle', hp: 150, maxHp: 150, receiveHit({ damage: d }) { damage.taken += d; damage.hits++; this.hp -= d; return true; } };
  const status = { list: [], apply(k, l) { this.list.push(k + ':' + l); } };
  const game = { THREE, world, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), player, events, status, remotePlayers: new Map() };
  const fauna = createFauna(game);
  const step = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) fauna.update(dt, dt); };
  return { game, fauna, player, damage, status, step, events };
}
const alive = (f, sp) => f.list.filter((c) => !c.dead && (!sp || c.sp === sp));

{ // spawning is local to hunters and follows the census
  const { fauna, step } = setup('ashplain'); step(1);
  const l = alive(fauna); ok(l.length > 5, `creatures spawned around the hunter (${l.length})`);
  ok(l.every((c) => Math.hypot(c.pos.x, c.pos.z) < 200), 'nothing spawned far from the hunter');
  ok(alive(fauna, 'slime').length <= alive(fauna, 'beetle').length, 'ash plain: beetles outnumber slimes');
}
{ // beetle: contact → curl; struck → burrow (no hitboxes) → re-emerges later
  const { fauna, player, step } = setup('ashplain'); step(1);
  const b = alive(fauna, 'beetle')[0];
  player.position.set(b.pos.x + 1.2, 5, b.pos.z); step(0.5); ok(b.ai === 'curl', `beetle curls on contact (${b.ai})`);
  player.position.set(b.pos.x + 30, 5, b.pos.z); step(8);
  b.receiveHit({ damage: 50, attackerId: 'local' }); step(1.6);
  ok(b.ai === 'burrowed' && b.getHitboxes().length === 0, `struck beetle burrows away (${b.ai})`);
  step(40); ok(!['burrow', 'burrowed'].includes(b.ai), `beetle re-emerges later (${b.ai})`);
}
{ // beetle cornered while curled → heat burst hurts the hunter (+burn)
  const { fauna, player, damage, status, step } = setup('ashplain'); step(1);
  const b = alive(fauna, 'beetle')[0]; player.position.set(b.pos.x + 1.2, 5, b.pos.z); step(0.5);
  const r = b.receiveHit({ damage: 40, attackerId: 'local' });
  ok(r.damage < 40 * 0.55 * 0.5, `curled armour reduces damage (${r.damage})`);
  ok(damage.taken > 0 && status.list.some((s) => s.startsWith('burn')), `heat burst burns the hunter (${damage.taken} dmg, ${status.list})`);
}
{ // slime: heavy hit on a mature slime splits it into two fleeing halves
  const { fauna, player, step } = setup('geotherm'); step(1);
  const s = alive(fauna, 'slime').find((c) => c.stage >= 2); const n0 = alive(fauna, 'slime').length;
  if (!s) ok(false, 'no mature slime spawned'); else {
    player.position.set(s.pos.x + 8, 5, s.pos.z); s.receiveHit({ damage: s.maxHp * 0.7, attackerId: 'local' }); step(0.2);
    const halves = alive(fauna, 'slime').filter((c) => c.pos.distanceTo(s.pos) < 4 && c.stage === s.stage - 1 && c.ai === 'flee');
    ok(s.dead && halves.length === 2 && fauna.stats.split === 1, `slime splits into two fleeing halves (${halves.length})`); void n0;
  }
}
{ // slime: harmless until attacked, then spits hot mucus
  const { fauna, player, damage, step } = setup('geotherm'); step(1);
  const s = alive(fauna, 'slime')[0]; player.position.set(s.pos.x + 6, 5, s.pos.z); step(5);
  ok(damage.taken === 0, 'unprovoked slime does not attack');
  s.receiveHit({ damage: 5, attackerId: 'local' }); step(5);
  ok(damage.hits > 0, `provoked slime spits / slams (${damage.taken} dmg)`);
}
{ // Ash Birds hunt beetles (predation) when hungry; prey that curls/burrows can escape
  const { fauna, player, step } = setup('ashplain'); step(1);
  for (const c of alive(fauna, 'bird')) c.hunger = 1;
  player.position.set(0, 5, 0); const birds = alive(fauna, 'bird').length;
  step(180, 1 / 15);
  ok(birds === 0 || fauna.stats.predation > 0, `birds caught prey within 3 min (${fauna.stats.predation} kills, ${birds} birds)`);
}
{ // bird flees below 40 % HP
  const { fauna, player, step } = setup('ashplain'); step(1);
  const b = alive(fauna, 'bird')[0];
  if (!b) ok(true, 'no bird in this sample (skipped)'); else { b.alt = 1; player.position.set(b.pos.x + 3, 5, b.pos.z); b.receiveHit({ damage: b.maxHp * 0.7, attackerId: 'local' }); step(0.1); ok(b.ai === 'flee', `wounded bird flees (${b.ai})`); }
}
{ // census conservation + no instant respawn
  const { fauna, player, step } = setup('ashplain'); step(1);
  const n0 = alive(fauna).length;
  for (const c of alive(fauna, 'beetle')) c.receiveHit({ damage: 1e6, attackerId: 'local' });
  const killed = n0 - alive(fauna).length;
  player.position.set(900, 5, 900); step(2);            // walk away: everything near the start is stored again
  ok(alive(fauna).every((c) => Math.hypot(c.pos.x - 900, c.pos.z - 900) < 250), 'creatures far from the hunter are despawned');
  player.position.set(0, 5, 0); step(2);                // come back right away
  const back = alive(fauna).filter((c) => Math.hypot(c.pos.x, c.pos.z) < 200);
  ok(back.filter((c) => c.sp === 'beetle').length === 0, `killed beetles do not instantly respawn (${back.length} back, ${killed} killed)`);
}
console.log(fails ? `${fails} FAILED` : 'all fauna tests passed');
process.exit(fails ? 1 : 0);
