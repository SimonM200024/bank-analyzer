// Parametric definition of the Cupra Formentor body shape.
//
// The body is a "loft": a series of cross-sections (rings) taken along the car's
// length (X axis, +X = front). Every ring is described by a handful of control
// points whose heights/widths are smooth functions of X (the side profile and
// plan view of the car). Everything else (decals, glass, lights...) is projected
// onto this surface using the query helpers at the bottom of the file.
//
// Units are metres. +X forward, +Y up, +Z to the car's right-hand side.
import * as THREE from 'three';

// --- Real-world dimensions (2022 Formentor) --------------------------------
export const DIM = { length: 4.450, width: 1.839, height: 1.511, wheelbase: 2.680 };
export const X_FRONT = 2.215;
export const X_REAR = -2.235;
export const AXLE_F = 1.340;
export const AXLE_R = -1.340;
export const TIRE_R = 0.339;      // 245/40 R19
export const TIRE_W = 0.245;
export const ARCH_R = 0.395;
export const TRACK_HALF = 0.790;  // wheel centre-plane offset from the centre line
export const ARCH_INNER_Z = 0.600;

const CROWN = 0.03;               // top surface crown (centre is higher than the edge)

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Monotone cubic (PCHIP) interpolation through [x, y] points: smooth, no overshoot.
export function pchip(points) {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  const m = new Array(n);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * m[lo] +
           (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h[lo] * m[hi];
  };
}

// --- Side profile & plan view curves ----------------------------------------
// Centre-line top height: tail, rear window, roof, windshield, cowl, bonnet, nose.
export const yTopP = pchip([
  [X_REAR, 1.00], [-2.17, 1.085], [-2.05, 1.160], [-1.90, 1.235], [-1.60, 1.340],
  [-1.20, 1.425], [-0.80, 1.480], [-0.40, 1.505], [-0.15, 1.511], [0.00, 1.496],
  [0.10, 1.430], [0.30, 1.265], [0.45, 1.145], [0.62, 1.020], [0.80, 0.992],
  [1.20, 0.972], [1.60, 0.935], [1.95, 0.885], [2.10, 0.835], [X_FRONT, 0.780],
]);
// Underside of the body.
export const yBottomP = pchip([
  [X_REAR, 0.40], [-2.15, 0.33], [-2.00, 0.24], [-1.70, 0.20], [-1.00, 0.185],
  [0.00, 0.18], [1.00, 0.185], [1.80, 0.20], [2.05, 0.215], [2.15, 0.24], [X_FRONT, 0.32],
]);
// Half-width of the widest part of the body.
export const wP = pchip([
  [X_REAR, 0.78], [-2.10, 0.85], [-1.90, 0.895], [-1.50, 0.922], [-1.00, 0.924],
  [-0.20, 0.920], [0.60, 0.920], [1.20, 0.920], [1.70, 0.912], [2.00, 0.880], [X_FRONT, 0.80],
]);
// Beltline (bottom of the side windows / top of the doors and fenders).
export const yBeltP = pchip([
  [X_REAR, 0.98], [-2.10, 1.085], [-1.85, 1.105], [-1.50, 1.090], [-1.00, 1.055],
  [-0.50, 1.020], [0.00, 1.000], [0.30, 0.990], [0.55, 0.975], [0.80, 0.955],
  [1.20, 0.935], [1.60, 0.905], [2.05, 0.840], [X_FRONT, 0.760],
]);
// Half-width of the roof / windshield edge (the A- and C-pillar line in plan view).
export const wRoofP = pchip([
  [X_REAR, 0.55], [-2.15, 0.60], [-2.00, 0.52], [-1.80, 0.47], [-1.50, 0.50],
  [-1.00, 0.58], [-0.40, 0.62], [0.00, 0.60], [0.15, 0.66], [0.35, 0.74],
  [0.62, 0.80], [1.00, 0.82], [2.00, 0.80], [X_FRONT, 0.70],
]);

