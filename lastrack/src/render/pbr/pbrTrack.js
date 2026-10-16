// PBR "Neon Loop" circuit (slice-only): wet asphalt with procedural normal/roughness maps, kerbs and paint, concrete + steel barriers,
// neon strips, holographic billboards, light poles with shafts/pools and a few real dynamic lights, fog banks, ruined skyline towers.
// buildPbrTrackGeometry() is Node-safe (builders only); buildPbrTrack() creates textures, materials and meshes.
import * as THREE from 'three';
import { TB } from '../heroTrack.js';
import { COLOR as K } from '../paletteRef.js';
import { mulberry32 } from '../../core/mathUtil.js';
import { asphaltMaps, concreteMaps, brushedMaps, holoBillboard, fogSprite } from './maps.js';

export const PBR_CHUNKS = 6;
const grey = (t) => [t, t, t];
const hash = (n) => { let h = Math.imul(n | 0, 0x9e3779b1) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; return ((h ^ (h >>> 13)) >>> 0) / 4294967295; };
const rgbHex = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255].map((c) => Math.pow(c, 2.2));   // sRGB hex -> linear
const NEON = [[0.1, 1.2, 1.6], [1.6, 0.15, 0.9], [1.6, 0.8, 0.1], [0.3, 1.6, 0.5]];

export const BILLBOARDS = [['HAMMER', [255, 90, 40]], ['NEON LOOP', [60, 230, 255]], ['DETROIT', [255, 60, 200]], ['SCRAP 77', [255, 200, 40]], ['LAST TRACK', [60, 255, 160]], ['BUY BLOOD', [255, 50, 70]]];

/**
 * Geometry for the circuit. Returns { chunks:[{road,paint,barrier,steel,props,emissive,shafts}], puddles, oil, towers, towerGlow, billboards:[{pos,yaw,w,h,idx}],
 * lamps:[{x,y,z,s}], fogSheets:[{x,z,yaw}], stats, bounds }.
 */
