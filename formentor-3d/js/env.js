// Lighting environments (reflections matter more than lights for car paint),
// ground, shadows and the reflective showroom floor.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const hdr = (r, g, b, k = 1) => new THREE.Color(r * k, g * k, b * k);

function skySphere({ zenith, horizon, ground, groundFade = 0.0 }) {
  const geo = new THREE.SphereGeometry(60, 48, 32);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 60;
    if (y >= 0) c.copy(horizon).lerp(zenith, Math.pow(y, 0.55));
    else c.copy(horizon).lerp(ground, Math.min(1, -y * 6 + groundFade));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
}

function panel(w, h, color, k, pos, target = [0, 0.6, 0]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
  m.position.set(...pos);
  m.lookAt(...target);
  return m;
}
function glowSphere(r, color, k, pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
  m.position.set(...pos);
  return m;
}

const PRESETS = {
  studio: {
    name: 'Studio', indoor: true, exposure: 1.1,
    bg: 0x14171c,
    sun: { color: 0xffffff, intensity: 2.2, pos: [5, 9, 4] },
    env() {
      const s = new THREE.Scene();
      s.add(skySphere({ zenith: hdr(0.11, 0.12, 0.14), horizon: hdr(0.13, 0.14, 0.16), ground: hdr(0.04, 0.04, 0.05) }));
      s.add(panel(12, 8, 0xffffff, 10, [0, 10, 0]));               // overhead softbox
      s.add(panel(8, 3.6, 0xfff4e6, 8, [-11, 5, 9]));              // key light
      s.add(panel(1.6, 9, 0xffffff, 14, [13, 4, 1]));              // vertical strips -> crisp body lines
      s.add(panel(1.6, 9, 0xdfe9ff, 12, [-13, 4, -4]));
      s.add(panel(1.4, 8, 0xffffff, 12, [3, 4, -13]));
      s.add(panel(1.4, 8, 0xffffff, 8, [11, 4, 10]));
      s.add(panel(20, 0.8, 0xffffff, 5, [0, 1.2, 14]));            // low strips -> lower body reflection
      s.add(panel(20, 0.8, 0xffffff, 4, [0, 1.2, -14]));
      return s;
    },
  },
  day: {
    name: 'Daylight', indoor: false, exposure: 0.95,
    bg: null, floor: 0x4a4d52, fog: 0xb9cde6,
    sun: { color: 0xfff1d8, intensity: 3.2, pos: [8, 12, 6] },
    env() {
      const s = new THREE.Scene();
      s.add(skySphere({ zenith: hdr(0.22, 0.42, 0.9, 1.15), horizon: hdr(0.78, 0.86, 1.0, 1.3), ground: hdr(0.28, 0.29, 0.3) }));
      s.add(glowSphere(3.5, 0xfff0d0, 40, [26, 36, 20]));
      return s;
    },
  },
  sunset: {
    name: 'Sunset', indoor: false, exposure: 1.0,
    bg: null, floor: 0x2a2624, fog: 0xe0905a,
    sun: { color: 0xffa36a, intensity: 3.6, pos: [-9, 3.2, 8] },
    env() {
      const s = new THREE.Scene();
      s.add(skySphere({ zenith: hdr(0.07, 0.11, 0.28, 1.0), horizon: hdr(1.0, 0.5, 0.22, 1.5), ground: hdr(0.12, 0.09, 0.08) }));
      s.add(glowSphere(4.5, 0xff8a40, 90, [-40, 7, 34]));
      return s;
    },
  },
  night: {
    name: 'Night street', indoor: true, exposure: 1.5,
    bg: 0x06080d,
    sun: { color: 0x8fb0ff, intensity: 0.5, pos: [-4, 8, 3] },
    env() {
      const s = new THREE.Scene();
      s.add(skySphere({ zenith: hdr(0.03, 0.04, 0.09), horizon: hdr(0.07, 0.09, 0.17), ground: hdr(0.02, 0.02, 0.03) }));
      for (const [x, z, c, k] of [[16, 8, 0xffd9a0, 160], [-14, 12, 0xffd9a0, 160], [10, -16, 0xffc880, 160], [-18, -8, 0xffe0b0, 120]]) s.add(glowSphere(0.9, c, k, [x, 7, z]));
      s.add(panel(18, 1.0, 0xff2d95, 22, [0, 2.2, -16]));
      s.add(panel(18, 1.0, 0x2de1ff, 20, [-17, 3.2, 0]));
      s.add(panel(10, 0.6, 0xffffff, 10, [16, 1.4, 4]));
      s.add(panel(14, 6, 0x6a86ff, 2.2, [0, 12, 0]));
      return s;
    },
  },
};
export const ENV_LIST = Object.entries(PRESETS).map(([id, p]) => ({ id, name: p.name, indoor: p.indoor }));

