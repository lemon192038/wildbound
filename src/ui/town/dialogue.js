// NPC dialogue: short, context-aware lines for each facility keeper. Returns { lines, choices }.
import { QUESTS, WEAPONS, RECIPES, SHOP, MONSTERS, nextWeaponCost } from '../../shared/gamedata.js';
import { maxBrew } from './alchemyPanel.js';

const pick = (a, seed) => a[Math.abs(seed) % a.length];
const short = (m) => (MONSTERS[m]?.name || 'the beast').split(',')[0];

export function dialogueFor(id, s, visits = 0) {
  const name = s?.user?.name || 'hunter'; const act = s?.quests?.active && QUESTS[s.quests.active.qid]; const ex = s?.quests?.expedition;
  const hr = s?.profile?.hr || 1; const v = visits;
  const L = (lines, open, extra = []) => ({ lines: lines.filter(Boolean), choices: [...(open ? [{ id: 'open', label: open }] : []), ...extra, { id: 'leave', label: 'Farewell' }] });
  switch (id) {
    case 'quest': {
      if (ex) return L([`The board says you're still out after ${short(QUESTS[ex.qid]?.monster)}, ${name}. Get back to the dock — Maro's crew is waiting on you.`], 'View the quest board');
      if (act?.type === 'deliver') return L([`Still gathering for “${act.name}”?`, 'Bring the goods to my counter whenever you have them all — I can take them straight from your item box.'], 'Open the quest board');
      if (act) return L([`“${act.name}” — a fine contract. ${act.monster ? `${short(act.monster)} won't wait for the tide.` : ''}`, 'When you are ready, Captain Maro will sail from the Departure Dock.'], 'Open the quest board');
      const avail = Object.keys(QUESTS).filter((k) => s?.quests?.available?.[k]?.ok && !s.quests.cleared?.[k]).length;
      return L([pick([`Welcome to the Guild, ${name}. Hunter Rank ${hr}, is it? There's work on the board.`, `Ah, ${name}. The couriers brought fresh requests this morning.`, `Mind the ink, it's still wet. New contracts, ${name}.`], v),
        avail ? `${avail} request${avail > 1 ? 's' : ''} you haven't cleared yet. Pick one and I'll stamp it.` : 'You have cleared every open request. Impressive. Repeat a hunt to keep your blade sharp.'], 'Browse quests');
    }
    case 'smith': {
      const w = s?.equip?.find((e) => e.uid === s.loadout?.weapon); const wd = w && WEAPONS[w.def];
      const cost = w && nextWeaponCost(w.def, w.lvl);
      const line1 = !wd ? `No blade on your back? That won't do, ${name}.`
        : w.def === 'marrowcleaver' ? pick([`Still swinging the old Marrowcleaver? Honest steel — but it won't bite an Emberhide's plating for long.`, `That Marrowcleaver's seen some use. Bring me scales from the field and I'll forge you something with teeth.`], v)
        : `${wd.name}, level ${w.lvl + 1}. ${wd.levels[w.lvl].element ? `Keep the ${wd.levels[w.lvl].element.type} core clean and she'll serve you well.` : 'A good, heavy edge.'}`;
      const line2 = cost ? `I could reinforce it for ${cost.coins.toLocaleString('en-US')} coins, if you've got the materials.` : wd ? `It's as strong as I can make it. Look at a new design.` : '';
      return L([line1, line2], 'Visit the forge');
    }
    case 'alchemy': {
      const can = s ? Object.keys(RECIPES).filter((k) => s.recipes?.[k] && maxBrew(RECIPES[k], s) > 0).length : 0;
      return L([pick(['Careful — that flask is still cooling. Don’t breathe too deep.', `Ah, ${name}. The kettle's warm and the herbs are fresh.`, 'Sunpetal and glowcap, the oldest marriage in alchemy.'], v),
        can ? `From what's in your box, I could help you brew ${can} different recipe${can > 1 ? 's' : ''} right now.` : 'Bring me herbs and mushrooms from the meadow — or buy Sunpetal at Pell’s stall — and we can brew draughts.'], 'Open the atelier');
    }
    case 'shop': {
      const out = s ? Object.keys(SHOP.stock).filter((k) => (s.shop?.[k]?.left ?? 1) === 0).length : 0;
      const rich = (s?.coins || 0) >= 3000;
      return L([pick([rich ? `Ah, my favourite customer — and such a heavy purse, ${name}!` : `Fresh off the morning boats, ${name}. Fair prices, I swear on my scales.`, 'Draughts, pods, ore — Pell has it, or Pell can get it.'], v),
        out ? `${out} of my lines are sold out, but the next convoy lands within the half-hour.` : 'And if you have spare materials, I buy at honest rates.'], 'Browse wares');
    }
    case 'storage': {
      const used = s ? Object.keys(s.pouch || {}).length : 0; const pots = s?.pouch?.potion || 0;
      return L([`Your box is safe with me, ${name}. Not a scale out of place.`,
        pots ? `Your pouch holds ${used} kinds of supplies — ${pots} Verdant Draught${pots > 1 ? 's' : ''} among them.` : 'You have no draughts packed. I would fix that before sailing.'], 'Open the item box');
    }
    case 'dock': {
      if (ex) return L([`You're back aboard? The hunt for ${short(QUESTS[ex.qid]?.monster)} is still on — the crew kept the boat ready.`], 'Board the ship');
      if (!act) return L(['No sailing orders, hunter. Accept a quest at the Guild first — Ysolde will sign your papers.'], 'Check the dock');
      if (act.type === 'deliver') return L([`A delivery? That's a matter for the Guild counter, not my ship.`], 'Check the dock');
      return L([`“${act.name}” — I know the waters. ${act.monster ? `We'll put you ashore near ${short(act.monster)}'s grounds.` : ''}`, (s.pouch?.potion || 0) ? 'Pouch packed? Then let us cast off.' : 'You sail light — no draughts in your pouch. Your call.'], 'Prepare to sail');
    }
    default: return L(['…'], 'Open');
  }
}
