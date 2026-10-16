// Foundry Run "steelworks" kit (slice-only, PBR): a dead steel plant around the circuit. Blast-furnace stacks with glowing
// mouths and smoke, furnace halls with lit windows, cooling towers, gas holders, slag heaps, gantry cranes over the road,
// pipe racks and rail sidings. addSteelworks() places the static geometry (Node-safe); createSteelworksFx() animates the
// smoke and sparks, one instanced draw call each. Lit parts use sRGB hex strings, emissive parts raw HDR triples (bloom).
import * as THREE from 'three';
import { TB } from '../heroTrack.js';
import { mulberry32 } from '../../core/mathUtil.js';
import { glowSprite } from './maps.js';

/** The kit's look. roadTone multiplies the road's grey tint; strips are the barrier lights through corners. */
export const STEELWORKS_KIT = Object.freeze({
  roadTone: [1.05, 0.93, 0.8],
  strips: [[2.6, 0.9, 0.16], [2.5, 0.22, 0.05], [2.3, 1.45, 0.7]],
  lamp: [2.5, 1.35, 0.42],
  steam: [0.2, 0.15, 0.13],
  billboards: [['FOUNDRY', [255, 140, 60]], ['HOT METAL', [255, 200, 80]], ['CAST 77', [255, 90, 50]], ['SLAG CO', [255, 170, 60]], ['FORGE 9', [255, 110, 40]], ['MOLTEN', [255, 60, 30]]],
  billboardTex: Object.freeze({ w: 256, h: 128, fit: true }),
});

const HOT = [2.8, 1.05, 0.28], HOT2 = [2.1, 0.42, 0.1], WARN = [2.6, 0.06, 0.03];
const C = { steel: '#4f535a', steelDk: '#2a2d32', rust: '#6e3b22', brick: '#4b3129', concrete: '#6e6a63', soot: '#231f1d', slag: '#16120f', pipe: '#5f5b52', sleeper: '#3d2f26' };
const UV0 = [0, 0], TAU = Math.PI * 2;
const circDist = (a, b, n) => { const d = Math.abs(a - b) % n; return Math.min(d, n - d); };

/** Axis-aligned emissive box in raw HDR colour (the emissive layer is double-sided, so winding does not matter). */
function glowBox(b, cx, cy, cz, sx, sy, sz, rgb) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const faces = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
  ];
  for (const f of faces) b.quadRaw(f, [UV0, UV0, UV0, UV0], [rgb, rgb, rgb, rgb]);
  return b;
}
/** Flat glowing disc (furnace mouth) and glowing annulus (rim), in the emissive layer. */
function glowDisc(b, cx, y, cz, r, seg, rgb) {
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
    b.triRaw([cx, y, cz], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], UV0, UV0, UV0, rgb, rgb, rgb);
  }
  return b;
}
function glowRing(b, cx, y, cz, r0, r1, seg, rgb) {
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
    const P = (r, a) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    b.quadRaw([P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1)], [UV0, UV0, UV0, UV0], [rgb, rgb, rgb, rgb]);
  }
  return b;
}

