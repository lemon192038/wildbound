// Tiny typed-ish event bus shared by every module.
// Known events (payloads documented in CONTRACTS.md):
//  'hit'            {attacker, target, damage, part, point, normal, isCrit}
//  'player:damaged' {amount, source}   'player:died' {}
//  'monster:state'  {monster, state}   'monster:partBreak' {monster, part}
//  'monster:roar'   {monster}          'monster:died' {monster}
//  'footstep'       {position, heavy}  'sfx' {name, position, volume}
//  'camera:shake'   {intensity, duration}  'hitstop' {duration}
export class Events {
  constructor() { this.map = new Map(); }
  on(type, fn) { (this.map.get(type) || this.map.set(type, new Set()).get(type)).add(fn); return () => this.off(type, fn); }
  off(type, fn) { this.map.get(type)?.delete(fn); }
  emit(type, payload) { this.map.get(type)?.forEach((fn) => fn(payload)); }
}
