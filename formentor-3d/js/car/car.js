// Assembles the complete Cupra Formentor VZ2: body, glass, lights, wheels, interior.
import * as THREE from 'three';
import { buildBodyGeometry } from './body.js';
import { buildExterior, windowCutouts, meshTexture, makePlate } from './details.js';
import { buildWheel, WHEEL_STYLES } from './wheels.js';
import { buildInterior } from './interior.js';
import { AXLE_F, AXLE_R, TIRE_R, TRACK_HALF, ARCH_R, ARCH_INNER_Z } from './profile.js';

import { COPPER } from './palette.js';
export { COPPER };

export const PAINT_FINISH = {
  metallic: { metalness: 0.62, roughness: 0.30, clearcoat: 1.0, clearcoatRoughness: 0.04 },
  solid: { metalness: 0.0, roughness: 0.28, clearcoat: 1.0, clearcoatRoughness: 0.03 },
  matte: { metalness: 0.55, roughness: 0.66, clearcoat: 0.0, clearcoatRoughness: 0.4 },
};

function makeMaterials() {
  const plate = makePlate();
  const m = {
    paint: new THREE.MeshPhysicalMaterial({ color: 0x5a5f63, ...PAINT_FINISH.metallic }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.62 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x04070a, roughness: 0.02, metalness: 0.45, transparent: true, opacity: 0.62,
      envMapIntensity: 1.7, depthWrite: false, side: THREE.DoubleSide,
    }),
    frit: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide }),
    blackGloss: new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }),
    shutLine: new THREE.MeshBasicMaterial({ color: 0x050506 }),
    copper: new THREE.MeshStandardMaterial({ color: COPPER, metalness: 1, roughness: 0.3 }),
    grille: new THREE.MeshStandardMaterial({ map: meshTexture(), color: 0xffffff, roughness: 0.55, metalness: 0.4 }),
    headGlass: new THREE.MeshPhysicalMaterial({ color: 0x07090c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    led: new THREE.MeshStandardMaterial({ color: 0xcfd8e6, emissive: 0xdfe8ff, emissiveIntensity: 0.25, roughness: 0.3 }),
    ledMain: new THREE.MeshStandardMaterial({ color: 0xcfd8e6, emissive: 0xfff2dd, emissiveIntensity: 0.0, roughness: 0.3 }),
    tailGlass: new THREE.MeshPhysicalMaterial({ color: 0x160304, roughness: 0.06, metalness: 0.2, clearcoat: 1 }),
    ledRed: new THREE.MeshStandardMaterial({ color: 0x3a0505, emissive: 0xff1d12, emissiveIntensity: 0.12, roughness: 0.3 }),
    plate: new THREE.MeshStandardMaterial({ map: plate.texture, roughness: 0.45 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe2e4e8, metalness: 1, roughness: 0.12 }),
    exhaustInner: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, metalness: 0.7, roughness: 0.5 }),
    mirrorCap: new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.25, clearcoat: 1 }),
    mirrorGlass: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.04 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.9 }),
    rim: new THREE.MeshPhysicalMaterial({ color: 0x23262b, metalness: 0.85, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.1 }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.5, metalness: 0.6 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x80848a, metalness: 0.9, roughness: 0.42 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: COPPER, metalness: 0.7, roughness: 0.35, clearcoat: 0.7 }),
    liner: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.95, side: THREE.DoubleSide }),
    interiorShell: new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.9, side: THREE.BackSide }),
  };
  m.plateCtl = plate;
  return m;
}

function archLiner(mats) {
  const g = new THREE.Group();
  const w = 0.318;
  const cyl = new THREE.CylinderGeometry(ARCH_R - 0.004, ARCH_R - 0.004, w, 96, 1, true,
    THREE.MathUtils.degToRad(78), THREE.MathUtils.degToRad(204));
  cyl.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(cyl, mats.liner);
  m.position.z = ARCH_INNER_Z + w / 2;
  const wall = new THREE.CircleGeometry(ARCH_R - 0.004, 96, THREE.MathUtils.degToRad(-12), THREE.MathUtils.degToRad(204));
  const wm = new THREE.Mesh(wall, mats.liner);
  wm.position.z = ARCH_INNER_Z + 0.003;
  g.add(m, wm);
  return g;
}