// ------------------------------------------------------------------ structures (built at the origin, placed with place())
/** Blast-furnace stack: plinth, tapered shell with rust bands, collar, glowing mouth, mast and red aviation light. */
function stackUnit(R, H, rr) {
  const lit = new TB(), glow = new TB();
  const y0 = 2.4, y1 = H + 1.2, rTop = R * 0.7, rAt = (y) => R + (rTop - R) * ((y - y0) / (y1 - y0));
  lit.box(0, y0 / 2, 0, R * 3.2, y0, R * 3.2, C.concrete);
  lit.cyl(0, (y0 + y1) / 2, 0, R, rTop, y1 - y0, 'y', 20, C.steel, C.steelDk);
  for (let y = y0 + 4 + rr() * 2; y < y1 - 4; y += 6 + rr() * 4) lit.cyl(0, y, 0, rAt(y) + 0.22, rAt(y) + 0.22, 0.8, 'y', 20, C.rust, C.rust);
  lit.cyl(0, y1 + 0.3, 0, rTop + 0.5, rTop + 0.5, 0.6, 'y', 20, C.steelDk, C.steelDk);
  lit.box(0, y1 + 1.5, 0, 0.3, 2.2, 0.3, C.steelDk);
  glowDisc(glow, 0, y1 + 0.62, 0, rTop * 0.66, 20, HOT);
  glowRing(glow, 0, y1 + 0.62, 0, rTop * 0.66, rTop + 0.5, 20, HOT2);
  glowBox(glow, 0, y1 + 2.8, 0, 0.6, 0.6, 0.6, WARN);
  return { lit, glow, mouth: y1 + 0.7, top: y1 + 2.8 };
}
/** Furnace hall: long brick shed with roof monitors, glowing windows on one long side and furnace doors on the other. */
function hallUnit(w, d, H, rr) {
  const lit = new TB(), glow = new TB();
  lit.box(0, H / 2, 0, w, H, d, C.brick, C.soot);
  for (let x = -w / 2 + 3; x < w / 2 - 2; x += 6) lit.box(x, H + 0.9, 0, 2.6, 1.8, d * 0.5, C.steelDk);
  for (let x = -w / 2 + 2.5; x < w / 2 - 1.5; x += 4.2) for (let y = 3.5; y < H - 2; y += 4.2) if (rr() < 0.6) glowBox(glow, x, y, d / 2 + 0.06, 1.9, 2.4, 0.1, rr() < 0.7 ? HOT2 : HOT);
  for (let x = -w / 2 + 5; x < w / 2 - 4; x += 9) glowBox(glow, x, 1.7, -d / 2 - 0.06, 3.8, 2.6, 0.1, HOT);
  return { lit, glow };
}
/** Cooling tower: hyperboloid-ish shell built from four pinched cone sections. */
function coolingUnit(R, H) {
  const lit = new TB(), glow = new TB();
  const prof = [[0, R], [0.4, R * 0.7], [0.75, R * 0.66], [1, R * 0.84]];
  for (let k = 0; k < prof.length - 1; k++) {
    const [t0, r0] = prof[k], [t1, r1] = prof[k + 1];
    lit.cyl(0, ((t0 + t1) / 2) * H, 0, r0, r1, (t1 - t0) * H, 'y', 22, C.concrete, C.soot);
  }
  return { lit, glow };
}
/** Gas holder: steel drum on a ring of columns, with a shallow cone roof. */
function tankUnit(R, H, rr) {
  const lit = new TB();
  lit.cyl(0, (1.5 + H) / 2, 0, R, R, H - 1.5, 'y', 24, C.steel, C.steelDk);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + rr() * 0.1; lit.box(Math.cos(a) * (R + 0.5), H / 2, Math.sin(a) * (R + 0.5), 0.7, H, 0.7, C.steelDk); }
  lit.cyl(0, H + 0.7, 0, R, R * 0.12, 1.4, 'y', 24, C.steel, C.steel);
  return { lit, glow: new TB() };
}
/** Slag heap: lumpy dome of dark clinker with a few glowing cracks. */
function slagUnit(R, H, rr) {
  const lit = new TB(), glow = new TB(), ph = rr() * TAU, seg = 16, rings = 5, ctr = [0, 0, 0];
  const lump = (a) => 1 + 0.12 * Math.sin(3 * a + ph) + 0.06 * Math.sin(5 * a + 2 * ph);
  const P = (t, a) => { const rad = R * Math.cos(t) * lump(a); return [Math.cos(a) * rad, H * Math.sin(t), Math.sin(a) * rad]; };
  for (let k = 0; k < rings; k++) {
    const t0 = (k / rings) * (Math.PI / 2), t1 = ((k + 1) / rings) * (Math.PI / 2);
    for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * TAU, a1 = ((j + 1) / seg) * TAU;
      lit.solidQuad(P(t0, a0), P(t0, a1), P(t1, a1), P(t1, a0), ctr, C.slag);
    }
  }
  const tile = glowBox(new TB(), 0, 0, 0, 1.6, 0.05, 0.16, HOT2);
  for (let c = 0; c < 4; c++) {
    const a = rr() * TAU, rad = R * (0.25 + 0.45 * rr()), y = H * Math.sqrt(Math.max(0, 1 - (rad / R) ** 2)) + 0.1;
    glow.place(tile, Math.cos(a) * rad, y, Math.sin(a) * rad, -a);
  }
  return { lit, glow };
}
/** Elevated pipe rack, one bay: two rows of pipes on paired posts, along +x (the direction of travel). */
function pipeUnit(len) {
  const lit = new TB();
  for (const x of [-len / 2 + 1, -len / 6, len / 6, len / 2 - 1]) for (const z of [-0.9, 0.9]) lit.box(x, 2.2, z, 0.5, 4.4, 0.5, C.steelDk);
  lit.cyl(0, 4.6, -0.9, 0.34, 0.34, len, 'x', 10, C.pipe);
  lit.cyl(0, 4.6, 0.9, 0.26, 0.26, len, 'x', 10, C.rust);
  lit.cyl(0, 3.6, 0.9, 0.2, 0.2, len, 'x', 10, C.steel);
  for (const x of [-len / 4, len / 3]) lit.box(x, 5.2, -0.9, 0.5, 0.6, 0.6, C.rust);
  return lit;
}
/** Rail siding: two rails and sleepers, along +x. */
function railUnit(len) {
  const lit = new TB();
  for (const z of [-0.72, 0.72]) lit.box(0, 0.14, z, len, 0.16, 0.12, C.steelDk);
  for (let x = -len / 2 + 0.6; x < len / 2; x += 1.3) lit.box(x, 0.04, 0, 0.26, 0.1, 2.6, C.sleeper);
  return lit;
}
/** Gantry crane spanning the road: two legs, a lateral girder with a trolley, warm lamps hung underneath. Along +x. */
function gantryUnit(half) {
  const lit = new TB(), glow = new TB(), L = half + 4.6;
  lit.box(0, 7.5, -L, 1.4, 15, 1.4, C.steelDk);
  lit.box(0, 7.5, L, 1.4, 15, 1.4, C.steelDk);
  lit.box(0, 15, 0, 1.6, 1.4, 2 * L + 1.4, C.steel);
  lit.box(0, 14, 0, 2.4, 1.0, 2.6, C.steelDk);
  for (const z of [-5, 0, 5]) glowBox(glow, 0, 12.6, z, 1.2, 0.5, 1.0, HOT2);
  return { lit, glow };
}

