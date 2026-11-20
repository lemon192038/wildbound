// node src/shared/__materials.test.mjs — Mame Chishikii's material notes (src/shared/materialSources.js, src/ui/town/sagePanel.js):
// every material has a source, the chances are the real drop tables, the hidden Volcano Slime stays hidden, and every
// tip / row reads as finished Japanese and English (no missing i18n keys or {placeholders}).
let fails = 0;
const ok = (c, msg, info = '') => { if (!c) { fails++; console.log('FAIL', msg, info); } else console.log('ok  ', msg, info); };
async function run(lang) {
  globalThis.location = { search: '?lang=' + lang, href: 'http://x/?lang=' + lang };
  const v = '';
  const { ITEMS } = await import('./gamedata.js' + v);
  const M = await import('./materialSources.js' + v); const { sageTip, createSagePanel } = await import('../ui/town/sagePanel.js' + v);
  const mats = Object.keys(ITEMS).filter((k) => ITEMS[k].kind === 'material');
  const shown = mats.filter((k) => !M.isHiddenMaterial(k));
  const g = M.guideMaterials(); const listed = [...g.gather, ...g.monster, ...g.life];
  if (lang === 'ja') {
    ok(shown.every((k) => M.materialSources(k).length > 0), `every material (${shown.length}) has at least one source`, JSON.stringify(shown.filter((k) => !M.materialSources(k).length)));
    ok(listed.length === shown.length && new Set(listed).size === listed.length, 'the notes list each material exactly once', `${g.gather.length} gathered / ${g.monster.length} monster / ${g.life.length} eggs+juveniles`);
    ok(!listed.some(M.isHiddenMaterial) && mats.some(M.isHiddenMaterial), 'the hidden Volcano Slime materials are never listed');
    const coal = M.materialSources('coal');
    ok(coal.length === 2 && coal[0].region === 'ashplain' && coal[0].kind === 'ore' && coal[0].pct === 25 && coal[1].region === 'peaks' && coal[1].pct === 18, 'coal: ash plains ore vein 25 %, highlands 18 % (the drop table)', JSON.stringify(coal));
    const horn = M.materialSources('vk_horn'); ok(horn.some((s) => s.t === 'break' && s.mon === 'varkhul' && s.part === 'head'), "Varkhul's horn: break its head");
    ok(M.materialSources('egg_dragon').some((s) => s.t === 'egg' && s.mons.includes('venom')), 'dragon eggs: the Flame / Venom-fang nest');
    ok(M.materialSources('ironOre').some((s) => s.t === 'shop') && M.materialSources('ironOre').some((s) => s.t === 'field'), 'iron ore: island veins, boss-field outcrops and the market');
  }
  { // the panel itself renders every material's notes (every tab, every row)
    const panel = createSagePanel({ state: () => ({ box: { coal: 3 } }) }); const errs = []; let rows = 0;
    for (const tab of ['gather', 'monster', 'life']) { panel.tab = tab; for (const id of g[tab]) { try { panel.on.sel({ id }); const h = panel.render(); rows += (h.match(/sg-src/g) || []).length; if (/undefined|NaN|\{\w+\}/.test(h)) errs.push(id + ': bad text'); } catch (e) { errs.push(id + ': ' + e.message); } } }
    ok(!errs.length && rows >= listed.length, `[${lang}] the notes panel renders every material (${rows} source rows)`, errs.slice(0, 4).join(' | '));
  }
  const bad = []; for (const k of listed) { const s = sageTip(k); if (/\{|\b(sg|region|g2|g)\.[a-z]/.test(s) || !s.trim()) bad.push(k + ': ' + s); }
  ok(!bad.length, `[${lang}] every tip is finished text`, bad.slice(0, 4).join(' | '));
  console.log('   ', lang, 'coal →', sageTip('coal')); console.log('   ', lang, 'vk_horn →', sageTip('vk_horn')); console.log('   ', lang, 'egg_wolf →', sageTip('egg_wolf'));
}
const lang = process.argv[2];
if (lang) await run(lang); else { // each language in its own process (the language is fixed once per page)
  const { execFileSync } = await import('child_process');
  for (const l of ['ja', 'en']) { try { process.stdout.write(execFileSync(process.execPath, [new URL(import.meta.url).pathname, l], { encoding: 'utf8' })); } catch (e) { process.stdout.write(e.stdout || ''); fails++; } }
}
if (!lang || fails) console.log(fails ? `${fails} material-notes tests FAILED` : 'all material-notes tests passed');
process.exit(fails ? 1 : 0);
