// Hero muscle car ("Hammer"): high-detail flat-shaded polygon model with chamfered panels, glass, lamps, turret, wheels,
// livery, dents/missing panels/charring and a sprung-body suspension model. Geometry builders are Node-safe (no DOM/WebGL).
// Draw calls per car: body, hood, trunk, lamps, turret, barrels, wheels(instanced) = 7.
import * as THREE from 'three';
import { MeshBuilder, colorRGB, clamp, smoothstep } from './geomUtil.js';
import { COLOR as K } from './paletteRef.js';

export const HERO_SPEC = Object.freeze({
  wheelR: 0.42, wheelW: 0.44, track: 1.0, front: 1.5, rear: -1.45, length: 4.8, width: 2.3, hw: 1.1,
  muzzle: [1.45, 1.86, 0], exhaust: [[-2.45, 0.46, 0.62], [-2.45, 0.46, -0.62]], engine: [1.3, 1.1, 0],
  turret: [-0.35, 1.58, 0],
});

/** Darker sibling of a palette colour (baked ambient occlusion / panel shading). */
export const DARKER = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 5, 7: 6, 8: 2, 9: 4, 10: 9, 11: 3, 12: 1, 13: 1, 14: 2, 15: 4 };
export const darker = (c) => DARKER[((c % 16) + 16) % 16];

// ---- tiny 3x5 pixel font for door / roof numbers
const FONT = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};
/** Pixel text on a vertical side plane (z = zPlane, facing sign) or the roof (axis 'y'). Returns pixel count. */
export function pixelText(b, text, { x, y, z, plane = 'z', face = 1, px = 0.07, col = K.white, ctr = [0, 1, 0] }) {
  let n = 0;
  const width = text.length * 4 - 1;
  for (let ci = 0; ci < text.length; ci++) {
    const glyph = FONT[text[ci]] || FONT[0];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (glyph[r][c] !== '1') continue;
      const u = (ci * 4 + c - width / 2) * px, v = (2 - r) * px;
      if (plane === 'z') {
        const xx = x + u * face, yy = y + v, zz = z;
        b.solidQuad([xx - px / 2, yy - px / 2, zz], [xx + px / 2, yy - px / 2, zz], [xx + px / 2, yy + px / 2, zz], [xx - px / 2, yy + px / 2, zz], [ctr[0], ctr[1], ctr[2]], col);
      } else {
        const xx = x + v, zz = z + u, yy = y;
        b.solidQuad([xx - px / 2, yy, zz - px / 2], [xx + px / 2, yy, zz - px / 2], [xx + px / 2, yy, zz + px / 2], [xx - px / 2, yy, zz + px / 2], [ctr[0], ctr[1] - 5, ctr[2]], col);
      }
      n++;
    }
  }
  return n;
}

/** Loft between equally sized rings (arrays of [x,y,z]); segCol(segIndex, pairIndex) -> palette index. */
function loft(b, rings, segCol, { closed = true, capStart = null, capEnd = null } = {}) {
  const m = rings[0].length;
  const ctr = [0, 0, 0];
  let cnt = 0;
  for (const r of rings) for (const p of r) { ctr[0] += p[0]; ctr[1] += p[1]; ctr[2] += p[2]; cnt++; }
  ctr[0] /= cnt; ctr[1] /= cnt; ctr[2] /= cnt;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], c = rings[i + 1];
    const segs = closed ? m : m - 1;
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % m;
      const col = segCol(j, i);
      if (col < 0) continue;
      b.solidQuad(a[j], a[j2], c[j2], c[j], ctr, col);
    }
  }
  const cap = (ring, col) => {
    if (col === null || col < 0) return;
    const cc = [0, 0, 0];
    for (const p of ring) { cc[0] += p[0] / ring.length; cc[1] += p[1] / ring.length; cc[2] += p[2] / ring.length; }
    for (let j = 1; j < ring.length - 1; j++) b.solidTri(ring[0], ring[j], ring[j + 1], ctr, col);
  };
  cap(rings[0], capStart); cap(rings[rings.length - 1], capEnd);
}

