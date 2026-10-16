// Track geometry from the Track API (§3.1): road ribbon, centre dashes, kerbs, walls, start line, ground. Node-safe.
import * as THREE from 'three';
import { MeshBuilder, disposeObject } from './geomUtil.js';
import { COLOR as K } from './paletteRef.js';

const WALL_H = 1.1;
const KERB_W = 1.2;

function edges(track, i) {
  const n = track.n;
  const k = ((i % n) + n) % n;
  return [track.leftEdge(k), track.rightEdge(k)];
}
const P = (e, y = 0) => [e.x, y, e.y];

/**
 * Pure geometry builder. Returns { road, kerbs, walls, ground } BufferGeometries (vertex-coloured).
 * Road is wound to face up; walls/kerbs likewise (materials are DoubleSide anyway).
 */
export function buildTrackGeometry(track, { stride = 1 } = {}) {
  const def = track.def || {};
  const theme = def.theme || {};
  const roadC = theme.road ?? K.black;
  const curb = theme.curb || [K.red, K.white];
  const n = track.n;
  const road = new MeshBuilder();
  const kerbs = new MeshBuilder();
  const walls = new MeshBuilder();
  const step = Math.max(1, stride | 0);
  const ds = (track.ds || 2) * step;
  const dashEvery = Math.max(1, Math.round(6 / ds));
  const kerbEvery = Math.max(1, Math.round(2.5 / ds));
  let seg = 0;
  for (let i = 0; i < n; i += step, seg++) {
    const j = i + step;
    const [l0, r0] = edges(track, i);
    const [l1, r1] = edges(track, j);
    // road: alternate two near shades by segment index for subtle banding
    const shade = (seg >> 2) % 2 ? roadC : K.darkGrey === roadC ? K.black : roadC;
    road.quad(P(r0), P(l0), P(l1), P(r1), shade);
    // centre dashes
    if (seg % dashEvery === 0) {
      const c0 = { x: (l0.x + r0.x) / 2, y: (l0.y + r0.y) / 2 };
      const c1 = { x: (l1.x + r1.x) / 2, y: (l1.y + r1.y) / 2 };
      const dx = l0.x - r0.x, dy = l0.y - r0.y;
      const dl = Math.hypot(dx, dy) || 1;
      const nx = (dx / dl) * 0.15, ny = (dy / dl) * 0.15;
      road.quad([c0.x - nx, 0.02, c0.y - ny], [c0.x + nx, 0.02, c0.y + ny], [c1.x + nx, 0.02, c1.y + ny], [c1.x - nx, 0.02, c1.y - ny], K.lightGrey);
    }
    // kerbs outward from each edge, alternating colours
    const kc = curb[(seg / kerbEvery | 0) % 2 === 0 ? 0 : 1];
    for (const [a0, a1, sgn] of [[l0, l1, 1], [r0, r1, -1]]) {
      // outward direction = away from the other edge
      const o0 = sgn === 1 ? l0 : r0, i0 = sgn === 1 ? r0 : l0;
      const ox = o0.x - i0.x, oy = o0.y - i0.y;
      const ol = Math.hypot(ox, oy) || 1;
      const ux = (ox / ol) * KERB_W, uy = (oy / ol) * KERB_W;
      const o1 = sgn === 1 ? l1 : r1, i1 = sgn === 1 ? r1 : l1;
      const px = o1.x - i1.x, py = o1.y - i1.y;
      const pl = Math.hypot(px, py) || 1;
      const vx = (px / pl) * KERB_W, vy = (py / pl) * KERB_W;
      kerbs.quad(P(a0, 0.03), [a0.x + ux, 0.03, a0.y + uy], [a1.x + vx, 0.03, a1.y + vy], P(a1, 0.03), kc);
      // wall just beyond the kerb: a thin box per segment
      const w0 = [a0.x + ux, a0.y + uy], w1 = [a1.x + vx, a1.y + vy];
      const t = 0.35;
      const wx0 = (ux / KERB_W) * t, wy0 = (uy / KERB_W) * t, wx1 = (vx / KERB_W) * t, wy1 = (vy / KERB_W) * t;
      const A = [w0[0], 0, w0[1]], B = [w1[0], 0, w1[1]], C = [w1[0] + wx1, 0, w1[1] + wy1], D = [w0[0] + wx0, 0, w0[1] + wy0];
      const At = [A[0], WALL_H, A[2]], Bt = [B[0], WALL_H, B[2]], Ct = [C[0], WALL_H, C[2]], Dt = [D[0], WALL_H, D[2]];
      const ctr = [(A[0] + C[0]) / 2, WALL_H / 2, (A[2] + C[2]) / 2];
      const wc = (seg >> 1) % 2 ? K.darkGrey : K.lightGrey;
      walls.solidQuad(A, B, Bt, At, ctr, wc);
      walls.solidQuad(D, C, Ct, Dt, ctr, wc);
      walls.solidQuad(At, Bt, Ct, Dt, ctr, (seg >> 3) % 2 ? K.white : curb[0]); // top stripe
    }
  }
  // start/finish checker (s = 0)
  const [sl, sr] = edges(track, 0);
  const [sl2, sr2] = edges(track, 2);
  const cols = 8;
  for (let c = 0; c < cols; c++) {
    const a = c / cols, b = (c + 1) / cols;
    const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    for (let r = 0; r < 2; r++) {
      const e0 = r === 0 ? [sl, sr] : [sl2, sr2];
      const e1 = r === 0 ? [sl2, sr2] : [sl2, sr2];
      void e1;
      const f0 = r === 0 ? 0 : 0.5, f1 = r === 0 ? 0.5 : 1;
      const mid = (t, f) => { const p0 = lerp(sl, sr, t), p1 = lerp(sl2, sr2, t); return lerp(p0, p1, f); };
      void e0;
      road.quad(P(mid(a, f0), 0.04), P(mid(b, f0), 0.04), P(mid(b, f1), 0.04), P(mid(a, f1), 0.04), (c + r) % 2 ? K.black : K.white);
    }
  }
  // ground: big quad under everything
  const gb = new MeshBuilder();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i += 4) {
    const [l] = edges(track, i);
    minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x); minY = Math.min(minY, l.y); maxY = Math.max(maxY, l.y);
  }
  const pad = 600;
  const gc = theme.ground ?? K.darkGrey;
  gb.quad([minX - pad, -0.05, minY - pad], [minX - pad, -0.05, maxY + pad], [maxX + pad, -0.05, maxY + pad], [maxX + pad, -0.05, minY - pad], gc);
  const bounds = { minX, maxX, minY, maxY };
  return { road: road.build(), kerbs: kerbs.build(), walls: walls.build(), ground: gb.build(), bounds };
}

const _trackMat = new Map();
function mat(key, make) {
  let m = _trackMat.get(key);
  if (!m) { m = make(); m.userData.shared = true; _trackMat.set(key, m); }
  return m;
}

/** buildTrackMesh(track) -> { group, bounds, dispose() }. 4 draw calls. */
export function buildTrackMesh(track, opts = {}) {
  const geos = buildTrackGeometry(track, opts);
  const group = new THREE.Group();
  group.name = 'track';
  const lit = mat('lit', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  const flat = mat('flat', () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const ground = new THREE.Mesh(geos.ground, flat); ground.name = 'ground';
  const road = new THREE.Mesh(geos.road, lit); road.name = 'road';
  const kerbs = new THREE.Mesh(geos.kerbs, lit); kerbs.name = 'kerbs';
  const walls = new THREE.Mesh(geos.walls, lit); walls.name = 'walls';
  group.add(ground, road, kerbs, walls);
  return { group, bounds: geos.bounds, dispose: () => disposeObject(group) };
}
