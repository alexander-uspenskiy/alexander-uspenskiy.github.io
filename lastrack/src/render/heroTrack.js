// Hero Detroit Scrapyard: textured, baked-AO, chunked track with barriers, junk, cranes, lamps, skyline and dusk sky.
// buildHeroTrackGeometry() is Node-safe (BufferGeometry only); buildHeroTrack() wraps it in meshes/textures/materials.
import * as THREE from 'three';
import { MeshBuilder, colorRGB, mulberry32, clamp } from './geomUtil.js';
import { COLOR as K } from './paletteRef.js';
import { ATLAS_TILES, ATLAS_SIZE, TILE, paintTarmac, paintGround, paintAtlas, paintSkyline, textRows } from './heroTexture.js';
import { darker } from './heroCar.js';

export const CHUNKS = 8;
export const SUN_DIR = Object.freeze([-90, 16, 40]);
const PLAIN = ATLAS_TILES.plain;

/** Builder with UVs + free per-vertex colour; inherits box/slab/cyl (default UV = plain white tile). */
export class TB extends MeshBuilder {
  constructor() { super(); this.uv = []; }
  tri(a, b, c, col) { super.tri(a, b, c, col); const u = tileUV(PLAIN, 0.5, 0.5); this.uv.push(u[0], u[1], u[0], u[1], u[0], u[1]); return this; }
  triRaw(a, b, c, ua, ub, uc, ca, cb, cc) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    return this;
  }
  quadRaw(p, uv, rgb) { this.triRaw(p[0], p[1], p[2], uv[0], uv[1], uv[2], rgb[0], rgb[1], rgb[2]); return this.triRaw(p[0], p[2], p[3], uv[0], uv[2], uv[3], rgb[0], rgb[2], rgb[3]); }
  /** Atlas-tiled quad. uv0..: local (u,v) 0..1 with v up; tint = scalar per vertex (baked AO). */
  tquad(p, tile, uvs, tints, base = [1, 1, 1]) {
    const uv = uvs.map(([u, v]) => tileUV(tile, u, v));
    const rgb = tints.map((t) => [base[0] * t, base[1] * t, base[2] * t]);
    return this.quadRaw(p, uv, rgb);
  }
  build() { const g = super.build(); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); return g; }
  /** Append `src` (a TB) transformed by yaw/scale/translation. */
  place(src, x, y, z, yaw = 0, sc = 1, tilt = 0) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let i = 0; i < src.p.length; i += 3) {
      let px = src.p[i] * sc, py = src.p[i + 1] * sc, pz = src.p[i + 2] * sc;
      const ty = py * ct - pz * st; pz = py * st + pz * ct; py = ty;           // tilt about x
      this.p.push(x + px * cy - pz * sy, y + py, z + px * sy + pz * cy);
    }
    for (const v of src.c) this.c.push(v);
    for (const v of src.uv) this.uv.push(v);
    return this;
  }
}
export function tileUV(tile, u, v) {
  const tx = tile % 4, ty = (tile / 4) | 0, inset = 0.5;
  const x = tx * TILE + inset + u * (TILE - 2 * inset), y = ty * TILE + inset + (1 - v) * (TILE - 2 * inset);
  return [x / ATLAS_SIZE, y / ATLAS_SIZE];
}
const grey = (t) => [t, t, t];

const hash = (n) => { let h = Math.imul(n | 0, 0x9e3779b1) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; return ((h ^ (h >>> 13)) >>> 0) / 4294967295; };

