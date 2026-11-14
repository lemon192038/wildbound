// Offline portrait studio (driven by tools/render-portraits.mjs). Builds one boss with its real game code
// in an empty, dramatic scene and renders a 3/4 hero shot with a warm rim light. ?boss=varkhul|wyvern|brute
import * as THREE from 'three';
import { createMonster } from '/src/monster/monster.js';
import { createWyvern } from '/src/monster/wyvern.js';
import { createBrute } from '/src/monster/brute.js';

const boss = new URLSearchParams(location.search).get('boss') || 'varkhul';
const W = 1024, H = 768;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120806); scene.fog = new THREE.Fog(0x120806, 22, 70);
const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 500);

// lights: cool dim fill from the camera side, hot key/rim from behind-left, ember bounce from below
scene.add(new THREE.HemisphereLight(0x6d5a50, 0x2a0c04, 0.9));
const key = new THREE.DirectionalLight(0xffd2a0, 2.4); key.position.set(-14, 22, 10); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 }); scene.add(key);
const rim = new THREE.DirectionalLight(0xff7a2a, 5.5); rim.position.set(18, 10, -22); scene.add(rim);
const rim2 = new THREE.DirectionalLight(0xffb060, 2.2); rim2.position.set(-20, 6, -16); scene.add(rim2);
const bounce = new THREE.PointLight(0xff5a18, 25, 30, 1.6); bounce.position.set(0, 0.6, 4); scene.add(bounce);
// ground: dark basalt disc with an ember glow under the boss
const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0d0807, roughness: 0.95 }));
ground.receiveShadow = true; scene.add(ground);
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, 'rgba(255,120,40,0.9)'); r.addColorStop(0.4, 'rgba(200,50,10,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
const glow = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
glow.position.y = 0.03; scene.add(glow);

const events = { on() {}, off() {}, emit() {} };
const player = { id: 'local', position: new THREE.Vector3(0, 0, 40), hp: 100, maxHp: 100, dead: true, velocity: new THREE.Vector3(), object3d: new THREE.Group(), hit() {}, applyHit() {} };
const world = { getHeight: () => 0, spawn: { monster: new THREE.Vector3(0, 0, 0), player: new THREE.Vector3(0, 0, 40) }, bounds: { radius: 200 }, colliders: [], spawnDust() {}, update() {} };
const game = { THREE, scene, camera, renderer, events, world, params: new URLSearchParams('monsterFreeze=1'), player, monsters: [], remotePlayers: new Map(), updaters: [], addUpdater(f) { this.updaters.push(f); }, time: 0, peaceful: true };

const make = { varkhul: createMonster, wyvern: createWyvern, brute: createBrute }[boss];
const m = await make(game);
const obj = m.object3d; obj.position.set(0, obj.position.y, 0); obj.rotation.y = 0; if (m.yaw != null) m.yaw = 0;
obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
// let the idle animation settle (AI paused via monsterFreeze; errors in the stub world are non-fatal)
for (let i = 0; i < 40; i++) { try { m.update(1 / 30, 1 / 30); } catch (e) { if (i === 0) console.warn('update', e.message); break; } }
obj.position.x = 0; obj.position.z = 0; obj.rotation.y = 0; obj.updateMatrixWorld(true);

// frame: bounding box → 3/4 front view from slightly below eye height
const box = new THREE.Box3(); const _v = new THREE.Vector3();
obj.traverse((o) => { if (o.isBone) box.expandByPoint(o.getWorldPosition(_v)); });
if (box.isEmpty()) box.setFromObject(obj); box.expandByScalar(1.2); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
const shots = { varkhul: { az: 0.8, el: 0.1, dist: 1.0, yo: 0.0, sx: -0.13, sy: 0.02 }, wyvern: { az: 0.65, el: 0.06, dist: 0.85, yo: 0.0, sx: 0.0, sy: 0.06 }, brute: { az: 0.65, el: 0.12, dist: 0.62, yo: 0.0, sx: 0.0, sy: 0.08 } }[boss];
const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.quaternion); // model faces +Z
const radius = Math.max(size.x, size.y, size.z) * 0.62;
const d = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * shots.dist;
const dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), shots.az).setY(shots.el).normalize();
camera.position.copy(c).addScaledVector(dir, d); camera.position.y = Math.max(1.2, camera.position.y);
console.log('box', JSON.stringify(box.min), JSON.stringify(box.max));
camera.lookAt(c.x, c.y + size.y * shots.yo, c.z);
rim.position.copy(c).add(new THREE.Vector3(-dir.x * 25 + 8, 14, -dir.z * 25));
glow.position.set(c.x, 0.03, c.z);
camera.setViewOffset(W, H, shots.sx * W, shots.sy * H, W, H);
renderer.render(scene, camera);
window.__shot = { boss, size: size.toArray(), center: c.toArray() };
window.__done = true;
