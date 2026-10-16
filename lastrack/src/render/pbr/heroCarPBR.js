// Futuristic armoured muscle car ("Hammer", PBR): smooth lofted body with clearcoat flake paint, carbon aero kit, brushed armour
// plates, tinted glass, emissive light strips + underglow, big rims with discs/calipers (brake heat), adaptive wing, twin-barrel
// roof turret, suspension, damage stages (dents, panel loss, sparks hooks, smoke/fire anchors), wet/dirt shader. Slice-only.
import * as THREE from 'three';
import { mergeGeo, xf, roundedBox, ribbon, tube, triCount, clamp, smoothstep, lerp } from './geo.js';
import { buildBodyGeometries, applyDents, buildCanopy, buildRoofPanel, canopyPoint, sectionAt, WHEELS, CAN_NU, CAN_NX } from './carBody.js';
import { flakeNormal, carbonMaps, treadNormal, brushedMaps, glowSprite } from './maps.js';

export const PBR_SPEC = Object.freeze({
  length: 5.3, width: 2.45, wheelR: WHEELS.radius, wheelW: WHEELS.width,
  turret: [-0.3, 1.53, 0], exhaust: [[-2.7, 0.46, 0.46], [-2.7, 0.46, -0.46]], thrusters: [[-2.76, 0.54, 0.84], [-2.76, 0.54, -0.84]], engine: [1.5, 1.0, 0], muzzle: [0.95, 1.62, 0],
});

// ------------------------------------------------------------------ pure look model (shared with tests)
export function damageLook(frac, wrecked) {
  const stage = wrecked ? 4 : frac < 0.15 ? 3 : frac < 0.3 ? 2 : frac < 0.7 ? 1 : 0;
  return { stage, hood: stage < 2, plates: stage < 3, smoke: stage === 2 || stage === 3, fire: stage === 3, charred: stage === 4, crush: stage === 4 ? 1 : stage === 3 ? 0.3 : 0, glass: stage < 3, lights: stage < 4 };
}
export const dentKey = (dmg, crush) => dmg.map((d) => Math.round(clamp(d, 0, 1) * 8)).join('') + ':' + Math.round(crush * 4);
/** Pure: brake-disc heat model (0..1): heats with braking power, cools with airflow. */
export function stepHeat(heat, braking, speed, dt) { return clamp(heat + braking * Math.min(1, speed / 30) * 0.9 * dt - (0.12 + speed * 0.004) * heat * dt, 0, 1); }
/** Pure: adaptive wing flap angle (rad): low-drag at speed, air-brake when braking, downforce in corners. */
export function wingAngle(speed, braking, lateral) { return clamp(0.12 + (1 - Math.min(1, speed / 55)) * 0.1 + Math.abs(lateral) * 0.012 + braking * 0.75, 0.05, 0.95); }

// ------------------------------------------------------------------ textures (shared, created lazily)
const _t = {};
function dataTex(data, w, h, { srgb = false, repeat = [1, 1] } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; t.userData = { shared: true };
  return t;
}
export function carTextures() {
  if (_t.flake) return _t;
  const carbon = carbonMaps(128), brushed = brushedMaps(128);
  _t.flake = dataTex(flakeNormal(256, 5), 256, 256, { repeat: [14, 30] });
  _t.carbonA = dataTex(carbon.albedo, 128, 128, { srgb: true, repeat: [5, 5] }); _t.carbonN = dataTex(carbon.normal, 128, 128, { repeat: [5, 5] }); _t.carbonR = dataTex(carbon.roughness, 128, 128, { repeat: [5, 5] });
  _t.brushN = dataTex(brushed.normal, 128, 128, { repeat: [3, 3] }); _t.brushR = dataTex(brushed.roughness, 128, 128, { repeat: [3, 3] });
  _t.tread = dataTex(treadNormal(256, 128), 256, 128, { repeat: [1, 1] });
  _t.glow = dataTex(glowSprite(64), 64, 64); _t.glow.wrapS = _t.glow.wrapT = THREE.ClampToEdgeWrapping; _t.glow.repeat.set(1, 1);
  return _t;
}

