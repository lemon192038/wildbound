// Isolated test bench for the player module (flat ground + monster stub). Not used by the game.
import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { Input } from '../core/input.js';
import { Events } from '../core/events.js';
import { createPlayer } from './player.js';
import { createCameraRig } from './camera.js';
const engine = new Engine();
const game = { THREE, engine, scene: engine.scene, camera: engine.camera, renderer: engine.renderer, events: new Events(), input: new Input(engine.renderer.domElement),
  params: new URLSearchParams(location.search), monsters: [], remotePlayers: new Map(), updaters: [], addUpdater(f) { this.updaters.push(f); } };
window.__game = game;
const { scene } = game;
scene.background = new THREE.Color(0x8fa9c0); scene.fog = new THREE.Fog(0x8fa9c0, 30, 120);
const sun = new THREE.DirectionalLight(0xfff2dd, 3.2); sun.position.set(-8, 14, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 50 }); sun.shadow.bias = -0.0005;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xc8dcff, 0x4a4030, 1.1));
const hill = (x, z) => game.params.get('flat') ? 0 : Math.sin(x * 0.15) * 0.6 + Math.cos(z * 0.13) * 0.5;
const g = new THREE.PlaneGeometry(120, 120, 120, 120); g.rotateX(-Math.PI / 2);
const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, hill(p.getX(i), p.getZ(i))); g.computeVertexNormals();
const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x5d6b42, roughness: 0.95 })); ground.receiveShadow = true; scene.add(ground);
game.world = { update() {}, getHeight: hill, getNormal: () => new THREE.Vector3(0, 1, 0), bounds: { radius: 55 }, sun, spawn: { player: new THREE.Vector3(0, 0, 6), monster: new THREE.Vector3(0, 0, -2) }, colliders: [{ x: 6, z: 4, r: 1 }], spawnDust() {}, spawnSplash() {} };
const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ color: 0x777777 })); rock.position.set(6, 0.5, 4); scene.add(rock);
// monster stub
const mo = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), new THREE.MeshStandardMaterial({ color: 0x7a3b2a, roughness: 0.7 })); mo.position.set(0, 1.4, -2); mo.castShadow = true; scene.add(mo);
const mon = { object3d: mo, position: mo.position, hp: 5000, maxHp: 5000, name: 'Stub', parts: [{ name: 'body', hp: 5000, broken: false, hitzone: 1 }], state: 'idle', hits: [],
  update() {}, getHitboxes: () => [{ part: 'body', sphere: new THREE.Sphere(mo.position, 1.4) }], getAttackHitboxes: () => [],
  receiveHit(h) { mon.hits.push(h); mon.hp -= h.damage; return { damage: Math.round(h.damage) }; }, serialize: () => ({}), applyRemote() {} };
game.monsters.push(mon);
if (game.params.get('nomon')) { mo.visible = false; mon.position.set(0, -50, -40); }
game.player = await createPlayer(game);
game.cameraRig = createCameraRig(game);
game.events.on('hitstop', ({ duration }) => { engine.hitstop = Math.max(engine.hitstop, duration); });
let last = performance.now();
function frame(now) {
  const { dt, rawDt } = engine.tick((now - last) / 1000); last = now; game.time = engine.elapsed;
  const input = game.input.poll();
  game.player.update(dt, input, rawDt); for (const f of game.updaters) f(dt, rawDt); game.cameraRig.update(rawDt, input);
  engine.render(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame); window.__ready = true;
