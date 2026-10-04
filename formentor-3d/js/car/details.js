// Exterior details draped over the lofted body: glass, lights, grille, trim,
// mirrors, exhausts, plate... Everything is built for the right-hand side and
// mirrored (scale.z = -1) where the car is symmetric.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { decalGeometry } from './body.js';
import {
  lerp, yTopP, yBeltP, wRoofP, sideZ, topY, endX, AXLE_F, AXLE_R, ARCH_R, TIRE_R,
} from './profile.js';

// --- Patch helpers ---------------------------------------------------------------
// A "patch" maps (s,t) in [0,1]^2 to a 2D point (u,v) in a projection plane.
const quad2 = (c00, c10, c11, c01) => (s, t) => [
  (1 - s) * (1 - t) * c00[0] + s * (1 - t) * c10[0] + s * t * c11[0] + (1 - s) * t * c01[0],
  (1 - s) * (1 - t) * c00[1] + s * (1 - t) * c10[1] + s * t * c11[1] + (1 - s) * t * c01[1],
];
const subPatch = (p, s0, s1, t0, t1) => (s, t) => p(lerp(s0, s1, s), lerp(t0, t1, t));
const disc = (cu, cv, r) => (s, t) => [cu + t * r * Math.cos(s * Math.PI * 2), cv + t * r * Math.sin(s * Math.PI * 2)];
// A strip of width `wd` along a polyline of [u,v] points.
const stripAlong = (pts, wd) => (s, t) => {
  const f = s * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i;
  const a = pts[i], b = pts[i + 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return [lerp(a[0], b[0], k) + (-dy / len) * (t - 0.5) * wd, lerp(a[1], b[1], k) + (dx / len) * (t - 0.5) * wd];
};

// Star-shaped polygon: s runs around the outline, t from the centre (0) to the edge (1).
function polyPatch(points) {
  const c = points.reduce((a, p) => [a[0] + p[0] / points.length, a[1] + p[1] / points.length], [0, 0]);
  const loop = [...points, points[0]];
  const seg = loop.slice(1).map((p, i) => Math.hypot(p[0] - loop[i][0], p[1] - loop[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  const edge = (s) => {
    let d = s * total;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, d / seg[i]) : 0; return [lerp(loop[i][0], loop[i + 1][0], k), lerp(loop[i][1], loop[i + 1][1], k)]; }
      d -= seg[i];
    }
    return loop[0];
  };
  const patch = (s, t) => { const e = edge(s); return [lerp(c[0], e[0], t), lerp(c[1], e[1], t)]; };
  // planar UVs from the polygon's bounding box, for tiling textures
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  patch.uv = (s, t) => { const [u, v] = patch(s, t); return [(u - x0) / (x1 - x0), (v - y0) / (y1 - y0)]; };
  patch.points = points;
  return patch;
}
const mirrorPts = (half) => [...half, ...half.slice().reverse().map(([u, v]) => [-u, v])];

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
const belt = (x) => Math.min(yBeltP(x), yEdge(x) - 0.012);
const glassLow = (x) => belt(x) + 0.03;
const glassHigh = (x) => yEdge(x) - 0.045;

// Front-door glass: from the B-pillar to the tip of the A-pillar (right-hand side, x/y plane).
const frontDoorPatch = (() => {
  let tip = 0.55;
  while (glassHigh(tip) > glassLow(tip) + 0.002 && tip < 0.9) tip += 0.002;
  return (s, t) => {
    const x = lerp(-0.455, tip, s);
    const lo = glassLow(x), hi = Math.max(lo, glassHigh(x));
    return [x, lerp(lo, hi, t)];
  };
})();
// Rear-door glass with a slanted C-pillar edge.
const rearDoorPatch = (s, t) => {
  const x = lerp(-0.545, lerp(-1.215, -1.085, t), s);
  const lo = glassLow(x), hi = Math.max(lo, glassHigh(x));
  return [x, lerp(lo, hi, t)];
};
// Small triangular quarter window behind the rear door.
const quarterPatch = (s, t) => {
  const x = lerp(-1.265, lerp(-1.76, -1.62, t), s);
  const lo = glassLow(x) + 0.05, hi = Math.max(lo, glassHigh(x));
  return [x, lerp(lo, hi, t)];
};
const bPillarPatch = (s, t) => {
  const x = lerp(-0.545, -0.455, s);
  const lo = glassLow(x), hi = glassHigh(x);
  return [x, lerp(lo, hi, t)];
};
// Windshield and tailgate glass in the x/z plane (symmetric: z in [-w, w]).
const windshieldPatch = (s, t) => {
  const x = lerp(0.80, 0.115, t);
  const w = lerp(wRoofP(0.80) - 0.05, wRoofP(0.115) - 0.05, t);
  return [x, (2 * s - 1) * w];
};
const rearGlassPatch = (s, t) => {
  const x = lerp(-1.80, -2.125, t);
  const w = lerp(0.465, 0.45, t);
  return [x, (2 * s - 1) * w];
};

const WINDOWS = [
  { name: 'frontDoor', patch: frontDoorPatch, kind: 'side', mirror: true, clear: true },
  { name: 'rearDoor', patch: rearDoorPatch, kind: 'side', mirror: true },
  { name: 'quarter', patch: quarterPatch, kind: 'side', mirror: true },
  { name: 'windshield', patch: windshieldPatch, kind: 'top', mirror: false, clear: true },
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
    const poly = patchOutline(w.patch, 0.04, 0.09);
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
function canvasTex(w, h, draw, { repeat = [1, 1], wrap = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  return t;
}
// Diamond lattice used by the grille and lower intake.
export function meshTexture(repeat = [14, 5]) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#060708'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#34373c'; g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath();
    g.stroke();
    g.strokeStyle = '#15171a'; g.lineWidth = 2; g.stroke();
  }, { repeat });
}
function textTexture(text, { w = 512, h = 128, color = '#c98a5e', font = '600 78px "Helvetica Neue", Arial, sans-serif', spacing = 18 } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
    g.fillText(text, w / 2 + spacing / 2, h / 2 + 4);
  }, { wrap: false });
}
// Stylised copper "triangle" emblem (an approximation, drawn from scratch).
export function emblemTexture() {
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    const grad = g.createLinearGradient(0, 20, 256, 240);
    grad.addColorStop(0, '#e2a273'); grad.addColorStop(0.5, '#bf7646'); grad.addColorStop(1, '#8e532f');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(14, 36); g.lineTo(242, 36); g.lineTo(128, 238); g.closePath(); g.fill();
    g.strokeStyle = '#2b190d'; g.lineWidth = 12; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(56, 76); g.lineTo(128, 160); g.lineTo(200, 76); g.stroke();
    g.beginPath(); g.moveTo(96, 62); g.lineTo(128, 100); g.lineTo(160, 62); g.stroke();
    g.fillStyle = '#2b190d';
    g.beginPath(); g.moveTo(112, 176); g.lineTo(144, 176); g.lineTo(128, 204); g.closePath(); g.fill();
  }, { wrap: false });
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

  const add = (geo, mat, { mirror = false, name } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name || '';
    group.add(m);
    if (mirror) { const m2 = m.clone(); m2.scale.z = -1; group.add(m2); }
    return m;
  };

  // ---- Windows: black frit border + tinted glass ----
  for (const w of WINDOWS) {
    const proj = w.kind === 'side' ? onSide : onTop;
    // black ceramic border (frit) around the glass: four bands so the middle stays see-through
    for (const [s0, s1, t0, t1, nu, nv] of [[0, 1, 0, 0.07, 44, 1], [0, 1, 0.93, 1, 44, 1], [0, 0.035, 0, 1, 1, 12], [0.965, 1, 0, 1, 1, 12]]) {
      add(decal(subPatch(w.patch, s0, s1, t0, t1), proj, w.kind, nu, nv, 0.0012), mats.frit, { mirror: w.mirror });
    }
    add(decal(subPatch(w.patch, 0.02, 0.98, 0.04, 0.96), proj, w.kind, 44, 14, 0.0026), w.clear ? mats.glassFront : mats.glass, { mirror: w.mirror, name: 'glass' });
  }
  add(decal(bPillarPatch, onSide, 'side', 3, 14, 0.0014), mats.blackGloss, { mirror: true });
  // thin satin trim under the side glass
  {
    const patch = (s, t) => { const x = lerp(0.70, -1.62, s); return [x, glassLow(x) - 0.012 + (t - 0.5) * 0.010]; };
    add(decal(patch, onSide, 'side', 100, 1, 0.0014), mats.trimSilver, { mirror: true });
  }

  // ---- Door shut lines, handles, fuel flap (right side, mirrored where symmetric) ----
  const line = (pts, wd = 0.0035) => decal(stripAlong(pts, wd), onSide, 'side', Math.max(6, pts.length * 6), 1, 0.0008);
  add(line([[0.66, 0.405], [0.64, 0.7], [0.60, belt(0.6) - 0.004]]), mats.shutLine, { mirror: true });
  add(line([[-0.50, 0.405], [-0.50, belt(-0.5) - 0.004]]), mats.shutLine, { mirror: true });
  add(line([[-1.13, 0.74], [-1.17, 0.95], [-1.22, belt(-1.22) - 0.004]]), mats.shutLine, { mirror: true });
  const handle = (cx, cy) => decal((s, t) => [cx + (s - 0.5) * 0.17, cy + (t - 0.5) * 0.032], onSide, 'side', 8, 2, 0.002);
  add(handle(-0.20, belt(-0.2) - 0.088), mats.blackGloss, { mirror: true });
  add(handle(-0.98, belt(-0.98) - 0.088), mats.blackGloss, { mirror: true });
  // fuel flap outline
  {
    const x0 = -1.46, x1 = -1.30, y0 = 0.90, y1 = 1.01;
    add(line([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], 0.003), mats.shutLine);
  }

  // ---- Wheel-arch trim and lower side detail ----
  for (const ax of [AXLE_F, AXLE_R]) {
    const trim = (s, t) => {
      const a = lerp(-2, 182, s) * Math.PI / 180, r = lerp(ARCH_R + 0.002, ARCH_R + 0.050, t);
      return [ax + r * Math.cos(a), TIRE_R + r * Math.sin(a)];
    };
    add(decal(trim, onSide, 'side', 72, 2, 0.0035), mats.archTrim, { mirror: true });
  }

  // ---- Nose ----
  const front = (patch, nu, nv, off, mat, opts) => add(decal(patch, onFront, 'front', nu, nv, off), mat, opts);
  const frontPoly = (pts, mat, off, opts = {}) => add(decalGeometry((s, t) => { const [a, b] = pts(s, t); return onFront(a, b); },
    72, 6, { outward: OUT.front, offset: off, uvFn: pts.uv }), mat, opts);
  const outline = (pts, wd, off, mat, opts) => {
    const loop = [...pts, pts[0]];
    for (let i = 0; i < pts.length; i++) front(stripAlong([loop[i], loop[i + 1]], wd), 16, 1, off, mat, opts);
  };
  // hexagonal shield grille: black diamond mesh, satin surround, copper emblem
  const grillePts = mirrorPts([[0.0, 0.535], [0.30, 0.548], [0.405, 0.60], [0.475, 0.705], [0.36, 0.768], [0.0, 0.768]].reverse());
  frontPoly(polyPatch(grillePts), mats.grille, 0.0016);
  outline(grillePts, 0.016, 0.0028, mats.trimSilver);
  front((s, t) => [lerp(0.06, -0.06, s), lerp(0.655, 0.75, t)], 2, 2, 0.004, mats.emblem);
  // lower intake with the number plate, silver lip and chin splitter
  const lowerPts = mirrorPts([[0.0, 0.31], [0.66, 0.31], [0.70, 0.36], [0.58, 0.50], [0.0, 0.50]].reverse());
  frontPoly(polyPatch(lowerPts), mats.grille2, 0.0016);
  front((s, t) => [lerp(0.26, -0.26, s), lerp(0.395, 0.505, t)], 8, 2, 0.0032, mats.plate);
  front((s, t) => [(2 * s - 1) * 0.66, lerp(0.285, 0.31, t)], 40, 1, 0.003, mats.trimSilver);
  // round fog lamps and the black triangular air curtains in the bumper corners
  front(disc(0.60, 0.465, 0.036), 24, 2, 0.002, mats.trimSilver, { mirror: true });
  front(disc(0.60, 0.465, 0.026), 24, 2, 0.0034, mats.headGlass, { mirror: true });
  frontPoly(polyPatch([[0.79, 0.655], [0.815, 0.662], [0.805, 0.50]]), mats.blackGloss, 0.0022, { mirror: true });

  // Headlights: slim units that start at the grille's upper corner and sweep back along the fender
  const hlPts = [[0.475, 0.742], [0.62, 0.762], [0.80, 0.812], [0.885, 0.85], [0.875, 0.878], [0.66, 0.822], [0.49, 0.792]];
  frontPoly(polyPatch(hlPts), mats.headGlass, 0.0018, { mirror: true });
  const hl = quad2([0.49, 0.752], [0.86, 0.838], [0.86, 0.866], [0.49, 0.788]);
  for (let k = 0; k < 3; k++) {
    lights.drl.push(front(disc(0.535 + k * 0.048, 0.768 + k * 0.009, 0.012), 16, 2, 0.0034, mats.led, { mirror: true }));
  }
  lights.drl.push(front(subPatch(hl, 0.42, 0.99, 0.72, 0.92), 30, 2, 0.0034, mats.led, { mirror: true }));
  lights.head.push(front(subPatch(hl, 0.44, 0.80, 0.18, 0.55), 16, 2, 0.0034, mats.ledMain, { mirror: true }));

  // ---- Tail ----
  const rear = (patch, nu, nv, off, mat, opts) => add(decal(patch, onRear, 'rear', nu, nv, off), mat, opts);
  // swept tail-light clusters + thin full-width bar
  const tl = quad2([0.30, 0.995], [0.875, 0.925], [0.875, 1.065], [0.30, 1.030]);
  rear(tl, 40, 4, 0.0018, mats.tailGlass, { mirror: true });
  lights.tail.push(rear(subPatch(tl, 0.03, 1.0, 0.2, 0.82), 40, 2, 0.0032, mats.ledRed, { mirror: true }));
  lights.tail.push(rear((s, t) => [lerp(-0.31, 0.31, s), lerp(0.995, 1.022, t)], 30, 2, 0.0022, mats.ledRed));
  // lettering + emblem (right-hand side of the viewer is +z when looking at the rear)
  const cupra = new THREE.MeshBasicMaterial({ map: textTexture('CUPRA', { w: 640, h: 128, color: '#15171a', font: '500 72px "Helvetica Neue", Arial, sans-serif', spacing: 22 }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  rear((s, t) => [lerp(-0.24, 0.24, s), lerp(0.80, 0.865, t)], 16, 2, 0.0034, cupra);
  rear((s, t) => [lerp(-0.052, 0.052, s), lerp(0.90, 0.975, t)], 2, 2, 0.0036, mats.emblem);
  // rear plate sits in the dark lower bumper
  rear((s, t) => [lerp(-0.27, 0.27, s), lerp(0.545, 0.655, t)], 8, 2, 0.003, mats.plate);
  // red bumper reflector slots
  rear((s, t) => [lerp(0.46, 0.74, s), lerp(0.438, 0.462, t)], 8, 1, 0.0028, mats.ledRed, { mirror: true });
  // exhaust tips (two per side)
  for (const zc of [0.54, 0.72, -0.54, -0.72]) {
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

  // ---- Mirrors: wedge-shaped housing on a short arm from the door's front corner ----
  {
    const geo = new RoundedBoxGeometry(0.25, 0.135, 0.17, 5, 0.05);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = (z + 0.085) / 0.17;                     // 0 at the inboard end, 1 at the outboard end
      const taper = lerp(0.72, 1.0, k);
      // pointed nose towards the front, flat mirror face at the back
      const nose = x > 0 ? 1 + 0.25 * (x / 0.125) * (1 - Math.abs(y) / 0.07) : 1;
      p.setXYZ(i, x * nose, y * taper - (1 - k) * 0.012, z);
    }
    geo.computeVertexNormals();
    const mirror = new THREE.Group();
    const cap = new THREE.Mesh(geo, mats.paint);
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.03, 0.16, 3, 0.012), mats.blackGloss);
    base.position.set(0.0, -0.062, 0.0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.1), mats.mirrorGlass);
    face.rotation.y = -Math.PI / 2; face.position.set(-0.1265, 0.002, 0.01);
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.04, 0.12, 3, 0.015), mats.blackGloss);
    arm.position.set(0.02, -0.06, -0.10);
    mirror.add(cap, base, face, arm);
    mirror.position.set(0.50, 1.045, 1.0);
    mirror.rotation.y = 0.08;
    mirror.traverse((o) => { o.castShadow = true; });
    group.add(mirror);
    const m2 = mirror.clone(true);
    m2.scale.z = -1; m2.position.z = -1.0; m2.rotation.y = -0.08;
    group.add(m2);
  }

  // ---- Roof: rails, spoiler, antenna, wiper ----
  for (const sign of [1, -1]) {
    const pts = [];
    for (let x = -0.14; x >= -1.66; x -= 0.06) {
      const z = wRoofP(x) - 0.04;
      pts.push(new THREE.Vector3(x, topY(x, z) + 0.024, z * sign));
    }
    const rail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.013, 10, false);
    const yc = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    rail.translate(0, -yc, 0); rail.scale(1, 0.72, 1); rail.translate(0, yc, 0);
    const r = new THREE.Mesh(rail, mats.blackGloss);
    r.castShadow = true;
    group.add(r);
    for (const p of [pts[0], pts[pts.length - 1]]) {
      const foot = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.032, 0.036, 2, 0.01), mats.blackGloss);
      foot.position.set(p.x, p.y - 0.012, p.z);
      group.add(foot);
    }
  }
  {
    // roof spoiler: continues the roof line and overhangs the steep rear glass
    const sh = new THREE.Shape();
    sh.moveTo(-1.67, 1.410); sh.lineTo(-1.70, 1.428); sh.lineTo(-1.965, 1.378);
    sh.lineTo(-2.00, 1.357); sh.lineTo(-1.96, 1.347); sh.lineTo(-1.73, 1.388); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.98, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -0.49);
    const spoiler = new THREE.Mesh(g, mats.blackGloss);
    spoiler.castShadow = true;
    group.add(spoiler);
    for (const zs of [0.49, -0.49]) {
      const fs = new THREE.Shape();
      fs.moveTo(-1.72, 1.41); fs.lineTo(-1.99, 1.357); fs.lineTo(-1.965, 1.29); fs.lineTo(-1.80, 1.35); fs.closePath();
      const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.014, bevelEnabled: false });
      fg.translate(0, 0, zs - 0.007);
      group.add(new THREE.Mesh(fg, mats.blackGloss));
    }
  }
  {
    const fin = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.045, 0.028, 3, 0.012), mats.blackGloss);
    fin.position.set(-1.10, topY(-1.10, 0) + 0.014, 0);
    group.add(fin);
  }
  // rear wiper
  add(decal((s, t) => [lerp(-2.06, -2.042, t), lerp(0.02, 0.30, s)], onTop, 'top', 8, 1, 0.0034), mats.shutLine);

  return { group, lights };
}
