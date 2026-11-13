// Isolated dev harness for the monster (not used by the game). Open /src/monster/dev/test.html
// Gives a stub world (rolling hills, a rock collider), a dummy hunter, bloom, and window.__game / __monster.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Events } from '../../core/events.js';
import { createMonster } from '../monster.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb4c8); scene.fog = new THREE.Fog(0x9fb4c8, 60, 260);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
const sun = new THREE.DirectionalLight(0xfff0dd, 3.2); sun.position.set(40, 60, 25); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 }); sun.shadow.bias = -0.0005;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xcfe0ff, 0x4a4030, 1.1));
const H = (x, z) => Math.sin(x * 0.045) * Math.cos(z * 0.038) * 2.2 + Math.sin(x * 0.11 + z * 0.07) * 0.6;
const g = new THREE.PlaneGeometry(400, 400, 200, 200); g.rotateX(-Math.PI / 2);
const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i))); g.computeVertexNormals();
const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x5d6b45, roughness: 0.95 })); ground.receiveShadow = true; scene.add(ground);
const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3), new THREE.MeshStandardMaterial({ color: 0x777066 })); rock.position.set(18, H(18, -10), -10); rock.castShadow = true; scene.add(rock);
const params = new URLSearchParams(location.search);
const events = new Events();
const hunter = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.8, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3366aa }));
hunter.castShadow = true; scene.add(hunter);
const hp0 = params.get('hunter')?.split(',').map(Number) || [0, 12];
hunter.position.set(hp0[0], H(hp0[0], hp0[1]) + 0.9, hp0[1]);
const log = []; window.__log = log;
for (const ev of ['monster:roar', 'monster:partBreak', 'monster:died', 'monster:state', 'camera:shake', 'footstep']) events.on(ev, (e) => log.push([ev, e?.state || e?.part || '', +performance.now().toFixed(0)]));
const game = {
  THREE, scene, camera, renderer, events, params, monsters: [], remotePlayers: new Map(), updaters: [], time: 0,
  engine: { hitstop: 0, timeScale: 1 },
  world: { getHeight: H, getNormal: () => new THREE.Vector3(0, 1, 0), bounds: { radius: 180 }, sun, spawn: { player: hunter.position.clone(), monster: new THREE.Vector3(0, 0, -6) },
    colliders: [{ x: 18, z: -10, r: 3 }], spawnDust: (pos, n) => log.push(['dust', +n.toFixed(2)]), spawnSplash() {} },
  player: { id: 'local', position: hunter.position, hp: 150, receiveHit: (h) => { log.push(['playerHit', h.damage, h.kind]); return true; } },
};
game.cameraRig = { shake() {}, update() {} };
window.__game = game;
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.9)); composer.addPass(new OutputPass());
const m = await createMonster(game); game.monsters.push(m);
window.CAM = window.CAM || [35, 20, 5, 3];
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; game.time += dt;
  m.update(dt, dt);
  const C = window.CAM, a = m.yaw + C[0] * Math.PI / 180, q = m.position;
  const f = C[4] || 0, fx = q.x + Math.sin(m.yaw) * f, fz = q.z + Math.cos(m.yaw) * f;
  camera.position.set(fx + Math.sin(a) * C[1], q.y + C[2], fz + Math.cos(a) * C[1]); camera.lookAt(fx, q.y + C[3], fz);
  sun.position.set(q.x + 40, 60, q.z + 25); sun.target.position.copy(q);
  composer.render(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;
