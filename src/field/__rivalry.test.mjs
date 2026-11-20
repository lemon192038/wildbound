// node src/field/__rivalry.test.mjs — big monsters vs each other (src/field/bossRivalry.js), territories, temperament.
// Mocked bosses (no AI loaded): position, hp, hitboxes, an attack hitbox we switch on, receiveHit.
import * as THREE from 'three';
import { createBossRivalry } from './bossRivalry.js';
import { territoryHomes } from '../shared/territories.js';
import { createIslandField } from '../world/island/islandField.js';
import { TEMPERAMENT } from '../shared/temperament.js';

let fails = 0;
const ok = (c, msg, info = '') => { if (!c) { fails++; console.log('FAIL', msg, info); } else console.log('ok  ', msg, info); };
const F = createIslandField(1337); const HOMES = territoryHomes(F);
const W = { getHeight: () => 10 };
function boss(id, x, z, hp = 15000) {
  const m = { islandId: id, kind: id === 'varkhul' ? 'varkhul' : id === 'brute' ? 'brute' : 'wyvern', position: new THREE.Vector3(x, 10, z), hp, maxHp: hp, state: 'idle', aggro: false, target: null, threat: new Map(), attack: false,
    perception: { engage() {}, setHome() {} } };
  m.getHitboxes = () => [{ part: 'body', sphere: new THREE.Sphere(m.position.clone().setY(12), 3) }];
  m.getAttackHitboxes = () => (m.attack ? [{ sphere: new THREE.Sphere(m.position.clone().setY(12).add(new THREE.Vector3(0, 0, 0)), 6), damage: 40 }] : []);
  m.receiveHit = ({ damage, attackerId }) => { m.hp -= damage; m.threat.set(attackerId, (m.threat.get(attackerId) || 0) + damage); if (m.hp <= 0) m.state = 'dead'; return { damage }; };
  return m;
}
function world(monsters, player = null) {
  const game = { world: W, monsters, player, events: { emit() {} } };
  const R = createBossRivalry(game, HOMES, () => true); return { R, run: (sec, dt = 0.1) => { for (let t = 0; t < sec; t += dt) R.update(dt); }, game };
}
const home = (id) => HOMES.find((h) => h.id === id);

{ // territories: vast, never overlapping (except mated pairs who share)
  let worst = 1e9, pair = '';
  for (const a of HOMES) for (const b of HOMES) { if (a === b || a.mate === b.id || b.mate === a.id || (a.mate && b.mate === a.mate)) continue; const terrA = a.mate && /^flame/.test(a.id) ? home(a.mate) : a, terrB = b.mate && /^flame/.test(b.id) ? home(b.mate) : b; if (terrA === terrB) continue;
    const d = Math.hypot(terrA.home[0] - terrB.home[0], terrA.home[1] - terrB.home[1]) - terrA.range - terrB.range; if (d < worst) { worst = d; pair = a.id + '/' + b.id; } }
  ok(worst >= 0, `big-monster territories do not overlap (closest gap ${worst.toFixed(0)} m: ${pair})`);
  ok(HOMES.every((h) => h.range >= 220), 'every territory is vast (≥ 220 m radius)');
  ok(Object.keys(TEMPERAMENT).length >= 22 && TEMPERAMENT.varkhul.label[1] === '勇猛', 'every monster has a temperament (Varkhul: 勇猛)');
}
{ // the valiant Varkhul attacks a Venom-fang dragon it comes across (in neutral ground)
  const v = boss('varkhul', 0, 300), d = boss('venom', 30, 300, 13000); const { R, run } = world([v, d]); run(10);
  ok((R.stats.byPair['varkhul>venom'] || 0) >= 1, 'Varkhul turns on a Venom-fang dragon', JSON.stringify(R.stats.byPair));
  ok(d.rival === v || (d.retreatT || 0) > 0, 'the dragon answers (or backs off)');
}
{ // a mated pair never fights
  const f = boss('flame', -500, 330), v2 = boss('venom', -520, 330); const { R, run } = world([f, v2]); run(20);
  ok(!f.rival && !v2.rival && R.stats.fights === 0, 'Flame ♂ and his Venom-fang ♀ never fight');
}
{ // intrusion: a dragon landing inside Gorvath's ground is challenged (Gorvath: territorial, fears nothing)
  const h = home('brute').home; const g = boss('brute', h[0], h[1], 26000), fl = boss('flameUpper', h[0] + 40, h[1], 15500); const { R, run } = world([g, fl]); run(15);
  ok(g.rival === fl && R.stats.intrusions >= 1, 'Gorvath challenges a dragon on his ground');
  const fl2 = boss('flameUpper', h[0] + 40, h[1], 15500); fl2.position.y = 40; const g2 = boss('brute', h[0], h[1], 26000); const w2 = world([g2, fl2]); w2.run(15);
  ok(!g2.rival, 'a dragon flying high over the territory is not challenged');
}
{ // a hunter drags a monster into another's ground: the owner weighs hunter vs monster
  const h = home('cindaryl').home; const c = boss('cindaryl', h[0], h[1], 19500), v = boss('varkhul', h[0] + 30, h[1], 21000);
  const P = { position: new THREE.Vector3(h[0] + 20, 10, h[1] + 10), id: 'local' }; c.aggro = true; c.target = P;
  const { R, run } = world([c, v], P); run(3);
  ok(c.rival === v && R.stats.playerDrawn >= 1, 'Cindaryl (hunter barely hurt her) turns on the Varkhul brought into her ground');
  const c2 = boss('cindaryl', h[0], h[1], 19500), v3 = boss('varkhul', h[0] + 30, h[1], 21000); c2.aggro = true; c2.target = P; c2.threat.set('local', 12000);
  const w = world([c2, v3], P); v3.retreatT = 99; w.run(3);
  ok(c2.rival !== v3, 'the same Cindaryl keeps on the hunter who has been hurting her badly');
}
{ // blows: attack hitboxes hurt the rival; a losing, cautious monster breaks off
  const v = boss('varkhul', 0, 300), d = boss('venom', 4, 300, 13000); const { R, run } = world([v, d]); run(10); v.attack = true; const hp0 = d.hp; run(3);
  ok(d.hp < hp0 && R.stats.blows >= 2, `blows land (${R.stats.blows}, ${hp0 - d.hp} damage)`);
  d.hp = d.maxHp * 0.2; v.attack = false; run(1);
  ok(!d.rival && (d.retreatT || 0) > 0 && R.stats.retreats >= 1, 'the cautious Venom-fang breaks off a losing fight and retreats');
}
console.log(fails ? `${fails} FAILED` : 'all rivalry tests passed');
process.exit(fails ? 1 : 0);
