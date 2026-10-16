// Procedural spike hardware for the PBR cars: front spike rack, rear spike array and spiked wheel hubs, 2 tiers
// (steel; tier 2 longer with glowing plasma tips). Layout is pure and node-safe; geometry is merged per set.
// Car-local frame: +X forward, +Y up, +Z right.
import * as THREE from 'three';
import { mergeGeo, xf, roundedBox } from './geo.js';

const SHAPE = {
  hammer: { front: { x: 2.66, y: 0.5, hw: 0.95, n: 7 }, rear: { x: -2.68, y: 0.72, hw: 0.8, n: 5 } },
  wasp: { front: { x: 2.66, y: 0.44, hw: 0.9, n: 5 }, rear: { x: -2.68, y: 0.68, hw: 0.82, n: 5 } },
  bulwark: { front: { x: 3.06, y: 0.56, hw: 1.1, n: 9 }, rear: { x: -3.0, y: 0.62, hw: 0.95, n: 5 } },
};
export const SPIKE_LEN = [0, 0.34, 0.52];
/** Pure: spike list for one zone ('front' | 'rear') at a tier: [{ p, d, len, r }] (d = unit direction, +X forward). Empty at tier 0. */
export function spikeLayout(carId, zone, tier) {
  if (!tier) return [];
  const c = (SHAPE[carId] || SHAPE.hammer)[zone];
  const sgn = zone === 'front' ? 1 : -1, out = [];
  for (let i = 0; i < c.n; i++) {
    const u = c.n === 1 ? 0 : (i / (c.n - 1)) * 2 - 1, splay = u * 0.34, lift = 0.1 + Math.abs(u) * 0.05;
    const d = new THREE.Vector3(sgn * Math.cos(splay), lift, Math.sin(splay)).normalize();
    out.push({ p: [c.x, c.y + (zone === 'rear' ? 0.02 * Math.abs(u) : 0), u * c.hw], d: [d.x, d.y, d.z], len: SPIKE_LEN[tier] * (zone === 'rear' ? 0.9 : 1) * (1 - Math.abs(u) * 0.15), r: 0.05 });
  }
  return out;
}
/** Pure: wheel hub spikes (wheel-local, axle Z, outer face +Z): [{ p, d, len, r }]. */
export function wheelSpikeLayout(tier) {
  if (!tier) return [];
  const L = tier === 2 ? 1.5 : 1, out = [{ p: [0, 0, 0.24], d: [0, 0, 1], len: 0.2 * L, r: 0.05 }];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, tilt = 0.55; out.push({ p: [Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.215], d: [Math.cos(a) * Math.sin(tilt), Math.sin(a) * Math.sin(tilt), Math.cos(tilt)], len: 0.15 * L, r: 0.032 }); }
  return out;
}