export function buildPbrTrackGeometry(track, { seed = 77 } = {}) {
  const n = track.n, L = track.length, half = track.width / 2, def = track.def || {}, sf = def.surfaces || {}, S = track.samples;
  const rng = mulberry32(seed);
  const mk = () => ({ road: new TB(), paint: new TB(), barrier: new TB(), steel: new TB(), props: new TB(), emissive: new TB(), shafts: new TB() });
  const chunks = Array.from({ length: PBR_CHUNKS }, mk);
  const chunkAt = (i) => chunks[Math.min(PBR_CHUNKS - 1, Math.floor((((i % n) + n) % n) / n * PBR_CHUNKS))];
  const smp = (i) => S[((i % n) + n) % n];
  const W = (i, d, y = 0) => { const s = smp(i); return [s.x - Math.sin(s.heading) * d, y, s.y + Math.cos(s.heading) * d]; };
  const Wp = (s, d, y = 0) => { const p = track.pointAt(s); return [p.x - Math.sin(p.heading) * d, y, p.y + Math.cos(p.heading) * d]; };
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < n; i += 3) { const a = W(i, half); bounds.minX = Math.min(bounds.minX, a[0]); bounds.maxX = Math.max(bounds.maxX, a[0]); bounds.minY = Math.min(bounds.minY, a[2]); bounds.maxY = Math.max(bounds.maxY, a[2]); }
  const corner = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let k = -2; k <= 2; k++) m += smp(i + k).curv; corner[i] = m / 5; }
  const hard = (i) => Math.abs(corner[((i % n) + n) % n]) > 0.012;

  // ---- road: lateral AO, rubbered racing lane, patch variation
  const D = [-half, -half + 1.2, -4.5, -2.4, 0, 2.4, 4.5, half - 1.2, half];
  const TINT = [0.45, 0.75, 0.95, 0.78, 1, 0.78, 0.95, 0.75, 0.45];
  const patch = (i) => 0.86 + 0.18 * hash(Math.floor(i / 7) * 5 + 2);
  for (let i = 0; i < n; i++) {
    const ck = chunkAt(i), t0 = patch(i), t1 = patch(i + 1), s0 = smp(i).s, s1 = s0 + track.ds;
    for (let j = 0; j < D.length - 1; j++) {
      const p = [W(i, D[j]), W(i, D[j + 1]), W(i + 1, D[j + 1]), W(i + 1, D[j])];
      const u0 = (D[j] + half) / 8, u1 = (D[j + 1] + half) / 8;
      ck.road.quadRaw(p, [[u0, s0 / 8], [u1, s0 / 8], [u1, s1 / 8], [u0, s1 / 8]], [grey(TINT[j] * t0), grey(TINT[j + 1] * t0), grey(TINT[j + 1] * t1), grey(TINT[j] * t1)]);
    }
  }
  // ---- paint
  const strip = (b, i, d0, d1, y, rgb) => b.quadRaw([W(i, d0, y), W(i, d1, y), W(i + 1, d1, y), W(i + 1, d0, y)], [[0, 0], [0, 0], [0, 0], [0, 0]], [rgb, rgb, rgb, rgb]);
  const WHITE = grey(0.75), AMBER = [0.9, 0.55, 0.08], RED = [0.7, 0.04, 0.05], KW = grey(0.8);
  for (let i = 0; i < n; i++) {
    const ck = chunkAt(i), worn = hash(i * 13 + 7) < 0.12;
    if (!worn) { strip(ck.paint, i, half - 1.5, half - 1.3, 0.02, WHITE); strip(ck.paint, i, -half + 1.3, -half + 1.5, 0.02, WHITE); }
    if (i % 4 < 2) strip(ck.paint, i, -0.08, 0.08, 0.02, AMBER);
    if (hard(i)) { const c = i % 2 ? RED : KW; strip(ck.paint, i, half - 1.2, half, 0.03, c); strip(ck.paint, i, -half, -half + 1.2, 0.03, c); }
  }
  for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) strip(chunks[0].paint, r, -half + c, -half + c + 1, 0.035, (c + r) % 2 ? grey(0.03) : grey(0.85));
  for (const g of track.startGrid(10)) {
    const idx = track.project(g.x, g.y).i, ck = chunkAt(idx), fx = Math.cos(g.heading), fy = Math.sin(g.heading), nx = -fy, ny = fx;
    const q = (a, b, c, d) => ck.paint.quadRaw([[g.x + fx * a + nx * b, 0.03, g.y + fy * a + ny * b], [g.x + fx * c + nx * b, 0.03, g.y + fy * c + ny * b], [g.x + fx * c + nx * d, 0.03, g.y + fy * c + ny * d], [g.x + fx * a + nx * d, 0.03, g.y + fy * a + ny * d]], [[0, 0], [0, 0], [0, 0], [0, 0]], [WHITE, WHITE, WHITE, WHITE]);
    q(-1.2, -1.2, 1.4, -1.1); q(-1.2, 1.1, 1.4, 1.2); q(-1.2, -1.2, -1.1, 1.2);
  }
  // braking chevrons + skid scars before corners
  const apexes = [];
  for (let i = 8; i < n - 8; i++) if (hard(i) && Math.abs(corner[i]) >= Math.abs(corner[i - 1]) && Math.abs(corner[i]) > Math.abs(corner[i + 1]) && Math.abs(corner[i]) > 0.02) apexes.push(i);
  for (const a of apexes) {
    const side = corner[a] > 0 ? -1 : 1;
    for (let k = -12; k < 4; k++) { const ck = chunkAt(a + k), d = side * (3.2 - (k + 12) * 0.03); strip(ck.paint, a + k, d - 0.28, d - 0.05, 0.025, grey(0.02)); strip(ck.paint, a + k, d + 0.5, d + 0.72, 0.025, grey(0.02)); }
    for (let k = -26; k > -34; k -= 3) { const i = a + k, ck = chunkAt(i); ck.paint.triRaw(W(i, -1.2, 0.03), W(i + 1, 0, 0.03), W(i, 1.2, 0.03), [0, 0], [0, 0], [0, 0], AMBER, AMBER, AMBER); }
  }
  // ---- puddles / oil as separate PBR meshes (mirror-like)
  const blobTo = (b, c, r, y, sd) => { const rr = mulberry32(sd), segs = 16; for (let k = 0; k < segs; k++) { const a0 = (k / segs) * 6.2832, a1 = ((k + 1) / segs) * 6.2832, r0 = r * (0.82 + rr() * 0.3), r1 = r * (0.82 + rr() * 0.3); b.triRaw([c[0], y, c[2]], [c[0] + Math.cos(a0) * r0, y, c[2] + Math.sin(a0) * r0 * 0.8], [c[0] + Math.cos(a1) * r1, y, c[2] + Math.sin(a1) * r1 * 0.8], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], grey(1), grey(1), grey(1)); } };
  const puddles = new TB(), oil = new TB();
  for (const [k, o] of (sf.puddles || []).entries()) blobTo(puddles, Wp(o.s * L, o.d), o.r, 0.045, 100 + k);
  for (let k = 0; k < 10; k++) { const i = Math.floor(rng() * n), sd = rng() < 0.5 ? 1 : -1; blobTo(puddles, W(i, sd * (half - 1 - rng() * 3)), 1.2 + rng() * 1.6, 0.04, 200 + k); }   // extra wet patches
  for (const [k, o] of (sf.oil || []).entries()) blobTo(oil, Wp(o.s * L, o.d), o.r, 0.05, 300 + k);

  // ---- barriers: concrete jersey (textured) with steel panels on some runs; neon strip along the top at corners
  const types = [new Array(n).fill('c'), new Array(n).fill('c')];
  for (let sdx = 0; sdx < 2; sdx++) { let i = 0; while (i < n) { const len = 10 + ((rng() * 28) | 0), t = rng() < 0.7 ? 'c' : 's'; for (let k = 0; k < len && i < n; k++, i++) types[sdx][i] = t; } }
  const PROF = { c: [[0, 0], [0.14, 0.42], [0.26, 1.0], [0.6, 1.0], [0.6, 0]], s: [[0, 0], [0, 1.5], [0.1, 1.5], [0.1, 0]] };
  for (let sdx = 0; sdx < 2; sdx++) {
    const sd = sdx === 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const ck = chunkAt(i), t = types[sdx][i], pts = PROF[t], H = t === 'c' ? 1 : 1.5, tgt = t === 'c' ? ck.barrier : ck.steel;
      const ring = (k, ii) => W(ii, sd * (half + 0.12 + pts[k][0]), pts[k][1]);
      const s0 = smp(i).s;
      for (let k = 0; k < pts.length - 1; k++) {
        const ya = pts[k][1], yb = pts[k + 1][1], ao = (y) => 0.5 + 0.5 * Math.pow(Math.min(1, y / H), 0.6);
        const flip = sd < 0;
        const q = flip ? [ring(k + 1, i), ring(k, i), ring(k, i + 1), ring(k + 1, i + 1)] : [ring(k, i), ring(k + 1, i), ring(k + 1, i + 1), ring(k, i + 1)];
        const u0 = s0 / 2, u1 = (s0 + track.ds) / 2, va = ya / H, vb = yb / H;
        const uv = flip ? [[u0, vb], [u0, va], [u1, va], [u1, vb]] : [[u0, va], [u0, vb], [u1, vb], [u1, va]];
        const tn = flip ? [ao(yb), ao(ya), ao(ya), ao(yb)] : [ao(ya), ao(yb), ao(yb), ao(ya)];
        tgt.quadRaw(q, uv, tn.map((v) => grey(v)));
      }
      if (hard(i) && t === 'c' && i % 2 === 0) {                 // neon strip on top of the barrier through corners
        const col = NEON[(Math.floor(i / 24) + sdx) % 2], a = W(i, sd * (half + 0.3), 1.03), b = W(i + 2, sd * (half + 0.3), 1.03);
        ck.emissive.quadRaw([[a[0], a[1], a[2]], [b[0], b[1], b[2]], [b[0], b[1] + 0.06, b[2]], [a[0], a[1] + 0.06, a[2]]], [[0, 0], [0, 0], [0, 0], [0, 0]], [col, col, col, col]);
      }
    }
  }

  // ---- light poles (merged props), lamp heads (emissive), shafts + pools
  const lamps = [], poleProp = new TB();
  poleProp.box(0, 4.2, 0, 0.22, 8.4, 0.22, K.darkGrey, K.black); poleProp.box(0, 0.3, 0, 0.6, 0.6, 0.6, K.black, K.darkGrey);
  poleProp.box(0, 8.3, -1.2, 0.14, 0.14, 2.6, K.darkGrey); poleProp.box(0, 8.18, -2.5, 0.5, 0.14, 0.9, K.black, K.darkGrey);
  let side = 1;
  for (let i = 5; i < n; i += 26) {
    const sd = (side = -side), ck = chunkAt(i), s0 = smp(i), base = W(i, sd * (half + 1.7), 0), yaw = s0.heading + (sd > 0 ? 0 : Math.PI);
    ck.props.place(poleProp, base[0], 0, base[2], yaw);
    const head = W(i, sd * (half + 1.7 - 2.5), 8.05);
    lamps.push({ x: head[0], y: 8.05, z: head[2], s: s0.s });
    const col = (Math.floor(i / 26) % 3 === 0) ? [2.2, 1.5, 0.5] : [1.6, 1.8, 2.2];                 // sodium / LED
    ck.emissive.box(head[0], 8.02, head[2], 0.9, 0.06, 0.5, K.white, K.white);
    for (let k = 0; k < 4; k++) { const tri = ck.emissive; void tri; }
    // replace palette white with the HDR lamp colour: rewrite the last box's colours
    const eb = ck.emissive, nTri = 12 * 3 * 3; for (let q = eb.c.length - nTri; q < eb.c.length; q += 3) { eb.c[q] = col[0]; eb.c[q + 1] = col[1]; eb.c[q + 2] = col[2]; }
    // light shaft: open cone, additive, fading to the ground (vertex colour = intensity)
    const segs = 8, topR = 0.35, botR = 4.8, gc = (col[0] > 2 ? [0.026, 0.017, 0.005] : [0.017, 0.021, 0.027]);
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * 6.2832, a1 = ((k + 1) / segs) * 6.2832;
      const P = (r, y, a) => [head[0] + Math.cos(a) * r, y, head[2] + Math.sin(a) * r];
      ck.shafts.triRaw(P(topR, 8, a0), P(topR, 8, a1), P(botR, 0.1, a0), [0, 0], [0, 0], [0, 0], gc, gc, [0, 0, 0]);
      ck.shafts.triRaw(P(topR, 8, a1), P(botR, 0.1, a1), P(botR, 0.1, a0), [0, 0], [0, 0], [0, 0], gc, [0, 0, 0], [0, 0, 0]);
    }
    const c = W(i, sd * (half - 3), 0.06); for (let k = 0; k < 10; k++) { const a0 = (k / 10) * 6.2832, a1 = ((k + 1) / 10) * 6.2832; ck.shafts.triRaw([c[0], 0.06, c[2]], [c[0] + Math.cos(a0) * 6.5, 0.06, c[2] + Math.sin(a0) * 5.2], [c[0] + Math.cos(a1) * 6.5, 0.06, c[2] + Math.sin(a1) * 5.2], [0, 0], [0, 0], [0, 0], [gc[0] * 3, gc[1] * 3, gc[2] * 3], [0, 0, 0], [0, 0, 0]); }
  }

  // ---- ruined towers behind the barriers + glowing windows; billboards; neon signs
  const towers = new TB(), towerGlow = new TB(), billboards = [];
  const clear = (x, z, r) => { for (let i = 0; i < n; i += 2) if (Math.hypot(S[i].x - x, S[i].y - z) < half + r) return false; return true; };
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minY + bounds.maxY) / 2;
  let placedT = 0;
  for (let tries = 0; tries < 400 && placedT < 70; tries++) {
    const i = Math.floor(rng() * n), sd = rng() < 0.5 ? 1 : -1, off = half + 34 + rng() * (rng() < 0.35 ? 170 : 80), p = W(i, sd * off);
    const w = 10 + rng() * 16, d = 10 + rng() * 16, h = 16 + rng() * rng() * 80;
    if (!clear(p[0], p[2], Math.max(w, d) * 0.7 + 24)) continue;
    const col = [K.black, K.navy, K.black, K.darkGrey, K.black][(rng() * 5) | 0], yaw = smp(i).heading + (rng() - 0.5) * 0.5, b = new TB(), g = new TB();
    b.box(0, h / 2, 0, w, h, d, col, K.black);
    if (rng() < 0.7) { b.box(w * 0.2, h + 3, 0, w * 0.45, 6, d * 0.5, col, K.black); b.box(-w * 0.25, h * 0.93, 0, w * 0.35, h * 0.14, d * 0.8, K.black); }   // broken crown
    for (let y = 5; y < h - 3; y += 6) for (let xx = -w / 2 + 3; xx < w / 2 - 2; xx += 5) if (rng() < 0.26) { const c = rng() < 0.55 ? [2.2, 1.4, 0.45] : NEON[(rng() * 4) | 0]; const idx = g.p.length; g.box(xx, y, d / 2 + 0.06, 2.4, 2.8, 0.08, K.white, K.white); for (let q = idx / 3 * 3; q < g.c.length; q += 3) if (q >= (idx / 3) * 3) { g.c[q] = c[0]; g.c[q + 1] = c[1]; g.c[q + 2] = c[2]; } }
    towers.place(b, p[0], 0, p[2], yaw); towerGlow.place(g, p[0], 0, p[2], yaw); placedT++;
  }
  for (let k = 0; k < 6; k++) {                                   // holographic billboards on pylons, facing the track
    const i = Math.floor(((k + 0.5) / 6) * n), sd = k % 2 ? 1 : -1, p = W(i, sd * (half + 16), 0), s0 = smp(i), yaw = s0.heading + (sd > 0 ? Math.PI : 0);
    if (!clear(p[0], p[2], 8)) continue;
    const ck = chunkAt(i), pyl = new TB(); pyl.box(0, 6, 0, 0.5, 12, 0.5, K.darkGrey, K.black); pyl.box(0, 13.4, 0, 0.3, 0.3, 11, K.darkGrey, K.black); ck.props.place(pyl, p[0], 0, p[2], yaw);
    billboards.push({ pos: [p[0], 17.5, p[2]], yaw, w: 15, h: 7.5, idx: k % BILLBOARDS.length, chunk: Math.min(PBR_CHUNKS - 1, Math.floor(i / n * PBR_CHUNKS)) });
  }
  const fogSheets = [];
  for (let k = 0; k < 12; k++) { const i = Math.floor(rng() * n), sd = rng() < 0.5 ? 1 : -1, p = W(i, sd * (rng() * 10)); fogSheets.push({ x: p[0], z: p[2], yaw: smp(i).heading, s: 18 + rng() * 22 }); }

  const stats = { tris: 0, perLayer: {} };
  for (const ck of chunks) for (const [k, b] of Object.entries(ck)) { stats.perLayer[k] = (stats.perLayer[k] || 0) + b.triCount; stats.tris += b.triCount; }
  for (const [k, b] of Object.entries({ puddles, oil, towers, towerGlow })) { stats.perLayer[k] = b.triCount; stats.tris += b.triCount; }
  return { chunks, puddles, oil, towers, towerGlow, billboards, lamps, fogSheets, stats, bounds, center: [cx, cz] };
}

