// Status ailment rules (src/core/status.js) without a browser: stacking, immunity, wards, cures, mods, linked debuffs.
// Usage: node src/core/__status.test.mjs
import { createStatus, DEF } from './status.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const ev = []; const handlers = {};
const game = {
  events: { emit: (n, e) => ev.push([n, e]), on: (n, f) => (handlers[n] ||= []).push(f) },
  player: { dead: false, state: 'idle', gear: { skills: {} }, hp: 150, position: { clone: () => ({ y: 0 }) }, drain(a) { this.hp -= a; } },
};
const S = createStatus(game);
const step = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) S.update(1 / 60); };

// stacking: same level refreshes (never adds), stronger replaces, weaker is ignored
S.apply('burn', 'small'); step(3); S.apply('burn', 'small');
ok(Math.abs(S.get('burn').t - DEF.burn.small.t) < 0.05, 'same level refreshes to the full timer (no stacking)');
S.apply('burn', 'medium'); ok(S.get('burn').level === 'medium', 'medium burn replaces small');
ok(S.apply('burn', 'small') === false && S.get('burn').level === 'medium', 'weaker burn is ignored');
S.apply('burn', 'large'); ok(S.has('atkDown'), 'large burn also lowers attack');
ok(S.mods().atk < 1, 'atkDown lowers the attack multiplier');
S.clear();

// control ailments: sleep / stun leave a post-ailment immunity
S.apply('stun', 'short'); ok(S.blocks().stunned, 'stun blocks the hunter');
step(DEF.stun.short.t + 0.1); ok(!S.has('stun'), 'stun wears off');
ok(S.apply('stun', 'long') === false, 'immune to stun right after one ends');
step(DEF.stun.short.immune + 0.1); ok(S.apply('stun', 'long'), 'stun lands again once the immunity is over');
S.clear(); for (const k in S.immune) S.immune[k] = 0;
S.apply('sleep'); ok(S.blocks().asleep, 'sleep applies'); S.clear('sleep'); ok(S.apply('sleep') === false, 'sleep immunity after waking');

// flinch is instant (event only, not listed)
ev.length = 0; S.apply('flinch', 'long'); ok(!S.has('flinch') && ev.some(([n, e]) => n === 'status:apply' && e.kind === 'flinch' && e.instant), 'flinch is an instant event');

// wards block, cures clear, debuffs grouped
S.ward('confusion', 30); ok(S.apply('confusion', 'short') === false, 'a ward blocks the ailment');
S.apply('defDown'); S.apply('speedDown'); S.apply('silence');
ok(S.mods().def < 1 && S.mods().speed < 1 && S.blocks().silenced, 'debuffs and silence active');
ok(S.cure(['debuffs']) === 2 && !S.has('defDown') && S.has('silence'), "cure(['debuffs']) clears only stat-downs");
S.apply('poison', 'lethal'); ok(S.has('healDown'), 'lethal venom also lowers healing');
ok(S.cure(['all']) >= 2 && !S.list().length, "cure(['all']) clears everything");

// damage over time still drains, blast still bursts
game.player.hp = 150; S.apply('poison', 'normal'); step(2); ok(game.player.hp < 146 && game.player.hp > 144, 'poison drains ~2.5 HP/s');
S.clear();
console.log(fails ? `${fails} FAILED` : 'all status tests passed');
process.exit(fails ? 1 : 0);
