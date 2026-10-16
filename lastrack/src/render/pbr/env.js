// Procedural HDR environments (equirect Float32 RGBA): 'dusk' dystopian-city sky for the race, 'showroom' studio with softboxes.
// Node-safe data builders; envTextures() wraps + PMREM-filters them on a real renderer.
import * as THREE from 'three';
import { mulberry32 } from '../../core/mathUtil.js';

const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const SUN_ELEV = 0.13, SUN_AZ = 2.2;       // rad (sun low in the west)
/** Direction (unit) the key light comes FROM, in world space for sunDir(). */
export function sunDir() { const c = Math.cos(SUN_ELEV); return [Math.cos(SUN_AZ) * c, Math.sin(SUN_ELEV), Math.sin(SUN_AZ) * c]; }

/** Returns Float32Array RGBA (w*h*4) of HDR radiance. kind: 'dusk' | 'showroom'. */
export function buildEnvData(kind = 'dusk', w = 512, h = 256, seed = 4) {
  const data = new Float32Array(w * h * 4), r = mulberry32(seed);
  // skyline: per azimuth column building height (rad) + window pattern
  const cols = new Float32Array(w), neon = new Float32Array(w);
  for (let x = 0; x < w;) { const bw = 3 + ((r() * 9) | 0), bh = 0.02 + r() * r() * 0.16, ne = r() < 0.12 ? 1 : 0; for (let k = 0; k < bw && x < w; k++, x++) { cols[x] = bh; neon[x] = ne; } }
  const sd = sunDir();
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;                                       // +pi/2 up
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2 - Math.PI;
      const cl = Math.cos(lat), dx = Math.cos(lon) * cl, dy = Math.sin(lat), dz = Math.sin(lon) * cl;
      let c;
      if (kind === 'showroom') {
        // dark studio: faint ambient + softboxes (overhead strips, side bars, rear rim)
        c = [0.02 + 0.03 * smooth(-0.3, 0.8, dy), 0.022 + 0.032 * smooth(-0.3, 0.8, dy), 0.03 + 0.045 * smooth(-0.3, 0.8, dy)];
        const strip = (lonC, lonW, latC, latW, rad, col) => {
          let dl = Math.abs(lon - lonC); dl = Math.min(dl, Math.PI * 2 - dl);
          const e = smooth(lonW, lonW * 0.7, dl) * smooth(latW, latW * 0.7, Math.abs(lat - latC));
          if (e > 0) { c[0] += col[0] * rad * e; c[1] += col[1] * rad * e; c[2] += col[2] * rad * e; }
        };
        strip(0, 1.1, 1.15, 0.22, 22, [1, 0.97, 0.92]); strip(Math.PI, 1.1, 1.15, 0.22, 22, [1, 0.97, 0.92]);   // overhead long boxes
        strip(1.9, 0.12, 0.35, 0.55, 14, [0.75, 0.88, 1]); strip(-1.9, 0.12, 0.35, 0.55, 14, [1, 0.85, 0.7]);    // tall side strips
        strip(0, 0.5, 0.25, 0.06, 6, [0.4, 0.9, 1]); strip(Math.PI, 0.5, 0.25, 0.06, 6, [1, 0.3, 0.6]);          // coloured accent lines
        if (dy < 0) { const f = smooth(0, -1, dy); c = [c[0] * (1 - f * 0.7), c[1] * (1 - f * 0.7), c[2] * (1 - f * 0.7)]; }
      } else {
        // dusk: warm horizon -> violet -> deep blue; low sun; dystopian skyline with neon; wet dark ground
        const e = Math.max(0, lat);
        const hor = [3.2, 1.1, 0.55], mid = [0.55, 0.22, 0.42], top = [0.03, 0.05, 0.16];
        c = e < 0.25 ? mix3(hor, mid, smooth(0, 0.25, e)) : mix3(mid, top, smooth(0.25, 1.1, e));
        const cs = dx * sd[0] + dy * sd[1] + dz * sd[2], ang = Math.acos(Math.min(1, cs));
        const sun = Math.exp(-ang * ang * 5500) * 90 + Math.exp(-ang * ang * 40) * 1.6 + Math.exp(-ang * 4) * 0.35;
        c = [c[0] + sun * 1.0, c[1] + sun * 0.62, c[2] + sun * 0.32];
        if (lat < 0) { const f = smooth(0, -0.5, lat); c = [mix(c[0] * 0.5, 0.03, f), mix(c[1] * 0.4, 0.028, f), mix(c[2] * 0.4, 0.035, f)]; }
        const bh = cols[x];
        if (lat < bh && lat >= 0) {
          const win = r() < 0.07 ? 1 : 0, ne = neon[x];
          c = win ? [4.5, 2.6, 0.9] : ne && ((y + x) % 7 < 2) ? (x % 2 ? [7, 0.6, 3.2] : [0.6, 3.5, 7]) : [0.03, 0.03, 0.05];
        }
      }
      const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 1;
    }
  }
  return data;
}

/** Wrap + PMREM-filter an env. Returns { background (equirect texture), envMap (PMREM render-target texture), dispose() }. */
export function makeEnvTextures(renderer, kind = 'dusk', size = 512) {
  const data = buildEnvData(kind, size, size / 2);
  const tex = new THREE.DataTexture(data, size, size / 2, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.wrapS = THREE.RepeatWrapping; tex.needsUpdate = true;
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromEquirectangular(tex); pm.dispose();
  return { background: tex, envMap: rt.texture, dispose() { tex.dispose(); rt.dispose(); } };
}
