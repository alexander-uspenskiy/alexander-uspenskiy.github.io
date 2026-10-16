// Procedural low-poly car meshes. Local frame: +X forward, +Y up, +Z driver's right, origin = CG at ground.
// Body = one merged vertex-coloured mesh; 4 wheels share one geometry. Node-safe (no DOM / WebGL).
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

let _mat = null;
/** Shared lit vertex-colour material (flat shading). */
export function carMaterial() {
  if (!_mat) {
    _mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    _mat.userData.shared = true;
  }
  return _mat;
}
const _wheelGeo = new Map();
function wheelGeometry(r, w, rim) {
  const key = `${r}|${w}|${rim}`;
  let g = _wheelGeo.get(key);
  if (!g) {
    const b = new MeshBuilder();
    b.cyl(0, 0, 0, r, r, w, 'z', 8, K.black, K.darkGrey);
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
  const dk = K.black;
  // low wedge: pointed nose, cab set back, big rear wing
  b.slab(-1.9, 0.78, 0.22, 0.62, 0.2, 0.84, 0.2, 0.62, c, c);       // main hull
  b.slab(0.2, 0.84, 0.2, 0.62, 1.35, 0.55, 0.2, 0.42, c, c);        // sloping bonnet
  b.slab(1.35, 0.55, 0.22, 0.4, 2.1, 0.16, 0.24, 0.3, c, K.white);  // nose spike
  b.slab(-0.6, 0.5, 0.62, 0.9, 0.5, 0.44, 0.62, 0.85, K.black, K.navy); // canopy
  b.slab(-0.1, 0.34, 0.9, 0.98, 0.3, 0.3, 0.9, 0.96, h, h);          // helmet roof strip
  b.box(-2.0, 0.95, 0, 0.45, 0.07, 1.9, dk, c);                      // wing
  b.box(-1.95, 0.7, 0.55, 0.3, 0.55, 0.06, dk);
  b.box(-1.95, 0.7, -0.55, 0.3, 0.55, 0.06, dk);
  b.box(0.6, 0.3, 0.88, 1.6, 0.08, 0.1, K.white);                    // side skirts stripe
  b.box(0.6, 0.3, -0.88, 1.6, 0.08, 0.1, K.white);
  b.cyl(-2.05, 0.4, 0.3, 0.1, 0.1, 0.3, 'x', 5, K.darkGrey);         // twin exhausts
  b.cyl(-2.05, 0.4, -0.3, 0.1, 0.1, 0.3, 'x', 5, K.darkGrey);
  if (o.engine) { b.cyl(-1.2, 0.72, 0.35, 0.09, 0.09, 0.5, 'x', 5, K.orange); b.cyl(-1.2, 0.72, -0.35, 0.09, 0.09, 0.5, 'x', 5, K.orange); }
  if (o.armor) { b.box(0.3, 0.45, 0.9, 1.7, 0.3, 0.05, K.lightGrey); b.box(0.3, 0.45, -0.9, 1.7, 0.3, 0.05, K.lightGrey); }
  b.box(1.7, 0.48, 0, 0.12, 0.08, 0.1, K.yellow); // MG muzzle
}
function bodyHammer(b, c, h, o) {
  b.box(-0.1, 0.62, 0, 4.2, 0.62, 1.9, c, c);                      // wide lower body
  b.slab(0.9, 0.95, 0.9, 0.93, 2.35, 0.85, 0.5, 0.82, c, c);        // bonnet
  b.slab(-1.0, 0.8, 0.93, 1.45, 0.5, 0.62, 0.93, 1.38, K.black, K.navy); // cab
  b.box(-0.3, 1.5, 0, 0.9, 0.06, 0.9, h);                           // helmet-coloured roof
  b.box(-1.6, 0.95, 0, 1.3, 0.2, 1.9, c, K.darkGrey);               // rear deck
  b.box(2.35, 0.55, 0, 0.3, 0.38, 2.1, K.darkGrey);                 // bumper
  b.box(0.5, 0.45, 1.02, 3.0, 0.22, 0.14, K.darkGrey);              // fat skirts
  b.box(0.5, 0.45, -1.02, 3.0, 0.22, 0.14, K.darkGrey);
  b.box(-0.6, 1.6, 0, 0.5, 0.2, 0.5, K.darkGrey);                  // roof gun mount
  b.cyl(-0.6, 1.8, 0, 0.18, 0.15, 0.3, 'y', 6, K.lightGrey);
  b.cyl(0.35, 1.84, 0.12, 0.07, 0.07, 1.4, 'x', 5, K.darkGrey);     // twin barrels
  b.cyl(0.35, 1.84, -0.12, 0.07, 0.07, 1.4, 'x', 5, K.darkGrey);
  b.box(1.05, 1.84, 0, 0.12, 0.2, 0.36, K.black);
  b.box(-2.3, 0.7, 0.8, 0.12, 0.5, 0.12, K.lightGrey);              // exhaust stacks
  b.box(-2.3, 0.7, -0.8, 0.12, 0.5, 0.12, K.lightGrey);
  b.box(1.75, 0.95, 0.5, 0.35, 0.16, 0.45, K.orange);               // bonnet scoop
  b.box(-2.0, 0.55, 0.0, 0.12, 0.15, 1.5, K.red); // tail bar
  if (o.engine) b.box(1.2, 1.1, 0, 0.6, 0.2, 0.8, K.orange);
  if (o.armor) { b.box(0.4, 0.8, 1.0, 2.8, 0.3, 0.06, K.lightGrey); b.box(0.4, 0.8, -1.0, 2.8, 0.3, 0.06, K.lightGrey); }
}
function bodyBulwark(b, c, h, o) {
  b.box(0, 0.85, 0, 4.4, 0.95, 2.1, c, c);                         // tall boxy hull
  b.box(-0.3, 1.65, 0, 2.2, 0.7, 1.8, c, K.darkGrey);              // upper block
  b.box(0.82, 1.7, 0, 0.08, 0.38, 1.5, K.black);                   // narrow windscreen slit
  b.box(-0.9, 1.7, 1.0, 0.8, 0.22, 0.04, K.black);                 // side slits
  b.box(-0.9, 1.7, -1.0, 0.8, 0.22, 0.04, K.black);
  b.box(-0.3, 2.05, 0, 1.0, 0.1, 1.0, h);                          // hatch in helmet colour
  for (const z of [1, -1]) {                                       // bolted side plates
    b.box(0.6, 0.85, z * 1.12, 1.9, 0.85, 0.12, K.darkGrey);
    b.box(-1.1, 0.85, z * 1.12, 1.5, 0.85, 0.12, K.lightGrey);
    for (let i = 0; i < 4; i++) b.box(-0.2 + i * 0.1 - 0.5, 1.12, z * 1.2, 0.1, 0.1, 0.06, K.yellow);
  }
  b.box(2.35, 0.55, 0, 0.35, 0.6, 2.3, K.darkGrey);                // bull bar
  b.box(2.5, 0.35, 0, 0.1, 0.1, 2.3, K.yellow);
  for (const z of [-0.9, -0.3, 0.3, 0.9]) b.box(2.45, 0.8, z, 0.1, 0.5, 0.12, K.black); // grille bars
  b.box(-2.3, 0.8, 0, 0.2, 0.9, 2.0, K.darkGrey);                  // rear plate
  b.cyl(-1.5, 2.2, 0.8, 0.12, 0.12, 0.9, 'y', 5, K.darkGrey);       // twin stacks
  b.cyl(-1.5, 2.2, -0.8, 0.12, 0.12, 0.9, 'y', 5, K.darkGrey);
  if (o.engine) b.cyl(-1.5, 2.8, 0.8, 0.16, 0.1, 0.3, 'y', 5, K.orange);
  if (o.armor) { b.box(0.6, 1.6, 0.98, 1.6, 0.9, 0.08, K.lightGrey); b.box(0.6, 1.6, -0.98, 1.6, 0.9, 0.08, K.lightGrey); }
}
const BODIES = { wasp: bodyWasp, hammer: bodyHammer, bulwark: bodyBulwark };

/**
 * buildCarMesh({carId, color, helmetColor, wrecked?, upgrades?}) -> THREE.Group
 * userData: { carId, wheels:[Object3D x4 spin about z], frontPivots:[2], wheelRadius, body:Mesh, length, width }
 */
export function buildCarMesh({ carId = 'wasp', color = K.red, helmetColor = K.yellow, wrecked = false, upgrades = null } = {}) {
  const spec = carSpec(carId);
  const id = SPECS[carId] ? carId : 'wasp';
  const up = upgrades || {};
  const g = new THREE.Group();
  g.name = `car-${id}`;
  const b = new MeshBuilder();
  (BODIES[id])(b, wrecked ? K.darkGrey : color, wrecked ? K.black : helmetColor, { engine: (up.engine | 0) > 0, armor: (up.armor | 0) > 0 });
  if (wrecked) { b.box(0, 1.3, 0, 1.4, 0.3, 1.2, K.black); b.box(0.5, 0.9, 0.3, 1.0, 0.2, 0.6, K.rust); }
  const body = new THREE.Mesh(b.build(), carMaterial());
  body.name = 'body';
  g.add(body);
  const rim = wrecked ? K.darkGrey : (up.tyres | 0) > 0 ? K.yellow : K.lightGrey;
  const wg = wheelGeometry(spec.wheelR, spec.wheelW, rim);
  const wheels = [];
  const frontPivots = [];
  for (const [x, z, front] of [[spec.front, spec.track, true], [spec.front, -spec.track, true], [spec.rear, spec.track, false], [spec.rear, -spec.track, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, spec.wheelR, z);
    const w = new THREE.Mesh(wg, carMaterial());
    pivot.add(w);
    g.add(pivot);
    wheels.push(w);
    if (front) frontPivots.push(pivot);
  }
  g.userData = { carId: id, wheels, frontPivots, wheelRadius: spec.wheelR, body, length: spec.length, width: spec.width, wrecked: !!wrecked };
  return g;
}
