// One per race: builds track/scenery/sky/lights, owns car meshes + effects + camera rig, consumes interpolated Snapshots (§5).
import * as THREE from 'three';
import { buildCarMesh } from './carModel.js';
import { buildHeroCar } from './heroCar.js';
import { buildHeroTrack } from './heroTrack.js';
import { buildHeroCarPBR } from './pbr/heroCarPBR.js';
import { buildPbrTrack } from './pbr/pbrTrack.js';
import { makeKeyLight, followShadow } from './pbr/pbrHost.js';
import { PBR_PALETTE } from './pbr/paints.js';
import { buildTrackMesh } from './trackMesh.js';
import { buildScenery } from './scenery.js';
import { createEffects } from './effects.js';
import { CameraRig, nextCameraMode, CAMERA_MODES } from './cameras.js';
import { colorRGB, wrapAngle, angleDiff, disposeObject } from './geomUtil.js';
import { COLOR as K, PALETTE } from './paletteRef.js';
import { getDriver } from '../data/drivers.js';

/** Gradient sky dome (vertex colours): horizon colour -> zenith colour. Node-safe. */
export function buildSky(theme = {}) {
  const [hor, top] = theme.sky || [K.sky, K.navy];
  const geo = new THREE.SphereGeometry(1800, 16, 8);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const a = colorRGB(hor), b = colorRGB(top);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / 1800));
    const q = Math.floor(t * 4) / 4; // banded gradient: reads as 16-colour art
    for (let k = 0; k < 3; k++) col[i * 3 + k] = a[k] + (b[k] - a[k]) * q;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false; mesh.name = 'sky';
  return mesh;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerpPose = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: wrapAngle(a.heading + angleDiff(b.heading, a.heading) * t) });

