// Garage / car-select turntable on its own canvas (own WebGL context; call dispose() when leaving the screen).
import * as THREE from 'three';
import { buildCarMesh } from './carModel.js';
import { disposeObject, colorRGB } from './geomUtil.js';
import { COLOR as K } from './paletteRef.js';
import { createPalettePass } from './palettePass.js';

/** createCarPreview(canvas, opts?) -> { show({carId,color,upgrades,helmetColor}), setSpin(bool), resize(), dispose() } */
export function createCarPreview(canvas, opts = {}) {
  const renderer = opts.renderer || new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  if (renderer.setClearColor) renderer.setClearColor(0x0b0b14, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 100);
  camera.position.set(6.2, 3.2, 7.4); camera.lookAt(0, 0.8, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5f574f, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-5, 8, 6); scene.add(sun);
  const floorGeo = new THREE.CylinderGeometry(4, 4.2, 0.2, 12);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color(...colorRGB(K.darkGrey)), flatShading: true }));
  floor.position.y = -0.1; scene.add(floor);
  const stage = new THREE.Group(); scene.add(stage);
  let car = null, spin = true, angle = 0.6, raf = 0, last = 0, pass = null, disposed = false;
  if (opts.palettePass) pass = createPalettePass(renderer, { scale: 2 });

  function resize() {
    const w = canvas.clientWidth || canvas.width || 300, h = canvas.clientHeight || canvas.height || 200;
    renderer.setPixelRatio(typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (pass) pass.setSize(w, h);
  }
  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
    if (spin) angle += dt * 0.7;
    stage.rotation.y = angle;
    if (car) for (const w of car.userData.wheels) w.rotation.z -= dt * 0.5;
    if (pass && pass.enabled) pass.render(scene, camera); else renderer.render(scene, camera);
  }
  function show({ carId = 'wasp', color = K.red, upgrades = null, helmetColor = K.yellow } = {}) {
    if (car) { stage.remove(car); disposeObject(car); }
    car = buildCarMesh({ carId, color, helmetColor, upgrades });
    stage.add(car);
    if (!raf && typeof requestAnimationFrame !== 'undefined') { resize(); raf = requestAnimationFrame(frame); }
  }
  return {
    show, resize,
    setSpin(b) { spin = !!b; },
    get car() { return car; },
    dispose() {
      disposed = true;
      if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
      if (car) disposeObject(car);
      floorGeo.dispose(); floor.material.dispose();
      if (pass) pass.dispose();
      renderer.dispose();
    },
  };
}
