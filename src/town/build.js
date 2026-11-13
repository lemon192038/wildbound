// City geometry: terraces, stairs, timber decks, parapets, the Tidebell monument, facilities, houses, props.
// Everything static goes into per-material Buckets (merged later); repeated props are collected for instancing.
import * as THREE from 'three';
import { mulberry32 } from '../world/noise.js';
import { Frame, beam, rod, coneRoof, gablePrism, col, mat4 } from './kit.js';
import { PRIMS, primY, inPrim, SPOTS, STALLS, HOUSES_R1, HOUSES_R2, BLOCKS } from './layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const ROOFS = [0x1cb08a, 0x179c8c, 0x2cbc7c, 0x15928a, 0x22a89c, 0x20b892];
const WALLS = [0xf0e6d0, 0xe8d8bc, 0xddcbad, 0xf3ece0, 0xe4d2b8, 0xd5d9d2, 0xeadfc6];
const SHUT = [0x2f7480, 0x7c3a2c, 0x3d6640, 0x2c4d74, 0x8a6a2a];

export function buildCity(B, ctx) {
  const { low, getHeight, terrainY } = ctx;
  const rnd = mulberry32(2024);
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
  const roofC = () => { const r = rnd(); return col(r < 0.08 ? 0xa65a3c : r < 0.14 ? 0x4c5866 : pick(ROOFS), 0.08, rnd); };
  let simple = false;
  B.emit = []; B.lights = []; B.inst = { crate: [], barrel: [], sack: [], lamp: [] }; B.ropes = []; B.paper = [];
  const stoneC = () => col(pick([0xc4bcae, 0xb6aea2, 0xcabfa8, 0xaea89f]), 0.07, rnd);
  const timberC = () => col(pick([0x6a4a32, 0x5a3d29, 0x765236]), 0.1, rnd);
  const glowWin = () => (rnd() < 0.55 ? col(0xffa860, 0.25, rnd) : [0, 0, 0]);
  B.extraCol = [];
  const crate = (x, y, z, s = 1, ry = 0, solo = true) => { B.inst.crate.push(mat4(x, y + s / 2, z, ry, 0, 0, s, s, s)); if (solo) B.extraCol.push({ x, z, r: 0.6 * s }); };
  const barrel = (x, y, z, s = 1, ry = 0, solo = true) => { B.inst.barrel.push(mat4(x, y, z, ry, 0, 0, s, s, s)); if (solo) B.extraCol.push({ x, z, r: 0.45 * s }); };
  const sack = (x, y, z, s = 1, ry = 0) => B.inst.sack.push(mat4(x, y, z, ry, 0, 0, s, s, s));
  const pile = (x, y, z, n = 5) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = rnd() * 1.2; const t = rnd(); (t < 0.45 ? crate : t < 0.8 ? barrel : sack)(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.7 + rnd() * 0.45, rnd() * 6.28, false); } if (n > 3) crate(x, y + 1.05, z, 0.8, rnd(), false); BLOCKS.push({ c: [x, z], r: 1.7 }); };

  // ---------------- windows / doors ----------------
  function windowAt(f, x, y, z, ry, w = 0.8, h = 1.15, opts = {}) {
    const g = f.sub(x, y, z, ry), tc = opts.tc || timberC();
    g.box(B.glass, w, h, 0.06, 0, 0, 0.03, opts.glow ?? glowWin());
    g.box(B.wood, w + 0.22, h + 0.2, 0.06, 0, 0.02, 0.0, tc); g.box(B.wood, w + 0.3, 0.1, 0.26, 0, -h / 2 - 0.08, 0.08, tc);
    if (!low && !simple) {
      g.box(B.wood, 0.05, h, 0.05, 0, 0, 0.07, tc); g.box(B.wood, w, 0.05, 0.05, 0, 0.1, 0.07, tc);
      if (opts.shutters !== false && rnd() < 0.55) { const sc = col(pick(SHUT), 0.1, rnd); g.box(B.wood, w * 0.52, h, 0.05, -w * 0.8, 0, 0.1, sc, undefined, 0.35); g.box(B.wood, w * 0.52, h, 0.05, w * 0.8, 0, 0.1, sc, undefined, -0.35); }
      if (opts.flowers !== false && rnd() < 0.3) { g.box(B.wood, w + 0.1, 0.22, 0.28, 0, -h / 2 - 0.2, 0.18, tc); const fl = new THREE.IcosahedronGeometry(0.2, 0); for (let i = 0; i < 3; i++) g.put(B.leaf, fl, -w / 2 + 0.15 + i * (w - 0.3) / 2, -h / 2 + 0.0, 0.2, col(pick([0xd04050, 0xe0a030, 0xf0f0f0, 0x9050c0, 0x40a040]), 0.1, rnd)); fl.dispose(); }
    }
  }
  function door(f, x, y, z, ry, w = 1.2, h = 2.2, c) {
    const g = f.sub(x, y, z, ry);
    g.box(B.wood, w, h, 0.12, 0, h / 2, 0.0, c || col(0x5a3a24, 0.1, rnd));
    g.box(B.stone, w + 0.5, 0.3, 0.3, 0, h + 0.15, 0.06, stoneC()); g.box(B.stone, 0.25, h, 0.28, -w / 2 - 0.12, h / 2, 0.05, stoneC()); g.box(B.stone, 0.25, h, 0.28, w / 2 + 0.12, h / 2, 0.05, stoneC());
    g.box(B.metal, 0.08, 0.08, 0.08, w * 0.3, h * 0.45, 0.1, col(0x8a6a30));
  }
  // timber framing over a plaster face (local face frame: x along wall, y up from floor, +z outward)
  function timber(g, W, fh, tc, dense = true) {
    const n = simple ? 2 : Math.max(2, Math.round(W / (dense && !low ? 1.6 : 2.4)));
    for (let i = 0; i <= n; i++) g.box(B.wood, 0.16, fh, 0.1, -W / 2 + (i * W) / n, fh / 2, 0.04, tc);
    g.box(B.wood, W + 0.1, 0.18, 0.12, 0, 0.09, 0.05, tc); g.box(B.wood, W + 0.1, 0.18, 0.12, 0, fh - 0.09, 0.05, tc);
    if (!low && !simple) { g.box(B.wood, W, 0.12, 0.1, 0, fh * 0.32, 0.04, tc); const s = W / n;
      beam(B.wood, g.world(-W / 2, 0.1, 0.05), g.world(-W / 2 + s, fh - 0.1, 0.05), 0.13, tc); beam(B.wood, g.world(W / 2, 0.1, 0.05), g.world(W / 2 - s, fh - 0.1, 0.05), 0.13, tc); }
  }
  // ---------------- house ----------------
  // f: frame at ground centre; front = +z. o: { w, d, floors, groundStone, roof:'gable'|'hip', jetty, chimney, wallC, rc, turret }
  function house(f, o) {
    const w = o.w, d = o.d, floors = o.floors || 2, fh = 2.9, tc = timberC(), wc = o.wallC || col(pick(WALLS), 0.04, rnd), sc = stoneC(), rc = o.rc || roofC();
    f.box(B.stone, w + 0.5, 12.4, d + 0.5, 0, -5.8, 0, sc);
    let y = 0.4; let ww = w, dd = d;
    for (let i = 0; i < floors; i++) {
      if (i > 0 && o.jetty !== false) { dd = d + 0.7; ww = w + (o.jettyX ? 0.7 : 0); f.box(B.wood, ww + 0.2, 0.26, dd + 0.2, 0, y - 0.05, 0, tc); }
      const stone = i === 0 && (o.groundStone ?? rnd() < 0.6);
      f.box(stone ? B.stone : B.plaster, ww, fh, dd, 0, y + fh / 2, 0, stone ? sc : wc);
      const faces = [[0, dd / 2, 0, ww], [0, -dd / 2, PI, ww], [ww / 2, 0, PI / 2, dd], [-ww / 2, 0, -PI / 2, dd]];
      for (const [fx, fz, ry, FW] of faces) {
        if (simple && Math.abs(ry - PI / 2) < 0.1 && FW < 7.5) continue;
        const g = f.sub(fx, y, fz, ry);
        if (!stone) timber(g, FW, fh, tc, i > 0);
        const nw = Math.max(1, Math.floor(FW / 2.3));
        for (let k = 0; k < nw; k++) {
          const wx = -FW / 2 + (k + 0.5) * FW / nw;
          if (i === 0 && ry === 0 && k === Math.floor(nw / 2)) { door(g, wx, 0, 0.02, 0); continue; }
          if (rnd() < 0.15) continue;
          windowAt(g, wx, fh * 0.55, 0.03, 0, 0.75, i === 0 ? 1.0 : 1.15);
        }
      }
      y += fh;
    }
    // roof
    const ov = 0.55, top = y;
    if (o.roof === 'hip') {
      const rh = Math.max(ww, dd) * 0.62, g = coneRoof(1, rh, 4, 2); g.rotateY(PI / 4); g.scale((ww / 2 + ov) * Math.SQRT2, 1, (dd / 2 + ov) * Math.SQRT2);
      f.put(B.roof, g, 0, top + rh / 2 - ov * 0.6, 0, rc, { uv: 'keep' }); g.dispose();
      f.box(B.wood, ww + 0.3, 0.3, dd + 0.3, 0, top + 0.1, 0, tc);
      if (o.finial !== false) f.cyl(B.metal, 0.03, 0.06, 1.4, 0, top + rh + 0.2 - ov * 0.6, 0, col(0x9a7a3a), 6);
    } else {
      const a = (o.pitch || 52) * PI / 180, rh = (dd / 2) * Math.tan(a);
      const at = gablePrism(ww, dd, rh); f.put(B.plaster, at, 0, top, 0, wc); at.dispose();
      const L = (dd / 2 + ov) / Math.cos(a) + 0.1, cz = (dd / 2 + ov) / 2 - 0.05, cy = top + rh / 2 - ov * Math.tan(a) / 2 + 0.12;
      for (const s of [0, PI]) f.sub(0, 0, 0, s).box(B.roof, ww + 2 * ov, 0.2, L, 0, cy, cz, rc, { s: 2 }, 0, a);
      f.box(B.roof, ww + 2 * ov + 0.1, 0.25, 0.42, 0, top + rh + 0.12, 0, rc.map((v) => v * 0.6));
      for (const s of [-1, 1]) { const g = f.sub(s * ww / 2, top, 0, s * PI / 2); beam(B.wood, g.world(0, 0, 0.06), g.world(0, rh - 0.2, 0.06), 0.16, tc); beam(B.wood, g.world(-dd * 0.3, rh * 0.38, 0.06), g.world(dd * 0.3, rh * 0.38, 0.06), 0.14, tc); if (!low) windowAt(g, 0, rh * 0.2, 0.08, 0, 0.6, 0.8, { shutters: false, flowers: false }); }
      if (o.dormer && !low && ww > 6) { const dg = f.sub(ww * 0.22, top + rh * 0.3, dd / 2 - rh * 0.3 / Math.tan(a) + 0.3, 0); dg.box(B.plaster, 1.6, 1.6, 2, 0, 0.6, -0.6, wc); windowAt(dg, 0, 0.6, 0.42, 0, 0.6, 0.8, { shutters: false }); const p = gablePrism(2.2, 2.4, 1.0); p.rotateY(PI / 2); dg.put(B.roof, p, 0, 1.4, -0.5, rc, { s: 2 }); p.dispose(); }
    }
    if (o.chimney !== false && rnd() < 0.8) {
      const cx = (rnd() - 0.5) * ww * 0.6, cz = (rnd() < 0.5 ? -1 : 1) * dd * 0.18, h0 = top - 1, h1 = top + Math.max(ww, dd) * 0.55 + 1.2;
      f.box(B.stone, 0.8, h1 - h0, 0.8, cx, (h0 + h1) / 2, cz, sc); f.box(B.stone, 1.05, 0.22, 1.05, cx, h1, cz, sc.map((v) => v * 0.8));
      const p = f.world(cx, h1 + 0.2, cz); if (rnd() < (o.smoke ?? 0.6)) B.emit.push({ x: p.x, y: p.y, z: p.z, type: 'smoke', rate: 0.6 + rnd() * 0.5 });
    }
    return top;
  }
  // ---------------- round tower ----------------
  function tower(f, o) {
    const r = o.r, h = o.h, sc = o.sc || stoneC(), rc = o.rc || roofC(), seg = low ? 12 : 18;
    f.cyl(B.stone, r, r * 1.08, h + 12, 0, (h - 12) / 2, 0, sc, seg);
    for (const t of [0.35, 0.7]) f.cyl(B.stone, r + 0.12, r + 0.12, 0.35, 0, h * t, 0, sc.map((v) => v * 0.92), seg);
    for (let k = 0; k < (low ? 3 : 5); k++) { const a = k * 2.4 + 0.5, yy = h * (0.25 + 0.15 * k); if (yy > h - 2) break; windowAt(f.sub(Math.sin(a) * (r + 0.02), yy, Math.cos(a) * (r + 0.02), a), 0, 0, 0, 0, 0.55, 1.0, { shutters: false, flowers: false }); }
    // timber gallery under the roof
    const gy = h;
    f.cyl(B.wood, r + 0.7, r + 0.7, 0.3, 0, gy, 0, timberC(), seg);
    f.cyl(B.plaster, r * 0.95, r * 0.95, 2.4, 0, gy + 1.35, 0, col(pick(WALLS), 0.04, rnd), seg);
    const tc = timberC(); for (let k = 0; k < seg; k += 2) { const a = k / seg * PI * 2; f.box(B.wood, 0.14, 2.4, 0.14, Math.sin(a) * (r * 0.95 + 0.04), gy + 1.35, Math.cos(a) * (r * 0.95 + 0.04), tc, undefined, a); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * PI * 2 + 0.4; windowAt(f.sub(Math.sin(a) * (r * 0.95 + 0.03), gy + 1.4, Math.cos(a) * (r * 0.95 + 0.03), a), 0, 0, 0, 0, 0.6, 0.9, { shutters: false, flowers: false }); }
    const rh = o.roofH || r * 2.6, rr = r + 1.0;
    const cg = coneRoof(rr, rh, seg, 2); f.put(B.roof, cg, 0, gy + 2.55 + rh / 2 - 0.2, 0, rc, { uv: 'keep' }); cg.dispose();
    f.cyl(B.metal, 0.04, 0.09, 2.2, 0, gy + 2.4 + rh + 0.9, 0, col(0x9a7a3a), 6);
    if (o.flag) flag(f.world(0, gy + 2.4 + rh + 0.4, 0), o.flag, 2.2);
    return gy + 2.4 + rh;
  }
  function flag(p, c, s = 1.8) {
    rod(B.metal, p, V(p.x, p.y + s * 1.2, p.z), 0.035, col(0x6a5a40));
    const g = new THREE.PlaneGeometry(s, s * 0.55, 6, 2); g.translate(s / 2, 0, 0);
    B.cloth.add(g, mat4(p.x, p.y + s * 0.9, p.z, rnd() * 0.6 - 0.3), col(c, 0.05, rnd), { uv: 'keep', wave: (q) => Math.min(1, q.x / s) * 1.6 + 0.1 }); g.dispose();
  }
  function banner(p, ry, c, w = 1.2, h = 3.2, trim = 0xd8b048) {
    const g = new THREE.PlaneGeometry(w, h, 2, 6); g.translate(0, -h / 2, 0);
    B.cloth.add(g, mat4(p.x, p.y, p.z, ry), col(c), { uv: 'keep', wave: (q) => Math.min(1, -q.y / h) * 0.8 }); g.dispose();
    const t = new THREE.PlaneGeometry(w * 0.45, w * 0.45, 1, 1); t.rotateZ(PI / 4);
    B.cloth.add(t, mat4(p.x, p.y - h * 0.38, p.z, ry).multiply(mat4(0, 0, 0.02)), col(trim), { uv: 'keep', wave: 0.3 }); t.dispose();
    rod(B.wood, V(p.x - Math.cos(ry) * (w / 2 + 0.1), p.y, p.z + Math.sin(ry) * (w / 2 + 0.1)), V(p.x + Math.cos(ry) * (w / 2 + 0.1), p.y, p.z - Math.sin(ry) * (w / 2 + 0.1)), 0.04, col(0x5a3d29));
  }
  function lamp(x, z, y = getHeight(x, z), h = 3.4) {
    const mc = col(0x2a2a2c);
    B.metal.add(new THREE.CylinderGeometry(0.06, 0.1, h, 6), mat4(x, y + h / 2, z), mc);
    B.metal.add(new THREE.BoxGeometry(0.7, 0.06, 0.06), mat4(x + 0.3, y + h - 0.1, z), mc);
    B.metal.add(new THREE.CylinderGeometry(0.02, 0.22, 0.25, 4), mat4(x + 0.55, y + h - 0.12, z, PI / 4), mc);
    B.glass.add(new THREE.BoxGeometry(0.26, 0.38, 0.26), mat4(x + 0.55, y + h - 0.45, z), col(0xffb060));
    B.lampPos = B.lampPos || []; B.lampPos.push(V(x + 0.55, y + h - 0.45, z)); B.extraCol.push({ x, z, r: 0.25 });
  }

  // ---------------- terraces / stairs / decks ----------------
  const blockedAt = (x, z) => BLOCKS.some((b) => (Array.isArray(b) ? x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3] : Math.hypot(x - b.c[0], z - b.c[1]) <= b.r));
  const walkAt = (x, z, y) => PRIMS.some((p) => inPrim(p, x, z) && Math.abs(primY(p, x, z) - y) < 1.0);
  for (const p of PRIMS) {
    const sc = stoneC();
    if (p.kind === 'stone' || p.kind === 'plaza') {
      if (p.circle) {
        B.stone.add(new THREE.CylinderGeometry(p.r, p.r * 1.04, p.y + 12, 28), mat4(p.cx, (p.y - 12) / 2, p.cz), sc);
        B.cobble.add(new THREE.CircleGeometry(p.r - 0.3, 28).rotateX(-PI / 2), mat4(p.cx, p.y + 0.02, p.cz), col(0xd0c8bc));
        B.stone.add(new THREE.TorusGeometry(p.r - 0.15, 0.25, 4, 28).rotateX(PI / 2), mat4(p.cx, p.y, p.cz), sc);
        continue;
      }
      const w = p.x1 - p.x0, d = p.z1 - p.z0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
      B.stone.add(new THREE.BoxGeometry(w, p.y + 12, d), mat4(cx, (p.y - 12) / 2 - 0.01, cz), sc);
      B.cobble.add(new THREE.PlaneGeometry(w, d).rotateX(-PI / 2), mat4(cx, p.y + 0.01, cz), p.kind === 'plaza' ? col(0xe0d6c6) : col(0xcfc6b6, 0.05, rnd), { s: p.kind === 'plaza' ? 2.4 : 2.2 });
      // edges: kerb band, parapets where the drop is real
      const edges = [[p.x0, p.z0, p.x1, p.z0, 0, -1], [p.x1, p.z0, p.x1, p.z1, 1, 0], [p.x1, p.z1, p.x0, p.z1, 0, 1], [p.x0, p.z1, p.x0, p.z0, -1, 0]];
      const sea = p.id === 'quay' || p.id === 'dockyard';
      for (const [ax, az, bx, bz, nx, nz] of edges) {
        const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L; let run = null;
        const flush = (t1) => { if (!run) return; const t0 = run; run = null; const l = t1 - t0; if (l < 0.6) return;
          const mx = ax + dx * (t0 + l / 2) - nx * 0.25, mz = az + dz * (t0 + l / 2) - nz * 0.25, ry = Math.atan2(dx, dz) + PI / 2;
          if (sea) { B.stone.add(new THREE.BoxGeometry(l, 0.35, 0.6), mat4(mx, p.y + 0.12, mz, ry), sc.map((v) => v * 1.08)); return; }
          B.stone.add(new THREE.BoxGeometry(l, 0.95, 0.45), mat4(mx, p.y + 0.47, mz, ry), sc);
          B.stone.add(new THREE.BoxGeometry(l + 0.1, 0.14, 0.6), mat4(mx, p.y + 1.0, mz, ry), sc.map((v) => v * 1.12)); };
        for (let t = 0; t < L; t += 1) {
          const qx = ax + dx * (t + 0.5) + nx * 0.9, qz = az + dz * (t + 0.5) + nz * 0.9;
          const open = walkAt(qx, qz, p.y) || blockedAt(qx, qz);
          if (!open && run === null) run = t; if (open) flush(t);
        }
        flush(L);
      }
    } else if (p.kind === 'stairs' || p.kind === 'wstairs') {
      const ax = p.axis, A0 = p.a0, A1 = p.a1, len = Math.abs(A1 - A0), n = Math.max(2, Math.round(len / 0.42)), dir = Math.sign(A1 - A0);
      const W = ax === 'x' ? p.z1 - p.z0 : p.x1 - p.x0, cW = ax === 'x' ? (p.z0 + p.z1) / 2 : (p.x0 + p.x1) / 2, rise = (p.y0 - p.y1) / n;
      const wood = p.kind === 'wstairs', tc = timberC();
      for (let k = 0; k < n; k++) {
        const a = A0 + dir * (k + 0.5) * len / n, yt = p.y0 - (k + 0.5) * rise + rise * 0.3, sl = len / n + 0.02;
        const [x, z] = ax === 'x' ? [a, cW] : [cW, a];
        if (wood) { B.wood.add(new THREE.BoxGeometry(ax === 'x' ? sl : W, 0.12, ax === 'x' ? W : sl), mat4(x, yt - 0.06, z), tc, { s: 2 }); }
        else { const hh = yt - (Math.min(p.y0, p.y1) - 3); B.stone.add(new THREE.BoxGeometry(ax === 'x' ? sl : W, hh, ax === 'x' ? W : sl), mat4(x, yt - hh / 2, z), sc, { s: 2.5 }); }
      }
      // side parapets / rails
      for (const s of [-1, 1]) {
        const off = cW + s * (W / 2 - 0.22); const P0 = ax === 'x' ? V(A0, p.y0 + 0.5, off) : V(off, p.y0 + 0.5, A0), P1 = ax === 'x' ? V(A1, p.y1 + 0.5, off) : V(off, p.y1 + 0.5, A1);
        if (wood) {
          for (let k = 0; k <= 4; k++) { const t = k / 4, P = P0.clone().lerp(P1, t); B.wood.add(new THREE.BoxGeometry(0.14, 1.6, 0.14), mat4(P.x, P.y - 0.0, P.z), tc); B.wood.add(new THREE.BoxGeometry(0.22, 6, 0.22), mat4(P.x, P.y - 3.8, P.z), tc); }
          beam(B.wood, P0.clone().setY(P0.y + 0.55), P1.clone().setY(P1.y + 0.55), 0.1, tc);
          beam(B.wood, P0.clone().setY(P0.y - 0.6), P1.clone().setY(P1.y - 0.6), 0.3, tc, undefined, 0.12);
        } else {
          const D = new THREE.Vector3().subVectors(P1, P0); const L = D.length();
          const g = new THREE.BoxGeometry(0.45, 1.0, L); const m = new THREE.Matrix4().lookAt(P1, P0, V(0, 1, 0)); m.setPosition(P0.clone().add(P1).multiplyScalar(0.5).setY((P0.y + P1.y) / 2 - 0.05));
          B.stone.add(g, m, sc); g.dispose();
          B.stone.add(new THREE.BoxGeometry(0.7, 1.6, 0.7), mat4(P0.x, P0.y + 0.3, P0.z), sc.map((v) => v * 1.1));
          B.stone.add(new THREE.BoxGeometry(0.7, 1.6, 0.7), mat4(P1.x, P1.y + 0.3, P1.z), sc.map((v) => v * 1.1));
        }
      }
      if (!wood) {
        // solid side walls under the flight, down into the embankment
        for (const s of [-1, 1]) {
          const off = cW + s * (W / 2 - 0.22); const hi = Math.max(p.y0, p.y1), lo = Math.min(p.y0, p.y1) - 4;
          const g = new THREE.BoxGeometry(ax === 'x' ? len : 0.46, hi - lo, ax === 'x' ? 0.46 : len);
          const P = g.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) > 0) { const a = (ax === 'x' ? P.getX(i) : P.getZ(i)) + (A0 + A1) / 2; const t = (a - A0) / (A1 - A0); P.setY(i, (hi - lo) / 2 - (hi - (p.y0 + (p.y1 - p.y0) * t)) - 0.05); }
          g.computeVertexNormals(); const [x, z] = ax === 'x' ? [(A0 + A1) / 2, off] : [off, (A0 + A1) / 2];
          B.stone.add(g, mat4(x, (hi + lo) / 2, z), sc); g.dispose();
        }
      }
      if (rnd() < 2) { const [x, z] = ax === 'x' ? [A0, cW + W / 2 + 0.6] : [cW + W / 2 + 0.8, A0]; lamp(x, z, p.y0); }
    } else if (p.kind === 'deck') {
      const w = p.x1 - p.x0, d = p.z1 - p.z0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, tc = timberC(), dc = col(0x8a7058, 0.06, rnd);
      B.wood.add(new THREE.BoxGeometry(w, 0.22, d), mat4(cx, p.y - 0.11, cz), dc, { s: 2.2 });
      const along = d > w ? 'z' : 'x', Lg = Math.max(w, d), Sh = Math.min(w, d);
      const nP = Math.ceil(Lg / 3);
      for (let i = 0; i <= nP; i++) for (const s of [-1, 1]) {
        const t = -Lg / 2 + i * Lg / nP; const [x, z] = along === 'z' ? [cx + s * (Sh / 2 - 0.2), cz + t] : [cx + t, cz + s * (Sh / 2 - 0.2)];
        B.wood.add(new THREE.CylinderGeometry(0.2, 0.24, p.y + 8, 7), mat4(x, (p.y - 8) / 2 - 0.2, z), tc.map((v) => v * 0.75), { s: 2 });
        if (i % 2 === 0) B.wood.add(new THREE.BoxGeometry(along === 'z' ? Sh : 0.25, 0.3, along === 'z' ? 0.25 : Sh), mat4(along === 'z' ? cx : x, p.y - 0.42, along === 'z' ? z : cz), tc);
        if (p.id !== 'viewDeck' && i % 2 === 1 && rnd() < 0.8) B.metal.add(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 8), mat4(x, p.y + 0.27, z), col(0x2a2826));
      }
      for (const s of [-1, 1]) { const [x, z] = along === 'z' ? [cx + s * (Sh / 2 - 0.15), cz] : [cx, cz + s * (Sh / 2 - 0.15)]; B.wood.add(new THREE.BoxGeometry(along === 'z' ? 0.3 : Lg, 0.4, along === 'z' ? Lg : 0.3), mat4(x, p.y - 0.4, z), tc); }
      if (p.id === 'viewDeck') { // railing on the open sides
        const rail = (A, Bp) => { beam(B.wood, A.clone().setY(p.y + 1.05), Bp.clone().setY(p.y + 1.05), 0.12, tc); const L = A.distanceTo(Bp); for (let t = 0; t <= L; t += 1.6) { const P = A.clone().lerp(Bp, t / L); B.wood.add(new THREE.BoxGeometry(0.12, 1.1, 0.12), mat4(P.x, p.y + 0.55, P.z), tc); } };
        rail(V(p.x0 + 0.5, 0, p.z0 + 0.2), V(p.x1 - 0.2, 0, p.z0 + 0.2)); rail(V(p.x1 - 0.2, 0, p.z0 + 0.2), V(p.x1 - 0.2, 0, p.z1 - 0.2)); rail(V(p.x1 - 0.2, 0, p.z1 - 0.2), V(p.x0 + 0.5, 0, p.z1 - 0.2));
        lamp(p.x1 - 0.6, p.z1 - 0.6, p.y);
      }
    }
  }

  // ---------------- plaza: the Tidebell — leviathan jaw-ribs over a fountain, bronze bell at the crown ----------------
  {
    const cx = 0, cz = 1, y = 8, sc = col(0xc8bfb0);
    B.stone.add(new THREE.CylinderGeometry(5.2, 5.4, 0.9, 32), mat4(cx, y + 0.45, cz), sc);
    B.stone.add(new THREE.TorusGeometry(5.0, 0.3, 6, 32).rotateX(PI / 2), mat4(cx, y + 0.95, cz), sc.map((v) => v * 1.1));
    B.water = { x: cx, z: cz, r: 4.75, y: y + 0.78 };
    B.stone.add(new THREE.CylinderGeometry(1.1, 1.5, 3.2, 12), mat4(cx, y + 2.2, cz), sc);
    B.stone.add(new THREE.CylinderGeometry(2.0, 1.2, 0.5, 16), mat4(cx, y + 3.9, cz), sc);
    B.metal.add(new THREE.CylinderGeometry(1.0, 0.55, 0.8, 14, 1, true), mat4(cx, y + 4.5, cz), col(0x8a6a3a));
    B.glow.add(new THREE.CircleGeometry(0.95, 14).rotateX(-PI / 2), mat4(cx, y + 4.75, cz), [3.2, 1.4, 0.4]);
    B.emit.push({ x: cx, y: y + 4.9, z: cz, type: 'fire', rate: 1 }); B.lights.push({ p: V(cx, y + 6, cz), c: 0xff9a4a, i: 22, d: 18 });
    const n = 8, bone = col(0xe8dcc0);
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) / n * PI * 2, r0 = 7.4;
      const pts = [V(Math.sin(a) * r0, y - 0.5, Math.cos(a) * r0), V(Math.sin(a) * (r0 + 1.6), y + 7, Math.cos(a) * (r0 + 1.6)), V(Math.sin(a) * 4, y + 15.5, Math.cos(a) * 4), V(Math.sin(a + 0.25) * 1.3, y + 17.5, Math.cos(a + 0.25) * 1.3)];
      const curve = new THREE.CatmullRomCurve3(pts);
      const g = new THREE.TubeGeometry(curve, low ? 10 : 18, 0.5, low ? 6 : 8);
      const P = g.attributes.position; const tmp = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) { tmp.fromBufferAttribute(P, i); const t = Math.floor(i / ((low ? 6 : 8) + 1)) / (low ? 10 : 18); const c = curve.getPoint(t); tmp.sub(c).multiplyScalar(1.15 - 0.75 * t + 0.08 * Math.sin(t * 40)); P.setXYZ(i, c.x + tmp.x + cx, c.y + tmp.y, c.z + tmp.z + cz); }
      g.computeVertexNormals(); B.plaster.add(g, null, bone, { s: 2 }); g.dispose();
      B.stone.add(new THREE.CylinderGeometry(0.9, 1.1, 1.0, 10), mat4(cx + Math.sin(a) * r0, y + 0.5, cz + Math.cos(a) * r0), sc);
      BLOCKS.push({ c: [cx + Math.sin(a) * r0, cz + Math.cos(a) * r0], r: 1.0 });
    }
    // crown ring + bell
    B.metal.add(new THREE.TorusGeometry(1.6, 0.18, 6, 20).rotateX(PI / 2), mat4(cx, y + 17.6, cz), col(0xb08840));
    B.metal.add(new THREE.CylinderGeometry(0.06, 0.06, 2, 6), mat4(cx, y + 16.6, cz), col(0x3a3a3a));
    const bell = new THREE.LatheGeometry([[0, 1.6], [0.35, 1.55], [0.6, 1.3], [0.75, 0.6], [1.0, 0.1], [1.15, 0]].map(([r, h]) => new THREE.Vector2(r, h)), 16);
    B.metal.add(bell, mat4(cx, y + 14, cz), col(0xb5853a)); bell.dispose();
    // cobbled rosette around the fountain
    B.stone.add(new THREE.RingGeometry(5.4, 9.2, 40, 1).rotateX(-PI / 2), mat4(cx, y + 0.025, cz), col(0x9a948a));
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; lamp(cx + Math.sin(a) * 11, cz + Math.cos(a) * 11, y); }
  }
  // plaza notice boards + benches + planters
  {
    const y = 8;
    for (let k = 0; k < 4; k++) { const a = k * PI / 2; const L = k % 2 ? 9 : 6.5, r0 = 9.2; B.stone.add(new THREE.PlaneGeometry(2.2, L).rotateX(-PI / 2), mat4(Math.sin(a) * (r0 + L / 2), y + 0.03, 1 + Math.cos(a) * (r0 + L / 2), a), col(0x8a847a), { s: 1.6 }); }
    B.stone.add(new THREE.RingGeometry(9.2, 9.9, 48, 1).rotateX(-PI / 2), mat4(0, y + 0.03, 1), col(0x6e6a64));
    for (const [x, z, c] of [[-17, -13, 0x1f3f78], [17, -13, 0xb83a30], [-17, 15.2, 0xb83a30], [17, 15.2, 0x1f3f78]]) {
      B.metal.add(new THREE.CylinderGeometry(0.08, 0.12, 9, 6), mat4(x, y + 4.5, z), col(0x3a3530)); B.metal.add(new THREE.SphereGeometry(0.18, 6, 4), mat4(x, y + 9.1, z), col(0xb08840));
      const g = new THREE.PlaneGeometry(1.1, 4.2, 2, 6); g.translate(0.62, -2.1, 0); B.cloth.add(g, mat4(x, y + 8.6, z, x < 0 ? -0.6 : PI + 0.6), col(c), { uv: 'keep', wave: (q) => -q.y / 4.2 * 0.9 }); g.dispose();
      B.extraCol.push({ x, z, r: 0.2 });
    }
    for (const [x, z, ry] of [[-6, -12, 0.3], [9, 14.5, 2.0]]) { const f = Frame.at(x, y, z, ry), tc = timberC(); f.box(B.wood, 1.4, 0.5, 2.2, 0, 0.75, 0, tc); for (const s of [-1, 1]) { const w = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10); w.rotateZ(PI / 2); f.put(B.wood, w, s * 0.75, 0.45, 0, col(0x4a3426)); w.dispose(); } f.box(B.wood, 0.08, 0.08, 1.6, 0, 0.6, 1.8, tc, undefined, 0, -0.3); for (let i = 0; i < 3; i++) f.box(B.plaster, 0.4, 0.35, 0.4, -0.35 + i * 0.35, 1.15, (rnd() - 0.5) * 1.2, col(pick([0xc8b48a, 0xa04030, 0x6a8a3a]))); BLOCKS.push({ c: [x, z], r: 1.3 }); }
    for (const [x, z, ry] of [[-15.5, -6, PI / 2], [15.5, 9, -PI / 2]]) {
      const f = Frame.at(x, y, z, ry), tc = timberC();
      f.box(B.wood, 0.18, 2.6, 0.18, -1.3, 1.3, 0, tc); f.box(B.wood, 0.18, 2.6, 0.18, 1.3, 1.3, 0, tc);
      f.box(B.wood, 2.6, 1.5, 0.1, 0, 1.6, 0, col(0x7a5a3a)); f.box(B.roof, 3.2, 0.12, 0.9, 0, 2.6, 0, roofC(), undefined, 0, -0.3);
      for (let i = 0; i < 7; i++) f.box(B.plaster, 0.35 + rnd() * 0.25, 0.4 + rnd() * 0.3, 0.02, -1.0 + (i % 4) * 0.66 + rnd() * 0.1, 1.25 + Math.floor(i / 4) * 0.62, 0.07, col(pick([0xf4ecd6, 0xe9dcb8, 0xf2e2c0]), 0.05, rnd), undefined, 0, 0, (rnd() - 0.5) * 0.2);
    }
    for (const [x, z, ry] of [[-12, 10, 0], [12, -10, PI], [-12, -9, PI], [12, 12, 0]]) {
      const f = Frame.at(x, y, z, ry), tc = timberC();
      f.box(B.wood, 2.2, 0.1, 0.5, 0, 0.5, 0, tc); f.box(B.wood, 2.2, 0.5, 0.08, 0, 0.85, -0.25, tc);
      f.box(B.stone, 0.3, 0.45, 0.45, -0.9, 0.22, 0, stoneC()); f.box(B.stone, 0.3, 0.45, 0.45, 0.9, 0.22, 0, stoneC());
      BLOCKS.push({ c: [x, z], r: 1.15 });
    }
    for (const [x, z] of [[-16.5, 14.5], [16.5, 14.5], [-16.5, -12.5], [16.5, -12.5]]) { BLOCKS.push({ c: [x, z], r: 1.1 }); B.stone.add(new THREE.CylinderGeometry(1.0, 0.9, 0.8, 10), mat4(x, y + 0.4, z), stoneC()); tree(x, y + 0.6, z, 0.8); }
  }

  // ---------------- Hunters' Guild ----------------
  {
    const y = 8, f = Frame.at(0, y, 33, PI), sc = col(0xc2b8a6), rc = col(0x2a8ea0), wc = col(0xefe5d0), tc = col(0x553a26);
    // great hall: stone ground storey with arcade, timbered upper, huge gable roof (ridge along x), front cross-gable
    f.box(B.stone, 27, 12.6, 19, 0, -5.9, 0, sc);
    f.box(B.stone, 26, 5.2, 18, 0, 3.0, 0, sc);
    f.box(B.plaster, 26.6, 4.2, 18.6, 0, 7.7, 0, wc);
    for (const [fx, fz, ry, FW] of [[0, 9.3, 0, 26.6], [0, -9.3, PI, 26.6], [13.3, 0, PI / 2, 18.6], [-13.3, 0, -PI / 2, 18.6]]) { const g = f.sub(fx, 5.6, fz, ry); timber(g, FW, 4.2, tc, true); for (let k = 0; k < 6; k++) windowAt(g, -FW / 2 + (k + 0.5) * FW / 6, 2.2, 0.05, 0, 0.9, 1.6, { tc, glow: col(0xffa860, 0.2, rnd) }); }
    // arcade arches on the front
    const fg = f.sub(0, 0.4, 9.02, 0);
    for (let k = -3; k <= 3; k++) { if (k === 0) continue; fg.box(B.glass, 2.0, 3.2, 0.05, k * 3.4, 2.0, 0.02, col(0xffa860, 0.3, rnd).map((v) => v * 3)); fg.box(B.stone, 0.6, 4.4, 0.5, k * 3.4 - 1.5, 2.2, 0.2, sc.map((v) => v * 1.1)); fg.box(B.stone, 0.6, 4.4, 0.5, k * 3.4 + 1.5, 2.2, 0.2, sc.map((v) => v * 1.1)); const ar = new THREE.TorusGeometry(1.2, 0.28, 4, 10, PI); fg.put(B.stone, ar, k * 3.4, 3.6, 0.2, sc.map((v) => v * 1.15)); ar.dispose(); }
    // entrance portal behind the counter
    fg.box(B.wood, 3.4, 4.2, 0.1, 0, 2.1, 0.02, col(0x4a3020)); fg.box(B.stone, 4.6, 0.8, 0.7, 0, 4.6, 0.3, sc.map((v) => v * 1.15));
    { const d = new THREE.CylinderGeometry(1.1, 1.1, 0.16, 20).rotateX(PI / 2); f.put(B.metal, d, 0, 8.3, 9.4, col(0xb08840)); d.dispose(); }
    const roofTop = 9.8, a = 50 * PI / 180, rh = 9.3 * Math.tan(a);
    const at = gablePrism(26.6, 18.6, rh); f.put(B.plaster, at, 0, roofTop, 0, wc); at.dispose();
    const L = (9.3 + 0.8) / Math.cos(a) + 0.1;
    for (const s of [0, PI]) f.sub(0, 0, 0, s).box(B.roof, 28.2, 0.3, L, 0, roofTop + rh / 2 - 0.8 * Math.tan(a) / 2 + 0.15, (9.3 + 0.8) / 2 - 0.05, rc, { s: 2.4 }, 0, a);
    f.box(B.roof, 28.4, 0.35, 0.6, 0, roofTop + rh + 0.15, 0, rc.map((v) => v * 0.6));
    // dormers on the big roof
    for (const dx of [-8, 8]) { const dg = f.sub(dx, roofTop + 3, 9.3 - 3 / Math.tan(a) + 1.0, 0); dg.box(B.plaster, 2.6, 2.6, 3, 0, 1.0, -0.8, wc); windowAt(dg, 0, 1.0, 0.72, 0, 1.0, 1.4, { shutters: false, tc }); const p = gablePrism(3.4, 3.4, 1.6); p.rotateY(PI / 2); dg.put(B.roof, p, 0, 2.3, -0.6, rc); p.dispose(); }
    // front cross-gable tower block over the portal
    const cg = f.sub(0, 0, 9.0, 0);
    cg.box(B.plaster, 7, 6, 2.2, 0, 13.0, 0, wc); timber(cg.sub(0, 10, 1.11, 0), 7, 6, tc, true); windowAt(cg, 0, 13.4, 1.15, 0, 1.6, 2.2, { shutters: false, tc, glow: col(0xffb070) });
    const p2 = gablePrism(2.6, 8, 4); p2.rotateY(PI / 2); cg.put(B.roof, p2, 0, 16, -0.2, rc, { s: 2 }); p2.dispose();
    // corner towers with tall cone roofs
    for (const sx of [-1, 1]) tower(Frame.at(sx * 14.2, y, 24.8, 0), { r: 2.8, h: 16, rc: col(0x2a8ea0), flag: 0x1f4a7a });
    tower(Frame.at(-9, y, 41, 0), { r: 3.4, h: 22, rc: col(0x2a8ea0), flag: 0xb03030, roofH: 10 });
    // banners between arches
    for (const k of [-1.5, 1.5]) banner(V(k * 3.4 * 2, y + 9.3, 23.7), 0, 0x1f3f78, 1.4, 4.2);
    // porch canopy + counter
    const pf = Frame.at(0, y, 0, 0);
    for (const x of [-6.5, -2.2, 2.2, 6.5]) { pf.box(B.wood, 0.3, 4.0, 0.3, x, 2.0, 16.6, tc); pf.box(B.stone, 0.5, 0.4, 0.5, x, 0.2, 16.6, sc); }
    pf.box(B.wood, 14, 0.35, 0.35, 0, 4.0, 16.6, tc);
    pf.box(B.roof, 14.6, 0.18, 8.2, 0, 4.9, 20.2, rc, { s: 2 }, 0, -0.22);
    for (const x of [-6.5, -2.2, 2.2, 6.5]) beam(B.wood, V(x, y + 3.2, 16.6), V(x, y + 4.0, 17.6), 0.18, tc);
    const cf = Frame.at(0, y, 20.1, 0);
    cf.box(B.wood, 9, 1.05, 1.0, 0, 0.52, 0, col(0x6a4a30)); cf.box(B.wood, 9.4, 0.12, 1.25, 0, 1.1, 0, col(0x8a6a48));
    for (let i = 0; i < 6; i++) cf.box(B.plaster, 0.3, 0.02, 0.4, -3.5 + i * 1.3, 1.17, (rnd() - 0.5) * 0.4, col(0xf2e6c8), undefined, rnd() - 0.5);
    cf.box(B.metal, 0.3, 0.22, 0.3, 3.8, 1.27, 0, col(0xb08840)); cf.box(B.glow, 0.1, 0.12, 0.1, 3.8, 1.43, 0, [3, 1.6, 0.6]);
    B.lights.push({ p: V(0, y + 3.2, 19), c: 0xffb070, i: 10, d: 10 });
    // quest boards
    for (const sx of [-1, 1]) {
      const qb = Frame.at(sx * 9.7, y, 17.1, 0);
      qb.box(B.wood, 0.22, 3.0, 0.22, -1.4, 1.5, 0, tc); qb.box(B.wood, 0.22, 3.0, 0.22, 1.4, 1.5, 0, tc);
      qb.box(B.wood, 2.9, 1.9, 0.12, 0, 1.75, 0, col(0x6e4e32)); qb.box(B.roof, 3.5, 0.14, 1.0, 0, 3.05, 0, rc, undefined, 0, -0.3);
      for (let i = 0; i < 12; i++) qb.box(B.plaster, 0.32 + rnd() * 0.25, 0.4 + rnd() * 0.25, 0.02, -1.15 + (i % 5) * 0.58 + rnd() * 0.08, 1.15 + Math.floor(i / 5) * 0.55, -0.08, col(pick([0xf4ecd6, 0xe9dcb8, 0xf0dcb0, 0xe6c8a0]), 0.04, rnd), undefined, 0, 0, (rnd() - 0.5) * 0.25);
      qb.box(B.cloth, 0.06, 0.06, 0.06, 0, 0, 0, [1, 1, 1]);
    }
    lamp(-7.5, 16.2, y); lamp(7.5, 16.2, y);
  }

  // ---------------- Forge ----------------
  {
    const y = 8, f = Frame.at(40, y, 9.5, -PI / 2); // local +z = world -x (front faces the yard)
    const sc = col(0x9c968e), rc = col(0x2b7d88), tc = col(0x4e3524);
    f.box(B.stone, 18, 12.4, 12.5, 0, -6, 0, sc);
    f.box(B.stone, 18, 4.6, 0.8, 0, 2.7, -5.8, sc); // back wall
    f.box(B.stone, 0.9, 4.6, 12, -8.6, 2.7, 0, sc); f.box(B.stone, 0.9, 4.6, 12, 8.6, 2.7, 0, sc);
    for (const x of [-8.6, -4.4, 4.4, 8.6]) f.box(B.stone, 1.0, 4.8, 1.0, x, 2.8, 5.6, sc.map((v) => v * 1.1));
    f.box(B.wood, 18.4, 0.6, 0.6, 0, 5.3, 5.6, tc);
    f.box(B.plaster, 18, 2.4, 12, 0, 6.8, -0.2, col(0xd8ccb4)); timber(f.sub(0, 5.6, 5.8, 0), 18, 2.4, tc, true);
    const rh = 6.1 * Math.tan(0.85); const at = gablePrism(18, 12.2, rh); f.put(B.plaster, at, 0, 8.0, -0.2, col(0xd8ccb4)); at.dispose();
    for (const s of [0, PI]) f.sub(0, 0, -0.2, s).box(B.roof, 19.4, 0.22, (6.1 + 0.7) / Math.cos(0.85), 0, 8.0 + rh / 2 - 0.4, (6.1 + 0.7) / 2 - 0.05, rc, { s: 2 }, 0, 0.85);
    f.box(B.roof, 19.6, 0.3, 0.5, 0, 8.0 + rh + 0.12, -0.2, rc.map((v) => v * 0.6));
    // furnace + great chimney
    const fur = f.sub(-3, 0, -3.2, 0);
    fur.box(B.stone, 4.2, 3.2, 3.2, 0, 1.6, 0, col(0x7a726a)); fur.box(B.glow, 1.6, 1.0, 0.1, 0, 1.2, 1.62, [4, 1.3, 0.25]); fur.box(B.stone, 2.2, 0.3, 0.4, 0, 1.85, 1.65, col(0x5a524a));
    fur.box(B.stone, 2.4, 22, 2.4, 0, 13, -0.4, col(0x8a8279)); fur.box(B.stone, 3.0, 0.5, 3.0, 0, 24.2, -0.4, col(0x6a645e));
    for (const t of [8, 14, 20]) fur.box(B.metal, 2.6, 0.2, 2.6, 0, t, -0.4, col(0x3a3532));
    let p = fur.world(0, 24.6, -0.4); B.emit.push({ x: p.x, y: p.y, z: p.z, type: 'fire', rate: 1.4 }, { x: p.x, y: p.y + 1, z: p.z, type: 'blacksmoke', rate: 1.5 });
    p = fur.world(0, 1.2, 2.4); B.lights.push({ p, c: 0xff6a20, i: 40, d: 16, flicker: 1 }); B.emit.push({ x: p.x, y: p.y + 0.2, z: p.z, type: 'embers', rate: 0.6 });
    // second tall iron stack (flame-capped)
    const st = f.sub(6, 0, -4.5, 0);
    st.cyl(B.metal, 0.55, 0.7, 26, 0, 13, 0, col(0x3a3634), 10); st.cyl(B.metal, 0.85, 0.6, 1.4, 0, 26.6, 0, col(0x2c2a28), 10);
    for (const t of [6, 12, 18, 24]) st.cyl(B.metal, 0.75, 0.75, 0.3, 0, t, 0, col(0x6a5a40), 10);
    p = st.world(0, 27.4, 0); B.emit.push({ x: p.x, y: p.y, z: p.z, type: 'fire', rate: 1 }, { x: p.x, y: p.y + 0.8, z: p.z, type: 'blacksmoke', rate: 1 });
    // bellows, racks, anvil, quench trough, grindstone, coal
    const bl = f.sub(-6.3, 0, -3, 0); bl.box(B.wood, 1.4, 0.4, 2.2, 0, 1.2, 0, tc); bl.box(B.plaster, 1.3, 0.6, 2.0, 0, 1.7, 0, col(0x5a3a28));
    const [ax, az] = SPOTS.smith.anvil;
    B.wood.add(new THREE.CylinderGeometry(0.45, 0.5, 0.65, 10), mat4(ax, y + 0.32, az), col(0x5a3d29));
    const anv = Frame.at(ax, y + 0.65, az, 0); anv.box(B.metal, 0.5, 0.25, 0.9, 0, 0.12, 0, col(0x2e2e30)); anv.box(B.metal, 0.3, 0.3, 0.6, 0, 0.38, 0, col(0x3a3a3c)); anv.box(B.metal, 0.6, 0.22, 1.1, 0, 0.62, 0, col(0x4a4a4e));
    const nose = new THREE.ConeGeometry(0.11, 0.5, 6); nose.rotateX(PI / 2); anv.put(B.metal, nose, 0, 0.66, 0.78, col(0x4a4a4e)); nose.dispose();
    B.anvilTop = V(ax, y + 1.4, az);
    // quench trough
    const qt = Frame.at(32.5, y, 3.2, 0); qt.box(B.wood, 2.0, 0.8, 1.0, 0, 0.4, 0, tc); qt.box(B.glass, 1.8, 0.05, 0.8, 0, 0.75, 0, [0.02, 0.05, 0.06]);
    // weapon rack
    const wr = Frame.at(26, y, 2.6, 0); wr.box(B.wood, 3.6, 0.15, 0.3, 0, 1.6, 0, tc); wr.box(B.wood, 0.15, 1.8, 0.15, -1.7, 0.9, 0, tc); wr.box(B.wood, 0.15, 1.8, 0.15, 1.7, 0.9, 0, tc);
    for (let i = 0; i < 6; i++) { wr.box(B.metal, 0.08, 1.6, 0.02, -1.4 + i * 0.55, 1.0, 0.12, col(0xb0b4b8), undefined, 0, 0, 0.1); wr.box(B.metal, 0.3, 0.05, 0.06, -1.4 + i * 0.55, 1.75, 0.12, col(0x8a6a30)); }
    // grindstone
    B.stone.add(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 14).rotateZ(PI / 2), mat4(22.5, y + 0.9, 13), col(0xa09a90)); B.wood.add(new THREE.BoxGeometry(0.9, 0.6, 0.5), mat4(22.5, y + 0.3, 13), tc);
    pile(32.6, y, 16.2, 4); pile(20.5, y, 3.8, 4); barrel(33.2, y, 13.6, 1);
    // hanging sign
    const hs = Frame.at(33.4, y + 5.2, 4.4, -PI / 2); hs.box(B.metal, 0.06, 0.06, 1.4, 0, 0, -0.6, col(0x2a2a2a)); hs.box(B.wood, 1.0, 0.7, 0.06, 0, -0.5, -0.9, tc); hs.box(B.metal, 0.55, 0.12, 0.08, 0, -0.45, -0.9, col(0x9a9ea2));
    lamp(19.5, 16.8, y);
  }

  // ---------------- Alchemy atelier ----------------
  {
    const y = 11, f = Frame.at(-39.5, y, 4, PI / 2), rc = col(0x3a9a8a), wc = col(0xe6dcc8), tc = col(0x4a3324), sc = col(0xb2aa9c);
    // main 2-storey (front = +x), with open bay in the middle third
    f.box(B.stone, 18.5, 12.4, 9.5, 0, -6, 0, sc);
    for (const [cx, W] of [[-6.4, 5.6], [6.4, 5.6]]) { f.box(B.stone, W, 3.2, 9, cx, 2.0, 0, sc); for (let k = 0; k < 2; k++) windowAt(f.sub(cx, 0.4, 4.5, 0), -W / 4 + k * W / 2, 1.8, 0.02, 0, 0.8, 1.2, { tc }); }
    f.box(B.stone, 7.2, 3.2, 1.0, 0, 2.0, -4.0, sc);
    for (const x of [-3.5, 3.5]) f.box(B.wood, 0.35, 3.2, 0.35, x, 2.0, 4.4, tc);
    f.box(B.plaster, 18, 3.0, 9.6, 0, 5.1, 0, wc); for (const [fx, fz, ry, FW] of [[0, 4.8, 0, 18], [0, -4.8, PI, 18]]) { const g = f.sub(fx, 3.6, fz, ry); timber(g, FW, 3.0, tc, true); for (let k = 0; k < 5; k++) windowAt(g, -FW / 2 + (k + 0.5) * FW / 5, 1.6, 0.05, 0, 0.8, 1.1, { tc, glow: col(0x7affc0, 0.3, rnd) }); }
    const rh = 4.8 * Math.tan(0.95); const at = gablePrism(18, 9.6, rh); f.put(B.plaster, at, 0, 6.6, 0, wc); at.dispose();
    for (const s of [0, PI]) f.sub(0, 0, 0, s).box(B.roof, 19.2, 0.2, (4.8 + 0.6) / Math.cos(0.95), 0, 6.6 + rh / 2 - 0.35, (4.8 + 0.6) / 2 - 0.05, rc, { s: 2 }, 0, 0.95);
    f.box(B.roof, 19.4, 0.25, 0.42, 0, 6.6 + rh + 0.1, 0, rc.map((v) => v * 0.6));
    // round glass-domed observatory tower at the back corner
    const tw = Frame.at(-42, y, -4.5, 0);
    tw.cyl(B.stone, 3.0, 3.2, 26, 0, 1, 0, sc, 16);
    tw.cyl(B.metal, 3.15, 3.15, 0.3, 0, 14.1, 0, col(0x8a6a3a), 16);
    const dome = new THREE.SphereGeometry(3.0, 16, 8, 0, PI * 2, 0, PI / 2); tw.put(B.glass, dome, 0, 14.2, 0, col(0x30ffb0, 0, rnd).map((v) => v * 0.5)); dome.dispose();
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; const g = new THREE.TorusGeometry(3.02, 0.05, 3, 12, PI / 2); tw.put(B.metal, g, 0, 14.2, 0, col(0x8a6a3a), undefined, a, 0, 0); g.dispose(); }
    tw.cyl(B.metal, 0.05, 0.1, 2.4, 0, 18.2, 0, col(0x9a7a3a), 6);
    B.lights.push({ p: tw.world(0, 15.5, 0), c: 0x60ffc0, i: 8, d: 10 });
    // counter + apparatus in the open bay
    const cf = Frame.at(-33.3, y, 3, 0);
    cf.box(B.wood, 0.9, 1.05, 6, 0, 0.52, 0, col(0x5a3d29)); cf.box(B.wood, 1.1, 0.1, 6.2, 0, 1.1, 0, col(0x7a5a3a));
    const fl = [0x40ff90, 0xff40c0, 0x40c0ff, 0xffb030, 0xa060ff, 0x60ffe0];
    for (let i = 0; i < 9; i++) {
      const z = -2.6 + i * 0.65, c = col(fl[i % fl.length]), h = 0.2 + rnd() * 0.25;
      B.glow.add(new THREE.SphereGeometry(0.12 + rnd() * 0.06, 8, 6), mat4(-33.3 + (rnd() - 0.5) * 0.4, y + 1.28, 3 + z), c.map((v) => v * 2.2));
      B.glass.add(new THREE.CylinderGeometry(0.035, 0.05, h, 6), mat4(-33.3 + (rnd() - 0.5) * 0.4, y + 1.35 + h / 2, 3 + z), c.map((v) => v * 0.4));
    }
    // copper alembic still
    const al = Frame.at(-33.5, y + 1.15, 0.6, 0);
    const pot = new THREE.SphereGeometry(0.35, 10, 8); al.put(B.metal, pot, 0, 0.35, 0, col(0xc07040)); pot.dispose();
    rod(B.metal, al.world(0, 0.6, 0), al.world(0, 0.9, 0.5), 0.04, col(0xc07040)); rod(B.metal, al.world(0, 0.9, 0.5), al.world(0, 0.4, 1.1), 0.03, col(0xc07040));
    B.glow.add(new THREE.SphereGeometry(0.18, 8, 6), al.m.clone().multiply(mat4(0, 0.25, 1.15)), [0.4, 2.4, 1.2]);
    B.emit.push({ x: -33.5, y: y + 2.2, z: 0.6, type: 'green', rate: 0.5 });
    B.lights.push({ p: V(-32.5, y + 2.2, 3), c: 0x80ffd0, i: 10, d: 9 });
    // awning over the bay
    for (let i = 0; i < 6; i++) { const g = new THREE.PlaneGeometry(1.25, 2.6, 1, 4); g.rotateX(-PI / 2); const P = g.attributes.position; for (let k = 0; k < P.count; k++) { const zz = P.getZ(k); P.setY(k, -0.35 * (zz + 1.3) + 0.08 * Math.sin((zz + 1.3) * 2.4)); } g.computeVertexNormals(); B.cloth.add(g, mat4(-33.4, y + 3.55, -0.1 + i * 1.25, PI / 2), col(i % 2 ? 0x5a2a6a : 0xe8dcc0), { uv: 'keep', wave: (q) => (q.z + 1.3) / 2.6 * 0.25 }); g.dispose(); }
    // herb drying racks
    for (const z of [-4.5, 11]) {
      BLOCKS.push([-32.4, -31.6, z - 1.4, z + 1.4]);
      const hr = Frame.at(-32, y, z, PI / 2); hr.box(B.wood, 0.12, 2.4, 0.12, -1.2, 1.2, 0, tc); hr.box(B.wood, 0.12, 2.4, 0.12, 1.2, 1.2, 0, tc); hr.box(B.wood, 2.6, 0.1, 0.1, 0, 2.3, 0, tc); hr.box(B.wood, 2.6, 0.1, 0.1, 0, 1.6, 0, tc);
      for (let i = 0; i < 7; i++) { const c = new THREE.ConeGeometry(0.11, 0.5, 5); hr.put(B.leaf, c, -1.0 + i * 0.33, 2.0, 0, col(pick([0x5a7a30, 0x7a6a30, 0x9a5a7a, 0x6a8a40]), 0.1, rnd), undefined, 0, PI); hr.put(B.leaf, c, -1.0 + i * 0.33 + 0.15, 1.3, 0, col(pick([0x5a7a30, 0x8a7a30, 0x6a8a40]), 0.1, rnd), undefined, 0, PI); c.dispose(); }
    }
    for (const [x, z] of [[-27, -4], [-27, 12], [-30, 12.5]]) { B.plaster.add(new THREE.CylinderGeometry(0.45, 0.32, 0.6, 10), mat4(x, y + 0.3, z), col(0xa0583a)); tree(x, y + 0.5, z, 0.45, true); }
    // hanging flask sign
    B.glow.add(new THREE.SphereGeometry(0.28, 10, 8), mat4(-32.2, y + 3.0, -1.0), [0.4, 2.6, 1.4]);
    lamp(-26, 9, y);
    banner(V(-32.3, y + 6.8, 8.5), PI / 2, 0x4a2a6a, 1.0, 2.8, 0x60e0b0);
  }

  // ---------------- Market ----------------
  {
    const y = 5;
    const goods = [0xd04030, 0xe0a030, 0x80b040, 0xe0d070, 0xa060c0, 0x60a0d0];
    const awning = [[0xb83a30, 0xf0e6d0], [0x2a7a9a, 0xf0e6d0], [0xd09a30, 0x7a3a28], [0x3a8a5a, 0xf0e6d0]];
    STALLS.forEach(([x, z, w, d, ry], si) => {
      const f = Frame.at(x, y, z, ry), tc = timberC(), big = si === 4;
      const W = big ? d : w, D = big ? w : d, ff = big ? Frame.at(x, y, z, -PI / 2) : f;
      for (const [px, pz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) ff.box(B.wood, 0.14, pz < 0 ? 2.9 : 2.4, 0.14, px * 0.95, (pz < 0 ? 2.9 : 2.4) / 2, pz * 0.9, tc);
      ff.box(B.wood, W, 0.95, 0.7, 0, 0.47, D / 2 - 0.35, col(0x6a4a30)); ff.box(B.wood, W + 0.1, 0.08, 0.85, 0, 0.97, D / 2 - 0.3, col(0x8a6a48));
      ff.box(B.wood, W, 0.08, D * 0.8, 0, 0.6, -0.1, tc);
      const [c1, c2] = awning[si % awning.length], ns = Math.round(W / 0.5);
      for (let i = 0; i < ns; i++) { const g = new THREE.PlaneGeometry(W / ns, D + 0.8, 1, 3); g.rotateX(-PI / 2 + 0.33); ff.put(B.cloth, g, -W / 2 + (i + 0.5) * W / ns, 2.7, 0.1, col(i % 2 ? c1 : c2), { uv: 'keep', wave: (q) => (q.z + D / 2) / (D + 0.8) * 0.3 }); g.dispose(); }
      // goods on counter + shelf
      for (let i = 0; i < (big ? 14 : 8); i++) { const gx = -W / 2 + 0.3 + rnd() * (W - 0.6), c = col(pick(goods), 0.15, rnd); if (rnd() < 0.5) ff.put(B.leaf, new THREE.SphereGeometry(0.11, 6, 5), gx, 1.12, D / 2 - 0.35 + (rnd() - 0.5) * 0.4, c); else ff.box(B.plaster, 0.18, 0.22 + rnd() * 0.2, 0.18, gx, 1.15, D / 2 - 0.35 + (rnd() - 0.5) * 0.4, c); }
      for (let i = 0; i < (big ? 6 : 3); i++) { const t = rnd(); (t < 0.5 ? crate : t < 0.8 ? barrel : sack)(x + (rnd() - 0.5) * W * 0.6, y, z + (rnd() - 0.5) * 0.6 - (big ? 0 : Math.cos(ry) * 0.5), 0.55 + rnd() * 0.3, rnd() * 3); }
      if (big) { ff.box(B.wood, W, 2.4, 0.15, 0, 1.6, -D / 2 + 0.1, col(0x5a3d29)); for (let r = 0; r < 3; r++) { ff.box(B.wood, W - 0.2, 0.06, 0.35, 0, 0.9 + r * 0.6, -D / 2 + 0.3, tc); for (let i = 0; i < 9; i++) ff.box(B.plaster, 0.22, 0.28, 0.22, -W / 2 + 0.4 + i * (W - 0.8) / 8, 1.06 + r * 0.6, -D / 2 + 0.3, col(pick([...goods, 0x8a5a3a, 0x3a5a8a]), 0.1, rnd)); }
        ff.box(B.wood, 2.4, 0.7, 0.1, 0, 3.3, D / 2 - 0.1, col(0x4a3020)); ff.box(B.metal, 1.4, 0.3, 0.12, 0, 3.3, D / 2 - 0.05, col(0xc09040)); }
    });
    // bunting across the market
    for (const [A, Bp] of [[V(27, y + 5.2, -4), V(53, y + 4.6, -4)], [V(27, y + 5.0, -14), V(53, y + 5.4, -14)], [V(27, y + 5.2, -24), V(46, y + 4.8, -24)]]) {
      for (const P of [A, Bp]) { B.wood.add(new THREE.CylinderGeometry(0.1, 0.12, P.y - y + 0.3, 6), mat4(P.x, (P.y + y) / 2, P.z), col(0x5a3d29)); }
      const L = A.distanceTo(Bp), n = Math.floor(L / 0.7); B.ropes.push([A, Bp, 0.6]);
      for (let i = 1; i < n; i++) { const t = i / n, P = A.clone().lerp(Bp, t); P.y -= Math.sin(t * PI) * 0.6; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.5, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); g.computeVertexNormals(); B.cloth.add(g, mat4(P.x, P.y, P.z, rnd() * 0.3), col(pick([0xc03a30, 0xe8c040, 0x2a7aa0, 0xf0e6d0, 0x3a8a5a])), { uv: 'keep', wave: (q) => -q.y * 1.4 }); g.dispose(); }
    }
    tower(Frame.at(50.5, y, -23, 0), { r: 3.2, h: 13, flag: 0xb83a30 });
    for (const [x, z] of [[27.5, -3], [52.5, -3.5], [27.5, -25], [44, -25]]) lamp(x, z, y);
    pile(52, y, -11, 6); pile(28.5, y, -23.5, 4);
    // market-side houses (non-walkable, along the east edge above the inlet)
  }

  // ---------------- Storage depot (warehouse) ----------------
  {
    const y = 2.4, f = Frame.at(-52, y, -18, PI / 2), tc = col(0x4a3324), sc = col(0xa8a092), rc = col(0x2f7f8e);
    f.box(B.stone, 18.5, 4.0, 16.5, 0, 2.0, 0, sc);
    f.box(B.plaster, 18, 4.0, 16, 0, 6.0, 0, col(0xd8ccb2)); for (const [fx, fz, ry, FW] of [[0, 8, 0, 18], [0, -8, PI, 18]]) { const g = f.sub(fx, 4.0, fz, ry); timber(g, FW, 4.0, tc, true); for (let k = 0; k < 5; k++) if (k !== 2 || fz < 0) windowAt(g, -FW / 2 + (k + 0.5) * FW / 5, 2.0, 0.05, 0, 0.8, 1.1, { tc }); }
    // big door opening + interior darkness + stacked goods visible
    const fg = f.sub(0, 0, 8.26, 0);
    fg.box(B.glass, 5.2, 3.6, 0.05, 0, 1.8, 0, [0, 0, 0]); fg.box(B.wood, 6.0, 0.5, 0.5, 0, 3.8, 0.1, tc); fg.box(B.wood, 0.4, 3.8, 0.5, -2.9, 1.9, 0.1, tc); fg.box(B.wood, 0.4, 3.8, 0.5, 2.9, 1.9, 0.1, tc);
    fg.box(B.wood, 2.8, 3.6, 0.15, -4.3, 1.8, 0.2, col(0x6a4a2e)); fg.box(B.wood, 2.8, 3.6, 0.15, 4.3, 1.8, 0.2, col(0x6a4a2e));
    const rh = 8.2 * Math.tan(0.75); const at = gablePrism(18, 16.4, rh); f.put(B.plaster, at, 0, 8.0, 0, col(0xd8ccb2)); at.dispose();
    for (const s of [0, PI]) f.sub(0, 0, 0, s).box(B.roof, 19.4, 0.24, (8.2 + 0.7) / Math.cos(0.75), 0, 8.0 + rh / 2 - 0.3, (8.2 + 0.7) / 2 - 0.05, rc, { s: 2 }, 0, 0.75);
    f.box(B.roof, 19.6, 0.3, 0.5, 0, 8.0 + rh + 0.12, 0, rc.map((v) => v * 0.6));
    // hoist beam + pulley above the door
    const hb = f.sub(0, 10.5, 8.2, 0); hb.box(B.wood, 0.4, 0.4, 2.6, 0, 0, 1.0, tc); hb.cyl(B.metal, 0.25, 0.25, 0.15, 0, -0.3, 2.0, col(0x3a3a3a), 10, undefined, 0, PI / 2);
    const P0 = hb.world(0, -0.3, 2.0); B.ropes.push([P0, V(P0.x, y + 2.6, P0.z), 0]); crate(P0.x, y + 1.6, P0.z, 0.9);
    // quartermaster's ledger table + stock outside
    const lt = Frame.at(-41.55, y, -18, PI / 2); lt.box(B.wood, 3.0, 0.9, 1.1, 0, 0.45, 0, col(0x6a4a30)); lt.box(B.wood, 3.2, 0.08, 1.25, 0, 0.94, 0, col(0x8a6a48)); lt.box(B.plaster, 0.6, 0.05, 0.45, -0.4, 1.0, 0, col(0xf2e8d0)); lt.box(B.metal, 0.25, 0.2, 0.25, 0.8, 1.05, 0, col(0xb08840)); lt.box(B.glow, 0.08, 0.1, 0.08, 0.8, 1.2, 0, [3, 1.6, 0.6]);
    for (const [x, z, n] of [[-42, -25, 7], [-42, -11, 6], [-30, -11, 5], [-28, -24, 6], [-50, -30.5, 6], [-20, -32, 5], [14, -31, 6], [-12, -42, 4], [20, -43, 5], [40, -32, 5]]) pile(x, y, z, n);
    lamp(-43, -23, y); lamp(-43, -12.5, y);
    banner(V(-43.6, y + 7.5, -18), PI / 2, 0x7a5a20, 1.2, 2.6, 0x2a4a6a);
  }

  // ---------------- quay furniture ----------------
  {
    const y = 2.4;
    for (let x = -52; x <= 44; x += 12) lamp(x, -44.5, y);
    tower(Frame.at(-56, y, -45.5, 0), { r: 4.2, h: 15, flag: 0x1f4a7a, roofH: 11 });
    // drying fish racks + nets
    for (const x of [-26, -20]) { const f = Frame.at(x, y, -30.5, 0), tc = timberC(); f.box(B.wood, 0.12, 2.2, 0.12, -1.5, 1.1, 0, tc); f.box(B.wood, 0.12, 2.2, 0.12, 1.5, 1.1, 0, tc); f.box(B.wood, 3.2, 0.1, 0.1, 0, 2.1, 0, tc); const g = new THREE.PlaneGeometry(3, 1.6, 4, 3); f.put(B.cloth, g, 0, 1.3, 0, col(0x4a5048), { uv: 'keep', s: 0.5, wave: (q) => (0.8 - q.y) * 0.2 }); g.dispose(); BLOCKS.push([x - 1.7, x + 1.7, -31, -30]); }
    // rope coils
    for (const [x, z] of [[-3, -45], [10, -45.2], [-30, -45], [30, -44.8]]) B.wood.add(new THREE.TorusGeometry(0.35, 0.12, 5, 12).rotateX(PI / 2), mat4(x, y + 0.12, z), col(0x9a8a6a));
  }
  // ---------------- residential terraces ----------------
  for (const [list, y] of [[HOUSES_R1, 12], [HOUSES_R2, 14]]) for (const [x, z, w, d, ry, fl] of list) house(Frame.at(x, y, z, ry), { w, d, floors: fl, dormer: rnd() < 0.5, jettyX: false });
  // laundry lines + well + lamp
  {
    for (const [A, Bp] of [[V(33, 16.6, 34.9), V(33, 16.6, 46.2)], [V(46.5, 16.8, 35.4), V(46.5, 16.8, 44.6)], [V(-46, 18.8, 32.4), V(-46, 18.8, 44.1)], [V(-24, 18.8, 32.9), V(-24, 18.8, 44.1)]]) {
      B.ropes.push([A, Bp, 0.5]); const L = A.distanceTo(Bp);
      for (let t = 0.8; t < L - 0.6; t += 0.75 + rnd() * 0.5) { if (rnd() < 0.25) continue; const P = A.clone().lerp(Bp, t / L); P.y -= Math.sin(t / L * PI) * 0.5; const w = 0.5 + rnd() * 0.4, h = 0.6 + rnd() * 0.5; const g = new THREE.PlaneGeometry(w, h, 2, 2); g.translate(0, -h / 2, 0); B.cloth.add(g, mat4(P.x, P.y, P.z, PI / 2), col(pick([0xf0ece0, 0xc84a3a, 0x3a6a9a, 0xe0c060, 0x6a9a5a, 0xe8d8c8]), 0.05, rnd), { uv: 'keep', wave: (q) => -q.y / h * 1.2 }); g.dispose(); }
    }
    const wf = Frame.at(22, 12, 31, 0); wf.cyl(B.stone, 1.2, 1.3, 0.9, 0, 0.45, 0, stoneC(), 14); wf.box(B.wood, 0.15, 2.2, 0.15, -1.0, 1.1, 0, timberC()); wf.box(B.wood, 0.15, 2.2, 0.15, 1.0, 1.1, 0, timberC()); const wr = gablePrism(2.6, 2.0, 0.8); wf.put(B.roof, wr, 0, 2.2, 0, roofC()); wr.dispose(); B.glass.add(new THREE.CircleGeometry(1.05, 14).rotateX(-PI / 2), mat4(22, 12.85, 31), [0, 0, 0]);
    tree(-40, 14, 38, 1.2); tree(54, 12, 27.5, 0.9); tree(17.5, 12, 54, 1.0); tree(-52.5, 14, 39, 1.0); tree(-19.5, 14, 54.5, 0.9);
    lamp(28, 41, 12); lamp(-38, 40, 14); lamp(-20, 37, 14); lamp(50, 40, 12);
    pile(54, 12, 54.5, 3); pile(-52, 14, 54, 3); pile(18, 12, 38, 3);
  }
  // ---------------- background (no shadow casting): lighthouse + filler rooftops ----------------
  const KEYS = ['stone', 'cobble', 'wood', 'roof', 'plaster', 'cloth', 'metal', 'leaf', 'glass', 'glow'];
  B.outerSet = {}; for (const k of KEYS) B.outerSet[k] = new (B[k].constructor)(k + '-far', { s: B[k].s, wave: !!B[k].W });
  const swap = () => { for (const k of KEYS) [B[k], B.outerSet[k]] = [B.outerSet[k], B[k]]; };
  swap(); simple = true;
  {
    const x = -84, z = -100, y = terrainY(x, z) - 1;
    const f = Frame.at(x, y, z, 0), sc = col(0xd8d0c4);
    f.cyl(B.stone, 3.2, 4.4, 30, 0, 14, 0, sc, 16);
    for (let k = 0; k < 6; k++) f.cyl(B.stone, 3.6 - k * 0.12, 3.6 - k * 0.12, 1.2, 0, 3 + k * 4.6, 0, col(k % 2 ? 0xb83a30 : 0xd8d0c4), 16);
    f.cyl(B.metal, 4.0, 4.0, 0.3, 0, 29.2, 0, col(0x3a3a3a), 16);
    f.cyl(B.glass, 2.4, 2.4, 3.0, 0, 30.8, 0, [3, 2.2, 1.2], 12);
    const cg = coneRoof(3.0, 3.4, 16, 2); f.put(B.roof, cg, 0, 34, 0, col(0x2a8ea0), { uv: 'keep' }); cg.dispose();
    B.beacon = f.world(0, 30.8, 0);
    house(Frame.at(x + 8, terrainY(x + 8, z + 4) - 0.2, z + 4, PI / 2), { w: 8, d: 6, floors: 1, roof: 'gable' });
  }
  // ---------------- filler houses: dense layered rooftops on the slopes, the headland and the hill behind ----------------
  {
    const occupied = [];
    const ok = (x, z, r) => {
      for (const p of PRIMS) if (inPrim(p, x, z, r + 1.5)) return false;
      for (const b of BLOCKS) if (Array.isArray(b) ? x > b[0] - r && x < b[1] + r && z > b[2] - r && z < b[3] + r : Math.hypot(x - b.c[0], z - b.c[1]) < b.r + r) return false;
      for (const [ox, oz, orr] of occupied) if (Math.hypot(x - ox, z - oz) < r + orr + 0.2) return false;
      if (Math.hypot(x, z - 33) < 22 || Math.hypot(x - 40, z - 9) < 13 || Math.hypot(x + 39, z - 4) < 12 || Math.hypot(x + 52, z + 18) < 11) return false;
      return true;
    };
    const target = low ? 55 : 85; let placed = 0;
    for (let i = 0; i < 4000 && placed < target; i++) {
      const x = -95 + rnd() * 190, z = -60 + Math.pow(rnd(), 1.6) * 150;
      if (z < -20 && x > -60) continue;
      if (x > 62 && z < 20) continue;
      const w = 6 + rnd() * 4, d = 5 + rnd() * 3, r = Math.hypot(w, d) / 2;
      if (!ok(x, z, r)) continue;
      let ymin = 1e9, ymax = -1e9; for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) { const h = terrainY(x + dx, z + dz); ymin = Math.min(ymin, h); ymax = Math.max(ymax, h); }
      if (ymin < 3 || ymax - ymin > 7 || Math.hypot(x, z) > 118) continue;
      occupied.push([x, z, r]); placed++;
      const face = Math.atan2(-x * 0.3, -z - 40) + (rnd() - 0.5) * 0.5; // roughly face the harbour
      const big = rnd() < 0.15;
      if (big) tower(Frame.at(x, ymin + 0.3, z, 0), { r: 2.6 + rnd(), h: 10 + rnd() * 8, flag: rnd() < 0.5 ? 0x1f4a7a : undefined });
      else house(Frame.at(x, (ymin + ymax) / 2, z, Math.round(face / (PI / 2)) * PI / 2 + (rnd() - 0.5) * 0.2), { w, d, floors: 2 + (rnd() < 0.4 ? 1 : 0), roof: rnd() < 0.2 ? 'hip' : 'gable', dormer: rnd() < 0.4, smoke: 0.5 });
    }
    B.fillerCount = placed;
  }
  swap(); simple = false;

  // ---------------- trees ----------------
  function tree(x, y, z, s = 1, potted = false, cheap = false) {
    const tc = col(0x5a4030, 0.1, rnd); B.extraCol.push({ x, z, r: potted ? 0.5 : 0.3 * s });
    B.wood.add(new THREE.CylinderGeometry(0.12 * s, 0.22 * s, 2.6 * s, 6), mat4(x, y + 1.3 * s, z, 0, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1), tc);
    const n = potted ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const g = new THREE.IcosahedronGeometry((1.1 + rnd() * 0.5) * s, low || cheap ? 0 : 1); const P = g.attributes.position;
      for (let k = 0; k < P.count; k++) { const f = 1 + (Math.sin(P.getX(k) * 4.1 + i) * Math.cos(P.getZ(k) * 3.7) * 0.18); P.setXYZ(k, P.getX(k) * f, P.getY(k) * f * 0.85, P.getZ(k) * f); }
      g.computeVertexNormals();
      const a = rnd() * 6.28, r = i ? 0.8 * s : 0;
      B.leaf.add(g, mat4(x + Math.cos(a) * r, y + (2.7 + rnd() * 0.8) * s, z + Math.sin(a) * r), null, { colFn: (lx, ly) => col(0x4a7a32, 0, rnd).map((v, j) => v * (0.7 + 0.5 * Math.max(0, ly / s + 0.6)) * [1, 1.02, 0.9][j]) }); g.dispose();
    }
  }
  B.tree = tree;
  return B;
}