/** createRaceController(host, track, config) -> { update(snapA, snapB, alpha, dt), setCamera, cycleCamera, dispose, minimapState } */
export function createRaceController(host, track, config = {}) {
  const scene = host.scene;
  const root = new THREE.Group(); root.name = 'race';
  scene.add(root);
  const theme = (track.def && track.def.theme) || {};
  const pbrMode = !!config.hero && config.heroStyle === 'pbr';   // futuristic PBR slice look (slice only)
  const heroSky = !pbrMode && config.hero && track.id === 'scrapyard';
  const sky = heroSky || pbrMode ? new THREE.Group() : buildSky(theme); root.add(sky);
  const heroTrack = !pbrMode && config.hero && track.id === 'scrapyard' ? buildHeroTrack(track, { seed: config.seed }) : null;
  const pbrTrack = pbrMode && track.id === 'neonloop' ? buildPbrTrack(track, { seed: 77 }) : null;
  const trackMesh = pbrTrack || heroTrack || buildTrackMesh(track); root.add(trackMesh.group);
  const scenery = heroTrack || pbrTrack ? { group: new THREE.Group(), dispose() {} } : buildScenery(track, { seed: config.seed }); root.add(scenery.group);
  let hemi, sun, keyLight = null;
  const fogC = new THREE.Color(...colorRGB(heroTrack ? heroTrack.fogColor : theme.sky ? theme.sky[0] : K.sky));
  const prevFog = scene.fog, prevBg = scene.background;
  if (pbrMode) {
    // IBL (scene.environment, set by attachPBR) does the ambient; one shadow-casting key light follows the player; haze instead of palette fog
    hemi = new THREE.HemisphereLight(0x8a6a8a, 0x1a1418, 0.25);
    keyLight = makeKeyLight(host.pbr ? host.pbr.quality : { shadowMap: 1024, shadowSoft: false }, { intensity: pbrTrack ? 1.5 : 3.4, area: 22, color: pbrTrack ? 0xffa27a : 0xffb98a });
    if (pbrTrack) { scene.backgroundIntensity = 0.4; scene.environmentIntensity = 0.5 * (host.pbr ? host.pbr.quality.reflections : 1); }
    root.add(hemi, keyLight, keyLight.target); sun = keyLight;
    scene.fog = new THREE.FogExp2(pbrTrack ? 0x3a2640 : 0x5a3446, pbrTrack ? 0.0052 : 0.0042);
    if (!pbrTrack) trackMesh.group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  } else {
    hemi = new THREE.HemisphereLight(heroTrack ? PALETTE[K.pink] : PALETTE[theme.sky ? theme.sky[0] : 12], heroTrack ? PALETTE[K.plum] : PALETTE[theme.ground ?? 5], heroTrack ? 1.9 : 1.6);
    sun = new THREE.DirectionalLight(heroTrack ? 0xffb070 : 0xffffff, heroTrack ? 2.1 : 2.0); sun.position.set(-40, 100, 30);
    if (heroTrack) sun.position.set(-90, 38, 40);   // low dusk sun
    root.add(hemi, sun);
    scene.fog = heroTrack ? new THREE.Fog(fogC, 80, 430) : new THREE.Fog(fogC, 160, 700);
    scene.background = fogC;
  }
  const effects = createEffects(root, { soft: pbrMode });
  const rig = new CameraRig(host.camera);
  const carsGroup = new THREE.Group(); root.add(carsGroup);
  const blobGeo = new THREE.CircleGeometry(1, 10); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  const entries = []; // index = car id
  let last = null;
  let lastQ = '', lastTime = -1, clock = 0, wreckClock = 0, spectating = false;
  const poses = [];
  const getPose = (id) => poses[id];

  function carIdFor(c) {
    if (config.hero && config.heroStyle === 'pbr' && config.slice) return 'hammer';   // slice field is all Hammers
    if (c.isPlayer) return (config.player && config.player.carId) || 'wasp';
    const r = (config.rivals || []).find((x) => x.driverId === c.driverId);
    const d = getDriver(c.driverId || (r && r.driverId));
    return (d && d.carId) || (r && r.carId) || ['hammer', 'bulwark', 'wasp'][c.id % 3];
  }
  function ensureCar(c) {
    let e = entries[c.id];
    if (!e) {
      const carId = carIdFor(c);
      const hero = config.hero && carId === 'hammer';
      const pbrCar = hero && pbrMode;
      e = { id: c.id, carId, hero, wet: 0.25, dirt: 0, wrecked: !!c.wrecked, mesh: pbrCar ? buildHeroCarPBR({ color: PBR_PALETTE(c.color), accent: c.isPlayer ? 0x35e6ff : PBR_PALETTE.accent(c.color) }) : hero ? buildHeroCar({ color: c.color, helmetColor: c.helmetColor, number: String((c.id * 7 + 9) % 100) }) : buildCarMesh({ carId, color: c.color, helmetColor: c.helmetColor, wrecked: c.wrecked }), blob: new THREE.Mesh(blobGeo, blobMat) };
      if (pbrCar) { e.blob.visible = false; e.mesh.traverse((o) => { if (o.isMesh) o.frustumCulled = o.isInstancedMesh ? false : o.frustumCulled; }); }
      carsGroup.add(e.mesh, e.blob);
      entries[c.id] = e;
    }
    if (!!c.wrecked !== e.wrecked && !e.hero) {
      carsGroup.remove(e.mesh); disposeObject(e.mesh);
      e.wrecked = !!c.wrecked;
      e.mesh = buildCarMesh({ carId: e.carId, color: c.color, helmetColor: c.helmetColor, wrecked: e.wrecked });
      carsGroup.add(e.mesh);
    }
    return e;
  }

  function update(snapA, snapB, alpha = 1, dt = 1 / 60) {
    const B = snapB || snapA;
    if (!B) return;
    const A = snapA || B;
    const t = Math.min(1, Math.max(0, alpha));
    last = B;
    for (let i = 0; i < B.cars.length; i++) {
      const cb = B.cars[i], ca = A.cars[i] || cb;
      const e = ensureCar(cb);
      const p = lerpPose(ca, cb, A === B ? 1 : t);
      p.speed = cb.speed; p.steer = cb.steer; p.wrecked = cb.wrecked; p.isPlayer = cb.isPlayer; p.id = cb.id;
      poses[cb.id] = p;
      e.mesh.position.set(p.x, 0, p.y); e.mesh.rotation.y = -p.heading;
      e.blob.position.set(p.x, 0.07, p.y); e.blob.rotation.y = -p.heading;
      e.blob.scale.set(e.mesh.userData.length * 0.55, 1, e.mesh.userData.width * 0.6);
      const ud = e.mesh.userData;
      if (ud.hero) {
        // turret aim: nearest live rival ahead within 70 m and ±100°, otherwise a slow scan
        let aim = Math.sin(clock * 0.8 + cb.id) * 0.18, best = 70;
        for (const o of B.cars) {
          if (o === cb || o.wrecked) continue;
          const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
          if (d >= best) continue;
          const rel = wrapAngle(Math.atan2(dy, dx) - p.heading);
          if (Math.abs(rel) < 1.75) { best = d; aim = rel; }
        }
        if (ud.pbr) aim = 0;   // PBR Hammer: fixed forward turret
        const frac = cb.armorMax > 0 ? cb.armor / cb.armorMax : 1;
        ud.hero.update({
          speed: cb.speed, steer: cb.steer, ax: cb.ax, ay: cb.ay, throttle: cb.throttle, braking: cb.braking, wheelspin: cb.wheelspin,
          slip: cb.slip, firing: cb.firing && !cb.wrecked, frac, dmg: cb.dmg, wrecked: cb.wrecked, aim, rough: cb.surface === 'dirt' ? 1 : cb.surface === 'kerb' ? 0.5 : 0,
          reversing: (cb.vx * Math.cos(cb.heading) + cb.vy * Math.sin(cb.heading)) < -0.5,
          wet: e.wet, dirt: e.dirt,
        }, dt, { far: pbrMode && Math.hypot(p.x - host.camera.position.x, p.y - host.camera.position.z) > 42, shadow: !pbrMode || Math.hypot(p.x - host.camera.position.x, p.y - host.camera.position.z) < 30 });
        // wetness / dirt accumulate from the surface under the car
        const sf = cb.surface;
        e.wet += ((sf === 'puddle' ? 1 : sf === 'oil' ? 0.6 : 0.3) - e.wet) * Math.min(1, dt * (sf === 'puddle' ? 2 : 0.15));
        if (sf === 'dirt' || sf === 'kerb') e.dirt = Math.min(1, e.dirt + dt * (sf === 'dirt' ? 0.06 : 0.015) * Math.min(1, cb.speed / 20)); else e.dirt = Math.max(0, e.dirt - dt * 0.004);
      } else {
        const spin = (cb.speed || 0) * dt / ud.wheelRadius;
        for (const w of ud.wheels) w.rotation.z -= spin;
        for (const pv of ud.frontPivots) pv.rotation.y = -(cb.steer || 0) * 0.4;
        // body lean from yaw rate * speed (lateral accel), pitch from accel is not available -> keep roll only
        const roll = Math.max(-0.06, Math.min(0.06, -(cb.yawRate || 0) * (cb.speed || 0) * 0.0012));
        ud.body.rotation.x += (roll - ud.body.rotation.x) * Math.min(1, dt * 8);
      }
      p.ay = cb.ay; p.ax = cb.ax;
    }
    clock += dt;
    const player = B.cars.find((c) => c.isPlayer) || B.cars[0];
    // spectate: once the player has been wrecked for a moment, follow the best-placed car still racing
    let follow = player;
    if (player && player.wrecked) {
      wreckClock += dt;
      if (wreckClock > 2.5) {
        const live = B.cars.filter((c) => !c.wrecked && !c.finished).sort((a, b) => a.position - b.position)[0] || B.cars.filter((c) => !c.wrecked).sort((a, b) => a.position - b.position)[0];
        if (live) follow = live;
      }
    } else wreckClock = 0;
    spectating = follow !== player;
    const pp = follow && poses[follow.id];
    if (pp) {
      if (spectating) pp.wrecked = false;
      for (const ev of B.events || []) {
        if (ev.type === 'bump' && ev.carId === follow.id) rig.addShake(Math.min(0.9, (ev.strength || 1) * 0.08));
        else if (ev.type === 'explosion') { const d = Math.hypot(ev.x - follow.x, ev.y - follow.y); if (d < 40) rig.addShake((1 - d / 40) * 0.7); }
      }
      rig.update(dt, pp, B.phase, B.countdown);
    }
    if (pbrMode) {                                                    // lift the scene so the car clears the dashboard
      const cv = host.renderer.domElement, w = cv.width, h = cv.height, cam = host.camera;
      if (w && h && (!cam.view || cam.view.fullHeight !== h || cam.view.fullWidth !== w)) { cam.setViewOffset(w, h, 0, Math.round(h * 0.09), w, h); }
    }
    if (pbrMode && host.pbr && pp) host.pbr.setMotionBlur(rig.mode === 'top' || B.phase !== 'racing' ? 0 : clamp01((pp.speed - 30) / 50) * 0.7);
    if (pbrTrack && pp) { if (host.pbr && host.pbr.qualityName !== lastQ) { lastQ = host.pbr.qualityName; pbrTrack.setQuality(host.pbr.quality); } pbrTrack.update(dt, host.camera, { x: pp.x, z: pp.y }); }
    if (keyLight && pp) followShadow(keyLight, pp.x, 0, pp.y);
    if (heroTrack) heroTrack.update(dt, host.camera, (host.renderer && host.renderer.domElement ? host.renderer.domElement.height : 600) / (host.palettePassActive ? (host.pixelScale || 2) : 1));
    effects.update(B, dt, getPose, (host.renderer && host.renderer.domElement ? host.renderer.domElement.height : 600) * 0.45 / (host.palettePassActive ? (host.pixelScale || 2) : 1));
  }

  return {
    update,
    setCamera(m) { rig.setMode(m); },
    cycleCamera() { rig.setMode(nextCameraMode(rig.mode)); return rig.mode; },
    get cameraMode() { return rig.mode; },
    get spectating() { return spectating; },
    hero: !!config.hero,
    heroTrack,
    CAMERA_MODES,
    minimapState() {
      return { snapshot: last, bounds: trackMesh.bounds, cars: last ? last.cars.map((c) => ({ x: c.x, y: c.y, isPlayer: c.isPlayer, color: c.color, wrecked: c.wrecked })) : [] };
    },
    effects, rig,
    dispose() {
      scene.remove(root);
      if (pbrMode) host.camera.clearViewOffset();
      if (pbrTrack) { pbrTrack.dispose(); scene.backgroundIntensity = 1; scene.environmentIntensity = host.pbr ? host.pbr.quality.reflections : 1; }
      scene.fog = prevFog; if (!pbrMode) scene.background = prevBg;
      effects.dispose(); disposeObject(root);
      blobGeo.dispose(); blobMat.dispose();
      entries.length = 0;
    },
  };
}
