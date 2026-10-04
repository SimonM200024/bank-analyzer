// Builds the lofted body mesh and a helper for "decals" (glass, lights, trim)
// that are draped over the body surface.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { ringAt, stations } from './profile.js';

// Ring control points whose adjoining segments are unpainted plastic (underbody,
// wheel-arch liners, lower bumper / sill band): tags 0..4 -> black.
const BLACK_UP_TO_TAG = 4;
const isBlackQuad = (t0, t1) => Math.max(t0, t1) <= BLACK_UP_TO_TAG;

export function buildBodyGeometry({ cutouts = [] } = {}) {
  const xs = stations();
  const rings = xs.map((x) => ringAt(x));
  const half = rings[0].pts.length;
  const full = 2 * half - 1;                    // top -> (+z side) -> bottom -> (-z side) -> top

  const positions = new Float32Array(xs.length * full * 3);
  const tagOf = (j) => (j < half ? half - 1 - j : j - (half - 1)); // index into half ring
  for (let i = 0; i < xs.length; i++) {
    const { pts } = rings[i];
    for (let j = 0; j < full; j++) {
      const h = tagOf(j);
      const sign = j < half ? 1 : -1;
      const o = (i * full + j) * 3;
      positions[o] = xs[i];
      positions[o + 1] = pts[h][1];
      positions[o + 2] = pts[h][0] * sign;
    }
  }

  const paint = [], black = [];
  const tags = rings[0].tags;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < full - 1; j++) {
      const a = i * full + j, b = i * full + j + 1, c = (i + 1) * full + j, d = (i + 1) * full + j + 1;
      const t0 = tags[tagOf(j)], t1 = tags[tagOf(j + 1)];
      const target = isBlackQuad(t0, t1) ? black : paint;
      // cutouts: drop quads whose centre falls inside a window opening
      if (cutouts.length) {
        const cx = (positions[a * 3] + positions[d * 3]) / 2;
        const cy = (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1] + positions[d * 3 + 1]) / 4;
        const cz = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2] + positions[d * 3 + 2]) / 4;
        if (cutouts.some((f) => f(cx, cy, cz))) continue;
      }
      target.push(a, b, c, c, b, d);
    }
  }

  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex([...paint, ...black]);
  geo.addGroup(0, paint.length, 0);
  geo.addGroup(paint.length, black.length, 1);
  geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(38));
  // toCreasedNormals returns a non-indexed geometry and drops groups; rebuild them.
  const paintVerts = paint.length;
  geo.clearGroups();
  geo.addGroup(0, paintVerts, 0);
  geo.addGroup(paintVerts, black.length, 1);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// --- Decals ------------------------------------------------------------------
// fn(s, t) -> [x, y, z] on the body surface for s,t in [0,1]. `outward` is the
// direction the decal faces (used to choose the winding). Returns a BufferGeometry.
export function decalGeometry(fn, nu, nv, { outward = [0, 0, 1], offset = 0.0015, uvScale = [1, 1] } = {}) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const s = i / nu, t = j / nv;
      const p = fn(s, t);
      const k = i * (nv + 1) + j;
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      uv[k * 2] = s * uvScale[0]; uv[k * 2 + 1] = t * uvScale[1];
    }
  }
  const idx = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + 1, c = a + (nv + 1), d = c + 1;
      idx.push(a, b, c, c, b, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // choose winding so the decal faces `outward`
  const n = geo.getAttribute('normal');
  let dot = 0;
  for (let k = 0; k < n.count; k++) dot += n.getX(k) * outward[0] + n.getY(k) * outward[1] + n.getZ(k) * outward[2];
  if (dot < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  if (offset) {
    const p = geo.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      p.setXYZ(k, p.getX(k) + n.getX(k) * offset, p.getY(k) + n.getY(k) * offset, p.getZ(k) + n.getZ(k) * offset);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  }
  geo.computeBoundingSphere();
  return geo;
}