// ---------------------------------------------------------------- runtime
const dtex = (data, w, h, { srgb = false, repeat = true, mip = true } = {}) => {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.generateMipmaps = mip; t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
};
const MAXD = { road: 360, paint: 300, barrier: 340, steel: 340, props: 420, emissive: 420, shafts: 260 };

/** buildPbrTrack(track, {seed, quality}) -> { group, bounds, update(dt, camera, focus), setQuality(q), stats, dispose() } */
export function buildPbrTrack(track, opts = {}) {
  const geo = buildPbrTrackGeometry(track, opts);
  const group = new THREE.Group(); group.name = 'pbr-track';
  const asp = asphaltMaps(256, 11), con = concreteMaps(128, 21), brushed = brushedMaps(128, 3);
  const tex = {
    aA: dtex(asp.albedo, 256, 256, { srgb: true }), aN: dtex(asp.normal, 256, 256), aR: dtex(asp.roughness, 256, 256),
    cA: dtex(con.albedo, 128, 128, { srgb: true }), cN: dtex(con.normal, 128, 128), cR: dtex(con.roughness, 128, 128),
    bN: dtex(brushed.normal, 128, 128), bR: dtex(brushed.roughness, 128, 128), fog: dtex(fogSprite(64), 64, 64),
  };
  const mats = {
    road: new THREE.MeshStandardMaterial({ map: tex.aA, normalMap: tex.aN, normalScale: new THREE.Vector2(0.45, 0.45), roughnessMap: tex.aR, roughness: 0.5, metalness: 0, vertexColors: true, envMapIntensity: 0.9, side: THREE.DoubleSide }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }),
    barrier: new THREE.MeshStandardMaterial({ map: tex.cA, normalMap: tex.cN, roughnessMap: tex.cR, roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ color: 0x4a4f57, normalMap: tex.bN, roughnessMap: tex.bR, roughness: 1, metalness: 0.9, vertexColors: true, envMapIntensity: 1.2, side: THREE.DoubleSide }),
    props: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide }),
    emissive: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    shafts: new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    puddle: new THREE.MeshPhysicalMaterial({ color: 0x07090d, roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }),
    oil: new THREE.MeshPhysicalMaterial({ color: 0x050407, roughness: 0.08, metalness: 0.6, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [200, 600], envMapIntensity: 2, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }),
    tower: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1 }),
    fog: new THREE.MeshBasicMaterial({ map: tex.fog, color: new THREE.Color(0.32, 0.2, 0.34), transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
  };
  const owned = [...Object.values(mats), ...Object.values(tex)];
  const meshes = [];
  geo.chunks.forEach((ck, ci) => {
    for (const [key, b] of Object.entries(ck)) {
      if (!b.triCount) continue;
      const m = new THREE.Mesh(b.build(), key === 'steel' ? mats.steel : mats[key]); m.name = `${key}-${ci}`; m.userData.maxDist = MAXD[key];
      m.receiveShadow = key === 'road' || key === 'barrier' || key === 'steel' || key === 'paint'; m.castShadow = key === 'barrier' || key === 'steel' || key === 'props';
      if (key === 'shafts') m.renderOrder = 3;
      group.add(m); meshes.push(m);
    }
  });
  const extra = (b, mat, name, maxDist, shadow = false) => { if (!b.triCount) return null; const m = new THREE.Mesh(b.build(), mat); m.name = name; m.userData.maxDist = maxDist; m.receiveShadow = shadow; group.add(m); return m; };
  const pud = extra(geo.puddles, mats.puddle, 'puddles', 330, true), oil = extra(geo.oil, mats.oil, 'oil', 300, true);
  const tw = extra(geo.towers, mats.tower, 'towers', 900), twg = extra(geo.towerGlow, mats.emissive, 'tower-glow', 900);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex.aA, normalMap: tex.aN, roughnessMap: tex.aR, roughness: 0.9, color: 0x504850 }));
  tex.aA.repeat.set(1, 1); ground.position.set(geo.center[0], -0.08, geo.center[1]); ground.receiveShadow = true; ground.name = 'ground'; group.add(ground);
  const gmap = tex.aA.clone(); gmap.repeat.set(500, 500); gmap.needsUpdate = true; ground.material.map = gmap; ground.material.normalMap = tex.aN.clone(); ground.material.normalMap.repeat.set(500, 500); ground.material.roughnessMap = tex.aR.clone(); ground.material.roughnessMap.repeat.set(500, 500);
  [ground.material.normalMap, ground.material.roughnessMap].forEach((t) => { t.needsUpdate = true; owned.push(t); }); owned.push(gmap, ground.material, ground.geometry);

  // holographic billboards (additive textured quads, double-sided)
  const bbMat = [];
  const bbMeshes = geo.billboards.map((b) => {
    const [text, col] = BILLBOARDS[b.idx];
    const t = dtex(holoBillboard(text, col, 128, 64, b.idx), 128, 64, { srgb: true, repeat: false, mip: false });
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(2.2, 2.2, 2.2) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), m); mesh.position.set(...b.pos); mesh.rotation.y = -b.yaw + Math.PI / 2; mesh.name = 'billboard'; mesh.userData.maxDist = 700; mesh.userData.base = b; mesh.renderOrder = 4;
    group.add(mesh); owned.push(t, m, mesh.geometry); bbMat.push(m); return mesh;
  });
  // fog banks (scrolling soft sheets near the ground)
  const fogGeo = new THREE.PlaneGeometry(1, 1); owned.push(fogGeo);
  const fogMeshes = geo.fogSheets.map((f, k) => { const m = new THREE.Mesh(fogGeo, mats.fog); m.position.set(f.x, 0.9 + (k % 3) * 0.5, f.z); m.rotation.x = -Math.PI / 2; m.rotation.z = f.yaw; m.scale.set(f.s * 1.6, f.s, 1); m.renderOrder = 5; m.userData.maxDist = 260; group.add(m); return m; });
  // a few real dynamic lights that hop to the poles nearest the focus (no shadows: the key light casts those)
  const lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffc27a, 0, 34, 1.6); l.name = 'pole-light'; group.add(l); return l; });
  const cam = new THREE.Vector3();
  let time = 0, lightsOn = true;
  const api = {
    group, bounds: geo.bounds, stats: { ...geo.stats, meshes: meshes.length, billboards: bbMeshes.length, lamps: geo.lamps.length }, meshes, lights,
    setQuality(q) { lightsOn = q.name !== 'low'; for (const l of lights) l.visible = lightsOn; mats.fog.opacity = q.name === 'low' ? 0 : 0.32; for (const f of fogMeshes) f.visible = q.name !== 'low'; },
    update(dt, camera, focus) {
      time += dt;
      camera.getWorldPosition(cam);
      for (const m of [...meshes, pud, oil, tw, twg, ...bbMeshes, ...fogMeshes]) {
        if (!m) continue;
        if (m.geometry.boundingSphere === null) m.geometry.computeBoundingSphere();
        const bs = m.geometry.boundingSphere, c = m.isMesh && m.parent === group && m.userData.base ? m.position : null;
        const d = c ? c.distanceTo(cam) : new THREE.Vector3(bs.center.x, bs.center.y, bs.center.z).applyMatrix4(m.matrixWorld).distanceTo(cam) - bs.radius;
        m.visible = d < (m.userData.maxDist || 400) && (m.userData.fogOff !== true);
      }
      if (!lightsOn) return;
      const fx = focus ? focus.x : cam.x, fz = focus ? focus.z : cam.z;
      const near = geo.lamps.map((l) => ({ l, d: (l.x - fx) ** 2 + (l.z - fz) ** 2 })).sort((a, b) => a.d - b.d).slice(0, lights.length);
      near.forEach((q, i) => { lights[i].position.set(q.l.x, q.l.y - 0.5, q.l.z); lights[i].intensity = 140 * (0.9 + 0.1 * Math.sin(time * 40 + i * 5) * (hash(Math.floor(q.l.s)) < 0.15 ? 1 : 0.2)); });
      mats.fog.map.offset.x = (time * 0.01) % 1;
      bbMat.forEach((m, i) => { m.opacity = 0.85 + 0.15 * Math.sin(time * 3 + i); });
    },
    dispose() { const g = new Set(); group.traverse((o) => { if (o.geometry) g.add(o.geometry); }); g.forEach((x) => x.dispose()); owned.forEach((o) => o.dispose && o.dispose()); },
  };
  return api;
}
