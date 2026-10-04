// Import your own .glb / .gltf (single-file) car model and make it recolourable.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PAINT_FINISH } from './car/car.js';

const PAINT_NAME = /paint|body|carpaint|car_paint|exterior|bodywork|lak|karos|shell/i;

export async function importModel(file, { length }) {
  const buf = await file.arrayBuffer();
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  const model = gltf.scene;
  const root = new THREE.Group();
  root.add(model);

  // Orient so the longest horizontal dimension runs along X, scale to the real car length,
  // centre on the origin and drop onto the floor.
  const box = new THREE.Box3();
  box.setFromObject(model);
  let size = box.getSize(new THREE.Vector3());
  if (size.z > size.x) model.rotation.y = Math.PI / 2;
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  size = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(length / size.x);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(model.position.x - c.x, model.position.y - box.min.y, model.position.z - c.z);

  const paint = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    for (const m of [].concat(o.material)) {
      if (m && (PAINT_NAME.test(m.name || '') || PAINT_NAME.test(o.name || '')) && !m.transparent && m.opacity === 1) paint.add(m);
    }
  });

  return {
    root,
    paintMaterials: paint.size,
    setPaint(hex, finish = 'metallic') {
      const f = PAINT_FINISH[finish] || PAINT_FINISH.metallic;
      for (const m of paint) {
        if (m.map) { m.userData.origMap = m.map; m.map = null; }
        m.color.set(hex);
        if ('metalness' in m) { m.metalness = f.metalness; m.roughness = f.roughness; }
        if ('clearcoat' in m) { m.clearcoat = f.clearcoat; m.clearcoatRoughness = f.clearcoatRoughness; }
        m.needsUpdate = true;
      }
    },
  };
}
