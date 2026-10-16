// Node-safe geometry helpers for the PBR hero slice (no DOM/WebGL): merge, transform, rounded boxes, ribbons, smooth splines.
import * as THREE from 'three';

/** Merge indexed/non-indexed geometries with position+normal+uv (+ optional float attrs listed in extra) into one indexed geometry. */
export function mergeGeo(list, extra = []) {
  let vc = 0, ic = 0;
  const items = list.filter(Boolean).map((g) => (g.index ? g : (() => { const c = g.clone(); c.setIndex([...Array(c.attributes.position.count).keys()]); return c; })()));
  for (const g of items) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const ex = Object.fromEntries(extra.map((k) => [k.name, new Float32Array(vc * k.size)]));
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of items) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    for (const k of extra) if (g.attributes[k.name]) ex[k.name].set(g.attributes[k.name].array, vo * k.size);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += n; io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (const k of extra) out.setAttribute(k.name, new THREE.BufferAttribute(ex[k.name], k.size));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** Apply position / euler rotation (x,y,z rad) / scale to a geometry (returns the same geometry). */
export function xf(g, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  const sc = typeof scale === 'number' ? [scale, scale, scale] : scale;
  _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(sc[0], sc[1], sc[2]));
  g.applyMatrix4(_m);
  return g;
}

/** Smooth rounded box (superellipsoid-ish): w,h,d full sizes, r corner radius, seg subdivisions. */
export function roundedBox(w, h, d, r = 0.05, seg = 6) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position, n = g.attributes.normal;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r, v = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    q.set(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z)));
    v.sub(q);
    if (v.lengthSq() < 1e-12) { v.fromBufferAttribute(n, i); }
    v.normalize();
    p.setXYZ(i, q.x + v.x * r, q.y + v.y * r, q.z + v.z * r);
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** Catmull-Rom through 2D/3D points (centripetal-ish uniform), returns `samples` points. pts = array of arrays. */
export function spline(pts, samples) {
  const out = [], n = pts.length, dim = pts[0].length;
  const P = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  const segs = n - 1;
  for (let s = 0; s < samples; s++) {
    const t = (s / (samples - 1)) * segs, i = Math.min(segs - 1, Math.floor(t)), f = t - i;
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2), pt = [];
    for (let k = 0; k < dim; k++) {
      const f2 = f * f, f3 = f2 * f;
      pt.push(0.5 * ((2 * b[k]) + (-a[k] + c[k]) * f + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * f2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * f3));
    }
    out.push(pt);
  }
  return out;
}

/** Interpolate a key table [[x, v...], ...] at x with Catmull-Rom (clamped). Returns array of v. */
export function keyInterp(keys, x) {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0].slice(1);
  if (x >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0; while (i < n - 2 && x > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const f = (x - k1[0]) / (k2[0] - k1[0]), f2 = f * f, f3 = f2 * f, out = [];
  for (let k = 1; k < k1.length; k++) out.push(0.5 * ((2 * k1[k]) + (-k0[k] + k2[k]) * f + (2 * k0[k] - 5 * k1[k] + 4 * k2[k] - k3[k]) * f2 + (-k0[k] + 3 * k1[k] - 3 * k2[k] + k3[k]) * f3));
  return out;
}

/** Flat ribbon (quad strip) along 3D points with width w, oriented by `up` hint; two-sided normal = up. */
export function ribbon(points, w, up = [0, 1, 0]) {
  const pos = [], idx = [], nor = [], uv = [];
  const U = new THREE.Vector3(...up), a = new THREE.Vector3(), b = new THREE.Vector3(), t = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    a.set(...points[Math.max(0, i - 1)]); b.set(...points[Math.min(points.length - 1, i + 1)]);
    t.subVectors(b, a).normalize(); side.crossVectors(t, U).normalize().multiplyScalar(w / 2);
    const p = points[i];
    pos.push(p[0] - side.x, p[1] - side.y, p[2] - side.z, p[0] + side.x, p[1] + side.y, p[2] + side.z);
    nor.push(U.x, U.y, U.z, U.x, U.y, U.z); uv.push(0, i / (points.length - 1), 1, i / (points.length - 1));
    if (i < points.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Tube along points (radial segments), for exhaust, cables, light pipes. */
export function tube(points, radius, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 3), radius, radial, false);
}

/** Count triangles of a geometry. */
export const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