// ------------------------------------------------------------------ parts
function wheelParts() {
  const R = WHEELS.radius, W = WHEELS.width;
  // tyre: lathe around Y (axis), rotated so the axle is Z
  const prof = [[0.285, -0.2], [0.33, -0.222], [0.385, -0.215], [0.425, -0.17], [R - 0.004, -0.115], [R, -0.05], [R, 0.05], [R - 0.004, 0.115], [0.425, 0.17], [0.385, 0.215], [0.33, 0.222], [0.285, 0.2]].map(([r, y]) => new THREE.Vector2(r, y * (W / 0.44)));
  const tyre = new THREE.LatheGeometry(prof, 56); tyre.rotateX(Math.PI / 2);
  const tp = tyre.attributes.uv; for (let i = 0; i < tp.count; i++) tp.setXY(i, tp.getX(i) * 1, tp.getY(i));
  // rim: barrel + dish + 10 twin spokes + hub + lugs
  const parts = [];
  const barrel = new THREE.LatheGeometry([[0.27, -0.19], [0.285, -0.2], [0.292, -0.17], [0.265, -0.1], [0.255, 0], [0.265, 0.1], [0.292, 0.17], [0.285, 0.2], [0.27, 0.19]].map(([r, y]) => new THREE.Vector2(r, y)), 40); barrel.rotateX(Math.PI / 2); parts.push(barrel);
  const face = new THREE.LatheGeometry([[0.0, 0.215], [0.07, 0.212], [0.1, 0.2], [0.15, 0.19], [0.27, 0.19]].map(([r, y]) => new THREE.Vector2(r, y)), 40); face.rotateX(Math.PI / 2); parts.push(face);
  for (let k = 0; k < 10; k++) {
    const sh = new THREE.Shape(); sh.moveTo(0.05, -0.028); sh.lineTo(0.27, -0.045); sh.lineTo(0.27, 0.045); sh.lineTo(0.05, 0.028); sh.closePath();
    const sp = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 });
    xf(sp, { pos: [0, 0, 0.17] }); sp.rotateZ((k / 10) * Math.PI * 2); sp.deleteAttribute('uv'); parts.push(sp);
  }
  const hub = new THREE.CylinderGeometry(0.06, 0.07, 0.05, 20); hub.rotateX(Math.PI / 2); xf(hub, { pos: [0, 0, 0.225] }); parts.push(hub);
  for (let k = 0; k < 5; k++) { const lug = new THREE.CylinderGeometry(0.013, 0.013, 0.03, 6); lug.rotateX(Math.PI / 2); const a = (k / 5) * Math.PI * 2; xf(lug, { pos: [Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0.235] }); parts.push(lug); }
  const ensure = (g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
  const rim = mergeGeo(parts.map(ensure));
  // disc: ring with slots, lathe + notches as thin dark boxes omitted (heat shows on the face)
  const disc = new THREE.LatheGeometry([[0.12, -0.02], [0.3, -0.02], [0.3, 0.02], [0.12, 0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 40); disc.rotateX(Math.PI / 2); xf(disc, { pos: [0, 0, 0.0] });
  const hat = new THREE.CylinderGeometry(0.13, 0.13, 0.07, 24); hat.rotateX(Math.PI / 2); xf(hat, { pos: [0, 0, 0.04] });
  const discAll = mergeGeo([disc, ensure(hat)]);
  // caliper: wraps the top-front arc of the disc
  const cal = roundedBox(0.26, 0.17, 0.12, 0.03, 3); xf(cal, { pos: [0.1, 0.22, 0.0], rot: [0, 0, -0.35] });
  const cal2 = roundedBox(0.2, 0.05, 0.16, 0.018, 2); xf(cal2, { pos: [0.1, 0.16, 0.0], rot: [0, 0, -0.35] });
  return { tyre, rim, disc: discAll, caliper: mergeGeo([cal, cal2]) };
}

function carbonKit() {
  const parts = [];
  const splitter = roundedBox(0.7, 0.03, 1.95, 0.012, 3); xf(splitter, { pos: [2.55, 0.2, 0] }); parts.push(splitter);
  const noseLip = roundedBox(0.1, 0.06, 1.5, 0.02, 2); xf(noseLip, { pos: [2.78, 0.22, 0], rot: [0, 0, -0.2] }); parts.push(noseLip);
  for (const sd of [1, -1]) { const intake = roundedBox(0.26, 0.1, 0.3, 0.03, 2); xf(intake, { pos: [2.4, 0.4, sd * 0.78], rot: [0, -sd * 0.5, 0] }); parts.push(intake); }
  for (const s of [1, -1]) {
    const canard = roundedBox(0.32, 0.025, 0.22, 0.01, 2); xf(canard, { pos: [2.25, 0.36, s * 0.98], rot: [s * 0.15, -s * 0.2, 0.12] }); parts.push(canard);
    const skirt = roundedBox(2.5, 0.07, 0.1, 0.025, 3); xf(skirt, { pos: [0.1, 0.3, s * 1.12] }); parts.push(skirt);
    const skirt2 = roundedBox(2.3, 0.025, 0.2, 0.01, 2); xf(skirt2, { pos: [0.1, 0.27, s * 1.1] }); parts.push(skirt2);
    const mirror = roundedBox(0.16, 0.1, 0.2, 0.04, 3); xf(mirror, { pos: [0.85, 1.03, s * 1.1], rot: [0, s * 0.4, 0] }); parts.push(mirror);
    const stalk = roundedBox(0.04, 0.06, 0.18, 0.015, 2); xf(stalk, { pos: [0.88, 0.97, s * 1.0] }); parts.push(stalk);
    const endplate = roundedBox(0.5, 0.34, 0.025, 0.012, 2); xf(endplate, { pos: [-2.5, 1.32, s * 0.98] }); parts.push(endplate);
    const strut = roundedBox(0.08, 0.34, 0.05, 0.02, 2); xf(strut, { pos: [-2.38, 1.12, s * 0.5] }); parts.push(strut);
  }
  const diffuser = roundedBox(0.5, 0.05, 1.7, 0.015, 3); xf(diffuser, { pos: [-2.6, 0.3, 0], rot: [0, 0, 0.22] }); parts.push(diffuser);
  for (let k = -3; k <= 3; k++) { const fin = roundedBox(0.5, 0.14, 0.02, 0.008, 1); xf(fin, { pos: [-2.62, 0.34, k * 0.24], rot: [0, 0, 0.22] }); parts.push(fin); }
  const roof = roundedBox(0.04, 0.04, 0.04, 0.01, 1); parts.push(roof);
  const lip = roundedBox(0.3, 0.025, 1.7, 0.01, 2); xf(lip, { pos: [-2.42, 1.27, 0], rot: [0, 0, 0.1] }); parts.push(lip);   // fixed wing main plane
  // sharp front: angular wedge bumper + carbon frame around the intake
  const sh = new THREE.Shape(); sh.moveTo(2.28, -0.84); sh.lineTo(2.74, -0.52); sh.lineTo(2.74, 0.52); sh.lineTo(2.28, 0.84); sh.closePath();
  const wedge = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }); wedge.rotateX(-Math.PI / 2); wedge.deleteAttribute('uv'); xf(wedge, { pos: [0, 0.31, 0] }); parts.push(wedge);
  for (const y of [0.442, 0.64]) { const rail = roundedBox(0.07, 0.025, 1.12, 0.008, 1); xf(rail, { pos: [2.62, y, 0] }); parts.push(rail); }
  for (const z of [-0.54, 0.54]) { const post = roundedBox(0.07, 0.23, 0.03, 0.008, 1); xf(post, { pos: [2.62, 0.54, z] }); parts.push(post); }
  return mergeGeo(parts);
}
function wingFlap() {
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.12, 0.05, 0.34, 0.01); sh.lineTo(0.34, -0.005); sh.quadraticCurveTo(0.12, 0.0, 0, -0.012); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1.86, bevelEnabled: false }); xf(g, { pos: [-0.17, 0, -0.93] });
  return g;
}
function armour() {
  const parts = [], side = (x, y, w, h, t, s, tilt = 0) => { const sec = sectionAt(x); const g = roundedBox(w, h, t, Math.min(0.025, t * 0.4), 2); xf(g, { pos: [x, y, s * (sec.hw + t * 0.45)], rot: [0, -s * tilt, 0] }); parts.push(g); return g; };
  for (const s of [1, -1]) {
    side(0.05, 0.62, 1.05, 0.5, 0.05, s);                // door plate
    side(-1.55, 0.7, 1.05, 0.42, 0.05, s, 0.03);          // rear quarter plate
    side(1.95, 0.55, 0.85, 0.32, 0.05, s, 0.08);          // front fender plate
    for (const [x, y] of [[-0.42, 0.82], [0.52, 0.82], [-0.42, 0.44], [0.52, 0.44]]) { const sec = sectionAt(x); const r = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8); r.rotateX(Math.PI / 2); xf(r, { pos: [x, y, s * (sec.hw + 0.052)] }); parts.push(r); }
    const vent = roundedBox(0.5, 0.04, 0.16, 0.012, 2); xf(vent, { pos: [1.45, 0.98, s * 0.55] }); parts.push(vent);
  }
  const ram = roundedBox(0.16, 0.2, 1.1, 0.05, 3); xf(ram, { pos: [2.62, 0.42, 0] }); parts.push(ram);                   // ram bar
  for (const s of [1, -1]) { const arm = roundedBox(0.4, 0.07, 0.07, 0.02, 2); xf(arm, { pos: [2.42, 0.44, s * 0.5], rot: [0, s * 0.3, 0] }); parts.push(arm); }
  // roll-over hoop behind the canopy
  const hoop = tube([[-1.38, 1.0, 0.78], [-1.45, 1.3, 0.55], [-1.5, 1.38, 0], [-1.45, 1.3, -0.55], [-1.38, 1.0, -0.78]], 0.035, 8); parts.push(hoop);
  // exhaust: rectangular quad-tip boxes; thrusters: bell nozzles (dark interiors come from internals)
  for (const [x, y, z] of PBR_SPEC.exhaust) { const e = roundedBox(0.34, 0.15, 0.22, 0.035, 3); xf(e, { pos: [x + 0.02, y, z] }); parts.push(e); }
    return mergeGeo(parts);
}
/** Open half-barrel (upper half) around the Z axis: radius r, length len. */
function halfLiner(r, len) {
  const pos = [], idx = [], N = 20;
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI; for (const z of [-len / 2, len / 2]) pos.push(Math.cos(a) * r, Math.sin(a) * r, z); }
  for (let i = 0; i < N; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((N + 1) * 4), 2));
  return g;
}
/** Opaque dark internals: engine bay, radiator, cabin cage, fuel tank, exhaust, underbody, drivetrain, closed wheel wells. */
function internals() {
  const dark = [], metal = [];
  const ens = (g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); return g; };
  const D = (g) => dark.push(ens(g)), M = (g) => metal.push(ens(g));
  // engine bay: block, heads, supercharger, intake, radiator + fan, battery, bay floor
  const block = roundedBox(0.95, 0.42, 0.62, 0.05, 3); xf(block, { pos: [1.5, 0.6, 0] }); M(block);
  for (const s of [1, -1]) { const head = roundedBox(0.85, 0.16, 0.22, 0.04, 2); xf(head, { pos: [1.5, 0.78, s * 0.3] }); D(head); }
  const blower = new THREE.CylinderGeometry(0.17, 0.17, 0.5, 20); blower.rotateX(Math.PI / 2); xf(blower, { pos: [1.5, 0.76, 0] }); M(blower);
  const intake = roundedBox(0.32, 0.1, 0.3, 0.04, 2); xf(intake, { pos: [1.78, 0.8, 0] }); D(intake);
  const rad = roundedBox(0.09, 0.34, 0.86, 0.02, 2); xf(rad, { pos: [2.25, 0.56, 0] }); M(rad);
  const fan = new THREE.TorusGeometry(0.17, 0.02, 6, 16); fan.rotateY(Math.PI / 2); xf(fan, { pos: [2.16, 0.56, 0] }); D(fan);
  const bayFloor = roundedBox(1.7, 0.04, 1.2, 0.01, 1); xf(bayFloor, { pos: [1.5, 0.4, 0] }); D(bayFloor);
  const bulk = roundedBox(0.06, 0.55, 1.5, 0.01, 1); xf(bulk, { pos: [0.85, 0.65, 0] }); D(bulk);              // firewall
  // front grille opening (dark mesh, visible through the nose)
  const grille = roundedBox(0.07, 0.17, 0.98, 0.015, 2); xf(grille, { pos: [2.575, 0.54, 0] }); D(grille);                // intake back wall
  for (let k = -4; k <= 4; k++) { const bar = roundedBox(0.04, 0.14, 0.022, 0.006, 1); xf(bar, { pos: [2.625, 0.54, k * 0.11] }); M(bar); }
  for (const y of [0.49, 0.54, 0.59]) { const fin = roundedBox(0.04, 0.012, 0.92, 0.004, 1); xf(fin, { pos: [2.65, y, 0] }); M(fin); }
  for (const sd of [1, -1]) { const hous = roundedBox(0.5, 0.075, 0.22, 0.012, 1); xf(hous, { pos: [2.4, 0.655, sd * 0.62], rot: [0, -sd * 0.95, sd * 0.12] }); D(hous); }                // angular headlight housings
  const lowerBumper = roundedBox(0.2, 0.09, 1.3, 0.03, 3); xf(lowerBumper, { pos: [2.55, 0.37, 0] }); M(lowerBumper);
  // cabin: floor, tub, seats are in interior(); add roll cage + pedals + rear bulkhead
  const cage = (pts) => M(tube(pts, 0.022, 8));
  cage([[-0.2, 0.95, 0.75], [-0.25, 1.3, 0.6], [-0.3, 1.43, 0.0], [-0.25, 1.3, -0.6], [-0.2, 0.95, -0.75]]);
  cage([[0.55, 1.0, 0.72], [0.42, 1.22, 0.62], [0.35, 1.3, 0.0], [0.42, 1.22, -0.62], [0.55, 1.0, -0.72]]);
  for (const s of [1, -1]) cage([[0.4, 1.25, s * 0.62], [0.0, 1.38, s * 0.55], [-0.28, 1.34, s * 0.55]]);
  cage([[-0.3, 1.43, 0.0], [-0.9, 1.1, 0.0]]);
  const rearBulk = roundedBox(0.05, 0.5, 1.7, 0.01, 1); xf(rearBulk, { pos: [-1.18, 0.7, 0] }); D(rearBulk);
  // trunk: fuel tank, spare, battery, strut tower brace
  const tank = roundedBox(0.8, 0.3, 0.95, 0.09, 3); xf(tank, { pos: [-1.75, 0.58, 0] }); M(tank);
  const trunkFloor = roundedBox(1.2, 0.04, 1.6, 0.01, 1); xf(trunkFloor, { pos: [-1.8, 0.78, 0] }); D(trunkFloor);
  const spare = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 20); xf(spare, { pos: [-2.1, 0.86, 0] }); D(spare);
  // underbody: armour plate, drivetrain, exhaust runs
  const plate = roundedBox(3.9, 0.035, 1.5, 0.012, 2); xf(plate, { pos: [0.05, 0.285, 0] }); M(plate);
  for (const x of [-1.2, -0.2, 0.9]) { const rib = roundedBox(0.06, 0.05, 1.5, 0.01, 1); xf(rib, { pos: [x, 0.265, 0] }); M(rib); }
  const shaft = new THREE.CylinderGeometry(0.045, 0.045, 2.6, 12); shaft.rotateZ(Math.PI / 2); xf(shaft, { pos: [-0.25, 0.4, 0] }); M(shaft);
  const trans = roundedBox(0.8, 0.28, 0.4, 0.07, 3); xf(trans, { pos: [0.65, 0.45, 0] }); M(trans);
  const diff = roundedBox(0.45, 0.28, 0.5, 0.09, 3); xf(diff, { pos: [-1.5, 0.43, 0] }); M(diff);
  for (const s of [1, -1]) {
    D(tube([[-2.5, 0.5, s * 0.5], [-1.5, 0.37, s * 0.5], [-0.6, 0.33, s * 0.45], [0.4, 0.36, s * 0.42]], 0.05, 8));
    const axle = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8); axle.rotateX(Math.PI / 2); xf(axle, { pos: [-1.5, 0.43, s * 0.75] }); M(axle);
    const axleF = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8); axleF.rotateX(Math.PI / 2); xf(axleF, { pos: [1.55, 0.43, s * 0.7] }); M(axleF);
  }
  // tail panel: tail-light housing, licence plate recess + plate, exhaust/nozzle interiors
  const housing = roundedBox(0.03, 0.1, 1.34, 0.012, 2); xf(housing, { pos: [-2.655, 0.8, 0] }); D(housing);
  const recess = roundedBox(0.03, 0.17, 0.56, 0.012, 2); xf(recess, { pos: [-2.655, 0.58, 0] }); D(recess);
  const plateW = roundedBox(0.012, 0.12, 0.46, 0.006, 1); xf(plateW, { pos: [-2.675, 0.58, 0] }); M(plateW);
  for (const [x, y, z] of PBR_SPEC.exhaust) { const inner = roundedBox(0.1, 0.1, 0.17, 0.02, 2); xf(inner, { pos: [x - 0.14, y, z] }); D(inner); }
  for (const [x, y, z] of PBR_SPEC.thrusters) { const cap = new THREE.CircleGeometry(0.1, 20); cap.rotateY(Math.PI / 2); xf(cap, { pos: [x - 0.02, y, z] }); D(cap); const bell = new THREE.CylinderGeometry(0.115, 0.075, 0.26, 20, 1, true); bell.rotateZ(Math.PI / 2); xf(bell, { pos: [x + 0.1, y, z] }); D(bell); const cone = new THREE.CylinderGeometry(0.075, 0.03, 0.24, 20, 1, true); cone.rotateZ(Math.PI / 2); xf(cone, { pos: [x + 0.1, y, z] }); D(cone); }
  // wheel wells closed off: open liner barrel + back disc, just inside the carved arch
  for (const xc of [WHEELS.front, WHEELS.rear]) for (const s of [1, -1]) {
    const liner = halfLiner(0.5, 0.42); xf(liner, { pos: [xc, 0.44, s * 0.8] }); D(liner);          // upper half only: never pokes below the car
    const back = new THREE.CircleGeometry(0.5, 24, 0, Math.PI); xf(back, { pos: [xc, 0.44, s * 0.59], rot: [0, s > 0 ? 0 : Math.PI, 0] }); D(back);
    const roofW = roundedBox(0.95, 0.04, 0.5, 0.01, 1); xf(roofW, { pos: [xc, 0.99, s * 0.82] }); D(roofW);
  }
  return { dark: mergeGeo(dark), metal: mergeGeo(metal) };
}
function interior() {
  const parts = [];
  for (const s of [0.34, -0.34]) { const seat = roundedBox(0.5, 0.3, 0.42, 0.1, 3); xf(seat, { pos: [-0.55, 0.95, s] }); parts.push(seat); const back = roundedBox(0.12, 0.5, 0.4, 0.05, 3); xf(back, { pos: [-0.82, 1.2, s], rot: [0, 0, 0.2] }); parts.push(back); }
  const dash = roundedBox(0.5, 0.26, 1.5, 0.08, 4); xf(dash, { pos: [0.5, 1.12, 0], rot: [0, 0, -0.18] }); parts.push(dash);
  const wheel = new THREE.TorusGeometry(0.17, 0.018, 8, 20); xf(wheel, { pos: [0.28, 1.2, 0.34], rot: [0, Math.PI / 2, 0.2] }); parts.push(wheel);
  const floor = roundedBox(2.0, 0.04, 1.5, 0.01, 1); xf(floor, { pos: [-0.2, 0.88, 0] }); parts.push(floor);
  return mergeGeo(parts);
}
function displays() {
  const parts = [];
  const hud = new THREE.PlaneGeometry(0.34, 0.14); xf(hud, { pos: [0.52, 1.245, 0.33], rot: [0, -Math.PI / 2, -0.55] }); parts.push(hud);
  const centre = new THREE.PlaneGeometry(0.3, 0.16); xf(centre, { pos: [0.58, 1.18, 0], rot: [0, -Math.PI / 2, -0.32] }); parts.push(centre);
  return mergeGeo(parts);
}
function headLights() {
  const parts = [];
  for (const s of [1, -1]) {
    const hl = roundedBox(0.4, 0.028, 0.14, 0.012, 2); xf(hl, { pos: [2.4, 0.715, s * 0.62], rot: [0, -s * 0.95, s * 0.12] }); parts.push(hl);     // narrow angular LED blade
    const drl = roundedBox(0.34, 0.014, 0.03, 0.006, 1); xf(drl, { pos: [2.34, 0.655, s * 0.72], rot: [0, -s * 0.95, 0] }); parts.push(drl);
    const low = roundedBox(0.16, 0.025, 0.07, 0.01, 1); xf(low, { pos: [2.5, 0.49, s * 0.36], rot: [0, -s * 0.4, 0] }); parts.push(low);
  }
  return mergeGeo(parts);
}
function tailLights() {
  const parts = [];
  const bar = roundedBox(0.03, 0.05, 1.24, 0.012, 2); xf(bar, { pos: [-2.675, 0.8, 0] }); parts.push(bar);
  for (const s of [1, -1]) { const cl = roundedBox(0.05, 0.1, 0.22, 0.02, 2); xf(cl, { pos: [-2.62, 0.8, s * 0.78], rot: [0, s * 0.7, 0] }); parts.push(cl); }
  const brake3 = roundedBox(0.04, 0.03, 0.5, 0.01, 1); xf(brake3, { pos: [-1.5, 1.22, 0], rot: [0, 0, 0.08] }); parts.push(brake3);
  return mergeGeo(parts);
}
function reverseLights() { const parts = []; for (const s of [1, -1]) { const g = roundedBox(0.05, 0.04, 0.12, 0.01, 1); xf(g, { pos: [-2.68, 0.62, s * 0.74] }); parts.push(g); } return mergeGeo(parts); }
function underglow(xs) {
  const parts = [];
  for (const s of [1, -1]) {
    const pts = [];
    for (let x = -1.3; x <= 1.2; x += 0.2) pts.push([x, 0.262, s * (sectionAt(x).hw * 0.95)]);
    parts.push(ribbon(pts, 0.028, [0, -1, 0]));
  }
  const cross = []; for (let z = -0.8; z <= 0.8; z += 0.2) cross.push([2.2, 0.27, z]); parts.push(ribbon(cross, 0.025, [0, -1, 0]));
  const rear = []; for (let z = -0.8; z <= 0.8; z += 0.2) rear.push([-2.2, 0.28, z]); parts.push(ribbon(rear, 0.025, [0, -1, 0]));
  return mergeGeo(parts);
}
function panelGaps(canopy) {
  const lines = [];
  const surf = (x, side, t) => { const s = sectionAt(x); return [x, s.yt - (s.yt - s.ysh) * (1 - t) * 0.0 + 0, side * 0]; };
  void surf;
  // hood outline + trunk line + door lines drawn as thin black ribbons hugging the surface
  const top = (x, z) => { const s = sectionAt(x); const f = clamp(Math.abs(z) / (s.hw * 0.93), 0, 1); return [x, s.yt - (s.yt - s.ysh) * f * f * 0.62 + 0.004, z]; };
  const hood = []; for (let k = 0; k <= 12; k++) hood.push(top(0.72, -0.78 + (k / 12) * 1.56)); lines.push(ribbon(hood, 0.012, [0, 1, 0]));
  for (const sd of [1, -1]) { const e = []; for (let x = 0.72; x <= 2.27; x += 0.16) e.push(top(x, sd * sectionAt(x).hw * 0.68)); lines.push(ribbon(e, 0.012, [0, 1, 0])); }
  const trunk = []; for (let k = 0; k <= 12; k++) trunk.push(top(-1.55, -0.8 + (k / 12) * 1.6)); lines.push(ribbon(trunk, 0.012, [0, 1, 0]));
  for (const sd of [1, -1]) for (const x of [-0.55, 0.62]) {                                   // door shut lines
    const pts = []; for (let k = 0; k <= 8; k++) { const y = 0.34 + (k / 8) * 0.62; pts.push([x, y, sd * (sectionAt(x).hw * 1.0 + 0.003)]); }
    lines.push(ribbon(pts, 0.012, [sd, 0, 0]));
  }
  void canopy;
  return mergeGeo(lines);
}
function pillars(canopy) {
  const parts = [];
  for (const j of [Math.round(CAN_NU * 0.12), Math.round(CAN_NU * 0.88)]) { const pts = []; for (let i = 0; i < CAN_NX; i += 2) pts.push(canopyPoint(canopy, i, j, 0.012)); parts.push(ribbon(pts, 0.06, [0, 1, 0])); }
  for (const j of [Math.round(CAN_NU * 0.5)]) { const pts = []; for (let i = 0; i < CAN_NX; i += 2) pts.push(canopyPoint(canopy, i, j, 0.018)); parts.push(ribbon(pts, 0.05, [0, 1, 0])); }
  const bpx = Math.round(CAN_NX * 0.5);
  const bp = []; for (let j = 0; j < CAN_NU; j++) bp.push(canopyPoint(canopy, bpx, j, 0.012)); parts.push(ribbon(bp, 0.05, [0, 1, 0]));
  return mergeGeo(parts);
}
function turretParts() {
  const base = [], gun = [];
  const ring = new THREE.CylinderGeometry(0.3, 0.34, 0.1, 28); xf(ring, { pos: [0, -0.04, 0] }); base.push(ring);
  const rotor = new THREE.CylinderGeometry(0.26, 0.29, 0.1, 28); xf(rotor, { pos: [0, 0.05, 0] }); base.push(rotor);
  const house = roundedBox(0.78, 0.26, 0.66, 0.1, 5); xf(house, { pos: [0.02, 0.22, 0] }); base.push(house);
  for (const s of [1, -1]) { const fair = roundedBox(0.52, 0.2, 0.12, 0.05, 3); xf(fair, { pos: [-0.02, 0.2, s * 0.36], rot: [0, s * 0.1, 0] }); base.push(fair); const drum = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 14); drum.rotateX(Math.PI / 2); xf(drum, { pos: [-0.28, 0.24, s * 0.4] }); base.push(drum); }
  const shield = roundedBox(0.14, 0.2, 0.5, 0.05, 3); xf(shield, { pos: [0.44, 0.24, 0] }); base.push(shield);
  for (const z of [0.14, -0.14]) {
    const barrel = new THREE.CylinderGeometry(0.042, 0.046, 1.3, 20); barrel.rotateZ(Math.PI / 2); xf(barrel, { pos: [1.0, 0.24, z] }); gun.push(barrel);
    const sleeve = new THREE.CylinderGeometry(0.066, 0.066, 0.55, 20); sleeve.rotateZ(Math.PI / 2); xf(sleeve, { pos: [0.62, 0.24, z] }); gun.push(sleeve);
    const brake = new THREE.CylinderGeometry(0.07, 0.06, 0.16, 18); brake.rotateZ(Math.PI / 2); xf(brake, { pos: [1.62, 0.24, z] }); gun.push(brake);
  }
  const ensure = (g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
  const eye = new THREE.SphereGeometry(0.05, 12, 8); xf(eye, { pos: [0.4, 0.38, 0] });
  return { base: mergeGeo(base.map(ensure)), gun: mergeGeo(gun.map(ensure)), eye };
}
function flameCone(r, len) { const g = new THREE.ConeGeometry(r, len, 14, 1, true); g.rotateZ(Math.PI / 2); g.translate(-len / 2, 0, 0); g.rotateY(Math.PI); g.rotateY(Math.PI); return g; }

