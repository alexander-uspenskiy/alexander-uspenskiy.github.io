// Node-safe geometry helpers: flat-shaded, vertex-coloured (palette) mesh building. No DOM / WebGL.
import * as THREE from 'three';
import { PALETTE } from './paletteRef.js';
export { clamp, lerp, smoothstep, wrapAngle, angleDiff, mulberry32, TAU } from '../core/mathUtil.js';

const _c = new THREE.Color();
const _rgbCache = new Map();
/** palette index (or '#hex') -> [r,g,b] in THREE working (linear) space, cached. */
export function colorRGB(c) {
  let v = _rgbCache.get(c);
  if (!v) {
    _c.set(typeof c === 'number' ? PALETTE[((c % 16) + 16) % 16] : c);
    v = [_c.r, _c.g, _c.b];
    _rgbCache.set(c, v);
  }
  return v;
}

/** Accumulates non-indexed triangles with per-vertex colour; build() -> BufferGeometry with flat normals. */
export class MeshBuilder {
  constructor() {
    this.p = [];
    this.c = [];
  }
  get triCount() { return this.p.length / 9; }
  tri(a, b, c, col) {
    const rgb = colorRGB(col);
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.c.push(rgb[0], rgb[1], rgb[2]);
    return this;
  }
  /** Triangle wound so its normal faces away from `center` (for convex solids). */
  solidTri(a, b, c, center, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - center[0], my = (a[1] + b[1] + c[1]) / 3 - center[1], mz = (a[2] + b[2] + c[2]) / 3 - center[2];
    return nx * mx + ny * my + nz * mz >= 0 ? this.tri(a, b, c, col) : this.tri(a, c, b, col);
  }
  solidQuad(a, b, c, d, center, col) {
    this.solidTri(a, b, c, center, col);
    return this.solidTri(a, c, d, center, col);
  }
  /** Free (single-sided, up-facing if a,b,c,d are CCW seen from above) quad. */
  quad(a, b, c, d, col) {
    this.tri(a, b, c, col);
    return this.tri(a, c, d, col);
  }
  box(cx, cy, cz, sx, sy, sz, col, top = col) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    return this.slab(cx - hx, hz, cy - hy, cy + hy, cx + hx, hz, cy - hy, cy + hy, col, top, cz);
  }
  /**
   * Lofted slab between two cross-sections (x0 and x1). Each section: half-width hw, bottom yb, top yt, centred on z=zc.
   * Used for wedges / tapered bodies. `top` colours the top face.
   */
  slab(x0, hw0, yb0, yt0, x1, hw1, yb1, yt1, col, top = col, zc = 0) {
    const v = [
      [x0, yb0, zc - hw0], [x0, yb0, zc + hw0], [x0, yt0, zc + hw0], [x0, yt0, zc - hw0],
      [x1, yb1, zc - hw1], [x1, yb1, zc + hw1], [x1, yt1, zc + hw1], [x1, yt1, zc - hw1],
    ];
    const ctr = [0, 0, 0];
    for (const p of v) { ctr[0] += p[0] / 8; ctr[1] += p[1] / 8; ctr[2] += p[2] / 8; }
    this.solidQuad(v[0], v[1], v[2], v[3], ctr, col); // x0 cap
    this.solidQuad(v[4], v[5], v[6], v[7], ctr, col); // x1 cap
    this.solidQuad(v[0], v[1], v[5], v[4], ctr, col); // bottom
    this.solidQuad(v[3], v[2], v[6], v[7], ctr, top); // top
    this.solidQuad(v[0], v[3], v[7], v[4], ctr, col); // -z side
    this.solidQuad(v[1], v[2], v[6], v[5], ctr, col); // +z side
    return this;
  }
  /** Cylinder/cone along an axis ('x'|'y'|'z') centred at (cx,cy,cz); r1 at -axis end, r2 at +axis end. */
  cyl(cx, cy, cz, r1, r2, len, axis, seg, col, capCol = col) {
    const h = len / 2;
    const pt = (a, r, k) => {
      const u = Math.cos(a) * r, w = Math.sin(a) * r;
      if (axis === 'x') return [cx + k, cy + u, cz + w];
      if (axis === 'y') return [cx + u, cy + k, cz + w];
      return [cx + u, cy + w, cz + k];
    };
    const ctr = [cx, cy, cz];
    const c0 = pt(0, 0, -h), c1 = pt(0, 0, h);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = pt(a0, r1, -h), p1 = pt(a1, r1, -h), q0 = pt(a0, r2, h), q1 = pt(a1, r2, h);
      this.solidQuad(p0, p1, q1, q0, ctr, col);
      if (r1 > 0) this.solidTri(c0, p0, p1, ctr, capCol);
      if (r2 > 0) this.solidTri(c1, q0, q1, ctr, capCol);
    }
    return this;
  }
  /** Square pyramid / spike pointing along +y from (cx,cy,cz). */
  spike(cx, cy, cz, r, h, col) {
    return this.cyl(cx, cy + h / 2, cz, r, 0, h, 'y', 4, col);
  }
  /** Append another builder's triangles. */
  append(other) {
    for (const v of other.p) this.p.push(v);
    for (const v of other.c) this.c.push(v);
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals(); // non-indexed => flat normals
    g.computeBoundingSphere();
    return g;
  }
}

/** Dispose geometries/materials under root (skip anything flagged userData.shared). */
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.userData && o.userData.shared) return;
    if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
    const m = o.material;
    if (m && !(m.userData && m.userData.shared)) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  });
}

/** Sim (x,y) -> world. */
export const toWorld = (x, y, out = new THREE.Vector3(), h = 0) => out.set(x, h, y);
