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
{ // Magma Wolf: always a pack with exactly one leader; spots a hunter, encircles, attacks; retreats at half strength
  const { fauna, player, damage, step } = setup('fungal');
  player.position.set(0, 5, 0); step(1);
  let packs = [...fauna.groups()].filter((g) => g.sp === 'wolf');
  if (!packs.length) { fauna.spawnGroup('wolf', 40, 0); step(0.1); packs = [...fauna.groups()].filter((g) => g.sp === 'wolf'); }
  const wolves = fauna.list.filter((c) => c.sp === 'wolf');
  ok(wolves.length > 0 && wolves.every((w) => w.group), 'every wolf belongs to a pack (never alone)');
  ok(packs.every((g) => g.members.filter((m) => m.role === 'leader').length === 1 && g.members.length >= 4), `each pack has one leader and ≥4 wolves (${packs.map((g) => g.members.length)})`);
  const g = packs[0]; for (const o of fauna.list) if (o.group !== g && !o.dead) { o.dead = true; o.corpseT = 0.01; }
  const L = g.members.find((m) => m.role === 'leader'); player.position.set(L.pos.x + 18, 5, L.pos.z); step(1.5);
  ok(g.state === 'engage', `pack engages the hunter (${g.state})`);
  step(15); ok(damage.taken > 0, `pack attacks in turns (${damage.hits} bites, ${damage.taken} dmg)`);
  const ad = g.members.filter((m) => m.stage > 0); for (const w of ad.slice(0, Math.ceil(ad.length / 2))) w.receiveHit({ damage: 1e6, attackerId: 'local' });
  step(1); ok(g.state === 'retreat', `pack retreats when half are down (${g.state})`);
}
{ // Crystal Boar herd: graded warnings, charge at close range, stands down when the hunter backs off; hitting one angers all
  const { fauna, player, damage, step } = setup('coast');
  player.position.set(0, 5, 0); step(0.2);
  for (const o of [...fauna.list]) { o.dead = true; o.corpseT = 0.01; } step(0.1);
  const g = fauna.spawnGroup('boar', 0, 60, [{ role: 'tusk', stage: 2 }, { role: 'member', stage: 2 }, { role: 'member', stage: 2 }, { role: 'member', stage: 0 }]);
  player.position.set(0, 5, 0); step(2); ok(g.state === 'graze', `herd keeps grazing while the hunter is far (${g.state})`);
  const C = g.center; player.position.set(C.x, 5, C.z - 14); step(1); ok(['warn', 'threat', 'observe'].includes(g.state), `herd warns at mid range (${g.state})`);
  player.position.set(C.x, 5, C.z - 4); step(4); ok(g.state === 'defend' && damage.taken > 0, `close hunter gets charged (${g.state}, ${damage.taken} dmg)`);
  player.position.set(C.x, 5, C.z - 60); step(12); ok(g.state !== 'defend', `herd stands down once the hunter leaves (${g.state})`);
  const T = g.members.find((m) => m.role === 'tusk'); ok(T && T.maxHp === 8500 && T.sp === 'boar', 'Crystal Tusk is a large boar (8,500 HP), not a separate species');
  const m = g.members.find((x) => x.role === 'member' && x.stage === 2); player.position.set(C.x, 5, C.z - 30); m.receiveHit({ damage: 50, attackerId: 'local' }); step(0.4);
  ok(g.state === 'defend' && g.hostile, 'striking one boar turns the whole herd hostile');
}
{ // ecology: a wolf pack hunts an unguarded juvenile boar; the herd fights back
  const { fauna, player, step } = setup('fungal');
  player.position.set(0, 5, 0); step(0.2); for (const o of [...fauna.list]) { o.dead = true; o.corpseT = 0.01; } step(0.1);
  player.position.set(0, 5, -150);
  const herd = fauna.spawnGroup('boar', 0, 30, [{ role: 'member', stage: 2 }, { role: 'member', stage: 2 }, { role: 'member', stage: 0 }]);
  const pack = fauna.spawnGroup('wolf', 0, 0); pack.hunger = 1; step(40, 1 / 15);
  const juv = herd.members.find((m) => m.stage === 0);
  ok(fauna.stats.predation > 0 || juv.hp < juv.maxHp, `wolves hunt the juvenile boar (pred ${fauna.stats.predation}, juv hp ${Math.round(juv.hp)})`);
  ok(pack.members.some((w) => w.hp < w.maxHp) || herd.state === 'defend', `the herd defends against the pack (herd ${herd.state})`);
}
{ // Stone Mole: lives underground, tracks footsteps, bursts up under a hunter who keeps moving above it, digs back down
  const { fauna, player, damage, step } = setup('crystal');
  player.position.set(0, 5, 0); step(0.2); for (const o of [...fauna.list]) { o.dead = true; o.corpseT = 0.01; } step(0.1);
  const M = fauna.spawnOne('mole', 30, 0, 2, { S: null });
  if (M.S !== undefined && M.maxHp === 15000) M.maxHp = M.hp = 7200; // ignore the random Grand Mole roll for this test
  player.state = 'idle'; step(3); ok(M.under && M.getHitboxes().length === 0 && damage.taken === 0, `mole stays underground, untouchable (${M.ai})`);
  player.position.set(12, 5, 0); player.state = 'run'; for (let i = 0; i < 40; i++) { player.position.x += 0.25; step(0.1); }
  ok(M.ai === 'track' || M.ai === 'lurk' || !M.under, `mole follows the footsteps underground (${M.ai})`);
  for (let i = 0; i < 80 && M.under; i++) { player.position.x = M.pos.x + Math.sin(i) * 0.6; step(0.1); }
  ok(!M.under, `mole bursts out under a hunter moving above it (${M.ai})`);
  step(1); ok(damage.taken > 0, `the burst / claws hurt the hunter (${damage.taken} dmg)`);
  player.state = 'idle'; let wentDown = false; for (let i = 0; i < 300; i++) { step(0.1); if (M.under || M.ai === 'dig') wentDown = true; }
  ok(wentDown, `mole digs back down after a while (${M.ai})`);
  const G = fauna.spawnOne('mole', -40, 0, 2, { S: (await import('./species.js')).SPECIES.grandmole });
  ok(G.sp === 'mole' && G.maxHp === 15000, 'Grand Mole is a Stone Mole individual (15,000 HP), not a separate species');
}
{ // Boulder Golem: a rock until you get close; graded wake-up; defends its territory only; birds perch on it
  const { fauna, player, damage, step } = setup('ruins');
  player.position.set(0, 5, -80); step(0.2); for (const o of [...fauna.list]) { o.dead = true; o.corpseT = 0.01; } step(0.1);
  const Gm = fauna.spawnOne('golem', 0, 0); Gm.patient = false;
  player.position.set(0, 5, -15); step(2); ok(Gm.ai === 'dormant', `golem keeps its rock disguise at 15 m (${Gm.ai})`);
  player.position.set(0, 5, -5); step(4); ok(Gm.ai !== 'dormant', `golem rises when the hunter comes close (${Gm.ai})`);
  step(12); ok(damage.taken > 0, `awake golem attacks (${damage.taken} dmg)`);
  player.position.set(0, 5, -90); step(30); ok(Gm.ai === 'dormant' || Gm.ai === 'settle' || Gm.ai === 'return', `golem returns home and settles back into a rock (${Gm.ai})`);
  ok(Math.hypot(Gm.pos.x, Gm.pos.z) < 6, 'golem did not leave its territory');
  const G2 = fauna.spawnOne('golem', 60, 0); G2.patient = false; G2.receiveHit({ damage: 100, attackerId: 'local' }); step(0.2);
  ok(G2.ai === 'rising' && G2.hostile, 'striking a dormant golem wakes it hostile');
  const G3 = fauna.spawnOne('golem', -60, 0); const b = fauna.spawnOne('bird', -60, 20); b.t = 20;
  for (let i = 0; i < 300 && !b.perchOn; i++) { if (b.ai === 'soar' && b.t > 16) { b.ai = 'toPerch'; b.perchTarget = G3; b.t = 0; } step(0.1); }
  ok(!!b.perchOn, `an Ash Bird perches on the dormant golem (${b.ai})`);
  G3.receiveHit({ damage: 50, attackerId: 'local' }); step(0.3); ok(!b.perchOn && b.ai === 'takeoff', `…and bursts away when the "rock" moves (${b.ai})`);
}
{ // 燼皮 (flightless drake): roams (no ambush), scavenges carcasses, flees a wolf pack, fights an intruder
  const { fauna, player, damage, step } = setup('core');
  player.position.set(0, 5, -120); step(0.2); for (const o of [...fauna.list]) { o.dead = true; o.corpseT = 0.01; } step(0.1);
  const D = fauna.spawnOne('drake', 0, 0); step(2);
  ok(D.sp === 'drake' && D.ai !== 'ambush' && D.maxHp === 5200, `drake roams instead of lying in ambush (${D.ai})`);
  const carcass = fauna.spawnOne('beetle', 12, 0); carcass.receiveHit({ damage: 1e6, attackerId: 'local' }); D.hunger = 1; step(8);
  ok(D.ai === 'eat' || D.ai === 'scavenge' || carcass.eaten, `drake scavenges a carcass (${D.ai})`);
  const pack = fauna.spawnGroup('wolf', D.pos.x + 12, D.pos.z); step(0.5);
  ok(D.ai === 'flee', `drake flees a wolf pack (${D.ai})`);
  for (const w of pack.members) { w.dead = true; w.corpseT = 0.01; } step(6);
  player.position.set(D.home.x + 10, 5, D.home.z); D.hunger = 0; step(12);
  ok(damage.taken > 0, `drake fights an intruder in its territory (${damage.taken} dmg)`);
}
console.log(fails ? `${fails} FAILED` : 'all fauna tests passed');
process.exit(fails ? 1 : 0);
