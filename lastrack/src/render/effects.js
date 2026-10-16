// Snapshot-driven effects: pooled square-pixel particles (smoke/fire/explosions/sparks), MG tracers, rocket meshes + trails,
// explosion fireballs, caltrops/wreck hazards, pickups, skid marks. No per-frame allocation in hot paths.
import * as THREE from 'three';
import { MeshBuilder, colorRGB, wrapAngle, disposeObject } from './geomUtil.js';
import { COLOR as K } from './paletteRef.js';
import { carMuzzle } from './pbr/heroCarPBR.js';
import { createDebris, chunkCount } from './debris.js';
import { mulberry32 } from '../core/mathUtil.js';

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale; varying float vA; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = clamp(aSize * uScale / max(0.1,-mv.z), 1.0, 96.0); vA=aAlpha; vC=aColor; gl_Position = projectionMatrix*mv; }`;
const FRAG = `
varying float vA; varying vec3 vC;
void main(){ if (vA < 0.05) discard; gl_FragColor = vec4(vC, 1.0); }`; // opaque squares: reads as pixel-art, survives palette quantise

// Soft variant for the PBR slice: round, blended, HDR-boosted glow colours (picked up by bloom).
const FRAG_SOFT = `
varying float vA; varying vec3 vC;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0 || vA < 0.02) discard; float a = (1.0 - d * d) * vA; gl_FragColor = vec4(vC, a * 0.85); }`;
const GLOW_COLOURS = new Set([K.red, K.orange, K.yellow, K.white]);

/** Pooled point particles (one draw call). */
export class ParticlePool {
  constructor(max = 800, soft = false) {
    this.soft = soft;
    this.max = max; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.grow = new Float32Array(max); this.alpha = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1); this.drag = new Float32Array(max); this.rise = new Float32Array(max);
    this.geometry = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.aPos);
    this.geometry.setAttribute('aColor', this.aCol);
    this.geometry.setAttribute('aSize', this.aSize);
    this.geometry.setAttribute('aAlpha', this.aAlpha);
    this.material = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, vertexShader: VERT, fragmentShader: soft ? FRAG_SOFT : FRAG, transparent: soft, depthWrite: !soft, fog: false });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'particles';
    this.active = 0;
  }
  /** colour = palette index. */
  emit(x, y, z, vx, vy, vz, life, size, grow, colour, rise = 0, drag = 0) {
    const i = this.cursor; this.cursor = (i + 1) % this.max;
    const o = i * 3, c0 = colorRGB(colour), gm = this.soft && GLOW_COLOURS.has(colour) ? 2.6 : 1;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz;
    this.col[o] = c0[0] * gm; this.col[o + 1] = c0[1] * gm; this.col[o + 2] = c0[2] * gm;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow; this.alpha[i] = 1; this.rise[i] = rise; this.drag[i] = drag;
  }
  update(dt, uScale = 600) {
    this.material.uniforms.uScale.value = uScale;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      alive++;
      const o = i * 3, k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[o] *= k; this.vel[o + 2] *= k; this.vel[o + 1] = this.vel[o + 1] * k + this.rise[i] * dt;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.soft ? Math.min(1, (this.life[i] / this.maxLife[i]) * 1.6) : this.life[i] / this.maxLife[i] > 0.12 ? 1 : 0.5; // hard fade (no blending) unless soft
    }
    this.active = alive;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/** Ring buffer of quads for tyre skid marks (one draw call). */
export class SkidMarks {
  constructor(max = 700) {
    this.max = max; this.cursor = 0; this.count = 0;
    this.pos = new Float32Array(max * 4 * 3);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) { const v = i * 4; idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6); }
    this.geometry = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.attr);
    this.geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorRGB(K.black)[0], colorRGB(K.black)[1], colorRGB(K.black)[2]), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false; this.mesh.name = 'skids'; this.mesh.renderOrder = 1;
  }
  addSegment(x0, z0, x1, z1, w = 0.22, y = 0.06) {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz);
    if (l < 1e-4) return;
    const nx = (-dz / l) * w / 2, nz = (dx / l) * w / 2;
    const o = this.cursor * 12;
    this.pos.set([x0 - nx, y, z0 - nz, x0 + nx, y, z0 + nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz], o);
    this.cursor = (this.cursor + 1) % this.max;
    this.count = Math.min(this.max, this.count + 1);
    this.geometry.setDrawRange(0, this.count * 6);
    this.attr.needsUpdate = true;
  }
  clear() { this.cursor = 0; this.count = 0; this.geometry.setDrawRange(0, 0); }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

const basic = (c) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(...colorRGB(c)) }); return m; };

function rocketGeometry(big) {
  const b = new MeshBuilder();
  const s = big ? 1.5 : 1;
  b.cyl(0, 0, 0, 0.13 * s, 0.13 * s, 1.1 * s, 'x', 5, big ? K.red : K.lightGrey);
  b.cyl(0.65 * s, 0, 0, 0.13 * s, 0, 0.35 * s, 'x', 5, big ? K.yellow : K.orange);
  b.box(-0.5 * s, 0, 0, 0.3 * s, 0.05, 0.5 * s, K.darkGrey);
  b.box(-0.5 * s, 0, 0, 0.3 * s, 0.5 * s, 0.05, K.darkGrey);
  return b.build();
}
function guidedGeometry() {
  const b = new MeshBuilder();
  b.cyl(0, 0, 0, 0.12, 0.12, 1.25, 'x', 6, K.lightGrey);
  b.cyl(0.72, 0, 0, 0.12, 0.05, 0.3, 'x', 6, K.sky);        // seeker dome
  b.cyl(-0.45, 0, 0, 0.14, 0.14, 0.12, 'x', 6, K.sky);      // guidance band
  b.box(-0.55, 0, 0, 0.32, 0.05, 0.62, K.darkGrey);
  b.box(-0.55, 0, 0, 0.32, 0.62, 0.05, K.darkGrey);
  b.box(0.15, 0, 0, 0.2, 0.04, 0.34, K.darkGrey);
  b.box(0.15, 0, 0, 0.2, 0.34, 0.04, K.darkGrey);
  return b.build();
}
function caltropGeometry() {
  const b = new MeshBuilder();
  for (let i = 0; i < 7; i++) { const a = i * 2.4; b.spike(Math.cos(a) * (0.3 + i * 0.12), 0, Math.sin(a) * (0.3 + i * 0.12), 0.1, 0.3, i % 2 ? K.lightGrey : K.darkGrey); }
  return b.build();
}
function mineGeometry() {
  const b = new MeshBuilder();
  b.cyl(0, 0.12, 0, 0.95, 1.05, 0.24, 'y', 8, K.darkGrey);
  b.cyl(0, 0.3, 0, 0.55, 0.6, 0.12, 'y', 8, K.rust);
  for (let i = 0; i < 4; i++) { const a = i * 1.571; b.spike(Math.cos(a) * 0.85, 0.2, Math.sin(a) * 0.85, 0.08, 0.22, K.lightGrey); }
  return b.build();
}
function wreckGeometry() {
  const b = new MeshBuilder();
  b.box(0, 0.4, 0, 4, 0.8, 1.8, K.black); b.box(-0.4, 0.95, 0, 1.6, 0.4, 1.3, K.darkGrey); b.box(1.2, 0.85, 0.5, 0.8, 0.2, 0.5, K.rust);
  return b.build();
}
function pickupGeometry(type) {
  const b = new MeshBuilder();
  const c = type === 'ammo' ? K.yellow : type === 'repair' ? K.lime : K.sky;
  if (type === 'repair') { b.box(0, 0, 0, 1.3, 0.4, 0.4, c); b.box(0, 0, 0, 0.4, 1.3, 0.4, c); b.box(0, 0, 0, 0.4, 0.4, 1.3, K.white); }
  else if (type === 'ammo') { b.box(0, 0, 0, 1.3, 0.9, 0.9, c); b.box(0, 0.5, 0, 0.5, 0.1, 0.5, K.red); b.box(0, 0, 0, 1.35, 0.15, 0.95, K.black); }
  else { b.cyl(0, 0, 0, 0.7, 0.7, 0.25, 'z', 8, c, K.yellow); b.box(0, 0, 0.15, 0.2, 0.7, 0.05, K.black); }
  return b.build();
}

const TRACER_MAX = 48;
const EXPLO_MAX = 16;
const RING_MAX = 8;
const SCORCH_MAX = 28;
const LATER_MAX = 48;

/**
 * createEffects(scene) -> { group, handleEvents(snap), update(snapCur, dt, carPose), dispose() }
 * carPose(id) -> { x, y, heading } (interpolated) optional; falls back to snapshot values.
 */
export function createEffects(parent, { skid = true, soft = false } = {}) {
  const root = new THREE.Group(); root.name = 'effects';
  parent.add(root);
  const parts = new ParticlePool(2000, soft);
  const skids = new SkidMarks(skid ? 900 : 4);
  const carIds = [];   // car id -> 'hammer' | 'wasp' | 'bulwark' (set by the race controller; picks the muzzle position)
  root.add(parts.points, skids.mesh);

  // tracers
  const trGeo = new THREE.BufferGeometry();
  const trPos = new Float32Array(TRACER_MAX * 6);
  trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage));
  const trMat = new THREE.LineBasicMaterial({ color: new THREE.Color(...colorRGB(K.yellow)) });
  const tracerLines = new THREE.LineSegments(trGeo, trMat);
  tracerLines.frustumCulled = false;
  root.add(tracerLines);
  const tracers = Array.from({ length: TRACER_MAX }, () => ({ life: 0, x: 0, z: 0, dx: 0, dz: 0, d: 0, len: 0 }));
  let trCursor = 0;

  // explosions (fireball meshes), shockwave rings, scorch decals and a queue of delayed sub-effects (secondary blasts, smoke column)
  const rnd = mulberry32(0xf17e);
  const glow = (c) => { const m = basic(c); if (soft) m.color.multiplyScalar(2.4); return m; };
  const exGeo = new THREE.IcosahedronGeometry(1, 1);
  // fireball colour ramp (HDR-ish: values > 1 bloom in the PBR pass): white-hot -> yellow -> orange -> red -> smoke
  const FIRE_RAMP = [[3.2, 2.7, 1.9], [2.8, 1.7, 0.4], [2.0, 0.75, 0.12], [1.0, 0.2, 0.05], [0.16, 0.13, 0.11]];
  const explosions = Array.from({ length: EXPLO_MAX }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const m = new THREE.Mesh(exGeo, mat); m.visible = false; root.add(m); return { m, mat, t: 0, dur: 0.5, r: 6, rise: 0, y0: 1, spin: 0 };
  });
  const exMats = explosions.map((e) => e.mat);
  let exCursor = 0;
  const ringGeo = new THREE.RingGeometry(0.88, 1, 56); ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: RING_MAX }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    if (soft) mat.color.multiplyScalar(2.2);
    const m = new THREE.Mesh(ringGeo, mat); m.visible = false; m.renderOrder = 3; root.add(m); return { m, mat, t: 0, dur: 0.5, r: 8 };
  });
  let ringCursor = 0;
  const scorchGeo = new THREE.CircleGeometry(1, 18); scorchGeo.rotateX(-Math.PI / 2);
  const scorchMat = new THREE.MeshBasicMaterial({ color: 0x0b0908, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const scorchMesh = new THREE.InstancedMesh(scorchGeo, scorchMat, SCORCH_MAX);
  scorchMesh.frustumCulled = false; scorchMesh.renderOrder = 1; scorchMesh.name = 'scorch';
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < SCORCH_MAX; i++) scorchMesh.setMatrixAt(i, z); }
  root.add(scorchMesh);
  let scorchCursor = 0;
  const dummy = new THREE.Object3D();
  function scorch(x, z, r, squash = 1) {
    dummy.position.set(x, 0.05 + scorchCursor * 0.0006, z); dummy.rotation.set(0, rnd() * 6.283, 0); dummy.scale.set(r, 1, r * (0.7 + 0.3 * squash * rnd()));
    dummy.updateMatrix(); scorchMesh.setMatrixAt(scorchCursor, dummy.matrix); scorchMesh.instanceMatrix.needsUpdate = true;
    scorchCursor = (scorchCursor + 1) % SCORCH_MAX;
  }
  const later = Array.from({ length: LATER_MAX }, () => ({ t: -1, kind: 0, x: 0, z: 0, r: 0, a: 0 }));
  function schedule(delay, kind, x, z, r, a = 0) {
    for (const q of later) if (q.t < 0) { q.t = delay; q.kind = kind; q.x = x; q.z = z; q.r = r; q.a = a; return; }
  }

  // shared dynamic-object geometry / materials
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const geoRocket = rocketGeometry(false), geoTerm = rocketGeometry(true), geoGuided = guidedGeometry(), geoCal = caltropGeometry(), geoWreck = wreckGeometry(), geoMine = mineGeometry();
  const geoLamp = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 6), geoPuddle = new THREE.CircleGeometry(1, 14);
  const lampOn = basic(K.red), lampOff = basic(K.plum), lampArmed = basic(K.yellow);
  const puddleMats = [basic(K.black), basic(K.navy), basic(K.lavender)];
  puddleMats.forEach((m) => { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; });
  const geoPick = { ammo: pickupGeometry('ammo'), repair: pickupGeometry('repair'), cash: pickupGeometry('cash') };
  const shared = [geoRocket, geoTerm, geoGuided, geoCal, geoWreck, geoMine, geoLamp, geoPuddle, exGeo, ...Object.values(geoPick), trGeo];
  const projMeshes = new Map(); // id -> {mesh, seen}
  const hazMeshes = new Map();
  const pickMeshes = new Map();
  const skidLast = new Map(); // carId -> {l:[x,z], r:[x,z]} | null
  let lastTick = -1;
  let time = 0;

  function addTracer(x, z, dx, dz, range, y = 0.75) {
    const t = tracers[trCursor]; trCursor = (trCursor + 1) % TRACER_MAX;
    t.y = y; t.life = 0.14; t.x = x; t.z = z; t.dx = dx; t.dz = dz; t.d = 0; t.len = Math.min(range, 70);
  }
  const DEBRIS_PAINT = [0.55, 0.12, 0.08];
  function fireball(x, y, z, r, dur, rise = 0) {
    const e = explosions[exCursor]; exCursor = (exCursor + 1) % EXPLO_MAX;
    e.t = 0; e.dur = dur; e.r = r; e.rise = rise; e.y0 = y; e.spin = rnd() * 6.28; e.m.position.set(x, y, z); e.m.rotation.set(rnd() * 3, e.spin, rnd() * 3); e.m.visible = true;
  }
  function shockwave(x, z, r, dur) {
    const e = rings[ringCursor]; ringCursor = (ringCursor + 1) % RING_MAX;
    e.t = 0; e.dur = dur; e.r = r; e.m.position.set(x, 0.18, z); e.m.visible = true; e.m.scale.setScalar(0.5); e.mat.opacity = 0.9;
  }
  const FIRE_COLS = [K.white, K.yellow, K.orange, K.red, K.darkGrey];
  function fireBurst(x, y, z, r, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, sp = (3 + rnd() * 9) * (r / 6 + 0.5), up = 2 + rnd() * 9;
      parts.emit(x, y, z, Math.cos(a) * sp, up, Math.sin(a) * sp, 0.5 + rnd() * 0.8, (1.1 + rnd() * 1.6) * (0.7 + r / 14), 0.8, FIRE_COLS[(rnd() * 5) | 0], -6, 1.5);
    }
  }
  function smokePuff(x, y, z, r, n, rise = 2.5) {
    for (let i = 0; i < n; i++) parts.emit(x + (rnd() - 0.5) * r * 0.5, y, z + (rnd() - 0.5) * r * 0.5, (rnd() - 0.5) * 3, rise * (0.6 + rnd() * 0.8), (rnd() - 0.5) * 3, 1.6 + rnd() * 1.4, 1.8 + rnd() * 1.6, 2.2, rnd() < 0.5 ? K.darkGrey : K.black, 0.8, 0.9);
  }
  function groundDust(x, z, r) {
    const n = Math.min(40, 14 + r * 3) | 0;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + rnd() * 0.3, sp = (7 + rnd() * 6) * (r / 8 + 0.6); parts.emit(x, 0.3, z, Math.cos(a) * sp, 0.4 + rnd() * 1.2, Math.sin(a) * sp, 0.7 + rnd() * 0.5, 1.0 + rnd() * 0.9, 1.8, rnd() < 0.5 ? K.sand : K.lightGrey, 0.4, 2.4); }
  }
  /** tier: 0 spark pop, 1 rocket-size, 2 mine / terminator, 3 wreck (full staged blast). */
  function explode(x, z, radius, o = {}) {
    const tier = o.tier ?? (radius >= 9 ? 2 : radius >= 5 ? 1 : 0), r = Math.max(2, radius);
    const dur = 0.45 + r * 0.03;
    fireball(x, 1, z, r * (tier >= 3 ? 1.15 : 1), dur, tier >= 2 ? r * 0.35 : 0);
    shockwave(x, z, r * (tier >= 3 ? 2.6 : tier >= 2 ? 2.2 : 1.7), dur * 0.9);
    fireBurst(x, 1, z, r, Math.min(90, 18 + r * 4 + tier * 8));
    if (tier >= 2) for (let i = 0; i < 10 + tier * 6; i++) {   // heavy slow fire clouds that fill the fireball volume
      const a = rnd() * 6.283, d = rnd() * r * 0.45;
      parts.emit(x + Math.cos(a) * d, 0.8 + rnd() * r * 0.35, z + Math.sin(a) * d, Math.cos(a) * (1 + rnd() * 3), 1.5 + rnd() * 3.5, Math.sin(a) * (1 + rnd() * 3), 0.55 + rnd() * 0.6, (2.6 + rnd() * 2.4) * (0.7 + r / 14), 2.6, rnd() < 0.45 ? K.orange : rnd() < 0.5 ? K.yellow : K.red, 1.2, 1.2);
    }
    smokePuff(x, 1.6, z, r, 8 + tier * 3, 1.8);
    if (tier >= 1) { groundDust(x, z, r); scorch(x, z, r * (tier >= 3 ? 1.05 : 0.7)); }
    if (tier >= 1) debris.spawnBurst(x, z, chunkCount(tier * 0.5 + r / 12), 0.6 + tier * 0.3, (x * 977 + z * 131) >>> 0, DEBRIS_PAINT, 0.5, o.vx || 0, o.vz || 0);
    if (tier >= 2) {
      const n = tier >= 3 ? 3 : 1;
      for (let k = 0; k < n; k++) { const a = rnd() * 6.283, d = r * (0.25 + rnd() * 0.5); schedule(0.09 + k * 0.13 + rnd() * 0.06, 0, x + Math.cos(a) * d, z + Math.sin(a) * d, r * (0.5 + rnd() * 0.25), tier); }
      // rising smoke column + embers over the next ~1.4 s
      for (let k = 0; k < 7; k++) schedule(0.15 + k * 0.17, 1, x, z, r, 1.5 + k * 1.5);
    }
    if (tier >= 3) schedule(0.45, 2, x, z, r * 0.7);        // late fireball: the fuel tank
  }
  function runLater(dt) {
    for (const q of later) {
      if (q.t < 0) continue;
      q.t -= dt;
      if (q.t > 0) continue;
      const t = q.t; q.t = -1; void t;
      if (q.kind === 0) {                                                  // secondary blast
        fireball(q.x, 0.8 + rnd() * 0.8, q.z, q.r, 0.4 + q.r * 0.03, q.r * 0.25);
        fireBurst(q.x, 1, q.z, q.r, 16); smokePuff(q.x, 1.4, q.z, q.r, 4, 2);
        shockwave(q.x, q.z, q.r * 1.8, 0.35);
        if (q.a >= 3) debris.spawnBurst(q.x, q.z, 6, 0.8, (q.x * 31 + q.z * 17) >>> 0, DEBRIS_PAINT, 0.7);
      } else if (q.kind === 1) {                                           // smoke column slice
        smokePuff(q.x, q.a, q.z, q.r * 0.6, 3, 3.2);
        for (let i = 0; i < 3; i++) parts.emit(q.x + (rnd() - 0.5) * 2, q.a, q.z + (rnd() - 0.5) * 2, (rnd() - 0.5) * 2, 3 + rnd() * 3, (rnd() - 0.5) * 2, 0.7 + rnd() * 0.5, 1.2, -0.4, rnd() < 0.5 ? K.orange : K.yellow, 1, 0.5);
      } else {                                                             // late fuel-tank fireball
        fireball(q.x, 1.4, q.z, q.r * 1.1, 0.7, q.r * 0.6); shockwave(q.x, q.z, q.r * 2.2, 0.55); fireBurst(q.x, 1.4, q.z, q.r, 30);
      }
    }
  }
  const onBounce = (x, y, z, imp) => {
    if (imp > 4) for (let i = 0; i < Math.min(8, imp | 0); i++) parts.emit(x, y + 0.1, z, (rnd() - 0.5) * 7, 1.5 + rnd() * 3.5, (rnd() - 0.5) * 7, 0.22 + rnd() * 0.25, 0.4, 0, rnd() < 0.5 ? K.yellow : K.white, -10);
    if (imp > 7 && rnd() < 0.4) scorch(x, z, 0.5 + imp * 0.05, 0.4);
  };
  const onTrail = (x, y, z, heat) => {
    parts.emit(x, y + 0.2, z, (rnd() - 0.5) * 0.8, 0.8 + rnd(), (rnd() - 0.5) * 0.8, 0.45 + rnd() * 0.3, 0.7 + heat * 0.4, -0.5, heat > 0.45 ? (rnd() < 0.5 ? K.orange : K.yellow) : K.red, 1.2, 0.6);
    if (rnd() < 0.7) parts.emit(x, y + 0.3, z, (rnd() - 0.5), 1.4, (rnd() - 0.5), 1.0 + rnd() * 0.6, 1.0, 1.8, rnd() < 0.5 ? K.darkGrey : K.black, 0.7, 0.7);
  };
  const debris = createDebris(root, { soft, onBounce, onTrail });
  const poseOf = (car, getPose) => (getPose && getPose(car.id)) || car;

  function handleEvents(snap, getPose) {
    if (!snap || snap.tick === lastTick) return;
    lastTick = snap.tick;
    const evs = snap.events || [];
    for (const ev of evs) {
      if (ev.type === 'shot') {
        const car = snap.cars[ev.carId]; if (!car) continue;
        const p = poseOf(car, getPose), c = Math.cos(p.heading), s = Math.sin(p.heading);
        const sp = ev.weaponId === 'machinegun' ? (Math.random() - 0.5) * 0.06 : 0;
        if (ev.weaponId === 'machinegun') {
          const cc = Math.cos(p.heading + (soft ? 0 : sp)), ss = Math.sin(p.heading + (soft ? 0 : sp));
          if (soft) {                                  // PBR Hammer: twin barrels on the roof, straight along the heading
            const mz = carMuzzle(carIds[car.id] || 'hammer'), side = mz.zs[((ev.tick ?? snap.tick) | 0) % mz.zs.length], ox = p.x + c * mz.x - s * side, oz = p.y + s * mz.x + c * side;
            addTracer(ox, oz, c, s, 80, mz.y);
            parts.emit(ox, mz.y, oz, c * 8, 0.2, s * 8, 0.07, 1.4, 0, K.yellow);
            parts.emit(ox, mz.y, oz, c * 4, 0.2, s * 4, 0.05, 0.9, 0, K.white);
          } else {
          addTracer(p.x + c * 2.2, p.y + s * 2.2, cc, ss, 80);
          parts.emit(p.x + c * 2.4, 0.7, p.y + s * 2.4, c * 8, 0.5, s * 8, 0.07, 1.1, 0, K.yellow);
          parts.emit(p.x + c * 2.4, 0.7, p.y + s * 2.4, c * 4, 0.5, s * 4, 0.05, 0.7, 0, K.white);
          }
        } else if (ev.weaponId === 'rocket' || ev.weaponId === 'terminator' || ev.weaponId === 'guided') {
          for (let i = 0; i < 6; i++) parts.emit(p.x + c * 2, 0.8, p.y + s * 2, c * 6 + (Math.random() - 0.5) * 3, 0.5, s * 6 + (Math.random() - 0.5) * 3, 0.35, 1.2, 1, i % 2 ? K.orange : K.white, 0, 2);
        }
      } else if (ev.type === 'explosion') {
        const tier = ev.kind === 'wreck' ? 3 : ev.kind === 'terminator' || ev.kind === 'mine' || (ev.radius || 0) >= 8 ? 2 : (ev.radius || 6) >= 5 ? 1 : 0;
        const car = ev.carId !== undefined ? snap.cars[ev.carId] : null;
        explode(ev.x, ev.y, ev.kind === 'wreck' ? 10 : ev.radius || 6, { tier, vx: car ? car.vx : 0, vz: car ? car.vy : 0 });
      } else if (ev.type === 'wreck') {
        const car = snap.cars[ev.carId];
        if (car) { scorch(car.x, car.y, 3.2, 0.5); smokePuff(car.x, 1.2, car.y, 3, 10, 3); }
      } else if (ev.type === 'partLost') {
        const car = snap.cars[ev.carId];
        debris.spawnPart(ev, car ? colorRGB(car.color) : null);
        for (let i = 0; i < 9; i++) parts.emit(ev.x, 0.7, ev.y, (rnd() - 0.5) * 9, 1 + rnd() * 5, (rnd() - 0.5) * 9, 0.25 + rnd() * 0.3, 0.55, 0, rnd() < 0.6 ? K.yellow : K.white, -9);
        smokePuff(ev.x, 0.8, ev.y, 1.6, 3, 1.4);
        if (ev.wreck !== true) shockwave(ev.x, ev.y, 3.2, 0.3);
      } else if (ev.type === 'scrape') {
        const car = snap.cars[ev.carId]; const sp = car ? poseOf(car, getPose) : null;
        const h = sp ? sp.heading : 0, c = Math.cos(h), s = Math.sin(h), k = Math.min(1, (ev.speed || 10) / 40);
        const nSp = 3 + (k * 5) | 0;
        for (let i = 0; i < nSp; i++) parts.emit(ev.x + (rnd() - 0.5), 0.35 + rnd() * 0.5, ev.y + (rnd() - 0.5), -c * (8 + rnd() * 10) * (0.5 + k) + (rnd() - 0.5) * 4, 1 + rnd() * 4, -s * (8 + rnd() * 10) * (0.5 + k) + (rnd() - 0.5) * 4, 0.22 + rnd() * 0.3, 0.45, 0, rnd() < 0.5 ? K.yellow : K.orange, -12);
        if (rnd() < 0.3) parts.emit(ev.x, 0.5, ev.y, 0, 1.2, 0, 0.7, 1.0, 1.4, K.lightGrey, 0.6, 1);
      } else if (ev.type === 'recover') {
        groundDust(ev.x, ev.y, 3);
      } else if (ev.type === 'flame') {
        const car = snap.cars[ev.carId]; if (!car) continue;
        const p = poseOf(car, getPose), range = ev.range || 14, cone = ev.cone || 0.38;
        for (let i = 0; i < 6; i++) {
          const a = p.heading + (Math.random() * 2 - 1) * cone * 0.8, sp = range * (0.9 + Math.random() * 0.8);
          const c = Math.cos(a), s = Math.sin(a), k = Math.random();
          parts.emit(p.x + Math.cos(p.heading) * 2.4, 0.8, p.y + Math.sin(p.heading) * 2.4, c * sp, 0.4 + Math.random() * 1.2, s * sp, 0.28 + Math.random() * 0.2, 1.3 + Math.random() * 1.2, 2.5,
            k < 0.2 ? K.white : k < 0.5 ? K.yellow : k < 0.8 ? K.orange : K.red, 1.5, 2.2);
        }
        if (Math.random() < 0.35) parts.emit(p.x + Math.cos(p.heading) * (range * 0.7), 1.2, p.y + Math.sin(p.heading) * (range * 0.7), 0, 1.5, 0, 0.8, 1.2, 1.5, K.darkGrey, 1, 0.5);
      } else if (ev.type === 'hit' && ev.x !== undefined && ev.weaponId !== 'flamethrower') {
        const heavy = ev.weaponId === 'rocket' || ev.weaponId === 'terminator' || ev.weaponId === 'mine';
        const n = heavy ? 14 : 5;
        for (let i = 0; i < n; i++) parts.emit(ev.x, 0.8, ev.y, (rnd() - 0.5) * (heavy ? 14 : 8), 1 + rnd() * (heavy ? 7 : 4), (rnd() - 0.5) * (heavy ? 14 : 8), 0.25 + (heavy ? rnd() * 0.2 : 0), 0.5, 0, i % 2 ? K.yellow : K.white, -8);
      } else if (ev.type === 'bump') {
        const car = snap.cars[ev.carId]; if (!car) continue;
        const nSp = Math.min(30, 6 + Math.round((ev.strength || 1) * 3));
        for (let i = 0; i < nSp; i++) parts.emit(car.x + (Math.random() - 0.5) * 2, 0.4 + Math.random() * 0.5, car.y + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 12, 1 + Math.random() * 4, (Math.random() - 0.5) * 12, 0.25 + Math.random() * 0.25, 0.5, 0, i % 3 ? K.yellow : K.white, -9);
      } else if (ev.type === 'spikeHit') {   // hot plasma/steel sparks fanning out of the impact point
        const n = Math.min(34, 12 + Math.round((ev.strength || 1) * 1.6));
        for (let i = 0; i < n; i++) parts.emit(ev.x + (Math.random() - 0.5), 0.35 + Math.random() * 0.6, ev.y + (Math.random() - 0.5), (Math.random() - 0.5) * 16, 1.5 + Math.random() * 5, (Math.random() - 0.5) * 16, 0.3 + Math.random() * 0.35, 0.5, 0, i % 3 === 0 ? K.white : i % 3 === 1 ? K.sky : K.orange, -9);
      } else if (ev.type === 'pickup') {
        const car = snap.cars[ev.carId]; if (!car) continue;
        for (let i = 0; i < 10; i++) parts.emit(car.x, 1, car.y, (Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.6, 0.8, 0, ev.pickupType === 'repair' ? K.lime : ev.pickupType === 'cash' ? K.sky : K.yellow, -4);
      }
    }
  }

  function syncObjects(snap, dt) {
    for (const v of projMeshes.values()) v.seen = false;
    for (const p of snap.projectiles || []) {
      let e = projMeshes.get(p.id);
      if (!e) {
        const mesh = new THREE.Mesh(p.type === 'terminator' ? geoTerm : p.type === 'guided' ? geoGuided : geoRocket, lit); root.add(mesh);
        e = { mesh, seen: true }; projMeshes.set(p.id, e);
      }
      e.seen = true;
      e.mesh.position.set(p.x, 0.9, p.y); e.mesh.rotation.y = -p.heading;
      const c = Math.cos(p.heading), s = Math.sin(p.heading);
      // trail (two particles per frame, flame + smoke)
      if (p.type === 'guided') {   // glowing exhaust: white-hot core + cyan plume, long smoke trail
        parts.emit(p.x - c * 0.85, 0.9, p.y - s * 0.85, -c * 4, 0, -s * 4, 0.12, 0.8, 0, K.white);
        parts.emit(p.x - c * 1.0, 0.9, p.y - s * 1.0, -c * 5, 0, -s * 5, 0.28, 1.35, 0, K.sky);
        parts.emit(p.x - c * 1.6, 0.9, p.y - s * 1.6, 0, 0.35, 0, 1.5, 1.0, 1.1, K.lightGrey, 0.5, 1);
      } else
      parts.emit(p.x - c * 0.9, 0.9, p.y - s * 0.9, -c * 3, 0, -s * 3, 0.25, 1.1, 0, p.type === 'terminator' ? K.red : K.orange);
      parts.emit(p.x - c * 1.3, 0.9, p.y - s * 1.3, 0, 0.6, 0, 0.8, 1.0, 1.4, K.lightGrey, 0.4, 1);
    }
    for (const [id, v] of projMeshes) if (!v.seen) { root.remove(v.mesh); projMeshes.delete(id); }

    for (const v of hazMeshes.values()) v.seen = false;
    for (const h of snap.hazards || []) {
      if (h.type === 'wreck') continue;   // the car mesh itself turns into the charred wreck (see raceController)
      let e = hazMeshes.get(h.id);
      if (!e) {
        let mesh;
        if (h.type === 'mine') {
          mesh = new THREE.Group(); mesh.add(new THREE.Mesh(geoMine, lit));
          const lamp = new THREE.Mesh(geoLamp, lampOff); lamp.position.y = 0.42; mesh.add(lamp);
          e = { mesh, lamp };
        } else if (h.type === 'oil') {
          mesh = new THREE.Group();
          const parts3 = [[0, 0, 3.4, 0.04], [0.5, 0.3, 2.3, 0.05], [-0.6, -0.4, 1.0, 0.06]];
          parts3.forEach(([ox, oz, r, y], k) => {
            const m = new THREE.Mesh(geoPuddle, puddleMats[Math.min(k, 2)]); m.rotation.x = -Math.PI / 2; m.position.set(ox, y, oz); m.scale.set(r, r * (k ? 0.7 : 1), 1); m.renderOrder = 1; mesh.add(m);
          });
          e = { mesh, sheen: mesh.children[2], oil: true };
        } else {
          mesh = new THREE.Mesh(h.type === 'wreck' ? geoWreck : geoCal, lit);
          e = { mesh };
          if (h.type === 'wreck') e.fire = true;
        }
        root.add(mesh); hazMeshes.set(h.id, e);
      }
      e.seen = true;
      e.mesh.position.set(h.x, 0, h.y); e.mesh.rotation.y = -(h.heading || 0);
      if (e.lamp) e.lamp.material = h.armed ? ((time * 4 + h.x) % 1 < 0.3 ? lampOn : lampOff) : lampArmed;
      if (e.sheen) { e.sheen.position.x = Math.sin(time * 0.9 + h.x) * 0.8; e.sheen.position.z = Math.cos(time * 0.7 + h.y) * 0.5; }
      if (e.fire && Math.random() < dt * 10) parts.emit(h.x + (Math.random() - 0.5), 0.9, h.y + (Math.random() - 0.5), 0, 1.5, 0, 0.8, 1.2, 1, Math.random() < 0.5 ? K.darkGrey : K.orange, 2, 0.5);
    }
    for (const [id, v] of hazMeshes) if (!v.seen) { root.remove(v.mesh); hazMeshes.delete(id); }

    for (const v of pickMeshes.values()) v.seen = false;
    for (const p of snap.pickups || []) {
      let e = pickMeshes.get(p.id);
      if (!e) { const mesh = new THREE.Mesh(geoPick[p.type] || geoPick.cash, lit); root.add(mesh); e = { mesh }; pickMeshes.set(p.id, e); }
      e.seen = true;
      e.mesh.visible = p.active !== false;
      e.mesh.position.set(p.x, 1.2 + Math.sin(time * 3 + p.x) * 0.15, p.y); e.mesh.rotation.y = time * 1.5;
    }
    for (const [id, v] of pickMeshes) if (!v.seen) { root.remove(v.mesh); pickMeshes.delete(id); }
  }

  // burning wreck: flames licking out of the shell, a thick dark column and drifting embers; ages with the wreck timer
  const wreckAge = new Map();
  function wreckFx(car, p, dt) {
    const age = (wreckAge.get(car.id) || 0) + dt; wreckAge.set(car.id, age);
    const fade = age < 25 ? 1 : Math.max(0.25, 1 - (age - 25) / 25);
    if (rnd() < dt * 46 * fade) parts.emit(p.x + (rnd() - 0.5) * 2.4, 0.7 + rnd() * 0.6, p.y + (rnd() - 0.5) * 1.6, (rnd() - 0.5) * 0.8, 2.6 + rnd() * 2.2, (rnd() - 0.5) * 0.8, 0.5 + rnd() * 0.4, 1.3 + rnd() * 0.8, -0.8, rnd() < 0.45 ? K.orange : rnd() < 0.5 ? K.yellow : K.red, 1.5, 0.4);
    if (rnd() < dt * 22 * fade) parts.emit(p.x + (rnd() - 0.5) * 1.6, 1.2, p.y + (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.6, 2.2 + rnd() * 1.8, (rnd() - 0.5) * 1.6, 2.2 + rnd() * 1.4, 1.6 + rnd(), 2.4, rnd() < 0.7 ? K.black : K.darkGrey, 1.1, 0.5);
    if (rnd() < dt * 5 * fade) parts.emit(p.x + (rnd() - 0.5) * 2, 1.0, p.y + (rnd() - 0.5) * 2, (rnd() - 0.5) * 6, 5 + rnd() * 4, (rnd() - 0.5) * 6, 0.9 + rnd() * 0.6, 0.45, 0, K.yellow, -9, 0.3);
  }
  // damaged cars: smoke from the worst zone, sparks from missing panels, flames when nearly dead
  function damageFx(car, p, c, s, dt) {
    const d = car.dmg; let worst = 0, wz = 0;
    for (let i = 0; i < 4; i++) if (d[i] > worst) { worst = d[i]; wz = i; }
    if (worst < 0.35) return;
    const az = wz === 0 ? 0 : wz === 2 ? Math.PI : wz === 1 ? Math.PI / 2 : -Math.PI / 2, a = p.heading + az, ox = p.x + Math.cos(a) * 1.5, oz = p.y + Math.sin(a) * 1.5;
    if (rnd() < dt * 14 * worst) parts.emit(ox, 0.9, oz, -c * 2 + (rnd() - 0.5), 1.3, -s * 2 + (rnd() - 0.5), 0.9, 1.1, 1.5, worst > 0.7 ? K.black : K.darkGrey, 0.8, 0.8);
    if (worst > 0.55 && rnd() < dt * 7 * worst) parts.emit(ox, 0.5, oz, (rnd() - 0.5) * 6, 1 + rnd() * 3, (rnd() - 0.5) * 6, 0.25 + rnd() * 0.2, 0.45, 0, rnd() < 0.5 ? K.yellow : K.orange, -10);
  }
  function nitroFx(car, p, c, s, dt) {
    const rx = -s, rz = c;
    for (const side of [-0.6, 0.6]) {
      if (rnd() > 0.9) continue;
      const ex = p.x - c * 2.7 + rx * side, ez = p.y - s * 2.7 + rz * side;
      parts.emit(ex, 0.5, ez, -c * 16 + (rnd() - 0.5) * 2, 0.2 + rnd() * 0.5, -s * 16 + (rnd() - 0.5) * 2, 0.16 + rnd() * 0.1, 0.8, 0.8, rnd() < 0.5 ? K.sky : K.white, 0, 3);
      if (rnd() < 0.4) parts.emit(ex, 0.5, ez, -c * 9, 0.3, -s * 9, 0.22, 1.0, 1.5, K.sky, 0, 3);
    }
  }
  function carFx(snap, dt, getPose) {
    for (const car of snap.cars) {
      const p = poseOf(car, getPose), c = Math.cos(p.heading), s = Math.sin(p.heading);
      if (car.wrecked) { skidLast.set(car.id, null); wreckFx(car, p, dt); continue; }
      if (car.nitroOn) nitroFx(car, p, c, s, dt);
      if (car.dmg) damageFx(car, p, c, s, dt);
      const hx = p.x + c * 1.3, hz = p.y + s * 1.3;
      if (car.burning && Math.random() < dt * 40) parts.emit(hx + (Math.random() - 0.5) * 0.6, 0.9, hz + (Math.random() - 0.5) * 0.6, 0, 2.2, 0, 0.45, 0.9, -0.5, Math.random() < 0.5 ? K.orange : Math.random() < 0.5 ? K.yellow : K.red, 1, 0.3);
      if ((car.smoke || car.burning) && Math.random() < dt * 25) parts.emit(hx, 1.0, hz, -c * 2 + (Math.random() - 0.5), 1.4, -s * 2 + (Math.random() - 0.5), 0.9, 1.2, 1.6, car.burning ? K.black : K.darkGrey, 0.8, 0.8);
      if (car.oiled && Math.random() < dt * 20) parts.emit(p.x - c * 1.3 + (Math.random() - 0.5) * 1.6, 0.15, p.y - s * 1.3 + (Math.random() - 0.5) * 1.6, 0, 0.8, 0, 0.5, 0.8, 0, Math.random() < 0.5 ? K.lavender : K.navy, 0, 0.5);
      if (car.tyresPopped && Math.random() < dt * 20) parts.emit(p.x - c * 1.2, 0.2, p.y - s * 1.2, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, 0.25, 0.4, 0, K.yellow, -10);
      // skid marks: rear axle ± track when sliding laterally / braking-locked / popped tyre
      const rx = -s, rz = c; // right normal in (x,z)
      const lat = (car.vx || 0) * rx + (car.vy || 0) * rz;
      const hasDyn = car.slip !== undefined;
      const sliding = (Math.abs(lat) > 3.2 && car.speed > 8) || (car.tyresPopped && car.speed > 4)
        || (hasDyn && car.speed > 6 && (car.slip > 0.62 || car.braking > 0.93 || car.wheelspin > 0.25));
      if (skid && sliding) {
        const bx = p.x - c * 1.3, bz = p.y - s * 1.3, tw = 0.8;
        const L = [bx - rx * tw, bz - rz * tw], R = [bx + rx * tw, bz + rz * tw];
        const last = skidLast.get(car.id);
        if (last) { skids.addSegment(last.l[0], last.l[1], L[0], L[1]); skids.addSegment(last.r[0], last.r[1], R[0], R[1]); }
        skidLast.set(car.id, { l: L, r: R });
        if (Math.random() < dt * 20) parts.emit(bx, 0.2, bz, (Math.random() - 0.5) * 1.5, 0.5, (Math.random() - 0.5) * 1.5, 0.6, 0.9, 1.5, K.lightGrey, 0.5, 1);
      } else skidLast.set(car.id, null);
      if (hasDyn) dynFx(car, p, c, s, dt);
    }
  }

  // exhaust / backfire / tyre smoke / dust, driven by the extended snapshot fields (slip, wheelspin, throttle, rpm, surface, ...)
  const lastThr = new Map();
  function dynFx(car, p, c, s, dt) {
    const rx = -s, rz = c;
    const rear = (f, side) => [p.x - c * f + rx * side, p.y - s * f + rz * side];
    const prevThr = lastThr.get(car.id) ?? 0; lastThr.set(car.id, car.throttle || 0);
    // exhaust puffs (two tips) — thicker under load
    if (Math.random() < dt * (6 + 30 * (car.throttle || 0))) {
      const [ex, ez] = rear(2.5, (Math.random() < 0.5 ? 0.62 : -0.62));
      parts.emit(ex, 0.45, ez, -c * 3 + (Math.random() - 0.5), 0.3, -s * 3 + (Math.random() - 0.5), 0.5, 0.55, 1.2, car.throttle > 0.6 ? K.darkGrey : K.lightGrey, 0.6, 1.2);
    }
    // backfire on lift-off at high rpm / on upshift
    if ((prevThr > 0.7 && (car.throttle || 0) < 0.2 && (car.rpm || 0) > 0.6) || (car.shifted && Math.random() < 0.6)) {
      for (const sd of [0.62, -0.62]) { const [ex, ez] = rear(2.6, sd); parts.emit(ex, 0.45, ez, -c * 6, 0.4, -s * 6, 0.12, 1.3, 0, K.orange, 0, 3); parts.emit(ex, 0.45, ez, -c * 4, 0.3, -s * 4, 0.09, 0.8, 0, K.yellow, 0, 3); }
    }
    if (car.limiter && Math.random() < dt * 20) { const [ex, ez] = rear(2.6, Math.random() < 0.5 ? 0.62 : -0.62); parts.emit(ex, 0.45, ez, -c * 5, 0.3, -s * 5, 0.08, 1, 0, K.orange, 0, 3); }
    // tyre smoke: wheelspin, lock-up, drift
    const smoke = Math.max(car.wheelspin || 0, car.slip > 0.5 ? car.slip : 0, car.braking > 0.93 ? 0.8 : 0);
    if (smoke > 0.2 && car.speed > 3 && Math.random() < dt * 60 * smoke) {
      const side = Math.random() < 0.5 ? 0.85 : -0.85, [wx, wz] = rear(1.45, side);
      parts.emit(wx, 0.25, wz, -c * 1.5 + (Math.random() - 0.5) * 2, 0.8, -s * 1.5 + (Math.random() - 0.5) * 2, 0.9, 1.3, 2.2, K.lightGrey, 0.6, 1);
    }
    // dust / gravel kick-up off the tarmac
    if ((car.surface === 'dirt' || car.surface === 'kerb') && car.speed > 6 && Math.random() < dt * 45) {
      const side = Math.random() < 0.5 ? 0.9 : -0.9, [wx, wz] = rear(1.4, side);
      parts.emit(wx, 0.2, wz, -c * 3 + (Math.random() - 0.5) * 3, 1.2 + Math.random(), -s * 3 + (Math.random() - 0.5) * 3, 0.8, 1.1, 2, car.surface === 'dirt' ? K.sand : K.lightGrey, 0.5, 1.2);
    }
    if (car.surface === 'puddle' && car.speed > 8 && Math.random() < dt * 40) {
      const [wx, wz] = rear(1.4, Math.random() < 0.5 ? 0.9 : -0.9);
      parts.emit(wx, 0.15, wz, (Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0.5, 0, K.sky, -9);
    }
  }

  function update(snap, dt, getPose, uScale = 600) {
    if (!snap) return;
    time += dt;
    handleEvents(snap, getPose);
    syncObjects(snap, dt);
    carFx(snap, dt, getPose);
    // tracers
    let n = 0;
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt; t.d += 420 * dt;
        const a = Math.max(0, t.d - 7), b = Math.min(t.len, t.d);
        if (t.life > 0 && b > a) {
          trPos[n * 6] = t.x + t.dx * a; trPos[n * 6 + 1] = t.y; trPos[n * 6 + 2] = t.z + t.dz * a;
          trPos[n * 6 + 3] = t.x + t.dx * b; trPos[n * 6 + 4] = t.y; trPos[n * 6 + 5] = t.z + t.dz * b;
          n++;
        }
      }
    }
    trGeo.setDrawRange(0, n * 2);
    trGeo.attributes.position.needsUpdate = true;
    // explosions: expanding, rising fireballs that cool white -> yellow -> orange -> red -> smoke grey
    for (const e of explosions) {
      if (!e.m.visible) continue;
      e.t += dt;
      const k = e.t / e.dur;
      if (k >= 1) { e.m.visible = false; continue; }
      const grow = 1 - Math.pow(1 - Math.min(1, k * 1.8), 2);
      const sc = e.r * 0.8 * (0.2 + 0.8 * grow) * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3 * 0.5);
      e.m.scale.set(sc, sc * (0.78 + 0.3 * k), sc);
      e.m.position.y = e.y0 + e.rise * k;
      e.m.rotation.y = e.spin + k * 2;
      const f = Math.min(3.999, k * 4.2), i0 = f | 0, a = f - i0, c0 = FIRE_RAMP[i0], c1 = FIRE_RAMP[i0 + 1];
      e.mat.color.setRGB(c0[0] + (c1[0] - c0[0]) * a, c0[1] + (c1[1] - c0[1]) * a, c0[2] + (c1[2] - c0[2]) * a);
      e.mat.opacity = 0.92 * Math.pow(1 - k, 0.7);
    }
    for (const e of rings) {
      if (!e.m.visible) continue;
      e.t += dt;
      const k = e.t / e.dur;
      if (k >= 1) { e.m.visible = false; continue; }
      e.m.scale.setScalar(e.r * (0.1 + 0.9 * (1 - Math.pow(1 - k, 3))));
      e.mat.opacity = 0.85 * Math.pow(1 - k, 1.6);
    }
    runLater(dt);
    debris.update(dt);
    parts.update(dt, uScale);
  }

  function dispose() {
    parent.remove(root);
    skids.dispose(); parts.dispose(); debris.dispose();
    ringGeo.dispose(); rings.forEach((r) => r.mat.dispose()); scorchGeo.dispose(); scorchMat.dispose(); scorchMesh.dispose();
    for (const g of shared) g.dispose();
    explosions.forEach((e) => e.mat.dispose());
    lit.dispose(); trMat.dispose(); [lampOn, lampOff, lampArmed, ...puddleMats].forEach((m) => m.dispose()); 
    disposeObject(root);
  }
  return { group: root, particles: parts, skids, debris, handleEvents, update, dispose, wrapAngle, explode, carIds };
}