// ---- body stations: x, half-width, bottom, beltline, top (centreline)
const TUB = [
  [-2.4, 0.96, 0.4, 0.92, 0.98], [-2.25, 1.04, 0.32, 0.97, 1.03], [-1.7, 1.1, 0.3, 1.0, 1.06], [-1.0, 1.12, 0.28, 1.03, 1.08],
  [-0.1, 1.12, 0.26, 1.03, 1.05], [0.7, 1.12, 0.26, 1.02, 1.02], [1.3, 1.12, 0.27, 1.0, 0.94], [2.0, 1.08, 0.3, 0.95, 0.9],
  [2.32, 1.0, 0.34, 0.86, 0.84], [2.42, 0.94, 0.42, 0.78, 0.78],
];
const tubRing = (st) => {
  const [x, hw, yb, belt, top] = st;
  const hwb = hw * 0.86;
  return [[x, yb, -hwb], [x, yb + 0.1, -hw], [x, belt, -hw], [x, top - 0.05, -hw * 0.84], [x, top - 0.1, 0], [x, top - 0.05, hw * 0.84], [x, belt, hw], [x, yb + 0.1, hw], [x, yb, hwb]];
};

/** Body (non-removable shell): tub + greenhouse + bumpers + skirts + arches + livery + exhaust. Returns { geo, parts }. */
export function buildBodyBuilder(color, helmet, number = '9') {
  const paint = color, dark = darker(color), b = new MeshBuilder();
  const rings = TUB.map(tubRing);
  // bay colours: hood region (x>0.9) and trunk region (x<-1.35) of the tub top show dark engine bay / boot when panels are gone
  loft(b, rings, (j, i) => {
    const x0 = TUB[i][0];
    const bay = x0 > 0.9 || x0 < -1.35;
    if (j === 0 || j === 7) return dark;
    if (j === 8) return K.black;
    if (j === 3 || j === 4) return bay ? K.darkGrey : paint;
    return paint;
  }, { capEnd: K.black, capStart: dark });
  // body-side shade strip (lower sill AO) and belt crease
  for (const z of [1, -1]) {
    b.box(0, 0.4, z * 1.125, 3.9, 0.12, 0.03, K.black);               // rocker shadow
    b.box(-0.2, 1.02, z * 1.128, 4.3, 0.035, 0.02, dark);             // belt crease
    // door shut lines + handles
    b.box(0.85, 0.7, z * 1.13, 0.03, 0.62, 0.02, K.black);
    b.box(-0.55, 0.7, z * 1.13, 0.03, 0.62, 0.02, K.black);
    b.box(-0.35, 0.86, z * 1.14, 0.22, 0.04, 0.03, K.lightGrey);
    // side skirts
    b.box(0.15, 0.38, z * 1.12, 2.6, 0.16, 0.08, K.darkGrey);
  }
  // wheel arches: black half-discs on the body side behind the tyres
  for (const z of [1, -1]) for (const wx of [HERO_SPEC.front, HERO_SPEC.rear]) {
    const zc = z * 1.14, r = HERO_SPEC.wheelR + 0.1;
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI, a1 = ((k + 1) / 8) * Math.PI;
      b.solidTri([wx, 0.42, zc], [wx + Math.cos(a0) * r, 0.42 + Math.sin(a0) * r, zc], [wx + Math.cos(a1) * r, 0.42 + Math.sin(a1) * r, zc], [0, 0.6, 0], K.black);
    }
    // flare lip
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI, a1 = ((k + 1) / 8) * Math.PI, r2 = r + 0.07;
      b.solidQuad([wx + Math.cos(a0) * r, 0.42 + Math.sin(a0) * r, zc + z * 0.02], [wx + Math.cos(a1) * r, 0.42 + Math.sin(a1) * r, zc + z * 0.02],
        [wx + Math.cos(a1) * r2, 0.42 + Math.sin(a1) * r2, zc + z * 0.05], [wx + Math.cos(a0) * r2, 0.42 + Math.sin(a0) * r2, zc + z * 0.05], [0, 0.6, 0], paint);
    }
  }
  // greenhouse: rings (belt-left, roof-left, roof-right, belt-right)
  const GH = [[-1.3, 1.06, 1.06], [-0.55, 1.52, 1.52], [0.25, 1.52, 1.52], [1.0, 1.06, 1.06]];
  const ghRing = ([x, yBelt, yRoof]) => {
    const hwB = 0.98, hwR = yRoof - yBelt < 0.05 ? 0.98 : 0.8;
    return [[x, yBelt, -hwB], [x, yRoof, -hwR], [x, yRoof, hwR], [x, yBelt, hwB]];
  };
  loft(b, GH.map(ghRing), (j, i) => {
    if (j === 3) return -1; // open underside
    if (j === 1) return i === 1 ? paint : K.navy; // top: roof panel in middle, glass on slopes
    return K.navy; // side glass
  }, { closed: true, capStart: -1, capEnd: -1 });
  // roof panel highlight + stripes
  b.box(-0.15, 1.535, 0, 0.84, 0.025, 1.5, paint);
  // window glints (sky quads) on windscreen & side glass
  b.solidQuad([0.3, 1.5, -0.2], [0.42, 1.44, -0.2], [0.55, 1.3, 0.2], [0.43, 1.36, 0.2], [0, 1, 0], K.sky);
  b.solidQuad([-0.6, 1.2, 0.88], [-0.3, 1.2, 0.88], [-0.2, 1.44, 0.8], [-0.5, 1.44, 0.8], [0, 1.2, 0], K.sky);
  // pillars (A, B, C) as paint boxes + window frames
  for (const z of [1, -1]) {
    b.slab(0.22, 0.04, 1.02, 1.5, 0.98, 0.04, 1.02, 1.06, paint, paint, z * 0.9);          // A pillar (sloped)
    b.box(-0.55, 1.28, z * 0.9, 0.12, 0.5, 0.05, paint);                                  // B pillar
    b.slab(-1.3, 0.04, 1.02, 1.06, -0.55, 0.04, 1.02, 1.5, paint, paint, z * 0.92);        // C pillar (fastback)
    b.box(-0.1, 1.04, z * 0.97, 1.6, 0.06, 0.04, dark);                                    // sill trim
    // mirrors
    b.box(0.9, 1.18, z * 1.2, 0.14, 0.12, 0.2, K.black);
    b.box(0.9, 1.1, z * 1.1, 0.06, 0.1, 0.06, K.darkGrey);
  }
  // roof stripes + door livery stripe
  for (const z of [0.18, -0.18]) {
    b.box(-0.15, 1.545, z, 0.84, 0.01, 0.12, helmet);
    b.box(-2.0, 1.065, z, 0.9, 0.01, 0.12, helmet);
  }
  // number roundels: doors + roof
  for (const z of [1, -1]) {
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2, r = 0.26;
      b.solidTri([0.2, 0.68, z * 1.145], [0.2 + Math.cos(a0) * r, 0.68 + Math.sin(a0) * r, z * 1.145], [0.2 + Math.cos(a1) * r, 0.68 + Math.sin(a1) * r, z * 1.145], [0, 0.7, 0], K.white);
    }
    pixelText(b, number, { x: 0.2, y: 0.68, z: z * 1.15, plane: 'z', face: z, px: 0.07, col: K.black, ctr: [0, 0.7, 0] });
    // lower-door sponsor bars (checker)
    for (let k = 0; k < 6; k++) b.box(-1.5 + k * 0.1, 0.52, z * 1.137, 0.1, 0.1, 0.012, k % 2 ? K.black : K.white);
  }
  pixelText(b, number, { x: -0.15, y: 1.55, z: 0, plane: 'y', px: 0.07, col: K.black });
  // rear panel + diffuser + bumpers
  b.box(-2.52, 0.6, 0, 0.2, 0.34, 1.98, K.lightGrey);              // rear bumper
  b.box(-2.55, 0.42, 0, 0.1, 0.16, 1.5, K.black);                  // diffuser
  b.box(-2.44, 0.84, 0, 0.06, 0.12, 0.5, K.white);                 // plate
  b.box(-2.44, 0.84, 0, 0.065, 0.02, 0.4, K.black);
  b.box(2.52, 0.55, 0, 0.22, 0.2, 2.0, K.lightGrey);                // front bumper
  b.box(2.5, 0.38, 0, 0.3, 0.1, 1.7, K.black);                     // splitter
  b.box(2.47, 0.62, 0, 0.06, 0.22, 1.0, K.black);                  // grille
  for (let k = -2; k <= 2; k++) b.box(2.5, 0.62, k * 0.2, 0.04, 0.2, 0.025, K.darkGrey);
  b.box(2.46, 0.84, 0, 0.06, 0.1, 1.9, dark);                      // nose lip
  b.box(2.5, 0.54, 0.78, 0.08, 0.1, 0.1, K.yellow);                // tow hook
  // exhaust pipes + tips
  for (const [ex, ey, ez] of HERO_SPEC.exhaust) {
    b.cyl(ex + 0.1, ey, ez, 0.11, 0.11, 0.35, 'x', 6, K.lightGrey, K.black);
    b.cyl(ex + 0.55, ey - 0.02, ez, 0.07, 0.07, 0.9, 'x', 5, K.darkGrey);
  }
  // spoiler: wing, supports, endplates
  b.box(-2.22, 1.3, 0, 0.36, 0.06, 2.0, K.black, dark);
  b.box(-2.1, 1.12, 0.55, 0.1, 0.34, 0.08, K.darkGrey);
  b.box(-2.1, 1.12, -0.55, 0.1, 0.34, 0.08, K.darkGrey);
  for (const z of [1, -1]) b.box(-2.22, 1.3, z * 1.0, 0.4, 0.22, 0.05, paint);
  b.box(-2.38, 1.34, 0, 0.04, 0.1, 1.9, helmet);                    // wing trailing-edge stripe
  // antennas / roll bar tip
  b.box(-1.15, 1.35, 0.78, 0.03, 0.5, 0.03, K.black);
  // tub underside engine/exhaust glow bits are in lamps; roof rack lights
  for (const z of [-0.5, -0.17, 0.17, 0.5]) b.box(0.28, 1.57, z, 0.08, 0.07, 0.18, K.lightGrey);
  return b;
}

