// Procedural low-poly car meshes. Local frame: +X forward, +Y up, +Z driver's right, origin = CG at ground.
// Body = one merged vertex-coloured PBR mesh (+1 small emissive light mesh); 4 wheels share one geometry. Node-safe (no DOM / WebGL).
import * as THREE from 'three';
import { MeshBuilder } from './geomUtil.js';
import { COLOR as K } from './paletteRef.js';

export const CAR_IDS = ['wasp', 'hammer', 'bulwark'];
const SPECS = {
  wasp: { wheelR: 0.34, wheelW: 0.26, track: 0.78, front: 1.35, rear: -1.3, length: 4.2, width: 1.7 },
  hammer: { wheelR: 0.42, wheelW: 0.42, track: 1.0, front: 1.5, rear: -1.45, length: 4.7, width: 2.1 },
  bulwark: { wheelR: 0.5, wheelW: 0.4, track: 1.08, front: 1.55, rear: -1.5, length: 4.9, width: 2.3 },
};
export const carSpec = (id) => SPECS[id] || SPECS.wasp;
/** parts lost -> { part: true } lookup (array of ids, Set or object accepted) */
function lostSet(lost) {
  const o = {};
  if (!lost) return o;
  for (const k of (Array.isArray(lost) ? lost : lost instanceof Set ? [...lost] : Object.keys(lost))) o[k] = true;
  return o;
}
const WHEEL_OF = { wheelFR: 0, wheelRL: 3 };   // index into userData.wheels (FL+z..: [front +z, front -z, rear +z, rear -z])

let _mat = null, _wheelMat = null, _glowMat = null;
/** Shared car-paint material: vertex colours, semi-metallic clearcoat PBR (picks up scene.environment when present). */
export function carMaterial() {
  if (!_mat) {
    _mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.28 });
    _mat.userData.shared = true;
  }
  return _mat;
}
/** Shared tyre/rim material (rubber-ish). */
export function wheelMaterial() {
  if (!_wheelMat) {
    _wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.72 });
    _wheelMat.userData.shared = true;
  }
  return _wheelMat;
}
/** Shared emissive light material (head/tail lights, underglow): unlit vertex colours, >1 values bloom when post is on. */
export function glowMaterial() {
  if (!_glowMat) {
    _glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    _glowMat.userData.shared = true;
  }
  return _glowMat;
}
const _wheelGeo = new Map();
function wheelGeometry(r, w, rim) {
  const key = `${r}|${w}|${rim}`;
  let g = _wheelGeo.get(key);
  if (!g) {
    const b = new MeshBuilder({ smooth: 50, ao: 0, jitter: 0.02 });
    b.cyl(0, 0, 0, r, r, w, 'z', 10, K.black, K.darkGrey);
    b.cyl(0, 0, w / 2 + 0.01, r * 0.5, r * 0.5, 0.04, 'z', 6, rim); // hub, shows spin
    b.cyl(0, 0, -w / 2 - 0.01, r * 0.5, r * 0.5, 0.04, 'z', 6, rim);
    b.box(0, 0, 0, r * 1.5, r * 0.18, w + 0.06, K.lightGrey);       // spoke bar
    g = b.build();
    g.userData.shared = true;
    _wheelGeo.set(key, g);
  }
  return g;
}

