// Material rights (design document §10): who may carve what.
//   • a part's material: every hunter who actually damaged THAT part (not just the last hit)
//   • the body's materials: every hunter who damaged the creature anywhere (body or any part)
//   • hunters who never damaged it get nothing
// Recorded on the creature itself by the client that dealt the damage (each client knows its own hits).
export function noteDamage(target, who, part) {
  if (!target) return;
  const R = (target.rights ||= { body: new Set(), parts: {} });
  R.body.add(who);
  if (part && part !== 'body') (R.parts[part] ||= new Set()).add(who);
}
export const hasBodyRight = (target, who) => !!target?.rights?.body.has(who);
export const hasPartRight = (target, who, part) => !!target?.rights?.parts[part]?.has(who);
