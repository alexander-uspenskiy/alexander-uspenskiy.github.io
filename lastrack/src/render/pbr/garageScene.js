// Slice garage: the PBR Hammer on a glossy turntable in a dark studio (rendered into the main host before the race).
import * as THREE from 'three';
import { buildHeroCarPBR } from './heroCarPBR.js';
import { makeKeyLight, followShadow } from './pbrHost.js';
import { PBR_PALETTE } from './paints.js';

export function createGarageScene(host, { color = 9, canvas = null } = {}) {
  const scene = host.scene, cam = host.camera;
  const group = new THREE.Group(); group.name = 'garage';
  const q = host.pbr ? host.pbr.quality : { shadowMap: 1024, shadowSoft: false };
  const key = makeKeyLight(q, { intensity: 2.4, color: 0xfff0e0, area: 9 }); key.userData.dir.set(0.35, 0.9, 0.45).normalize();
  const rim = new THREE.DirectionalLight(0x35e6ff, 1.5); rim.position.set(-6, 3, -5);
  const fill = new THREE.DirectionalLight(0xff4aa0, 0.6); fill.position.set(6, 2, -4);
  const fc = document.createElement('canvas'); fc.width = fc.height = 256; const g = fc.getContext('2d'); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, '#3a4048'); gr.addColorStop(0.55, '#1a1e24'); gr.addColorStop(1, '#07080b'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ map: ft, metalness: 0.7, roughness: 0.22, clearcoat: 0.5, envMapIntensity: 0.8 }));
  floor.receiveShadow = true;
  const car = buildHeroCarPBR({ color: PBR_PALETTE(color), accent: 0x35e6ff });
  group.add(key, key.target, rim, fill, floor, car);
  const hero = car.userData.hero, st = { speed: 0, steer: 0, ax: 0, ay: 0, throttle: 0, braking: 0, frac: 1, dmg: [0, 0, 0, 0], wet: 0.2, dirt: 0 };
  let yaw = 0.6, camYaw = 0.55, camPitch = 0.16, dist = 8.4, auto = true, drag = null, shown = false, prevBg = null, t = 0;
  const onDown = (e) => { drag = [e.clientX, e.clientY]; auto = false; };
  const onUp = () => { drag = null; };
  const onMove = (e) => { if (!drag) return; camYaw -= (e.clientX - drag[0]) * 0.006; camPitch = Math.max(0.02, Math.min(1.2, camPitch + (e.clientY - drag[1]) * 0.004)); drag = [e.clientX, e.clientY]; };
  const onWheel = (e) => { dist = Math.max(4, Math.min(14, dist + e.deltaY * 0.01)); };
  const api = {
    car, group, hero,
    show() { if (shown) return; shown = true; scene.add(group); prevBg = scene.fog; scene.fog = null; if (canvas) { canvas.addEventListener('pointerdown', onDown); addEventListener('pointerup', onUp); addEventListener('pointermove', onMove); canvas.addEventListener('wheel', onWheel); } },
    hide() { if (!shown) return; shown = false; scene.remove(group); scene.fog = prevBg; if (canvas) { canvas.removeEventListener('pointerdown', onDown); removeEventListener('pointerup', onUp); removeEventListener('pointermove', onMove); canvas.removeEventListener('wheel', onWheel); } },
    update(dt) {
      t += dt; if (auto) camYaw += dt * 0.28;
      hero.update(st, dt, { far: false });
      const cx = Math.cos(camPitch);
      cam.position.set(Math.sin(camYaw) * cx * dist, 0.7 + Math.sin(camPitch) * dist, Math.cos(camYaw) * cx * dist); cam.lookAt(0, 0.7, 0);
      followShadow(key, 0, 0, 0); void yaw;
    },
    dispose() { api.hide(); hero.dispose(); floor.geometry.dispose(); floor.material.dispose(); ft.dispose(); },
  };
  return api;
}
