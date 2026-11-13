import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { createWorld } from './world/world.js';
import { createPost } from './world/post.js';
import { createMonster } from './monster/monster.js';
import { createWyvern } from './monster/wyvern.js';
import { createPlayer } from './player/player.js';
import { createCameraRig } from './player/camera.js';
import { createNet } from './net/client.js';
import { createUI } from './ui/ui.js';
import { createAudio } from './audio/audio.js';
import { TouchControls, isTouchDevice } from './core/touch.js';
import { createQuest } from './core/quest.js';

// The shared `game` context. Every module receives it; see CONTRACTS.md.
const engine = new Engine();
const game = {
  THREE, engine, scene: engine.scene, camera: engine.camera, renderer: engine.renderer,
  events: new Events(), input: new Input(engine.renderer.domElement),
  params: new URLSearchParams(location.search), monsters: [], remotePlayers: new Map(), updaters: [],
  // Deterministic tests/screenshots: ?shot=1 freezes UI intro, ?seed=N
  addUpdater(fn) { this.updaters.push(fn); },
};
window.__game = game;
// Tablets/phones: touch controls, low-cost render path and capped resolution unless ?hq=1.
const touch = isTouchDevice() || game.params.get('touch') === '1';
if (touch) {
  game.input.touch = new TouchControls();
  if (game.params.get('hq') !== '1' && !game.params.has('low')) game.params.set('low', '1');
  engine.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  engine.renderer.setSize(innerWidth, innerHeight);
} // debugging / automated critic hooks

async function boot() {
  game.world = await createWorld(game);          // terrain, sky, lighting, foliage, water, getHeight(x,z)
  engine.post = createPost(game);                // composer: SSAO/bloom/color grade/etc.
  game.player = await createPlayer(game);        // local hunter: model, animation, combat
  game.cameraRig = createCameraRig(game);        // third-person orbit cam, lock-on, shake
  // Quest target: ?hunt=wyvern → Cindral (flying, user-made mesh), default → Varkhul.
  game.hunt = game.params.get('hunt') === 'wyvern' ? 'wyvern' : 'varkhul';
  const makeMonster = (g) => (g.hunt === 'wyvern' ? createWyvern : createMonster)(g);
  game.monsters.push(await makeMonster(game)); // boss monster: model, AI, hitzones
  game.audio = createAudio(game);                // procedural WebAudio sfx + music
  game.ui = createUI(game);                      // HUD, damage numbers, menus
  game.net = createNet(game);                    // co-op sync via websocket (optional)
  const quest = createQuest(game, makeMonster);   // complete → respawn loop (src/core/quest.js)
  game.addUpdater((dt) => quest.update(dt));
  if (game.input.touch) {
    if (game.params.get('shot') === '1') game.input.touch.show();
    else game.events.on('ui:start', () => game.input.touch.show());
  }
  game.events.on('hitstop', ({ duration }) => { engine.hitstop = Math.max(engine.hitstop, duration); });

  let last = performance.now();
  function frame(now) {
    const { dt, rawDt } = engine.tick(Math.max(0, (now - last) / 1000)); last = now;
    const input = game.input.poll();
    game.time = engine.elapsed;
    game.world.update(dt, rawDt);
    game.player.update(dt, input, rawDt);
    for (const m of game.monsters) m.update(dt, rawDt);
    for (const fn of game.updaters) fn(dt, rawDt);
    game.cameraRig.update(rawDt, input);
    game.net.update(dt, rawDt);
    game.audio.update(dt, rawDt);
    game.ui.update(dt, rawDt);
    engine.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__ready = true;
}
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66;position:fixed;top:0;left:0;z-index:9">${e.stack}</pre>`); });