// ------------------------------------------------------------------ prop variants (built once, instanced via place())
function crushedCar(col, seed) {
  const b = new TB(), r = mulberry32(seed), dk = darker(col);
  const h = 0.42 + r() * 0.12;
  b.slab(-2.1, 0.88, 0.1, h, 2.1, 0.88, 0.1, h * 0.92, col, col);
  b.slab(-0.8 + r() * 0.3, 0.74, h, h + 0.3, 0.7, 0.62, h, h + 0.22, dk, col);          // squashed cabin
  b.box(0.0, h + 0.26, 0.76, 1.2, 0.18, 0.02, K.black);                                   // dark windows
  b.box(0.0, h + 0.26, -0.76, 1.2, 0.18, 0.02, K.black);
  b.box(2.15, 0.2, 0, 0.16, 0.2, 1.7, K.darkGrey);                                       // bumpers
  b.box(-2.15, 0.2, 0, 0.16, 0.2, 1.7, K.lightGrey);
  b.box(0.3, 0.07, 0, 3.8, 0.08, 1.7, K.black);                                          // underside AO
  if (r() < 0.5) b.box(1.3, h + 0.04, 0, 0.9, 0.04, 1.2, K.black);                       // missing hood hole
  for (const z of [0.9, -0.9]) { b.box(0.6, h * 0.6, z, 1.4, 0.15, 0.03, dk); if (r() < 0.6) b.cyl(1.4, 0.3, z, 0.34, 0.34, 0.2, 'z', 6, K.black, K.darkGrey); }
  return b;
}
function drum(col) { const b = new TB(); b.cyl(0, 0.5, 0, 0.42, 0.42, 1.0, 'y', 7, col, K.darkGrey); b.box(0, 0.32, 0, 0.9, 0.06, 0.9, K.black); b.box(0, 0.7, 0, 0.88, 0.05, 0.88, K.black); return b; }
function container(col) {
  const b = new TB();
  const p = [[-3, 0, -1.2], [3, 0, -1.2], [3, 2.6, -1.2], [-3, 2.6, -1.2]];
  const q = [[-3, 0, 1.2], [3, 0, 1.2], [3, 2.6, 1.2], [-3, 2.6, 1.2]];
  const c = colorRGB(col), t = [c[0], c[1], c[2]];
  for (const z of [-1.2, 1.2]) b.tquad([[-3, 0, z], [3, 0, z], [3, 2.6, z], [-3, 2.6, z]], ATLAS_TILES.container, [[0, 0], [3, 0], [3, 1], [0, 1]], [0.5, 0.5, 1, 1], t);
  b.tquad([[-3, 2.6, -1.2], [3, 2.6, -1.2], [3, 2.6, 1.2], [-3, 2.6, 1.2]], ATLAS_TILES.rust, [[0, 0], [2, 0], [2, 1], [0, 1]], [1, 1, 1, 1], t);
  b.tquad([[3, 0, -1.2], [3, 0, 1.2], [3, 2.6, 1.2], [3, 2.6, -1.2]], ATLAS_TILES.container, [[0, 0], [1, 0], [1, 1], [0, 1]], [0.6, 0.6, 1, 1], t);
  void p; void q;
  b.box(3.02, 1.3, 0.55, 0.05, 2.4, 0.06, K.darkGrey); b.box(3.02, 1.3, -0.55, 0.05, 2.4, 0.06, K.darkGrey);
  return b;
}
function tyreHeap() { const b = new TB(); const r = mulberry32(5); for (let i = 0; i < 9; i++) { const lvl = i < 5 ? 0 : i < 8 ? 1 : 2; b.cyl(((i % 5) - 2) * 0.9 + (lvl ? 0.4 : 0) + (r() - 0.5) * 0.2, 0.2 + lvl * 0.42, (r() - 0.5) * 1.0, 0.45, 0.45, 0.4, 'y', 7, K.black, K.darkGrey); } return b; }
function scrapHeap(seed) {
  const b = new TB(), r = mulberry32(seed), cols = [K.rust, K.darkGrey, K.lightGrey, K.plum, K.navy, K.rust];
  for (let i = 0; i < 12; i++) { const k = 1 - i / 12, c = cols[(r() * cols.length) | 0]; b.box((r() - 0.5) * 5 * k, 0.35 + (1 - k) * 2.4 + r() * 0.5, (r() - 0.5) * 5 * k, 0.8 + r() * 1.8, 0.4 + r() * 1.1, 0.8 + r() * 1.8, c, darker(c) === c ? K.darkGrey : c); }
  b.box(0, 0.12, 0, 6, 0.24, 6, K.black);
  return b;
}
function shack() {
  const b = new TB();
  b.tquad([[-3, 0, -2], [3, 0, -2], [3, 3, -2], [-3, 3, -2]], ATLAS_TILES.metal, [[0, 0], [3, 0], [3, 1], [0, 1]], [0.55, 0.55, 1, 1]);
  b.tquad([[-3, 0, 2], [3, 0, 2], [3, 3, 2], [-3, 3, 2]], ATLAS_TILES.metal, [[0, 0], [3, 0], [3, 1], [0, 1]], [0.55, 0.55, 1, 1]);
  b.tquad([[3, 0, -2], [3, 0, 2], [3, 3, 2], [3, 3, -2]], ATLAS_TILES.metal, [[0, 0], [2, 0], [2, 1], [0, 1]], [0.55, 0.55, 1, 1]);
  b.slab(-3.2, 2.2, 3, 3.1, 3.2, 2.2, 3, 3.1, K.darkGrey, K.black);
  b.box(3.05, 1.2, 0.8, 0.06, 1.1, 0.9, K.black); b.box(3.05, 1.9, -0.9, 0.06, 0.5, 0.8, K.yellow);
  return b;
}
function crusherFrame() {
  const b = new TB();
  for (const [x, z] of [[-4, -3.5], [4, -3.5], [-4, 3.5], [4, 3.5]]) { b.box(x, 5.5, z, 0.8, 11, 0.8, K.yellow, K.rust); b.box(x, 0.4, z, 1.4, 0.8, 1.4, K.darkGrey); }
  b.box(0, 11.2, -3.5, 9, 0.9, 0.9, K.yellow); b.box(0, 11.2, 3.5, 9, 0.9, 0.9, K.yellow); b.box(0, 11.6, 0, 1, 0.9, 7.8, K.rust);
  b.box(0, 0.2, 0, 7, 0.4, 6, K.black);                                   // pit floor
  for (let i = 0; i < 3; i++) b.place(crushedCar(i ? K.rust : K.navy, 40 + i), 0, 0.3 + i * 0.38, 0, 0.3 * i, 0.9);
  b.box(6.2, 2.5, 0, 2.2, 5, 3, K.darkGrey); b.box(6.2, 5.3, 0, 2.4, 0.4, 3.2, K.red);   // control house
  return b;
}
function crusherPress() {
  const b = new TB();
  b.box(0, 0, 0, 6.4, 1.4, 5.4, K.darkGrey, K.lightGrey);
  for (let i = -2; i <= 2; i++) b.box(i * 1.2, -0.85, 0, 0.5, 0.35, 5, K.black);
  b.box(0, 3.5, 0, 0.7, 7, 0.7, K.lightGrey);
  return b;
}
function craneTower() {
  const b = new TB();
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) b.box(x, 11, z, 0.22, 22, 0.22, K.yellow);
  for (let y = 2; y < 22; y += 3) { b.box(0, y, -0.8, 1.7, 0.12, 0.12, K.yellow); b.box(0, y, 0.8, 1.7, 0.12, 0.12, K.yellow); b.box(-0.8, y, 0, 0.12, 0.12, 1.7, K.yellow); b.box(0.8, y, 0, 0.12, 0.12, 1.7, K.yellow); b.box(0, y + 1.5, 0.8, 1.9, 0.1, 0.1, K.rust); }
  b.box(0, 0.5, 0, 3.4, 1, 3.4, K.darkGrey); b.box(0, 22.8, 0, 2.2, 1.6, 2.2, K.darkGrey);
  b.box(0, 23.8, 0, 1.4, 1.2, 1.4, K.red);
  return b;
}
function craneBoom() {
  const b = new TB(), L = 26;
  b.box(L / 2 - 4, 0, 0, L, 0.5, 0.5, K.yellow); b.box(L / 2 - 4, 0.9, 0, L, 0.12, 0.12, K.yellow); b.box(L / 2 - 4, 0.45, 0.4, L, 0.1, 0.1, K.rust); b.box(L / 2 - 4, 0.45, -0.4, L, 0.1, 0.1, K.rust);
  b.box(-6, -0.2, 0, 4, 1.2, 1.6, K.darkGrey);            // counterweight
  b.box(L - 6, -3, 0, 0.06, 6, 0.06, K.black);           // cable
  for (let k = 0; k < 8; k++) b.box(L - 6, -5.8 + k * 0.3, 0, 0.1, 0.2, k % 2 ? 0.05 : 0.14, K.lightGrey); // chain links
  b.cyl(L - 6, -6.4, 0, 1.2, 1.2, 0.35, 'y', 8, K.darkGrey, K.black);      // magnet
  b.place(crushedCar(K.red, 91), L - 6, -7.5, 0, 0.5, 0.8, 0.2);
  return b;
}
function chainSet(n = 8) {
  const b = new TB();
  for (let k = 0; k < n; k++) { b.box(0, -k * 0.28, 0, 0.1, 0.24, k % 2 ? 0.04 : 0.14, K.lightGrey); }
  b.box(0, -n * 0.28 - 0.2, 0, 0.5, 0.16, 0.5, K.darkGrey);
  b.box(0, -n * 0.28 - 0.6, 0, 0.1, 0.5, 0.1, K.rust);
  return b;
}
function signText(b, text, x, y, z, px, col, facing = 1) {
  const rows = textRows(text);
  for (let r = 0; r < 5; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '1') {
    const xx = x + (c - rows[r].length / 2) * px, yy = y + (2 - r) * px;
    b.solidQuad([xx, yy, z], [xx + px, yy, z], [xx + px, yy + px, z], [xx, yy + px, z], [x, y, z - facing], col);
  }
}

