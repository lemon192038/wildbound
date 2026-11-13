import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { createWorld } from './world/world.js';
import { createPost } from './world/post.js';
import { createMonster } from './monster/monster.js';
import { createWyvern } from './monster/wyvern.js';
import { createBrute } from './monster/brute.js';
import { createPlayer } from './player/player.js';
import { createCameraRig } from './player/camera.js';
import { createNet } from './net/client.js';
import { createUI } from './ui/ui.js';
import { createAudio } from './audio/audio.js';
import { TouchControls, isTouchDevice } from './core/touch.js';
import { createQuest } from './core/quest.js';
import { createAccount } from './account/client.js';
import { prepareQuest, startQuestRuntime } from './field/questRuntime.js';
import { createStatus } from './core/status.js';

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

// Modes: the hunting field (existing combat: ?mode=field / ?quest=… / legacy ?hunt=…) and the harbour
// town hub (default). Switching modes is a page navigation, so each mode boots clean (no teardown leaks).
game.mode = game.params.get('mode') === 'field' || game.params.has('quest') || game.params.has('hunt') ? 'field' : 'town';

function startLoop(step) {
  let last = performance.now();
  function frame(now) {
    const { dt, rawDt } = engine.tick(Math.max(0, (now - last) / 1000)); last = now;
    const input = game.input.poll();
    game.time = engine.elapsed;
    step(dt, rawDt, input);
    engine.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__ready = true;
}

async function bootField() {
  const questCtx = await prepareQuest(game);     // ?quest=<iid>: server-validated expedition (null = free hunt)
  game.world = await createWorld(game);          // terrain, sky, lighting, foliage, water, getHeight(x,z)
  engine.post = createPost(game);                // composer: SSAO/bloom/color grade/etc.
  game.player = await createPlayer(game);        // local hunter: model, animation, combat
  const status = createStatus(game);             // burn / poison ailments on the local hunter
  game.addUpdater((dt) => status.update(dt));
  game.cameraRig = createCameraRig(game);        // third-person orbit cam, lock-on, shake
  // Quest target: ?hunt=wyvern → Cindral (flying, user-made mesh), ?hunt=brute → Gorvath, default → Varkhul.
  game.hunt ||= ['wyvern', 'brute'].includes(game.params.get('hunt')) ? game.params.get('hunt') : 'varkhul';
  const makeMonster = (g) => ({ wyvern: createWyvern, brute: createBrute }[g.hunt] || createMonster)(g);
  game.monsters.push(await makeMonster(game)); // boss monster: model, AI, hitzones
  game.audio = createAudio(game);                // procedural WebAudio sfx + music
  game.ui = createUI(game);                      // HUD, damage numbers, menus
  game.net = createNet(game);                    // co-op sync via websocket (optional)
  if (questCtx) startQuestRuntime(game, questCtx); // objectives, gathering, items, report → rewards
  else { const quest = createQuest(game, makeMonster); game.addUpdater((dt) => quest.update(dt)); } // free hunt: respawn loop
  if (game.input.touch) {
    if (game.params.get('shot') === '1') game.input.touch.show();
    else game.events.on('ui:start', () => game.input.touch.show());
  }
  game.events.on('hitstop', ({ duration }) => { engine.hitstop = Math.max(engine.hitstop, duration); });
  startLoop((dt, rawDt, input) => {
    game.world.update(dt, rawDt);
    game.player.update(dt, input, rawDt);
    for (const m of game.monsters) m.update(dt, rawDt);
    for (const fn of game.updaters) fn(dt, rawDt);
    game.cameraRig.update(rawDt, input);
    game.net.update(dt, rawDt);
    game.audio.update(dt, rawDt);
    game.ui.update(dt, rawDt);
  });
}

game.account = createAccount(game);            // server-side accounts & economy (src/account/client.js)

async function bootTown() {
  const [{ createTown }, { createTownHud }] = await Promise.all([import('./town/town.js'), import('./town/townHud.js')]);
  game.peaceful = true;                          // no weapon use in town
  if (!game.params.has('ao')) game.params.set('ao', '0'); // GTAO veils the wide harbour vistas; the town ships its own contact shading
  game.world = await createTown(game);           // harbour city: buildings, NPCs, interactables, getHeight(x,z)
  engine.post = createPost(game);
  game.player = await createPlayer(game);
  game.cameraRig = createCameraRig(game);
  game.audio = createAudio(game);
  game.net = { update() {}, connected: false, id: 'local', roomPlayers: [] };
  // Town input: weapons/items/lock-on are disabled; E / touch "TALK" is routed to the town HUD.
  const poll = game.input.poll.bind(game.input);
  game.input.poll = () => { const s = poll(); game.townInteract = !!s.interact; s.lightAttack = s.heavyAttack = s.heavyHeld = s.item = s.lockOn = s.interact = s.guard = false; return s; };
  game.ui = createTownHud(game);                 // coins, prompts, facility panels
  if (game.input.touch) { game.input.touch.show(); game.input.touch.setPeaceful(true); }
  startLoop((dt, rawDt, input) => {
    game.world.update(dt, rawDt);
    game.player.update(dt, input, rawDt);
    for (const fn of game.updaters) fn(dt, rawDt);
    game.cameraRig.update(rawDt, input);
    game.audio.update(dt, rawDt);
    game.ui.update(dt, rawDt);
  });
}

(game.mode === 'field' ? bootField() : bootTown()).catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66;position:fixed;top:0;left:0;z-index:9">${e.stack}</pre>`); });
