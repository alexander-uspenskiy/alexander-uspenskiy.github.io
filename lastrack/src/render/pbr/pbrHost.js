// Attaches the PBR pipeline (ACES, IBL environment, soft shadows, post stack) to a render host. Slice-only; the normal game never calls this.
import * as THREE from 'three';
import { createPost } from './post.js';
import { makeEnvTextures, sunDir } from './env.js';
import { resolveQuality, DEFAULT_QUALITY } from './quality.js';

/** Directional key light configured for the quality; call followShadow() each frame with the focus point. */
export function makeKeyLight(q, { intensity = 3.2, color = 0xffb98a, area = 14 } = {}) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.castShadow = true;
  l.shadow.mapSize.set(q.shadowMap, q.shadowMap);
  const c = l.shadow.camera; c.left = -area; c.right = area; c.top = area; c.bottom = -area; c.near = 1; c.far = 120;
  l.shadow.bias = -0.0004; l.shadow.normalBias = 0.03; l.shadow.radius = q.shadowSoft ? 3 : 1;
  const d = sunDir(); l.userData.dir = new THREE.Vector3(d[0], Math.max(0.35, d[1] * 2.6), d[2]).normalize();
  l.position.copy(l.userData.dir).multiplyScalar(50);
  return l;
}
export function followShadow(light, x, y, z) {
  light.target.position.set(x, y, z); light.target.updateMatrixWorld();
  light.position.set(x, y, z).addScaledVector(light.userData.dir, 50);
}

/**
 * attachPBR(host, { quality, env }) -> controller { setQuality(name), quality, qualityName, setEnv(kind), render(dt), stats, post, dispose() }.
 * Replaces host.render/resize. Safe to call once per host.
 */
export function attachPBR(host, { quality = DEFAULT_QUALITY, env = 'dusk', background = true } = {}) {
  const renderer = host.renderer, scene = host.scene;
  if (host.setPalettePass) host.setPalettePass(false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  let qName = quality, q = resolveQuality(qName), post = null, envTex = null, envKind = env, last = performance.now();
  const sizeV = new THREE.Vector2();
  const origResize = host.resize.bind(host), origRender = host.render.bind(host);
  const stats = { calls: 0, tris: 0, passes: 0, ms: 0 };
  renderer.info.autoReset = false;

  function applyEnv() {
    if (envTex) { envTex.dispose(); envTex = null; }
    envTex = makeEnvTextures(renderer, envKind, q.envSize);
    scene.environment = envTex.envMap; scene.environmentIntensity = q.reflections;
    if (background) { scene.background = envTex.background; scene.backgroundIntensity = 1; scene.backgroundBlurriness = envKind === 'showroom' ? 0.35 : 0.0; }
  }
  function applyQuality() {
    renderer.shadowMap.type = q.shadowSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.needsUpdate = true;
    if (post) { post.dispose(); post = null; }
    if (q.post) { try { post = createPost(renderer, q); renderer.getDrawingBufferSize(sizeV); if (sizeV.x > 2) post.setSize(sizeV.x, sizeV.y); } catch (e) { console.warn('[pbr] post disabled', e); post = null; } }
    scene.traverse((o) => { if (o.isLight && o.shadow) { o.shadow.mapSize.set(q.shadowMap, q.shadowMap); if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } o.shadow.radius = q.shadowSoft ? 3 : 1; } });
    scene.environmentIntensity = q.reflections;
  }
  function resize(w, h) {
    origResize(w, h);
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, q.dpr);
    renderer.setPixelRatio(dpr); renderer.setSize(w || 1, h || 1, false);
    renderer.getDrawingBufferSize(sizeV);
    if (post) post.setSize(sizeV.x, sizeV.y);
  }
  host.resize = resize;
  applyQuality(); applyEnv();
  host.render = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    renderer.info.reset();
    if (post && post.ok) { try { post.render(scene, host.camera, dt); } catch (e) { console.warn('[pbr] post failed, falling back', e); post = null; renderer.render(scene, host.camera); } }
    else { renderer.setRenderTarget(null); renderer.render(scene, host.camera); }
    stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles; stats.passes = post ? post.stats.passes : 1; stats.ms = performance.now() - now;
  };
  const ctl = {
    stats, get envBackground() { return envTex && envTex.background; }, get post() { return post; }, get quality() { return q; }, get qualityName() { return qName; },
    setQuality(name) {
      qName = QUALITY_KEYS.includes(name) ? name : qName; q = resolveQuality(qName);
      applyQuality(); applyEnv(); if (host.camera) { const s = renderer.getSize(sizeV); resize(s.x, s.y); }
      try { localStorage.setItem('lasttrack.quality', qName); } catch { /* ignore */ }
      return qName;
    },
    /** Camera motion blur strength 0..1 (0 = off). Race scales it by speed; static/showroom views keep it 0. */
    setMotionBlur(a) { if (post) post.motionBlur = Math.max(0, Math.min(1, a || 0)); },
    setEnv(kind) { envKind = kind; applyEnv(); },
    dispose() { if (post) post.dispose(); if (envTex) envTex.dispose(); host.resize = origResize; host.render = origRender; renderer.info.autoReset = true; scene.environment = null; },
  };
  host.pbr = ctl;
  return ctl;
}
const QUALITY_KEYS = ['low', 'med', 'high'];
