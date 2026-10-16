// Parametric smooth body surface for the futuristic Hammer: lofted superellipse-ish sections along X, wheel-arch carving,
// hood / body split, canopy dome, dents. Node-safe (no WebGL): returns BufferGeometries + a surface evaluator.
import * as THREE from 'three';
import { keyInterp, spline, smoothstep, clamp, lerp } from './geo.js';

export const NJ = 30;                       // samples on the right half-section (bottom -> top)
export const NX = 92;                       // stations along the car
export const RING = 2 * NJ - 2;             // closed ring size
export const HOOD_X = [0.72, 2.26];
export const HOOD_HALF = 10;                 // ring samples either side of the top centre that belong to the hood
export const WHEELS = Object.freeze({ front: 1.55, rear: -1.5, track: 1.0, radius: 0.43, width: 0.44, archR: 0.53 });
export const BODY_LEN = 5.22, BODY_X0 = -2.64, BODY_X1 = 2.58;

// x, half-width at the shoulder, bottom, shoulder (beltline) height, top at the centre line
const KEYS = [
  [-2.64, 0.84, 0.44, 0.90, 0.97], [-2.56, 0.90, 0.38, 0.93, 1.00], [-2.45, 0.95, 0.34, 0.95, 1.03], [-1.90, 1.07, 0.30, 1.00, 1.11], [-1.10, 1.12, 0.28, 1.02, 1.13],
  [-0.30, 1.11, 0.27, 1.01, 1.05], [0.55, 1.10, 0.27, 0.99, 1.01], [1.25, 1.09, 0.28, 0.94, 0.97], [1.95, 1.04, 0.30, 0.85, 0.88],
  [2.34, 0.95, 0.36, 0.72, 0.76], [2.50, 0.88, 0.42, 0.66, 0.69], [2.58, 0.78, 0.46, 0.62, 0.64],
];

/** Section parameters at x. */
export function sectionAt(x) { const [hw, yb, ysh, yt] = keyInterp(KEYS, x); const ridge = 0.034 * smoothstep(0.7, 1.15, x) * (1 - smoothstep(2.25, 2.5, x)); return { hw, yb, ysh, yt, ridge }; }   // ridge = centre crease on the bonnet

/** Right-half section points [z,y] (NJ of them), bottom centre -> top centre, for the station params. */
export function halfSection({ hw, yb, ysh, yt, ridge = 0 }) {
  const rise = yt - ysh;
  const c = [
    [0, yb], [hw * 0.70, yb], [hw * 0.93, yb + 0.025], [hw * 0.995, yb + 0.11], [hw, lerp(yb, ysh, 0.55)], [hw, ysh - 0.07], [hw * 0.985, ysh - 0.012],   // rocker, flat flank, shoulder crease
    [hw * 0.93, ysh + 0.02], [hw * 0.80, yt - rise * 0.35], [hw * 0.55, yt - rise * 0.07], [hw * 0.2, yt + ridge * 0.35], [0, yt + ridge],                                 // tight radius into a flat top plane
  ];
  return spline(c, NJ);
}

/** Station x positions, clustered toward both ends. */
export function stationXs() { const out = []; for (let i = 0; i < NX; i++) { const t = i / (NX - 1), s = 0.5 - 0.5 * Math.cos(Math.PI * t); out.push(BODY_X0 + (BODY_X1 - BODY_X0) * s); } return out; }

const smoothNoise = (x, y, z) => {                               // smooth value noise for dents
  const h = (i, j, k) => { let n = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), sx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), sx), sy), l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), sx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), sx), sy), sz);
};

/** Recess the front intake into the nose so the grille has real depth. */
export function carveGrille(p) {
  if (p[0] < 2.2 || Math.abs(p[2]) > 0.72 || p[1] < 0.38 || p[1] > 0.66) return p;
  const t = smoothstep(0.72, 0.58, Math.abs(p[2])) * smoothstep(0.38, 0.44, p[1]) * smoothstep(0.66, 0.6, p[1]);
  p[0] -= 0.2 * t * smoothstep(2.2, 2.4, p[0]);
  return p;
}
/** Carve wheel arches into a point (mutates and returns p=[x,y,z]). Pure. */
export function carveArches(p) {
  const az = Math.abs(p[2]);
  if (az < 0.3) return p;
  for (const xc of [WHEELS.front, WHEELS.rear]) {
    const d = Math.hypot(p[0] - xc, p[1] - WHEELS.radius);
    const R = WHEELS.archR;
    if (d < R + 0.1) {
      const t = smoothstep(R, R * 0.93, d), inner = 0.58;
      const z = lerp(az, Math.min(az, inner), t) + 0.03 * smoothstep(R + 0.1, R, d) * (1 - t);
      p[2] = Math.sign(p[2]) * z;
    }
  }
  return p;
}