/** Hood panel (removable): crowned slab with power bulge, scoop, pins and racing stripes. */
export function buildHoodBuilder(color, helmet) {
  const b = new MeshBuilder(), paint = color, dark = darker(color);
  const x0 = 0.95, x1 = 2.32;
  b.slab(x0, 0.98, 0.92, 1.04, 1.7, 0.96, 0.9, 0.97, paint, paint);
  b.slab(1.7, 0.96, 0.88, 0.97, x1, 0.88, 0.8, 0.88, paint, paint);
  b.box(1.55, 1.05, 0, 1.0, 0.07, 0.62, paint, paint);                // power bulge
  b.box(1.9, 1.08, 0, 0.3, 0.06, 0.46, K.black);                      // scoop mouth
  b.box(1.82, 1.1, 0, 0.1, 0.05, 0.46, K.darkGrey);
  for (const z of [-0.3, 0.3]) { b.box(1.2, 1.065, z, 0.14, 0.012, 0.14, K.lightGrey); }   // hood pins
  for (const z of [0.2, -0.2]) b.box(1.7, 1.092, z + (z > 0 ? 0.28 : -0.28), 1.3, 0.008, 0.1, helmet);
  b.box(1.6, 0.995, 0.97, 1.3, 0.02, 0.02, dark); b.box(1.6, 0.995, -0.97, 1.3, 0.02, 0.02, dark); // panel gaps
  b.box(x0 + 0.01, 1.02, 0, 0.02, 0.02, 1.96, K.black);
  return b;
}
export function buildTrunkBuilder(color, helmet) {
  const b = new MeshBuilder(), paint = color;
  b.slab(-2.36, 0.94, 0.95, 1.04, -1.4, 1.05, 1.0, 1.08, paint, paint);
  for (const z of [0.2, -0.2]) b.box(-1.9, 1.092, z + (z > 0 ? 0.28 : -0.28), 0.9, 0.008, 0.1, helmet);
  b.box(-1.39, 1.07, 0, 0.02, 0.02, 2.0, K.black);
  b.box(-2.0, 1.062, 0.6, 0.12, 0.012, 0.3, K.lightGrey);              // fuel cap
  return b;
}