// Height of the wheel-arch roof above the ground at station x (or -Infinity).
export function archY(x, axle) {
  const dx = x - axle;
  if (Math.abs(dx) >= ARCH_R) return -Infinity;
  return TIRE_R + Math.sqrt(ARCH_R * ARCH_R - dx * dx);
}

// --- End caps: superellipse taper that closes the loft at the nose / tail ------
const superCap = (t, n) => Math.pow(Math.max(0, 1 - Math.pow(clamp(t, 0, 1), n)), 1 / n);
const LF_W = 0.46, LR_W = 0.42, N_W = 2.8;      // plan-view rounding
const LF_H = 0.20, LR_H = 0.17, N_H = 4.2;      // side-view rounding
const YM_FRONT = 0.55, YM_REAR = 0.70;
function taper(x) {
  const sw = superCap((x - (X_FRONT - LF_W)) / LF_W, N_W) * superCap(((X_REAR + LR_W) - x) / LR_W, N_W);
  const front = x > 0;
  const sh = front ? superCap((x - (X_FRONT - LF_H)) / LF_H, N_H) : superCap(((X_REAR + LR_H) - x) / LR_H, N_H);
  return { sw, sh, ym: front ? YM_FRONT : YM_REAR };
}

// --- Cross-section ring -------------------------------------------------------
// Replace sharp corners of a polyline by quadratic fillets. Output point count is
// constant (segs+1 per corner) so every ring has identical topology.
function filletPath(pts, radii, segs) {
  const out = [];
  const tags = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (i === 0 || i === n - 1) { out.push([p[0], p[1]]); tags.push(i); continue; }
    const a = [pts[i - 1][0] - p[0], pts[i - 1][1] - p[1]];
    const b = [pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]];
    const la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
    if (la < 1e-6 || lb < 1e-6) {
      for (let k = 0; k <= segs; k++) { out.push([p[0], p[1]]); tags.push(i); }
      continue;
    }
    const d = Math.min(radii[i], la * 0.5, lb * 0.5);
    const s0 = [p[0] + (a[0] / la) * d, p[1] + (a[1] / la) * d];
    const s1 = [p[0] + (b[0] / lb) * d, p[1] + (b[1] / lb) * d];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, u = 1 - t;
      out.push([u * u * s0[0] + 2 * u * t * p[0] + t * t * s1[0], u * u * s0[1] + 2 * u * t * p[1] + t * t * s1[1]]);
      tags.push(i);
    }
  }
  return { pts: out, tags };
}

// Control-point names (index in the ring); BLACK_SEGMENTS are the unpainted parts.
export const RING = { CENTER_BOTTOM: 0, UNDER_EDGE: 1, ARCH_INNER: 2, LIP: 3, SILL: 4, SIDE: 5, BELT: 6, ROOF_EDGE: 7, TOP: 8 };
const FILLET_RADII = [0, 0.05, 0.035, 0.03, 0.05, 0.30, 0.16, 0.10, 0];
const FILLET_SEGS = 5;

export function ringControl(x) {
  const yb = yBottomP(x), w = wP(x);
  const yA = Math.max(yb, archY(x, AXLE_F), archY(x, AXLE_R));
  const arch = clamp((yA - yb) / 0.06, 0, 1);
  const yTop = yTopP(x);
  const yEdge = yTop - CROWN;
  const yBelt = Math.min(yBeltP(x), yEdge - 0.01);
  // Black lower bumper / diffuser grows towards the ends of the car.
  const band = 0.13 + 0.10 * smoothstep(1.55, 2.12, x) + 0.20 * smoothstep(-1.55, -2.12, x);
  const ySill = Math.max(yb + band, yA + 0.03);
  const yMid = lerp(ySill, yBelt, 0.42);
  const wBelt = w * 0.972;
  const wRoof = Math.min(wRoofP(x), wBelt - 0.005);
  return [
    [0, yb],
    [ARCH_INNER_Z, yb],
    [ARCH_INNER_Z, yA],
    [w - lerp(0.04, 0.004, arch), yA],
    [w - 0.006, ySill],
    [w, yMid],
    [wBelt, yBelt],
    [wRoof, yEdge],
    [0, yTop],
  ];
}

