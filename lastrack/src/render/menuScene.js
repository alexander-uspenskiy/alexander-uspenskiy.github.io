// Cinematic menu stage rendered into the main host: a hero car on a wet reflective neon street, fog, volumetric light cones, dust.
// Used behind the title / car select / garage / armory screens. Needs a host with WebGL; every part degrades with quality ('low' = lite).
import * as THREE from 'three';
import { buildHeroCarPBR } from './pbr/heroCarPBR.js';
import { PBR_PALETTE } from './pbr/paints.js';
import { makeKeyLight, followShadow } from './pbr/pbrHost.js';
import { buildCarMesh } from './carModel.js';
import { disposeObject } from './geomUtil.js';
import { mulberry32 } from '../core/mathUtil.js';

/** Pure: camera pose for a stage mode at time t (s). Returns {x,y,z,lx,ly,lz,fov, turn} (turn = turntable angular speed rad/s). */
export function stageCamera(mode, t, { yaw = 0, pitch = 0, dist = 1 } = {}) {
  if (mode === 'title') {
    const a = 0.55 + t * 0.11 + yaw, r = 13.6 * dist;
    return { x: Math.sin(a) * r, y: 1.5 + Math.sin(t * 0.21) * 0.3 + pitch * 4, z: Math.cos(a) * r, lx: 0, ly: 0.75, lz: 0, fov: 34, turn: 0 };
  }
  const r = (mode === 'garage' ? 13 : 11.2) * dist, a = 0.62 + yaw;
  return { x: Math.sin(a) * r, y: 2.6 + pitch * 6, z: Math.cos(a) * r, lx: 0, ly: 0.7, lz: 0, fov: mode === 'garage' ? 34 : 33, turn: 0.45 };
}

const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function floorTextures(seed = 7) {
  const r = mulberry32(seed), S = 512;
  const grid = mkCanvas(S, S), g = grid.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(53,230,255,.9)'; g.lineWidth = 2;
  for (let i = 0; i <= S; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  g.strokeStyle = 'rgba(255,61,240,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(S, 0); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, S); g.stroke();
  const rough = mkCanvas(S, S), q = rough.getContext('2d');
  q.fillStyle = 'rgb(72,72,72)'; q.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {           // puddles: mirror smooth
    const x = r() * S, y = r() * S, rad = 30 + r() * 90, gr = q.createRadialGradient(x, y, 4, x, y, rad);
    gr.addColorStop(0, 'rgb(6,6,6)'); gr.addColorStop(0.7, 'rgb(20,20,20)'); gr.addColorStop(1, 'rgba(72,72,72,0)'); q.fillStyle = gr; q.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const gt = new THREE.CanvasTexture(grid), rt = new THREE.CanvasTexture(rough);
  for (const t of [gt, rt]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.anisotropy = 4; }
  gt.colorSpace = THREE.SRGBColorSpace;
  return { gt, rt };
}

function windowsTexture(seed = 3) {
  const r = mulberry32(seed), c = mkCanvas(256, 512), g = c.getContext('2d');
  g.fillStyle = '#05070c'; g.fillRect(0, 0, 256, 512);
  const cols = ['#35e6ff', '#ff3df0', '#ffb02e', '#9fd8ff'];
  for (let y = 6; y < 506; y += 10) for (let x = 6; x < 250; x += 9) if (r() < 0.12) { g.fillStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = 0.25 + r() * 0.6; g.fillRect(x, y, 3, 5); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function coneMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 0.5 } },
    vertexShader: 'varying float vH; varying float vF; void main(){ vH = clamp(position.y / 9.0 + 0.5, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position,1.0); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uStrength; varying float vH; varying float vF; void main(){ float a = uStrength * pow(vF, 1.6) * (0.12 + 0.88 * pow(1.0 - vH, 1.3)); gl_FragColor = vec4(uColor * a, a); }',
  });
}

/**
 * createMenuScene(host, { canvas }) -> { show(), hide(), update(dt), setCar({carId,color,upgrades}), setMode(mode, {side}), setParallax(x,y), setQuality(name), dispose(), shown }
 * modes: 'title' (orbiting camera), 'showcase' (car select turntable), 'garage'. side: +1 car on the right half, -1 left, 0 centred.
 */