/** Lamps (emissive-looking, unlit material). Returns { b, ranges:{tail:[start,count], head:[...], rev:[...]} } in vertices. */
export function buildLampsBuilder() {
  const b = new MeshBuilder(), r = {};
  const mark = (name, fn) => { const s = b.p.length / 3; fn(); r[name] = [s, b.p.length / 3 - s]; };
  mark('head', () => {
    for (const z of [0.7, -0.7]) for (const dz of [-0.18, 0.18]) {
      b.cyl(2.46, 0.72, z + dz, 0.155, 0.155, 0.07, 'x', 8, K.white, K.yellow);
    }
    b.box(2.47, 0.84, 0, 0.04, 0.03, 0.5, K.white);
  });
  mark('tail', () => {
    for (const z of [1, -1]) {
      b.box(-2.46, 0.86, z * 0.6, 0.05, 0.14, 0.62, K.red);
      b.box(-2.46, 0.86, z * 0.18, 0.05, 0.14, 0.2, K.red);
    }
    b.box(-2.46, 0.86, 0, 0.04, 0.06, 0.2, K.red);
  });
  mark('rev', () => { for (const z of [0.9, -0.9]) b.box(-2.47, 0.62, z, 0.04, 0.1, 0.14, K.white); });
  mark('turn', () => { for (const z of [1, -1]) { b.box(2.46, 0.54, z * 0.98, 0.05, 0.08, 0.14, K.orange); b.box(-2.46, 0.7, z * 0.98, 0.05, 0.08, 0.1, K.orange); } });
  return { b, ranges: r };
}

