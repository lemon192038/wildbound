// Grappling hook (user spec §11-5): targeting, rope drawing, cooldown display. The pull physics and the player states
// (ropeFire → ropePull → release into the air) live in player.js so they share velocity, gravity and landing.
//
// Controls: hold ROPE (touch button / G key / gamepad LB) and double-tap (touch) / double-click (mouse) the target —
// with the mouse captured or on a gamepad (A while holding LB) the hook goes where the crosshair points.
// Targets: ground, walls (steep terrain), trees, rocks, monsters, fauna. Each kind is switchable in GRAPPLE.targets and
// any collider can opt out with `grapple: false`. Lava, sea and crystals are refused. The rope deals no damage.
import * as THREE from 'three';
import { t } from '../shared/i18n.js';

export const GRAPPLE = {
  range: 40, cooldown: 5, fly: 0.22, maxPull: 3.2,
  targets: { ground: true, wall: true, tree: true, rock: true, ruin: true, monster: true, fauna: true, crystal: false, lava: false, water: false },
  // collider kind (src/world/island/props.js) → target kind
  kindOf: { pine: 'tree', deadtree: 'tree', fungus: 'tree', boulder: 'rock', pillar: 'rock', crystal: 'crystal', ruin: 'ruin', twistedTree: 'tree', charredGiant: 'tree', palm: 'tree', spire: 'rock', rockArch: 'rock', leaningSlab: 'rock', cairn: 'rock', obsidianShard: 'crystal', crystalSpire: 'crystal', ruinColumn: 'ruin', ruinWall: 'ruin' },
};

