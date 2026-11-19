// Island materials (stage 5) — shared by the client and the authoritative server.
//   ISLAND_ITEMS : item definitions (merged into ITEMS by gamedata.js; Japanese names go into the ja pack)
//   ISLAND_LOOT  : per source (fauna species / special individual / island boss) → body carve table, number of body
//                  carves per carcass, and the material each broken part drops
//   ISLAND_LIMITS: anti-abuse limits the server enforces on carving
// `attr` hints at what the material brings to a weapon or armour (design document §11) — used by the forge later.
const M = (en, ja, rarity, sell, icon, attr, desc, jaDesc) => ({ name: en, ja, kind: 'material', rarity, buy: null, sell, icon, attr, desc, jaDesc });
export const ISLAND_ITEMS = {
  // Magma Beetle — hard shell
  mb_shell: M('Magma Beetle Shell', 'マグマビートルの外殻', 1, 14, 'plate-navy', { hardness: 1 }, 'A rock-hard wing case with faint glowing seams.', '淡く光る亀裂の走る、岩のように硬い外殻。'),
  mb_shard: M('Scorched Carapace Shard', '灼熱の甲殻片', 1, 10, 'slag', { hardness: 1 }, 'Still warm to the touch.', 'まだほんのり温かい甲殻の欠片。'),
  mb_mandible: M('Mineral Mandible', '鉱物質の大顎', 2, 24, 'fang', { sharp: 1 }, 'Grinds stone like flour.', '岩をすり潰すための大顎。'),
  mb_core: M('Volcanic Symbiont Core', '火山性共生核', 3, 60, 'gem-orange', { fire: 1 }, 'The heat organ under the shell.', '外殻の下で熱を蓄える器官。'),
  // Magma Slime
  ms_gel: M('Magma Gel', 'マグマジェル', 1, 8, 'jar-teal', { fire: 1 }, 'Hot, sticky and slowly cooling.', '熱く粘つく、ゆっくり冷える粘液。'),
  ms_core: M('Slime Core', 'スライム核', 2, 30, 'gem-red', { fire: 1 }, 'A pulsing nucleus of molten mineral.', '脈打つ溶融鉱物の核。'),
  // Ash Bird
  ab_feather: M('Ash Bird Feather', 'アッシュバードの羽根', 1, 12, 'membrane', { agility: 1 }, 'Black at the root, ember-red at the tip.', '根元は黒く、先端は燃えるような赤。'),
  ab_flight: M('Blazing Flight Feather', '灼熱の風切羽', 2, 34, 'membrane', { agility: 1 }, 'A long primary from a torn wing.', '裂けた翼から取れた長い風切羽。'),
  ab_beak: M('Volcanic Mineral Beak', '火山性鉱物のくちばし', 2, 28, 'horn-dark', { sharp: 1 }, 'Obsidian-hard and hooked.', '黒曜石のように硬い鉤状のくちばし。'),
  ab_core: M('Ash-flame Core', '灰炎の核', 3, 70, 'gem-orange', { fire: 1 }, 'The bird’s inner ember.', '鳥の体内に宿る残り火。'),
  // Fire Lizard
  fl_scale: M('Fire Lizard Scale', 'ファイアリザードの鱗', 1, 16, 'scale-dark', { defense: 1 }, 'Black, rock-like scales.', '黒い岩のような鱗。'),
  fl_fang: M('Searing Fang', '灼熱の牙', 2, 34, 'fang', { fire: 1 }, 'Holds heat long after the bite.', '噛みついたあとも熱を保つ牙。'),
  fl_spine: M('Radiator Spine', '放熱棘', 2, 30, 'barb', { fire: 1 }, 'A back spine that vents body heat.', '体温を逃がす背中の棘。'),
  fl_gland: M('Flame Gland', '発熱腺', 3, 64, 'gland', { fire: 2 }, 'The throat organ behind its fire spit.', '火炎弾を生む喉の器官。'),
  // 燼皮 (Cinderskin Drake)
  jp_scale: M('Cinderskin Scale', '燼皮の焦げ鱗', 2, 30, 'scale-red', { defense: 1, fire: 1 }, 'Scorched scale of a flightless drake.', '飛べない竜の焦げた鱗。'),
  jp_claw: M('Cinderskin Claw', '燼皮の鉤爪', 2, 36, 'claw', { sharp: 1 }, 'Worn flat from crawling.', '這うことで擦り減った爪。'),
  jp_wing: M('Vestigial Wing Membrane', '燼皮の退化翼膜', 3, 58, 'membrane', { agility: 1 }, 'A wing that no longer flies.', 'もう飛べない翼の膜。'),
  // Lava Snake
  ls_shell: M('Volcanic Rock Shell', '火山岩の外殻', 2, 40, 'plate-red', { defense: 2 }, 'Plates of the Lava Snake’s hide.', 'ラヴァスネークの甲殻板。'),
  ls_magma: M('High-purity Magma', '高純度マグマ液', 2, 46, 'jar-blue', { fire: 2 }, 'Carried sealed in a cooled crust.', '冷えた殻に封じた高純度の溶岩。'),
  ls_fang: M('Obsidian Fang', '黒曜石の牙', 3, 80, 'fang', { sharp: 2 }, 'Glass-sharp and still glowing.', 'ガラスのように鋭く、まだ光る牙。'),
  ls_core: M('Lava Snake Core', 'ラヴァスネークの溶岩核', 4, 160, 'gem-red', { fire: 3 }, 'The heart that keeps its blood molten.', '血を溶かし続ける心臓部。'),
  // Crystal Boar / Crystal Tusk
  cb_hide: M('Crystal Boar Hide', 'クリスタルボアの皮', 1, 18, 'scale-dark', { defense: 1 }, 'Thick hide with mineral studs.', '鉱物の突起が並ぶ厚い皮。'),
  cb_crystal: M('Mineral Crystal', '鉱物結晶', 2, 40, 'crystal', { defense: 1, crystal: 1 }, 'Grown on the boar’s back.', 'ボアの背中に育った結晶。'),
  cb_tusk: M('Crystal Boar Tusk', 'クリスタルボアの牙', 2, 38, 'horn', { sharp: 1 }, 'Short and heavy.', '短く重い牙。'),
  cb_crystal_l: M('Great Tusk Crystal', 'クリスタルタスクの大結晶', 4, 150, 'crystal', { defense: 2, crystal: 2 }, 'A large crystal from a Crystal Tusk.', 'クリスタルタスクの巨大な結晶。'),
  cb_tusk_great: M('Crystal Tusk Great Fang', 'クリスタルタスクの大牙', 4, 170, 'horn', { sharp: 2 }, 'Rare weapon material.', '希少な武器素材。'),
  // Magma Wolf / leader
  mw_pelt: M('Magma Wolf Pelt', 'マグマウルフの毛皮', 1, 20, 'scale-red', { agility: 1 }, 'Coarse fur with ember-lit tips.', '毛先が残り火のように光る毛皮。'),
  mw_fang: M('Magma Wolf Fang', 'マグマウルフの牙', 2, 32, 'fang', { attack: 1 }, 'Built for tearing.', '引き裂くための牙。'),
  mw_core: M('Pack Ember', '群れの残り火', 3, 66, 'gem-orange', { attack: 1, fire: 1 }, 'A glowing organ in the chest.', '胸の奥で光る器官。'),
  mw_pelt_l: M('Leader’s Mane', 'リーダーの鬣', 3, 90, 'scale-red', { agility: 2 }, 'The bright mane of a pack leader.', '群れを率いる個体の輝く鬣。'),
  mw_fang_l: M('Leader’s Fang', 'リーダーの大牙', 3, 96, 'fang', { attack: 2 }, 'Longer and heavier than any in the pack.', '群れの誰よりも長く重い牙。'),
  // Stone Mole / Grand Mole
  sm_plate: M('Stone Mole Plate', 'ストーンモールの岩甲', 2, 30, 'plate-navy', { defense: 2, weight: 1 }, 'Heavy rock armour.', '重い岩の装甲。'),
  sm_claw: M('Digging Claw', '掘削爪', 2, 40, 'claw', { sharp: 1, weight: 1 }, 'Breaks bedrock.', '岩盤を砕く爪。'),
  sm_ore: M('Burrow Ore', '巣穴の鉱石', 2, 34, 'ore-grey', { defense: 1 }, 'Ore hoarded in its tunnels.', '通路に蓄えられた鉱石。'),
  sm_plate_l: M('Grand Mole Layered Plate', 'グランドモールの重層甲', 4, 150, 'plate-navy', { defense: 3, weight: 2 }, 'Armour layered over decades.', '何十年もかけて重なった装甲。'),
  sm_claw_l: M('Grand Mole Claw', 'グランドモールの大爪', 4, 160, 'claw', { sharp: 2, weight: 2 }, 'Enormous and still sharp.', '巨大で今も鋭い爪。'),
  sm_ancient_core: M('Ancient Core of the Grand Mole', 'グランドモールの古代核', 5, 420, 'gem-white', { rare: 1 }, 'Rare equipment and alchemy material.', '希少装備・特殊錬金素材。'),
  // Boulder Golem
  bg_stone: M('Golem Stone', 'ゴーレムの岩塊', 2, 36, 'slag', { defense: 2, weight: 1 }, 'Stone that moved on its own.', '自ら動いていた岩。'),
  bg_ore: M('Golem Vein Ore', 'ゴーレムの鉱脈', 3, 70, 'ore-red', { defense: 1 }, 'Mineral veins from inside a golem.', 'ゴーレムの内部を走る鉱脈。'),
  bg_core: M('Magma Core', 'マグマコア', 4, 180, 'gem-red', { fire: 2, rare: 1 }, 'The light that animates a golem.', 'ゴーレムを動かす光。'),
  // Flame Dragon ♂ / Venom-fang Dragon ♀ / Cindaryl
  fd_scale: M('Flame Dragon Scale', '火焔龍の鱗', 3, 80, 'scale-red', { fire: 2 }, 'Heat-proof dragon scale.', '高温に強い龍の鱗。'),
  fd_shell: M('Flame Dragon Shell', '火焔龍の甲殻', 3, 90, 'plate-red', { fire: 1, defense: 2 }, 'A plate from its back.', '背中の甲殻。'),
  fd_claw: M('Flame Dragon Claw', '火焔龍の爪', 3, 96, 'claw', { fire: 1, sharp: 2 }, 'Dives end on these.', '急降下の終わりに振るわれる爪。'),
  fd_flame_sac: M('Flame Sac', '火炎袋', 4, 200, 'gland', { fire: 3 }, 'Fuel for dragon fire.', '龍の炎の源。'),
  fd_fang: M('Flame Dragon Fang', '火焔龍の牙', 4, 180, 'fang', { fire: 2, sharp: 1 }, 'From a broken head.', '砕いた頭部から取れる牙。'),
  fd_membrane: M('Flame Dragon Wing Membrane', '火焔龍の翼膜', 4, 170, 'membrane', { fire: 1, agility: 2 }, 'From a broken wing.', '破壊した翼から取れる翼膜。'),
  fd_tail: M('Flame Dragon Tail', '火焔龍の尾', 4, 170, 'club', { fire: 2 }, 'From a broken tail.', '破壊した尾。'),
  vd_scale: M('Venom-fang Dragon Scale', '毒牙龍の鱗', 3, 80, 'scale-dark', { poison: 2 }, 'Toxic glands between the scales.', '鱗の隙間に毒腺がある。'),
  vd_shell: M('Venom-fang Dragon Shell', '毒牙龍の甲殻', 3, 90, 'plate-navy', { poison: 1, defense: 2 }, 'Low, broad back plate.', '低く幅広い背の甲殻。'),
  vd_venom_sac: M('Venom Sac', '毒袋', 4, 200, 'gland', { poison: 3 }, 'Handle with gloves.', '手袋なしで触らないこと。'),
  vd_gem: M('Venom-fang Gem', '毒牙龍の宝玉', 5, 380, 'gem-white', { poison: 3, rare: 1 }, 'Rarely found.', 'めったに見つからない宝玉。'),
  vd_fang: M('Venom Fang', '毒牙', 4, 180, 'fang', { poison: 2, sharp: 1 }, 'Hollow and dripping.', '中空で毒が滴る牙。'),
  vd_membrane: M('Venom-fang Wing Membrane', '毒牙龍の翼膜', 4, 170, 'membrane', { poison: 1, agility: 1 }, 'From a broken wing.', '破壊した翼から取れる翼膜。'),
  vd_tail: M('Venom Tail Barb', '毒尾の棘', 4, 170, 'barb', { poison: 2 }, 'Toxic to the tip.', '先端まで毒を持つ。'),
  cy_scale: M('Cindaryl Scale', 'シンダリルの毒鱗', 5, 260, 'scale-dark', { poison: 3, durability: 1 }, 'Every scale is venomous.', '全身の鱗が毒を帯びる。'),
  cy_shell: M('Cindaryl Shell', 'シンダリルの甲殻', 5, 280, 'plate-navy', { poison: 2, defense: 3 }, 'Imposing, poison-coloured armour.', '威圧的な毒色の甲殻。'),
  cy_venom_sac: M('Lethal Venom Sac', '猛毒袋', 5, 340, 'gland', { poison: 4 }, 'Strong enough for the lethal venom.', '致死毒を生むほどの毒袋。'),
  cy_gem: M('Venom Empress Gem', '猛毒姫の宝玉', 6, 900, 'gem-white', { poison: 4, rare: 2 }, 'The rarest venom crystal.', '最も希少な毒の結晶。'),
  cy_fang: M('Cindaryl Fang', 'シンダリルの毒牙', 5, 320, 'fang', { poison: 3, sharp: 2 }, 'Far larger than any Venom-fang’s.', '毒牙龍を大きく上回る毒牙。'),
  cy_membrane: M('Cindaryl Wing Membrane', 'シンダリルの翼膜', 5, 300, 'membrane', { poison: 2, agility: 2 }, 'A giant venom-veined wing.', '毒の走る巨大な翼膜。'),
  cy_tail: M('Cindaryl Lethal Tail', 'シンダリルの猛毒尾', 5, 320, 'barb', { poison: 4 }, 'The source of lethal venom.', '致死毒の源。'),
};