// ------------------------------------------------------------------ geometry
/**
 * Build all hero-track geometry. Returns { chunks:[{road,apron,struct,paint,glow,detail}], ground, flares:{pos,size,col}, animated, stats, bounds }.
 * Deterministic for (track, seed).
 */
export function buildHeroTrackGeometry(track, { seed = 1337 } = {}) {
  const n = track.n, L = track.length, half = track.width / 2, def = track.def || {}, sf = def.surfaces || {};
  const rng = mulberry32(seed ^ 0x5c3a), S = track.samples;
  const mk = () => ({ road: new TB(), apron: new TB(), struct: new TB(), paint: new TB(), glow: new TB(), pools: new TB(), detail: new TB() });
  const chunks = Array.from({ length: CHUNKS }, mk);
  const chunkAt = (i) => chunks[Math.min(CHUNKS - 1, Math.floor((((i % n) + n) % n) / n * CHUNKS))];
  const flares = { pos: [], size: [], col: [], flick: [] };
  const animated = [];
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const smp = (i) => S[((i % n) + n) % n];
  const W = (i, d, y = 0) => { const s = smp(i); return [s.x - Math.sin(s.heading) * d, y, s.y + Math.cos(s.heading) * d]; };
  const Wp = (s, d, y = 0) => { const p = track.pointAt(s); return [p.x - Math.sin(p.heading) * d, y, p.y + Math.cos(p.heading) * d]; };
  for (let i = 0; i < n; i += 3) { const a = W(i, half); bounds.minX = Math.min(bounds.minX, a[0]); bounds.maxX = Math.max(bounds.maxX, a[0]); bounds.minY = Math.min(bounds.minY, a[2]); bounds.maxY = Math.max(bounds.maxY, a[2]); }

  // ---- corners (for kerbs, arrows, skid marks, barrier choice)
  const curvAvg = (i) => { let m = 0; for (let k = -2; k <= 2; k++) m += smp(i + k).curv; return m / 5; };
  const corner = new Float32Array(n);
  for (let i = 0; i < n; i++) corner[i] = curvAvg(i);
  const hard = (i) => Math.abs(corner[((i % n) + n) % n]) > 0.011;

  // ---- road ribbon with lateral AO and rubbered lanes
  const D = [-half, -half + 1.2, -4.5, -2.4, 0, 2.4, 4.5, half - 1.2, half];
  const TINT = [0.5, 0.78, 0.95, 0.8, 1, 0.8, 0.95, 0.78, 0.5];
  const patch = (i) => { const k = Math.floor(i / 6); return 0.84 + 0.2 * hash(k * 7 + 3) + (hash(k + 101) < 0.12 ? -0.1 : 0); };
  for (let i = 0; i < n; i++) {
    const ck = chunkAt(i), t0 = patch(i), t1 = patch(i + 1);
    for (let j = 0; j < D.length - 1; j++) {
      const p = [W(i, D[j], 0), W(i, D[j + 1], 0), W(i + 1, D[j + 1], 0), W(i + 1, D[j], 0)];
      const s0 = smp(i).s, s1 = s0 + track.ds;
      const u0 = (D[j] + half) / 8, u1 = (D[j + 1] + half) / 8;
      ck.road.quadRaw(p, [[u0, s0 / 8], [u1, s0 / 8], [u1, s1 / 8], [u0, s1 / 8]], [grey(TINT[j] * t0), grey(TINT[j + 1] * t0), grey(TINT[j + 1] * t1), grey(TINT[j] * t1)]);
    }
  }

  // ---- paint: lines, kerbs, grid, chevrons, skid scars, oil, puddles, dirt
  const strip = (b, i0, i1, d0, d1, y, col) => { for (let i = i0; i < i1; i++) b.quad(W(i, d0, y), W(i, d1, y), W(i + 1, d1, y), W(i + 1, d0, y), col); };
  for (let i = 0; i < n; i++) {
    const ck = chunkAt(i);
    const worn = hash(i * 13 + 7) < 0.1;
    if (!worn) { strip(ck.paint, i, i + 1, half - 1.45, half - 1.28, 0.025, K.white); strip(ck.paint, i, i + 1, -half + 1.28, -half + 1.45, 0.025, K.white); }
    if (i % 4 < 2) strip(ck.paint, i, i + 1, -0.07, 0.07, 0.025, K.yellow);          // dashed centre line
    if (hard(i)) {                                                                    // rumble kerbs on both edges of corners
      const c = (Math.floor(i / 1) % 2) ? K.red : K.white;
      strip(ck.paint, i, i + 1, half - 1.2, half, 0.035, c); strip(ck.paint, i, i + 1, -half, -half + 1.2, 0.035, c);
    }
  }
  const scars = [];
  for (let i = 8; i < n - 8; i++) if (hard(i) && !hard(i - 1) === false && Math.abs(corner[i]) > Math.abs(corner[i - 1]) && Math.abs(corner[i]) >= Math.abs(corner[i + 1]) && Math.abs(corner[i]) > 0.014) scars.push(i);   // apex samples
  for (const a of scars.slice(0, 24)) {
    const side = corner[a] > 0 ? -1 : 1;
    for (let k = -14; k < 4; k++) {
      const ck = chunkAt(a + k);
      const d = side * (3.4 - (k + 14) * 0.03);
      strip(ck.paint, a + k, a + k + 1, d - 0.28, d - 0.05, 0.03, K.black); strip(ck.paint, a + k, a + k + 1, d + 0.55, d + 0.78, 0.03, K.black);
    }
    for (let k = -30; k > -38; k -= 3) {                                               // yellow braking chevrons ahead of the corner
      const ck = chunkAt(a + k), i = a + k;
      ck.paint.tri(W(i, -1.2, 0.03), W(i + 1, 0, 0.03), W(i, 1.2, 0.03), K.yellow); ck.paint.tri(W(i, -0.6, 0.03), W(i + 1, 0, 0.03), W(i, 0.6, 0.03), K.black);
    }
  }
  // start / finish: checker + grid boxes
  for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
    const d0 = -half + c, d1 = d0 + 1, i = r;
    chunks[0].paint.quad(W(i, d0, 0.04), W(i, d1, 0.04), W(i + 1, d1, 0.04), W(i + 1, d0, 0.04), (c + r) % 2 ? K.black : K.white);
  }
  const grid = track.startGrid(10);
  for (const g of grid) {
    const idx = track.project(g.x, g.y).i, ck = chunkAt(idx);
    const fx = Math.cos(g.heading), fy = Math.sin(g.heading), nx = -fy, ny = fx;
    const q = (a, b2, c2, d2) => ck.paint.quad([g.x + fx * a + nx * b2, 0.03, g.y + fy * a + ny * b2], [g.x + fx * c2 + nx * b2, 0.03, g.y + fy * c2 + ny * b2], [g.x + fx * c2 + nx * d2, 0.03, g.y + fy * c2 + ny * d2], [g.x + fx * a + nx * d2, 0.03, g.y + fy * a + ny * d2], K.white);
    q(-1.2, -1.2, 1.4, -1.1); q(-1.2, 1.1, 1.4, 1.2); q(-1.2, -1.2, -1.1, 1.2);
  }
  // oil slicks (match sim surfaces), puddles, dirt
  const blob = (b, x, z, r, col, y, sd) => { const rr = mulberry32(sd); const segs = 12; for (let k = 0; k < segs; k++) { const a0 = (k / segs) * 6.2832, a1 = ((k + 1) / segs) * 6.2832, r0 = r * (0.8 + rr() * 0.3), r1 = r * (0.8 + rr() * 0.3); b.tri([x, y, z], [x + Math.cos(a0) * r0, y, z + Math.sin(a0) * r0], [x + Math.cos(a1) * r1, y, z + Math.sin(a1) * r1], col); } };
  const lat = (s, d) => Wp(s, d, 0);
  const idxAt = (s) => Math.round(((s % L) + L) % L / track.ds);
  for (const [k, o] of (sf.oil || []).entries()) {
    const c = lat(o.s * L, o.d), ck = chunkAt(idxAt(o.s * L));
    blob(ck.paint, c[0], c[2], o.r, K.black, 0.04, 31 + k); blob(ck.paint, c[0] + 0.3, c[2] - 0.2, o.r * 0.62, K.navy, 0.045, 61 + k);
    blob(ck.paint, c[0] - o.r * 0.25, c[2] + o.r * 0.1, o.r * 0.22, K.plum, 0.05, 71 + k); blob(ck.paint, c[0] + o.r * 0.3, c[2] + o.r * 0.25, o.r * 0.12, K.sky, 0.052, 81 + k);
  }
  for (const [k, o] of (sf.puddles || []).entries()) {
    const c = lat(o.s * L, o.d), ck = chunkAt(idxAt(o.s * L));
    blob(ck.paint, c[0], c[2], o.r, K.navy, 0.04, 131 + k); blob(ck.paint, c[0], c[2], o.r * 0.82, K.sky, 0.045, 141 + k); blob(ck.paint, c[0] - o.r * 0.2, c[2] - o.r * 0.1, o.r * 0.28, K.white, 0.05, 151 + k);
  }
  for (const z of sf.dirt || []) {
    const i0 = Math.round(z.s0 * L / track.ds), i1 = Math.round((z.s1 < z.s0 ? z.s1 + 1 : z.s1) * L / track.ds);
    for (let i = i0; i < i1; i++) { const ck = chunkAt(i), c = hash(i * 3 + 9) < 0.5 ? K.sand : K.rust; strip(ck.paint, i, i + 1, z.side * (half - 3.5), z.side * half, 0.045, c); if (hash(i * 5) < 0.4) strip(ck.paint, i, i + 1, z.side * (half - 2.4), z.side * (half - 2.0), 0.05, K.black); }
  }

  // ---- barriers (inner face just outside the physical wall at |d| = half)
  const types = [new Array(n).fill('c'), new Array(n).fill('c')];
  for (let sdx = 0; sdx < 2; sdx++) {
    let i = 0;
    while (i < n) {
      const len = 8 + ((rng() * 26) | 0), roll = rng(), t = roll < 0.5 ? 'c' : roll < 0.78 ? 't' : 'm';
      for (let k = 0; k < len && i < n; k++, i++) types[sdx][i] = hard(i) && t === 'm' ? 't' : t;
    }
  }
  const PROFILES = {
    c: { pts: [[0, 0], [0.14, 0.42], [0.26, 1.0], [0.58, 1.0], [0.58, 0]], H: 1.0 },
    t: { pts: [[0, 0], [0, 1.3], [0.9, 1.3], [0.9, 0]], H: 1.3 },
    m: { pts: [[0, 0], [0, 1.7], [0.12, 1.7], [0.12, 0]], H: 1.7 },
  };
  for (let sdx = 0; sdx < 2; sdx++) {
    const sd = sdx === 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const ck = chunkAt(i), t = types[sdx][i], pr = PROFILES[t];
      const ring = (k, ii) => W(ii, sd * (half + 0.12 + pr.pts[k][0]), pr.pts[k][1]);
      const outsideCorner = hard(i) && (corner[i] > 0) === (sd < 0);
      for (let k = 0; k < pr.pts.length - 1; k++) {
        const ya = pr.pts[k][1], yb = pr.pts[k + 1][1];
        const va = clamp(ya / pr.H, 0, 1), vb = clamp(yb / pr.H, 0, 1);
        const ao = (y) => 0.45 + 0.55 * Math.pow(clamp(y / pr.H, 0, 1), 0.6);
        let tile = t === 'c' ? ATLAS_TILES.concrete : t === 't' ? ATLAS_TILES.tyres : ATLAS_TILES.metal, base = [1, 1, 1];
        if (t === 'c' && k === 1 && outsideCorner) tile = ATLAS_TILES.hazard;
        const topFace = (t === 'c' && k === 2) || (t !== 'c' && k === 1);
        if (topFace) { tile = ATLAS_TILES.plain; base = t === 'c' ? [0.62, 0.62, 0.6] : t === 't' ? [0.12, 0.12, 0.14] : [0.3, 0.2, 0.18]; }
        const outer = (t === 'c' && k === 3) || (t !== 'c' && k === 2);
        if (outer) { tile = ATLAS_TILES.plain; base = [0.3, 0.3, 0.32]; }
        const flip = sd < 0;
        const q = flip ? [ring(k + 1, i), ring(k, i), ring(k, i + 1), ring(k + 1, i + 1)] : [ring(k, i), ring(k + 1, i), ring(k + 1, i + 1), ring(k, i + 1)];
        const uvs = flip ? [[0, vb], [0, va], [1, va], [1, vb]] : [[0, va], [0, vb], [1, vb], [1, va]];
        const tints = flip ? [ao(yb), ao(ya), ao(ya), ao(yb)] : [ao(ya), ao(yb), ao(yb), ao(ya)];
        ck.struct.tquad(q, tile, uvs, tints, base);
      }
      if (t === 'm' && i % 3 === 0) ck.struct.box(...W(i, sd * (half + 0.3)).map((v, j) => (j === 1 ? 0.95 : v)), 0.22, 1.9, 0.22, K.darkGrey, K.black);
      if (t === 't' && hash(i * 17 + sdx) < 0.22) ck.detail.cyl(...W(i, sd * (half + 0.55)).map((v, j) => (j === 1 ? 1.42 : v)), 0.42, 0.42, 0.36, 'y', 7, hash(i) < 0.5 ? K.black : K.darkGrey, K.black);
    }
  }

  // ---- apron (ground beyond the barriers) with baked AO against the barrier base
  const AP = [0.8, 2.0, 4.8, 12], APT = [0.4, 0.68, 0.88, 1.0];
  for (let sdx = 0; sdx < 2; sdx++) {
    const sd = sdx === 0 ? 1 : -1;
    for (let i = 0; i < n; i += 2) {
      const ck = chunkAt(i);
      for (let j = 0; j < AP.length - 1; j++) {
        const p = [W(i, sd * (half + AP[j]), -0.02), W(i, sd * (half + AP[j + 1]), -0.02), W(i + 2, sd * (half + AP[j + 1]), -0.02), W(i + 2, sd * (half + AP[j]), -0.02)];
        ck.apron.quadRaw(p, p.map((v) => [v[0] / 8, v[2] / 8]), [grey(APT[j]), grey(APT[j + 1]), grey(APT[j + 1]), grey(APT[j])]);
      }
    }
  }

  // ---- lamps (sodium) with flares and light pools
  const lampProp = new TB();
  lampProp.box(0, 4.1, 0, 0.22, 8.2, 0.22, K.darkGrey, K.black); lampProp.box(0, 0.25, 0, 0.7, 0.5, 0.7, K.black, K.darkGrey);
  lampProp.box(0, 8.1, -1.1, 0.14, 0.14, 2.4, K.darkGrey); lampProp.box(0, 8.0, -2.3, 0.5, 0.16, 0.9, K.darkGrey, K.lightGrey);
  const lampHead = new TB(); lampHead.box(0, 7.92, -2.3, 0.42, 0.08, 0.76, K.yellow);
  let lampSide = 1;
  for (let i = 6; i < n; i += 24) {
    const sd = (lampSide = -lampSide), ck = chunkAt(i), s0 = smp(i);
    const base = W(i, sd * (half + 1.6), 0), yaw = s0.heading + (sd > 0 ? 0 : Math.PI);
    ck.struct.place(lampProp, base[0], 0, base[2], yaw);
    ck.glow.place(lampHead, base[0], 0, base[2], yaw);
    const head = W(i, sd * (half + 1.6 - 2.3), 7.9);
    flares.pos.push(head[0], head[1], head[2]); flares.size.push(4.2); flares.col.push(1, 0.78, 0.4); flares.flick.push(hash(i) < 0.12 ? 1 : 0);
    const c = W(i, sd * (half - 3.2), 0.05);
    const R = 6.8, segs = 10;
    for (let k = 0; k < segs; k++) { const a0 = (k / segs) * 6.2832, a1 = ((k + 1) / segs) * 6.2832; ck.pools.tri([c[0], 0.05, c[2]], [c[0] + Math.cos(a0) * R, 0.05, c[2] + Math.sin(a0) * R * 0.8], [c[0] + Math.cos(a1) * R, 0.05, c[2] + Math.sin(a1) * R * 0.8], K.orange); }
  }
  // flood-light towers
  const towerProp = new TB();
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) towerProp.box(x, 8, z, 0.14, 16, 0.14, K.darkGrey);
  for (let y = 1.5; y < 16; y += 2.5) { towerProp.box(0, y, -0.6, 1.2, 0.08, 0.08, K.darkGrey); towerProp.box(0, y, 0.6, 1.2, 0.08, 0.08, K.darkGrey); towerProp.box(-0.6, y, 0, 0.08, 0.08, 1.2, K.darkGrey); towerProp.box(0.6, y, 0, 0.08, 0.08, 1.2, K.darkGrey); }
  towerProp.box(0, 16.3, 0, 3.4, 1.6, 0.4, K.black);
  const towerGlow = new TB(); for (let k = -2; k <= 2; k++) for (const y of [15.8, 16.5]) towerGlow.box(k * 0.62, y, -0.3, 0.5, 0.5, 0.1, K.white);
  const sdTower = [1, -1, 1, -1, 1];
  [0.06, 0.28, 0.5, 0.7, 0.9].forEach((f, k) => {
    const i = Math.round(f * n), sd = sdTower[k], ck = chunkAt(i), s0 = smp(i);
    const base = W(i, sd * (half + 8), 0), yaw = s0.heading + (sd > 0 ? 0 : Math.PI);
    ck.struct.place(towerProp, base[0], 0, base[2], yaw); ck.glow.place(towerGlow, base[0], 0, base[2], yaw);
    const head = W(i, sd * (half + 8 - 0.4), 16.2);
    flares.pos.push(head[0], head[1], head[2]); flares.size.push(11); flares.col.push(1, 0.95, 0.8); flares.flick.push(0);
    const c = W(i, sd * (half - 1), 0.05), R = 12, segs = 12;
    for (let q = 0; q < segs; q++) { const a0 = (q / segs) * 6.2832, a1 = ((q + 1) / segs) * 6.2832; ck.pools.tri([c[0], 0.06, c[2]], [c[0] + Math.cos(a0) * R, 0.06, c[2] + Math.sin(a0) * R * 0.7], [c[0] + Math.cos(a1) * R, 0.06, c[2] + Math.sin(a1) * R * 0.7], K.yellow); }
  });

  // ---- junk props behind the fence
  const carVar = [K.rust, K.darkGrey, K.navy, K.plum, K.lightGrey, K.green, K.red, K.orange].map((c, k) => crushedCar(c, 11 + k));
  const heaps = [scrapHeap(21), scrapHeap(22), scrapHeap(23)];
  const tyreH = tyreHeap(), drumsV = [drum(K.red), drum(K.orange), drum(K.rust), drum(K.navy)], cont = [container(K.red), container(K.sky), container(K.orange), container(K.green), container(K.rust)];
  const shackV = shack();
  const clear = (x, z, r) => { for (let i = 0; i < n; i += 2) { if (Math.hypot(S[i].x - x, S[i].y - z) < half + r) return false; } return true; };
  const placed = [];
  for (let i = 4; i < n; i += 11) for (const sd of [1, -1]) {
    if (rng() < 0.18) continue;
    const off = half + 8 + rng() * 26, pos = W(i, sd * off, 0), s0 = smp(i), yaw = s0.heading + (rng() - 0.5) * 0.6;
    const kind = rng();
    const rad = kind < 0.4 ? 8 : kind < 0.55 ? 6 : 5;
    if (!clear(pos[0], pos[2], rad + 3)) continue;
    if (placed.some((q) => Math.hypot(q[0] - pos[0], q[1] - pos[2]) < rad + q[2])) continue;
    placed.push([pos[0], pos[2], rad]);
    const ck = chunkAt(i);
    if (kind < 0.4) {                                                       // crushed-car stack
      const rows = 2 + ((rng() * 3) | 0), lvls = 2 + ((rng() * 3) | 0);
      for (let r2 = 0; r2 < rows; r2++) for (let l2 = 0; l2 < lvls - (r2 === rows - 1 ? 1 : 0); l2++) {
        const lx = (r2 - rows / 2) * 2.2, v = carVar[(rng() * carVar.length) | 0], a = yaw + (rng() - 0.5) * 0.18;
        ck.struct.place(v, pos[0] + Math.cos(yaw) * (rng() - 0.5) * 0.7 - Math.sin(yaw) * lx, l2 * 0.72, pos[2] + Math.sin(yaw) * (rng() - 0.5) * 0.7 + Math.cos(yaw) * lx, a, 1, (rng() - 0.5) * 0.05);
      }
    } else if (kind < 0.55) ck.struct.place(heaps[(rng() * 3) | 0], pos[0], 0, pos[2], yaw, 0.8 + rng() * 0.5);
    else if (kind < 0.67) { ck.detail.place(tyreH, pos[0], 0, pos[2], yaw, 1.2); ck.detail.place(tyreH, pos[0] + 2, 0, pos[2] + 1.5, yaw + 1, 1); }
    else if (kind < 0.78) {                                                 // fire barrels with flame glow
      for (let k = 0; k < 3; k++) ck.detail.place(drumsV[(rng() * 4) | 0], pos[0] + Math.cos(yaw) * k * 1.1, 0, pos[2] + Math.sin(yaw) * k * 1.1, 0);
      ck.glow.box(pos[0], 1.35, pos[2], 0.5, 0.5, 0.5, K.orange); ck.glow.box(pos[0], 1.7, pos[2], 0.28, 0.4, 0.28, K.yellow);
      flares.pos.push(pos[0], 1.6, pos[2]); flares.size.push(3.2); flares.col.push(1, 0.55, 0.2); flares.flick.push(1);
    } else if (kind < 0.9) { const lv = 1 + ((rng() * 3) | 0); for (let l2 = 0; l2 < lv; l2++) ck.struct.place(cont[(rng() * cont.length) | 0], pos[0], l2 * 2.6, pos[2], yaw + (rng() - 0.5) * 0.1); }
    else { ck.struct.place(shackV, pos[0], 0, pos[2], yaw); ck.glow.box(pos[0] - Math.sin(yaw) * -2.1 + Math.cos(yaw) * 3.1, 1.2, pos[2] + Math.cos(yaw) * -2.1 + Math.sin(yaw) * 3.1, 0.1, 0.5, 0.5, K.yellow); flares.pos.push(pos[0] + Math.cos(yaw) * 3.4, 1.2, pos[2] + Math.sin(yaw) * 3.4); flares.size.push(2.6); flares.col.push(1, 0.8, 0.4); flares.flick.push(0); }
  }

  // ---- landmarks: cranes, crushers, gantry
  const tower = craneTower(), boom = craneBoom(), frame = crusherFrame(), press = crusherPress();
  [[0.1, 1], [0.47, -1], [0.8, 1]].forEach(([f, sd], k) => {
    const i = Math.round(f * n), s0 = smp(i), pos = W(i, sd * (half + 34 + k * 3), 0), ck = chunkAt(i);
    ck.struct.place(tower, pos[0], 0, pos[2], 0);
    animated.push({ kind: 'boom', geo: boom, pos: [pos[0], 23.6, pos[2]], base: s0.heading + (sd > 0 ? -1.2 : 1.2), amp: 0.55, speed: 0.11 + k * 0.03, phase: k * 2, chunk: ck });
    flares.pos.push(pos[0], 25, pos[2]); flares.size.push(2.4); flares.col.push(1, 0.1, 0.1); flares.flick.push(1);
  });
  [[0.27, -1], [0.62, 1]].forEach(([f, sd], k) => {
    const i = Math.round(f * n), s0 = smp(i), pos = W(i, sd * (half + 22), 0), ck = chunkAt(i);
    if (clear(pos[0], pos[2], 12)) {
      ck.struct.place(frame, pos[0], 0, pos[2], s0.heading);
      animated.push({ kind: 'press', geo: press, pos: [pos[0], 6, pos[2]], yaw: s0.heading, phase: k * 2.5, chunk: ck });
    }
  });
  {
    const i = 2, s0 = smp(i), ck = chunkAt(i), g = new TB(), gl = new TB(), x0 = W(i, 0, 0);
    const span = half + 1.2;
    for (const z of [-span, span]) { g.box(0, 4, z, 0.7, 8, 0.7, K.darkGrey, K.black); g.box(0, 0.3, z, 1.4, 0.6, 1.4, K.black, K.darkGrey); g.box(0, 7.4, z * 0.97, 0.5, 0.2, 0.5, K.yellow); }
    g.box(0, 7.7, 0, 0.8, 0.7, span * 2 + 1.4, K.darkGrey, K.lightGrey); g.box(0, 8.15, 0, 0.3, 0.3, span * 2 + 1.4, K.yellow);
    g.box(-0.5, 6.5, 0, 0.25, 2.2, 9.6, K.black);                                            // sign board
    g.box(-0.45, 5.4, 0, 0.1, 0.12, 9.6, K.red);
    for (let z = -5; z <= 5; z += 2.5) g.box(0, 7.0, z, 0.1, 0.9, 0.1, K.lightGrey);
    signText(gl, 'LAST TRACK', -0.66, 7.15, 0, 0.17, K.yellow, -1);
    signText(gl, 'DETROIT SCRAPYARD', -0.66, 6.1, 0, 0.1, K.orange, -1);
    ck.struct.place(g, x0[0], 0, x0[2], s0.heading); ck.glow.place(gl, x0[0], 0, x0[2], s0.heading);
    flares.pos.push(...W(i, -span, 8.3)); flares.size.push(3.4); flares.col.push(1, 0.2, 0.15); flares.flick.push(0);
    flares.pos.push(...W(i, span, 8.3)); flares.size.push(3.4); flares.col.push(1, 0.2, 0.15); flares.flick.push(0);
    const ch = chainSet(9);
    for (const z of [-6.2, -3.1, 3.1, 6.2]) animated.push({ kind: 'chain', geo: ch, pos: W(i + 1, z, 7.5), yaw: s0.heading, phase: z, chunk: ck });
  }

  // ---- ground plane + puddles outside
  const pad = 900, ground = new TB();
  const gq = [[bounds.minX - pad, -0.08, bounds.minY - pad], [bounds.maxX + pad, -0.08, bounds.minY - pad], [bounds.maxX + pad, -0.08, bounds.maxY + pad], [bounds.minX - pad, -0.08, bounds.maxY + pad]];
  ground.quadRaw(gq, gq.map((v) => [v[0] / 16, v[2] / 16]), [grey(0.7), grey(0.7), grey(0.7), grey(0.7)]);

  // ---- distant 3D ruins (world-fixed => real parallax as you drive)
  const ruins = new TB(), rr = mulberry32(seed + 5), cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minY + bounds.maxY) / 2;
  const R0 = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + 160;
  for (let k = 0; k < 46; k++) {
    const a = (k / 46) * 6.2832 + rr() * 0.12, rad = R0 + 40 + rr() * 260, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
    const w = 14 + rr() * 22, h = 22 + rr() * 70, d = 12 + rr() * 18, col = [K.darkGrey, K.navy, K.plum, K.lavender][(rr() * 4) | 0], yaw = rr() * 1.5;
    const b = new TB();
    b.box(0, h / 2, 0, w, h, d, col, K.black);
    for (let y = 6; y < h - 2; y += 9) for (let xx = -w / 2 + 3; xx < w / 2 - 2; xx += 6) if (rr() < 0.65) b.box(xx, y, d / 2 + 0.05, 2.6, 3.2, 0.1, rr() < 0.12 ? K.yellow : K.black);
    if (rr() < 0.7) { b.box(w * 0.25, h + 2, 0, w * 0.4, 5, d * 0.5, col, K.black); b.box(-w * 0.3, h * 0.92, 0, w * 0.3, h * 0.16, d * 0.7, K.black); } // broken crown
    ruins.place(b, x, 0, z, yaw);
  }
  const stats = { tris: 0, perLayer: {} };
  for (const ck of chunks) for (const [k, b] of Object.entries(ck)) { stats.perLayer[k] = (stats.perLayer[k] || 0) + b.triCount; stats.tris += b.triCount; }
  for (const a of animated) stats.tris += a.geo.triCount;
  stats.tris += ground.triCount + ruins.triCount;
  stats.perLayer.ruins = ruins.triCount; stats.perLayer.ground = ground.triCount;
  return { chunks, ground, ruins, flares, animated, stats, bounds };
}

