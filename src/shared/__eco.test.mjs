// Ecosystem model tests (src/shared/ecosystem.js) on the real island field, no browser: node src/shared/__eco.test.mjs
import { createIslandField } from '../world/island/islandField.js';
import { createEcoWorld, stepEco, census, applyReport, carcassState, pushOf, serializeEco, loadEco, ECO, TILE, seasonFrac, SEASON } from './ecosystem.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const F = createIslandField(1337);
const run = (W, hours, dt = 120) => { for (let i = 0; i < (hours * 3600) / dt; i++) stepEco(W, dt); };
const popT = (T, sp) => (T.p[sp] ? T.p[sp].reduce((a, b) => a + b, 0) : 0) + T.g.filter((g) => g.sp === sp).reduce((a, g) => a + g.n.reduce((x, y) => x + y, 0), 0);
const posOf = (T) => [-F.half + T.tx * TILE + 32, -F.half + T.tz * TILE + 32];

{ // 1) two days left alone: nothing dies out, nothing explodes; births and deaths both happen
  const W = createEcoWorld(F, { seed: 1337 }); const init = census(W); const t0 = Date.now();
  let minSeen = { ...init }, maxSeen = { ...init };
  for (let h = 0; h < 48; h++) { run(W, 1); const c = census(W); for (const sp in c) { minSeen[sp] = Math.min(minSeen[sp], c[sp]); maxSeen[sp] = Math.max(maxSeen[sp], c[sp]); } }
  const end = census(W);
  ok(Object.keys(ECO).every((sp) => end[sp] > 0), `no species extinct after 48 h (${JSON.stringify(end)})`);
  ok(Object.keys(ECO).every((sp) => maxSeen[sp] <= Math.max(10, init[sp] * 3.5)), 'no population explosion (≤ 3.5× the start)');
  ok(W.stats.births > 1000 && W.stats.deaths > 1000 && W.stats.predation > 100, `births ${W.stats.births}, deaths ${W.stats.deaths}, predation ${W.stats.predation}`);
  ok(W.stats.migrated > 100, `animals migrated (${W.stats.migrated})`);
  ok(W.stats.eruptions > 5, `eruptions happened (${W.stats.eruptions})`);
  console.log('     48 h simulated in', Date.now() - t0, 'ms');
  // no lone wolves: every pack has at least 2 members
  const packs = Object.values(W.tiles).flatMap((T) => T.g.filter((g) => g.sp === 'wolf'));
  ok(packs.length > 0 && packs.every((g) => g.n.reduce((a, b) => a + b, 0) >= 2), `wolves live in packs only (${packs.length} packs)`);
  // carcasses age through their states and feed fungi
  const states = new Set(); for (const T of Object.values(W.tiles)) for (const c of T.cc) states.add(carcassState(c));
  ok(states.has('remains') && (states.has('rotten') || states.has('eaten') || states.has('fresh')), `carcasses in several states (${[...states].join(', ')})`);
}
{ // 2) hunting a tile empty: no instant respawn; life returns later through breeding / migration
  const W = createEcoWorld(F, { seed: 7 });
  const T = Object.values(W.tiles).filter((q) => q.p.beetle && popT(q, 'beetle') >= 2).sort((a, b) => popT(b, 'beetle') - popT(a, 'beetle'))[0];
  const [x, z] = posOf(T); let n = 0;
  while (T.p.beetle.some((v) => v > 0)) { const st = T.p.beetle.findIndex((v) => v > 0); applyReport(W, F, { sp: 'beetle', stage: st, x, z, cause: 'hunter' }); n++; }
  ok(popT(T, 'beetle') === 0 && T.hunt > 1 && T.cc.some((c) => c.sp === 'beetle'), `hunted ${n} beetles out of a tile (carcasses left, hunting pressure ${T.hunt.toFixed(1)})`);
  run(W, 5 / 60, 30); ok(popT(T, 'beetle') === 0, 'five minutes later: still none there (no instant respawn)');
  let back = -1; for (let h = 1; h <= 24 && back < 0; h++) { run(W, 1); if (popT(T, 'beetle') > 0) back = h; }
  ok(back > 0, `beetles came back to the tile after ~${back} h (breeding / migration)`);
  ok(!applyReport(W, F, { sp: 'golem', stage: 2, x: 1100, z: 1100, cause: 'hunter' }).ok, 'a kill report cannot remove a creature that is not there');
}
{ // 3) breeding: nests appear in season, hatch after incubation, the young grow up
  const W = createEcoWorld(F, { seed: 11 }); let nests = 0, juvs0 = 0;
  for (const T of Object.values(W.tiles)) juvs0 += T.p.beetle ? T.p.beetle[0] : 0;
  for (let i = 0; i < 60; i++) { stepEco(W, 60); nests = Math.max(nests, Object.values(W.tiles).reduce((a, T) => a + T.nest.length, 0)); }
  ok(nests > 10, `nests built (${nests} at once)`);
  run(W, 2); let juvs = 0, young = 0; for (const T of Object.values(W.tiles)) if (T.p.beetle) { juvs += T.p.beetle[0]; young += T.p.beetle[1]; }
  ok(W.stats.by.beetle.born > 50 && juvs + young > 0, `beetle eggs hatched (${W.stats.by.beetle.born} born) and young are growing (${juvs} juveniles, ${young} young)`);
  // seasonal breeders only breed in their season
  const W2 = createEcoWorld(F, { seed: 5 }); W2.t = SEASON * 0.5; // bird season is [0, 0.35)
  for (let i = 0; i < 40; i++) stepEco(W2, 60);
  ok(seasonFrac(W2) > 0.35 && !Object.values(W2.tiles).some((T) => T.nest.some((q) => q.sp === 'bird')), 'birds build no nests outside their season');
}
{ // 4) migration: lava damage and hunting pressure push animals out to better ground
  const W = createEcoWorld(F, { seed: 3 });
  const T = Object.values(W.tiles).filter((q) => popT(q, 'beetle') >= 3)[0]; const before = popT(T, 'beetle');
  ok(pushOf(W, T, 'beetle') < 0.3, 'a healthy tile has little reason to leave');
  T.env.lava = 1; T.hunt = 5;
  ok(pushOf(W, T, 'beetle') > 0.5, `lava + hunting make them want to leave (push ${pushOf(W, T, 'beetle').toFixed(2)})`);
  for (let i = 0; i < 40; i++) { T.env.lava = 1; T.hunt = 5; stepEco(W, 120); }
  ok(popT(T, 'beetle') < before, `beetles left the ruined tile (${before} → ${popT(T, 'beetle')})`);
}
{ // 5) learning: wolves become wary of hunters much faster than slimes
  const W = createEcoWorld(F, { seed: 9 });
  const tw = Object.values(W.tiles).find((q) => q.g.some((g) => g.sp === 'wolf' && g.n.reduce((a, b) => a + b, 0) >= 4));
  const ts = Object.values(W.tiles).find((q) => popT(q, 'slime') >= 2);
  applyReport(W, F, { sp: 'wolf', stage: 2, x: posOf(tw)[0], z: posOf(tw)[1], cause: 'hunter' }); applyReport(W, F, { sp: 'slime', stage: 2, x: posOf(ts)[0], z: posOf(ts)[1], cause: 'hunter' });
  ok((tw.wary.wolf || 0) > (ts.wary.slime || 0) * 5, `wolf wariness ${tw.wary.wolf?.toFixed(2)} vs slime ${ts.wary.slime?.toFixed(2)} (intelligence differs)`);
}
{ // 6) environment: eruptions bring ash, cooled lava brings minerals, rotting carcasses feed fungi
  const W = createEcoWorld(F, { seed: 1337 }); const core = Object.values(W.tiles).filter((T) => T.regs.includes('core') || T.regs.includes('caldera'));
  const ash0 = core.reduce((a, T) => a + T.env.ash, 0); let er = W.stats.eruptions; while (W.stats.eruptions === er) stepEco(W, 300);
  ok(core.reduce((a, T) => a + T.env.ash, 0) > ash0, 'an eruption spreads ash around the summit');
  const T = Object.values(W.tiles).find((q) => q.regs.includes('ashplain')); const fun0 = T.env.fun;
  for (let i = 0; i < 6; i++) T.cc.push({ sp: 'boar', m: 1, age: 1000, dx: 10, dz: 10 });
  for (let i = 0; i < 10; i++) stepEco(W, 120);
  ok(T.env.fun > fun0, `rotting carcasses feed the fungi (${fun0.toFixed(2)} → ${T.env.fun.toFixed(2)})`);
}
{ // 7) persistence round trip
  const W = createEcoWorld(F, { seed: 21 }); run(W, 1); const W2 = loadEco(F, serializeEco(W));
  ok(JSON.stringify(census(W2)) === JSON.stringify(census(W)) && W2.t === Math.round(W.t), 'serialize → load keeps every population and the clock');
  stepEco(W, 120); stepEco(W2, 120); ok(Math.abs(census(W).beetle - census(W2).beetle) <= 3, 'a reloaded world keeps evolving the same way');
}
console.log(fails ? `${fails} FAILED` : 'all ecosystem tests passed');
process.exit(fails ? 1 : 0);
