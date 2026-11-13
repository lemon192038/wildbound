// Gathering points in the hunting field (deterministic layout per seed): herbs, glowcaps, tidecap lichen
// by the water, ore outcrops (iron / crimson), rare stormquartz crystals, honey hives and bone piles.
// Labels shown to the player are localized (i18n key g.<type>); TYPES[].label is the English fallback.
// Each point yields a few times. Results are reported to the server at the end of the quest, where they
// are validated & capped (server/economy.js sanitizeReport) — the field only tracks what you picked.
import * as THREE from 'three';
import { t } from '../shared/i18n.js';

const TYPES = {
  herb: { items: [['sunpetal', 85], ['honey', 15]], uses: 3, label: 'Herb patch', color: 0xc8e070, glow: 0xfff0a0 },
  mushroom: { items: [['glowcap', 100]], uses: 3, label: 'Glowcap cluster', color: 0x6ad0c0, glow: 0x80ffe0 },
  lichen: { items: [['tidecap', 100]], uses: 3, label: 'Tidecap lichen', color: 0x4aa0e0, glow: 0x9ad8ff },
  ore: { items: [['ironOre', 100]], uses: 3, label: 'Ore outcrop', color: 0x8a8a96, glow: 0xffffff },
  crimson: { items: [['crimsonOre', 80], ['ironOre', 20]], uses: 3, label: 'Crimson vein', color: 0xa03a2a, glow: 0xff8a6a },
  crystal: { items: [['stormquartz', 100]], uses: 2, label: 'Stormquartz crystal', color: 0x9ab8ff, glow: 0xc8e0ff },
  hive: { items: [['honey', 100]], uses: 2, label: 'Wild hive', color: 0xd8a030, glow: 0xffd070 },
  bones: { items: [['monsterBone', 100]], uses: 2, label: 'Bone pile', color: 0xe8e0c8, glow: 0xffffff },
};
const LAYOUT = { herb: 9, mushroom: 6, lichen: 5, ore: 6, crimson: 4, crystal: 3, hive: 2, bones: 3 };

export function createGather(game) {
  const { scene, world } = game;
  let seed = 9173; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const radius = (world.bounds?.radius || 120) * 0.82;
  const water = (world.waterSources || []).slice();
  const taken = [];
  const okSpot = (x, z) => {
    if (taken.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 64)) return false;
    if ((world.colliders || []).some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 2) ** 2)) return false;
    const wh = world.waterHeightAt?.(x, z); if (wh != null && wh > world.getHeight(x, z) + 0.05) return false; // not under water
    const n = world.getNormal?.(x, z); if (n && n.y < 0.82) return false; // not on steep slopes
    return true;
  };
  const nodes = []; const group = new THREE.Group(); group.name = 'gatherNodes'; scene.add(group);
  const mat = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, emissive: new THREE.Color(e || 0), emissiveIntensity: e ? 0.8 : 0 });
  function makeMesh(type) {
    const g = new THREE.Group(); const t = TYPES[type];
    if (type === 'herb') for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 4), mat(t.color)); m.position.set((R() - 0.5) * 0.7, 0.3, (R() - 0.5) * 0.7); m.rotation.set((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6); g.add(m); const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), mat(0xffd84a, 0xffb020)); f.position.copy(m.position).setY(0.68); g.add(f); }
    else if (type === 'mushroom' || type === 'lichen') for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.35, 6), mat(0xe8e0d0)); const c = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(t.color, t.glow)); const x = (R() - 0.5) * 0.8, z = (R() - 0.5) * 0.8, k = 0.6 + R() * 0.7; s.position.set(x, 0.17 * k, z); s.scale.setScalar(k); c.position.set(x, 0.34 * k, z); c.scale.setScalar(k); g.add(s, c); }
    else if (type === 'ore' || type === 'crimson') { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), mat(0x5a5650)); r.scale.set(1.2, 0.8, 1); r.position.y = 0.4; g.add(r); for (let i = 0; i < 6; i++) { const v = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), mat(t.color, t.glow)); v.position.set((R() - 0.5) * 1.6, 0.4 + R() * 0.5, (R() - 0.5) * 1.4); g.add(v); } }
    else if (type === 'crystal') for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.2 + R(), 5), new THREE.MeshStandardMaterial({ color: t.color, emissive: new THREE.Color(0x6080ff), emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 })); c.position.set((R() - 0.5) * 0.7, 0.5, (R() - 0.5) * 0.7); c.rotation.set((R() - 0.5) * 0.7, 0, (R() - 0.5) * 0.7); g.add(c); }
    else if (type === 'hive') { const h = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat(t.color, 0x603000)); h.scale.set(1, 1.3, 1); h.position.y = 0.6; g.add(h); }
    else { for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.2, 6), mat(t.color)); b.position.set((R() - 0.5) * 0.8, 0.12, (R() - 0.5) * 0.8); b.rotation.set(Math.PI / 2, R() * 3, 0); g.add(b); } }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: t.glow, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(0.5); sp.position.y = 1.6; g.add(sp); g.userData.spark = sp;
    return g;
  }
  for (const [type, n] of Object.entries(LAYOUT)) {
    for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
      let x, z;
      if (type === 'lichen' && water.length) { const w = water[Math.floor(R() * water.length)]; const a = R() * Math.PI * 2, d = 4 + R() * 6; x = w.x + Math.cos(a) * d; z = w.z + Math.sin(a) * d; }
      else { const a = R() * Math.PI * 2, d = 12 + Math.sqrt(R()) * (radius - 12); x = Math.cos(a) * d; z = Math.sin(a) * d; }
      if (!okSpot(x, z)) continue;
      taken.push({ x, z }); i++;
      const mesh = makeMesh(type); mesh.position.set(x, world.getHeight(x, z), z); mesh.rotation.y = R() * Math.PI * 2; group.add(mesh);
      nodes.push({ type, x, z, mesh, uses: TYPES[type].uses, label: t('g.' + type), pos: mesh.position });
    }
  }
  let t = 0;
  const api = {
    nodes,
    nearest(p, maxD = 2.6) { let best = null, bd = maxD * maxD; for (const n of nodes) { if (n.uses <= 0) continue; const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2; if (d < bd) { bd = d; best = n; } } return best; },
    gather(n) {
      if (!n || n.uses <= 0) return null; n.uses--;
      const list = TYPES[n.type].items; let x = R() * 100, item = list[0][0]; for (const [k, w] of list) { if ((x -= w) <= 0) { item = k; break; } }
      const qty = R() < 0.3 ? 2 : 1;
      if (n.uses <= 0) { n.mesh.userData.spark.visible = false; n.mesh.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.45); o.material.emissiveIntensity = 0; } }); }
      return { item, qty };
    },
    update(dt) { t += dt; for (const n of nodes) if (n.uses > 0) { const s = n.mesh.userData.spark; s.material.opacity = 0.45 + 0.4 * Math.sin(t * 3 + n.x); s.position.y = 1.5 + Math.sin(t * 2 + n.z) * 0.12; } },
    dispose() { scene.remove(group); },
  };
  return api;
}
