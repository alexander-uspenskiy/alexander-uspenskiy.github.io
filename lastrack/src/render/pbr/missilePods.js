// Visible missile hardware for the PBR cars: tube box (rocket), sleek flank pods with seeker domes (guided), heavy launch
// rails (terminator). Layout/ammo logic is pure and node-safe; geometry is merged (one hardware mesh + one instanced
// missile mesh per weapon type). Car-local frame: +X forward, +Y up, +Z right.
import * as THREE from 'three';
import { mergeGeo, xf, roundedBox } from './geo.js';

export const HARDWARE = Object.freeze(['rocket', 'guided', 'terminator']);
/** where each hardware lives: 'roof' pieces go with the roof turret when it is torn off, 'flank' pods with the side armour. */
export const HARDWARE_ZONE = Object.freeze({ rocket: 'roof', guided: 'flank', terminator: 'roof' });

// tubes per car and weapon (2..8): the rocket box is a boxy grid of many missiles
const SLOTS = {
  hammer: { rocket: 8, guided: 4, terminator: 2 },
  wasp: { rocket: 6, guided: 2, terminator: 2 },
  bulwark: { rocket: 8, guided: 4, terminator: 2 },
};
export function hardwareSlots(carId, weaponId) { return ((SLOTS[carId] || SLOTS.hammer)[weaponId]) || 0; }
/** Pure: how many missiles sit in the tubes for `ammo` rounds left (empty tubes once the ammo is gone). */
export function visibleTubes(carId, weaponId, ammo) { return Math.max(0, Math.min(hardwareSlots(carId, weaponId), Math.floor(ammo) || 0)); }

const rotZ = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
function paint(g, hex) {
  const n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const colored = (list) => mergeGeo(list, [{ name: 'color', size: 3 }]);
const cylX = (r0, r1, len, seg = 14) => { const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateZ(-Math.PI / 2); return g; };   // r0 at -X end, r1 at +X end
const coneX = (r, len, seg = 14) => { const g = new THREE.ConeGeometry(r, len, seg); g.rotateZ(-Math.PI / 2); return g; };
const mouth = (x, y, z, r) => { const g = new THREE.CylinderGeometry(r, r, 0.03, 16); g.rotateZ(-Math.PI / 2); xf(g, { pos: [x, y, z] }); return paint(g, 0x07080a); };

/** One missile (centred on the origin, nose to +X) per weapon type, vertex coloured. */
function missileGeo(weaponId) {
  const p = [];
  if (weaponId === 'rocket') {
    const b = cylX(0.075, 0.075, 0.62); xf(b, { pos: [-0.04, 0, 0] }); p.push(paint(b, 0xc4c9cf));
    const n = coneX(0.075, 0.2); xf(n, { pos: [0.37, 0, 0] }); p.push(paint(n, 0xff7a1a));
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const f = roundedBox(0.16, 0.012, 0.14, 0.004, 1); xf(f, { pos: [-0.3, Math.sin(r) * 0.09, Math.cos(r) * 0.09], rot: [r, 0, 0] }); p.push(paint(f, 0x2a2d33)); }
  } else if (weaponId === 'guided') {
    const b = cylX(0.08, 0.08, 0.7); xf(b, { pos: [-0.05, 0, 0] }); p.push(paint(b, 0xe3e9f0));
    const band = cylX(0.085, 0.085, 0.07); xf(band, { pos: [-0.22, 0, 0] }); p.push(paint(band, 0x25d8ff));
    const dome = new THREE.SphereGeometry(0.08, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.rotateZ(-Math.PI / 2); xf(dome, { pos: [0.3, 0, 0] }); p.push(paint(dome, 0x25d8ff));
    for (const r of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) { const f = roundedBox(0.2, 0.012, 0.15, 0.004, 1); xf(f, { pos: [-0.3, Math.sin(r) * 0.09, Math.cos(r) * 0.09], rot: [r, 0, 0] }); p.push(paint(f, 0x30343b)); }
  } else {
    const b = cylX(0.16, 0.16, 1.2, 18); xf(b, { pos: [-0.1, 0, 0] }); p.push(paint(b, 0x4a4f57));
    const stripe = cylX(0.165, 0.165, 0.1, 18); xf(stripe, { pos: [-0.35, 0, 0] }); p.push(paint(stripe, 0xffc21a));
    const n = coneX(0.16, 0.45, 18); xf(n, { pos: [0.725, 0, 0] }); p.push(paint(n, 0xff2b2b));
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const f = roundedBox(0.38, 0.02, 0.26, 0.006, 1); xf(f, { pos: [-0.58, Math.sin(r) * 0.2, Math.cos(r) * 0.2], rot: [r, 0, 0] }); p.push(paint(f, 0x2a2d33)); }
    const nz = cylX(0.1, 0.13, 0.12, 14); xf(nz, { pos: [-0.74, 0, 0] }); p.push(paint(nz, 0x1a1c20));
  }
  return colored(p);
}