/** Turret base+rotor (one mesh) and barrels (second mesh, recoils). Local origin = turret pivot at the roof mount. */
export function buildTurretBuilders() {
  const base = new MeshBuilder(), gun = new MeshBuilder();
  base.cyl(0, -0.12, 0, 0.36, 0.36, 0.16, 'y', 8, K.darkGrey, K.black);        // ring
  base.cyl(0, 0.04, 0, 0.3, 0.26, 0.2, 'y', 8, K.lightGrey, K.darkGrey);       // rotor
  base.box(0.1, 0.22, 0, 0.5, 0.3, 0.52, K.darkGrey, K.lightGrey);            // housing
  base.box(0.38, 0.22, 0, 0.1, 0.22, 0.4, K.black);                           // front shield
  base.box(-0.18, 0.22, 0.3, 0.2, 0.2, 0.06, K.black);                        // ammo box side
  base.box(-0.18, 0.22, -0.3, 0.2, 0.2, 0.06, K.black);
  base.box(-0.05, 0.43, 0, 0.18, 0.1, 0.18, K.red);                           // sensor
  for (const z of [0.13, -0.13]) {
    gun.cyl(0.85, 0.24, z, 0.055, 0.055, 1.0, 'x', 6, K.darkGrey, K.black);
    gun.cyl(1.38, 0.24, z, 0.075, 0.075, 0.12, 'x', 6, K.black, K.black);      // muzzle brake
    gun.box(0.4, 0.24, z, 0.3, 0.12, 0.1, K.lightGrey);
  }
  return { base, gun };
}

/** Wheel + tyre geometry (merged): tread blocks alternate shade so spin reads, 5-spoke rim, disc + caliper. */
export function buildWheelGeometry(r = HERO_SPEC.wheelR, w = HERO_SPEC.wheelW, rim = K.lightGrey) {
  const b = new MeshBuilder();
  const seg = 14, hw = w / 2;
  const pt = (a, rr, z) => [Math.cos(a) * rr, Math.sin(a) * rr, z];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const tread = i % 2 ? K.black : K.darkGrey;
    const c = [0, 0, 0];
    b.solidQuad(pt(a0, r, -hw), pt(a1, r, -hw), pt(a1, r, hw), pt(a0, r, hw), c, tread);              // tread
    for (const sg of [1, -1]) {
      b.solidQuad(pt(a0, r, sg * hw), pt(a1, r, sg * hw), pt(a1, r * 0.72, sg * (hw + 0.01)), pt(a0, r * 0.72, sg * (hw + 0.01)), c, K.black); // sidewall
      b.solidQuad(pt(a0, r * 0.72, sg * (hw + 0.01)), pt(a1, r * 0.72, sg * (hw + 0.01)), pt(a1, r * 0.55, sg * (hw - 0.03)), pt(a0, r * 0.55, sg * (hw - 0.03)), c, i % 2 ? rim : K.white); // rim lip
    }
  }
  for (let k = 0; k < 5; k++) {                                                                      // spokes
    const a = (k / 5) * Math.PI * 2, a2 = a + 0.25;
    b.solidQuad(pt(a, 0.08, hw - 0.01), pt(a2, 0.08, hw - 0.01), pt(a2 + 0.08, r * 0.55, hw - 0.01), pt(a - 0.08, r * 0.55, hw - 0.01), [0, 0, 0], rim);
  }
  b.cyl(0, 0, hw - 0.01, 0.09, 0.09, 0.05, 'z', 6, K.darkGrey, K.yellow);                           // hub
  b.cyl(0, 0, hw - 0.06, r * 0.5, r * 0.5, 0.03, 'z', 10, K.rust, K.rust);                          // brake disc
  b.box(r * 0.35, r * 0.3, hw - 0.08, 0.2, 0.14, 0.08, K.red);                                       // caliper
  const g = b.build(); g.userData.shared = true;
  return g;
}