export function createGrapple(game) {
  const { scene } = game;
  // ---- rope: a camera-facing ribbon, 24 segments, rebuilt in place each frame
  const N = 24, pos = new Float32Array((N + 1) * 2 * 3), idx = [];
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const rope = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8a6a42, side: THREE.DoubleSide }));
  rope.frustumCulled = false; rope.visible = false; rope.name = 'grapple-rope'; scene.add(rope);
  const hook = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x9a9aa2, metalness: 0.8, roughness: 0.35 }));
  hook.visible = false; scene.add(hook);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Vector3();

  // ---- HUD: crosshair while aiming, cooldown text
  let hud = null, cross = null;
  if (typeof document !== 'undefined') {
    const root = document.getElementById('ui-root') || document.body;
    hud = document.createElement('div'); hud.style.cssText = 'position:fixed;left:50%;bottom:19%;transform:translateX(-50%);z-index:12;padding:.25em .8em;border-radius:4px;background:rgba(10,7,4,.7);color:#f6e2aa;font:600 13px Georgia,serif;letter-spacing:.06em;pointer-events:none;display:none';
    cross = document.createElement('div'); cross.style.cssText = 'position:fixed;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid rgba(246,226,170,.9);border-radius:50%;z-index:12;pointer-events:none;display:none;box-shadow:0 0 6px rgba(0,0,0,.6)';
    root.appendChild(hud); root.appendChild(cross);
  }
  let hudKey = '';
  function showHud(text) { if (!hud || hudKey === text) return; hudKey = text; hud.style.display = text ? 'block' : 'none'; hud.textContent = text; }

  // ---- targeting: a ray through the tapped screen point (or the crosshair)
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function pick(screen, from) {
    const cam = game.camera; const W = innerWidth, H = innerHeight;
    if (screen === 'center' || !screen) ndc.set(0, 0); else ndc.set((screen.x / W) * 2 - 1, -(screen.y / H) * 2 + 1);
    ray.setFromCamera(ndc, cam); const o = ray.ray.origin, d = ray.ray.direction;
    const maxT = GRAPPLE.range + o.distanceTo(from) + 5; let best = null;
    const consider = (tHit, kind, extra) => { if (tHit > 0 && tHit < maxT && (!best || tHit < best.tHit) && GRAPPLE.targets[kind]) best = { tHit, kind, ...extra }; };
    // monsters & fauna: hit spheres
    const bodies = (game.monsters || []).concat(game.fauna?.near ? game.fauna.near(from, GRAPPLE.range) : []);
    for (const m of bodies) {
      if (!m || m.hp <= 0 || m.state === 'dead' || m.dead || m.grapple === false) continue;
      for (const hb of m.getHitboxes?.() || []) {
        const c = hb.sphere.center, r = hb.sphere.radius; _c.subVectors(o, c); const b = _c.dot(d), q = _c.lengthSq() - r * r, disc = b * b - q;
        if (disc < 0) continue; const th = -b - Math.sqrt(disc);
        consider(th, m.isFauna ? 'fauna' : 'monster', { target: m, part: hb.part, offset: _p.copy(o).addScaledVector(d, th).sub(c).clone() });
      }
    }
    // trees / rocks / ruins: vertical cylinders
    for (const c of game.world.colliders || []) {
      if (c.grapple === false || Math.abs(c.x - from.x) > GRAPPLE.range || Math.abs(c.z - from.z) > GRAPPLE.range) continue;
      const kind = GRAPPLE.kindOf[c.kind] || 'ruin';
      const ox = o.x - c.x, oz = o.z - c.z, A = d.x * d.x + d.z * d.z, B2 = ox * d.x + oz * d.z, Cc = ox * ox + oz * oz - c.r * c.r, disc = B2 * B2 - A * Cc;
      if (A < 1e-6 || disc < 0) continue; const th = (-B2 - Math.sqrt(disc)) / A; if (th <= 0) continue;
      const y = o.y + d.y * th, base = game.world.getHeight(c.x, c.z); if (y < base || y > base + (c.h || 6)) continue;
      consider(th, kind, { collider: c });
    }
    // terrain: march, then bisect
    let prevT = 0;
    for (let tt = 1; tt < maxT; tt += 0.6) {
      _a.copy(o).addScaledVector(d, tt);
      if (_a.y < game.world.getHeight(_a.x, _a.z)) {
        let lo = prevT, hi = tt; for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; _a.copy(o).addScaledVector(d, mid); if (_a.y < game.world.getHeight(_a.x, _a.z)) hi = mid; else lo = mid; }
        _a.copy(o).addScaledVector(d, hi);
        let kind = 'ground'; const n = game.world.getNormal?.(_a.x, _a.z, _b) || _b.set(0, 1, 0); if (n.y < 0.6) kind = 'wall';
        if (game.world.lavaAt?.(_a.x, _a.z)) kind = 'lava'; else if (game.world.canWalk && !game.world.canWalk(_a.x, _a.z)) kind = 'water';
        if (best && hi >= best.tHit) break;
        if (!GRAPPLE.targets[kind]) { best = { tHit: hi, kind, refused: true }; break; }
        consider(hi, kind, {}); break;
      }
      prevT = tt;
    }
    if (!best || best.refused) return best ? { refused: best.kind } : null;
    const point = new THREE.Vector3().copy(o).addScaledVector(d, best.tHit);
    if (point.distanceTo(from) > GRAPPLE.range) return { refused: 'range' };
    return { point, kind: best.kind, target: best.target || null, part: best.part || null, offset: best.offset || null };
  }
  // anchor in world space for this frame (follows a moving monster); null when the target is gone
  function anchorOf(A, out) {
    if (!A.target) return out.copy(A.point);
    const m = A.target; if (m.hp <= 0 || m.state === 'dead' || m.dead) return null;
    const hb = (m.getHitboxes?.() || []).find((h) => h.part === A.part); if (!hb) return null;
    return out.copy(hb.sphere.center).add(A.offset);
  }
  // rope from the waist to the anchor; slack sags, a taut rope is straight
  function draw(waist, anchor, tension, hookAt = 1) {
    rope.visible = hook.visible = true;
    _t.subVectors(anchor, waist); const len = _t.length(); const end = _b.copy(waist).addScaledVector(_t, hookAt);
    const camPos = game.camera.position; const sag = len * 0.18 * (1 - tension);
    for (let i = 0; i <= N; i++) {
      const u = i / N; _p.lerpVectors(waist, end, u); _p.y -= Math.sin(Math.PI * u) * sag;
      const g = game.world.getHeight(_p.x, _p.z) + 0.08; if (_p.y < g) _p.y = g;                 // never through the ground
      _a.subVectors(camPos, _p); _s.crossVectors(_t, _a).normalize().multiplyScalar(0.022);
      pos.set([_p.x - _s.x, _p.y - _s.y, _p.z - _s.z, _p.x + _s.x, _p.y + _s.y, _p.z + _s.z], i * 6);
    }
    geo.attributes.position.needsUpdate = true; geo.computeBoundingSphere();
    hook.position.copy(end); hook.quaternion.setFromUnitVectors(_a.set(0, 1, 0), _c.copy(_t).normalize());
  }
  function hide() { rope.visible = hook.visible = false; }
  function hudUpdate(aiming, cooldownLeft, pointer) {
    if (cross) cross.style.display = aiming && pointer ? 'block' : 'none';
    showHud(cooldownLeft > 0 ? t('rope.cooldown', { s: Math.ceil(cooldownLeft) }) : aiming ? t('rope.aim') : '');
  }
  return { pick, anchorOf, draw, hide, hudUpdate, rope, GRAPPLE };
}
