// Temperament (性格) of every monster (user request) — read by the big-monster rivalry (src/field/bossRivalry.js), egg
// theft reactions (fauna.js / broods.js) and nest guarding. Names, diets and relations stay the design document's; these
// numbers only describe HOW each animal behaves inside them. All 0..1.
//   aggression  : readiness to attack (another monster, an intruder, a thief)
//   bold        : how big a threat it will still take on (low = backs down, flees early)
//   territorial : how hard it holds its ground against intruders of its size class
//   caution     : how early it breaks off a losing fight
//   nest        : how violently it answers a raided nest (egg theft) — and how closely females sit near the eggs
//   label       : the word shown in the field guide
export const TEMPERAMENT = {
  // big monsters
  varkhul: { label: ['Valiant', '勇猛'], aggression: 0.9, bold: 0.95, territorial: 0.85, caution: 0.15, nest: 0.9, hates: ['venom', 'venom2', 'cindaryl'] }, // attacks Venom-fang dragons on sight
  wyvern: { label: ['Proud', '高慢'], aggression: 0.7, bold: 0.75, territorial: 0.6, caution: 0.35, nest: 0.8 },
  brute: { label: ['Implacable', '不動'], aggression: 0.6, bold: 1.0, territorial: 1.0, caution: 0.05, nest: 0.95 },
  flame: { label: ['Restless', '奔放'], aggression: 0.6, bold: 0.6, territorial: 0.35, caution: 0.45, nest: 0.85 },
  flameRoam: { label: ['Restless', '奔放'], aggression: 0.6, bold: 0.6, territorial: 0.35, caution: 0.45, nest: 0.85 },
  flameUpper: { label: ['Domineering', '覇気'], aggression: 0.75, bold: 0.8, territorial: 0.55, caution: 0.3, nest: 0.85 },
  venom: { label: ['Guarded', '慎重'], aggression: 0.55, bold: 0.55, territorial: 0.95, caution: 0.5, nest: 1.0 },
  venom2: { label: ['Guarded', '慎重'], aggression: 0.55, bold: 0.55, territorial: 0.95, caution: 0.5, nest: 1.0 },
  cindaryl: { label: ['Ruthless', '冷酷'], aggression: 0.9, bold: 0.9, territorial: 1.0, caution: 0.15, nest: 1.0 },
  // island creatures
  beetle: { label: ['Timid', '臆病'], aggression: 0.15, bold: 0.2, territorial: 0, caution: 0.9, nest: 0.3 },
  slime: { label: ['Placid', '無頓着'], aggression: 0.2, bold: 0.3, territorial: 0, caution: 0.5, nest: 0.2 },
  bird: { label: ['Wary', '警戒心'], aggression: 0.35, bold: 0.35, territorial: 0.3, caution: 0.8, nest: 0.85 },
  lizard: { label: ['Ambusher', '狡猾'], aggression: 0.6, bold: 0.45, territorial: 0.7, caution: 0.6, nest: 0.7 },
  snake: { label: ['Sullen', '執念深い'], aggression: 0.7, bold: 0.7, territorial: 0.6, caution: 0.4, nest: 0.8 },
  drake: { label: ['Opportunist', '日和見'], aggression: 0.5, bold: 0.35, territorial: 0.4, caution: 0.7, nest: 0.8 },
  boar: { label: ['Protective', '献身'], aggression: 0.55, bold: 0.6, territorial: 0.5, caution: 0.4, nest: 0.95 },
  tusk: { label: ['Unyielding', '剛毅'], aggression: 0.75, bold: 0.9, territorial: 0.7, caution: 0.15, nest: 1.0 },
  wolf: { label: ['Cunning', '狡知'], aggression: 0.65, bold: 0.55, territorial: 0.8, caution: 0.55, nest: 0.95 },
  leader: { label: ['Commanding', '統率'], aggression: 0.75, bold: 0.75, territorial: 0.9, caution: 0.4, nest: 1.0 },
  mole: { label: ['Reclusive', '内向'], aggression: 0.45, bold: 0.5, territorial: 0.75, caution: 0.6, nest: 0.9 },
  grandmole: { label: ['Ancient wrath', '古き怒り'], aggression: 0.7, bold: 0.85, territorial: 1.0, caution: 0.3, nest: 1.0 },
  golem: { label: ['Patient', '忍耐'], aggression: 0.5, bold: 0.8, territorial: 0.8, caution: 0.3, nest: 0.7 },
};
export const temperOf = (id) => TEMPERAMENT[id] || TEMPERAMENT[id === 'flameUpper' ? 'flame' : 'beetle'];
// how dangerous a big monster is as an opponent (HP-scaled, temperament-weighted)
export const powerOf = (m, id) => (m.maxHp || 10000) / 10000 * (0.6 + 0.6 * (temperOf(id).aggression + temperOf(id).bold) / 2) * Math.max(0.25, (m.hp || 1) / (m.maxHp || 1));