const ensure = (g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
const Y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _d = new THREE.Vector3();
/** Cone pointing along d from p: returns { shaft (steel), tip (plasma at tier 2) } geometries. */
function spikeGeo(s, tipGlow) {
  _d.set(s.d[0], s.d[1], s.d[2]); _q.setFromUnitVectors(Y, _d);
  const split = tipGlow ? 0.62 : 1, shaftLen = s.len * split, tipLen = s.len * (1 - split), rTip = s.r * (1 - split * 0.62);
  // tier 1: one steel cone; tier 2: steel frustum + glowing plasma tip
  const steel = tipGlow ? new THREE.CylinderGeometry(rTip, s.r, shaftLen, 10, 1, false) : new THREE.ConeGeometry(s.r, shaftLen, 10, 1, false);
  steel.translate(0, shaftLen / 2, 0); steel.applyQuaternion(_q); steel.translate(s.p[0], s.p[1], s.p[2]);
  let tip = null;
  if (tipGlow) { tip = new THREE.ConeGeometry(rTip, tipLen, 10, 1, false); tip.translate(0, shaftLen + tipLen / 2, 0); tip.applyQuaternion(_q); tip.translate(s.p[0], s.p[1], s.p[2]); }
  return { steel: ensure(steel), tip: tip && ensure(tip) };
}
function setGeo(spikes, tier, extraSteel = []) {
  const steel = [...extraSteel], tips = [];
  for (const s of spikes) { const g = spikeGeo(s, tier === 2); steel.push(g.steel); if (g.tip) tips.push(g.tip); }
  return { steel: steel.length ? mergeGeo(steel) : null, tip: tips.length ? mergeGeo(tips) : null };
}
/** Front rack / rear array geometry at a tier: spikes on a steel mounting bar with end brackets. */
export function buildZoneSpikes(carId, zone, tier) {
  if (!tier) return { steel: null, tip: null };
  const c = (SHAPE[carId] || SHAPE.hammer)[zone], sgn = zone === 'front' ? 1 : -1;
  const bar = ensure(roundedBox(0.1, 0.12, c.hw * 2 + 0.16, 0.035, 2)); xf(bar, { pos: [c.x - sgn * 0.02, c.y - 0.01, 0] });
  const brackets = [-1, 1].map((e) => { const b = ensure(roundedBox(0.34, 0.09, 0.07, 0.02, 1)); xf(b, { pos: [c.x - sgn * 0.17, c.y - 0.01, e * (c.hw + 0.02)] }); return b; });
  return setGeo(spikeLayout(carId, zone, tier), tier, [bar, ...brackets]);
}
export function buildWheelSpikes(tier) { return setGeo(wheelSpikeLayout(tier), tier, tier ? [ensure(new THREE.CylinderGeometry(0.075, 0.085, 0.05, 16).rotateX(Math.PI / 2).translate(0, 0, 0.235))] : []); }

/**
 * Attach spikes to a car. api.set({ front, rear, wheels }) swaps geometry only when a tier changes; sync(lost, dmg) handles
 * part loss (bumper off => rack gone), bend under damage, and copies the wheel matrices (so the hubs really spin).
 */
export function createSpikeRig({ carId, parent, wheelParent, steelMat, glowMat, wheelRim, wheelCount = 4 }) {
  const group = new THREE.Group(); group.name = 'spike-gear'; parent.add(group);
  const zones = {};
  for (const z of ['front', 'rear']) { const g = new THREE.Group(); g.visible = false; group.add(g); zones[z] = { g, tier: 0, meshes: [] }; }
  const wheel = { tier: 0, steel: null, tip: null };
  const tier = { front: 0, rear: 0, wheels: 0 };
  const dispose = (list) => { for (const m of list) { m.parent && m.parent.remove(m); m.geometry.dispose(); if (m.isInstancedMesh) m.dispose(); } };
  const mkMesh = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = false; m.frustumCulled = false; return m; };
  function setZone(z, t) {
    const Z = zones[z]; if (Z.tier === t) return; Z.tier = t; dispose(Z.meshes); Z.meshes = [];
    const geo = buildZoneSpikes(carId, z, t);
    if (geo.steel) { const m = mkMesh(geo.steel, steelMat, `spikes-${z}`); Z.g.add(m); Z.meshes.push(m); }
    if (geo.tip) { const m = mkMesh(geo.tip, glowMat, `spikes-${z}-glow`); Z.g.add(m); Z.meshes.push(m); }
    Z.g.visible = t > 0;
  }
  function setWheels(t) {
    if (wheel.tier === t) return; wheel.tier = t;
    for (const k of ['steel', 'tip']) if (wheel[k]) { dispose([wheel[k]]); wheel[k] = null; }
    const geo = buildWheelSpikes(t);
    const mk = (g, mat, name) => { const im = new THREE.InstancedMesh(g, mat, wheelCount); im.name = name; im.castShadow = false; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); (wheelParent || parent).add(im); return im; };
    if (geo.steel) wheel.steel = mk(geo.steel, steelMat, 'spikes-wheels');
    if (geo.tip) wheel.tip = mk(geo.tip, glowMat, 'spikes-wheels-glow');
  }
  const tmp = new THREE.Matrix4();
  return {
    group, tier,
    set(sp) {
      const s = sp || {}; tier.front = s.front | 0; tier.rear = s.rear | 0; tier.wheels = s.wheels | 0;
      setZone('front', tier.front); setZone('rear', tier.rear); setWheels(tier.wheels);
    },
    /** lost = part-loss map; dmg = per-zone damage [front,right,rear,left]; far hides everything. */
    sync(lost, dmg, far) {
      const f = zones.front, r = zones.rear;
      f.g.visible = f.tier > 0 && !lost.bumperF && !far; r.g.visible = r.tier > 0 && !lost.bumperR && !far;
      const df = dmg ? dmg[0] : 0, dr = dmg ? dmg[2] : 0;
      f.g.rotation.z = -Math.min(0.45, df * 0.7); f.g.scale.x = 1 - Math.min(0.3, df * 0.4);     // spikes bend / shorten as the nose takes damage
      r.g.rotation.z = Math.min(0.45, dr * 0.7); r.g.scale.x = 1 - Math.min(0.3, dr * 0.4);
      for (const im of [wheel.steel, wheel.tip]) if (im) {
        im.visible = !far;
        for (let i = 0; i < wheelCount; i++) { wheelRim.getMatrixAt(i, tmp); im.setMatrixAt(i, tmp); }
        im.instanceMatrix.needsUpdate = true;
      }
    },
    meshes() { return [...zones.front.meshes, ...zones.rear.meshes, wheel.steel, wheel.tip].filter(Boolean); },
    dispose() { dispose(zones.front.meshes); dispose(zones.rear.meshes); dispose([wheel.steel, wheel.tip].filter(Boolean)); },
  };
}
