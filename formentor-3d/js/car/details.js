// Exterior details draped over the lofted body: glass, lights, grille, trim,
// mirrors, exhausts, plate... Everything is built for the right-hand side and
// mirrored (scale.z = -1) where the car is symmetric.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { decalGeometry } from './body.js';
import {
  lerp, yTopP, yBeltP, wRoofP, sideZ, topY, endX, X_FRONT, X_REAR,
} from './profile.js';

// --- Patch helpers ---------------------------------------------------------------
// A "patch" maps (s,t) in [0,1]^2 to a 2D point (u,v) in a projection plane.
const quad2 = (c00, c10, c11, c01) => (s, t) => [
  (1 - s) * (1 - t) * c00[0] + s * (1 - t) * c10[0] + s * t * c11[0] + (1 - s) * t * c01[0],
  (1 - s) * (1 - t) * c00[1] + s * (1 - t) * c10[1] + s * t * c11[1] + (1 - s) * t * c01[1],
];
const subPatch = (p, s0, s1, t0, t1) => (s, t) => p(lerp(s0, s1, s), lerp(t0, t1, t));

// Projections from 2D plane coordinates onto the body.
const onSide = (x, y) => [x, y, sideZ(x, y) ?? 0.9];
const onTop = (x, z) => [x, topY(x, z), z];
const onFront = (z, y) => [endX(z, y, 1), y, z];
const onRear = (z, y) => [endX(z, y, -1), y, z];

const OUT = { side: [0, 0, 1], top: [0, 1, 0], front: [1, 0, 0], rear: [-1, 0, 0] };

function decal(patch, proj, kind, nu, nv, offset, extra = {}) {
  return decalGeometry((s, t) => { const [a, b] = patch(s, t); return proj(a, b); }, nu, nv,
    { outward: OUT[kind], offset, ...extra });
}

// --- Greenhouse (windows) ---------------------------------------------------------
const yEdge = (x) => yTopP(x) - 0.03;
const glassLow = (x) => Math.min(yBeltP(x), yEdge(x) - 0.01) + 0.028;
const glassHigh = (x) => yEdge(x) - 0.04;

// Front-door glass: from the B-pillar to the tip of the A-pillar (right-hand side, x/y plane).
const frontDoorPatch = (() => {
  let tip = 0.55;
  while (glassHigh(tip) > glassLow(tip) + 0.002 && tip < 0.7) tip += 0.002;
  return (s, t) => {
    const x = lerp(-0.43, tip, s);
    const lo = glassLow(x), hi = Math.max(lo, glassHigh(x));
    return [x, lerp(lo, hi, t)];
  };
})();
// Rear-door glass with slanted C-pillar edge.
const rearDoorPatch = (s, t) => {
  const x = lerp(-0.51, lerp(-1.38, -1.17, t), s);
  const lo = glassLow(x), hi = Math.max(lo, glassHigh(x));
  return [x, lerp(lo, hi, t)];
};
const bPillarPatch = (s, t) => {
  const x = lerp(-0.51, -0.43, s);
  const lo = glassLow(x), hi = glassHigh(x);
  return [x, lerp(lo, hi, t)];
};
// Windshield and tailgate glass in the x/z plane (symmetric: z in [-w, w]).
const windshieldPatch = (s, t) => {
  const x = lerp(0.585, 0.115, t);
  const w = lerp(0.745, 0.590, t);
  return [x, (2 * s - 1) * w];
};
const rearGlassPatch = (s, t) => {
  const x = lerp(-1.52, -1.99, t);
  const w = lerp(0.45, 0.42, t);
  return [x, (2 * s - 1) * w];
};

const WINDOWS = [
  { name: 'frontDoor', patch: frontDoorPatch, kind: 'side', mirror: true },
  { name: 'rearDoor', patch: rearDoorPatch, kind: 'side', mirror: true },
  { name: 'windshield', patch: windshieldPatch, kind: 'top', mirror: false },
  { name: 'rearGlass', patch: rearGlassPatch, kind: 'top', mirror: false },
];

