// Procedural pixel textures for the hero slice. Pure + deterministic (seeded), Node-safe: everything returns RGBA Uint8Arrays
// built only from the 16-colour PALETTE, so tests can assert palette adherence. Wrapped into THREE.DataTexture by heroTrack.js.
import { PALETTE_RGB, COLOR as K } from './paletteRef.js';
import { mulberry32 } from '../core/mathUtil.js';

export const ATLAS_TILES = { plain: 0, concrete: 1, tyres: 2, metal: 3, hazard: 4, container: 5, brick: 6, rust: 7, wood: 8, kerb: 9, chain: 10, grille: 11 };
export const ATLAS_SIZE = 128, TILE = 32;

class Canvasish {
  constructor(w, h, fill = K.black) { this.w = w; this.h = h; this.d = new Uint8Array(w * h * 4); this.fill(fill); }
  fill(c) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.px(x, y, c); }
  px(x, y, c) {
    x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;   // wrap: textures tile seamlessly
    const i = (y * this.w + x) * 4, p = PALETTE_RGB[((c % 16) + 16) % 16];
    this.d[i] = p[0]; this.d[i + 1] = p[1]; this.d[i + 2] = p[2]; this.d[i + 3] = 255;
  }
  alpha(x, y, a) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; this.d[(y * this.w + x) * 4 + 3] = a; }
  rect(x0, y0, w, h, c) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.px(x0 + x, y0 + y, c); }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  }
  disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) this.px(cx + x, cy + y, c); }
  ring(cx, cy, r, c) { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const q = x * x + y * y; if (q <= r * r + r && q >= (r - 1) * (r - 1)) this.px(cx + x, cy + y, c); } }
}

/** Cracked tarmac with patch repairs, tar seams, oil blots and speckle. 128x128, tiles. */
export function paintTarmac(seed = 1, size = 128) {
  const r = mulberry32(seed), c = new Canvasish(size, size, K.darkGrey);
  for (let i = 0; i < size * size * 0.16; i++) c.px((r() * size) | 0, (r() * size) | 0, r() < 0.7 ? K.black : r() < 0.7 ? K.navy : K.darkGrey);   // grit
  for (let i = 0; i < size * 1.2; i++) c.px((r() * size) | 0, (r() * size) | 0, r() < 0.8 ? K.black : K.lightGrey);                         // aggregate speckle
  for (let k = 0; k < 3; k++) {                                                                                                          // patch repairs
    const w = 18 + ((r() * 30) | 0), h = 10 + ((r() * 24) | 0), x0 = (r() * size) | 0, y0 = (r() * size) | 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c.px(x0 + x, y0 + y, r() < 0.8 ? K.black : K.darkGrey);
    for (let x = 0; x < w; x++) { c.px(x0 + x, y0, K.navy); c.px(x0 + x, y0 + h - 1, K.navy); }
    for (let y = 0; y < h; y++) { c.px(x0, y0 + y, K.navy); c.px(x0 + w - 1, y0 + y, K.navy); }
  }
  for (let k = 0; k < 5; k++) {                                                                                                          // cracks: jittered random walks
    let x = (r() * size) | 0, y = (r() * size) | 0, a = r() * Math.PI * 2;
    const len = 20 + ((r() * 50) | 0);
    for (let i = 0; i < len; i++) { c.px(x, y, K.black); if (r() < 0.25) c.px(x + 1, y, K.navy); a += (r() - 0.5) * 0.9; x += Math.round(Math.cos(a)); y += Math.round(Math.sin(a)); if (r() < 0.04) { /* branch */ let bx = x, by = y, ba = a + 1.2; for (let j = 0; j < 8; j++) { c.px(bx, by, K.black); ba += (r() - 0.5) * 0.8; bx += Math.round(Math.cos(ba)); by += Math.round(Math.sin(ba)); } } }
  }
  for (let k = 0; k < 3; k++) { const cx = (r() * size) | 0, cy = (r() * size) | 0, rad = 3 + ((r() * 6) | 0); for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) { const q = x * x + y * y; if (q < rad * rad && r() < 0.8) c.px(cx + x, cy + y, q < rad * rad * 0.4 ? K.black : K.navy); } } // oil blots
  for (let x = 0; x < size; x += 1) if (((x * 3) & 7) < 5) c.px(x, 0, K.black); // tar seam along the tile edge
  return c.d;
}

