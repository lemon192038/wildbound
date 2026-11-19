// The Volcano Slime — the awakened world boss (user spec §6-6). Its HP lives on the server (server/volcano.js); this is
// the body you see and fight on each client.
//   • A colossal magma body that rises out of the crater and creeps slowly along the rim. Its path and its attack
//     timeline are functions of the server's event clock and seed, so every hunter sees the same creature doing the
//     same thing at the same time.
//   • Attacks (chosen per time slot; faster and denser in later stages):
//       shot    magma globs fired with NO wind-up
//       slam    club tentacles rise around the hunter and crash down
//       sweep   one long whip tentacle sweeps across the ground (jump it)
//       spikes  spiked tentacles burst out of the ground under the hunter
//       wave    a ring of lava rolls out from the body (jump it)            — environment
//       rain    the volcano spits molten rock over a wide area             — environment
//       grasp   a ring of small tentacles closes in on the hunter (stage 3)
//   • Tentacle shapes: whip (long, thin), club (thick, bulbous end), spike (tapered, from the ground), cluster (small).
//   • Hits from hunters are reported to the server; the rope cannot grab it… but you can hook onto it like any monster.
import * as THREE from 'three';
import { mulberry32 } from '../world/noise.js';
import { isJa } from '../shared/i18n.js';

const BODY_R = 18, SPEED = 0.9;
const ATTACKS = ['shot', 'slam', 'sweep', 'spikes', 'wave', 'rain', 'grasp'];
const SLOT = [0, 4.2, 3.4, 2.7]; // seconds per attack by stage