function bodyWasp(b, c, h, o) {
  const dk = K.black, L = o.lost;
  // low wedge: pointed nose, cab set back, big rear wing
  b.slab(-1.9, 0.78, 0.22, 0.62, 0.2, 0.84, 0.2, 0.62, c, c);       // main hull
  if (!L.hood) b.slab(0.2, 0.84, 0.2, 0.62, 1.35, 0.55, 0.2, 0.42, c, c);        // sloping bonnet
  if (!L.bumperF) b.slab(1.35, 0.55, 0.22, 0.4, 2.1, 0.16, 0.24, 0.3, c, K.white);  // nose spike
  b.slab(-0.6, 0.5, 0.62, 0.9, 0.5, 0.44, 0.62, 0.85, K.black, K.navy); // canopy
  b.slab(-0.1, 0.34, 0.9, 0.98, 0.3, 0.3, 0.9, 0.96, h, h);          // helmet roof strip
  if (!L.spoiler) { b.box(-2.0, 0.95, 0, 0.45, 0.07, 1.9, dk, c); b.box(-1.95, 0.7, 0.55, 0.3, 0.55, 0.06, dk); b.box(-1.95, 0.7, -0.55, 0.3, 0.55, 0.06, dk); }   // wing
  if (!L.doorR) b.box(0.6, 0.3, 0.88, 1.6, 0.08, 0.1, K.white);                    // side skirts stripe
  if (!L.doorL) b.box(0.6, 0.3, -0.88, 1.6, 0.08, 0.1, K.white);
  if (!L.bumperR) { b.cyl(-2.05, 0.4, 0.3, 0.1, 0.1, 0.3, 'x', 5, K.darkGrey); b.cyl(-2.05, 0.4, -0.3, 0.1, 0.1, 0.3, 'x', 5, K.darkGrey); }   // twin exhausts
  if (o.engine) { b.cyl(-1.2, 0.72, 0.35, 0.09, 0.09, 0.5, 'x', 5, K.orange); b.cyl(-1.2, 0.72, -0.35, 0.09, 0.09, 0.5, 'x', 5, K.orange); }
  if (o.armor) { if (!L.doorR) b.box(0.3, 0.45, 0.9, 1.7, 0.3, 0.05, K.lightGrey); if (!L.doorL) b.box(0.3, 0.45, -0.9, 1.7, 0.3, 0.05, K.lightGrey); }
  if (!L.turret) b.box(1.7, 0.48, 0, 0.12, 0.08, 0.1, K.yellow); // MG muzzle
}
function bodyHammer(b, c, h, o) {
  const L = o.lost;
  b.box(-0.1, 0.62, 0, 4.2, 0.62, 1.9, c, c);                      // wide lower body
  if (!L.hood) b.slab(0.9, 0.95, 0.9, 0.93, 2.35, 0.85, 0.5, 0.82, c, c);        // bonnet
  b.slab(-1.0, 0.8, 0.93, 1.45, 0.5, 0.62, 0.93, 1.38, K.black, K.navy); // cab
  b.box(-0.3, 1.5, 0, 0.9, 0.06, 0.9, h);                           // helmet-coloured roof
  if (!L.spoiler) b.box(-1.6, 0.95, 0, 1.3, 0.2, 1.9, c, K.darkGrey);               // rear deck
  if (!L.bumperF) b.box(2.35, 0.55, 0, 0.3, 0.38, 2.1, K.darkGrey);                 // bumper
  if (!L.doorR) b.box(0.5, 0.45, 1.02, 3.0, 0.22, 0.14, K.darkGrey);              // fat skirts
  if (!L.doorL) b.box(0.5, 0.45, -1.02, 3.0, 0.22, 0.14, K.darkGrey);
  if (!L.turret) {
    b.box(-0.6, 1.6, 0, 0.5, 0.2, 0.5, K.darkGrey);                  // roof gun mount
    b.cyl(-0.6, 1.8, 0, 0.18, 0.15, 0.3, 'y', 6, K.lightGrey);
    b.cyl(0.35, 1.84, 0.12, 0.07, 0.07, 1.4, 'x', 5, K.darkGrey);     // twin barrels
    b.cyl(0.35, 1.84, -0.12, 0.07, 0.07, 1.4, 'x', 5, K.darkGrey);
    b.box(1.05, 1.84, 0, 0.12, 0.2, 0.36, K.black);
  }
  b.box(-2.3, 0.7, 0.8, 0.12, 0.5, 0.12, K.lightGrey);              // exhaust stacks
  b.box(-2.3, 0.7, -0.8, 0.12, 0.5, 0.12, K.lightGrey);
  if (!L.hood) b.box(1.75, 0.95, 0.5, 0.35, 0.16, 0.45, K.orange);               // bonnet scoop
  if (!L.bumperR) b.box(-2.0, 0.55, 0.0, 0.12, 0.15, 1.5, K.red); // tail bar
  if (o.engine) b.box(1.2, 1.1, 0, 0.6, 0.2, 0.8, K.orange);
  if (o.armor) { if (!L.doorR) b.box(0.4, 0.8, 1.0, 2.8, 0.3, 0.06, K.lightGrey); if (!L.doorL) b.box(0.4, 0.8, -1.0, 2.8, 0.3, 0.06, K.lightGrey); }
}
function bodyBulwark(b, c, h, o) {
  const L = o.lost;
  b.box(0, 0.85, 0, 4.4, 0.95, 2.1, c, c);                         // tall boxy hull
  b.box(-0.3, 1.65, 0, 2.2, 0.7, 1.8, c, K.darkGrey);              // upper block
  b.box(0.82, 1.7, 0, 0.08, 0.38, 1.5, K.black);                   // narrow windscreen slit
  b.box(-0.9, 1.7, 1.0, 0.8, 0.22, 0.04, K.black);                 // side slits
  b.box(-0.9, 1.7, -1.0, 0.8, 0.22, 0.04, K.black);
  if (!L.hood) b.box(-0.3, 2.05, 0, 1.0, 0.1, 1.0, h);                          // hatch in helmet colour
  for (const z of [1, -1]) {                                       // bolted side plates
    if (z > 0 ? L.doorR : L.doorL) continue;
    b.box(0.6, 0.85, z * 1.12, 1.9, 0.85, 0.12, K.darkGrey);
    b.box(-1.1, 0.85, z * 1.12, 1.5, 0.85, 0.12, K.lightGrey);
    for (let i = 0; i < 4; i++) b.box(-0.2 + i * 0.1 - 0.5, 1.12, z * 1.2, 0.1, 0.1, 0.06, K.yellow);
  }
  if (!L.bumperF) {
    b.box(2.35, 0.55, 0, 0.35, 0.6, 2.3, K.darkGrey);                // bull bar
    b.box(2.5, 0.35, 0, 0.1, 0.1, 2.3, K.yellow);
    for (const z of [-0.9, -0.3, 0.3, 0.9]) b.box(2.45, 0.8, z, 0.1, 0.5, 0.12, K.black); // grille bars
  }
  if (!L.bumperR) b.box(-2.3, 0.8, 0, 0.2, 0.9, 2.0, K.darkGrey);                  // rear plate
  if (!L.spoiler) {
    b.cyl(-1.5, 2.2, 0.8, 0.12, 0.12, 0.9, 'y', 5, K.darkGrey);       // twin stacks
    b.cyl(-1.5, 2.2, -0.8, 0.12, 0.12, 0.9, 'y', 5, K.darkGrey);
    if (o.engine) b.cyl(-1.5, 2.8, 0.8, 0.16, 0.1, 0.3, 'y', 5, K.orange);
  }
  if (o.armor) { if (!L.doorR) b.box(0.6, 1.6, 0.98, 1.6, 0.9, 0.08, K.lightGrey); if (!L.doorL) b.box(0.6, 1.6, -0.98, 1.6, 0.9, 0.08, K.lightGrey); }
}
/** Emissive lights per car (local frame): [x, y, z, sx, sy, sz, colour, intensity]. Underglow takes the helmet/accent colour. */
const LIGHTS = {
  wasp: [[1.55, 0.38, 0.28, 0.1, 0.06, 0.2, K.white, 3], [1.55, 0.38, -0.28, 0.1, 0.06, 0.2, K.white, 3], [-2.1, 0.58, 0, 0.06, 0.07, 1.1, K.red, 2.6], [0.1, 0.1, 0.9, 2.6, 0.05, 0.05, 'a', 2.2], [0.1, 0.1, -0.9, 2.6, 0.05, 0.05, 'a', 2.2]],
  hammer: [[2.5, 0.8, 0.75, 0.08, 0.12, 0.32, K.white, 3], [2.5, 0.8, -0.75, 0.08, 0.12, 0.32, K.white, 3], [-2.17, 0.62, 0, 0.06, 0.08, 1.5, K.red, 2.6], [0.4, 0.14, 1.06, 3.2, 0.05, 0.05, 'a', 2.2], [0.4, 0.14, -1.06, 3.2, 0.05, 0.05, 'a', 2.2]],
  bulwark: [[2.57, 1.15, 0.85, 0.06, 0.16, 0.4, K.white, 3], [2.57, 1.15, -0.85, 0.06, 0.16, 0.4, K.white, 3], [-2.42, 1.0, 0.7, 0.05, 0.12, 0.5, K.red, 2.6], [-2.42, 1.0, -0.7, 0.05, 0.12, 0.5, K.red, 2.6], [0.2, 0.2, 1.16, 3.6, 0.05, 0.05, 'a', 2.2], [0.2, 0.2, -1.16, 3.6, 0.05, 0.05, 'a', 2.2]],
};
function glowGeometry(id, accent) {
  const g = new MeshBuilder({ ao: 0, jitter: 0 });
  for (const [x, y, z, sx, sy, sz, c, k] of LIGHTS[id]) {
    g.box(x, y, z, sx, sy, sz, c === 'a' ? accent : c);
  }
  const col = g.c, arr = LIGHTS[id];
  for (let i = 0; i < arr.length; i++) for (let v = 0; v < 36; v++) for (let q = 0; q < 3; q++) col[(i * 36 + v) * 3 + q] *= arr[i][7];
  return g.build();
}
const BODIES = { wasp: bodyWasp, hammer: bodyHammer, bulwark: bodyBulwark };

