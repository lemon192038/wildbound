// node src/fauna/__fauna.test.mjs — fauna AI / ecology tests on a mocked flat world (no browser).
import * as THREE from 'three';
import { createFauna } from './fauna.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

function setup(region = 'ashplain', { river = false } = {}) {
  const handlers = {};
  const events = { on: (k, f) => (handlers[k] ||= []).push(f), emit: (k, e) => (handlers[k] || []).forEach((f) => f(e)) };
  const half = 1152;
  // optional lava river along the z axis: |x| < 6 is lava (surface y = 3, bed y = 1), banks at y = 5
  const F = { half, seed: 1337, regionAt: () => region, lava: (x, z, o = {}) => { if (river) { o.sd = Math.abs(x) - 6; o.level = 3; } else { o.sd = 100; o.level = -10; } return o; } };
  const world = { island: F, low: true, colliders: [], getHeight: (x) => (river && Math.abs(x) < 6 ? 1 : 5), canWalk: () => true, spawnDust() {}, spawnSplash() {}, chunks: { tileOf: (x, z) => [Math.floor((x + half) / 64), Math.floor((z + half) / 64)] } };
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
{ // Fire Lizard: territory → threat display → fight (hunter gets hurt); gives up when the hunter leaves
  const { fauna, player, damage, step } = setup('canyon'); step(1);
  const L = alive(fauna, 'lizard')[0];
  if (!L) ok(false, 'no lizard spawned in canyon'); else {
    for (const o of alive(fauna)) if (o !== L) { o.dead = true; o.corpseT = 0.01; } // isolate it
    player.position.set(L.home.x + Math.sin(L.yaw) * 12, 5, L.home.z + Math.cos(L.yaw) * 12); step(0.6);
    ok(['threat', 'fight'].includes(L.ai), `lizard threatens an intruder (${L.ai})`);
    step(10); ok(damage.taken > 0, `lizard fights: hunter took ${damage.taken} dmg`);
    player.position.set(L.pos.x + 60, 5, L.pos.z); step(6);
    ok(!['fight', 'charge'].includes(L.ai), `lizard does not chase far (${L.ai})`);
  }
}
{ // Fire Lizard ambushes prey that wanders close
  const { fauna, player, step } = setup('canyon'); step(1);
  const L = alive(fauna, 'lizard')[0]; const b = alive(fauna, 'beetle')[0];
  if (!L || !b) ok(true, 'lizard/beetle not both present (skipped)'); else {
    player.position.set(L.pos.x + 90, 5, L.pos.z); L.hunger = 1; step(0.1);
    b.pos.set(L.pos.x + 5, 5, L.pos.z); b.home.copy(b.pos); b.ai = 'feed'; b.dur = 99; step(3);
    ok(b.dead && fauna.stats.predation >= 1, `lizard catches a beetle by ambush (${b.ai})`);
  }
}
{ // Lava Snake: lives in the lava, lunges at a hunter on the bank, returns to the lava; ignores hunters far away
  const { fauna, player, damage, step } = setup('caldera', { river: true }); step(1);
  const S = alive(fauna, 'snake')[0];
  if (!S) ok(false, 'no snake spawned in the river'); else {
    ok(Math.abs(S.pos.x) < 6, `snake spawned inside the lava (x=${S.pos.x.toFixed(1)})`);
    player.position.set(40, 5, S.pos.z); step(5); ok(damage.taken === 0 && Math.abs(S.pos.x) < 6, 'snake ignores a hunter far from the lava');
    player.position.set(9, 5, S.pos.z); step(4); ok(damage.hits > 0, `snake lunges / spits at a hunter on the bank (${damage.taken} dmg)`);
    step(3); ok(Math.abs(S.pos.x) < 6.5, `snake slides back into the lava (x=${S.pos.x.toFixed(1)})`);
    S.receiveHit({ damage: S.maxHp * 0.2, part: 'head', attackerId: 'local' }); step(0.1);
    ok(S.ai === 'dive' && S.getHitboxes().length === 0, `struck snake dives (${S.ai}), untouchable while submerged`);
  }
}
console.log(fails ? `${fails} FAILED` : 'all fauna tests passed');
process.exit(fails ? 1 : 0);