// ------------------------------------------------------------------ sky
export function buildDomeBuilder() {
  const b = new MeshBuilder(), R = 1800;
  const bands = [[-12, K.black], [0, K.orange], [1.2, K.pink], [3, K.pink], [5.5, K.plum], [9, K.plum], [14, K.navy], [24, K.navy], [40, K.black], [90, K.black]];
  const cols = [K.orange, K.orange, K.pink, K.plum, K.plum, K.lavender, K.navy, K.navy, K.black];
  void cols;
  const colAt = (e) => (e < 0.8 ? K.orange : e < 2.4 ? K.sand : e < 4 ? K.orange : e < 6.5 ? K.pink : e < 10 ? K.plum : e < 15 ? K.plum : e < 24 ? K.navy : e < 45 ? K.navy : K.black);
  void bands;
  const els = [-10, 0, 0.8, 2.4, 4, 6.5, 10, 16, 26, 45, 90];
  const seg = 40;
  for (let r = 0; r < els.length - 1; r++) {
    const e0 = (els[r] * Math.PI) / 180, e1 = (els[r + 1] * Math.PI) / 180, c = r === 0 ? K.plum : colAt(els[r]);
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * 6.2832, a1 = ((s + 1) / seg) * 6.2832;
      const P = (e, a) => [Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R];
      b.quad(P(e0, a0), P(e0, a1), P(e1, a1), P(e1, a0), c);
    }
  }
  // sun disc + halo (low, in the direction of the key light)
  const dir = new THREE.Vector3(...SUN_DIR).normalize(), up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize(), top = new THREE.Vector3().crossVectors(right, dir).normalize();
  const disc = (rad, col, off) => { const c0 = dir.clone().multiplyScalar(1700 - off); for (let k = 0; k < 14; k++) { const a0 = (k / 14) * 6.2832, a1 = ((k + 1) / 14) * 6.2832; const pt = (a) => c0.clone().addScaledVector(right, Math.cos(a) * rad).addScaledVector(top, Math.sin(a) * rad); const p0 = pt(a0), p1 = pt(a1); b.tri([c0.x, c0.y, c0.z], [p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z], col); } };
  disc(430, K.orange, 0); disc(250, K.sand, 4); disc(120, K.yellow, 8); disc(70, K.white, 12);
  return b;
}

