// Per-species perception profiles (data only; consumed by src/core/perception.js).
// Distances are metres in the existing field scale (hunter ≈ 1.8 m, arenas ≈ 120 m radius).
//   sight      : max visual range; fov is the full horizontal view cone in degrees; needs terrain line of sight
//   hearing    : range for a hunter making "full" noise (sprinting / attacking); scaled by the noise level 0..1.2
//   smell      : omnidirectional range, ignores line of sight (short)
//   notice     : seconds of continuous clear sight at mid range needed to go from unaware to engaged
//   chaseEnd   : an engaged target farther than this is no longer "in contact"
//   leash      : max distance from home before the monster stops pursuing
//   search     : seconds spent searching the last known position after losing contact, before returning home
//   interval   : seconds between sense updates while unaware (engaged monsters update every frame anyway)
export const SENSES = {
  // Varkhul, the Emberhide — ground beast, good nose, average eyes.
  varkhul: { sight: 46, fov: 150, hearing: 32, smell: 14, notice: 1.0, chaseEnd: 85, leash: 115, search: 7, interval: 0.25, eyeH: 2.6 },
  // Cindral, the Ashwing — flying wyvern, keen wide sight from altitude, little smell.
  wyvern: { sight: 64, fov: 220, hearing: 30, smell: 0, notice: 0.8, chaseEnd: 105, leash: 135, search: 6, interval: 0.25, eyeH: 7.0 },
  // Gorvath, the Cinderfist — colossal brute, poor eyes, feels footfalls through the ground.
  brute: { sight: 38, fov: 130, hearing: 46, smell: 12, notice: 1.3, chaseEnd: 80, leash: 105, search: 8, interval: 0.3, eyeH: 5.0 },
  default: { sight: 40, fov: 140, hearing: 30, smell: 10, notice: 1.0, chaseEnd: 80, leash: 110, search: 6, interval: 0.3, eyeH: 2.0 },
};
export const senseProfile = (id) => SENSES[id] || SENSES.default;
