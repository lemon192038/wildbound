// Island gathering (user request: ~100 materials placed everywhere by terrain). Shared by the client and the server:
//   GATHER_ITEMS   92 new gatherable materials (+ the 8 classic ones: 100 in total), merged into ITEMS by gamedata.js
//   GATHER_KINDS   point types (what you see: herb patch, ore vein, bug swarm, relic…) and how many times each yields
//   REGION_TABLE   region → kind → [[item, weight]…]   (coast shells, fungal caps, crystal geodes, caldera lava pearls…)
//   pointsInTile(field, tx, tz) → [{ gid, x, z, kind }]  deterministic per 64 m tile, so the server can re-derive any
//                  point a client claims to gather from (server/economy.js islandGather validates gid → kind → table)
const G = (en, ja, rarity, sell, icon, desc, jaDesc) => ({ name: en, ja, kind: 'material', rarity, buy: null, sell, icon, desc, jaDesc, gather: true });
export const GATHER_ITEMS = {
  // coast
  saltKelp: G('Salt Kelp', '潮昆布', 1, 6, 'herb', 'Thick kelp left by the tide.', '潮が置いていった肉厚の昆布。'),
  shoreFern: G('Shore Fern', '浜シダ', 1, 5, 'herb', 'A tough fern that loves salt spray.', '潮風を好む丈夫なシダ。'),
  tidePearl: G('Tide Pearl', '潮真珠', 4, 140, 'gem-white', 'A pearl from a shell in the surf.', '波打ち際の貝から出た真珠。'),
  driftwood: G('Driftwood', '流木', 1, 4, 'log', 'Salt-bleached and light.', '潮に晒されて白く軽い。'),
  seaGlass: G('Sea Glass', '浜ガラス', 2, 18, 'gem-teal', 'Volcanic glass rounded by the waves.', '波に丸められた火山ガラス。'),
  shoreCoral: G('Shore Coral', '浜サンゴ', 3, 38, 'gem-red', 'Red coral washed up after storms.', '嵐のあとに打ち上がる赤い珊瑚。'),
  gullFeather: G('Gull Feather', '海鳥の羽', 1, 6, 'membrane', 'A long, white wing feather.', '白く長い風切り羽。'),
  // fungal forest
  emberbloomCap: G('Emberbloom Cap', '燼花茸', 2, 16, 'mushroom', 'Glows red when crushed.', '潰すと赤く光る。'),
  glowspore: G('Glowspore', '光胞子', 1, 8, 'mushroom', 'Drifts like dust and shines at night.', '塵のように漂い、夜に光る。'),
  giantGill: G('Giant Gill', '大笠のひだ', 2, 14, 'mushroom', 'A sheet from a giant cap.', '巨大な笠から剥いだひだ。'),
  rotTruffle: G('Rot Truffle', '腐葉トリュフ', 3, 60, 'mushroom', 'Prized by alchemists, loved by boars.', '錬金術師が珍重し、猪の好物。'),
  myceliumThread: G('Mycelium Thread', '菌糸の糸', 2, 12, 'herb', 'Strong as gut string.', '腸弦のように強い。'),
  sporeSac: G('Spore Sac', '胞子袋', 2, 15, 'jar-teal', 'Bursts into choking dust.', '弾けると息の詰まる粉が舞う。'),
  moonMorel: G('Moon Morel', '月編笠茸', 4, 120, 'mushroom', 'Only fruits under full moons, they say.', '満月にしか生えないという。'),
  // ruins
  ancientShard: G('Ancient Shard', '古代の欠片', 2, 20, 'slag', 'Glazed pottery older than the town.', '町より古い釉薬の陶片。'),
  carvedTablet: G('Carved Tablet', '刻文の石板', 4, 150, 'plate-navy', 'Covered in a script no one reads.', '誰も読めない文字が刻まれている。'),
  rustedRelic: G('Rusted Relic', '錆びた遺物', 2, 22, 'slag', 'A fitting from some lost machine.', '失われた機械の部品。'),
  oldCoin: G('Old Coin', '古銭', 3, 80, 'coin', 'Stamped with a crowned serpent.', '冠をかぶった蛇の刻印。'),
  ivyRoot: G('Ivy Root', '蔦の根', 1, 6, 'herb', 'Splits stone given a century.', '百年あれば石も割る。'),
  templeMoss: G('Temple Moss', '神殿苔', 2, 14, 'herb', 'Soft green moss from shaded altars.', '日陰の祭壇に生える柔らかな苔。'),
  emberSilk: G('Ember Silk', '燼糸', 3, 55, 'membrane', 'Spider silk that does not burn.', '燃えない蜘蛛の糸。'),
  // ash plain
  ashGrass: G('Ash Grass', '灰草', 1, 4, 'herb', 'The first thing to grow after an eruption.', '噴火のあと最初に芽吹く草。'),
  cinderSeed: G('Cinder Seed', '燃え種', 2, 12, 'seed-red', 'Only sprouts after fire.', '火にあぶられて初めて芽吹く。'),
  pumice: G('Pumice', '軽石', 1, 5, 'slag', 'Floats on water.', '水に浮く。'),
  beetleHusk: G('Beetle Husk', '甲虫の抜け殻', 1, 7, 'plate-navy', 'A moulted shell, light and hard.', '軽くて硬い脱皮殻。'),
  smokeLichen: G('Smoke Lichen', '煙地衣', 2, 12, 'lichen', 'Grey lichen that smells of smoke.', '煙の匂いがする灰色の地衣。'),
  volcanicGlass: G('Volcanic Glass', '火山ガラス', 2, 18, 'gem-teal', 'Sharp-edged and dark.', '鋭く暗いガラス。'),
  // geothermal
  sulfurCrystal: G('Sulfur Crystal', '硫黄結晶', 2, 16, 'gem-orange', 'Yellow needles around the vents.', '噴気孔を囲む黄色い針。'),
  steamMoss: G('Steam Moss', '蒸気苔', 1, 8, 'lichen', 'Always damp and warm.', 'いつも湿って温かい。'),
  springSalt: G('Hot Spring Salt', '温泉塩', 2, 14, 'salt', 'Crusted at the rim of the springs.', '温泉のふちに固まった塩。'),
  geyserStone: G('Geyser Stone', '間欠泉石', 3, 45, 'slag', 'Layered by a thousand eruptions.', '千回の噴出で層をなした石。'),
  boilingClay: G('Boiling Clay', '沸き粘土', 1, 8, 'slag', 'Bubbles in the hand for a while.', 'しばらく手の中で泡立つ。'),
  mineralBloom: G('Mineral Bloom', '鉱華', 4, 130, 'gem-orange', 'A flower of crystal grown by steam.', '蒸気が育てた結晶の花。'),
  tar: G('Natural Tar', '天然タール', 2, 15, 'jar-teal', 'Seeps from the warm ground.', '温かい地面から染み出す。'),
  // crystal fields
  quartzSpike: G('Quartz Spike', '石英柱', 2, 18, 'gem-white', 'A clear six-sided spike.', '透き通った六角柱。'),
  prismShard: G('Prism Shard', 'プリズム片', 3, 50, 'gem-teal', 'Splits light into colours.', '光を七色に分ける。'),
  resonantCrystal: G('Resonant Crystal', '共鳴結晶', 4, 140, 'gem-teal', 'Hums when struck.', '打つと唸る。'),
  crystalDust: G('Crystal Dust', '結晶粉', 1, 8, 'salt', 'Glittering grit.', 'きらめく砂粒。'),
  amethystGeode: G('Amethyst Geode', '紫晶の晶洞', 5, 260, 'gem-red', 'A purple hollow full of crystal.', '中に紫水晶の詰まった空洞の石。'),
  crystalWater: G('Crystal Spring Water', '結晶清水', 2, 14, 'flask-blue', 'Clear water from under the crystals.', '結晶の下から湧く清水。'),
  // peaks
  peakDown: G('Peak Down', '高嶺の綿毛', 2, 14, 'membrane', 'Soft down caught on the cliffs.', '崖に引っかかった柔らかな綿毛。'),
  cliffHerb: G('Cliff Herb', '崖草', 2, 12, 'herb', 'Clings where nothing else can.', '何も生えない場所にしがみつく。'),
  thunderStone: G('Thunder Stone', '雷石', 4, 130, 'gem-white', 'Struck so often it holds a charge.', '何度も雷に打たれ、電気を帯びた石。'),
  frostLichen: G('Frost Lichen', '霜地衣', 2, 14, 'lichen', 'Cold to the touch, even here.', 'ここでも触れると冷たい。'),
  basaltSlab: G('Basalt Slab', '玄武岩板', 1, 7, 'slag', 'A neat hexagonal tile.', '整った六角形の板。'),
  windFlower: G('Wind Flower', '風花', 3, 40, 'herb', 'Opens only in strong wind.', '強い風の中でだけ咲く。'),
  mistFlower: G('Mist Flower', '霧花', 3, 42, 'herb', 'Pale petals beaded with dew.', '露をまとう淡い花びら。'),
  eggShell: G('Cliff Egg Shell', '断崖の卵殻', 2, 16, 'gem-white', 'From a nest high on the rocks.', '岩場の高い巣にあった卵の殻。'),
  // canyon
  redClay: G('Red Clay', '赤粘土', 1, 5, 'slag', 'Rich, red and sticky.', '赤く粘る土。'),
  canyonCactus: G('Canyon Cactus', '峡谷サボテン', 2, 12, 'herb', 'Full of bitter water.', '苦い水をたっぷり蓄える。'),
  ironSand: G('Iron Sand', '砂鉄', 2, 14, 'salt', 'Black sand that clings to a magnet.', '磁石に吸いつく黒い砂。'),
  fossilBone: G('Fossil Bone', '化石骨', 3, 45, 'fang', 'Stone in the shape of a bone.', '骨の形をした石。'),
  ochre: G('Ochre', '黄土', 1, 6, 'slag', 'Yellow earth for pigments.', '顔料になる黄色い土。'),
  echoStone: G('Echo Stone', '反響石', 4, 120, 'gem-white', 'Repeats whatever you whisper to it.', 'ささやいた言葉を繰り返す。'),
  // volcano core / caldera
  obsidian: G('Obsidian', '黒曜石', 2, 18, 'gem-red', 'Glass-black and razor sharp.', 'ガラスのように黒く、剃刀のように鋭い。'),
  magmaBead: G('Magma Bead', '溶岩玉', 2, 16, 'gem-orange', 'A droplet of lava frozen round.', '丸く固まった溶岩の雫。'),
  scorchRoot: G('Scorch Root', '焦げ根', 1, 7, 'herb', 'A root that grows through hot rock.', '熱い岩を貫いて伸びる根。'),
  fireOpal: G('Fire Opal', '火蛋白石', 5, 280, 'gem-orange', 'Flames dance inside it.', '中で炎が踊る。'),
  heatShard: G('Heat Shard', '熱片', 2, 16, 'slag', 'Warm for days after picking.', '拾ってから何日も温かい。'),
  cinderAsh: G('Cinder Ash', '火灰', 1, 4, 'salt', 'Fine, hot ash.', '細かく熱い灰。'),
  snailShell: G('Lava Snail Shell', '溶岩カタツムリの殻', 3, 40, 'slag', 'A spiral shell of hardened lava.', '固まった溶岩の巻貝。'),
  lavaPearl: G('Lava Pearl', '溶岩真珠', 5, 300, 'gem-red', 'Formed where lava meets steam.', '溶岩と蒸気が出会う場所でできる。'),
  brimstone: G('Brimstone', '硫黄塊', 2, 14, 'gem-orange', 'Burns blue with a terrible smell.', 'ひどい臭いの青い炎で燃える。'),
  moltenGlass: G('Molten Glass', '溶融ガラス', 3, 40, 'gem-teal', 'Still soft at the core.', '芯がまだ柔らかい。'),
  calderaEmber: G('Caldera Ember', '火口の燠', 3, 50, 'gem-orange', 'An ember that never goes out.', '決して消えない燠火。'),
  blackSalt: G('Black Salt', '黒塩', 2, 15, 'salt', 'Volcanic salt with a smoky taste.', '燻した味の火山塩。'),
  // insects
  emberFirefly: G('Ember Firefly', '燼蛍', 1, 8, 'gem-orange', 'Glows like a cinder.', '燠のように光る。'),
  ashCricket: G('Ash Cricket', '灰コオロギ', 1, 6, 'fang', 'Chirps before eruptions.', '噴火の前に鳴く。'),
  glowMoth: G('Glow Moth', '光蛾', 2, 12, 'membrane', 'Dusty wings that shine.', '粉の舞う光る翅。'),
  rockMantis: G('Rock Mantis', '岩カマキリ', 2, 15, 'fang', 'Looks exactly like gravel.', '砂利にそっくり。'),
  jewelBeetle: G('Jewel Beetle', '宝石虫', 4, 110, 'gem-teal', 'Its shell is a living gem.', '甲羅が生きた宝石。'),
  lavaAnt: G('Lava Ant', '溶岩アリ', 1, 6, 'fang', 'Carries hot grit in its jaws.', '熱い砂粒をくわえて運ぶ。'),
  // bones
  oldBone: G('Old Bone', '古骨', 1, 6, 'fang', 'Bleached by sun and ash.', '日と灰に晒された骨。'),
  giantRib: G('Giant Rib', '巨大な肋骨', 3, 45, 'fang', 'From something enormous.', '巨大な何かの骨。'),
  fangFossil: G('Wyrm Fang Fossil', '竜牙の化石', 5, 240, 'fang', 'A tooth longer than a sword.', '剣より長い牙。'),
  // ore veins
  copperOre: G('Copper Ore', '銅鉱', 1, 8, 'ore', 'Green-streaked rock.', '緑の筋が走る岩。'),
  silverOre: G('Silver Ore', '銀鉱', 3, 45, 'ore', 'Bright veins in dark stone.', '暗い石の中の明るい鉱脈。'),
  goldNugget: G('Gold Nugget', '金塊', 4, 160, 'coin', 'Heavier than it looks.', '見た目より重い。'),
  coal: G('Coal', '石炭', 1, 6, 'slag', 'Burns long and hot.', '長く熱く燃える。'),
  magnetite: G('Magnetite', '磁鉄鉱', 2, 16, 'ore', 'Pulls at iron.', '鉄を引き寄せる。'),
  starIron: G('Star Iron', '星鉄', 5, 260, 'ore', 'Fell from the sky long ago.', '遠い昔に空から落ちた鉄。'),
  // herbs
  healingHerb: G('Healing Herb', '薬草', 1, 5, 'herb', 'The base of every draught.', 'あらゆる回復薬の基本。'),
  bitterRoot: G('Bitter Root', '苦根', 1, 6, 'herb', 'Awful taste, strong medicine.', 'ひどい味の良薬。'),
  sleepHerb: G('Sleep Herb', '眠り草', 2, 12, 'herb', 'Its scent makes eyelids heavy.', '香りでまぶたが重くなる。'),
  fireHerb: G('Fire Herb', '火薬草', 2, 12, 'herb', 'Warms the body from inside.', '体の中から温める。'),
  antidoteMoss: G('Antidote Moss', '解毒苔', 2, 12, 'lichen', 'Draws out poison.', '毒を吸い出す。'),
  vigorBerry: G('Vigor Berry', '活力の実', 2, 14, 'seed-red', 'Tart and invigorating.', '酸っぱくて元気が出る。'),
  emberBerry: G('Ember Berry', '燼の実', 3, 30, 'seed-red', 'Hot as a coal on the tongue.', '舌の上で炭のように熱い。'),
  // wood
  hardwood: G('Hardwood', '硬木', 1, 6, 'log', 'Dense and heavy.', '詰まって重い。'),
  resin: G('Resin', '樹脂', 2, 12, 'honey', 'Golden and sticky.', '金色で粘る。'),
  deadBark: G('Dead Bark', '枯れ樹皮', 1, 4, 'log', 'Peels off in sheets.', '板状に剥がれる。'),
  charredLog: G('Charred Log', '炭化木', 1, 6, 'log', 'Wood half turned to charcoal.', '半分炭になった木。'),
};
// point types: label key g2.<kind>, uses per point (per expedition), the look (src/field/islandGather.js)
export const GATHER_KINDS = {
  herb: { uses: 3 }, mushroom: { uses: 3 }, ore: { uses: 3 }, crystal: { uses: 2 }, bones: { uses: 2 }, bugs: { uses: 2 },
  wood: { uses: 2 }, relic: { uses: 2 }, shell: { uses: 2 }, vent: { uses: 2 }, clay: { uses: 3 },
};
const T = (...a) => a; // [[item, weight], …]
export const REGION_TABLE = {
  coast: { shell: T(['saltKelp', 30], ['tidePearl', 4], ['seaGlass', 20], ['tidecap', 14], ['shoreCoral', 6], ['gullFeather', 26]), herb: T(['shoreFern', 40], ['healingHerb', 30], ['sunpetal', 30]), wood: T(['driftwood', 70], ['resin', 30]), bugs: T(['glowMoth', 50], ['ashCricket', 50]), bones: T(['oldBone', 70], ['giantRib', 25], ['monsterBone', 5]) },
  fungal: { mushroom: T(['emberbloomCap', 22], ['glowspore', 26], ['giantGill', 20], ['rotTruffle', 8], ['sporeSac', 14], ['moonMorel', 3], ['glowcap', 7]), herb: T(['myceliumThread', 35], ['sleepHerb', 25], ['antidoteMoss', 25], ['honey', 15]), wood: T(['hardwood', 50], ['deadBark', 50]), bugs: T(['glowMoth', 50], ['jewelBeetle', 6], ['rockMantis', 44]) },
  ruins: { relic: T(['ancientShard', 40], ['carvedTablet', 6], ['rustedRelic', 30], ['oldCoin', 14], ['emberSilk', 10]), herb: T(['ivyRoot', 40], ['templeMoss', 40], ['healingHerb', 20]), bones: T(['oldBone', 60], ['giantRib', 30], ['fangFossil', 3], ['monsterBone', 7]), ore: T(['copperOre', 50], ['ironOre', 35], ['silverOre', 15]) },
  ashplain: { herb: T(['ashGrass', 40], ['cinderSeed', 25], ['bitterRoot', 20], ['sunpetal', 15]), ore: T(['pumice', 35], ['volcanicGlass', 25], ['coal', 25], ['ironOre', 15]), bugs: T(['ashCricket', 45], ['emberFirefly', 35], ['lavaAnt', 20]), bones: T(['beetleHusk', 60], ['oldBone', 35], ['monsterBone', 5]), clay: T(['smokeLichen', 50], ['cinderAsh', 50]), wood: T(['charredLog', 60], ['deadBark', 40]) },
  geotherm: { vent: T(['sulfurCrystal', 30], ['tar', 20], ['mineralBloom', 5], ['geyserStone', 15], ['springSalt', 30]), herb: T(['steamMoss', 45], ['fireHerb', 35], ['vigorBerry', 20]), clay: T(['boilingClay', 70], ['redClay', 30]), ore: T(['magnetite', 40], ['copperOre', 40], ['crimsonOre', 20]) },
  crystal: { crystal: T(['quartzSpike', 32], ['prismShard', 18], ['resonantCrystal', 6], ['crystalDust', 30], ['amethystGeode', 3], ['stormquartz', 11]), herb: T(['crystalWater', 50], ['cliffHerb', 50]), ore: T(['silverOre', 30], ['ironOre', 40], ['goldNugget', 6], ['magnetite', 24]), bugs: T(['jewelBeetle', 10], ['glowMoth', 90]) },
  peaks: { herb: T(['cliffHerb', 30], ['windFlower', 15], ['mistFlower', 15], ['frostLichen', 25], ['healingHerb', 15]), ore: T(['basaltSlab', 40], ['thunderStone', 6], ['ironOre', 34], ['starIron', 2], ['coal', 18]), shell: T(['eggShell', 50], ['peakDown', 50]), bones: T(['oldBone', 60], ['fangFossil', 4], ['giantRib', 36]) },
  canyon: { clay: T(['redClay', 40], ['ochre', 40], ['ironSand', 20]), herb: T(['canyonCactus', 50], ['bitterRoot', 30], ['emberBerry', 20]), bones: T(['fossilBone', 50], ['oldBone', 40], ['fangFossil', 4], ['monsterBone', 6]), ore: T(['echoStone', 5], ['crimsonOre', 35], ['copperOre', 40], ['ironSand', 20]) },
  core: { vent: T(['obsidian', 30], ['magmaBead', 25], ['heatShard', 25], ['fireOpal', 3], ['cinderAsh', 17]), herb: T(['scorchRoot', 50], ['fireHerb', 30], ['emberBerry', 20]), ore: T(['obsidian', 30], ['crimsonOre', 40], ['magnetite', 30]), shell: T(['snailShell', 100]), bugs: T(['lavaAnt', 60], ['emberFirefly', 40]) },
  caldera: { vent: T(['lavaPearl', 5], ['brimstone', 35], ['moltenGlass', 20], ['calderaEmber', 15], ['blackSalt', 25]), ore: T(['obsidian', 50], ['heatShard', 50]) },
};
// how often each kind appears per region (weights) and points per tile
const KIND_W = {
  coast: { shell: 4, herb: 3, wood: 3, bugs: 1, bones: 1 }, fungal: { mushroom: 5, herb: 3, wood: 2, bugs: 2 }, ruins: { relic: 4, herb: 2, bones: 2, ore: 2 },
  ashplain: { herb: 3, ore: 3, bugs: 2, bones: 2, clay: 1, wood: 1 }, geotherm: { vent: 4, herb: 2, clay: 2, ore: 2 }, crystal: { crystal: 5, herb: 1, ore: 3, bugs: 1 },
  peaks: { herb: 3, ore: 3, shell: 2, bones: 1 }, canyon: { clay: 3, herb: 2, bones: 2, ore: 3 }, core: { vent: 3, herb: 2, ore: 3, shell: 1, bugs: 2 }, caldera: { vent: 4, ore: 2 },
};
const PER_TILE = { coast: 4, fungal: 6, ruins: 5, ashplain: 4, geotherm: 5, crystal: 5, peaks: 4, canyon: 4, core: 4, caldera: 3 };
export const GATHER_LIMITS = { perExpedition: 160, minInterval: 0.6 };
export const GATHER_ALL = [...new Set([...Object.keys(GATHER_ITEMS), 'sunpetal', 'glowcap', 'tidecap', 'honey', 'ironOre', 'crimsonOre', 'stormquartz', 'monsterBone'])];

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function pointsInTile(F, tx, tz) {
  const x0 = -F.half + tx * 64, z0 = -F.half + tz * 64; const reg = F.regionAt(x0 + 32, z0 + 32); if (!PER_TILE[reg]) return [];
  const r = rng((F.seed || 1337) * 7919 + tx * 104729 + tz * 1299709); const out = []; const L = {};
  const kw = KIND_W[reg]; const tot = Object.values(kw).reduce((a, b) => a + b, 0);
  for (let i = 0; i < PER_TILE[reg]; i++) {
    const x = x0 + 4 + r() * 56, z = z0 + 4 + r() * 56; let k = r() * tot, kind = null; for (const [kk, w] of Object.entries(kw)) { k -= w; if (k <= 0) { kind = kk; break; } }
    kind ||= Object.keys(kw)[0];
    if (F.lava(x, z, L).sd < 3 || F.height(x, z) < 0.6) continue; // never in lava or the sea
    out.push({ gid: `${tx}_${tz}_${i}`, x, z, kind, region: reg });
  }
  return out;
}
export function pointByGid(F, gid) {
  const m = /^(\d{1,3})_(\d{1,3})_(\d{1,2})$/.exec(String(gid)); if (!m) return null;
  return pointsInTile(F, +m[1], +m[2]).find((p) => p.gid === gid) || null;
}
export function rollGather(point, rand) {
  const tab = REGION_TABLE[point.region]?.[point.kind]; if (!tab) return null;
  const tot = tab.reduce((a, e) => a + e[1], 0); let x = rand() * tot; for (const [it, w] of tab) { x -= w; if (x <= 0) return { item: it, qty: 1 + (rand() < 0.25 ? 1 : 0) }; }
  return { item: tab[0][0], qty: 1 };
}
