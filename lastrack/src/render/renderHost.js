// One WebGL context + scene + camera shared by race controllers. Optional palette-quantise post pass.
import * as THREE from 'three';
import { createPalettePass } from './palettePass.js';

/**
 * createRenderHost(canvas, opts?) -> { renderer, scene, camera, resize(w,h), setPalettePass(bool), render(), dispose() }
 * opts: { palettePass=true, pixelScale=2, dither=0.08, renderer? (inject for tests), fov=62 }
 */
export function createRenderHost(canvas, opts = {}) {
  const renderer = opts.renderer || new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  if (renderer.setClearColor) renderer.setClearColor(0x0b0b14, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 62, 1, 0.5, 2500);
  let pass = null;
  let wantPass = opts.palettePass !== false;
  let w = 0, h = 0;
  const onLost = (e) => e.preventDefault();
  if (canvas && canvas.addEventListener) canvas.addEventListener('webglcontextlost', onLost);

  const host = {
    renderer, scene, camera,
    pixelScale: opts.pixelScale || 2,
    get palettePassActive() { return !!(pass && pass.enabled); },
    resize(nw, nh) {
      w = nw || (canvas && (canvas.clientWidth || canvas.width)) || 1;
      h = nh || (canvas && (canvas.clientHeight || canvas.height)) || 1;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      if (renderer.setPixelRatio) renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (pass) pass.setSize(w, h);
    },
    setPalettePass(on) {
      wantPass = !!on;
      if (wantPass && !pass) {
        pass = createPalettePass(renderer, { scale: opts.pixelScale || 2, dither: opts.dither ?? 0.08 });
        if (pass && w) pass.setSize(w, h);
      }
      if (pass) pass.enabled = wantPass && pass.ok;
    },
    render() {
      if (pass && pass.enabled) pass.render(scene, camera);
      else renderer.render(scene, camera);
    },
    dispose() {
      if (canvas && canvas.removeEventListener) canvas.removeEventListener('webglcontextlost', onLost);
      if (pass) pass.dispose();
      renderer.dispose();
    },
  };
  if (wantPass) host.setPalettePass(true);
  if (canvas) host.resize();
  return host;
}