/**
 * Build the hardware for one weapon on one car. Returns { hw (static geometry), missile (one missile), slots: [{ pos, rot, nose }] }.
 * `nose` is the muzzle point of the tube in car-local space (for launch flashes).
 */
export function buildHardware(carId, weaponId) {
  const n = hardwareSlots(carId, weaponId);
  const bulk = carId === 'bulwark', hw = [], slots = [];
  const metal = 0x59606a, dark = 0x2c3037, trim = 0x8b939e;
  if (weaponId === 'rocket') {
    const cols = n >= 8 ? 4 : n >= 6 ? 3 : 2, rows = n / cols, pitch = 0.22, tilt = 0.12;
    const cx = bulk ? -1.95 : -1.85, cy = bulk ? 1.3 : 1.2, w = cols * pitch + 0.1, h = rows * pitch + 0.1, len = 0.7;
    const parts = [];
    const box = roundedBox(len, h, w, 0.045, 3); parts.push(paint(box, metal));
    const lid = roundedBox(len * 0.9, 0.025, w * 0.9, 0.01, 1); xf(lid, { pos: [0, h / 2 + 0.005, 0] }); parts.push(paint(lid, trim));
    const rib = roundedBox(0.06, h + 0.04, w + 0.04, 0.012, 1); xf(rib, { pos: [len / 2 - 0.05, 0, 0] }); parts.push(paint(rib, dark));
    for (const z of [-0.25, 0.25]) { const st = roundedBox(0.16, 0.2, 0.08, 0.02, 1); xf(st, { pos: [-0.05, -h / 2 - 0.06, z * (w / 0.5) * 0.8] }); parts.push(paint(st, dark)); }
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols), col = i % cols, y = (row - (rows - 1) / 2) * pitch, z = (col - (cols - 1) / 2) * pitch;
      parts.push(mouth(len / 2 + 0.008, y, z, 0.092));
      const [rx, ry] = rotZ(0.02, y, tilt), [nx, ny] = rotZ(len / 2 + 0.1, y, tilt);
      slots.push({ pos: [cx + rx, cy + ry, z], rot: tilt, nose: [cx + nx, cy + ny, z] });
    }
    const g = colored(parts); xf(g, { pos: [cx, cy, 0], rot: [0, 0, tilt] }); hw.push(g);
  } else if (weaponId === 'guided') {
    const per = n / 2, tilt = 0.05, len = 1.05;
    for (const s of [1, -1]) {
      const cx = -0.95, cy = 1.2, cz = s * (bulk ? 1.12 : 1.0), w = per * 0.2 + 0.06;
      const parts = [];
      const body = roundedBox(len, 0.24, w, 0.1, 4); parts.push(paint(body, 0x3d424a));
      const spine = roundedBox(len * 0.8, 0.03, w * 0.55, 0.012, 1); xf(spine, { pos: [-0.04, 0.125, 0] }); parts.push(paint(spine, 0x25d8ff));
      const py = roundedBox(0.36, 0.22, 0.08, 0.02, 1); xf(py, { pos: [-0.05, -0.2, 0] }); parts.push(paint(py, dark));
      const cap = roundedBox(0.1, 0.2, w + 0.02, 0.04, 2); xf(cap, { pos: [len / 2 - 0.02, 0, 0] }); parts.push(paint(cap, 0x23272d));
      for (let k = 0; k < per; k++) {
        const z = (k - (per - 1) / 2) * 0.2;
        parts.push(mouth(len / 2 + 0.03, 0, z, 0.085));
        const [rx, ry] = rotZ(0.1, 0, tilt), [nx, ny] = rotZ(len / 2 + 0.12, 0, tilt);
        slots.push({ pos: [cx + rx, cy + ry, cz + z], rot: tilt, nose: [cx + nx, cy + ny, cz + z] });
      }
      const g = colored(parts); xf(g, { pos: [cx, cy, cz], rot: [0, s * 0.03, tilt] }); hw.push(g);
    }
  } else {
    const cy = bulk ? 1.85 : 1.52, cx = -1.0, zs = bulk ? 1.0 : 0.62, len = 1.95;
    for (let k = 0; k < n; k++) {
      const z = (k === 0 ? 1 : -1) * zs, parts = [];
      const rail = roundedBox(len, 0.07, 0.2, 0.025, 2); xf(rail, { pos: [0, -0.2, 0] }); parts.push(paint(rail, metal));
      for (const x of [-0.62, 0.05, 0.7]) {
        const clamp = roundedBox(0.1, 0.22, 0.34, 0.03, 2); xf(clamp, { pos: [x, -0.1, 0] }); parts.push(paint(clamp, dark));
        const strut = roundedBox(0.12, 0.36, 0.1, 0.02, 1); xf(strut, { pos: [x, -0.4, 0] }); parts.push(paint(strut, dark));
      }
      const guide = roundedBox(len * 0.96, 0.03, 0.3, 0.012, 1); xf(guide, { pos: [0, -0.2, 0] }); parts.push(paint(guide, trim));
      const stop = roundedBox(0.1, 0.3, 0.3, 0.03, 2); xf(stop, { pos: [-len / 2 + 0.05, -0.05, 0] }); parts.push(paint(stop, 0x1a1c20));
      const g = colored(parts); xf(g, { pos: [cx, cy, z] }); hw.push(g);
      slots.push({ pos: [cx - 0.1, cy, z], rot: 0, nose: [cx + 1.15, cy, z] });
    }
  }
  return { hw: mergeGeo(hw, [{ name: 'color', size: 3 }]), missile: missileGeo(weaponId), slots };
}

