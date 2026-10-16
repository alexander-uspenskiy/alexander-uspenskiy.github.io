// Procedural HDR environments (equirect Float32 RGBA): 'dusk' dystopian-city sky for the race, 'forge' smoke-and-furnace sky for
// Foundry Run, 'showroom' studio with softboxes.
// Node-safe data builders; envTextures() wraps + PMREM-filters them on a real renderer.
import * as THREE from 'three';
import { mulberry32 } from '../../core/mathUtil.js';

const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const SUN_ELEV = 0.13, SUN_AZ = 2.2;       // rad (sun low in the west)
export const FORGE_SUN_ELEV = 0.16;               // Foundry Run's low sun; matches look.sunElev in data/tracks/testTrack.js
/** Direction (unit) the key light comes FROM, in world space for sunDir(elev). */
export function sunDir(elev = SUN_ELEV) { const c = Math.cos(elev); return [Math.cos(SUN_AZ) * c, Math.sin(elev), Math.sin(SUN_AZ) * c]; }

/** Returns Float32Array RGBA (w*h*4) of HDR radiance. kind: 'dusk' | 'forge' | 'showroom'. */
export function buildEnvData(kind = 'dusk', w = 512, h = 256, seed = 4) {
  const data = new Float32Array(w * h * 4), r = mulberry32(seed);
  // skyline: per azimuth column building height (rad) + window pattern
  const cols = new Float32Array(w), neon = new Float32Array(w);
  for (let x = 0; x < w;) { const bw = 3 + ((r() * 9) | 0), bh = 0.02 + r() * r() * 0.16, ne = r() < 0.12 ? 1 : 0; for (let k = 0; k < bw && x < w; k++, x++) { cols[x] = bh; neon[x] = ne; } }
  // dead-steelworks silhouettes (forge only; drawn after the skyline rng, so the other skies are unchanged): thin stacks with a
  // warning light on top, and broad cooling towers
  const stk = new Float32Array(w), stkTip = new Uint8Array(w);
  if (kind === 'forge') for (let x = (r() * 20) | 0; x < w;) {
    const tall = r() < 0.6, bw = tall ? 2 + ((r() * 3) | 0) : 14 + ((r() * 10) | 0), bh = tall ? 0.16 + r() * 0.3 : 0.08 + r() * 0.07;
    for (let k = 0; k < bw && x < w; k++, x++) { stk[x] = bh; stkTip[x] = tall ? 1 : 0; }
    x += 10 + ((r() * 46) | 0);
  }
  const sd = sunDir(kind === 'forge' ? FORGE_SUN_ELEV : SUN_ELEV);
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
      } else if (kind === 'forge') {
        // dead steelworks at dusk: smoke-brown sky, a furnace-orange band on the horizon, stacks in silhouette
        const e = Math.max(0, lat);
        const hor = [2.1, 0.6, 0.18], mid = [0.1, 0.04, 0.026], top = [0.018, 0.016, 0.02];
        c = e < 0.2 ? mix3(hor, mid, smooth(0, 0.2, e)) : mix3(mid, top, smooth(0.2, 1, e));
        const soot = 1 - 0.2 * smooth(0.05, 0.4, e) * (0.5 + 0.5 * Math.sin(lon * 6 + 2 * Math.sin(lat * 9)));   // sooty streaks up high
        const cs = dx * sd[0] + dy * sd[1] + dz * sd[2], ang = Math.acos(Math.min(1, cs));
        const sun = Math.exp(-ang * ang * 4000) * 60 + Math.exp(-ang * ang * 28) * 1.5 + Math.exp(-ang * 3.2) * 0.5;
        c = [c[0] * soot + sun, c[1] * soot + sun * 0.5, c[2] * soot + sun * 0.18];
        if (lat < 0) { const f = smooth(0, -0.4, lat); c = [mix(c[0] * 0.5, 0.05, f), mix(c[1] * 0.4, 0.03, f), mix(c[2] * 0.4, 0.024, f)]; }
        if (lat < stk[x] && lat >= 0) c = stkTip[x] && Math.abs(lat - stk[x]) < 0.014 ? [6, 1.6, 0.4] : [0.012, 0.01, 0.011];   // warning lights on the stack tops
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
