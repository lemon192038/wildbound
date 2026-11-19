// Shared part-damage rules (stage 4) — used by the bosses and by every fauna creature, for hunter hits and for
// creature-vs-creature hits alike.
//
//   Part: { name, hp, maxHp, breakable, broken, hardness 0..1, regen (s | null = never), regenT, breakDamage?,
//           disables: ['fly', 'bite', 'tail', 'charge', 'dig', 'claw', 'throw', 'fist', ...], scar? }
//
//   resolvePartHit(part, dmg)  → { bodyDmg, partDmg, broke }
//     • an intact breakable part absorbs the hit: only its own HP drops (the body is untouched)
//     • the moment its HP reaches 0 it breaks ONCE and deals `breakDamage` (default: the part's max HP) to the body —
//       so a hunt that breaks everything takes about as long as before, and breaking parts is never wasted
//     • hits on regions that are not breakable parts, or on parts already broken, go straight to the body
//   tickRegen(parts, dt, factor) → names of parts that just regrew (factor scales speed: nutrition / health)
//   disabled(parts, ability)     → true while a broken part that provides `ability` has not regrown
//   deflects(hardness, sharpness, motion) → a blunt blade glances off very hard parts
//   pickTargetPart(attacker, target, rnd) → which part a creature aims at (size, posture and attack style)
export function makePart(def, scaleHp = 1) {
  const maxHp = def.hp >= 99999 ? def.hp : Math.round(def.hp * scaleHp);
  return { name: def.name, hp: maxHp, maxHp, breakable: !!def.breakable, broken: false, hitzone: def.hitzone ?? 1, hardness: def.hardness ?? 0.5,
    regen: def.regen ?? null, regenT: 0, breakDamage: def.breakDamage, disables: def.disables || [], acc: 0, _flinch: def.flinch ?? 1e9, scar: false };
}

export function resolvePartHit(p, dmg) {
  if (!p || !p.breakable || p.broken || p.maxHp >= 99999) return { bodyDmg: dmg, partDmg: 0, broke: false };
  p.hp = Math.max(0, p.hp - dmg);
  if (p.hp <= 0) { p.broken = true; p.regenT = 0; return { bodyDmg: p.breakDamage ?? p.maxHp, partDmg: dmg, broke: true }; }
  return { bodyDmg: 0, partDmg: dmg, broke: false };
}

export function tickRegen(parts, dt, factor = 1) {
  const out = [];
  for (const p of parts) {
    if (!p.broken || !p.regen) continue;
    p.regenT += dt * Math.max(0.1, factor);
    if (p.regenT >= p.regen) { p.broken = false; p.regenT = 0; p.hp = Math.round(p.maxHp * 0.6); p.scar = true; out.push(p.name); } // regrown, but weaker for now
  }
  return out;
}

export const disabled = (parts, ability) => parts.some((p) => p.broken && p.disables.includes(ability));

// A blunt blade glances off very hard parts. Heavy (charged) swings bite harder.
export function deflects(hardness = 0.5, sharpness = 1, motion = '') {
  const heavy = /heavy|trueslash|tackle/.test(motion);
  const edge = 0.45 + 0.55 * sharpness + (heavy ? 0.4 : 0);
  return hardness > edge;
}
// Weapon wear per hit: harder parts blunt the edge faster.
export const wearFactor = (hardness = 0.5) => 0.55 + hardness * 1.5;

// Creature-vs-creature: choose the part to bite / ram. Smaller attackers go for the legs, a downed or crippled
// target gets struck at the head, rams hit the body; a part that is already broken is not chosen again.
export function pickTargetPart(attacker, target, rnd = Math.random, style = 'bite') {
  const parts = (target.parts || []).filter((p) => !p.broken && p.name !== 'mound');
  if (!parts.length) return 'body';
  const has = (n) => parts.some((p) => p.name === n);
  const size = (o) => o.bodySize ?? o.scale ?? 1; // metres when known (fauna), else the model scale
  const small = size(attacker) < size(target) * 0.85;
  const crippled = (target.parts || []).some((p) => p.broken && /leg/.test(p.name));
  const w = parts.map((p) => {
    let v = 1;
    if (/leg/.test(p.name)) v = small && style === 'bite' ? 4 : 1;
    if (p.name === 'head') v = crippled ? 4 : style === 'bite' ? 1.5 : 1;
    if (p.name === 'body') v = style === 'ram' ? 4 : 1.2;
    if (p.name === 'wings' && style === 'bite') v = 2;
    if (p.name === 'crystal' || p.name === 'shell') v = style === 'ram' ? 1.5 : 0.4;
    return v;
  });
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < parts.length; i++) { r -= w[i]; if (r <= 0) return parts[i].name; }
  return has('body') ? 'body' : parts[0].name;
}
