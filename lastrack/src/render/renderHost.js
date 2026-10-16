// One WebGL context + scene + camera shared by race controllers. Full-colour modern rendering: no palette quantise, no dithering.
// attachPBR() (render/pbr/pbrHost.js) layers ACES, IBL, shadows and the post stack on top of this host and replaces resize/render.
import * as THREE from 'three';

/**
 * createRenderHost(canvas, opts?) -> { renderer, scene, camera, resize(w,h), setPalettePass(bool) [no-op, kept for API compat], render(), dispose() }
 * opts: { antialias=true, renderer? (inject for tests), fov=62 }. Legacy opts (palettePass, pixelScale, dither) are accepted and ignored.
 */
export function createRenderHost(canvas, opts = {}) {
  const renderer = opts.renderer || new THREE.WebGLRenderer({ canvas, antialias: opts.antialias !== false, powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  if (renderer.setClearColor) renderer.setClearColor(0x0b0b14, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 62, 1, 0.5, 2500);
  let w = 0, h = 0;
  const onLost = (e) => e.preventDefault();
  if (canvas && canvas.addEventListener) canvas.addEventListener('webglcontextlost', onLost);

  const host = {
    renderer, scene, camera,
    pixelScale: 1,
    /** Legacy: the palette pass was removed; always false (callers that scale by pixelScale when active keep working). */
    get palettePassActive() { return false; },
    resize(nw, nh) {
      w = nw || (canvas && (canvas.clientWidth || canvas.width)) || 1;
      h = nh || (canvas && (canvas.clientHeight || canvas.height)) || 1;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      if (renderer.setPixelRatio) renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    /** No-op (palette quantise pass removed). */
    setPalettePass() {},
    render() { renderer.render(scene, camera); },
    dispose() {
      if (canvas && canvas.removeEventListener) canvas.removeEventListener('webglcontextlost', onLost);
      renderer.dispose();
    },
  };
  if (canvas) host.resize();
  return host;
}
