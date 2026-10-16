// Flying wreckage: pooled, instanced, allocation-free. Two layers:
//  - DebrisField: pure struct-of-arrays rigid-ish bodies (gravity, drag, ground bounce with restitution, tumbling, rolling
//    friction, rest, burning timers). No three, no DOM -> unit-tested in Node.
//  - createDebris(parent, opts): InstancedMesh renderer (4 draw calls: panel / chunk / wheel / bar) driven by a field.
// Everything is seeded (mulberry32) so the same event always produces the same wreckage.
import * as THREE from 'three';
import { mulberry32 } from '../core/mathUtil.js';
import { mergeGeo } from './pbr/geo.js';

export const SHAPE = Object.freeze({ PANEL: 0, CHUNK: 1, WHEEL: 2, BAR: 3 });
export const SHAPE_CAP = Object.freeze([40, 110, 14, 36]);
const SHAPE_BASE = SHAPE_CAP.map((_, i) => SHAPE_CAP.slice(0, i).reduce((a, b) => a + b, 0));
export const DEBRIS_MAX = SHAPE_CAP.reduce((a, b) => a + b, 0);

export const DEBRIS = Object.freeze({
  gravity: 24, airDrag: 0.12, restitution: 0.4, bounceMin: 1.6, groundGrip: 0.78, roll: 3.2, spinDamp: 0.9,
  restLife: 22, fadeTime: 2.5, restSpeed: 0.55,
});

/** Colour kinds the renderer resolves to instance colours. */
export const KIND = Object.freeze({ PAINT: 0, DARK: 1, METAL: 2, TYRE: 3, CHAR: 4 });

/** Pure: what each lost car part turns into (shape, size in metres, colour kind, launch power, burning). */
export const PART_SPEC = Object.freeze({
  hood: { shape: SHAPE.PANEL, size: [1.7, 0.07, 1.5], kind: KIND.PAINT, power: 1.1, burn: 0.45, spin: 5 },
  doorL: { shape: SHAPE.PANEL, size: [1.1, 0.07, 0.9], kind: KIND.PAINT, power: 1.0, burn: 0.3, spin: 7 },
  doorR: { shape: SHAPE.PANEL, size: [1.1, 0.07, 0.9], kind: KIND.PAINT, power: 1.0, burn: 0.3, spin: 7 },
  bumperF: { shape: SHAPE.BAR, size: [0.22, 0.28, 1.9], kind: KIND.DARK, power: 1.2, burn: 0.1, spin: 9 },
  bumperR: { shape: SHAPE.BAR, size: [0.22, 0.28, 1.8], kind: KIND.DARK, power: 1.2, burn: 0.1, spin: 9 },
  spoiler: { shape: SHAPE.PANEL, size: [0.5, 0.06, 1.9], kind: KIND.DARK, power: 1.3, burn: 0.0, spin: 10 },
  wheelFR: { shape: SHAPE.WHEEL, size: [1, 1, 1], kind: KIND.TYRE, power: 1.0, burn: 0.7, spin: 14 },
  wheelRL: { shape: SHAPE.WHEEL, size: [1, 1, 1], kind: KIND.TYRE, power: 1.0, burn: 0.7, spin: 14 },
  turret: { shape: SHAPE.BAR, size: [1.3, 0.22, 0.4], kind: KIND.METAL, power: 1.4, burn: 0.0, spin: 8 },
});