// ------------------------------------------------------------------ materials
function paintMaterial(color, tex, uni) {
  const m = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, color, metalness: 0.62, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.035, normalMap: tex.flake, normalScale: new THREE.Vector2(0.13, 0.13), envMapIntensity: 1.25, sheen: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = uni.uDirt; sh.uniforms.uWet = uni.uWet;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDirt; varying float vDirt;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirt = aDirt;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDirt; uniform float uWet; varying float vDirt;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat dirtK = clamp(uDirt * (0.2 + vDirt * 1.1), 0.0, 1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16,0.12,0.09), dirtK*0.88); diffuseColor.rgb *= 1.0 - uWet*0.2;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.96, dirtK); roughnessFactor = mix(roughnessFactor, roughnessFactor*0.5, uWet*(1.0-dirtK));')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - dirtK*0.96; material.clearcoatRoughness = mix(mix(material.clearcoatRoughness, 0.6, dirtK), 0.01, uWet*(1.0-dirtK));\n#endif');
  };
  m.customProgramCacheKey = () => 'heropaint-v1';
  return m;
}

/**
 * buildHeroCarPBR({ color, accent, number }) -> THREE.Group with userData.hero = api (same contract as the palette hero):
 * api.update(state, dt, opts) with state = { speed, steer, ax, ay, throttle, braking, wheelspin, slip, firing, frac, dmg, wrecked, aim, rough, reversing, wet, dirt, rpm }.
 */
