// Themed roadside scenery (junk / neon / desert / swamp / city / rocky / canal / industrial / harbor / skyline) merged into 2 meshes (lit + emissive). Deterministic, Node-safe.
import * as THREE from 'three';
import { MeshBuilder, mulberry32, disposeObject } from './geomUtil.js';
import { COLOR as K } from './paletteRef.js';

const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
litMat.userData.shared = glowMat.userData.shared = true;

const pick = (r, a) => a[(r() * a.length) | 0];

const PROPS = {
  junk(lit, glow, r, x, z, s) {
    const kind = (r() * 5) | 0;
    if (kind === 0) { // stack of crushed cars
      const n = 2 + ((r() * 3) | 0);
      for (let i = 0; i < n; i++) lit.box(x + (r() - 0.5) * 0.6, 0.6 + i * 1.1, z + (r() - 0.5) * 0.6, 4.2 * s, 1.0, 1.9 * s, pick(r, [K.rust, K.darkGrey, K.lightGrey, K.navy, K.plum]));
    } else if (kind === 1) { // tyre pile
      for (let i = 0; i < 6; i++) lit.cyl(x + (r() - 0.5) * 2.5, 0.3 + (i > 3 ? 0.6 : 0), z + (r() - 0.5) * 2.5, 0.6, 0.6, 0.45, 'y', 7, K.black, K.darkGrey);
    } else if (kind === 2) { // scrap heap
      for (let i = 0; i < 5; i++) lit.box(x + (r() - 0.5) * 4, 0.4 + r() * 1.2, z + (r() - 0.5) * 4, 0.8 + r() * 2, 0.5 + r() * 1.5, 0.8 + r() * 2, pick(r, [K.rust, K.darkGrey, K.lightGrey]));
    } else if (kind === 3) { // crane
      lit.box(x, 6, z, 0.8, 12, 0.8, K.yellow);
      lit.box(x + 4, 12.3, z, 10, 0.6, 0.6, K.yellow);
      lit.box(x + 8, 9.5, z, 0.1, 5, 0.1, K.darkGrey);
      lit.box(x + 8, 7, z, 1.6, 0.6, 1.6, K.darkGrey);
      lit.box(x - 1.5, 11, z, 2, 2, 2, K.darkGrey);
    } else { // oil drums + glow flare
      for (let i = 0; i < 4; i++) lit.cyl(x + (i % 2) * 1.1, 0.55, z + (i >> 1) * 1.1, 0.45, 0.45, 1.1, 'y', 6, pick(r, [K.red, K.orange, K.rust]), K.darkGrey);
      glow.cyl(x, 1.4, z, 0.25, 0.1, 0.5, 'y', 4, K.orange);
    }
  },
  neon(lit, glow, r, x, z, s) {
    const kind = (r() * 4) | 0;
    if (kind <= 1) { // tower with lit window bands
      const w = (5 + r() * 6) * s, h = 14 + r() * 40, d = (5 + r() * 6) * s;
      const wall = pick(r, [K.navy, K.plum, K.darkGrey, K.black]);
      lit.box(x, h / 2, z, w, h, d, wall, K.black);
      const glowC = pick(r, [K.pink, K.sky, K.yellow, K.lime, K.orange]);
      for (let y = 3; y < h - 1; y += 3) if (r() < 0.8) glow.box(x, y, z, w + 0.1, 0.5, d + 0.1, r() < 0.7 ? glowC : K.white);
      glow.box(x, h + 0.2, z, w * 0.6, 0.4, d * 0.6, K.red);
    } else if (kind === 2) { // casino sign
      lit.box(x, 4, z, 0.6, 8, 0.6, K.darkGrey);
      glow.box(x, 9.5, z, 0.8, 5, 8, pick(r, [K.pink, K.sky, K.yellow]));
      glow.box(x, 9.5, z, 0.9, 3.2, 6, pick(r, [K.red, K.white, K.lime]));
    } else { // palm light posts
      lit.box(x, 3.5, z, 0.3, 7, 0.3, K.lightGrey);
      glow.cyl(x, 7.3, z, 0.6, 0.6, 0.4, 'y', 6, K.yellow);
    }
  },
  desert(lit, glow, r, x, z, s) {
    const kind = (r() * 5) | 0;
    if (kind === 0) { // mesa
      const w = 14 + r() * 22, h = 6 + r() * 12;
      lit.slab(x - w / 2, w * 0.45, 0, h, x + w / 2, w * 0.4, 0, h, K.rust, K.sand, z);
      lit.box(x, h * 0.55, z, w * 0.85, 1.2, w * 0.6, K.plum);
    } else if (kind === 1 || kind === 2) { // cactus
      lit.box(x, 2, z, 0.7, 4, 0.7, K.green);
      lit.box(x + 0.9, 2.4, z, 1.2, 0.5, 0.5, K.green);
      lit.box(x + 1.4, 3.2, z, 0.5, 1.4, 0.5, K.green);
      lit.box(x - 0.9, 1.8, z, 1.2, 0.5, 0.5, K.green);
      lit.box(x - 1.3, 2.5, z, 0.5, 1.2, 0.5, K.green);
    } else if (kind === 3) { // boulders
      for (let i = 0; i < 3; i++) lit.cyl(x + (r() - 0.5) * 4, 0.8, z + (r() - 0.5) * 4, 1.4 + r(), 0.7, 1.6 + r(), 'y', 5, pick(r, [K.rust, K.darkGrey, K.sand]));
    } else { // telegraph pole / billboard
      lit.box(x, 4, z, 0.3, 8, 0.3, K.rust);
      lit.box(x, 7.6, z, 0.2, 0.2, 3, K.rust);
      if (r() < 0.4) glow.box(x, 6, z, 0.2, 2.6, 6, K.yellow);
    }
  },
  swamp(lit, glow, r, x, z, s) {
    const kind = (r() * 5) | 0;
    if (kind <= 1) { // cypress with hanging moss
      const h = 7 + r() * 6;
      lit.cyl(x, h / 2, z, 0.5 * s, 0.9 * s, h, 'y', 5, K.rust, K.rust);
      lit.cyl(x, h + 1, z, 3.2 * s, 1.2, 3.4, 'y', 6, K.green, K.green);
      lit.box(x + 1.8, h - 1.2, z, 0.2, 3, 0.2, K.lime);
    } else if (kind === 2) { // stilt shack with lamp
      for (const [dx, dz] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) lit.box(x + dx, 1, z + dz, 0.3, 2, 0.3, K.rust);
      lit.box(x, 3, z, 4.5, 2, 3.4, K.sand, K.rust);
      lit.spike(x, 4, z, 3.2, 1.6, K.darkGrey);
      glow.box(x + 2.3, 3, z, 0.1, 0.8, 0.8, K.yellow);
    } else if (kind === 3) { // reeds + dark water
      lit.box(x, 0.02, z, 7 * s, 0.05, 5 * s, K.navy);
      for (let i = 0; i < 5; i++) lit.box(x + (r() - 0.5) * 6, 1, z + (r() - 0.5) * 4, 0.15, 2 + r(), 0.15, K.lime);
    } else { // swamp glow wisp
      lit.cyl(x, 0.5, z, 0.8, 1.2, 1, 'y', 5, K.green, K.navy);
      glow.box(x, 2.2 + r(), z, 0.5, 0.5, 0.5, K.lime);
    }
  },
  city(lit, glow, r, x, z, s) {
    const kind = (r() * 4) | 0;
    if (kind <= 1) { // brick high-rise, stepped
      const w = (6 + r() * 6) * s, h = 18 + r() * 40, d = (6 + r() * 6) * s;
      const wall = pick(r, [K.rust, K.darkGrey, K.lavender, K.plum]);
      lit.box(x, h / 2, z, w, h, d, wall, K.black);
      lit.box(x, h + 2, z, w * 0.6, 4, d * 0.6, wall, K.black);
      for (let y = 4; y < h; y += 5) if (r() < 0.6) glow.box(x, y, z, w + 0.1, 0.8, d + 0.1, K.yellow);
    } else if (kind === 2) { // street light pair
      lit.box(x, 4, z, 0.3, 8, 0.3, K.lightGrey);
      glow.box(x, 8.2, z, 1.4, 0.3, 0.5, K.white);
    } else { // elevated rail pillar
      lit.box(x, 4, z, 0.8, 8, 0.8, K.darkGrey);
      lit.box(x, 8.3, z, 2, 0.6, 9, K.rust);
    }
  },
  rocky(lit, glow, r, x, z, s) {
    const kind = (r() * 5) | 0;
    if (kind <= 1) { // jagged spire
      const h = 8 + r() * 18;
      lit.cyl(x, h / 2, z, 4 * s, 0.4, h, 'y', 5, pick(r, [K.rust, K.plum, K.darkGrey]), K.sand);
      lit.cyl(x + 3, 3, z + 1, 2.4, 0.3, 6, 'y', 5, K.rust, K.sand);
    } else if (kind === 2) { // butte
      const w = 12 + r() * 18, h = 7 + r() * 10;
      lit.slab(x - w / 2, w * 0.4, 0, h, x + w / 2, w * 0.35, 0, h, K.plum, K.orange, z);
    } else if (kind === 3) { // boulder cluster
      for (let i = 0; i < 4; i++) lit.cyl(x + (r() - 0.5) * 5, 0.9, z + (r() - 0.5) * 5, 1.5 + r() * 1.2, 0.8, 1.8 + r(), 'y', 5, pick(r, [K.darkGrey, K.rust, K.lavender]));
    } else { // dead tree
      lit.box(x, 2, z, 0.3, 4, 0.3, K.rust);
      lit.box(x + 0.7, 3.6, z, 1.6, 0.2, 0.2, K.rust);
    }
  },
  canal(lit, glow, r, x, z, s) {
    const kind = (r() * 4) | 0;
    if (kind === 0) { // concrete wall panel with graffiti stripe
      lit.box(x, 2, z, 12 * s, 4, 0.8, K.lightGrey, K.white);
      glow.box(x, 2.5, z + 0.5, 6, 0.8, 0.05, pick(r, [K.pink, K.sky, K.lime]));
    } else if (kind === 1) { // bridge pylon
      lit.box(x, 7, z, 2.2, 14, 2.2, K.lightGrey);
      lit.box(x, 14.4, z, 3, 0.8, 16, K.darkGrey);
    } else if (kind === 2) { // power pylon
      lit.box(x, 8, z, 0.6, 16, 0.6, K.darkGrey);
      lit.box(x, 14, z, 0.4, 0.4, 6, K.darkGrey);
      lit.box(x, 11.5, z, 0.4, 0.4, 4, K.darkGrey);
    } else { // palm
      lit.box(x, 4, z, 0.4, 8, 0.4, K.rust);
      lit.box(x, 8.2, z, 4, 0.3, 0.8, K.green);
      lit.box(x, 8.2, z, 0.8, 0.3, 4, K.green);
    }
  },
  industrial(lit, glow, r, x, z, s) {
    const kind = (r() * 5) | 0;
    if (kind <= 1) { // smokestack with fire glow
      const h = 20 + r() * 20;
      lit.cyl(x, h / 2, z, 2.4, 1.6, h, 'y', 7, K.rust, K.black);
      lit.box(x, h * 0.8, z, 3.6, 0.8, 3.6, K.red);
      glow.cyl(x, h + 0.3, z, 1.2, 0.6, 0.6, 'y', 5, K.orange);
    } else if (kind === 2) { // factory shed with sawtooth roof
      const w = 14 * s, d = 10 * s;
      lit.box(x, 3, z, w, 6, d, K.darkGrey, K.black);
      for (let i = 0; i < 3; i++) lit.spike(x - w / 3 + i * w / 3, 6, z, d * 0.18, 2.2, K.rust);
    } else if (kind === 3) { // storage tank
      lit.cyl(x, 4, z, 4.5, 4.5, 8, 'y', 8, K.lightGrey, K.darkGrey);
      lit.box(x, 8.4, z, 0.2, 0.8, 0.2, K.red);
    } else { // steel girder bridge frame
      lit.box(x - 3, 4, z, 0.6, 8, 0.6, K.navy);
      lit.box(x + 3, 4, z, 0.6, 8, 0.6, K.navy);
      lit.box(x, 8, z, 6.6, 0.6, 0.6, K.navy);
    }
  },
  harbor(lit, glow, r, x, z, s) {
    const kind = (r() * 5) | 0;
    if (kind <= 1) { // container stack
      const n = 1 + ((r() * 3) | 0), c = pick(r, [K.red, K.sky, K.orange, K.green, K.yellow]);
      for (let i = 0; i < n; i++) lit.box(x, 1.4 + i * 2.8, z, 12, 2.7, 2.6 * s, i ? pick(r, [K.red, K.sky, K.orange, K.lavender]) : c, K.darkGrey);
    } else if (kind === 2) { // gantry crane
      lit.box(x - 5, 9, z, 0.8, 18, 0.8, K.yellow);
      lit.box(x + 5, 9, z, 0.8, 18, 0.8, K.yellow);
      lit.box(x, 18.4, z, 14, 1, 1.6, K.yellow);
      lit.box(x + 9, 18.4, z, 10, 0.6, 0.6, K.orange);
      glow.box(x - 5, 18.9, z, 0.5, 0.5, 0.5, K.red);
    } else if (kind === 3) { // ship hull silhouette
      lit.box(x, 3, z, 36, 6, 8, K.navy, K.darkGrey);
      lit.box(x + 10, 8, z, 8, 4, 6, K.white);
    } else { // bollard lights
      lit.box(x, 3, z, 0.3, 6, 0.3, K.lightGrey);
      glow.cyl(x, 6.2, z, 0.5, 0.5, 0.4, 'y', 5, K.white);
    }
  },
  skyline(lit, glow, r, x, z, s) {
    const kind = (r() * 5) | 0;
    if (kind <= 2) { // skyscraper with crown and lit bands
      const w = (6 + r() * 7) * s, h = 30 + r() * 70, d = (6 + r() * 7) * s;
      const wall = pick(r, [K.navy, K.black, K.darkGrey, K.plum]);
      lit.box(x, h / 2, z, w, h, d, wall, K.darkGrey);
      lit.box(x, h + 3, z, w * 0.5, 6, d * 0.5, wall, K.darkGrey);
      lit.spike(x, h + 6, z, 0.6, 7, K.lightGrey);
      for (let y = 5; y < h; y += 4) if (r() < 0.55) glow.box(x, y, z, w + 0.1, 0.9, d + 0.1, pick(r, [K.yellow, K.white, K.sky]));
      glow.box(x, h + 13.4, z, 0.5, 0.5, 0.5, K.red);
    } else if (kind === 3) { // statue-style torch tower
      lit.box(x, 5, z, 4, 10, 4, K.green, K.lime);
      lit.box(x, 14, z, 2.2, 8, 2.2, K.green);
      glow.box(x, 19, z, 1.2, 2.2, 1.2, K.yellow);
    } else { // billboard
      lit.box(x, 4, z, 0.5, 8, 0.5, K.darkGrey);
      glow.box(x, 10, z, 0.5, 5, 9, pick(r, [K.red, K.pink, K.sky, K.yellow]));
    }
  },
};