const hash3 = (x, y, z) => {
  let h = (Math.imul(Math.round(x * 6), 73856093) ^ Math.imul(Math.round(y * 6), 19349663) ^ Math.imul(Math.round(z * 6), 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/**
 * Pure dent displacement: base position (x,y,z) + zone damage [front,right,rear,left] 0..1 (+ crush 0..1 for roof) -> new [x,y,z].
 * Same position -> same displacement, so geometry never cracks.
 */
export function dentVertex(x, y, z, dmg, crush = 0, out = [0, 0, 0]) {
  let dx = 0, dy = 0, dz = 0;
  const n = hash3(x, y, z);
  const f = dmg[0], r = dmg[1], rr = dmg[2], l = dmg[3];
  if (f > 0) { const wgt = smoothstep(0.8, 2.45, x) * f; dx -= wgt * (0.12 + 0.2 * n); dy -= wgt * 0.08 * n; dz += wgt * 0.06 * (n - 0.5); }
  if (rr > 0) { const wgt = smoothstep(-0.8, -2.45, x) * rr; dx += wgt * (0.1 + 0.18 * n); dy -= wgt * 0.06 * n; dz += wgt * 0.06 * (n - 0.5); }
  if (r > 0) { const wgt = smoothstep(0.55, 1.12, z) * r * (1 - smoothstep(1.6, 2.4, Math.abs(x))); dz -= wgt * (0.08 + 0.16 * n); dy -= wgt * 0.04 * n; }
  if (l > 0) { const wgt = smoothstep(-0.55, -1.12, z) * l * (1 - smoothstep(1.6, 2.4, Math.abs(x))); dz += wgt * (0.08 + 0.16 * n); dy -= wgt * 0.04 * n; }
  if (crush > 0 && y > 1.1) dy -= crush * (y - 1.05) * 0.55 * (0.7 + 0.3 * n);
  out[0] = x + dx; out[1] = y + dy; out[2] = z + dz;
  return out;
}

/** Map car damage state -> render flags (pure; shared with tests). */
export function damageLook(frac, wrecked) {
  const stage = wrecked ? 4 : frac < 0.15 ? 3 : frac < 0.3 ? 2 : frac < 0.7 ? 1 : 0;
  return { stage, hood: stage < 2, trunk: stage < 3, smoke: stage === 2 || stage === 3, fire: stage === 3, charred: stage === 4, crush: stage === 4 ? 1 : stage === 3 ? 0.35 : 0, glass: stage < 3 };
}

/** Quantised damage signature (changes only when dents should be rebuilt). */
export function dentKey(dmg, crush) {
  return dmg.map((d) => Math.round(clamp(d, 0, 1) * 6)).join('') + ':' + Math.round(crush * 4);
}

const _mats = {};
function mats() {
  if (_mats.lit) return _mats;
  _mats.lit = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  _mats.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const m of Object.values(_mats)) m.userData.shared = true;
  return _mats;
}

function recolor(geo, from, to) {
  // swap every vertex colour for a charred equivalent (keeps the geometry)
  const col = geo.attributes.color;
  const map = [[0, 0], [5, 0], [6, 5], [7, 5], [1, 0]];
  const charred = new Float32Array(col.array.length);
  for (let i = 0; i < col.count; i++) {
    const r = col.array[i * 3], g = col.array[i * 3 + 1], b = col.array[i * 3 + 2];
    const lum = (r + g + b) / 3;
    const k = lum > 0.35 ? colorRGB(K.darkGrey) : colorRGB(K.black);
    charred[i * 3] = k[0]; charred[i * 3 + 1] = k[1]; charred[i * 3 + 2] = k[2];
  }
  void map;
  return charred;
}

/**
 * buildHeroCar({color, helmetColor, number}) -> THREE.Group with userData.hero = api.
 * api.update(state, dt) positions parts: state = { speed, steer, ax, ay, throttle, braking, wheelspin, slip, firing, frac, dmg,
 *   wrecked, smoke, burning, reversing, aim (rad, world-relative to car heading), gear, rpm }.
 * api.fx = world-independent local anchor points; api.stage = current damage stage.
 */
export function buildHeroCar({ color = K.orange, helmetColor = K.white, number = '9' } = {}) {
  const m = mats();
  const root = new THREE.Group(); root.name = 'car-hammer-hero';
  const sprung = new THREE.Group(); sprung.name = 'sprung'; root.add(sprung);

  const bodyB = buildBodyBuilder(color, helmetColor, number);
  const hoodB = buildHoodBuilder(color, helmetColor);
  const trunkB = buildTrunkBuilder(color, helmetColor);
  const bodyGeo = bodyB.build(), hoodGeo = hoodB.build(), trunkGeo = trunkB.build();
  const base = [bodyGeo, hoodGeo, trunkGeo].map((g) => ({ g, pos: g.attributes.position.array.slice(), col: g.attributes.color.array.slice() }));
  const body = new THREE.Mesh(bodyGeo, m.lit); body.name = 'body';
  const hood = new THREE.Mesh(hoodGeo, m.lit); hood.name = 'hood';
  const trunk = new THREE.Mesh(trunkGeo, m.lit); trunk.name = 'trunk';
  sprung.add(body, hood, trunk);

  // engine bay content, revealed when the hood is gone
  const engB = new MeshBuilder();
  engB.box(1.5, 1.0, 0, 0.9, 0.2, 0.7, K.darkGrey, K.lightGrey);
  engB.cyl(1.5, 1.2, 0, 0.26, 0.26, 0.4, 'y', 6, K.lightGrey, K.red);     // blower
  engB.box(1.2, 1.08, 0.4, 0.5, 0.05, 0.1, K.rust); engB.box(1.2, 1.08, -0.4, 0.5, 0.05, 0.1, K.rust);
  const engine = new THREE.Mesh(engB.build(), m.lit); engine.visible = false; sprung.add(engine);

  const lampsB = buildLampsBuilder();
  const lampGeo = lampsB.b.build();
  const lamps = new THREE.Mesh(lampGeo, m.glow); lamps.name = 'lamps'; sprung.add(lamps);
  const lampBase = lampGeo.attributes.color.array.slice();

  const tb = buildTurretBuilders();
  const turret = new THREE.Group(); turret.position.set(...HERO_SPEC.turret); sprung.add(turret);
  const turretRotor = new THREE.Mesh(tb.base.build(), m.lit); turretRotor.name = 'turret-base';
  const barrels = new THREE.Mesh(tb.gun.build(), m.lit); barrels.name = 'barrels';
  const flashB = new MeshBuilder(); flashB.cyl(1.55, 0.24, 0.13, 0.02, 0.18, 0.3, 'x', 5, K.yellow, K.white); flashB.cyl(1.55, 0.24, -0.13, 0.02, 0.18, 0.3, 'x', 5, K.yellow, K.white);
  const flash = new THREE.Mesh(flashB.build(), m.glow); flash.visible = false;
  const rotor = new THREE.Group(); rotor.add(turretRotor, barrels, flash); turret.add(rotor);

  // wheels: one InstancedMesh for all four
  const wheelGeo = buildWheelGeometry(HERO_SPEC.wheelR, HERO_SPEC.wheelW, K.lightGrey);
  const wheels = new THREE.InstancedMesh(wheelGeo, m.lit, 4); wheels.name = 'wheels'; wheels.frustumCulled = false;
  wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(wheels);
  const slots = [[HERO_SPEC.front, HERO_SPEC.track, 1, true], [HERO_SPEC.front, -HERO_SPEC.track, -1, true], [HERO_SPEC.rear, HERO_SPEC.track, 1, false], [HERO_SPEC.rear, -HERO_SPEC.track, -1, false]];

  const S = { pitch: 0, pitchV: 0, roll: 0, rollV: 0, heave: 0, heaveV: 0, spin: 0, dentKey: '', stage: 0, turretYaw: 0, recoil: 0, brakeOn: null, shake: 0 };
  const dummy = new THREE.Object3D();
  const tmpV = [0, 0, 0];
  const FLATTEN = 0.82;

  function applyDents(dmg, crush, charred) {
    base.forEach((bs, gi) => {
      const pos = bs.g.attributes.position;
      const a = pos.array, o = bs.pos;
      for (let i = 0; i < pos.count; i++) {
        dentVertex(o[i * 3], o[i * 3 + 1], o[i * 3 + 2], dmg, gi === 0 ? crush : 0, tmpV);
        a[i * 3] = tmpV[0]; a[i * 3 + 1] = tmpV[1]; a[i * 3 + 2] = tmpV[2];
      }
      pos.needsUpdate = true;
      bs.g.computeBoundingSphere();
      if (charred !== undefined) {
        bs.g.attributes.color.array.set(charred ? (bs.char || (bs.char = recolor(bs.g, bs.col))) : bs.col);
        bs.g.attributes.color.needsUpdate = true;
      }
    });
  }

  function setLamps(brake, reverse, night) {
    const col = lampGeo.attributes.color, arr = col.array;
    const [ts, tc] = lampsB.ranges.tail;
    const on = colorRGB(K.red), off = colorRGB(K.plum), hot = colorRGB(K.pink);
    for (let i = ts; i < ts + tc; i++) { const c = brake ? hot : night ? on : off; arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }
    const [rs, rc] = lampsB.ranges.rev;
    const rv = colorRGB(reverse ? K.white : K.darkGrey);
    for (let i = rs; i < rs + rc; i++) { arr[i * 3] = rv[0]; arr[i * 3 + 1] = rv[1]; arr[i * 3 + 2] = rv[2]; }
    col.needsUpdate = true;
  }

  function update(st, dt) {
    dt = clamp(dt, 0, 0.1);
    const look = damageLook(st.frac ?? 1, !!st.wrecked);
    if (look.stage !== S.stage || dentKey(st.dmg || [0, 0, 0, 0], look.crush) !== S.dentKey) {
      const key = dentKey(st.dmg || [0, 0, 0, 0], look.crush);
      const charChanged = (look.stage === 4) !== (S.stage === 4);
      applyDents(st.dmg || [0, 0, 0, 0], look.crush, charChanged ? look.charred : undefined);
      S.dentKey = key; S.stage = look.stage;
      hood.visible = look.hood; trunk.visible = look.trunk; engine.visible = !look.hood && look.stage < 4;
      lamps.visible = look.glass;
    }
    // ---- suspension: damped springs driven by smoothed accelerations
    const ax = st.ax || 0, ay = st.ay || 0;
    const kp = 90, cp = 11, kr = 110, cr = 12, kh = 160, ch = 16;
    const tp = clamp(-ax * 0.0075, -0.09, 0.09);            // brake (ax<0) -> +pitch -> nose dives
    const trl = clamp(-ay * 0.0062, -0.1, 0.1);            // right turn (ay>0) -> body leans left (outward)
    const bump = (st.rough || 0) * 0.02 * Math.sin(S.spin * 5.3 + 1.7) + (st.slip || 0) * 0.01 * Math.sin(S.spin * 9.1);
    S.pitchV += (kp * (tp - S.pitch) - cp * S.pitchV) * dt; S.pitch += S.pitchV * dt;
    S.rollV += (kr * (trl - S.roll) - cr * S.rollV) * dt; S.roll += S.rollV * dt;
    const th = -Math.abs(ay) * 0.0015 - Math.max(0, st.throttle || 0) * 0.01 + (st.speed || 0) * 0.00015;
    S.heaveV += (kh * (th + bump - S.heave) - ch * S.heaveV) * dt; S.heave += S.heaveV * dt;
    sprung.position.y = S.heave;
    sprung.rotation.z = -S.pitch;   // +X forward: rotation about z, positive lifts +x
    sprung.rotation.x = S.roll;
    S.shake += dt;

    // ---- wheels (unsprung)
    const sp = (st.speed || 0) * dt / HERO_SPEC.wheelR;
    S.spin += sp + (st.wheelspin || 0) * dt * 40;
    const lock = (st.braking || 0) > 0.95 ? 0 : 1;
    const steerA = -(st.steer || 0) * 0.42;
    for (let i = 0; i < 4; i++) {
      const [x, z, side, front] = slots[i];
      dummy.position.set(x, HERO_SPEC.wheelR + (look.charred ? -0.06 : 0) + clamp(S.heave * 0.0, -0.1, 0.1), z);
      dummy.rotation.set(0, 0, 0);
      dummy.rotation.y = (front ? steerA : 0) + (side < 0 ? Math.PI : 0);   // left wheels turned round so rims face outwards
      dummy.rotateZ((side < 0 ? 1 : -1) * S.spin * lock);
      dummy.scale.set(1, look.charred ? FLATTEN : 1, 1);
      dummy.updateMatrix();
      wheels.setMatrixAt(i, dummy.matrix);
    }
    wheels.instanceMatrix.needsUpdate = true;

    // ---- lamps
    const brakeOn = (st.braking || 0) > 0.05 && !st.wrecked;
    const night = true;
    if (S.brakeOn !== brakeOn || S.rev !== !!st.reversing) { S.brakeOn = brakeOn; S.rev = !!st.reversing; setLamps(brakeOn, !!st.reversing, night); }

    // ---- turret: tracks aim, recoil while firing
    const aim = st.aim ?? 0;
    S.turretYaw += clamp(aim - S.turretYaw, -8 * dt, 8 * dt);
    rotor.rotation.y = -S.turretYaw;
    S.recoil = st.firing ? 0.07 : Math.max(0, S.recoil - dt * 0.6);
    barrels.position.x = -(st.firing ? 0.06 * (0.5 + 0.5 * Math.sin(S.shake * 80)) : 0);
    flash.visible = !!st.firing && !st.wrecked && Math.sin(S.shake * 90) > -0.3;
    return S.stage;
  }

  const api = {
    update, S, look: damageLook,
    get stage() { return S.stage; },
    anchors: { exhaust: HERO_SPEC.exhaust, engine: HERO_SPEC.engine, muzzle: HERO_SPEC.muzzle },
    tris: bodyB.triCount + hoodB.triCount + trunkB.triCount,
  };
  const triCount = () => [body, hood, trunk, lamps, turretRotor, barrels, wheels].reduce((n, m2) => n + (m2.geometry.attributes.position.count / 3) * (m2.isInstancedMesh ? 4 : 1), 0);
  root.userData = {
    carId: 'hammer', hero: api, wheels: [], frontPivots: [], wheelRadius: HERO_SPEC.wheelR, body, sprung,
    length: HERO_SPEC.length, width: HERO_SPEC.width, wrecked: false, drawCalls: 7, triCount,
  };
  setLamps(false, false, true);
  return root;
}