/** Pure dent function: zone damage [front,right,rear,left] 0..1, crush 0..1 (roof), returns displaced point. */
export function dentPoint(x, y, z, dmg, crush = 0, out = [0, 0, 0]) {
  let dx = 0, dy = 0, dz = 0;
  const n1 = smoothNoise(x * 2.2 + 3, y * 2.2, z * 2.2), n2 = smoothNoise(x * 6 + 9, y * 6, z * 6 + 4);
  const crumple = 0.55 * n1 + 0.45 * n2;
  const [f, r, b, l] = dmg;
  if (f > 0.001) { const w = smoothstep(0.9, 2.6, x) * f; dx -= w * (0.1 + 0.3 * crumple); dy -= w * 0.12 * n2; dz += w * 0.1 * (n1 - 0.5); }
  if (b > 0.001) { const w = smoothstep(-0.9, -2.6, x) * b; dx += w * (0.08 + 0.26 * crumple); dy -= w * 0.1 * n2; dz += w * 0.08 * (n1 - 0.5); }
  const sideFade = 1 - smoothstep(1.7, 2.5, Math.abs(x));
  if (r > 0.001) { const w = smoothstep(0.5, 1.1, z) * r * sideFade; dz -= w * (0.06 + 0.2 * crumple); dy += w * 0.03 * (n2 - 0.5); }
  if (l > 0.001) { const w = smoothstep(-0.5, -1.1, z) * l * sideFade; dz += w * (0.06 + 0.2 * crumple); dy += w * 0.03 * (n2 - 0.5); }
  if (crush > 0.001 && y > 1.0) dy -= crush * (y - 0.95) * 0.5 * (0.7 + 0.5 * n1);
  out[0] = x + dx; out[1] = y + dy; out[2] = z + dz;
  return out;
}

/** Build the full body grid. Returns { P (Float32Array NX*RING*3), xs, ring(i,j) } with arches already carved. */
export function buildBodyGrid() {
  const xs = stationXs(), P = new Float32Array(NX * RING * 3);
  const tmp = [0, 0, 0];
  for (let i = 0; i < NX; i++) {
    const half = halfSection(sectionAt(xs[i]));
    for (let j = 0; j < RING; j++) {
      const rj = j < NJ ? j : RING - j;                            // mirror index for the left half
      const [z, y] = half[rj], sgn = j < NJ ? 1 : -1;
      tmp[0] = xs[i]; tmp[1] = y; tmp[2] = sgn * z; carveArches(tmp);
      const o = (i * RING + j) * 3; P[o] = tmp[0]; P[o + 1] = tmp[1]; P[o + 2] = tmp[2];
    }
  }
  return { P, xs };
}

/** Is cell (i,j) (between stations i,i+1 and ring samples j,j+1) part of the hood? */
export function isHoodCell(xs, i, j) {
  if (xs[i] < HOOD_X[0] - 1e-6 || xs[i + 1] > HOOD_X[1] + 1e-6) return false;
  return j >= NJ - 1 - HOOD_HALF && j < NJ - 1 + HOOD_HALF;
}

/**
 * Smooth-shaded geometries for { body, hood } with `aDirt` attribute. Normals come from the full grid (no seams).
 * Also returns `base` position copies for dent re-evaluation.
 */