// ------------------------------------------------------------------ runtime
const dataTex = (data, w, h, repeat = true) => {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
};

const FLARE_VERT = `attribute float aSize; attribute vec3 aColor; attribute float aFlick; uniform float uScale; uniform float uTime; varying vec3 vC; varying float vF;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); float f = 1.0;
  if (aFlick > 0.5) f = 0.55 + 0.45*step(0.35, fract(sin(floor(uTime*9.0)+position.x)*43758.5));
  vC = aColor*f; vF = f; gl_PointSize = clamp(aSize*uScale*(0.8+0.2*f)/max(1.0,-mv.z), 2.0, 110.0); gl_Position = projectionMatrix*mv; }`;
const FLARE_FRAG = `varying vec3 vC; varying float vF;
void main(){ vec2 p = gl_PointCoord*2.0-1.0; float d = length(p); if (d>1.0) discard;
  float core = step(d,0.22); float mid = step(d,0.5); float halo = (d<0.85 && mod(floor(gl_FragCoord.x)+floor(gl_FragCoord.y),2.0)<0.5) ? 1.0 : 0.0;
  vec3 col = core>0.5 ? vec3(1.0,0.97,0.85) : (mid>0.5 ? vC : vC*0.55);
  if (core<0.5 && mid<0.5 && halo<0.5) discard;
  gl_FragColor = vec4(col, 1.0); }`;