/** Concrete / cracked yard ground, with grit, puddle stains and weeds-of-rust. */
export function paintGround(seed = 2, size = 128) {
  const r = mulberry32(seed), c = new Canvasish(size, size, K.darkGrey);
  for (let i = 0; i < size * size * 0.5; i++) c.px((r() * size) | 0, (r() * size) | 0, r() < 0.5 ? K.rust : r() < 0.6 ? K.black : K.lightGrey);
  for (let i = 0; i < size * size * 0.15; i++) c.px((r() * size) | 0, (r() * size) | 0, K.darkGrey);
  for (let k = 0; k < 7; k++) { const cx = (r() * size) | 0, cy = (r() * size) | 0, rad = 3 + ((r() * 9) | 0); for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y < rad * rad && r() < 0.9) c.px(cx + x, cy + y, r() < 0.7 ? K.black : K.plum); }
  for (let k = 0; k < 4; k++) { let x = (r() * size) | 0, y = (r() * size) | 0; for (let i = 0; i < 30; i++) { c.px(x, y, K.black); x += (r() * 3 | 0) - 1; y += (r() * 3 | 0) - 1; } }
  for (let i = 0; i < 40; i++) c.px((r() * size) | 0, (r() * size) | 0, K.sand);   // gravel glints
  return c.d;
}

const GLYPHS = {
  A: ['010', '101', '111', '101', '101'], C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'],
  I: ['111', '010', '010', '010', '111'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'], O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'], R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  Y: ['101', '101', '010', '010', '010'], ' ': ['000', '000', '000', '000', '000'], '-': ['000', '000', '111', '000', '000'], N: ['101', '111', '111', '101', '101'],
  U: ['101', '101', '101', '101', '111'], M: ['101', '111', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], G: ['011', '100', '101', '101', '011'],
  F: ['111', '100', '110', '100', '100'], H: ['101', '101', '111', '101', '101'], W: ['101', '101', '111', '111', '101'],
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
};
/** Pixel rows for text: returns array of 5 strings of '0'/'1' (3px glyphs, 1px gap). */
export function textRows(text) {
  const rows = ['', '', '', '', ''];
  for (const ch of text.toUpperCase()) { const g = GLYPHS[ch] || GLYPHS[' ']; for (let i = 0; i < 5; i++) rows[i] += g[i] + '0'; }
  return rows.map((s) => s.slice(0, -1));
}