/**
 * Places the plant around the circuit into the builders the race geometry already has.
 * ctx: { n, half, W(i,d,y), smp(i), chunkAt(i), clear(x,z,r), hard(i), towers, towerGlow, rng }.
 * Returns { plumes:[{x,y,z,r}] stack mouths, embers:[{x,y,z}] mouth sparks, gantries } (the runtime animates plumes and embers).
 */
export function addSteelworks({ n, half, W, smp, chunkAt, clear, hard, towers, towerGlow, rng }) {
  const plumes = [], embers = [];
  const yawAt = (i) => smp(i).heading;
  // structures set back from the barriers; keeps trying spots until one clears the road by `rad` metres
  const plant = (count, near, span, rad, build) => {
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < count; tries++) {
      const i = Math.floor(rng() * n), sd = rng() < 0.5 ? 1 : -1, p = W(i, sd * (half + near + rng() * span));
      if (!clear(p[0], p[2], rad)) continue;
      build(p, yawAt(i) + (rng() - 0.5) * 0.7, mulberry32(Math.floor(rng() * 1e9)));
      placed++;
    }
    return placed;
  };
  const put = (u, p, yaw) => { towers.place(u.lit, p[0], 0, p[2], yaw); towerGlow.place(u.glow, p[0], 0, p[2], yaw); };

  plant(5, 30, 110, 16, (p, yaw, rr) => {
    const R = 4.2 + rr() * 1.6, u = stackUnit(R, 48 + rr() * 38, rr);
    put(u, p, yaw);
    plumes.push({ x: p[0], y: u.mouth, z: p[2], r: R });
    for (let k = 0; k < 10; k++) { const a = rr() * TAU, rad = R * 0.6 * rr(); embers.push({ x: p[0] + Math.cos(a) * rad, y: u.mouth, z: p[2] + Math.sin(a) * rad }); }
  });
  plant(6, 20, 80, 14, (p, yaw, rr) => put(hallUnit(30 + rr() * 26, 16 + rr() * 8, 12 + rr() * 6, rr), p, yaw));
  plant(3, 40, 110, 22, (p, yaw, rr) => put(coolingUnit(8 + rr() * 3, 22 + rr() * 12), p, yaw));
  plant(4, 30, 80, 14, (p, yaw, rr) => put(tankUnit(5 + rr() * 2, 10 + rr() * 4, rr), p, yaw));
  plant(12, 8, 34, 8, (p, yaw, rr) => put(slagUnit(6 + rr() * 8, 2.5 + rr() * 3.5, rr), p, yaw));

  // gantry cranes over the road, on straights
  let gantries = 0, lastI = -n;
  for (let tries = 0; tries < 300 && gantries < 2; tries++) {
    const i = Math.floor(rng() * n);
    if (hard(i) || hard(i + 10) || hard(i - 10) || circDist(i, lastI, n) < n * 0.3) continue;
    const p = W(i, 0), u = gantryUnit(half), ck = chunkAt(i), yaw = yawAt(i);
    ck.props.place(u.lit, p[0], 0, p[2], yaw); ck.emissive.place(u.glow, p[0], 0, p[2], yaw);
    lastI = i; gantries++;
  }
  // pipe racks outside the barriers and rail sidings beside them
  const pipes = pipeUnit(18), rails = railUnit(26);
  for (let k = 0; k < 8; k++) {
    const i = Math.floor(((k + 0.5) / 8) * n), sd = k % 2 ? -1 : 1;
    if (hard(i) || hard(i + 9) || hard(i - 9)) continue;
    const p = W(i, sd * (half + 5.2)); chunkAt(i).props.place(pipes, p[0], 0, p[2], yawAt(i));
  }
  for (let k = 0; k < 5; k++) {
    const i = Math.floor(((k + 0.25) / 5) * n), sd = k % 2 ? 1 : -1;
    if (hard(i) || hard(i + 13) || hard(i - 13)) continue;
    const p = W(i, sd * (half + 3.1)); chunkAt(i).props.place(rails, p[0], 0, p[2], yawAt(i));
  }
  return { plumes, embers, gantries };
}