function radialTexture(stops, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function contactTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.filter = 'blur(22px)';
  g.fillStyle = 'rgba(0,0,0,0.85)';
  g.beginPath();
  g.roundRect(70, 56, 372, 144, 60); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createStage(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cache = new Map();

  // Key light + shadow
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 30;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 5;
  scene.add(sun, sun.target);

  // Ground stack: reflector (indoor) -> tinted floor -> shadow catcher -> contact shadow
  const ground = new THREE.Group();
  scene.add(ground);
  const reflector = new Reflector(new THREE.CircleGeometry(14, 64), {
    textureWidth: 1024, textureHeight: 1024, color: 0x6a6a6a, clipBias: 0.003,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = -0.002;
  ground.add(reflector);

  const floorTex = radialTexture([[0, 'rgba(255,255,255,0.42)'], [0.35, 'rgba(255,255,255,0.7)'], [0.8, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,1)']]);
  const floorMat = new THREE.MeshBasicMaterial({ map: floorTex, color: 0x0d0e11, transparent: true, depthWrite: false, toneMapped: false });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14.05, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001;
  ground.add(floor);

  // Outdoor ground: lit, receives shadows, fades into the fog.
  const asphalt = new THREE.Mesh(new THREE.CircleGeometry(120, 64),
    new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.92, metalness: 0 }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = -0.003; asphalt.receiveShadow = true;
  ground.add(asphalt);

  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.5 }));
  shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = 0.001; shadowCatcher.receiveShadow = true;
  ground.add(shadowCatcher);

  const contact = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.7),
    new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, opacity: 0.9 }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = 0.002;
  ground.add(contact);

  const css = (hex) => '#' + new THREE.Color(hex).getHexString();
  const glowTexture = (bg) => radialTexture([
    [0, css(new THREE.Color(bg).lerp(new THREE.Color(0xffffff), 0.14))],
    [0.55, css(new THREE.Color(bg).lerp(new THREE.Color(0xffffff), 0.05))],
    [1, css(bg)],
  ]);

  const state = { id: null, reflective: true };
  function apply(id) {
    const p = PRESETS[id] || PRESETS.studio;
    state.id = id;
    if (!cache.has(id)) cache.set(id, pmrem.fromScene(p.env(), 0.02).texture);
    scene.environment = cache.get(id);
    renderer.toneMappingExposure = p.exposure;

    sun.color.set(p.sun.color); sun.intensity = p.sun.intensity;
    sun.position.set(...p.sun.pos);

    if (p.indoor) {
      scene.background = new THREE.Color(p.bg);
      scene.backgroundBlurriness = 0;
      scene.fog = null;
      floor.visible = true;
      asphalt.visible = false;
      reflector.visible = state.reflective;
      if (state.reflective) { floorMat.map = floorTex; floorMat.color.set(p.bg); }
      else { floorMat.map = glowTexture(p.bg); floorMat.color.set(0xffffff); }
    } else {
      scene.background = cache.get(id);
      scene.backgroundBlurriness = 0.02;
      scene.fog = new THREE.Fog(p.fog, 18, 70);
      asphalt.material.color.set(p.floor);
      asphalt.visible = true;
      floor.visible = false;
      reflector.visible = false;
    }
    floorMat.needsUpdate = true;
  }

  return {
    apply,
    get id() { return state.id; },
    setReflective(v) { state.reflective = v; apply(state.id); },
    get reflective() { return state.reflective; },
    resize(w, h, pr) { reflector.getRenderTarget().setSize(Math.round(w * pr * 0.6), Math.round(h * pr * 0.6)); },
    sun,
  };
}