export function buildBodyGeometries() {
  const { P, xs } = buildBodyGrid();
  // full-grid normals
  const N = new Float32Array(P.length), v = (i, j) => { const k = (i * RING + ((j % RING) + RING) % RING) * 3; return [P[k], P[k + 1], P[k + 2]]; };
  for (let i = 0; i < NX; i++) for (let j = 0; j < RING; j++) {
    const a = v(Math.max(0, i - 1), j), b = v(Math.min(NX - 1, i + 1), j), c = v(i, j - 1), d = v(i, j + 1);
    const tx = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], tz = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
    let n = [tx[1] * tz[2] - tx[2] * tz[1], tx[2] * tz[0] - tx[0] * tz[2], tx[0] * tz[1] - tx[1] * tz[0]];
    const l = Math.hypot(...n) || 1; n = n.map((q) => q / l);
    const p = v(i, j), sgn = Math.sign(p[2]) || 1;
    // orient outward: away from the centre line / up on top; ring order gives consistent sign but verify with the section centre
    const cy = (sectionAt(xs[i]).yb + sectionAt(xs[i]).yt) / 2, out = [0, p[1] - cy, p[2]];
    if (n[1] * out[1] + n[2] * out[2] + n[0] * 0 < 0) n = n.map((q) => -q);
    void sgn;
    const k = (i * RING + j) * 3; N[k] = n[0]; N[k + 1] = n[1]; N[k + 2] = n[2];
  }
  const make = (filter, caps = false) => {
    const pos = [], nor = [], uv = [], idx = [], dirt = [];
    const map = new Map();
    const vert = (i, j) => {
      j = ((j % RING) + RING) % RING;
      const key = i * RING + j;
      let id = map.get(key);
      if (id === undefined) {
        id = pos.length / 3; map.set(key, id);
        const k = key * 3; pos.push(P[k], P[k + 1], P[k + 2]); nor.push(N[k], N[k + 1], N[k + 2]);
        uv.push(j / RING, (xs[i] - BODY_X0) / BODY_LEN);
        const y = P[k + 1], ax = Math.abs(P[k]), az = Math.abs(P[k + 2]);
        let dm = Math.pow(clamp(1 - (y - 0.27) / 0.55, 0, 1), 1.4);
        for (const xc of [WHEELS.front, WHEELS.rear]) dm = Math.max(dm, 0.9 * (1 - smoothstep(0.5, 1.05, Math.hypot(P[k] - xc, y - 0.43))) * smoothstep(0.3, 0.8, az));
        void ax; dirt.push(dm);
      }
      return id;
    };
    for (let i = 0; i < NX - 1; i++) for (let j = 0; j < RING; j++) {
      if (!filter(i, j)) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1);
      idx.push(a, d, c, a, c, b);
    }
    if (caps) for (const [i, nx] of [[0, -1], [NX - 1, 1]]) {            // close the nose and tail with a fan
      let cx = 0, cy = 0;
      for (let j = 0; j < RING; j++) { const k = (i * RING + j) * 3; cy += P[k + 1] / RING; cx += P[k] / RING; }
      const c = pos.length / 3; pos.push(cx, cy, 0); nor.push(nx, 0, 0); uv.push(0.5, i ? 1 : 0); dirt.push(0.3);
      const ring = [];
      for (let j = 0; j < RING; j++) { const k = (i * RING + j) * 3, id = pos.length / 3; pos.push(P[k], P[k + 1], P[k + 2]); nor.push(nx, 0, 0); uv.push(j / RING, i ? 1 : 0); dirt.push(0.4); ring.push(id); }
      for (let j = 0; j < RING; j++) { const a = ring[j], b = ring[(j + 1) % RING]; if (nx > 0) idx.push(c, b, a); else idx.push(c, a, b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aDirt', new THREE.Float32BufferAttribute(dirt, 1)); g.setIndex(idx);
    return g;
  };
  const body = make((i, j) => !isHoodCell(xs, i, j), true), hood = make((i, j) => isHoodCell(xs, i, j));
  for (const g of [body, hood]) { g.userData.base = g.attributes.position.array.slice(); g.computeBoundingSphere(); g.computeBoundingBox(); }
  for (const g of [body, hood]) orientTriangles(g);
  return { body, hood, xs, grid: P };
}

/** Apply dents to a body/hood geometry from its stored base (recomputes smooth normals). */
export function applyDents(g, dmg, crush) {
  const base = g.userData.base, pos = g.attributes.position, tmp = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) { dentPoint(base[i * 3], base[i * 3 + 1], base[i * 3 + 2], dmg, crush, tmp); pos.setXYZ(i, tmp[0], tmp[1], tmp[2]); }
  pos.needsUpdate = true;
  g.computeVertexNormals(); g.attributes.normal.needsUpdate = true;
  g.computeBoundingSphere();
}

