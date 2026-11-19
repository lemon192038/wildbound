// 21 more island prop types (user request: ~20 view-blocking props to make exploring varied): twisted and charred
// dead trees, fallen logs, stumps, rock arches, spires, leaning slabs, ash dunes, steam chimneys, ash reeds, thorn
// bushes, giant ribcages, ruined columns and walls, crystal spires, mushroom clumps, giant ferns, coastal palms,
// driftwood piles, cairns and obsidian shards. Each: geometry builder, per-region density, instance cap, material,
// scale range, collider radius and height (grappling-hook targets) — consumed by props.js like the original six.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../noise.js';

function prep(g) { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); n.computeVertexNormals(); return n; }
function paint(THREE, g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3); const o = [0, 0, 0];
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 1, o); c.set(o, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
const solid = (r, gg, b) => (x, y, z, ny, o) => { const v = 0.85 + 0.15 * Math.sin(x * 5.1 + y * 3.7 + z * 4.3); o[0] = r * v; o[1] = gg * v; o[2] = b * v; };
const ashTop = (r, gg, b) => (x, y, z, ny, o) => { const v = 0.85 + 0.15 * Math.sin(x * 4 + y * 3 + z * 5); const a = Math.max(0, ny - 0.6) * 0.6; o[0] = r * v + a * 0.25; o[1] = gg * v + a * 0.24; o[2] = b * v + a * 0.23; };

// [geometry(THREE, rnd), density by region, cap, material opts, [min, max] scale, collider r (× scale), height (× scale), place: 'ground'|'shore']
export const EXTRA_PROPS = {
  twistedTree: [(T, r) => { const ps = []; let y = 0, x = 0; for (let i = 0; i < 5; i++) { const h = 1.3; const c = new T.CylinderGeometry(0.22 - i * 0.03, 0.3 - i * 0.03, h, 6); c.rotateZ(Math.sin(i * 1.7) * 0.35); c.translate(x, y + h / 2, 0); ps.push(prep(c)); y += h * 0.95; x += Math.sin(i * 1.7) * 0.35; }
      for (let i = 0; i < 5; i++) { const b = new T.CylinderGeometry(0.03, 0.09, 2.4, 5); b.translate(0, 1.2, 0); b.rotateZ(0.8 + r() * 0.6); b.rotateY(i * 1.3); b.translate(x, y - 1 - i * 0.4, 0); ps.push(prep(b)); } return mergeGeometries(ps); },
    { ashplain: 3, core: 3, geotherm: 2, canyon: 2, ruins: 2 }, 500, { color: 0x2a2018, roughness: 0.95 }, [0.8, 1.5], 0.4, 7],
  charredGiant: [(T) => { const ps = [prep(new T.CylinderGeometry(0.5, 1.1, 11, 8).translate(0, 5.5, 0))]; for (let i = 0; i < 4; i++) { const b = new T.CylinderGeometry(0.1, 0.32, 4.5, 6); b.translate(0, 2.2, 0); b.rotateZ(0.6 + i * 0.12); b.rotateY(i * 1.6); b.translate(0, 7 + i * 1.1, 0); ps.push(prep(b)); } return mergeGeometries(ps); },
    { ashplain: 1.2, core: 1.4, geotherm: 1, ruins: 0.8 }, 200, { color: 0x151110, roughness: 1 }, [0.9, 1.4], 1.0, 14],
  fallenLog: [(T) => { const g = new T.CylinderGeometry(0.55, 0.7, 9, 9); g.rotateZ(Math.PI / 2); g.translate(0, 0.55, 0); const st = new T.CylinderGeometry(0.15, 0.25, 1.6, 5); st.rotateZ(1.1); st.translate(2, 1.1, 0.2); return mergeGeometries([prep(g), prep(st)]); },
    { fungal: 3, ashplain: 2, coast: 1.5, ruins: 2, canyon: 1 }, 500, { color: 0x3a2818, roughness: 0.95 }, [0.8, 1.3], 0.7, 1.4],
  stumps: [(T, r) => { const ps = []; for (let i = 0; i < 4; i++) { const h = 0.5 + r() * 1.2; const c = new T.CylinderGeometry(0.35, 0.45, h, 7); c.translate((r() - 0.5) * 3, h / 2, (r() - 0.5) * 3); ps.push(prep(c)); } return mergeGeometries(ps); },
    { fungal: 3, ashplain: 3, ruins: 1, coast: 1 }, 600, { color: 0x4a3420, roughness: 0.95 }, [0.8, 1.2], 0, 1],
  rockArch: [(T) => { const g = new T.TorusGeometry(4, 1.0, 8, 14, Math.PI); g.translate(0, 0, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-0.6, p.getY(i))); return prep(g); },
    { canyon: 1, peaks: 0.8, coast: 0.6, crystal: 0.4 }, 120, { color: 0x3e2c22, roughness: 0.9, flatShading: true }, [0.9, 1.6], 1.2, 5, 'paint:ashTop'],
  spire: [(T) => { const g = new T.ConeGeometry(1.6, 13, 7, 4); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 + 0.25 * Math.sin(y * 1.3))); } g.translate(0, 6.2, 0); return prep(g); },
    { canyon: 2, peaks: 2, core: 1, coast: 0.5 }, 300, { color: 0x2c2420, roughness: 0.9, flatShading: true }, [0.7, 1.4], 1.3, 12, 'paint:ashTop'],
  leaningSlab: [(T) => { const g = new T.BoxGeometry(3.2, 6, 0.9); g.translate(0, 3, 0); g.rotateZ(0.35); return prep(g); },
    { peaks: 1.5, ruins: 1.5, canyon: 1, ashplain: 1 }, 300, { color: 0x34302c, roughness: 0.9, flatShading: true }, [0.7, 1.3], 1.2, 5, 'paint:ashTop'],
  ashDune: [(T) => { const g = new T.SphereGeometry(5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1.6, 0.45, 1); return prep(g); },
    { ashplain: 2, core: 1, caldera: 1 }, 300, { color: 0x4a4644, roughness: 1 }, [0.8, 1.6], 0, 2],
  ventChimney: [(T) => { const g = new T.CylinderGeometry(0.6, 1.4, 4.5, 8, 3, true); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 + 0.15 * Math.sin(p.getY(i) * 3))); g.translate(0, 2.2, 0); return prep(g); },
    { geotherm: 3, core: 1.5, caldera: 1 }, 260, { color: 0x6a5420, roughness: 0.8, emissive: 0x401800, emissiveIntensity: 0.5, side: 2 }, [0.7, 1.5], 0.9, 4],
  ashReeds: [(T, r) => { const ps = []; for (let i = 0; i < 24; i++) { const h = 1.6 + r() * 1.4; const c = new T.ConeGeometry(0.05, h, 3); c.rotateZ((r() - 0.5) * 0.4); c.translate((r() - 0.5) * 2.4, h / 2, (r() - 0.5) * 2.4); ps.push(prep(c)); } return mergeGeometries(ps); },
    { ashplain: 6, coast: 3, geotherm: 3, fungal: 2 }, 1400, { color: 0x8a7a5a, roughness: 1, side: 2 }, [0.9, 1.4], 0, 2.5],
  thornBush: [(T, r) => { const ps = []; for (let i = 0; i < 10; i++) { const c = new T.ConeGeometry(0.08, 1.6, 4); c.translate(0, 0.8, 0); c.rotateZ((r() - 0.5) * 2.2); c.rotateY(r() * 6.3); c.translate(0, 0.4, 0); ps.push(prep(c)); } const b = new T.IcosahedronGeometry(0.9, 0); b.scale(1.2, 0.7, 1.2); b.translate(0, 0.5, 0); ps.push(prep(b)); return mergeGeometries(ps); },
    { canyon: 3, ashplain: 2, peaks: 2, ruins: 2 }, 800, { color: 0x2e2a1a, roughness: 1 }, [0.8, 1.4], 0.6, 1.6],
  ribcage: [(T) => { const ps = [prep(new T.CylinderGeometry(0.25, 0.25, 10, 6).rotateZ(Math.PI / 2).translate(0, 0.6, 0))]; for (let i = 0; i < 7; i++) { const rib = new T.TorusGeometry(2.6 - Math.abs(i - 3) * 0.3, 0.16, 5, 10, Math.PI * 0.9); rib.rotateY(Math.PI / 2); rib.translate(-4 + i * 1.35, 0.4, 0); ps.push(prep(rib)); } return mergeGeometries(ps); },
    { ashplain: 0.5, canyon: 0.6, core: 0.4, caldera: 0.3 }, 80, { color: 0xd0c4a8, roughness: 0.85 }, [0.9, 1.5], 1.2, 3],
  ruinColumn: [(T, r) => { const h = 4 + r() * 3; const g = new T.CylinderGeometry(0.7, 0.8, h, 10); g.translate(0, h / 2, 0); const cap = new T.BoxGeometry(2, 0.5, 2); cap.translate(0, h + 0.25, 0); return mergeGeometries([prep(g), prep(cap)]); },
    { ruins: 5, crystal: 0.4, coast: 0.3 }, 400, { color: 0x8a8274, roughness: 0.9 }, [0.8, 1.2], 0.9, 6],
  ruinWall: [(T, r) => { const ps = []; for (let i = 0; i < 6; i++) { const h = 1 + r() * 3.5; const b = new T.BoxGeometry(1.4, h, 0.8); b.translate(-3.5 + i * 1.4, h / 2, 0); ps.push(prep(b)); } return mergeGeometries(ps); },
    { ruins: 4, peaks: 0.3 }, 300, { color: 0x7a7266, roughness: 0.95, flatShading: true }, [0.8, 1.2], 1.6, 4],
  crystalSpire: [(T) => { const g = new T.OctahedronGeometry(1.4, 0); g.scale(0.8, 5.5, 0.8); g.translate(0, 7, 0); const g2 = new T.OctahedronGeometry(0.8, 0); g2.scale(0.7, 3, 0.7); g2.rotateZ(0.4); g2.translate(1.2, 3, 0.3); return mergeGeometries([prep(g), prep(g2)]); },
    { crystal: 3, caldera: 0.5, peaks: 0.3 }, 300, { color: 0x6ab0e0, roughness: 0.15, emissive: 0x0b4a68, emissiveIntensity: 1, flatShading: true }, [0.7, 1.4], 1.2, 12],
  mushroomClump: [(T, r) => { const ps = []; for (let i = 0; i < 7; i++) { const h = 0.6 + r() * 1.2; const s = new T.CylinderGeometry(0.08, 0.12, h, 5); const c = new T.SphereGeometry(0.35 + r() * 0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); const dx = (r() - 0.5) * 2, dz = (r() - 0.5) * 2; s.translate(dx, h / 2, dz); c.translate(dx, h, dz); ps.push(prep(s), prep(c)); } return mergeGeometries(ps); },
    { fungal: 8, ruins: 1, geotherm: 1 }, 900, { color: 0xc06038, roughness: 0.6, emissive: 0x401004, emissiveIntensity: 0.6 }, [0.8, 1.5], 0, 1.5],
  giantFern: [(T, r) => { const ps = []; for (let i = 0; i < 9; i++) { const f = new T.PlaneGeometry(0.7, 3.2, 1, 3); const p = f.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, -Math.pow((p.getY(k) + 1.6) / 3.2, 2) * 1.2); f.translate(0, 1.6, 0); f.rotateX(-0.5); f.rotateY((i / 9) * Math.PI * 2); ps.push(prep(f)); } return mergeGeometries(ps); },
    { fungal: 5, coast: 2, geotherm: 2, ruins: 2 }, 900, { color: 0x3a6a2a, roughness: 0.9, side: 2 }, [0.9, 1.6], 0, 2.6],
  palm: [(T, r) => { const ps = []; let x = 0; for (let i = 0; i < 6; i++) { const c = new T.CylinderGeometry(0.18, 0.24, 1.4, 6); c.translate(x, 0.7 + i * 1.3, 0); ps.push(prep(c)); x += 0.15; } for (let i = 0; i < 7; i++) { const f = new T.PlaneGeometry(0.9, 3.6, 1, 3); const p = f.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, -Math.pow((p.getY(k) + 1.8) / 3.6, 2) * 1.8); f.translate(0, 1.8, 0); f.rotateX(-1.1); f.rotateY((i / 7) * Math.PI * 2); f.translate(x, 7.8, 0); ps.push(prep(f)); } return mergeGeometries(ps); },
    { coast: 4 }, 500, { color: 0x4a6a2a, roughness: 0.9, side: 2 }, [0.9, 1.3], 0.35, 9, 'paint:palm'],
  driftwoodPile: [(T, r) => { const ps = []; for (let i = 0; i < 6; i++) { const c = new T.CylinderGeometry(0.12, 0.18, 2.5 + r() * 2, 5); c.rotateZ(Math.PI / 2 - 0.2 + r() * 0.4); c.rotateY(r() * 6.3); c.translate((r() - 0.5) * 1.5, 0.2 + i * 0.12, (r() - 0.5) * 1.5); ps.push(prep(c)); } return mergeGeometries(ps); },
    { coast: 3 }, 400, { color: 0x9a8a72, roughness: 1 }, [0.9, 1.3], 0.8, 1.2],
  cairn: [(T, r) => { const ps = []; let y = 0; for (let i = 0; i < 5; i++) { const s = 0.9 - i * 0.14; const g = new T.DodecahedronGeometry(s, 0); g.scale(1.2, 0.6, 1); g.translate((r() - 0.5) * 0.2, y + s * 0.5, 0); ps.push(prep(g)); y += s * 0.9; } return mergeGeometries(ps); },
    { peaks: 1.5, canyon: 1, ashplain: 1, ruins: 1 }, 300, { color: 0x4a423a, roughness: 0.95, flatShading: true }, [0.8, 1.4], 0.7, 3],
  obsidianShard: [(T, r) => { const ps = []; for (let i = 0; i < 4; i++) { const c = new T.OctahedronGeometry(0.8, 0); c.scale(0.6, 2.6 + r() * 1.6, 0.5); c.rotateZ((r() - 0.5) * 0.8); c.translate((r() - 0.5) * 2, 1.2, (r() - 0.5) * 2); ps.push(prep(c)); } return mergeGeometries(ps); },
    { core: 3, caldera: 2, canyon: 1 }, 500, { color: 0x0a0a10, roughness: 0.08, metalness: 0.3, flatShading: true }, [0.8, 1.5], 0.9, 3.5],
};
export function buildExtraGeometries(THREE, seed) {
  const out = {};
  for (const [k, [geo, , , m, , , , paintKind]] of Object.entries(EXTRA_PROPS)) {
    const r = mulberry32(seed + k.length * 97); const g = geo(THREE, r); const c = new THREE.Color(m.color);
    paint(THREE, g, paintKind === 'paint:ashTop' ? ashTop(c.r, c.g, c.b) : paintKind === 'paint:palm' ? (x, y, z, ny, o) => { if (y < 7.6) { o[0] = 0.32; o[1] = 0.24; o[2] = 0.16; } else { o[0] = c.r; o[1] = c.g; o[2] = c.b; } } : solid(c.r, c.g, c.b));
    out[k] = g;
  }
  return out;
}
export function extraMaterial(THREE, k) { const m = EXTRA_PROPS[k][3]; return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: m.roughness ?? 0.9, metalness: m.metalness ?? 0, flatShading: !!m.flatShading, side: m.side === 2 ? THREE.DoubleSide : THREE.FrontSide, emissive: m.emissive ?? 0, emissiveIntensity: m.emissiveIntensity ?? 0 }); }