/** 128x128 atlas of 4x4 tiles (32px): plain white, concrete, tyres, corrugated metal, hazard, container, brick, rust, wood, kerb, chain-link, grille. */
export function paintAtlas(seed = 3) {
  const r = mulberry32(seed), c = new Canvasish(ATLAS_SIZE, ATLAS_SIZE, K.white);
  const tile = (name) => { const t = ATLAS_TILES[name]; return [(t % 4) * TILE, ((t / 4) | 0) * TILE]; };
  const T = (name, fn) => { const [ox, oy] = tile(name); const sub = { px: (x, y, col) => c.px(ox + ((x % TILE) + TILE) % TILE, oy + ((y % TILE) + TILE) % TILE, col), rect: (x, y, w, h, col) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) sub.px(x + i, y + j, col); }, line: (x0, y0, x1, y1, col) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) sub.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), col); } }; fn(sub); };
  T('plain', (s) => s.rect(0, 0, TILE, TILE, K.white));
  T('concrete', (s) => {
    s.rect(0, 0, TILE, TILE, K.lightGrey);
    for (let i = 0; i < 260; i++) s.px((r() * TILE) | 0, (r() * TILE) | 0, r() < 0.5 ? K.darkGrey : r() < 0.6 ? K.white : K.lavender);
    s.rect(0, 0, TILE, 1, K.darkGrey); s.rect(0, 0, 1, TILE, K.darkGrey);           // panel seams
    s.rect(0, TILE - 4, TILE, 4, K.darkGrey);                                       // dirty base
    for (let i = 0; i < 40; i++) s.px((r() * TILE) | 0, TILE - 8 + ((r() * 6) | 0), K.darkGrey);
    s.line(6, 4, 9, 12, K.darkGrey); s.line(9, 12, 7, 17, K.darkGrey);              // crack
    for (let i = 0; i < 4; i++) s.px(3 + i * 8, 2, K.rust);                           // rust bolt streaks
    for (let i = 0; i < 4; i++) { s.px(3 + i * 8, 3, K.rust); s.px(3 + i * 8, 4, K.rust); }
  });
  T('tyres', (s) => {
    s.rect(0, 0, TILE, TILE, K.black);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      const cx = 8 + col * 16 + (row ? 8 : 0), cy = 8 + row * 16;
      for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) { const q = x * x + y * y; if (q <= 49) s.px(cx + x, cy + y, q > 30 ? K.darkGrey : q > 12 ? K.black : K.navy); }
      if (r() < 0.45) for (let x = -6; x <= 6; x++) { const y = -Math.round(Math.sqrt(Math.max(0, 49 - x * x))); s.px(cx + x, cy + y, r() < 0.5 ? K.white : K.yellow); } // painted tops
    }
  });
  T('metal', (s) => {
    for (let x = 0; x < TILE; x++) for (let y = 0; y < TILE; y++) s.px(x, y, (x >> 1) % 2 ? K.rust : K.plum);
    for (let i = 0; i < 90; i++) s.px((r() * TILE) | 0, (r() * TILE) | 0, r() < 0.5 ? K.black : K.orange);
    for (let k = 0; k < 3; k++) { const x = (r() * TILE) | 0, y = (r() * TILE) | 0; s.rect(x, y, 3, 2, K.black); }                     // holes
    s.rect(0, 0, TILE, 2, K.darkGrey); s.rect(0, TILE - 2, TILE, 2, K.darkGrey);
  });
  T('hazard', (s) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) s.px(x, y, ((x + y) >> 3) % 2 ? K.black : K.yellow); });
  T('container', (s) => {
    s.rect(0, 0, TILE, TILE, K.white);
    for (let x = 0; x < TILE; x += 4) s.rect(x, 0, 1, TILE, K.lightGrey);        // ribs
    s.rect(0, 0, TILE, 2, K.darkGrey); s.rect(0, TILE - 2, TILE, 2, K.darkGrey);
    for (let i = 0; i < 50; i++) s.px((r() * TILE) | 0, (r() * TILE) | 0, K.lightGrey);
  });
  T('brick', (s) => {
    s.rect(0, 0, TILE, TILE, K.rust);
    for (let y = 0; y < TILE; y += 4) { s.rect(0, y, TILE, 1, K.darkGrey); for (let x = (y / 4) % 2 ? 0 : 4; x < TILE; x += 8) s.rect(x, y, 1, 4, K.darkGrey); }
    for (let i = 0; i < 60; i++) s.px((r() * TILE) | 0, (r() * TILE) | 0, r() < 0.5 ? K.plum : K.black);
  });
  T('rust', (s) => {
    s.rect(0, 0, TILE, TILE, K.rust);
    for (let i = 0; i < 300; i++) s.px((r() * TILE) | 0, (r() * TILE) | 0, r() < 0.4 ? K.plum : r() < 0.5 ? K.orange : K.darkGrey);
    s.rect(0, 0, TILE, 1, K.black); s.rect(0, 0, 1, TILE, K.black);
    for (const [x, y] of [[3, 3], [28, 3], [3, 28], [28, 28]]) { s.px(x, y, K.lightGrey); }
  });
  T('wood', (s) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) s.px(x, y, (y >> 2) % 2 ? K.rust : K.plum); for (let i = 0; i < 70; i++) s.px((r() * TILE) | 0, (r() * TILE) | 0, K.black); });
  T('kerb', (s) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) s.px(x, y, (x >> 4) % 2 ? K.white : K.red); for (let i = 0; i < 60; i++) s.px((r() * TILE) | 0, (r() * TILE) | 0, K.lightGrey); });
  T('chain', (s) => { s.rect(0, 0, TILE, TILE, K.black); for (let k = -TILE; k < TILE * 2; k += 5) { s.line(k, 0, k + TILE, TILE, K.lightGrey); s.line(k + TILE, 0, k, TILE, K.darkGrey); } });
  T('grille', (s) => { s.rect(0, 0, TILE, TILE, K.black); for (let x = 2; x < TILE; x += 4) s.rect(x, 0, 2, TILE, K.darkGrey); });
  return c.d;
}

/**
 * Panorama strip (w x h RGBA, alpha 0 = see-through) of Detroit ruins: stepped towers, broken windows, smokestacks, a
 * Renaissance-Center style cluster and a station block. `layer` 0 = far (hazy), 1 = near (dark, lit windows).
 */