// body: [[item, weight]...] (rolled per carve), carves: body carves per carcass, parts: broken part → material
export const ISLAND_LOOT = {
  beetle: { carves: 1, body: [['mb_shell', 45], ['mb_shard', 35], ['mb_mandible', 15], ['mb_core', 5]], parts: { shell: 'mb_shell' } },
  slime: { carves: 1, body: [['ms_gel', 85], ['ms_core', 15]], parts: {} },
  bird: { carves: 2, body: [['ab_feather', 55], ['ab_beak', 25], ['ab_flight', 12], ['ab_core', 8]], parts: { wings: 'ab_flight' } },
  lizard: { carves: 2, body: [['fl_scale', 50], ['fl_spine', 20], ['fl_fang', 20], ['fl_gland', 10]], parts: { head: 'fl_fang', tail: 'fl_spine' } },
  drake: { carves: 3, body: [['jp_scale', 55], ['jp_claw', 30], ['jp_wing', 15]], parts: { head: 'jp_claw', tail: 'jp_scale' } },
  snake: { carves: 3, body: [['ls_shell', 45], ['ls_magma', 30], ['ls_fang', 17], ['ls_core', 8]], parts: { head: 'ls_fang' } },
  boar: { carves: 3, body: [['cb_hide', 50], ['cb_crystal', 35], ['cb_tusk', 15]], parts: { head: 'cb_tusk', crystal: 'cb_crystal', legs: 'cb_hide' } },
  tusk: { carves: 4, body: [['cb_hide', 40], ['cb_crystal_l', 35], ['cb_tusk_great', 15], ['cb_crystal', 10]], parts: { head: 'cb_tusk_great', crystal: 'cb_crystal_l', legs: 'cb_hide' } },
  wolf: { carves: 2, body: [['mw_pelt', 55], ['mw_fang', 35], ['mw_core', 10]], parts: { head: 'mw_fang', legs: 'mw_pelt' } },
  leader: { carves: 3, body: [['mw_pelt_l', 45], ['mw_fang_l', 35], ['mw_core', 20]], parts: { head: 'mw_fang_l', legs: 'mw_pelt_l' } },
  mole: { carves: 3, body: [['sm_plate', 50], ['sm_ore', 30], ['sm_claw', 20]], parts: { claw: 'sm_claw', head: 'sm_plate' } },
  grandmole: { carves: 4, body: [['sm_plate_l', 45], ['sm_ore', 30], ['sm_claw_l', 18], ['sm_ancient_core', 7]], parts: { claw: 'sm_claw_l', head: 'sm_plate_l' } },
  golem: { carves: 3, body: [['bg_stone', 55], ['bg_ore', 30], ['bg_core', 15]], parts: { core: 'bg_core', arm: 'bg_stone' } },
  flame: { carves: 3, body: [['fd_scale', 45], ['fd_shell', 30], ['fd_claw', 20], ['fd_flame_sac', 5]], parts: { head: 'fd_fang', wings: 'fd_membrane', tail: 'fd_tail' } },
  venom: { carves: 3, body: [['vd_scale', 45], ['vd_shell', 30], ['vd_venom_sac', 20], ['vd_gem', 5]], parts: { head: 'vd_fang', wings: 'vd_membrane', tail: 'vd_tail' } },
  cindaryl: { carves: 4, body: [['cy_scale', 40], ['cy_shell', 30], ['cy_venom_sac', 22], ['cy_gem', 8]], parts: { head: 'cy_fang', wings: 'cy_membrane', tail: 'cy_tail' } },
  // the three original bosses keep their own tables (MONSTERS[...].carves / .breaks); the server maps them
  varkhul: { carves: 3, from: 'varkhul' }, wyvern: { carves: 3, from: 'wyvern' }, brute: { carves: 3, from: 'brute' },
};
// Carving limits enforced by the server (per island expedition). kills/min = distinct carcasses of that source.
export const ISLAND_LIMITS = { maxCarves: 400, killsPerMin: { beetle: 14, slime: 14, bird: 8 }, killsPerMinDefault: 4, bossCooldownMin: 8, minSecondsAfterDepart: 5, expireHours: 6 };