export class DebrisField {
  constructor() {
    const n = DEBRIS_MAX, f = (k = 1) => new Float32Array(n * k);
    this.n = n;
    this.alive = new Uint8Array(n); this.rest = new Uint8Array(n); this.dirty = new Uint8Array(n); this.colorDirty = new Uint8Array(n);
    this.shape = new Uint8Array(n); this.kind = new Uint8Array(n);
    this.p = f(3); this.v = f(3); this.r = f(3); this.w = f(3); this.s = f(3);      // pos, vel, euler, angular velocity, scale
    this.hr = f(); this.life = f(); this.burn = f(); this.heat = f(); this.bounces = new Uint8Array(n); this.age = f(); this.trailT = f();
    this.cursor = SHAPE_CAP.map(() => 0);
    this.rng = mulberry32(1);
    this.count = 0;
  }
  reseed(seed) { this.rng = mulberry32(seed >>> 0); }
  /** Claim a slot in the shape's pool (oldest-first overwrite). */
  slot(shape) {
    const cap = SHAPE_CAP[shape], base = SHAPE_BASE[shape];
    for (let k = 0; k < cap; k++) {          // prefer a dead slot
      const i = base + ((this.cursor[shape] + k) % cap);
      if (!this.alive[i]) { this.cursor[shape] = (this.cursor[shape] + k + 1) % cap; return i; }
    }
    const i = base + this.cursor[shape]; this.cursor[shape] = (this.cursor[shape] + 1) % cap; return i;
  }
  /** Spawn one piece. pos/vel in world metres (y up); spin = angular speed scale. Returns the slot. */
  spawn(shape, kind, x, y, z, vx, vy, vz, sx, sy, sz, spin, burn = 0, life = DEBRIS.restLife) {
    const i = this.slot(shape), o = i * 3, R = this.rng;
    this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z;
    this.v[o] = vx; this.v[o + 1] = vy; this.v[o + 2] = vz;
    this.r[o] = R() * 6.283; this.r[o + 1] = R() * 6.283; this.r[o + 2] = R() * 6.283;
    this.w[o] = (R() - 0.5) * 2 * spin; this.w[o + 1] = (R() - 0.5) * 2 * spin; this.w[o + 2] = (R() - 0.5) * 2 * spin;
    this.s[o] = sx; this.s[o + 1] = sy; this.s[o + 2] = sz;
    this.hr[i] = shape === SHAPE.WHEEL ? 0.42 : Math.max(0.05, Math.min(sx, sy, sz) * 0.5 + 0.03);
    this.life[i] = life; this.burn[i] = burn; this.heat[i] = burn > 0 ? 1 : 0; this.bounces[i] = 0; this.age[i] = 0; this.trailT[i] = 0;
    this.shape[i] = shape; this.kind[i] = kind;
    if (!this.alive[i]) this.count++;
    this.alive[i] = 1; this.rest[i] = 0; this.dirty[i] = 1; this.colorDirty[i] = 1;
    return i;
  }
  /**
   * Advance every live piece. onBounce(x,y,z,impactSpeed,i) on ground impacts, onTrail(i,x,y,z,heat) while a piece burns
   * (called at ~25 Hz per burning piece). Allocation-free.
   */
  step(dt, onBounce, onTrail) {
    const D = DEBRIS, g = D.gravity;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const o = i * 3;
      this.age[i] += dt;
      if (this.burn[i] > 0) {
        this.burn[i] -= dt; this.heat[i] = Math.max(0, this.heat[i] - dt * 0.12);
        this.trailT[i] += dt;
        if (this.trailT[i] > 0.04) { this.trailT[i] = 0; if (onTrail) onTrail(i, this.p[o], this.p[o + 1], this.p[o + 2], this.heat[i]); }
      }
      if (this.rest[i]) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.alive[i] = 0; this.count--; this.dirty[i] = 1; }
        else if (this.life[i] < D.fadeTime) this.dirty[i] = 1;      // shrinking out
        continue;
      }
      this.dirty[i] = 1;
      this.v[o + 1] -= g * dt;
      const k = Math.max(0, 1 - D.airDrag * dt);
      this.v[o] *= k; this.v[o + 2] *= k;
      this.p[o] += this.v[o] * dt; this.p[o + 1] += this.v[o + 1] * dt; this.p[o + 2] += this.v[o + 2] * dt;
      this.r[o] += this.w[o] * dt; this.r[o + 1] += this.w[o + 1] * dt; this.r[o + 2] += this.w[o + 2] * dt;
      const hr = this.hr[i];
      if (this.p[o + 1] < hr) {
        this.p[o + 1] = hr;
        const vy = this.v[o + 1];
        if (vy < -D.bounceMin) {
          const imp = -vy;
          this.v[o + 1] = imp * D.restitution; this.v[o] *= D.groundGrip; this.v[o + 2] *= D.groundGrip;
          // a bounce randomises the tumble a little (deterministic stream)
          const R = this.rng;
          this.w[o] = this.w[o] * 0.7 + (R() - 0.5) * imp * 0.9; this.w[o + 1] *= 0.8; this.w[o + 2] = this.w[o + 2] * 0.7 + (R() - 0.5) * imp * 0.9;
          this.bounces[i]++;
          if (onBounce) onBounce(this.p[o], this.p[o + 1], this.p[o + 2], imp, i);
        } else {
          this.v[o + 1] = 0;
          const f = Math.max(0, 1 - D.roll * dt);
          this.v[o] *= f; this.v[o + 2] *= f;
          const sd = Math.max(0, 1 - D.spinDamp * 4 * dt);
          this.w[o] *= sd; this.w[o + 1] *= sd; this.w[o + 2] *= sd;
          if (Math.hypot(this.v[o], this.v[o + 2]) < D.restSpeed && Math.hypot(this.w[o], this.w[o + 1], this.w[o + 2]) < 1.2) this.settle(i);
        }
      }
    }
  }
  /** Come to rest lying flat: snap the roll/pitch to the nearest quarter turn, keep the yaw. */
  settle(i) {
    const o = i * 3, q = Math.PI / 2;
    this.rest[i] = 1; this.v[o] = this.v[o + 1] = this.v[o + 2] = 0; this.w[o] = this.w[o + 1] = this.w[o + 2] = 0;
    this.r[o] = Math.round(this.r[o] / q) * q; this.r[o + 2] = Math.round(this.r[o + 2] / q) * q;
    this.p[o + 1] = this.hr[i]; this.dirty[i] = 1;
  }
}