function bodyGeometry(id, color, helmetColor, wrecked, up, lost) {
  const b = new MeshBuilder({ smooth: 46, jitter: 0.035, ao: 0.34, aoSpan: 0.95 });
  (BODIES[id])(b, wrecked ? K.darkGrey : color, wrecked ? K.black : helmetColor, { engine: (up.engine | 0) > 0, armor: (up.armor | 0) > 0, lost: lostSet(lost) });
  if (wrecked) { b.box(0, 1.3, 0, 1.4, 0.3, 1.2, K.black); b.box(0.5, 0.9, 0.3, 1.0, 0.2, 0.6, K.rust); b.box(-0.9, 0.95, -0.3, 1.2, 0.1, 0.9, K.black); b.box(1.0, 0.7, -0.4, 0.7, 0.35, 0.5, K.rust); }
  return b.build();
}
/**
 * Progressive damage: rebuild the body without the parts in `lost` (array of ids from the sim's 'partLost' events) and hide lost wheels.
 * Cheap enough for the rare event it answers; the old geometry is disposed.
 */
export function applyLostParts(g, { color = K.red, helmetColor = K.yellow, lost = [], wrecked = false, upgrades = null } = {}) {
  const ud = g.userData, body = ud.body;
  if (!body) return;
  const old = body.geometry;
  body.geometry = bodyGeometry(ud.carId, color, helmetColor, wrecked, upgrades || {}, lost);
  old.dispose();
  const L = lostSet(lost);
  for (const [part, i] of Object.entries(WHEEL_OF)) if (ud.wheels[i] && ud.wheels[i].parent) ud.wheels[i].parent.visible = !L[part];
}
/**
 * buildCarMesh({carId, color, helmetColor, wrecked?, upgrades?}) -> THREE.Group
 * userData: { carId, wheels:[Object3D x4 spin about z], frontPivots:[2], wheelRadius, body:Mesh, length, width }
 */