// ------------------------------------------------------------------ runtime: smoke puffs (instanced) and furnace sparks (points)
const PUFFS = 9, PUFF_RISE = 40, PUFF_LIFE = 16, WIND = [0.5, 0.22];
const PUFF_WARM = new THREE.Color('#6b4630'), PUFF_SOOT = new THREE.Color('#15120f');

/** createSteelworksFx(group, { plumes, embers }) -> { update(dt, camera, time), setQuality(q), stats, dispose() }. */
export function createSteelworksFx(group, { plumes = [], embers = [] } = {}) {
  const tex = new THREE.DataTexture(glowSprite(64), 64, 64, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const owned = [tex];
  let puffs = null, sparks = null, sparkGeo = null, pos = null;
  if (plumes.length) {
    // fog off: stacks sit 100+ m out, and the scene's haze would otherwise wash the smoke out completely
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.92, fog: false });
    puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, plumes.length * PUFFS);
    puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); puffs.frustumCulled = false; puffs.renderOrder = 6; puffs.name = 'smoke';
    group.add(puffs); owned.push(mat, puffs.geometry);
  }
  if (embers.length) {
    pos = new Float32Array(embers.length * 3);
    sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffa040, size: 0.8, sizeAttenuation: true, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    sparks = new THREE.Points(sparkGeo, mat); sparks.frustumCulled = false; sparks.name = 'embers';
    group.add(sparks); owned.push(sparkGeo, mat);
  }
  return {
    stats: { puffs: plumes.length * PUFFS, sparks: embers.length },
    update(dt, camera, time) {
      if (puffs) {
        const q = camera.quaternion;
        for (let p = 0; p < plumes.length; p++) {
          const a = plumes[p];
          for (let k = 0; k < PUFFS; k++) {
            const id = p * PUFFS + k, age = (time / PUFF_LIFE + k / PUFFS + p * 0.37) % 1, env = Math.sin(Math.PI * age), rise = age * PUFF_RISE;
            dummy.position.set(a.x + WIND[0] * rise, a.y + rise, a.z + WIND[1] * rise);
            dummy.quaternion.copy(q);
            dummy.scale.setScalar(a.r * (0.9 + 2.8 * age) * (0.3 + 0.7 * env));
            dummy.updateMatrix(); puffs.setMatrixAt(id, dummy.matrix);
            puffs.setColorAt(id, col.copy(PUFF_WARM).lerp(PUFF_SOOT, age).multiplyScalar(0.35 + 0.65 * env));
          }
        }
        puffs.instanceMatrix.needsUpdate = true; puffs.instanceColor.needsUpdate = true;
      }
      if (sparks) {
        for (let j = 0; j < embers.length; j++) {
          const e = embers[j], T = 3.4 + ((j * 0.618) % 1) * 2.6, t = ((time + j * 0.73) / T) % 1;
          pos[j * 3] = e.x + Math.sin(time * 1.7 + j) * 0.6 + WIND[0] * t * 9;
          pos[j * 3 + 1] = e.y + t * 11;
          pos[j * 3 + 2] = e.z + Math.cos(time * 1.3 + j * 2) * 0.6 + WIND[1] * t * 9;
        }
        sparkGeo.attributes.position.needsUpdate = true;
      }
    },
    setQuality(q) { const on = q.name !== 'low'; if (puffs) puffs.visible = on; if (sparks) sparks.visible = on; },
    dispose() {
      if (puffs) group.remove(puffs);
      if (sparks) group.remove(sparks);
      owned.forEach((o) => o.dispose());
    },
  };
}
