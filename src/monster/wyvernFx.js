// Cindral's hazards & effects: flame particles, timed rock bombs (swell → blast, chain detonation),
// lingering fire patches, fireballs, sparks and a fixed pool of point lights (no shader recompiles).
// All damage here targets the LOCAL hunter only; every client simulates its own hazards.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Irregular smouldering scorch: dark char rim, ember-orange core, soft ragged edge.
function scorchTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 26, r = 14 + Math.random() * 26, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,190,90,0.55)'); gr.addColorStop(0.45, 'rgba(230,80,20,0.35)'); gr.addColorStop(1, 'rgba(120,20,5,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createWyvernFx(game, monster) {
  const { scene, world, events } = game;
  const ground = (x, z) => world.getHeight(x, z);
  const tex = radialTexture(), scorch = scorchTexture();

  // ---------------------------------------------------------------- flame particles (one draw call)
  const N = 520;
  const pos = new Float32Array(N * 3).fill(-9999), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const flames = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.55, map: tex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  flames.frustumCulled = false; scene.add(flames);
  let head = 0;
  function emitFlame(p, v, l = 0.8) { const i = head; head = (head + 1) % N; pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3); age[i] = 0; life[i] = l; }
  const _v = new THREE.Vector3();
  function puff(p, n, speed, l = 0.9, up = 0.4) { for (let i = 0; i < n; i++) { _v.set(Math.random() - 0.5, Math.random() * up + (up > 0 ? 0.2 : 0), Math.random() - 0.5).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.8)); emitFlame(p, _v, l * (0.6 + Math.random() * 0.6)); } }

  // ---------------------------------------------------------------- sparks
  const sparkMat = new THREE.PointsMaterial({ map: tex, color: 0xffb060, size: 0.4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = [];
  function burst(p, n = 24, speed = 9, l = 0.9) {
    const gg = new THREE.BufferGeometry(); const a = new Float32Array(n * 3); const vv = [];
    for (let i = 0; i < n; i++) { a.set([p.x, p.y, p.z], i * 3); vv.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()))); }
    gg.setAttribute('position', new THREE.BufferAttribute(a, 3)); const pts = new THREE.Points(gg, sparkMat.clone()); scene.add(pts); sparks.push({ pts, v: vv, life: l, t: 0 });
  }

  // ---------------------------------------------------------------- light pool
  const LIGHTS = 3; const pool = [];
  for (let i = 0; i < LIGHTS; i++) { const L = new THREE.PointLight(0xff6a20, 0, 26, 2); scene.add(L); pool.push(L); }
  const flashes = []; // {pos, i0, t, dur}
  let requests = [];
  const requestLight = (p, intensity, color = 0xff6a20) => requests.push({ p, intensity, color });

  // ---------------------------------------------------------------- local-hunter damage helpers
  const hurt = (opts, status) => {
    const pl = game.player; if (!pl?.receiveHit) return false;
    const r = pl.receiveHit({ ...opts, source: monster });
    if (r !== false && status) game.status?.apply(...status);
    return r !== false;
  };

  // ---------------------------------------------------------------- fire patches
  const patchGeo = new THREE.PlaneGeometry(2, 2); patchGeo.rotateX(-Math.PI / 2);
  const patches = [];
  // opts: { status: [kind, level] (default small burn), drain (HP per 0.5 s tick), tint (hex), max (pool cap) }
  function addPatch(p, r = 2, l = 6, opts = {}) {
    if (patches.length > (opts.max || 40)) { const old = patches.shift(); scene.remove(old.mesh); old.mesh.material.dispose(); }
    const mesh = new THREE.Mesh(patchGeo, new THREE.MeshBasicMaterial({ map: scorch, color: opts.tint ?? 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.scale.setScalar(r * 1.25); mesh.rotation.y = Math.random() * Math.PI * 2; mesh.position.set(p.x, ground(p.x, p.z) + 0.08, p.z); mesh.renderOrder = 2; scene.add(mesh);
    const patch = { mesh, r, t: 0, life: l, tick: 0, status: opts.status || ['burn', 'small'], drain: opts.drain ?? 2, kind: opts.kind || 'fire' };
    patches.push(patch); return patch;
  }

  // ---------------------------------------------------------------- explosions
  const rocks = [];
  function explode(p, { radius = 6.5, damage = 48, knockback = 14, status = ['burn', 'large'], patch = true, big = true, patchOpts } = {}) {
    monster?.onFxBlast?.(p, radius); // e.g. a boss that is hurt by its own blasts
    puff(p.clone().setY(p.y + 0.6), big ? 90 : 45, big ? 16 : 10, big ? 1.0 : 0.7, 0.8);
    burst(p.clone().setY(p.y + 0.6), big ? 46 : 24, big ? 15 : 10, 1.1);
    world.spawnDust?.(p.clone(), big ? 2.6 : 1.3);
    flashes.push({ p: p.clone().setY(p.y + 1.5), i0: big ? 420 : 220, t: 0, dur: big ? 0.45 : 0.3 });
    events.emit('sfx', { name: 'slam', position: p.clone(), volume: big ? 1 : 0.75, source: 'monster' });
    events.emit('sfx', { name: 'breath', position: p.clone(), volume: big ? 0.8 : 0.5, source: 'monster' });
    const pl = game.player;
    if (pl) {
      const d = pl.position.distanceTo(p);
      events.emit('camera:shake', { intensity: clamp((big ? 1.1 : 0.6) - d / 40, 0.15, 1), duration: big ? 0.6 : 0.35 });
      if (d < radius) hurt({ damage: damage * (monster.enraged ? 1.15 : 1), knockback, from: p.clone(), kind: 'fire' }, status);
    }
    if (patch) addPatch(p, patchOpts?.r ?? (big ? 3.2 : 2), patchOpts?.life ?? (big ? 5 : 3.5), patchOpts);
    // chain reaction: nearby rocks blow shortly after
    for (const r of rocks) if (r.set && !r.dead && r.mesh.position.distanceTo(p) < 8.5) r.fuse = Math.min(r.fuse, r.t + 0.18 + Math.random() * 0.1);
  }

  // ---------------------------------------------------------------- rock bombs
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  { const a = rockGeo.attributes.position; for (let i = 0; i < a.count; i++) { const k = 0.8 + Math.random() * 0.35; a.setXYZ(i, a.getX(i) * k, a.getY(i) * k * 0.85, a.getZ(i) * k); } rockGeo.computeVertexNormals(); }
  // opts: { size (scale), color, emissive (THREE.Color), blast (explode() options), max (live cap), gravity }
  function spitRock(from, to, fuse = 3.4, opts = {}) {
    if (rocks.filter((r) => !r.dead).length >= (opts.max || 7)) return null;
    const mesh = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: opts.color ?? 0x2b211b, roughness: 0.92, metalness: 0.05, emissive: opts.emissive || new THREE.Color(1, 0.22, 0.05), emissiveIntensity: 0.25 }));
    mesh.castShadow = true; mesh.scale.setScalar(opts.size || 1.05); mesh.position.copy(from); scene.add(mesh);
    const flight = clamp(from.distanceTo(to) / 24, 0.45, 1.3); const v = new THREE.Vector3().subVectors(to, from).divideScalar(flight); v.y += 0.5 * 20 * flight;
    const r = { mesh, v, set: false, dead: false, t: 0, fuse, size: opts.size || 1.05, blast: opts.blast, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) };
    rocks.push(r); events.emit('sfx', { name: 'bite', position: from.clone(), volume: 0.5, source: 'monster' });
    return r;
  }
  function detonate(r, delay = 0) { if (r && !r.dead) r.fuse = Math.min(r.fuse, r.t + delay); }
  const liveRocks = () => rocks.filter((r) => !r.dead);

  // ---------------------------------------------------------------- fireballs
  const ballGeo = new THREE.SphereGeometry(0.75, 14, 10), ballMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  const balls = [];
  function spitFireball(from, to, { onImpact } = {}) {
    const mesh = new THREE.Mesh(ballGeo, ballMat); mesh.position.copy(from); scene.add(mesh);
    const flight = Math.max(0.45, from.distanceTo(to) / 28); const v = new THREE.Vector3().subVectors(to, from).divideScalar(flight); v.y += 0.5 * 18 * flight;
    balls.push({ mesh, v, t: 0, onImpact });
  }

  // ---------------------------------------------------------------- wind pressure ("dragon wind")
  function windBlast(center, radius = 10, stun = 2.2) {
    const c = center.clone(); c.y = ground(c.x, c.z);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; world.spawnDust?.(new THREE.Vector3(c.x + Math.cos(a) * radius * 0.6, c.y, c.z + Math.sin(a) * radius * 0.6), 0.9); }
    events.emit('sfx', { name: 'swingHeavy', position: c, volume: 0.9, source: 'monster' });
    const pl = game.player; if (pl && pl.position.distanceTo(c) < radius + 1) pl.receiveHit?.({ damage: 0, knockback: 0, from: c, kind: 'roar', stun });
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    requests = [];
    // flames
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt; const u = age[i] / life[i]; const k = i * 3;
      if (u >= 1) { life[i] = 0; pos[k + 1] = -9999; col[k] = col[k + 1] = col[k + 2] = 0; continue; }
      vel[k + 1] += 2.5 * dt; vel[k] *= 1 - dt * 1.8; vel[k + 2] *= 1 - dt * 1.8;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      const gy = ground(pos[k], pos[k + 2]); if (pos[k + 1] < gy + 0.3) { pos[k + 1] = gy + 0.3; vel[k + 1] = Math.abs(vel[k + 1]) * 0.2; }
      const f = (1 - u) ** 0.7;
      // hot yellow core → orange → deep red, kept below white so additive overlap + bloom doesn't blow out
      const f2 = f * 0.62;
      if (u < 0.12) { col[k] = f2; col[k + 1] = 0.72 * f2; col[k + 2] = 0.28 * f2; } else if (u < 0.5) { const t = (u - 0.12) / 0.38; col[k] = f2; col[k + 1] = (0.72 - 0.47 * t) * f2; col[k + 2] = (0.28 - 0.25 * t) * f2; } else { col[k] = 0.7 * f2; col[k + 1] = 0.13 * f2; col[k + 2] = 0.02 * f2; }
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    // sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.t += dt; const a = s.pts.geometry.attributes.position;
      for (let k = 0; k < s.v.length; k++) { s.v[k].y -= 12 * dt; a.setXYZ(k, a.getX(k) + s.v[k].x * dt, a.getY(k) + s.v[k].y * dt, a.getZ(k) + s.v[k].z * dt); }
      a.needsUpdate = true; s.pts.material.opacity = 1 - s.t / s.life;
      if (s.t > s.life) { scene.remove(s.pts); s.pts.geometry.dispose(); s.pts.material.dispose(); sparks.splice(i, 1); }
    }
    // rocks
    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i]; const p = r.mesh.position;
      if (r.dead) { rocks.splice(i, 1); continue; }
      if (!r.set) {
        r.v.y -= 20 * dt; p.addScaledVector(r.v, dt); r.mesh.rotation.x += r.spin.x * dt; r.mesh.rotation.y += r.spin.y * dt;
        emitFlame(p, _v.set(0, 1, 0), 0.35);
        const gy = ground(p.x, p.z);
        if (p.y <= gy + 0.8) { p.y = gy + 0.8; r.set = true; r.t = 0; world.spawnDust?.(p.clone().setY(gy), 0.8); events.emit('sfx', { name: 'thud', position: p.clone(), volume: 0.7, source: 'monster' }); }
        continue;
      }
      r.t += dt; const u = clamp(r.t / r.fuse, 0, 1);
      const late = u > 0.72 ? (Math.sin(r.t * (18 + 40 * (u - 0.72))) * 0.5 + 0.5) : 0;
      r.mesh.scale.setScalar(r.size * (1 + 0.57 * u * u + late * 0.06));
      r.mesh.material.emissiveIntensity = 0.3 + 3.2 * u * u + late * 2.5;
      if (Math.random() < dt * (3 + 20 * u)) emitFlame(p.clone().add(_v.set((Math.random() - 0.5) * 1.4, 0.8, (Math.random() - 0.5) * 1.4)), _v.set(0, 2 + 3 * u, 0), 0.5);
      requestLight(p.clone().setY(p.y + 1), 15 + 90 * u * u + late * 60);
      if (r.t >= r.fuse) { r.dead = true; scene.remove(r.mesh); r.mesh.material.dispose(); explode(p.clone().setY(ground(p.x, p.z)), r.blast); }
    }
    // fireballs
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i]; b.t += dt; b.v.y -= 18 * dt; b.mesh.position.addScaledVector(b.v, dt); const p = b.mesh.position;
      emitFlame(p, _v.set(-b.v.x * 0.05, 0.5, -b.v.z * 0.05), 0.45); requestLight(p.clone(), 70);
      const gy = ground(p.x, p.z);
      if (p.y <= gy + 0.5 || b.t > 4) {
        p.y = gy + 0.3; scene.remove(b.mesh); balls.splice(i, 1);
        explode(p.clone(), { radius: 4.2, damage: 34, knockback: 9, status: ['burn', 'small'], big: false });
        for (const r of rocks) if (!r.dead && r.mesh.position.distanceTo(p) < 4) detonate(r, 0.05);
        b.onImpact?.(p.clone());
      }
    }
    // fire patches
    const pl = game.player;
    for (let i = patches.length - 1; i >= 0; i--) {
      const f = patches[i]; f.t += dt; const u = f.t / f.life;
      f.mesh.material.opacity = (0.8 + Math.sin(f.t * 11 + i) * 0.15) * (1 - u * u);
      if (Math.random() < dt * 7 * f.r) emitFlame(f.mesh.position.clone().add(_v.set((Math.random() - 0.5) * f.r * 1.6, 0.2, (Math.random() - 0.5) * f.r * 1.6)), _v.set(0, 2.2, 0), 0.6);
      if (pl && !pl.dead && pl.position.distanceTo(f.mesh.position) < f.r + 0.3 && Math.abs(pl.position.y - f.mesh.position.y) < 1.5) {
        f.tick -= dt; if (f.tick <= 0) { f.tick = 0.5; game.status?.apply(...f.status); pl.drain?.(f.drain); }
      }
      if (f.t >= f.life) { scene.remove(f.mesh); f.mesh.material.dispose(); patches.splice(i, 1); }
    }
    // flashes + light assignment (brightest requests win the fixed pool)
    for (let i = flashes.length - 1; i >= 0; i--) { const fl = flashes[i]; fl.t += dt; const u = fl.t / fl.dur; if (u >= 1) { flashes.splice(i, 1); continue; } requestLight(fl.p, fl.i0 * (1 - u) ** 2, 0xffa050); }
    requests.sort((a, b) => b.intensity - a.intensity);
    pool.forEach((L, i) => { const r = requests[i]; if (r) { L.position.copy(r.p); L.intensity = r.intensity; L.color.setHex(r.color); } else L.intensity = 0; });
  }

  function dispose() {
    for (const r of rocks) { scene.remove(r.mesh); r.mesh.material.dispose(); } rocks.length = 0;
    for (const b of balls) scene.remove(b.mesh); balls.length = 0;
    for (const f of patches) { scene.remove(f.mesh); f.mesh.material.dispose(); } patches.length = 0;
    for (const s of sparks) { scene.remove(s.pts); s.pts.geometry.dispose(); } sparks.length = 0;
    scene.remove(flames); flames.geometry.dispose(); pool.forEach((L) => scene.remove(L));
  }

  const listPatches = () => patches;
  function removePatch(f) { const i = patches.indexOf(f); if (i >= 0) { patches.splice(i, 1); scene.remove(f.mesh); f.mesh.material.dispose(); } }
  return { listPatches, removePatch, emitFlame, puff, burst, spitRock, detonate, liveRocks, spitFireball, explode, addPatch, windBlast, hurt, requestLight, update, dispose };
}