// Half ring (right-hand side) from the underside centre up to the top centre.
export function ringAt(x) {
  const ctrl = ringControl(x);
  const { pts, tags } = filletPath(ctrl, FILLET_RADII, FILLET_SEGS);
  const { sw, sh, ym } = taper(x);
  if (sw < 1 || sh < 1) {
    for (const p of pts) { p[0] *= sw; p[1] = ym + (p[1] - ym) * sh; }
  }
  return { pts, tags };
}

// Stations along X: coarse in the middle, dense at the ends and around the wheel arches.
export function stations() {
  const set = new Set();
  const add = (x) => { if (x >= X_REAR && x <= X_FRONT) set.add(Math.round(x * 10000) / 10000); };
  for (let x = X_REAR; x <= X_FRONT; x += 0.025) add(x);
  add(X_REAR); add(X_FRONT);
  for (let k = 1; k <= 14; k++) {
    const e = (0.2 * (1 - Math.cos((k / 14) * Math.PI / 2)));
    add(X_FRONT - e * 0.6); add(X_REAR + e * 0.6);
  }
  for (const ax of [AXLE_F, AXLE_R]) {
    for (let x = ax - ARCH_R; x <= ax + ARCH_R; x += 0.012) add(x);
    for (const e of [ax - ARCH_R, ax + ARCH_R]) { add(e - 0.0015); add(e + 0.0015); }
  }
  return [...set].sort((a, b) => a - b);
}

// --- Surface queries (used to project decals onto the loft) ---------------------
// Right-hand z of the body surface at height y for station x (null if y is outside).
export function sideZ(x, y) {
  const { pts } = ringAt(x);
  const n = pts.length;
  if (y < pts[0][1] - 1e-6 || y > pts[n - 1][1] + 1e-6) return null;
  let z = 0;
  for (let i = 0; i < n - 1; i++) {
    const y0 = pts[i][1], y1 = pts[i + 1][1];
    if (y >= y0 && y <= y1 && y1 - y0 > 1e-7) { z = lerp(pts[i][0], pts[i + 1][0], (y - y0) / (y1 - y0)); }
    else if (y >= y0 && y <= y1) { z = Math.max(z, pts[i][0], pts[i + 1][0]); }
  }
  return z;
}

// Height of the upper surface at (x, |z|). Searches the ring from the top centre downwards.
export function topY(x, z) {
  const { pts } = ringAt(x);
  const az = Math.abs(z);
  for (let i = pts.length - 1; i > 0; i--) {
    const z0 = pts[i - 1][0], z1 = pts[i][0];
    if (az >= Math.min(z0, z1) - 1e-9 && az <= Math.max(z0, z1) + 1e-9 && Math.abs(z1 - z0) > 1e-7) {
      return lerp(pts[i - 1][1], pts[i][1], (az - z0) / (z1 - z0));
    }
  }
  return pts[pts.length - 1][1];
}

// x of the nose (dir = +1) or tail (dir = -1) surface at a given (z, y). Scans in from the tip
// to find the first station that contains the point, then bisects, so points that sit in front
// of a wheel arch still land on the bumper rather than inside the arch.
export function endX(z, y, dir = 1) {
  const az = Math.abs(z);
  const inside = (x) => { const s = sideZ(x, y); return s !== null && az <= s; };
  const tip = dir > 0 ? X_FRONT : X_REAR;
  const limit = dir > 0 ? 1.45 : -1.45;
  let hi = tip, lo = null;
  for (let x = tip - dir * 0.01; dir > 0 ? x >= limit : x <= limit; x -= dir * 0.02) {
    if (inside(x)) { lo = x; break; }
    hi = x;
  }
  if (lo === null) return tip - dir * 0.05;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

export const V3 = THREE.Vector3;