export function createVolcanoSlime(game, { seed = 1, t0 = 0, clock = () => 0, hp = 100000, maxHp = 100000, onDamage = null } = {}) {
  const W = game.world, F = W.island, C = F.crater; const scene = game.scene;
  const m = { name: isJa() ? '火山スライム' : 'Volcano Slime', kind: 'volcanoSlime', worldBoss: true, noNet: true, hp, maxHp, state: 'awake', enraged: false,
    position: new THREE.Vector3(C.x, C.lake, C.z), parts: [{ name: 'body', hitzone: 0.85, hardness: 0.2, breakable: false, maxHp: 99999 }, { name: 'tentacle', hitzone: 1.25, hardness: 0.1, breakable: false, maxHp: 99999 }],
    weakness: { water: 1.3, ice: 1.4, fire: 0.1, thunder: 1.0, dragon: 1.0, poison: 0.6, blast: 0.8 }, stage: 1 };

  // ---------------- body: displaced icosphere with a molten shader ----------------
  const bodyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uStage: { value: 1 } },
    vertexShader: `uniform float uTime; varying float vH; varying vec3 vN;
      float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); float a=mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y);
        float b=mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y); return mix(a,b,f.z); }
      void main(){ vec3 p = position; float d = n3(p*2.2 + vec3(0.0, uTime*0.35, 0.0))*0.18 + n3(p*5.0 - uTime*0.6)*0.06 + sin(uTime*1.3 + p.y*3.0)*0.03;
        p *= 1.0 + d; p.y *= p.y < 0.0 ? 0.55 : 1.0; vH = d; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uTime, uHit, uStage; varying float vH; varying vec3 vN;
      void main(){ float t = clamp(vH*3.2 + 0.25*sin(uTime*2.0 + vH*30.0) + 0.1*uStage, 0.0, 1.0);
        vec3 crust = vec3(0.07, 0.04, 0.035), hot = vec3(1.6, 0.42, 0.06), white = vec3(2.2, 1.4, 0.6);
        vec3 c = mix(crust, hot, smoothstep(0.25, 0.75, t)); c = mix(c, white, smoothstep(0.85, 1.0, t)); float rim = pow(1.0 - abs(vN.z), 2.0);
        gl_FragColor = vec4(c + vec3(1.0, 0.35, 0.08) * rim * 0.6 + vec3(uHit), 1.0); }`,
  });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), bodyMat); body.scale.setScalar(BODY_R); body.frustumCulled = false; body.name = 'volcano-slime'; scene.add(body);
  const glow = new THREE.PointLight(0xff6a20, 4, 120, 1.6); scene.add(glow);
  // tentacles: instanced segments (one draw call)
  const SEG = 14, MAXT = 12; const segGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 1); segGeo.translate(0, 0.5, 0);
  const segMat = new THREE.MeshStandardMaterial({ color: 0x2a1208, emissive: 0xff5010, emissiveIntensity: 1.3, roughness: 0.6 });
  const segMesh = new THREE.InstancedMesh(segGeo, segMat, SEG * MAXT); segMesh.count = 0; segMesh.frustumCulled = false; scene.add(segMesh);
  // telegraphs, globs, the lava wave
  const ringGeo = new THREE.RingGeometry(0.85, 1, 28); ringGeo.rotateX(-Math.PI / 2);
  const ringMesh = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }), 40); ringMesh.count = 0; ringMesh.frustumCulled = false; scene.add(ringMesh);
  const globMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffa040 }), 40); globMesh.count = 0; globMesh.frustumCulled = false; scene.add(globMesh);
  const waveGeo = new THREE.TorusGeometry(1, 0.04, 6, 64); waveGeo.rotateX(Math.PI / 2);
  const wave = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: 0xff6018 })); wave.visible = false; wave.frustumCulled = false; scene.add(wave);

  // ---------------- path: out of the crater, then a slow creep along the rim ----------------
  const R0 = mulberry32(seed)(); const a0 = R0 * Math.PI * 2;
  function pathAt(tt, out) {
    const r = Math.min(C.r + 6, tt * 2.2), a = a0 + Math.max(0, tt - 60) * (SPEED / (C.r + 6)); // emerges over ~1 min, then creeps along the rim
    const x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r; const g = Math.max(W.getHeight(x, z), C.lake);
    return out.set(x, g, z);
  }
  const center = new THREE.Vector3();
  function hitCenter(out) { return out.copy(m.position).setY(m.position.y + BODY_R * 0.62); }

  // ---------------- attack timeline ----------------
  let slotIdx = -1, atk = null; const tentacles = []; const globs = []; const rings = [];
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _mtx = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
  const ground = (x, z) => W.getHeight(x, z);
  function startAttack(slot, tt, force = null) {
    const r = mulberry32(seed * 131 + slot * 7 + 3); const st = m.stage;
    const pool = st >= 3 ? ATTACKS : ATTACKS.slice(0, 6);
    const type = force || (slot % 5 === 0 ? 'shot' : pool[Math.floor(r() * pool.length)]);
    const P = game.player?.position || m.position; const tgt = P.clone();
    atk = { type, t: 0, dur: SLOT[st], r, tgt, hit: new Set(), st };
    tentacles.length = 0; globs.length = 0; rings.length = 0;
    const around = (k, rad) => { const a = r() * Math.PI * 2, d = rad * Math.sqrt(r()); return new THREE.Vector3(tgt.x + Math.cos(a) * d, 0, tgt.z + Math.sin(a) * d); };
    if (type === 'shot') { const n = 3 + st * 2; for (let i = 0; i < n; i++) globs.push({ at: i * 0.14, p: null, v: null, aim: around(i, 5), done: false }); }
    if (type === 'slam') { const n = 1 + st; for (let i = 0; i < n; i++) { const p = i === 0 ? tgt.clone() : around(i, 9); p.y = ground(p.x, p.z); tentacles.push({ shape: 'club', at: p, ring: 3.6, hitT: 1.0 }); rings.push({ p, r: 3.6, until: 1.0 }); } }
    if (type === 'sweep') { const dir = Math.atan2(tgt.x - m.position.x, tgt.z - m.position.z); tentacles.push({ shape: 'whip', a0: dir - 0.9, a1: dir + 0.9, len: m.position.distanceTo(tgt) + 10 }); }
    if (type === 'spikes') { const n = 4 + st * 2; for (let i = 0; i < n; i++) { const p = i === 0 ? tgt.clone() : around(i, 7); p.y = ground(p.x, p.z); const at = 0.6 + i * 0.12; tentacles.push({ shape: 'spike', at: p, hitT: at }); rings.push({ p, r: 1.8, until: at }); } }
    if (type === 'wave') atk.wave = true;
    if (type === 'rain') { const n = 6 + st * 4; for (let i = 0; i < n; i++) { const p = around(i, 14); p.y = ground(p.x, p.z); const at = 0.7 + r() * 1.2; globs.push({ rain: true, at, p0: p.clone().setY(p.y + 60), land: p, done: false }); rings.push({ p, r: 2.6, until: at + 0.6 }); } }
    if (type === 'grasp') { const n = 8; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const p = new THREE.Vector3(tgt.x + Math.cos(a) * 9, 0, tgt.z + Math.sin(a) * 9); p.y = ground(p.x, p.z); tentacles.push({ shape: 'cluster', at: p, ang: a, center: tgt.clone() }); } rings.push({ p: tgt.clone().setY(ground(tgt.x, tgt.z)), r: 3, until: 1.4 }); }
  }
  // damage to the local hunter (no parry: these are area / environmental attacks)
  function hurt(key, damage, from, kb = 8, kind = 'aoe', status = null) {
    if (atk.hit.has(key)) return; const P = game.player; if (!P || P.dead) return;
    atk.hit.add(key); const ok = P.receiveHit?.({ damage, knockback: kb, from, kind }); if (ok !== false && status) game.status?.apply?.(...status);
  }
  function step(dt) {
    if (!atk) return; atk.t += dt; const T = atk.t, P = game.player?.position; if (!P) return;
    const pg = ground(P.x, P.z), pAir = P.y - pg;
    if (atk.type === 'shot') for (const g of globs) {
      if (g.done || T < g.at) continue;
      if (!g.p) { g.p = hitCenter(new THREE.Vector3()).add(_v.set(0, BODY_R * 0.4, 0)); const d = _w.subVectors(g.aim, g.p); const flight = 1.1; g.v = new THREE.Vector3(d.x / flight, (g.aim.y - g.p.y) / flight + 9.8 * 0.5 * flight + 3, d.z / flight); }
      g.v.y -= 9.8 * dt; g.p.addScaledVector(g.v, dt);
      if (g.p.y <= ground(g.p.x, g.p.z)) { g.done = true; W.spawnDust?.(g.p.clone(), 1.2); if (_v.set(P.x - g.p.x, 0, P.z - g.p.z).length() < 3) hurt('g' + g.at, 30, g.p, 6, 'fire', ['burn', 'medium']); }
    }
    if (atk.type === 'rain') for (const g of globs) {
      if (g.done || T < g.at - 0.6) continue; const k = Math.min(1, (T - (g.at - 0.6)) / 0.6); g.p = new THREE.Vector3().lerpVectors(g.p0, g.land, k);
      if (k >= 1) { g.done = true; W.spawnDust?.(g.land.clone(), 1.6); game.events?.emit?.('camera:shake', { intensity: 0.15, duration: 0.2 }); if (_v.set(P.x - g.land.x, 0, P.z - g.land.z).length() < 2.6) hurt('r' + g.at, 30, g.land, 7, 'fire', ['burn', 'medium']); }
    }
    for (const tc of tentacles) {
      if (tc.shape === 'club' && T >= tc.hitT && T - dt < tc.hitT) { W.spawnDust?.(tc.at.clone(), 2.4); game.events?.emit?.('camera:shake', { intensity: 0.45, duration: 0.35 }); if (_v.set(P.x - tc.at.x, 0, P.z - tc.at.z).length() < tc.ring) hurt('c' + tc.at.x, 46, tc.at, 11); }
      if (tc.shape === 'spike' && T >= tc.hitT && T - dt < tc.hitT) { W.spawnDust?.(tc.at.clone(), 1.2); if (_v.set(P.x - tc.at.x, 0, P.z - tc.at.z).length() < 1.8) hurt('s' + tc.at.x, 34, tc.at, 9); }
      if (tc.shape === 'whip' && T > 0.9 && T < 1.9) { // sweeping band near the ground: jump over it
        const a = tc.a0 + (tc.a1 - tc.a0) * ((T - 0.9) / 1.0); const dx = Math.sin(a), dz = Math.cos(a); const rx = P.x - m.position.x, rz = P.z - m.position.z;
        const along = rx * dx + rz * dz, off = Math.abs(rx * dz - rz * dx); if (along > 0 && along < tc.len && off < 2.0 && pAir < 1.1) hurt('w', 40, m.position, 13);
      }
      if (tc.shape === 'cluster' && T > 1.4 && T < 1.8 && _v.set(P.x - tc.center.x, 0, P.z - tc.center.z).length() < 3.2) hurt('k', 50, tc.center, 6, 'aoe', ['stun', 'short']);
    }
    if (atk.wave) { const rad = BODY_R + Math.max(0, T - 0.5) * 22; atk.waveR = rad; const d = Math.hypot(P.x - m.position.x, P.z - m.position.z); if (T > 0.5 && Math.abs(d - rad) < 1.4 && pAir < 0.9) hurt('wave', 38, m.position, 9, 'fire', ['burn', 'medium']); }
  }

  // ---------------- drawing ----------------
  function drawTentacle(i, root, tip, bend, thick, shape) {
    let n = 0;
    for (let k = 0; k < SEG; k++) {
      const u0 = k / SEG, u1 = (k + 1) / SEG; const a = bez(root, tip, bend, u0, _v), b = bez(root, tip, bend, u1, _w);
      const len = a.distanceTo(b); if (len < 1e-3) continue; const dir = b.clone().sub(a).normalize(); _q.setFromUnitVectors(_up, dir);
      let r = thick * (shape === 'club' ? (u0 > 0.8 ? 1.9 : 1 - u0 * 0.3) : shape === 'spike' ? Math.max(0.08, 1 - u0) : 1 - u0 * 0.75);
      _s.set(r, len, r); _mtx.compose(a, _q, _s); segMesh.setMatrixAt(i * SEG + k, _mtx); n++;
    }
    return n;
  }
  const bez = (a, b, c, u, out) => out.set((1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x, (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y, (1 - u) * (1 - u) * a.z + 2 * (1 - u) * u * c.z + u * u * b.z);
  const tipBoxes = [];
  function draw(time) {
    let used = 0, ti = 0; tipBoxes.length = 0; const T = atk?.t || 0;
    const top = hitCenter(new THREE.Vector3()).add(_v.set(0, BODY_R * 0.5, 0));
    for (const tc of tentacles) {
      if (ti >= MAXT) break; let root, tip, bend, thick;
      if (tc.shape === 'club') { const rise = Math.min(1, T / 0.8), fall = T > 0.8 ? Math.min(1, (T - 0.8) / 0.2) : 0; root = top.clone(); tip = tc.at.clone().setY(tc.at.y + 26 * rise * (1 - fall) + 1); bend = root.clone().lerp(tip, 0.5).setY(Math.max(root.y, tip.y) + 14); thick = 1.6; }
      else if (tc.shape === 'spike') { const k = Math.max(0, Math.min(1, (T - (tc.hitT - 0.08)) / 0.15)) * (T > tc.hitT + 0.9 ? Math.max(0, 1 - (T - tc.hitT - 0.9) * 3) : 1); if (k <= 0) continue; root = tc.at.clone(); tip = tc.at.clone().setY(tc.at.y + 5.5 * k); bend = root.clone().lerp(tip, 0.5); thick = 0.9; }
      else if (tc.shape === 'whip') { const a = T < 0.9 ? tc.a0 : tc.a0 + (tc.a1 - tc.a0) * Math.min(1, (T - 0.9) / 1.0); root = hitCenter(new THREE.Vector3()); tip = new THREE.Vector3(m.position.x + Math.sin(a) * tc.len, 0, m.position.z + Math.cos(a) * tc.len); tip.y = ground(tip.x, tip.z) + 0.6; bend = root.clone().lerp(tip, 0.5).setY(root.y + 4); thick = 0.8; }
      else { const k = Math.min(1, T / 1.4); const p = new THREE.Vector3().lerpVectors(tc.at, tc.center, k * 0.7); p.y = ground(p.x, p.z); root = p; tip = p.clone().setY(p.y + 3.5).lerp(tc.center.clone().setY(p.y + 2), k * 0.4); bend = root.clone().lerp(tip, 0.5).add(_v.set(Math.cos(tc.ang + time * 3), 0, Math.sin(tc.ang + time * 3)).multiplyScalar(0.8)); thick = 0.4; }
      used = Math.max(used, ti * SEG + drawTentacle(ti, root, tip, bend, thick, tc.shape)); tipBoxes.push({ c: tip.clone(), r: Math.max(1.2, thick * 1.4) }, { c: bez(root, tip, bend, 0.6, new THREE.Vector3()), r: Math.max(1.2, thick * 1.2) }); ti++;
    }
    // idle tentacles waving above the body (more in later stages)
    for (let j = 0; j < m.stage + 1 && ti < MAXT; j++, ti++) { const a = time * 0.4 + j * 2.3; const root = top.clone(); const tip = root.clone().add(_v.set(Math.cos(a) * 14, 10 + Math.sin(time * 1.3 + j) * 4, Math.sin(a) * 14)); const bend = root.clone().lerp(tip, 0.5).add(_w.set(0, 6, 0)); used = Math.max(used, ti * SEG + drawTentacle(ti, root, tip, bend, 0.9, 'whip')); }
    segMesh.count = Math.min(SEG * MAXT, ti * SEG); segMesh.instanceMatrix.needsUpdate = true;
    let rn = 0; for (const r of rings) if (T < r.until && rn < 40) { _mtx.compose(_v.copy(r.p).setY(r.p.y + 0.15), _q.identity(), _s.setScalar(r.r * (0.6 + 0.4 * Math.min(1, T / Math.max(0.1, r.until)))) ); ringMesh.setMatrixAt(rn++, _mtx); }
    ringMesh.count = rn; ringMesh.instanceMatrix.needsUpdate = true;
    let gn = 0; for (const g of globs) if (!g.done && g.p && gn < 40) { _mtx.compose(g.p, _q.identity(), _s.setScalar(g.rain ? 1.4 : 0.9)); globMesh.setMatrixAt(gn++, _mtx); }
    globMesh.count = gn; globMesh.instanceMatrix.needsUpdate = true;
    wave.visible = !!atk?.wave && T > 0.5; if (wave.visible) { wave.position.copy(m.position).setY(m.position.y + 0.6); wave.scale.set(atk.waveR, 18, atk.waveR); }
  }

  // ---------------- monster interface ----------------
  const hb = [{ part: 'body', sphere: new THREE.Sphere(new THREE.Vector3(), BODY_R) }];
  m.getHitboxes = () => { hitCenter(hb[0].sphere.center); hb.length = 1; for (let i = 0; i < Math.min(8, tipBoxes.length); i++) hb.push({ part: 'tentacle', sphere: new THREE.Sphere(tipBoxes[i].c, tipBoxes[i].r) }); return hb; };
  m.getAttackHitboxes = () => [];
  let hitFlash = 0, held = false;
  m.receiveHit = ({ damage = 0, part = 'body' } = {}) => {
    if (m.hp <= 0) return { damage: 0, part };
    const p = m.parts.find((q) => q.name === part) || m.parts[0]; const dmg = Math.max(1, Math.round(damage * p.hitzone));
    m.hp = Math.max(0, m.hp - dmg); hitFlash = 0.35; onDamage?.(dmg); return { damage: dmg, part, weak: p.hitzone >= 1.2 };
  };
  m.serialize = () => null; m.applyRemote = () => {};
  m.setServerHp = (h, max) => { m.maxHp = max || m.maxHp; m.hp = h; };
  m.update = (dt) => {
    const tt = (clock() - t0) / 1000; pathAt(Math.max(0, tt), m.position); m.stage = m.hp > m.maxHp * 0.66 ? 1 : m.hp > m.maxHp * 0.33 ? 2 : 3; m.enraged = m.stage === 3;
    const slot = Math.floor(Math.max(0, tt - 6) / SLOT[m.stage]);
    if (tt > 6 && slot !== slotIdx && !held && slotIdx < 1e9) { slotIdx = slot; startAttack(slot, tt); }
    if (slotIdx >= 1e9 && atk && atk.t > atk.dur && !held) slotIdx = -1; // a debug attack finished: back to the timeline
    step(dt);
    const time = tt; body.position.copy(hitCenter(center)); body.rotation.y = time * 0.05; bodyMat.uniforms.uTime.value = time; bodyMat.uniforms.uStage.value = m.stage;
    hitFlash = Math.max(0, hitFlash - dt); bodyMat.uniforms.uHit.value = hitFlash; glow.position.copy(body.position).setY(body.position.y + BODY_R);
    draw(time);
  };
  m.dispose = () => { for (const o of [body, glow, segMesh, ringMesh, globMesh, wave]) { scene.remove(o); o.geometry?.dispose?.(); } };
  m.debug = { attack: (type) => { slotIdx = 1e9; startAttack(Math.floor(Math.random() * 1e6), 0, type); }, hold: (v) => { held = v; }, get atk() { return atk; }, ATTACKS };
  m.update(0);
  return m;
}