/** Pure: compute prop placements [{x,z,s}] outside the track, away from other track sections. */
export function scenePlacements(track, { seed = 1337, spacing = 26, gap = 7, maxDepth = 70 } = {}) {
  const r = mulberry32(seed);
  const cell = 40;
  const hash = new Map();
  const half = track.width / 2;
  for (let i = 0; i < track.n; i += 2) {
    const sm = track.samples[i];
    const key = `${Math.floor(sm.x / cell)},${Math.floor(sm.y / cell)}`;
    (hash.get(key) || hash.set(key, []).get(key)).push(sm);
  }
  const nearest = (x, y, lim) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let best = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = hash.get(`${cx + a},${cy + b}`);
      if (l) for (const sm of l) { const d = Math.hypot(sm.x - x, sm.y - y); if (d < best) best = d; if (best < lim) return best; }
    }
    return best;
  };
  const out = [];
  const step = Math.max(1, Math.round(spacing / track.ds));
  for (let i = 0; i < track.n; i += step) {
    for (const side of [-1, 1]) {
      if (r() < 0.25) continue;
      const sm = track.samples[i];
      const off = half + gap + 2 + r() * maxDepth * (r() < 0.3 ? 1 : 0.35);
      const nx = -Math.sin(sm.heading) * side, ny = Math.cos(sm.heading) * side;
      const x = sm.x + nx * off, y = sm.y + ny * off;
      if (nearest(x, y, half + gap) < half + gap) continue;
      out.push({ x, z: y, s: 0.8 + r() * 0.6, rs: r() });
    }
  }
  return out;
}

/** buildScenery(track) -> { group, count, dispose() } — kind from track.def.theme.scenery. */
export function buildScenery(track, { seed } = {}) {
  const theme = (track.def && track.def.theme) || {};
  const kind = PROPS[theme.scenery] ? theme.scenery : 'junk';
  const lit = new MeshBuilder();
  const glow = new MeshBuilder();
  const r = mulberry32((seed ?? 1337) + kind.length * 101);
  const pl = scenePlacements(track, { seed: seed ?? 1337 });
  for (const p of pl) PROPS[kind](lit, glow, r, p.x, p.z, p.s);
  const group = new THREE.Group();
  group.name = `scenery-${kind}`;
  if (lit.triCount) group.add(new THREE.Mesh(lit.build(), litMat));
  if (glow.triCount) group.add(new THREE.Mesh(glow.build(), glowMat));
  return { group, count: pl.length, kind, tris: lit.triCount + glow.triCount, dispose: () => disposeObject(group) };
}