function patchOutline(patch, d0, d1, n = 16) {
  const poly = [];
  for (let i = 0; i <= n; i++) poly.push(patch(lerp(d0, 1 - d0, i / n), d1));
  for (let i = 0; i <= n; i++) poly.push(patch(1 - d0, lerp(d1, 1 - d1, i / n)));
  for (let i = 0; i <= n; i++) poly.push(patch(lerp(1 - d0, d0, i / n), 1 - d1));
  for (let i = 0; i <= n; i++) poly.push(patch(d0, lerp(1 - d1, d1, i / n)));
  return poly;
}
function pointInPoly(poly, px, py) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Hole-cutters for the body mesh: quads whose centre lies inside a window opening are dropped
// so the cabin can be seen through the glass.
export function windowCutouts() {
  const cuts = [];
  for (const w of WINDOWS) {
    const poly = patchOutline(w.patch, 0.045, 0.09);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [u, v] of poly) { minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
    if (w.kind === 'side') {
      cuts.push((x, y, z) => Math.abs(z) > 0.4 && x >= minU && x <= maxU && y >= minV && y <= maxV && pointInPoly(poly, x, y));
    } else {
      cuts.push((x, y, z) => y > 0.9 && x >= minU && x <= maxU && z >= minV && z <= maxV && pointInPoly(poly, x, z));
    }
  }
  return cuts;
}

// --- Procedural textures -----------------------------------------------------------
function canvasTex(w, h, draw, { repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  return t;
}
export function meshTexture(repeat = [14, 5]) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#050607'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2b2d31'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath();
    g.stroke();
  }, { repeat });
}
function textTexture(text, { w = 512, h = 128, color = '#c98a5e', font = '600 78px "Helvetica Neue", Arial, sans-serif', spacing = 18, bg = null } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
    g.fillText(text, w / 2 + spacing / 2, h / 2 + 4);
  });
}

