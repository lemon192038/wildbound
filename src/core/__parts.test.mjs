// node src/core/__parts.test.mjs — the shared part rules (stage 4).
import { makePart, resolvePartHit, tickRegen, disabled, deflects, pickTargetPart } from './parts.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

{ // part HP absorbs, body untouched until the break, break damage exactly once
  const p = makePart({ name: 'tail', hp: 1000, breakable: true, disables: ['tail'] });
  let body = 5000;
  for (let i = 0; i < 9; i++) { const r = resolvePartHit(p, 100); body -= r.bodyDmg; }
  ok(body === 5000 && p.hp === 100 && !p.broken, 'part hits lower only the part HP');
  const r = resolvePartHit(p, 300); body -= r.bodyDmg;
  ok(r.broke && p.broken && p.hp === 0 && body === 4000, `break deals its body damage once (body ${body})`);
  const r2 = resolvePartHit(p, 250); body -= r2.bodyDmg;
  ok(!r2.broke && body === 3750, 'hits on a broken part go to the body (no second break damage)');
  ok(disabled([p], 'tail') && !disabled([p], 'bite'), 'broken part disables its ability only');
}
{ // non-breakable region → body directly
  const b = makePart({ name: 'body', hp: 99999, breakable: false });
  const r = resolvePartHit(b, 120); ok(r.bodyDmg === 120 && !r.broke, 'non-part region damages the body directly');
}
{ // regeneration restores the part (and its ability) after its timer; faster when well fed
  const p = makePart({ name: 'wings', hp: 800, breakable: true, regen: 60, disables: ['fly'] }); resolvePartHit(p, 900);
  ok(tickRegen([p], 30).length === 0 && p.broken, 'still broken before the regen timer');
  ok(tickRegen([p], 30)[0] === 'wings' && !p.broken && !disabled([p], 'fly') && p.hp === 480, 'regrown after 60 s (weaker: 60 % HP)');
  const q = makePart({ name: 'tail', hp: 800, breakable: true, regen: 60 }); resolvePartHit(q, 900);
  ok(tickRegen([q], 31, 2).length === 1, 'regen factor (nutrition / health) speeds it up');
  const n = makePart({ name: 'tail', hp: 800, breakable: true, regen: null }); resolvePartHit(n, 900);
  ok(tickRegen([n], 1e6).length === 0 && n.broken, 'parts with no regen stay broken (permanent injury)');
}
{ // hardness vs sharpness
  ok(deflects(0.95, 0.2, 'light1') && !deflects(0.95, 1, 'light1') && !deflects(0.95, 0.2, 'heavy') && !deflects(0.3, 0, 'light1'), 'blunt blades glance off very hard parts; sharp or heavy blows bite');
}
{ // target-part choice: small attackers go for the legs; broken parts are never chosen
  const target = { scale: 1.4, parts: ['head', 'body', 'legs', 'crystal'].map((n) => makePart({ name: n, hp: 500, breakable: n !== 'body' })) };
  const wolf = { scale: 1 }; const n = { head: 0, body: 0, legs: 0, crystal: 0 }; let s = 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 2000; i++) n[pickTargetPart(wolf, target, rnd)]++;
  ok(n.legs > n.head && n.legs > n.body && n.legs > n.crystal, `smaller biter mostly targets the legs (${JSON.stringify(n)})`);
  target.parts[2].broken = true; const m = { head: 0, body: 0, legs: 0, crystal: 0 };
  for (let i = 0; i < 2000; i++) m[pickTargetPart(wolf, target, rnd)]++;
  ok(m.legs === 0 && m.head > m.body, `crippled target: no more leg bites, head preferred (${JSON.stringify(m)})`);
}
console.log(fails ? `${fails} FAILED` : 'all part tests passed');
process.exit(fails ? 1 : 0);