export function paintSkyline(layer = 0, seed = 7, w = 1024, h = 128) {
  const r = mulberry32(seed + layer * 101), c = new Canvasish(w, h, K.black);
  for (let i = 0; i < w * h; i++) c.d[i * 4 + 3] = 0;
  const body = layer === 0 ? K.lavender : K.navy, edge = layer === 0 ? K.plum : K.black, win = layer === 0 ? K.lavender : K.yellow;
  const set = (x, y, col) => { if (y < 0 || y >= h) return; c.px(x, y, col); c.alpha(x, y, 255); };   // row 0 = bottom (V up)
  const tower = (x0, bw, bh, ruin) => {
    for (let x = 0; x < bw; x++) {
      const top = ruin && r() < 0.35 ? bh - ((r() * 8) | 0) : bh;
      for (let y = 0; y < top; y++) set(x0 + x, y, x === 0 || x === bw - 1 ? edge : body);
    }
    for (let y = 4; y < bh - 3; y += 4) for (let x = 2; x < bw - 2; x += 3) {
      const roll = r();
      if (layer === 1 && roll < 0.14) { set(x0 + x, y, win); set(x0 + x, y + 1, K.orange); } else if (roll > (ruin ? 0.55 : 0.8)) { set(x0 + x, y, edge); set(x0 + x, y + 1, edge); }
    }
  };
  let x = 0;
  while (x < w) {
    const bw = 8 + ((r() * 22) | 0), bh = 18 + ((r() * (layer === 0 ? 70 : 46)) | 0);
    tower(x, bw, bh, r() < 0.5);
    if (r() < 0.3) tower(x + 2, Math.max(4, bw - 6), bh + 6 + ((r() * 10) | 0), true);
    x += bw + ((r() * 4) | 0);
  }
  const rc = Math.floor(w * 0.30);                                                  // Renaissance Center cluster
  for (let k = 0; k < 5; k++) { const bw = k === 2 ? 14 : 10, bh = k === 2 ? 100 : 78 - Math.abs(k - 2) * 6; for (let xx = 0; xx < bw; xx++) for (let y = 0; y < bh; y++) set(rc + k * 11 + xx, y, xx === 0 || xx === bw - 1 ? edge : layer === 0 ? K.lightGrey : K.darkGrey); for (let y = 6; y < bh - 4; y += 3) for (let xx = 2; xx < bw - 2; xx += 2) if (r() > 0.6) set(rc + k * 11 + xx, y, layer === 1 ? K.yellow : K.white); }
  const st = Math.floor(w * 0.66);                                                  // ruined station block + tower
  for (let xx = 0; xx < 70; xx++) for (let y = 0; y < 44; y++) set(st + xx, y, xx % 7 === 0 ? edge : body);
  for (let xx = 0; xx < 18; xx++) for (let y = 44; y < 92; y++) set(st + 26 + xx, y, xx === 0 || xx === 17 ? edge : body);
  for (let y = 6; y < 40; y += 6) for (let xx = 3; xx < 68; xx += 6) { for (let q = 0; q < 3; q++) { set(st + xx + q, y, K.black); set(st + xx + q, y + 1, K.black); set(st + xx + q, y + 2, K.black); } }
  for (let k = 0; k < 4; k++) {                                                      // smokestacks
    const sx = Math.floor(w * (0.08 + 0.22 * k) + ((r() * 30) | 0)), sh = 70 + ((r() * 30) | 0);
    for (let y = 0; y < sh; y++) for (let xx = 0; xx < 5; xx++) set(sx + xx, y, y > sh - 4 ? K.red : y % 9 < 2 ? K.darkGrey : edge);
    if (layer === 1) for (let q = 0; q < 14; q++) { set(sx + 2 + ((r() * 7) | 0) - 3, sh + q, r() < 0.5 ? K.darkGrey : K.plum); }
    set(sx + 2, sh + 1, K.orange);
  }
  return c.d;
}

/** Soft sodium glow sprite (32x32, alpha) built from palette colours: bright core, orange ring, faint halo. */
export function paintGlow(size = 32) {
  const c = new Canvasish(size, size, K.black);
  for (let i = 0; i < size * size; i++) c.d[i * 4 + 3] = 0;
  const m = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - m + 0.5, y - m + 0.5) / m;
    if (d > 1) continue;
    const col = d < 0.18 ? K.white : d < 0.38 ? K.yellow : d < 0.62 ? K.orange : K.rust;
    c.px(x, y, col); c.alpha(x, y, d < 0.62 ? 255 : (x + y) % 2 ? 200 : 0);
  }
  return c.d;
}