export function buildCarMesh({ carId = 'wasp', color = K.red, helmetColor = K.yellow, wrecked = false, upgrades = null, lost = null } = {}) {
  const spec = carSpec(carId);
  const id = SPECS[carId] ? carId : 'wasp';
  const up = upgrades || {};
  const g = new THREE.Group();
  g.name = `car-${id}`;
  const body = new THREE.Mesh(bodyGeometry(id, color, helmetColor, wrecked, up, lost), carMaterial());
  body.name = 'body';
  g.add(body);
  if (!wrecked) { const glow = new THREE.Mesh(glowGeometry(id, helmetColor), glowMaterial()); glow.name = 'lights'; body.add(glow); }
  const rim = wrecked ? K.darkGrey : (up.tyres | 0) > 0 ? K.yellow : K.lightGrey;
  const wg = wheelGeometry(spec.wheelR, spec.wheelW, rim);
  const wheels = [];
  const frontPivots = [];
  for (const [x, z, front] of [[spec.front, spec.track, true], [spec.front, -spec.track, true], [spec.rear, spec.track, false], [spec.rear, -spec.track, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, spec.wheelR, z);
    const w = new THREE.Mesh(wg, wheelMaterial());
    pivot.add(w);
    g.add(pivot);
    wheels.push(w);
    if (front) frontPivots.push(pivot);
  }
  { const L = lostSet(lost); for (const [part, i] of Object.entries(WHEEL_OF)) if (L[part]) wheels[i].parent.visible = false; }
  g.userData = { carId: id, wheels, frontPivots, wheelRadius: spec.wheelR, body, length: spec.length, width: spec.width, wrecked: !!wrecked };
  return g;
}
