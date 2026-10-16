// One per race: builds track/scenery/sky/lights, owns car meshes + effects + camera rig, consumes interpolated Snapshots (§5).
import * as THREE from 'three';
import { buildCarMesh, applyLostParts } from './carModel.js';
import { eventImpact, TimeScaler } from './impactFx.js';
import { PART_IDS } from '../sim/parts.js';
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

const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** World-space direction of the sun (also the sky glow centre and the shadow-key direction). */
export const SUN_DIR = (() => { const v = [-0.46, 0.55, 0.36], l = Math.hypot(...v); return v.map((x) => x / l); })();

/**
 * Smooth gradient sky dome (vertex colours, no banding): deep zenith -> theme sky -> warm horizon haze, with a soft sun glow.
 * Node-safe. Returns the mesh; mesh.userData.haze = [r,g,b] (linear) is the colour fog should match.
 */
export function buildSky(theme = {}) {
  const [hor, top] = theme.sky || [K.sky, K.navy];
  const R = 1800;
  const geo = new THREE.SphereGeometry(R, 48, 28);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const h = colorRGB(hor), z = colorRGB(top), dark = colorRGB(K.black);
  const zenith = [0, 1, 2].map((k) => lerp(z[k], dark[k], 0.42));
  const hl = 0.2126 * h[0] + 0.7152 * h[1] + 0.0722 * h[2];
  const lift = 0.12 + 0.4 * smooth01(0.02, 0.35, hl);   // bright horizons get a milky haze, night themes stay dark
  const haze = [0, 1, 2].map((k) => lerp(h[k], 1, lift) * (k === 0 ? 1.08 : k === 2 ? 0.92 : 1));   // slightly warm horizon haze
  const sunC = [1.0, 0.72, 0.42];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / R, y = pos.getY(i) / R, zz = pos.getZ(i) / R;
    const e = Math.max(0, y);
    const tMid = smooth01(0, 0.34, e), tTop = smooth01(0.1, 0.9, e);
    const c = [0, 1, 2].map((k) => lerp(lerp(haze[k], h[k], tMid), zenith[k], tTop));
    // below the horizon: fade into the haze (hidden by the ground, but keeps the rim clean)
    const below = y < 0 ? smooth01(0, -0.25, y) : 0;
    const cs = x * SUN_DIR[0] + y * SUN_DIR[1] + zz * SUN_DIR[2], ang = Math.acos(Math.min(1, Math.max(-1, cs)));
    const glow = Math.exp(-ang * ang * 7) * 0.55 + Math.exp(-ang * ang * 420) * 1.4;
    const horizonBand = Math.exp(-e * 9) * Math.max(0, cs) * 0.35;   // warm bloom of the horizon towards the sun
    for (let k = 0; k < 3; k++) col[i * 3 + k] = lerp(c[k], haze[k] * 0.8, below) + sunC[k] * (glow + horizonBand);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false; mesh.name = 'sky';
  mesh.userData.haze = haze;
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
  const look = (track.def && track.def.look) || {};
  const pbrTrack = pbrMode && (track.def && (track.def.surfaces || track.id === 'neonloop')) && ['neonloop', 'foundry'].includes(track.id) ? buildPbrTrack(track, { seed: look.seed || 77 }) : null;
  const trackMesh = pbrTrack || heroTrack || buildTrackMesh(track); root.add(trackMesh.group);
  const scenery = heroTrack || pbrTrack ? { group: new THREE.Group(), dispose() {} } : buildScenery(track, { seed: config.seed }); root.add(scenery.group);
  let hemi, sun, keyLight = null, shadowsOn = false;
  const fogC = new THREE.Color(...colorRGB(heroTrack ? heroTrack.fogColor : theme.sky ? theme.sky[0] : K.sky));
  const prevFog = scene.fog, prevBg = scene.background;
  if (pbrMode) {
    // IBL (scene.environment, set by attachPBR) does the ambient; one shadow-casting key light follows the player; haze instead of palette fog
    hemi = new THREE.HemisphereLight(0x8a6a8a, 0x1a1418, 0.25);
    keyLight = makeKeyLight(host.pbr ? host.pbr.quality : { shadowMap: 1024, shadowSoft: false }, { intensity: pbrTrack ? (look.keyIntensity ?? 1.5) : 3.4, area: 22, color: pbrTrack ? (look.key ?? 0xffa27a) : 0xffb98a });
    if (pbrTrack) { scene.backgroundIntensity = look.bgIntensity ?? 0.4; scene.environmentIntensity = 0.5 * (host.pbr ? host.pbr.quality.reflections : 1); }
    root.add(hemi, keyLight, keyLight.target); sun = keyLight;
    scene.fog = new THREE.FogExp2(pbrTrack ? (look.fog ?? 0x3a2640) : 0x5a3446, pbrTrack ? (look.fogDensity ?? 0.0052) : 0.0042);
    if (!pbrTrack) trackMesh.group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  } else if (heroTrack) {
    // retro hero art (?style=retro): original dusk lighting
    hemi = new THREE.HemisphereLight(PALETTE[K.pink], PALETTE[K.plum], 1.9);
    sun = new THREE.DirectionalLight(0xffb070, 2.1); sun.position.set(-90, 38, 40);   // low dusk sun
    root.add(hemi, sun);
    scene.fog = new THREE.Fog(fogC, 80, 430);
    scene.background = fogC;
  } else {
    // modern full-colour look: smooth sky, exponential haze fog tinted from the sky, warm sun + cool fill + hemisphere ambient.
    // With host.pbr (attachPBR: ACES, IBL, shadow maps, bloom) the sun also casts soft shadows from the cars and follows the player.
    const hz = sky.userData.haze || colorRGB(theme.sky ? theme.sky[0] : K.sky);
    fogC.setRGB(Math.min(1, hz[0]), Math.min(1, hz[1]), Math.min(1, hz[2]));
    const lin = (idx) => new THREE.Color(...colorRGB(idx));
    hemi = new THREE.HemisphereLight(lin(theme.sky ? theme.sky[0] : K.sky).lerp(new THREE.Color(1, 1, 1), 0.25), lin(theme.ground ?? K.darkGrey).multiplyScalar(0.75), host.pbr ? 1.15 : 1.5);
    sun = new THREE.DirectionalLight(0xffe9cc, host.pbr ? 2.8 : 2.4);
    const fill = new THREE.DirectionalLight(0x6f8cff, host.pbr ? 0.55 : 0.45); fill.position.set(60, 30, -50);
    shadowsOn = !!(host.pbr && host.renderer && host.renderer.shadowMap && host.renderer.shadowMap.enabled);
    if (shadowsOn) {
      keyLight = makeKeyLight(host.pbr.quality, { intensity: 2.8, area: 24, color: 0xffe9cc });
      keyLight.userData.dir.set(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);
      keyLight.shadow.camera.far = 140; keyLight.shadow.camera.updateProjectionMatrix();
      keyLight.position.copy(keyLight.userData.dir).multiplyScalar(60);
      sun = keyLight; root.add(keyLight.target);
    } else sun.position.set(SUN_DIR[0] * 100, SUN_DIR[1] * 100, SUN_DIR[2] * 100);
    root.add(hemi, sun, fill);
    scene.fog = new THREE.FogExp2(fogC, 0.0024);
    scene.background = fogC;
    if (host.pbr) scene.environmentIntensity = 0.55 * host.pbr.quality.reflections;   // sky-ish IBL: reflections on paint without washing out the vertex colours
  }
  const effects = createEffects(root, { soft: pbrMode || (!heroTrack && !!host.pbr) });
  const rig = new CameraRig(host.camera);
  const carsGroup = new THREE.Group(); root.add(carsGroup);
  const blobGeo = new THREE.CircleGeometry(1, 10); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  const entries = []; // index = car id
  let last = null;
  let lastQ = '', lastTime = -1, clock = 0, wreckClock = 0, spectating = false, lastEvTick = -1;
  const timeScaler = new TimeScaler(), impact = { shake: 0, hitStop: 0, slowScale: 1, slowDur: 0 };
  const poses = [];
  const getPose = (id) => poses[id];

  function carIdFor(c) {
    if (c.isPlayer) return (config.player && config.player.carId) || 'wasp';
    const r = (config.rivals || []).find((x) => x.driverId === c.driverId);
    const d = getDriver(c.driverId || (r && r.driverId));
    return (d && d.carId) || (r && r.carId) || ['hammer', 'bulwark', 'wasp'][c.id % 3];
  }
  const castShadows = (m) => { if (shadowsOn) m.traverse((o) => { if (o.isMesh) o.castShadow = o.name !== 'lights'; }); return m; };
  function ensureCar(c) {
    let e = entries[c.id];
    if (!e) {
      const carId = carIdFor(c);
      const pbrCar = pbrMode;
      const hero = pbrCar || (config.hero && carId === 'hammer');
      e = { id: c.id, carId, hero, wet: 0.25, dirt: 0, wrecked: !!c.wrecked, lost: [], mesh: pbrCar ? buildHeroCarPBR({ carId, color: PBR_PALETTE(c.color), accent: c.isPlayer ? 0x35e6ff : PBR_PALETTE.accent(c.color), livery: c.livery || null }) : hero ? buildHeroCar({ color: c.color, helmetColor: c.helmetColor, number: String((c.id * 7 + 9) % 100) }) : buildCarMesh({ carId, color: c.color, helmetColor: c.helmetColor, wrecked: c.wrecked }), blob: new THREE.Mesh(blobGeo, blobMat) };
      if (pbrCar) { e.blob.visible = false; e.mesh.traverse((o) => { if (o.isMesh) o.frustumCulled = o.isInstancedMesh ? false : o.frustumCulled; }); }
      if (!pbrCar && !hero) castShadows(e.mesh);
      carsGroup.add(e.mesh, e.blob);
      entries[c.id] = e;
      effects.carIds[c.id] = carId;
    }
    if (!!c.wrecked !== e.wrecked && !e.hero) {
      carsGroup.remove(e.mesh); disposeObject(e.mesh);
      e.wrecked = !!c.wrecked;
      e.mesh = castShadows(buildCarMesh({ carId: e.carId, color: c.color, helmetColor: c.helmetColor, wrecked: e.wrecked, lost: e.wrecked ? PART_IDS : e.lost }));
      carsGroup.add(e.mesh);
    }
    return e;
  }

  // progressive damage: a part the sim tore off disappears from the car (the flying piece is spawned by effects.js)
  function loseCarPart(carId, part, c) {
    const e = entries[carId];
    if (!e || e.lost.includes(part)) return;
    e.lost.push(part);
    const hero = e.mesh.userData.hero;
    if (hero && hero.setPartLost) { hero.setPartLost(part, true); if (part === 'doorL' || part === 'doorR') { hero.setPartLost('doorL', true); hero.setPartLost('doorR', true); } }
    else if (!hero && !e.wrecked) applyLostParts(e.mesh, { color: c.color, helmetColor: c.helmetColor, lost: e.lost });
  }
  /** Once per sim tick: part loss + camera feel (shake / hit-stop / slow-mo) from the events of that tick. */
  function feel(B, follow) {
    if (B.tick === lastEvTick) return;
    lastEvTick = B.tick;
    const me = follow ? { id: follow.id, x: follow.x, y: follow.y } : null;
    for (const ev of B.events || []) {
      if (ev.type === 'partLost') loseCarPart(ev.carId, ev.part, B.cars[ev.carId] || {});
      eventImpact(ev, me, impact);
      if (impact.shake > 0) rig.addShake(impact.shake);
      if (impact.hitStop > 0 || impact.slowDur > 0) timeScaler.trigger(impact.hitStop, impact.slowScale, impact.slowDur);
    }
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
      if (shadowsOn && !e.hero) e.blob.visible = Math.hypot(p.x - host.camera.position.x, p.y - host.camera.position.z) > 36;   // real shadow near the camera, blob for distant cars
      e.blob.scale.set(e.mesh.userData.length * 0.55, 1, e.mesh.userData.width * 0.6);
      const gone = cb.wrecked && cb.wreckT !== undefined && cb.wreckT <= 0;   // the wreck timed out in the sim: the hull is removed (scorch marks stay)
      e.mesh.visible = !gone; if (gone) e.blob.visible = false;
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
          wet: e.wet, dirt: e.dirt, weapons: cb.weapons,
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
      feel(B, follow);
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
    effects.update(B, dt * timeScaler.scale, getPose, (host.renderer && host.renderer.domElement ? host.renderer.domElement.height : 600) * 0.45 / (host.palettePassActive ? (host.pixelScale || 2) : 1));
  }

  return {
    update, poseOf: getPose,
    setCamera(m) { rig.setMode(m); },
    cycleCamera() { rig.setMode(nextCameraMode(rig.mode)); return rig.mode; },
    get cameraMode() { return rig.mode; },
    get spectating() { return spectating; },
    /** Real-time multiplier for the sim's frame time: hit-stop / slow-mo on wrecks and big hits (1 when idle). Call update(dt) once per frame first. */
    get timeScale() { return timeScaler.scale; },
    stepTime(dt) { return timeScaler.update(dt); },
    hero: !!config.hero,
    heroTrack,
    CAMERA_MODES,
    minimapState() {
      return { snapshot: last, bounds: trackMesh.bounds, cars: last ? last.cars.map((c) => ({ x: c.x, y: c.y, isPlayer: c.isPlayer, color: c.color, livery: c.livery, wrecked: c.wrecked })) : [] };
    },
    effects, rig,
    dispose() {
      scene.remove(root);
      if (pbrMode) host.camera.clearViewOffset();
      if (pbrTrack) { pbrTrack.dispose(); scene.backgroundIntensity = 1; scene.environmentIntensity = host.pbr ? host.pbr.quality.reflections : 1; }
      if (!pbrMode && !heroTrack && host.pbr) scene.environmentIntensity = host.pbr.quality.reflections;
      scene.fog = prevFog; if (!pbrMode) scene.background = prevBg;
      effects.dispose(); disposeObject(root); if (keyLight && keyLight.dispose) keyLight.dispose();
      blobGeo.dispose(); blobMat.dispose();
      entries.length = 0;
    },
  };
}