/**
 * Attach hardware management to a car: returns { sync(weapons, lost, far), setLoadout(weapons), flashAt(weaponId), dispose, group, drawCalls(), triCount() }.
 * sync() allocates nothing once a weapon's hardware exists.
 */
export function createMissileRig({ carId, parent, material, flashMat }) {
  const group = new THREE.Group(); group.name = 'missile-hardware'; parent.add(group);
  const by = {}, dummy = new THREE.Object3D();
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 10, 1, true), flashMat); flash.geometry.rotateZ(-Math.PI / 2); flash.geometry.translate(0.35, 0, 0); flash.visible = false; group.add(flash);
  let fr = 0, flashT = 0;
  function ensure(id) {
    let e = by[id]; if (e) return e;
    const b = buildHardware(carId, id);
    const hw = new THREE.Mesh(b.hw, material); hw.name = 'hw-' + id; hw.castShadow = false; hw.frustumCulled = false;
    const inst = new THREE.InstancedMesh(b.missile, material, Math.max(1, b.slots.length)); inst.name = 'missiles-' + id; inst.castShadow = false; inst.frustumCulled = false;
    b.slots.forEach((s, i) => { dummy.position.set(s.pos[0], s.pos[1], s.pos[2]); dummy.rotation.set(0, 0, s.rot); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
    inst.instanceMatrix.needsUpdate = true; inst.count = 0;
    const g = new THREE.Group(); g.add(hw, inst); g.visible = false; group.add(g);
    e = by[id] = { id, g, inst, slots: b.slots, ammo: -1, seen: 0, tris: (b.hw.index.count + 0) / 3, mtris: b.missile.index.count / 3 };
    return e;
  }
  return {
    group,
    /** weapons: [{ id, ammo }] (snapshot shape); lost: part-loss map; far: hide when the car is distant. */
    sync(weapons, lost, far, dt) {
      fr++;
      if (flashT > 0) { flashT -= dt || 0; if (flashT <= 0) flash.visible = false; }
      if (weapons) for (let i = 0; i < weapons.length; i++) {
        const w = weapons[i];
        if (HARDWARE_ZONE[w.id] === undefined) continue;
        const e = ensure(w.id); e.seen = fr;
        const n = visibleTubes(carId, w.id, w.ammo);
        if (e.ammo !== n) {
          if (e.ammo > n && e.ammo >= 0 && n < e.slots.length) {   // a round left its tube: flash at the emptied mouth
            const s = e.slots[n]; flash.position.set(s.nose[0], s.nose[1], s.nose[2]); flash.rotation.set(0, 0, s.rot); flash.visible = true; flashT = 0.09;
          }
          e.ammo = n; e.inst.count = n;
        }
      }
      for (const id in by) {
        const e = by[id], zone = HARDWARE_ZONE[id];
        e.g.visible = e.seen === fr && !far && !(zone === 'roof' ? lost.turret : (lost.doorL || lost.doorR));
      }
    },
    dispose() { for (const id in by) { by[id].g.children.forEach((m) => m.geometry.dispose()); } flash.geometry.dispose(); },
    drawCalls() { let n = 0; for (const id in by) if (by[id].g.visible) n += 2; return n; },
  };
}