export function createMenuScene(host, { canvas = null } = {}) {
  const scene = host.scene, cam = host.camera, renderer = host.renderer;
  const group = new THREE.Group(); group.name = 'menu-stage';
  const q0 = host.pbr ? host.pbr.quality : { shadowMap: 1024, shadowSoft: false };
  const key = makeKeyLight(q0, { intensity: 2.6, color: 0xfff0e6, area: 9 }); key.userData.dir.set(0.4, 0.95, 0.5).normalize();
  const rimC = new THREE.DirectionalLight(0x35e6ff, 3.2); rimC.position.set(-7, 3.5, -6);
  const rimM = new THREE.DirectionalLight(0xff3df0, 2.4); rimM.position.set(7, 2.5, -5);
  const fill = new THREE.PointLight(0xffb02e, 14, 16, 2); fill.position.set(3.4, 0.9, 5.4);
  const amb = new THREE.HemisphereLight(0x405a8a, 0x0a0710, 0.35);
  group.add(key, key.target, rimC, rimM, fill, amb);

  // ----- floor (wet asphalt with neon grid + puddles) -----
  const { gt, rt } = floorTextures();
  const fadeC = mkCanvas(128, 128), fg = fadeC.getContext('2d'), fgr = fg.createRadialGradient(64, 64, 4, 64, 64, 64);
  fgr.addColorStop(0, '#9a9a9a'); fgr.addColorStop(1, '#d8d8d8'); fg.fillStyle = fgr; fg.fillRect(0, 0, 128, 128);
  const fadeT = new THREE.CanvasTexture(fadeC);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b1018, metalness: 0.85, roughness: 1, roughnessMap: rt, emissive: 0xffffff, emissiveMap: gt, emissiveIntensity: 0.22, transparent: true, opacity: 0.8, alphaMap: fadeT, envMapIntensity: 0.45 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 64).rotateX(-Math.PI / 2), floorMat);
  floor.receiveShadow = true; floor.renderOrder = 2;
  group.add(floor);

  // ----- turntable: dark disc + glowing rings -----
  const turn = new THREE.Group(); group.add(turn);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.8, 0.06, 64), new THREE.MeshStandardMaterial({ color: 0x05080f, metalness: 0.6, roughness: 0.4, envMapIntensity: 0.35 }));
  disc.position.y = 0.03; disc.receiveShadow = true; group.add(disc);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x021018, emissive: 0x35e6ff, emissiveIntensity: 3.2, roughness: 0.4 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.78, 0.035, 8, 96).rotateX(Math.PI / 2), ringMat); ring1.position.y = 0.07; group.add(ring1);
  const ringMat2 = new THREE.MeshStandardMaterial({ color: 0x180212, emissive: 0xff3df0, emissiveIntensity: 2.6, roughness: 0.4 });
  const ring2 = new THREE.Group(); group.add(ring2);
  for (let i = 0; i < 6; i++) { const a = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.028, 6, 24, Math.PI / 4).rotateX(Math.PI / 2), ringMat2); a.rotation.y = (i / 6) * Math.PI * 2; a.position.y = 0.05; ring2.add(a); }

  // ----- neon pylons + skyline -----
  const fx = new THREE.Group(); group.add(fx);
  const pylons = new THREE.Group(); fx.add(pylons);
  const pyMats = [0x35e6ff, 0xff3df0].map((c) => new THREE.MeshStandardMaterial({ color: 0x050810, emissive: c, emissiveIntensity: 3.6 }));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2, rr = 16 + (i % 3) * 3, hgt = 5 + (i % 4) * 2.2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, hgt, 0.16), pyMats[i % 2]); m.position.set(Math.cos(a) * rr, hgt / 2, Math.sin(a) * rr); pylons.add(m);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.08), pyMats[(i + 1) % 2]); bar.position.set(Math.cos(a) * rr, hgt * 0.8, Math.sin(a) * rr); bar.rotation.y = -a + Math.PI / 2; pylons.add(bar);
  }
  const city = new THREE.Group(); fx.add(city);
  const wt = windowsTexture(), r = mulberry32(11);
  const bMat = new THREE.MeshStandardMaterial({ color: 0x080b12, roughness: 0.6, metalness: 0.4, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: 0.8 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.15, rr = 42 + r() * 24, w = 5 + r() * 9, hgt = 12 + r() * r() * 70;
    const geo = new THREE.BoxGeometry(w, hgt, w); const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 18, uv.getY(k) * hgt / 36);
    const b = new THREE.Mesh(geo, bMat); b.position.set(Math.cos(a) * rr, hgt / 2, Math.sin(a) * rr); b.rotation.y = r() * 3; city.add(b);
  }

  // ----- volumetric light cones + dust -----
  const cones = new THREE.Group(); fx.add(cones);
  [[0x35e6ff, 0, 0.5], [0xff3df0, 2.1, 0.42], [0xffffff, 4.2, 0.3]].forEach(([c, a, s]) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(2.4, 9, 40, 1, true), coneMaterial(c)); m.material.uniforms.uStrength.value = s;
    m.position.set(Math.sin(a) * 4.2, 4.5, Math.cos(a) * 4.2); m.rotation.set(Math.cos(a) * 0.32, 0, -Math.sin(a) * 0.32); cones.add(m);
  });
  const N = 180, dp = new Float32Array(N * 3), dr = mulberry32(5);
  for (let i = 0; i < N; i++) { dp[i * 3] = (dr() - 0.5) * 24; dp[i * 3 + 1] = dr() * 9; dp[i * 3 + 2] = (dr() - 0.5) * 24; }
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ size: 0.07, color: 0x9fe8ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  fx.add(dust);

  // ----- car + mirror reflection -----
  const mirrorRoot = new THREE.Group(); mirrorRoot.scale.y = -1; group.add(mirrorRoot);
  let car = null, mirror = null, pairs = [], hero = null, pop = 0;
  const heroState = { speed: 0, steer: 0, ax: 0, ay: 0, throttle: 0, braking: 0, frac: 1, dmg: [0, 0, 0, 0], wet: 0.35, dirt: 0 };
  function disposeCar() {
    if (mirror) { mirrorRoot.remove(mirror); mirror = null; }
    if (car) { turn.remove(car); if (hero) { try { hero.dispose(); } catch { /* ignore */ } } else disposeObject(car); car = null; hero = null; pairs = []; }
  }
  let lastSpec = null;
  function setCar(spec = {}) {
    const { carId = 'hammer', color = 9, upgrades = null, helmetColor = 10 } = spec;
    lastSpec = spec;
    disposeCar();
    try { car = buildHeroCarPBR({ carId, color: PBR_PALETTE(color), accent: 0x35e6ff, livery: spec.livery || null }); hero = car.userData.hero || null; } catch (e) { car = null; }
    if (!car) car = buildCarMesh({ carId, color, helmetColor, upgrades });
    car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.isInstancedMesh) o.frustumCulled = false; } });
    turn.add(car);
    if (!lite) {
      mirror = car.clone(true);
      mirror.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      mirrorRoot.add(mirror);
      const a = [], b = [];
      car.traverse((o) => a.push(o)); mirror.traverse((o) => b.push(o));
      pairs = a.map((o, i) => [o, b[i]]);
    }
    pop = 1;
  }

  // ----- state -----
  let mode = 'title', side = 1, curSide = 1, shown = false, lite = false, t = 0, spin = 0;
  let yaw = 0, pitch = 0, vyaw = 0, dist = 1, dragging = false, last = null, px = 0, py = 0, tpx = 0, tpy = 0;
  let prev = null;
  const sz = new THREE.Vector2();
  const onDown = (e) => { if (e.target.closest && e.target.closest('.panel, .btn, button, input, .sel-strip, .modal')) return; dragging = true; last = [e.clientX, e.clientY]; };
  const onUp = () => { dragging = false; };
  const onMove = (e) => {
    tpx = (e.clientX / innerWidth) * 2 - 1; tpy = (e.clientY / innerHeight) * 2 - 1;
    if (!dragging) return;
    const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY];
    yaw -= dx * 0.006; vyaw = -dx * 0.006; pitch = Math.max(-0.1, Math.min(0.12, pitch + dy * 0.0008));
  };
  const onWheel = (e) => { dist = Math.max(0.65, Math.min(1.5, dist + e.deltaY * 0.0008)); };
  const api = {
    get shown() { return shown; }, get car() { return car; }, get mode() { return mode; }, get lite() { return lite; },
    setCar, setLivery(l) {
      if (!hero) return;
      lastSpec = { ...(lastSpec || {}), livery: { ...((lastSpec && lastSpec.livery) || {}), ...l } };
      hero.setLivery(l);
      if (mirror && car.getObjectByName('roof-decal') && !mirror.getObjectByName('roof-decal')) setCar(lastSpec);   // a roof decal mesh appeared: rebuild the reflection copy
    }, setParallax(x, y) { tpx = x; tpy = y; },
    setMode(m, o = {}) { mode = m; if (o.side !== undefined) side = o.side; },
    setQuality(name) {
      const low = name === 'low';
      floorMat.opacity = low ? 0.95 : 0.8;
      if (low === lite) return;
      lite = low; fx.visible = !low;
      if (lastSpec) setCar(lastSpec);
    },
    show() {
      if (shown) return; shown = true;
      prev = { fog: scene.fog, bg: scene.background, fov: cam.fov, tm: renderer.toneMappingExposure };
      scene.add(group);
      scene.fog = new THREE.FogExp2(0x05070d, 0.022); scene.background = new THREE.Color(0x04060c);
      renderer.toneMappingExposure = 1.05;
      addEventListener('pointerdown', onDown); addEventListener('pointerup', onUp); addEventListener('pointermove', onMove); if (canvas) addEventListener('wheel', onWheel, { passive: true });
      if (host.pbr) api.setQuality(host.pbr.qualityName);
    },
    hide() {
      if (!shown) return; shown = false;
      scene.remove(group); if (prev) { scene.fog = prev.fog; scene.background = prev.bg; cam.fov = prev.fov; renderer.toneMappingExposure = prev.tm; }
      cam.clearViewOffset(); cam.updateProjectionMatrix();
      removeEventListener('pointerdown', onDown); removeEventListener('pointerup', onUp); removeEventListener('pointermove', onMove); removeEventListener('wheel', onWheel);
    },
    update(dt) {
      t += dt; pop = Math.max(0, pop - dt * 2.2);
      px += (tpx - px) * Math.min(1, dt * 3); py += (tpy - py) * Math.min(1, dt * 3);
      if (!dragging) { vyaw *= Math.pow(0.04, dt); yaw += vyaw; }
      const pose = stageCamera(mode, t, { yaw, pitch: pitch - py * 0.012, dist });
      // turntable: showcase modes spin the car, title orbits the camera
      spin += pose.turn * dt; turn.rotation.y = mode === 'title' ? 0.35 : spin; mirrorRoot.rotation.y = turn.rotation.y;
      ring2.rotation.y -= dt * 0.25; ring1.material.emissiveIntensity = 3 + Math.sin(t * 2.2) * 0.6 + pop * 3;
      if (car) { const s = 1 - 0.05 * pop * pop; car.scale.setScalar(s); car.position.y = -0.2 * pop; }
      if (hero) hero.update(heroState, dt, { far: false });
      for (const [a, b] of pairs) { if (!b) continue; b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale); b.visible = a.visible; }
      if (mirror) { mirror.position.copy(car.position); mirror.scale.copy(car.scale); }
      cam.fov = pose.fov;
      cam.position.set(pose.x + px * 0.35, pose.y, pose.z);
      cam.lookAt(pose.lx, pose.ly, pose.lz);
      // shift the car to the free half of the screen (UI panels sit on the other side)
      curSide += (side - curSide) * Math.min(1, dt * 4);
      renderer.getSize(sz);
      const w = sz.x, hgt = sz.y, wide = w / Math.max(1, hgt) > 1.35;
      const off = wide ? -curSide * w * (mode === 'title' ? 0.2 : mode === 'garage' ? 0.08 : 0.22) : 0;
      if (Math.abs(off) > 0.5 || cam.view) cam.setViewOffset(w, hgt, off, 0, w, hgt); else cam.updateProjectionMatrix();
      const fl = 0.5 + 0.5 * Math.sin(t * 0.7); dust.rotation.y = t * 0.02;
      const pos = dgeo.attributes.position; for (let i = 0; i < N; i++) { let y = pos.getY(i) + dt * (0.12 + (i % 5) * 0.03); if (y > 9) y = 0; pos.setY(i, y); } pos.needsUpdate = true;
      cones.children.forEach((c, i) => { c.material.uniforms.uStrength.value = [0.5, 0.42, 0.3][i] * (0.8 + 0.2 * Math.sin(t * 0.9 + i * 2)); });
      fill.intensity = 12 + fl * 5;
      followShadow(key, 0, 0, 0);
    },
    dispose() { api.hide(); disposeCar(); floor.geometry.dispose(); floorMat.dispose(); gt.dispose(); rt.dispose(); fadeT.dispose(); disc.geometry.dispose(); disc.material.dispose(); ringMat.dispose(); ringMat2.dispose(); bMat.dispose(); wt.dispose(); dgeo.dispose(); },
  };
  return api;
}
