// The quest base camp on the island: a tent, supply crates, a banner pole and a camp fire at the landing point.
// Respawns after a faint happen here (world.spawn.player is the camp).
export function buildCamp(game, at) {
  const { THREE, scene, world } = game; const g = new THREE.Group(); g.name = 'base-camp';
  const y = world.getHeight(at.x, at.z); g.position.set(at.x, y, at.z);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }), wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 });
  const tent = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.6, 4, 1, true), cloth); tent.position.set(-3, 1.3, -1.5); tent.rotation.y = Math.PI / 4; tent.material.side = THREE.DoubleSide;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), wood); crate.position.set(1.8, 0.35, -2.2);
  const crate2 = crate.clone(); crate2.position.set(2.5, 0.3, -1.4); crate2.scale.setScalar(0.85); crate2.rotation.y = 0.5;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 6), wood); pole.position.set(0, 2.1, -3.2);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0xc8a048, side: THREE.DoubleSide, emissive: 0x302008 })); flag.position.set(0.62, 3.7, -3.2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 6, 12), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1 })); ring.rotation.x = Math.PI / 2; ring.position.set(0.5, 0.08, 0.8);
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 })); fire.position.set(0.5, 0.4, 0.8);
  const light = new THREE.PointLight(0xff9a40, 3, 16, 2); light.position.set(0.5, 1.2, 0.8);
  g.add(tent, crate, crate2, pole, flag, ring, fire, light); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(g);
  world.spawn.player.set(at.x, y, at.z); // faint → back to camp
  let t = 0; game.addUpdater?.((dt) => { t += dt; fire.scale.y = 0.85 + Math.sin(t * 9) * 0.12; light.intensity = 2.6 + Math.sin(t * 13) * 0.5; flag.rotation.y = Math.sin(t * 1.7) * 0.25; });
  return g;
}