// ------------------------------------------------------------------ planning (pure, seeded)
/** Pure: spawn plan for a lost part. Returns launch params into `out` (reused object): x,y,z,vx,vy,vz,spec. */
export function planPart(ev, rng, out = {}) {
  const spec = PART_SPEC[ev.part] || PART_SPEC.hood;
  const power = (ev.wreck ? 1.25 : 0.9) * (0.7 + 0.5 * Math.min(1.5, ev.power || 1)) * spec.power;
  const dl = Math.hypot(ev.dx, ev.dy) || 1;
  const out_x = ev.dx / dl, out_z = ev.dy / dl;
  const spread = (rng() - 0.5) * 0.9, cs = Math.cos(spread), sn = Math.sin(spread);
  const dx = out_x * cs - out_z * sn, dz = out_x * sn + out_z * cs;
  const sp = (7 + rng() * 9) * power;
  out.spec = spec;
  out.x = ev.x; out.y = 0.55 + rng() * 0.5; out.z = ev.y;
  out.vx = (ev.vx || 0) * 0.85 + dx * sp; out.vz = (ev.vy || 0) * 0.85 + dz * sp;
  out.vy = (4 + rng() * 7) * power * (ev.wreck ? 1.35 : 1);
  return out;
}

/** Pure: number of small chunks thrown by a wreck / blast (bounded by the pool). */
export function chunkCount(power) { return Math.max(4, Math.min(34, Math.round(10 + power * 16))); }

// ------------------------------------------------------------------ renderer
function whiteAttr(g, hex = 0xffffff) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function shapeGeometries() {
  const panel = whiteAttr(new THREE.BoxGeometry(1, 1, 1));
  const chunk = whiteAttr(new THREE.IcosahedronGeometry(0.5, 0));
  const tyre = whiteAttr(new THREE.CylinderGeometry(0.42, 0.42, 0.4, 14), 0x1b1c20); tyre.rotateX(Math.PI / 2);
  const hub = whiteAttr(new THREE.CylinderGeometry(0.25, 0.25, 0.43, 8), 0x9aa3b0); hub.rotateX(Math.PI / 2);
  const wheel = mergeGeo([tyre, hub], [{ name: 'color', size: 3 }]);
  const bar = whiteAttr(new THREE.BoxGeometry(1, 1, 1));
  return [panel, chunk, wheel, bar];
}
const KIND_RGB = {
  [KIND.DARK]: [0.1, 0.1, 0.12], [KIND.METAL]: [0.42, 0.45, 0.5], [KIND.TYRE]: [1, 1, 1], [KIND.CHAR]: [0.05, 0.045, 0.04],
};

/**
 * createDebris(parent, { soft, onBounce(x,y,z,imp), onTrail(x,y,z,heat) }) -> { group, field, spawnPart(ev), spawnBurst(...), update(dt), dispose() }
 * soft = PBR look (standard material). Paint colour for panels comes from setPaint(carId, rgb) or the event's `paint` hex.
 */
