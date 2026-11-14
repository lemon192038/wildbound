// Departure dock → the captain's world map. The window body hosts a persistent world-map component
// (src/ui/town/worldMap.js) that survives the HUD's HTML re-renders: render() returns a mount point and the
// map node (canvas, view state, drawer) is re-attached to it right after every render.
// Picking a destination opens the boss field guide; departing sends acct.act('depart', {mode, dest}).
import { createWorldMap, fieldUrl } from './worldMap.js';
import { t } from '../../shared/i18n.js';

export { fieldUrl };
export function createDockPanel(ctx) {
  let map = null;
  const getMap = () => (map ||= createWorldMap(ctx));
  // Prewarm the chart painting while the hunter walks up to the captain (the paint yields between row bands).
  let warmed = false;
  ctx.game?.addUpdater?.(() => {
    if (warmed) return; const p = ctx.game.player?.position; const it = (ctx.game.world?.interactables || []).find((i) => i.id === 'dock');
    if (p && it && Math.hypot(p.x - it.position.x, p.z - it.position.z) < it.radius * 4 && ctx.state()) { warmed = true; getMap().prewarm(); }
  });
  return {
    id: 'dock', get title() { return t('wm.winTitle'); }, icon: 'dock', get tabs() { return []; }, tab: 'map',
    onOpen() { const s = ctx.state(); getMap().open({ focus: s?.quests?.expedition?.dest || null }); },
    render() {
      const m = getMap();
      queueMicrotask(() => { const all = document.querySelectorAll('.tw-win-ov:not(.out) .tw-win[data-panel="dock"] .wm-mount'); const host = all[all.length - 1]; if (host) m.mount(host); });
      return '<div class="wm-mount"></div>';
    },
    on: {},
  };
}