/** buildHeroTrack(track, {seed}) -> { group, bounds, fogColor, stats, update(dt, camera, vpHeight), dispose() } */
export function buildHeroTrack(track, opts = {}) {
  const geo = buildHeroTrackGeometry(track, opts);
  const group = new THREE.Group(); group.name = 'hero-track';
  const tarmac = dataTex(paintTarmac(1), 128, 128), groundT = dataTex(paintGround(2), 128, 128), atlas = dataTex(paintAtlas(3), ATLAS_SIZE, ATLAS_SIZE, false);
  const common = { vertexColors: true, side: THREE.DoubleSide };
  const roadMat = new THREE.MeshLambertMaterial({ ...common, map: tarmac });
  const groundMat = new THREE.MeshLambertMaterial({ ...common, map: groundT });
  const structMat = new THREE.MeshLambertMaterial({ ...common, map: atlas, flatShading: true });
  const paintMat = new THREE.MeshLambertMaterial({ ...common, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const glowMat = new THREE.MeshBasicMaterial({ ...common });
  const poolMat = new THREE.MeshBasicMaterial({ ...common, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mats = { road: roadMat, apron: groundMat, struct: structMat, paint: paintMat, glow: glowMat, pools: poolMat, detail: structMat };
  const MAXD = { road: 340, apron: 300, struct: 380, paint: 250, glow: 380, pools: 220, detail: 140 };
  const owned = [roadMat, groundMat, structMat, paintMat, glowMat, poolMat, tarmac, groundT, atlas];
  const meshes = [];
  geo.chunks.forEach((ck, ci) => {
    for (const [key, b] of Object.entries(ck)) {
      if (!b.triCount) continue;
      const m = new THREE.Mesh(b.build(), mats[key]); m.name = `${key}-${ci}`; m.userData.maxDist = MAXD[key];
      if (key === 'pools') m.renderOrder = 2;
      group.add(m); meshes.push(m);
    }
  });
  const gm = new THREE.Mesh(geo.ground.build(), groundMat); gm.name = 'ground'; gm.frustumCulled = false; group.add(gm);
  const ruinsM = new THREE.Mesh(geo.ruins.build(), structMat); ruinsM.name = 'ruins'; group.add(ruinsM);

  // animated landmarks
  const anim = geo.animated.map((a) => { const m = new THREE.Mesh(a.geo.build(), structMat); m.position.set(...a.pos); m.userData.maxDist = 520; group.add(m); return { ...a, mesh: m }; });

  // sky + skyline layers
  const skyGroup = new THREE.Group(); skyGroup.name = 'sky'; group.add(skyGroup);
  const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const dome = new THREE.Mesh(buildDomeBuilder().build(), domeMat); dome.renderOrder = -10; dome.frustumCulled = false; skyGroup.add(dome);
  const skyTex = [dataTex(paintSkyline(0, 7), 1024, 128), dataTex(paintSkyline(1, 7), 1024, 128)];
  skyTex.forEach((t) => { t.repeat.set(2, 1); });
  const layers = [[1500, 420, -8, 1, 0], [950, 290, -6, 0.9, 1]].map(([R, H, y0, f, k]) => {
    const mat = new THREE.MeshBasicMaterial({ map: skyTex[k], alphaTest: 0.5, side: THREE.BackSide, fog: false, depthWrite: false });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 48, 1, true), mat);
    m.position.y = y0 + H / 2; m.renderOrder = -9 + k; m.frustumCulled = false; skyGroup.add(m); owned.push(mat);
    return { m, f };
  });
  owned.push(domeMat, ...skyTex);

  // flares: one Points draw call for every lamp / fire / beacon
  const fl = geo.flares, nF = fl.size.length;
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fl.pos, 3));
  fg.setAttribute('aSize', new THREE.Float32BufferAttribute(fl.size, 1));
  fg.setAttribute('aColor', new THREE.Float32BufferAttribute(fl.col, 3));
  fg.setAttribute('aFlick', new THREE.Float32BufferAttribute(fl.flick, 1));
  fg.computeBoundingSphere();
  const flareMat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 500 }, uTime: { value: 0 } }, vertexShader: FLARE_VERT, fragmentShader: FLARE_FRAG, transparent: false, depthWrite: true, fog: false });
  const flares = new THREE.Points(fg, flareMat); flares.frustumCulled = false; flares.renderOrder = 3; group.add(flares);
  owned.push(flareMat);

  const cam = new THREE.Vector3(), tmp = new THREE.Vector3();
  let time = 0;
  const api = {
    group, bounds: geo.bounds, fogColor: '#7a3b4f', stats: { ...geo.stats, flares: nF, meshes: meshes.length }, meshes,
    update(dt, camera, vpHeight = 600) {
      time += dt;
      camera.getWorldPosition(cam);
      skyGroup.position.set(cam.x, 0, cam.z);
      for (const l of layers) l.m.position.x = cam.x * (1 - l.f), l.m.position.z = cam.z * (1 - l.f);
      for (const m of meshes) {
        const bs = m.geometry.boundingSphere;
        if (!bs) continue;
        const d = tmp.set(bs.center.x, bs.center.y, bs.center.z).distanceTo(cam) - bs.radius;
        m.visible = d < m.userData.maxDist;
      }
      for (const a of anim) {
        const d = Math.hypot(a.pos[0] - cam.x, a.pos[2] - cam.z);
        a.mesh.visible = d < a.mesh.userData.maxDist;
        if (!a.mesh.visible) continue;
        if (a.kind === 'boom') a.mesh.rotation.y = -(a.base + Math.sin(time * a.speed + a.phase) * a.amp);
        else if (a.kind === 'press') { a.mesh.position.y = 6.2 + Math.sin(time * 0.9 + a.phase) * 3.4; a.mesh.rotation.y = -a.yaw; }
        else if (a.kind === 'chain') { a.mesh.rotation.y = -a.yaw; a.mesh.rotation.x = Math.sin(time * 0.9 + a.phase) * 0.07; a.mesh.rotation.z = Math.cos(time * 0.7 + a.phase * 1.3) * 0.05; }
      }
      const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
      flareMat.uniforms.uScale.value = vpHeight / (2 * tanHalf) * 0.5;
      flareMat.uniforms.uTime.value = time;
    },
    dispose() {
      for (const m of [...meshes, gm, ruinsM, ...anim.map((a) => a.mesh), dome, flares, ...layers.map((l) => l.m)]) m.geometry.dispose();
      for (const o of owned) o.dispose();
    },
  };
  return api;
}
