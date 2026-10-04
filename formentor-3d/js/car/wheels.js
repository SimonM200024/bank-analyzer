// 19" wheel + 245/40 R19 tyre + brake assembly. The wheel axis is local Z, outer face = +Z.
import * as THREE from 'three';
import { TIRE_R, TIRE_W, lerp } from './profile.js';

const RIM_R = 0.2413;              // 19" bead seat radius
const HALF = TIRE_W / 2;

export const WHEEL_STYLES = {
  aero: { label: 'Performance 19″', spokes: 'twin', count: 5, rim: 0x101113, accent: 'copper' },
  sport: { label: 'Sport 19″', spokes: 'ten', count: 10, rim: 0xb9bdc2, accent: 'none' },
  blade: { label: 'Blade 19″', spokes: 'y', count: 5, rim: 0x0c0d0f, accent: 'copper' },
};

function tyreGeometry() {
  const pts = [
    [RIM_R + 0.004, -0.098], [RIM_R + 0.020, -0.119], [0.290, -0.1255], [0.318, -0.119],
    [0.333, -0.104], [TIRE_R - 0.002, -0.085], [TIRE_R, -0.07],
    [TIRE_R, -0.05], [TIRE_R - 0.004, -0.043], [TIRE_R, -0.036],
    [TIRE_R, -0.008], [TIRE_R - 0.004, 0], [TIRE_R, 0.008],
    [TIRE_R, 0.036], [TIRE_R - 0.004, 0.043], [TIRE_R, 0.05],
    [TIRE_R, 0.07], [TIRE_R - 0.002, 0.085], [0.333, 0.104], [0.318, 0.119],
    [0.290, 0.1255], [RIM_R + 0.020, 0.119], [RIM_R + 0.004, 0.098],
  ];
  const curve = new THREE.SplineCurve(pts.map(([r, a]) => new THREE.Vector2(r, a)));
  const lathe = new THREE.LatheGeometry(curve.getPoints(90), 96);
  lathe.rotateX(Math.PI / 2);          // lathe axis Y -> Z
  return lathe;
}

function barrelGeometry() {
  const pts = [
    [0.2405, 0.106], [0.2455, 0.101], [0.244, 0.094], [0.226, 0.088], [0.2145, 0.060],
    [0.2145, -0.080], [0.226, -0.098], [0.2415, -0.102],
  ].map(([r, a]) => new THREE.Vector2(r, a));
  const g = new THREE.LatheGeometry(pts, 80);
  g.rotateX(Math.PI / 2);
  return g;
}

function spokeShape(kind) {
  const s = new THREE.Shape();
  if (kind === 'twin') {          // Formentor-style: two swept arms per spoke that fan out towards the rim
    const arm = (sign) => {
      const b = new THREE.Shape();
      const r0 = 0.056, r1 = 0.224, N = 14, swirl = 0.22;
      const side = [];
      for (let k = 0; k <= N; k++) {
        const f = k / N, r = lerp(r0, r1, f);
        const c = swirl * Math.pow(f, 1.4) + sign * lerp(0.05, 0.17, Math.pow(f, 1.2));
        const ha = lerp(0.034, 0.052, f) / 2 / r;
        side.push([r, c + ha, c - ha]);
      }
      side.forEach(([r, a], i) => (i ? b.lineTo(r * Math.cos(a), r * Math.sin(a)) : b.moveTo(r * Math.cos(a), r * Math.sin(a))));
      for (let i = side.length - 1; i >= 0; i--) { const [r, , a] = side[i]; b.lineTo(r * Math.cos(a), r * Math.sin(a)); }
      b.closePath();
      return b;
    };
    return [arm(1), arm(-1)];
  } else if (kind === 'ten') {
    s.moveTo(0.050, -0.012); s.lineTo(0.140, -0.015); s.lineTo(0.222, -0.024);
    s.lineTo(0.222, 0.024); s.lineTo(0.140, 0.015); s.lineTo(0.050, 0.012); s.closePath();
  } else {                        // Y spoke: wide, with a triangular fork towards the rim
    s.moveTo(0.050, -0.030); s.lineTo(0.140, -0.036); s.lineTo(0.222, -0.075);
    s.lineTo(0.205, -0.010); s.lineTo(0.222, 0.075); s.lineTo(0.140, 0.036); s.lineTo(0.050, 0.030); s.closePath();
  }
  return s;
}

export function buildWheel(styleKey, mats, side = 1) {
  const style = WHEEL_STYLES[styleKey] || WHEEL_STYLES.aero;
  const root = new THREE.Group();
  const rotor = new THREE.Group();   // spins
  root.add(rotor);

  const tyre = new THREE.Mesh(tyreGeometry(), mats.tyre);
  tyre.castShadow = true;
  rotor.add(tyre);

  const barrel = new THREE.Mesh(barrelGeometry(), mats.rimDark);
  barrel.material.side = THREE.DoubleSide;
  rotor.add(barrel);

  // Rim face: spokes + hub (graphite or silver)
  const rimMat = mats.rim.clone();
  rimMat.color.setHex(style.rim);
  rimMat.userData.isRim = true;
  const spokeGeo = new THREE.ExtrudeGeometry(spokeShape(style.spokes), {
    depth: 0.03, bevelEnabled: true, bevelSize: 0.0035, bevelThickness: 0.005, bevelSegments: 2, curveSegments: 8,
  });
  spokeGeo.translate(0, 0, 0.040);
  const n = style.count;
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Mesh(spokeGeo, rimMat);
    sp.rotation.z = (i / n) * Math.PI * 2;
    rotor.add(sp);
  }
  // ring that ties the spokes together near the lip + centre hub
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.2335, 0.0065, 14, 90), style.accent === 'copper' ? mats.copper : rimMat);
  lip.position.z = 0.098;
  rotor.add(lip);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.075, 0.05, 40), rimMat);
  hub.rotation.x = Math.PI / 2; hub.position.z = 0.062;
  rotor.add(hub);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 40), style.accent === 'copper' ? mats.copper : mats.chrome);
  cap.rotation.x = Math.PI / 2; cap.position.z = 0.092;
  rotor.add(cap);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.014, 6), mats.chrome);
    nut.rotation.x = Math.PI / 2; nut.position.set(Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0.088);
    rotor.add(nut);
  }
  // dark backing so the arch liner doesn't show through the spokes
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.218, 48), mats.rimDark);
  back.position.z = 0.015; back.material.side = THREE.DoubleSide;
  rotor.add(back);

  // Brake disc (spins) + caliper (static)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.030, 64), mats.disc);
  disc.rotation.x = Math.PI / 2; disc.position.z = -0.012;
  rotor.add(disc);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 40), mats.disc);
  bell.rotation.x = Math.PI / 2; bell.position.z = 0.012;
  rotor.add(bell);

  const cal = new THREE.Shape();
  const r0 = 0.118, r1 = 0.200, a0 = THREE.MathUtils.degToRad(-28), a1 = THREE.MathUtils.degToRad(28);
  cal.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
  cal.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
  cal.absarc(0, 0, r1, a0, a1, false);
  cal.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
  cal.absarc(0, 0, r0, a1, a0, true);
  const calGeo = new THREE.ExtrudeGeometry(cal, { depth: 0.07, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 14 });
  calGeo.translate(0, 0, -0.04);
  const caliper = new THREE.Mesh(calGeo, mats.caliper);
  caliper.rotation.z = THREE.MathUtils.degToRad(155);
  caliper.castShadow = true;
  root.add(caliper);

  root.userData = { rotor, side };
  return root;
}