export function buildHeroCarPBR({ color = 0xc8501a, accent = 0x35e6ff, number = '9' } = {}) {
  void number;
  const tex = carTextures();
  const uni = { uDirt: { value: 0 }, uWet: { value: 0 } };
  const bg = buildBodyGeometries();
  const canopy = buildCanopy(), roofGeo = buildRoofPanel(canopy);
  const root = new THREE.Group(); root.name = 'car-hammer-pbr';
  const sprung = new THREE.Group(); root.add(sprung);
  const mats = {
    paint: paintMaterial(new THREE.Color(color), tex, uni),
    carbon: new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, map: tex.carbonA, normalMap: tex.carbonN, roughnessMap: tex.carbonR, roughness: 1, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.0 }),
    gun: new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, color: 0x70767e, metalness: 1, roughness: 1, roughnessMap: tex.brushR, normalMap: tex.brushN, normalScale: new THREE.Vector2(0.5, 0.5), anisotropy: 0.6, envMapIntensity: 1.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x03070b, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.9, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.75, metalness: 0.35, side: THREE.DoubleSide }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.9, metalness: 0, normalMap: tex.tread, normalScale: new THREE.Vector2(1.3, 1.3) }),
    rim: new THREE.MeshPhysicalMaterial({ color: 0x23262b, metalness: 1, roughness: 0.26, clearcoat: 0.7, clearcoatRoughness: 0.08, envMapIntensity: 1.4 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x80848b, metalness: 1, roughness: 0.42, emissive: new THREE.Color(0xff5a10), emissiveIntensity: 0 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: 0xd51a1a, metalness: 0.2, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }),
    head: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.75, 2.1) }),
    tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.03, 0.04) }),
    rev: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.2, 0.2) }),
    under: new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(0.8), side: THREE.DoubleSide }),
    display: new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2.4), side: THREE.DoubleSide }),
    gap: new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 2.4, 4.0), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    fire: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.3), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    flash: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.5, 2), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(4) }),
    glowDecal: new THREE.MeshBasicMaterial({ map: tex.glow, color: new THREE.Color(accent).multiplyScalar(0.8), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  const mesh = (g, m, name, cast = true, recv = false) => { const o = new THREE.Mesh(g, m); o.name = name; o.castShadow = cast; o.receiveShadow = recv; return o; };
  const body = mesh(bg.body, mats.paint, 'body', true, true), hood = mesh(bg.hood, mats.paint, 'hood', true, true);
  const glass = mesh(canopy, mats.glass, 'glass', false);
  const kit = mesh(mergeGeo([carbonKit(), roofGeo, pillars(canopy)]), mats.carbon, 'aero'),   // aero kit + roof panel + pillars in one draw call
     flap = mesh(wingFlap(), mats.carbon, 'wing-flap'); flap.position.set(-2.62, 1.3, 0);
  const plates = mesh(armour(), mats.gun, 'armour');
  const cabin = mesh(interior(), mats.interior, 'interior', false), disp = mesh(displays(), mats.display, 'displays', false);
  const heads = mesh(headLights(), mats.head, 'headlights', false), tails = mesh(tailLights(), mats.tail, 'taillights', false), revs = mesh(reverseLights(), mats.rev, 'reverse', false);
  const under = mesh(underglow(), mats.under, 'underglow', false), gaps = mesh(mergeGeo([panelGaps(canopy), pillars(canopy)]), mats.gap, 'gaps', false);
  const inn = internals(), innDark = mesh(inn.dark, mats.dark, 'internals-dark', false), innMetal = mesh(inn.metal, mats.gun, 'internals-metal', true);
  sprung.add(innDark, innMetal, innDark, innMetal, body, hood, glass, kit, flap, plates, cabin, disp, heads, tails, revs, under, gaps);
  gaps.geometry = panelGaps(canopy);
  // underglow decal on the ground (unsprung)
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4).rotateX(-Math.PI / 2), mats.glowDecal); decal.position.set(0, 0.03, 0); decal.name = 'underglow-decal'; decal.renderOrder = 2; root.add(decal);
  // engine bay + bay fire
  const bay = { visible: false };   // the real engine bay is in internals(); nothing to toggle
  const fire = new THREE.Group(); for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 + k * 0.04, 0.8 + k * 0.2, 10, 1, true), mats.fire); f.position.set(1.4 + k * 0.28 - 0.2, 1.3, (k - 1) * 0.28); fire.add(f); } fire.visible = false; sprung.add(fire);
  // turret
  const tp = turretParts();
  const turret = new THREE.Group(); turret.position.set(...PBR_SPEC.turret); sprung.add(turret);
  const rotor = new THREE.Group(); turret.add(rotor);
  const tBase = mesh(tp.base, mats.gun, 'turret-base'), tGun = mesh(tp.gun, mats.gun, 'barrels'), tEye = mesh(tp.eye, mats.eye, 'turret-eye', false);
  const flashG = new THREE.ConeGeometry(0.11, 0.55, 8, 1, true); flashG.rotateZ(-Math.PI / 2); flashG.translate(0.28, 0, 0);
  const flashes = [0.14, -0.14].map((z) => { const f = new THREE.Mesh(flashG, mats.flash); f.position.set(1.7, 0.24, z); f.visible = false; return f; });
  rotor.add(tBase, tGun, tEye, ...flashes);
  // thruster flames
  const flameG = flameCone(0.1, 1.1), flames = PBR_SPEC.thrusters.map(([x, y, z]) => { const f = new THREE.Mesh(flameG, mats.flame); f.position.set(x - 0.02, y, z); f.visible = false; sprung.add(f); return f; });

  // wheels (instanced)
  const wp = wheelParts();
  const mkI = (g, m, name, cast) => { const im = new THREE.InstancedMesh(g, m, 4); im.name = name; im.castShadow = cast; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); return im; };
  const iTyre = mkI(wp.tyre, mats.tyre, 'tyres', true), iRim = mkI(wp.rim, mats.rim, 'rims', true), iDisc = mkI(wp.disc, mats.disc, 'discs', false), iCal = mkI(wp.caliper, mats.caliper, 'calipers', false);
  const slots = [[WHEELS.front, WHEELS.track, 1, true], [WHEELS.front, -WHEELS.track, -1, true], [WHEELS.rear, WHEELS.track, 1, false], [WHEELS.rear, -WHEELS.track, -1, false]];

  const S = { pitch: 0, pitchV: 0, roll: 0, rollV: 0, heave: 0, heaveV: 0, spin: 0, dentKey: '', stage: 0, turretYaw: 0, turretPitch: 0, flap: 0.2, heat: 0, t: 0, brakeOn: null, charred: false };
  const dummy = new THREE.Object3D(), tmp = new THREE.Matrix4(), qa = new THREE.Quaternion();
  const charredCol = new THREE.Color(0x0c0b0a), paintCol = new THREE.Color(color);

  function wheelMatrices(st, look) {
    const sp = ((st.speed || 0) * (S.dt || 0.016)) / WHEELS.radius;
    S.spin += sp + (st.wheelspin || 0) * (S.dt || 0.016) * 38;
    const steer = -(st.steer || 0) * 0.42, locked = (st.braking || 0) > 0.97 ? 0 : 1;
    for (let i = 0; i < 4; i++) {
      const [x, z, side, front] = slots[i];
      const yaw = (front ? steer : 0) + (side < 0 ? Math.PI : 0);
      const y = WHEELS.radius - (look.charred ? 0.07 : 0) + S.heave * 0.0;
      dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1, look.charred ? 0.84 : 1, 1);
      dummy.updateMatrix(); tmp.copy(dummy.matrix);
      iCal.setMatrixAt(i, tmp);                                         // caliper: steers, does not spin
      const spin = (side < 0 ? 1 : -1) * S.spin * locked;
      dummy.rotation.set(0, yaw, 0); dummy.rotateZ(spin); dummy.updateMatrix();
      iTyre.setMatrixAt(i, dummy.matrix); iRim.setMatrixAt(i, dummy.matrix); iDisc.setMatrixAt(i, dummy.matrix);
    }
    for (const im of [iTyre, iRim, iDisc, iCal]) im.instanceMatrix.needsUpdate = true;
  }

  function update(st, dt, opts = {}) {
    dt = clamp(dt, 0, 0.1); S.dt = dt; S.t += dt;
    const look = damageLook(st.frac ?? 1, !!st.wrecked);
    const dmg = st.dmg || [0, 0, 0, 0], key = dentKey(dmg, look.crush);
    if (key !== S.dentKey || look.stage !== S.stage) {
      applyDents(bg.body, dmg, look.crush); applyDents(bg.hood, dmg, look.crush);
      S.dentKey = key;
      if (look.stage !== S.stage) {
        S.stage = look.stage;
        hood.visible = look.hood; bay.visible = !look.hood; plates.visible = look.plates; glass.visible = look.glass; heads.visible = tails.visible = look.lights; under.visible = decal.visible = look.lights;
        const charred = look.charred; if (charred !== S.charred) { S.charred = charred; mats.paint.color.copy(charred ? charredCol : paintCol); mats.paint.clearcoat = charred ? 0 : 1; mats.paint.roughness = charred ? 0.9 : 0.3; mats.paint.metalness = charred ? 0.1 : 0.62; mats.paint.normalScale.setScalar(charred ? 0 : 0.13); }
        fire.visible = look.fire; disp.visible = look.lights;
      }
    }
    // suspension springs
    const ax = st.ax || 0, ay = st.ay || 0;
    const tp2 = clamp(-ax * 0.0075, -0.08, 0.08), trl = clamp(-ay * 0.0062, -0.09, 0.09);
    const rough = (st.rough || 0) * 0.014 * Math.sin(S.spin * 5.3 + 1.7) + (st.slip || 0) * 0.008 * Math.sin(S.spin * 9.1);
    S.pitchV += (90 * (tp2 - S.pitch) - 11 * S.pitchV) * dt; S.pitch += S.pitchV * dt;
    S.rollV += (110 * (trl - S.roll) - 12 * S.rollV) * dt; S.roll += S.rollV * dt;
    const th = -Math.abs(ay) * 0.0015 - Math.max(0, st.throttle || 0) * 0.012 + (st.speed || 0) * 0.00012;
    S.heaveV += (160 * (th + rough - S.heave) - 16 * S.heaveV) * dt; S.heave += S.heaveV * dt;
    sprung.position.y = S.heave; sprung.rotation.z = -S.pitch; sprung.rotation.x = S.roll;
    // wheels + heat
    S.heat = stepHeat(S.heat, st.braking || 0, st.speed || 0, dt);
    mats.disc.emissiveIntensity = S.heat * 3.2;
    wheelMatrices(st, look);
    // lights
    const brakeOn = (st.braking || 0) > 0.05 && !st.wrecked;
    mats.tail.color.setRGB(brakeOn ? 2.3 : 0.9, 0.03, 0.04);
    mats.rev.color.setScalar(st.reversing ? 3 : 0.15);
    const pulse = 0.85 + 0.15 * Math.sin(S.t * 3) + (st.throttle || 0) * 0.5;
    mats.under.color.set(accent).multiplyScalar(0.75 * pulse); mats.glowDecal.opacity = clamp(0.32 + 0.12 * pulse, 0, 0.55);
    // adaptive wing + turret
    S.flap += (wingAngle(st.speed || 0, st.braking || 0, ay) - S.flap) * Math.min(1, 7 * dt);
    flap.rotation.z = S.flap;
    rotor.rotation.y = 0;                    // fixed mount: always points straight ahead (+X); no tracking
    tGun.position.x = st.firing ? -0.05 * (0.5 + 0.5 * Math.sin(S.t * 90)) : lerp(tGun.position.x, 0, 0.3);
    const fl = !!st.firing && !st.wrecked && Math.sin(S.t * 85) > -0.2; for (const f of flashes) { f.visible = fl; f.scale.setScalar(0.8 + 0.5 * Math.random()); }
    tEye.visible = look.lights;
    // thrusters + fire
    const thr = clamp((st.throttle || 0) * (st.speed < 60 ? 1 : 0.7), 0, 1) * (look.lights ? 1 : 0);
    for (const f of flames) { f.visible = thr > 0.15; f.scale.set(0.22 + thr * 0.45 + 0.1 * Math.random(), 0.55 + thr * 0.35, 0.55 + thr * 0.35); }
    if (look.fire) fire.children.forEach((c, i) => { c.scale.set(1, 0.7 + 0.5 * Math.random(), 1); c.position.y = 1.2 + 0.1 * Math.sin(S.t * 14 + i); });
    // wet / dirt (smoothed)
    uni.uWet.value += (clamp(st.wet ?? 0, 0, 1) - uni.uWet.value) * Math.min(1, dt * 1.2);
    uni.uDirt.value += (clamp(st.dirt ?? 0, 0, 1) - uni.uDirt.value) * Math.min(1, dt * 0.6);
    // LOD: far cars drop the fine parts
    if (opts.shadow !== undefined && opts.shadow !== S.shadowOn) { S.shadowOn = opts.shadow; for (const o of [body, hood, kit, plates, tBase, tGun, innMetal, iTyre, iRim]) o.castShadow = opts.shadow; }
    const far = !!opts.far;
    for (const o of [cabin, disp, gaps, under]) if (look.lights || o !== under) o.visible = !far && (o !== disp || look.lights) && (o !== under || look.lights);
    decal.visible = look.lights && !far;
    return S.stage;
  }

  const all = () => [innDark, innMetal, body, hood, glass, kit, flap, plates, cabin, disp, heads, tails, revs, under, gaps, tBase, tGun, tEye, iTyre, iRim, iDisc, iCal];
  const api = {
    update, S, mats, uniforms: uni, look: damageLook,
    get stage() { return S.stage; },
    anchors: { exhaust: PBR_SPEC.exhaust, thrusters: PBR_SPEC.thrusters, engine: PBR_SPEC.engine, muzzle: PBR_SPEC.muzzle },
    setEnvIntensity(v) { for (const m of Object.values(mats)) if (m.envMapIntensity !== undefined) m.envMapIntensity = (m.userData.baseEnv ??= m.envMapIntensity) * v; },
    setShadows(on) { root.traverse((o) => { if (o.isMesh && o.userData.cast !== false) o.castShadow = on && !['glass', 'interior', 'gaps', 'displays', 'underglow-decal'].includes(o.name); }); },
    dispose() { const geos = new Set(); root.traverse((o) => { if (o.geometry) geos.add(o.geometry); }); geos.forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); },
  };
  const triTotal = () => all().reduce((n, o) => n + triCount(o.geometry) * (o.isInstancedMesh ? 4 : 1), 0) + triCount(fire.children[0].geometry) * 3;
  root.userData = { carId: 'hammer', hero: api, pbr: true, wheels: [], frontPivots: [], wheelRadius: WHEELS.radius, body, sprung, length: PBR_SPEC.length, width: PBR_SPEC.width, wrecked: false, drawCalls: all().length + 3, triCount: triTotal };
  body.userData.cast = hood.userData.cast = true;
  return root;
}