export function createCar() {
  const mats = makeMaterials();
  const root = new THREE.Group();
  root.name = 'formentor';

  // Body (paint + black plastics), with window openings cut out.
  const bodyGeo = buildBodyGeometry({ cutouts: windowCutouts() });
  const body = new THREE.Mesh(bodyGeo, [mats.paint, mats.blackPlastic]);
  body.castShadow = true; body.receiveShadow = true;
  root.add(body);

  // Interior shell (seen through the windows) + furniture
  // (paint-coloured quads only: the lower plastics / arches are hidden from inside anyway)
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const shell = new THREE.Mesh(bodyGeo, [mats.interiorShell, hidden]);
  shell.scale.set(0.985, 0.985, 0.985);
  shell.position.y = 0.01;
  root.add(shell);
  const interior = buildInterior(mats);
  root.add(interior.group);

  // Exterior details
  const ext = buildExterior(mats);
  root.add(ext.group);

  // Wheels + arch liners
  const wheels = [];
  const wheelGroup = new THREE.Group();
  root.add(wheelGroup);
  const liners = new THREE.Group();
  root.add(liners);
  const placeWheels = (styleKey) => {
    wheelGroup.clear();
    wheels.length = 0;
    for (const ax of [AXLE_F, AXLE_R]) {
      for (const side of [1, -1]) {
        const w = buildWheel(styleKey, mats, side);
        w.position.set(ax, TIRE_R, side * TRACK_HALF);
        if (side < 0) w.rotation.y = Math.PI;
        wheelGroup.add(w);
        wheels.push(w);
      }
    }
  };
  placeWheels('aero');
  for (const ax of [AXLE_F, AXLE_R]) {
    for (const side of [1, -1]) {
      const l = archLiner(mats);
      l.position.set(ax, TIRE_R, 0);
      if (side < 0) l.scale.z = -1;
      liners.add(l);
    }
  }

  // Light pools on the ground (cheap stand-in for headlight / tail-light beams)
  const poolTex = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.translate(30, 128); g.scale(1, 0.24);
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, 470);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-30, -600, 540, 1200);
    return new THREE.CanvasTexture(c);
  })();
  const pools = new THREE.Group();
  pools.visible = false;
  const poolMat = (color, opacity) => new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const side of [1, -1]) {
    const head = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 3.0), poolMat(0xfff0d8, 0.38));
    head.rotation.x = -Math.PI / 2; head.position.set(2.2 + 3.75, 0.006, side * 0.75);
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.6), poolMat(0xff2418, 0.32));
    tail.rotation.x = -Math.PI / 2; tail.rotation.z = Math.PI; tail.position.set(-2.3 - 1.5, 0.006, side * 0.55);
    pools.add(head, tail);
  }
  root.add(pools);

  const state = { lights: 'drl', spin: false, speed: 0, dark: true };

  const api = {
    root, mats, wheels, state,
    setPaint(hex, finish = 'metallic') {
      mats.paint.color.set(hex);
      Object.assign(mats.paint, PAINT_FINISH[finish] || PAINT_FINISH.metallic);
      mats.paint.needsUpdate = true;
    },
    setWheelStyle(key) { if (WHEEL_STYLES[key]) placeWheels(key); },
    setCaliper(hex) { mats.caliper.color.set(hex); },
    setGlass(opacity) { mats.glass.opacity = opacity; },
    setPlate(text) { mats.plateCtl.set(text); },
    setLights(mode) {
      state.lights = mode;
      const on = mode === 'on', drl = mode === 'drl' || on;
      mats.led.emissiveIntensity = drl ? (on ? 4.5 : 3.2) : 0.25;
      mats.ledMain.emissiveIntensity = on ? 4.0 : 0.0;
      mats.ledRed.emissiveIntensity = on ? 3.0 : 0.12;
      mats.ledRed.color.setHex(on ? 0x6a0806 : 0x3a0505);
      pools.visible = on && state.dark;
    },
    setSpin(v) { state.spin = v; },
    // ground light pools only make sense in dark scenes
    setDarkScene(v) { state.dark = v; pools.visible = state.lights === 'on' && v; },
    update(dt) {
      if (state.spin) {
        const ang = (4.0 * dt) / TIRE_R;     // ~4 m/s
        for (const w of wheels) w.userData.rotor.rotation.z += (w.userData.side > 0 ? -1 : 1) * ang;
      }
    },
  };
  api.setLights('drl');
  return api;
}
