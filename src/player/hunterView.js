// HunterView: model + animator + IK + cloth + weapon attachment. Shared by the local player and remote hunters.
import * as THREE from 'three';
import { buildHunter } from './model.js';
import { Animator, sampleClip, sampleLoco, applyTuck, twoBoneIK, setWorldQuat, POSE_SIZE, OK, CLIPS } from './anim.js';
import { ClothStrip } from './cloth.js';
import { BLADE } from './weapon.js';

const GENERIC = new Set(['dodge', 'hit', 'knockdown', 'getup', 'dead']);
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _s = new THREE.Vector3();
const _g = new THREE.Vector3(), _w = new THREE.Vector3(), _hq = new THREE.Quaternion(), _pole = new THREE.Vector3(), _a = new THREE.Vector3(), _k = new THREE.Vector3(), _f = new THREE.Vector3();
const _fq = new THREE.Quaternion(), _inv = new THREE.Quaternion();

export class HunterView {
  constructor(game, tint) {
    this.game = game;
    this.rig = buildHunter(game, tint);
    this.root = this.rig.root;
    this.animator = new Animator(this.rig);
    this.flat = new Float32Array(POSE_SIZE);
    this.anim = 'loco'; this.inHand = false; this.time = 0; this.glow = 0;
    this.colliders = Array.from({ length: 16 }, () => ({ c: new THREE.Vector3(), r: 0.1 }));
    const { bones, mats } = this.rig;
    const flap = (front) => new ClothStrip({ anchorBone: bones.hips, cols: 5, rows: 7, material: mats.cloth,
      rest: (c, r) => new THREE.Vector3((c / 4 - 0.5) * (0.25 - r * 0.006), -0.03 - r * 0.068, front ? 0.188 + 0.006 * r : -0.19 - 0.006 * r),
      stiffness: (r) => 0.05 + 0.03 / (r + 1) });
    this.cloth = [flap(true), flap(false),
      new ClothStrip({ anchorBone: bones.chest, cols: 7, rows: 8, material: mats.clothDark,
        rest: (c, r) => { const u = c / 6 - 0.5, w = 0.3 + r * 0.022; return new THREE.Vector3(u * w, 0.21 - r * 0.082, -0.158 + 0.07 * (2 * u) ** 2 * Math.max(0, 1 - r / 2) - 0.004 * r); },
        stiffness: (r) => 0.025 + 0.04 / (r + 1) })];
    for (const c of this.cloth) game.scene.add(c.mesh);
    this.hipDropS = 0;
    this.light = new THREE.PointLight(0xff7a2a, 0, 4, 2); this.rig.weapon.add(this.light); this.light.position.set(0, 0.9, 0.45);
  }
  setInHand(v) {
    if (v === this.inHand) return; this.inHand = v;
    const { weapon, bones, sockets } = this.rig, s = v ? sockets.hand : sockets.back;
    (v ? bones.handR : bones.chest).add(weapon); weapon.position.copy(s.pos); weapon.quaternion.copy(s.quat);
    this.rig.harness.forEach((m) => { m.visible = !v; }); // scabbard straps only make sense with the blade on the back
  }
  play(name, fade = 0.15) { if (name !== this.anim) { this.anim = name; this.animator.crossfade(fade); } }
  setGlow(level, t) {
    const g = this.rig.weapon.userData, target = level > 0 ? 0.45 + level * 0.25 + Math.sin(t * 30) * 0.08 : 0;
    this.glow += (target - this.glow) * 0.3;
    g.glowMat.opacity = this.glow; g.glow.forEach((m) => { m.visible = this.glow > 0.01; });
    this.light.intensity = this.glow * 2.5;
    const bm = this.rig.mats.blade; bm.emissive.setRGB(1, 0.35, 0.08); bm.emissiveIntensity = this.glow * 0.12;
  }
  resetCloth() { this.cloth.forEach((c) => c.reset()); }
  // params: { t, phase, amt, sprint, drawn, tremble }
  update(dt, P) {
    const { rig, animator, flat } = this, game = this.game, ground = game.world.getHeight;
    this.time += dt;
    if (this.anim === 'loco') sampleLoco(flat, P.phase || 0, P.amt || 0, P.drawn, P.sprint, this.time);
    else sampleClip(this.anim, P.t || 0, flat);
    if (this.inHand && GENERIC.has(this.anim)) applyTuck(flat, 0);
    if (!this.inHand && !CLIPS[this.anim]?.keys.some((k) => k.w && k.w !== 'back') && this.anim !== 'draw' && this.anim !== 'sheathe') flat[OK + 1] = 0;
    if (P.tremble) { const n = Math.sin(this.time * 63) * P.tremble, m = Math.cos(this.time * 51) * P.tremble; flat[POSE_SIZE - 12] += n * 0.01; flat[POSE_SIZE - 11] += m * 0.01; }
    animator.apply(flat, dt);
    // terrain hip drop (from last frame's foot ground deltas)
    animator.hipDrop = this.hipDropS * animator.outK[2];
    animator.writeBones();
    this.root.updateMatrixWorld(true);
    this._armIK();
    this._legIK(ground);
    this._clothUpdate(dt, ground);
  }
  _armIK() {
    const { bones, sockets, weapon } = this.rig, K = this.animator.outK;
    if (K[0] < 0.001 && K[1] < 0.001) return;
    bones.chest.matrixWorld.decompose(_p, _qc, _s);
    _g.copy(this.animator.outG).applyMatrix4(bones.chest.matrixWorld);
    _q.copy(_qc).multiply(this.animator.outWQ);
    _inv.copy(sockets.hand.quat).invert();
    if (K[0] > 0.001) {
      _hq.copy(_q).multiply(_inv);
      _w.copy(sockets.hand.pos).applyQuaternion(_hq); _w.subVectors(_g, _w);
      _pole.set(-0.55, -0.35, -0.5).applyMatrix4(bones.chest.matrixWorld);
      twoBoneIK(bones.upperArmR, bones.foreArmR, bones.handR, _w, _pole, K[0]);
      setWorldQuat(bones.handR, _hq, K[0]);
    }
    if (K[1] > 0.001) {
      if (this.inHand) { weapon.updateMatrixWorld(true); weapon.matrixWorld.decompose(_g, _q, _s); }
      _a.set(0, BLADE.grip2, 0).applyQuaternion(_q).add(_g);
      _hq.copy(_q).multiply(_inv);
      _w.copy(sockets.hand.pos).applyQuaternion(_hq); _w.subVectors(_a, _w);
      _pole.set(0.6, -0.4, -0.3).applyMatrix4(bones.chest.matrixWorld);
      twoBoneIK(bones.upperArmL, bones.foreArmL, bones.handL, _w, _pole, K[1]);
      setWorldQuat(bones.handL, _hq, K[1]);
    }
  }
  _legIK(ground) {
    const { bones } = this.rig, wgt = this.animator.outK[2], rootY = this.root.position.y;
    let minD = 0;
    _f.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
    for (const L of ['L', 'R']) {
      const thigh = bones['thigh' + L], shin = bones['shin' + L], foot = bones['foot' + L];
      _a.setFromMatrixPosition(foot.matrixWorld);
      const gy = ground(_a.x, _a.z), d = gy - rootY; minD = Math.min(minD, d);
      if (wgt < 0.001) continue;
      foot.matrixWorld.decompose(_p, _fq, _s);
      const t = _a.clone(); t.y = Math.max(_a.y + this.animator.hipDrop + d, gy + 0.072);
      if (Math.abs(t.y - _a.y) < 0.002) continue;
      _k.setFromMatrixPosition(shin.matrixWorld).addScaledVector(_f, 0.5);
      twoBoneIK(thigh, shin, foot, t, _k, wgt);
      setWorldQuat(foot, _fq, wgt);
    }
    this.hipDropS += (Math.min(0.35, -minD) - this.hipDropS) * 0.25;
  }
  _clothUpdate(dt, ground) {
    const { bones, weapon } = this.rig, C = this.colliders; let n = 0;
    const put = (bone, x, y, z, r) => { const c = C[n++]; c.c.set(x, y, z).applyMatrix4(bone.matrixWorld); c.r = r; };
    put(bones.chest, 0, 0.08, -0.01, 0.205); put(bones.chest, 0, -0.04, 0.0, 0.19); put(bones.spine, 0, 0.0, 0, 0.175); put(bones.hips, 0, -0.03, 0, 0.18);
    for (const L of ['L', 'R']) {
      put(bones['thigh' + L], 0, -0.06, 0.0, 0.105); put(bones['thigh' + L], 0, -0.22, 0.01, 0.1); put(bones['thigh' + L], 0, -0.38, 0.01, 0.085);
      put(bones['shin' + L], 0, -0.12, 0, 0.075);
    }
    if (!this.inHand) { for (const k of [1, 3, 5]) { const c = C[n++]; c.c.copy(weapon.userData.samples[k]).applyMatrix4(weapon.matrixWorld); c.r = 0.06; } }
    const active = C.slice(0, n);
    for (const c of this.cloth) c.update(dt, active, ground);
  }
  bladeWorld(out = []) {
    const w = this.rig.weapon; w.updateMatrixWorld(true);
    w.userData.samples.forEach((p, i) => { (out[i] ||= new THREE.Vector3()).copy(p).applyMatrix4(w.matrixWorld); });
    return out;
  }
  dispose() {
    this.game.scene.remove(this.root); for (const c of this.cloth) { this.game.scene.remove(c.mesh); c.mesh.geometry.dispose(); }
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}