// --- Plate texture (updatable) --------------------------------------------------------
export function makePlate() {
  const c = document.createElement('canvas');
  c.width = 1040; c.height = 220;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = (text) => {
    const g = c.getContext('2d');
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#1b3f9c'; g.fillRect(0, 0, 110, c.height);
    g.fillStyle = '#ffd400';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath(); g.arc(55 + Math.cos(a) * 38, 75 + Math.sin(a) * 38, 5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#fff'; g.font = '700 44px Arial'; g.textAlign = 'center'; g.fillText('EU', 55, 175);
    g.strokeStyle = '#222'; g.lineWidth = 6; g.strokeRect(3, 3, c.width - 6, c.height - 6);
    g.fillStyle = '#16181c'; g.font = '700 150px "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText((text || 'VZ2 2022').toUpperCase().slice(0, 9), 575, 118);
    tex.needsUpdate = true;
  };
  draw('VZ2 2022');
  return { texture: tex, set: draw };
}

// --- Exterior assembly ---------------------------------------------------------------
export function buildExterior(mats) {
  const group = new THREE.Group();
  const lights = { drl: [], tail: [], head: [] };

  const add = (geo, mat, { mirror = false, name, shadow = false } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name || '';
    m.castShadow = shadow;
    group.add(m);
    if (mirror) { const m2 = m.clone(); m2.scale.z = -1; group.add(m2); }
    return m;
  };

  // Windows: black frit border + tinted glass.
  for (const w of WINDOWS) {
    const kind = w.kind;
    const proj = kind === 'side' ? onSide : onTop;
    add(decal(w.patch, proj, kind, 40, 12, 0.0012), mats.frit, { mirror: w.mirror });
    add(decal(subPatch(w.patch, 0.02, 0.98, 0.04, 0.96), proj, kind, 40, 14, 0.0026), mats.glass, { mirror: w.mirror, name: 'glass' });
  }
  add(decal(bPillarPatch, onSide, 'side', 3, 14, 0.0014), mats.blackGloss, { mirror: true });

  // Door shut lines & handles (right side, mirrored).
  const lineSide = (x0, y0, x1, y1, width = 0.0035) => {
    const patch = (s, t) => [lerp(x0, x1, s) + (t - 0.5) * width, lerp(y0, y1, s)];
    return decal(patch, onSide, 'side', 24, 1, 0.0008);
  };
  const cut = (x) => lineSide(x, 0.34, x, yBeltP(x) - 0.005);
  add(cut(0.50), mats.shutLine, { mirror: true });
  add(cut(-0.50), mats.shutLine, { mirror: true });
  add(cut(-1.28), mats.shutLine, { mirror: true });
  // belt trim line
  {
    const patch = (s, t) => { const x = lerp(0.50, -1.38, s); return [x, glassLow(x) - 0.014 + (t - 0.5) * 0.008]; };
    add(decal(patch, onSide, 'side', 80, 1, 0.0012), mats.copper, { mirror: true });
  }
  const handle = (cx, cy) => decal(
    (s, t) => [cx + (s - 0.5) * 0.16, cy + (t - 0.5) * 0.026], onSide, 'side', 8, 2, 0.002);
  add(handle(-0.17, 0.955), mats.blackGloss, { mirror: true });
  add(handle(-0.97, 0.975), mats.blackGloss, { mirror: true });
  // Copper sill accent along the top of the black sill band.
  {
    const patch = (s, t) => { const x = lerp(0.66, -1.00, s); return [x, 0.335 + (t - 0.5) * 0.012]; };
    add(decal(patch, onSide, 'side', 60, 1, 0.0012), mats.copper, { mirror: true });
  }

  // ---- Nose ----
  const gT = (zt, zb) => (s, t) => [(2 * s - 1) * lerp(zb, zt, t), lerp(0.545, 0.665, t)];
  const upperGrille = gT(0.43, 0.33);
  add(decal(upperGrille, onFront, 'front', 24, 8, 0.0016), mats.grille);
  // copper frame around the upper grille
  const frameStrip = (outer, inner, t0, t1) => decal((s, t) => outer(s, lerp(t0, t1, t)), onFront, 'front', 30, 1, 0.0028);
  {
    const f = (zt, zb, y0, y1, wd) => [
      [-zt - wd, y1 + wd], [zt + wd, y1 + wd], [zb + wd, y0 - wd], [-zb - wd, y0 - wd],
    ];
    const ring = (pts, wd) => {
      const edges = [];
      for (let i = 0; i < 4; i++) {
        const a = pts[i], b = pts[(i + 1) % 4];
        edges.push((s, t) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy); const nx = -dy / len, ny = dx / len;
          return [lerp(a[0], b[0], s) + nx * (t - 0.5) * wd, lerp(a[1], b[1], s) + ny * (t - 0.5) * wd]; });
      }
      return edges;
    };
    for (const e of ring(f(0.43, 0.33, 0.545, 0.665, 0.0), 0.016)) add(decal(e, onFront, 'front', 24, 1, 0.0028), mats.copper);
    const lower = [[-0.60, 0.50], [0.60, 0.50], [0.54, 0.36], [-0.54, 0.36]];
    for (const e of ring(lower, 0.012)) add(decal(e, onFront, 'front', 24, 1, 0.0022), mats.copper);
  }
  void frameStrip;
  // lower air intake
  add(decal((s, t) => [(2 * s - 1) * lerp(0.54, 0.60, t), lerp(0.36, 0.50, t)], onFront, 'front', 28, 8, 0.0016), mats.grille);
  // copper badge
  {
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 6), mats.copper);
    badge.rotation.z = Math.PI / 2; badge.rotation.y = 0;
    const [bx, by, bz] = onFront(0, 0.64);
    badge.position.set(bx + 0.002, by, bz);
    badge.rotation.set(0, 0, Math.PI / 2);
    group.add(badge);
  }
  // Headlights: slim housing with LED elements.
  const hl = quad2([0.34, 0.660], [0.86, 0.695], [0.86, 0.765], [0.34, 0.715]);
  add(decal(hl, onFront, 'front', 30, 4, 0.0018), mats.headGlass, { mirror: true });
  for (let k = 0; k < 3; k++) {
    const eye = subPatch(hl, 0.04 + k * 0.085, 0.075 + k * 0.085, 0.18, 0.82);
    lights.drl.push(add(decal(eye, onFront, 'front', 2, 3, 0.0032), mats.led, { mirror: true }));
  }
  lights.drl.push(add(decal(subPatch(hl, 0.33, 0.97, 0.38, 0.58), onFront, 'front', 24, 2, 0.0032), mats.led, { mirror: true }));
  lights.head.push(add(decal(subPatch(hl, 0.33, 0.62, 0.64, 0.84), onFront, 'front', 12, 2, 0.0032), mats.ledMain, { mirror: true }));

  // ---- Tail ----
  const tl = quad2([0.34, 0.915], [0.86, 0.945], [0.86, 0.995], [0.34, 0.965]);
  add(decal(tl, onRear, 'rear', 30, 4, 0.0018), mats.tailGlass, { mirror: true });
  lights.tail.push(add(decal(subPatch(tl, 0.02, 1.0, 0.25, 0.78), onRear, 'rear', 30, 2, 0.0032), mats.ledRed, { mirror: true }));
  // centre light-bar (split by lettering)
  const bar = (z0, z1) => (s, t) => [lerp(z0, z1, s), lerp(0.908, 0.936, t)];
  lights.tail.push(add(decal(bar(0.30, -0.30), onRear, 'rear', 30, 2, 0.0022), mats.ledRed));
  // lettering
  const cupra = new THREE.MeshBasicMaterial({ map: textTexture('CUPRA', { w: 640, h: 128 }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  add(decal((s, t) => [lerp(-0.23, 0.23, s), lerp(0.885, 0.955, t)], onRear, 'rear', 16, 2, 0.0034), cupra);
  const forme = new THREE.MeshBasicMaterial({ map: textTexture('FORMENTOR', { w: 900, h: 90, font: '500 56px "Helvetica Neue", Arial, sans-serif', spacing: 14, color: '#9a9ea6' }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  add(decal((s, t) => [lerp(-0.30, 0.30, s), lerp(0.545, 0.585, t)], onRear, 'rear', 16, 2, 0.0034), forme);
  // plate
  add(decal((s, t) => [lerp(-0.26, 0.26, s), lerp(0.62, 0.731, t)], onRear, 'rear', 8, 2, 0.003), mats.plate);
  // diffuser lower trim (copper) and fins
  add(decal((s, t) => [lerp(0.84, -0.84, s), lerp(0.455, 0.465, t)], onRear, 'rear', 40, 1, 0.0026), mats.copper);
  // exhaust tips (two per side)
  for (const zc of [0.50, 0.70, -0.50, -0.70]) {
    const tip = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 32, 1, true), mats.chrome);
    outer.rotation.z = Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.12, 32, 1, true), mats.exhaustInner);
    inner.rotation.z = Math.PI / 2; inner.material.side = THREE.BackSide;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.005, 12, 36), mats.chrome);
    lip.rotation.y = Math.PI / 2; lip.position.x = -0.06;
    tip.add(outer, inner, lip);
    const [tx, ty, tz] = onRear(zc, 0.345);
    tip.position.set(tx + 0.0, ty, tz);
    group.add(tip);
  }

  // ---- Mirrors ----
  {
    const mirror = new THREE.Group();
    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.115, 0.075, 5, 0.035), mats.mirrorCap);
    cap.position.set(0.0, 0.0, 0.0);
    cap.scale.set(1, 1, 1);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.085), mats.mirrorGlass);
    glass.rotation.y = Math.PI; glass.position.set(-0.112, 0.0, 0.0);
    glass.rotation.y = -Math.PI / 2; glass.position.set(-0.1115, 0, 0.0);
    const stalk = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.03, 0.09, 3, 0.012), mats.blackGloss);
    stalk.position.set(0.02, -0.045, -0.06);
    const trim = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.012, 0.078, 2, 0.005), mats.copper);
    trim.position.set(0.0, -0.058, 0.0);
    mirror.add(cap, glass, stalk, trim);
    mirror.position.set(0.52, 1.02, 0.98);
    mirror.rotation.y = 0.12;
    mirror.traverse((o) => { o.castShadow = true; });
    group.add(mirror);
    const m2 = mirror.clone(true);
    m2.position.z = -0.98; m2.rotation.y = -0.12;
    group.add(m2);
  }

  // ---- Roof details ----
  // rear roof spoiler (black gloss)
  add(decal((s, t) => { const x = lerp(-1.985, -2.115, t); return [x, (2 * s - 1) * (0.5 + 0.0 * x)]; }, onTop, 'top', 28, 4, 0.0035), mats.blackGloss);
  // shark-fin antenna
  {
    const fin = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.045, 0.028, 3, 0.012), mats.blackGloss);
    const y = topY(-1.05, 0) + 0.014;
    fin.position.set(-1.05, y, 0);
    fin.rotation.z = 0.05;
    group.add(fin);
  }

  return { group, lights };
}

export { X_FRONT, X_REAR, wRoofP };