export function createDebris(parent, { soft = false, onBounce = null, onTrail = null } = {}) {
  const group = parent;   // meshes are added straight to the parent (no extra Group node)
  const field = new DebrisField();
  const geos = shapeGeometries();
  const mat = soft
    ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.5, flatShading: true })
    : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshes = geos.map((g, s) => {
    const im = new THREE.InstancedMesh(g, mat, SHAPE_CAP[s]);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; im.name = `debris-${s}`;
    im.count = SHAPE_CAP[s];
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < SHAPE_CAP[s]; i++) { im.setMatrixAt(i, z); im.setColorAt(i, new THREE.Color(1, 1, 1)); }
    parent.add(im);
    return im;
  });
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const plan = {};
  const paintFor = new Map();   // carId -> [r,g,b]
  const bounceFx = (x, y, z, imp, i) => { if (onBounce) onBounce(x, y, z, imp, i); };
  const trailFx = (i, x, y, z, heat) => { if (onTrail) onTrail(x, y, z, heat); };

  function colorOf(kind, paint) {
    if (kind === KIND.PAINT) { const p = paint || [0.6, 0.15, 0.1]; return col.setRGB(p[0], p[1], p[2]); }
    const k = KIND_RGB[kind] || KIND_RGB[KIND.DARK]; return col.setRGB(k[0], k[1], k[2]);
  }
  /** Fly a lost car part. ev = partLost event (+ optional paint [r,g,b] or paintHex). */
  function spawnPart(ev, paint) {
    field.reseed(ev.seed ?? 1);
    const rng = field.rng;
    planPart(ev, rng, plan);
    const sp = plan.spec;
    const i = field.spawn(sp.shape, sp.kind, plan.x, plan.y, plan.z, plan.vx, plan.vy, plan.vz, sp.size[0], sp.size[1], sp.size[2], sp.spin * (0.7 + 0.6 * rng()), sp.burn * (ev.wreck ? 14 : 8) * (0.6 + rng() * 0.8));
    const c = colorOf(sp.kind, paint || paintFor.get(ev.carId));
    const sh = sp.shape, local = i - SHAPE_BASE[sh];
    meshes[sh].setColorAt(local, c); meshes[sh].instanceColor.needsUpdate = true;
    return i;
  }
  /** Throw n small chunks (scrap, glass, hot metal) from (x,z). charred 0..1 = fraction that are black. */
  function spawnBurst(x, z, n, power, seed, paint, charred = 0.4, vx = 0, vz = 0) {
    field.reseed(seed ?? 7);
    const rng = field.rng;
    for (let k = 0; k < n; k++) {
      const a = rng() * 6.283, sp = (4 + rng() * 14) * (0.6 + power * 0.5);
      const sz = 0.12 + rng() * 0.34;
      const dark = rng() < charred;
      const i = field.spawn(SHAPE.CHUNK, dark ? KIND.CHAR : (rng() < 0.5 ? KIND.PAINT : KIND.METAL), x + (rng() - 0.5) * 1.6, 0.5 + rng() * 0.8, z + (rng() - 0.5) * 1.6,
        vx * 0.5 + Math.cos(a) * sp, (3 + rng() * 9) * (0.6 + power * 0.5), vz * 0.5 + Math.sin(a) * sp, sz * (0.7 + rng()), sz * (0.5 + rng()), sz * (0.7 + rng()), 12, rng() < 0.45 ? 2 + rng() * 5 : 0, 12 + rng() * 8);
      const c = colorOf(field.kind[i], paint);
      meshes[SHAPE.CHUNK].setColorAt(i - SHAPE_BASE[SHAPE.CHUNK], c);
    }
    if (meshes[SHAPE.CHUNK].instanceColor) meshes[SHAPE.CHUNK].instanceColor.needsUpdate = true;
  }
  function update(dt) {
    field.step(dt, bounceFx, trailFx);
    for (let s = 0; s < 4; s++) {
      const im = meshes[s], base = SHAPE_BASE[s], cap = SHAPE_CAP[s];
      let touched = false;
      for (let k = 0; k < cap; k++) {
        const i = base + k;
        if (!field.dirty[i]) continue;
        field.dirty[i] = 0; touched = true;
        const o = i * 3;
        if (!field.alive[i]) { dummy.scale.set(0, 0, 0); dummy.position.set(0, -50, 0); dummy.rotation.set(0, 0, 0); }
        else {
          const fade = field.rest[i] && field.life[i] < DEBRIS.fadeTime ? field.life[i] / DEBRIS.fadeTime : 1;
          dummy.position.set(field.p[o], field.p[o + 1], field.p[o + 2]);
          dummy.rotation.set(field.r[o], field.r[o + 1], field.r[o + 2]);
          dummy.scale.set(field.s[o] * fade, field.s[o + 1] * fade, field.s[o + 2] * fade);
        }
        dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix);
      }
      if (touched) im.instanceMatrix.needsUpdate = true;
    }
  }
  function clear() { field.alive.fill(0); field.rest.fill(0); field.count = 0; field.dirty.fill(1); update(0); }
  function dispose() {
    for (const im of meshes) parent.remove(im);
    for (const g of geos) g.dispose();
    mat.dispose();
    for (const m of meshes) m.dispose();
  }
  return { group, field, spawnPart, spawnBurst, update, clear, dispose, setPaint(carId, rgb) { paintFor.set(carId, rgb); }, meshes };
}
