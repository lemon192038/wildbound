// NPC dialogue: short, context-aware lines for each facility keeper. Returns { lines, choices }.
// Lines are i18n keys (src/shared/i18n-*.js, "dlg.*"), so each language can phrase them naturally.
import { QUESTS, WEAPONS, RECIPES, SHOP, DESTINATIONS, nextWeaponCost, destForMonster } from '../../shared/gamedata.js';
import { t, monsterShort, questName, weaponName, elementName, destName } from '../../shared/i18n.js';
import { maxBrew } from './alchemyPanel.js';

const pick = (a, seed) => a[Math.abs(seed) % a.length];
const short = (m) => (m ? monsterShort(m) : t('dlg.theBeast'));
const pl = (n) => (n > 1 ? 's' : '');

export function dialogueFor(id, s, visits = 0) {
  const name = s?.user?.name || t('dlg.hunter'); const actId = s?.quests?.active?.qid; const act = actId && QUESTS[actId]; const ex = s?.quests?.expedition;
  const hr = s?.profile?.hr || 1; const v = visits; const q = act ? questName(actId) : '';
  const L = (lines, open, extra = []) => ({ lines: lines.filter(Boolean), choices: [...(open ? [{ id: 'open', label: open }] : []), ...extra, { id: 'leave', label: t('dlg.farewell') }] });
  switch (id) {
    case 'quest': {
      if (ex) return L([t('dlg.q.ex', { m: short(QUESTS[ex.qid]?.monster), name })], t('dlg.q.view'));
      if (act?.type === 'deliver') return L([t('dlg.q.deliver1', { q }), t('dlg.q.deliver2')], t('dlg.q.open'));
      if (act) return L([t('dlg.q.act1', { q }) + (act.monster ? t('dlg.q.act1m', { m: short(act.monster) }) : ''), t('dlg.q.act2')], t('dlg.q.open'));
      const avail = Object.keys(QUESTS).filter((k) => s?.quests?.available?.[k]?.ok && !s.quests.cleared?.[k]).length;
      return L([pick([t('dlg.q.hi1', { name, hr }), t('dlg.q.hi2', { name }), t('dlg.q.hi3', { name })], v),
        avail ? t('dlg.q.avail', { n: avail, s: pl(avail) }) : t('dlg.q.allClear')], t('dlg.q.browse'));
    }
    case 'smith': {
      const w = s?.equip?.find((e) => e.uid === s.loadout?.weapon); const wd = w && WEAPONS[w.def];
      const cost = w && nextWeaponCost(w.def, w.lvl); const el = wd?.levels[w.lvl].element;
      const line1 = !wd ? t('dlg.s.noBlade', { name })
        : w.def === 'marrowcleaver' ? pick([t('dlg.s.old1'), t('dlg.s.old2')], v)
        : t('dlg.s.wpn', { w: weaponName(w.def), lv: w.lvl + 1 }) + (el ? t('dlg.s.el', { e: elementName(el.type) }) : t('dlg.s.heavy'));
      const line2 = cost ? t('dlg.s.cost', { c: cost.coins.toLocaleString('en-US') }) : wd ? t('dlg.s.maxed') : '';
      return L([line1, line2], t('dlg.s.open'));
    }
    case 'alchemy': {
      const can = s ? Object.keys(RECIPES).filter((k) => s.recipes?.[k] && maxBrew(RECIPES[k], s) > 0).length : 0;
      return L([pick([t('dlg.a.hi1'), t('dlg.a.hi2', { name }), t('dlg.a.hi3')], v),
        can ? t('dlg.a.can', { n: can, s: pl(can) }) : t('dlg.a.none')], t('dlg.a.open'));
    }
    case 'shop': {
      const out = s ? Object.keys(SHOP.stock).filter((k) => (s.shop?.[k]?.left ?? 1) === 0).length : 0;
      const rich = (s?.coins || 0) >= 3000;
      return L([pick([rich ? t('dlg.m.rich', { name }) : t('dlg.m.hi1', { name }), t('dlg.m.hi2')], v),
        out ? t('dlg.m.out', { n: out }) : t('dlg.m.buy')], t('dlg.m.open'));
    }
    case 'storage': {
      const used = s ? Object.keys(s.pouch || {}).length : 0; const pots = s?.pouch?.potion || 0;
      return L([t('dlg.b.hi', { name }), pots ? t('dlg.b.pots', { used, n: pots, s: pl(pots) }) : t('dlg.b.noPots')], t('dlg.b.open'));
    }
    case 'dock': { // the captain opens the world map: any destination (free expedition) or the accepted quest's
      const dq = act && act.type !== 'deliver' && act.monster ? destForMonster(act.monster) : null;
      const where = pick([t('dlg.d.where1'), t('dlg.d.where2'), t('dlg.d.where3')], v);
      if (ex) return L([t('dlg.d.exBack', { d: destName(ex.dest), m: short(DESTINATIONS[ex.dest]?.monster) }), t('dlg.d.exResume')], t('dlg.d.map'));
      const line2 = dq ? t('dlg.d.questTo', { q, d: destName(dq), m: short(act.monster) })
        : act?.type === 'deliver' ? t('dlg.d.deliver') : t('dlg.d.free');
      return L([where, line2, (s.pouch?.potion || 0) ? '' : t('dlg.d.light')], t('dlg.d.map'));
    }
    default: return L(['…'], t('dlg.open'));
  }
}
