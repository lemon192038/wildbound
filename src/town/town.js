// STUB — replaced by the town builder. Contract: see CONTRACTS.md "Town".
export async function createTown(game) {
  const { THREE, scene } = game;
  scene.background = new THREE.Color(0x88aacc);
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(30, 60, 20); sun.castShadow = true; scene.add(sun, new THREE.HemisphereLight(0xbfd8ff, 0x405030, 1));
  const g = new THREE.PlaneGeometry(200, 200); g.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8a7a66 })); ground.receiveShadow = true; scene.add(ground);
  const V = (x, z) => new THREE.Vector3(x, 0, z);
  const interactables = [
    { id: 'quest', name: "Hunters' Guild", npc: 'Guildmistress Ysolde', position: V(0, -12), radius: 3.5 },
    { id: 'smith', name: 'Forge', npc: 'Master Smith Borrik', position: V(14, -4), radius: 3.5 },
    { id: 'alchemy', name: 'Alchemy Atelier', npc: 'Alchemist Nerith', position: V(-14, -4), radius: 3.5 },
    { id: 'shop', name: 'Market', npc: 'Merchant Pell', position: V(10, 8), radius: 3.5 },
    { id: 'storage', name: 'Item Box', npc: 'Quartermaster Iva', position: V(-10, 8), radius: 3 },
    { id: 'dock', name: 'Departure Dock', npc: 'Captain Maro', position: V(0, 20), radius: 4 },
  ];
  for (const it of interactables) { const m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0x447799 })); m.position.copy(it.position).setY(1.5); scene.add(m); }
  return { update() {}, getHeight: () => 0, getNormal: () => new THREE.Vector3(0, 1, 0), bounds: { radius: 90 }, sun, colliders: [], spawn: { player: V(0, 4), monster: V(0, -40) }, spawnDust() {}, spawnSplash() {}, interactables, dispose() {} };
}
