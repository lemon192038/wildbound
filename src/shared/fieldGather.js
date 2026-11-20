// What each gathering point yields in the three boss fields (src/field/gather.js draws them; the sage's material guide
// src/shared/materialSources.js reads them). [[item, weight], …]
export const FIELD_GATHER = {
  herb: [['sunpetal', 85], ['honey', 15]], mushroom: [['glowcap', 100]], lichen: [['tidecap', 100]], ore: [['ironOre', 100]],
  crimson: [['crimsonOre', 80], ['ironOre', 20]], crystal: [['stormquartz', 100]], hive: [['honey', 100]], bones: [['monsterBone', 100]],
};
export const FIELD_GATHER_DESTS = ['ember_foothills', 'ashfang_wastes', 'cinderdeep_hollow']; // every boss field places them