// ---------------------------------------------------------------- canopy
const CANOPY = [[-1.42, 0.80, 0.0], [-1.18, 0.89, 0.15], [-0.78, 0.93, 0.35], [-0.2, 0.93, 0.455], [0.28, 0.92, 0.43], [0.66, 0.90, 0.27], [1.0, 0.86, 0.0]];
export const CAN_NU = 28, CAN_NX = 40;
/** Canopy dome grid: returns geometry plus the roof sub-grid indices. θ from right base over the top to left base. */
export function buildCanopy() {
  const pos = [], nor = [], uv = [], idx = [];
  const pts = [];
  for (let i = 0; i < CAN_NX; i++) {
    const x = CANOPY[0][0] + (CANOPY[CANOPY.length - 1][0] - CANOPY[0][0]) * (0.5 - 0.5 * Math.cos(Math.PI * i / (CAN_NX - 1)));
    const [hw, h] = keyInterp(CANOPY.map((k) => [k[0], k[1], k[2]]), x);
    const base = sectionAt(x).yt - 0.025;
    for (let j = 0; j < CAN_NU; j++) {
      const th = (j / (CAN_NU - 1)) * Math.PI, c = Math.cos(th), s = Math.sin(th);
      const z = hw * c * (1 - 0.17 * s), y = base + h * Math.pow(s, 0.72);
      pts.push([x, y, z]);
    }
  }
  const at = (i, j) => pts[i * CAN_NU + j];
  for (let i = 0; i < CAN_NX; i++) for (let j = 0; j < CAN_NU; j++) { const p = at(i, j); pos.push(...p); uv.push(j / (CAN_NU - 1), i / (CAN_NX - 1)); }
  for (let i = 0; i < CAN_NX - 1; i++) for (let j = 0; j < CAN_NU - 1; j++) { const a = i * CAN_NU + j, b = (i + 1) * CAN_NU + j, c = (i + 1) * CAN_NU + j + 1, d = i * CAN_NU + j + 1; idx.push(a, b, c, a, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // outward check on the top centre
  const n = g.attributes.normal, topIdx = Math.floor(CAN_NX / 2) * CAN_NU + Math.floor(CAN_NU / 2);
  if (n.getY(topIdx) < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
  g.userData.pts = pts; g.userData.at = at;
  return g;
}
/** Point on the canopy surface at station index i / angle index j, nudged outward by `off`. */
export function canopyPoint(g, i, j, off = 0.004) {
  const p = g.userData.at(i, j), n = g.attributes.normal, k = i * CAN_NU + j;
  return [p[0] + n.getX(k) * off, p[1] + n.getY(k) * off, p[2] + n.getZ(k) * off];
}
/** Roof panel: the canopy cells around the top centre between two stations, as its own geometry (carbon). */
export function buildRoofPanel(canopy) {
  const pos = [], uv = [], idx = [], i0 = Math.round(CAN_NX * 0.25), i1 = Math.round(CAN_NX * 0.7), j0 = Math.round(CAN_NU * 0.16), j1 = Math.round(CAN_NU * 0.84);
  const map = new Map(), n = canopy.attributes.normal;
  const nor = [];
  const vert = (i, j) => { const key = i * CAN_NU + j; let id = map.get(key); if (id === undefined) { id = pos.length / 3; map.set(key, id); const p = canopyPoint(canopy, i, j, 0.006); pos.push(...p); nor.push(n.getX(key), n.getY(key), n.getZ(key)); uv.push((i - i0) / (i1 - i0) * 3, (j - j0) / (j1 - j0) * 3); } return id; };
  for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) { const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1); idx.push(a, b, c, a, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

/** Make every triangle's winding agree with its vertex normals (front faces point outward). Returns the number flipped. */
export function orientTriangles(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, ix = g.index.array;
  let flipped = 0;
  for (let k = 0; k < ix.length; k += 3) {
    const a = ix[k], b = ix[k + 1], c = ix[k + 2];
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const d = (uy * vz - uz * vy) * (n[a * 3] + n[b * 3] + n[c * 3]) + (uz * vx - ux * vz) * (n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1]) + (ux * vy - uy * vx) * (n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2]);
    if (d < 0) { ix[k + 1] = c; ix[k + 2] = b; flipped++; }
  }
  return flipped;
}
