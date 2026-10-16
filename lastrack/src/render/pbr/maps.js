// Procedural PBR texture data (Node-safe, deterministic): flake normal, carbon-fibre weave, tyre tread, brushed metal, asphalt maps.
// All return RGBA Uint8Array. Normal maps are tangent-space (+Y up in uv), linear data (use NoColorSpace).
import { mulberry32 } from '../../core/mathUtil.js';

/** Height field (Float32Array w*h, wrapping) -> tangent-space normal map RGBA. */
export function heightToNormal(hgt, w, h, strength = 2) {
  const out = new Uint8Array(w * h * 4), at = (x, y) => hgt[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); out[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); out[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); out[i + 3] = 255;
  }
  return out;
}

/** Metallic flake normal map: tiny randomly-oriented facets (sparkle under clearcoat). */
export function flakeNormal(size = 256, seed = 1) {
  const r = mulberry32(seed), n = new Float32Array(size * size);
  for (let i = 0; i < n.length; i++) n[i] = r() < 0.5 ? r() : r() * 0.5;
  const b = new Float32Array(n.length);                                   // slight blur so facets are 2px wide
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) b[y * size + x] = (n[y * size + x] * 2 + n[y * size + ((x + 1) % size)] + n[((y + 1) % size) * size + x]) / 4;
  return heightToNormal(b, size, size, 7);
}

/** 2x2 twill carbon weave: returns { albedo, normal, roughness } (RGBA). */
export function carbonMaps(size = 128) {
  const hgt = new Float32Array(size * size), alb = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
  const cell = 8;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), fx = (x % cell) / cell, fy = (y % cell) / cell;
    const warpOver = ((cx + (cy >> 1)) & 1) === 0;                      // twill shift every second row
    const fibre = warpOver ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
    const cross = warpOver ? 0.5 + 0.5 * Math.sin(fy * Math.PI * 6) : 0.5 + 0.5 * Math.sin(fx * Math.PI * 6);
    const hv = 0.55 * fibre + 0.2 * cross * fibre;
    hgt[y * size + x] = hv;
    const g = Math.round(18 + 38 * hv + (warpOver ? 8 : 0)), i = (y * size + x) * 4;
    alb[i] = g; alb[i + 1] = g + 1; alb[i + 2] = g + 3; alb[i + 3] = 255;
    const rr = Math.round(70 + 60 * (1 - fibre)); rough[i] = rr; rough[i + 1] = rr; rough[i + 2] = rr; rough[i + 3] = 255;
  }
  return { albedo: alb, normal: heightToNormal(hgt, size, size, 3.5), roughness: rough };
}

/** Tyre tread normal map: u around the circumference, v across the width. Chevron blocks + shoulder grooves + sidewall notches handled by uv region. */
export function treadNormal(w = 256, h = 128) {
  const hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = y / h, u = x / w;
    let hv = 1;
    const centre = Math.abs(v - 0.5);
    if (Math.abs(centre - 0.0) < 0.015) hv = 0.15;                             // centre rib groove
    if (Math.abs(centre - 0.26) < 0.018) hv = 0.1;                             // circumferential grooves
    const chevron = ((u * 28 + (centre < 0.5 ? centre * 3.2 : 0)) % 1);          // angled lateral sipes
    if (chevron < 0.11 && centre > 0.03 && centre < 0.42) hv = Math.min(hv, 0.2);
    if (centre > 0.44) hv = 0.6 + 0.4 * (((u * 120) % 1) < 0.2 ? 0 : 1) * 0.3;   // sidewall ribs
    hgt[y * w + x] = hv;
  }
  return heightToNormal(hgt, w, h, 3);
}

/** Brushed metal: anisotropic streak noise (roughness) + fine normal grain along u. */
export function brushedMaps(size = 128, seed = 3) {
  const r = mulberry32(seed), row = new Float32Array(size), hgt = new Float32Array(size * size), rough = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) row[y] = r();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = row[y] * 0.7 + r() * 0.3;
    hgt[y * size + x] = v;
    const i = (y * size + x) * 4, rr = Math.round(60 + 90 * v);
    rough[i] = rr; rough[i + 1] = rr; rough[i + 2] = rr; rough[i + 3] = 255;
  }
  return { normal: heightToNormal(hgt, size, size, 0.9), roughness: rough };
}

/** Asphalt: albedo (sRGB-ish bytes), normal, roughness packed (G channel) with cracks + patches + oil. */
export function asphaltMaps(size = 256, seed = 11) {
  const r = mulberry32(seed), hgt = new Float32Array(size * size), alb = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
  for (let i = 0; i < hgt.length; i++) hgt[i] = r() * 0.5 + (r() < 0.07 ? 0.5 : 0);                   // aggregate
  const blobs = [];
  for (let k = 0; k < 6; k++) blobs.push([r() * size, r() * size, 6 + r() * 16]);                   // oil / wet stains
  for (let k = 0; k < 5; k++) {                                                                       // cracks
    let x = r() * size, y = r() * size, a = r() * 6.28;
    for (let i = 0; i < 90; i++) { hgt[(((y | 0) + size) % size) * size + (((x | 0) + size) % size)] = -1; a += (r() - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a); }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, hv = hgt[y * size + x];
    let stain = 0;
    for (const [bx, by, br] of blobs) { const d = Math.hypot(((x - bx + size * 1.5) % size) - size / 2, ((y - by + size * 1.5) % size) - size / 2); stain = Math.max(stain, 1 - d / br); }
    stain = Math.max(0, stain);
    let g = 46 + hv * 30 + (hv < 0 ? -30 : 0); g *= 1 - 0.45 * stain;
    alb[i] = g; alb[i + 1] = g; alb[i + 2] = g * 1.04; alb[i + 3] = 255;
    const rr = Math.round(210 - stain * 150 - (hv > 0.5 ? 20 : 0)); rough[i] = 0; rough[i + 1] = rr; rough[i + 2] = 0; rough[i + 3] = 255;
  }
  return { albedo: alb, normal: heightToNormal(hgt, size, size, 2), roughness: rough };
}

/** Soft radial glow (alpha) for underglow / lights, 64px. */
export function glowSprite(size = 64) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2, a = Math.pow(Math.max(0, 1 - d), 2.2), i = (y * size + x) * 4;
    out[i] = out[i + 1] = out[i + 2] = 255; out[i + 3] = Math.round(a * 255);
  }
  return out;
}

/** Weathered concrete: albedo (sRGB bytes), normal, roughness (G). Seams every 64px, stains, rust streaks. */
export function concreteMaps(size = 128, seed = 21) {
  const r = mulberry32(seed), hgt = new Float32Array(size * size), alb = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
  for (let i = 0; i < hgt.length; i++) hgt[i] = r() * 0.6 + (r() < 0.04 ? 0.4 : 0);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { if (x % (size / 2) === 0 || y % (size / 2) === 0) hgt[y * size + x] = -0.6; }
  for (let k = 0; k < 8; k++) { let x = (r() * size) | 0, y = (r() * size) | 0; for (let i = 0; i < 20; i++) { hgt[(y % size) * size + (x % size)] = -0.8; x += (r() * 3 | 0) - 1; y += 1; } }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, hv = hgt[y * size + x], streak = Math.max(0, Math.sin(x * 0.37 + Math.floor(y / 16)) * 0.5 + 0.2) * (y / size);
    let g = 104 + hv * 40 - (hv < 0 ? 30 : 0); const rust = streak * 18;
    alb[i] = g + rust; alb[i + 1] = g - rust * 0.3; alb[i + 2] = g - rust * 0.6; alb[i + 3] = 255;
    const rr = Math.round(190 + hv * 30 - streak * 40); rough[i] = 0; rough[i + 1] = Math.min(255, rr); rough[i + 2] = 0; rough[i + 3] = 255;
  }
  return { albedo: alb, normal: heightToNormal(hgt, size, size, 2.2), roughness: rough };
}

/** Holographic billboard (RGBA, alpha = glow mask): frame, big pixel text, scanlines. */
export function holoBillboard(text, color = [60, 230, 255], w = 128, h = 64, seed = 5, fit = false) {
  const out = new Uint8Array(w * h * 4), r = mulberry32(seed);
  const set = (x, y, a, k = 1) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; out[i] = color[0] * k; out[i + 1] = color[1] * k; out[i + 2] = color[2] * k; out[i + 3] = Math.max(out[i + 3], a); };
  for (let x = 0; x < w; x++) { set(x, 0, 255); set(x, h - 1, 255); set(x, 1, 120); set(x, h - 2, 120); }
  for (let y = 0; y < h; y++) { set(0, y, 255); set(w - 1, y, 255); set(1, y, 120); set(w - 2, y, 120); }
  const glyph = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '101111111111101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', Y: '101101010010010', 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 7: '111001010010010', 9: '111101111001111', ' ': '000000000000000', '-': '000000111000000' };
  // fit: shrink the glyphs so the whole text fits the width (default keeps the height-driven size)
  const sH = Math.max(2, Math.floor((h - 16) / 5)), s = fit ? Math.max(2, Math.min(sH, Math.floor((w - 16) / (4 * text.length)))) : sH, tw = text.length * 4 * s - s, x0 = Math.floor((w - tw) / 2), y0 = Math.floor((h - 5 * s) / 2);
  for (let c = 0; c < text.length; c++) { const g = glyph[text[c].toUpperCase()] || glyph[' ']; for (let i = 0; i < 15; i++) if (g[i] === '1') for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) set(x0 + c * 4 * s + (i % 3) * s + xx, y0 + ((i / 3) | 0) * s + yy, 255, 1.0); }
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; out[i + 3] = out[i + 3] * 0.65; }          // scanlines
  for (let k = 0; k < 40; k++) set((r() * w) | 0, (r() * h) | 0, 90, 0.7);                                                           // sparkle noise
  for (let i = 3; i < out.length; i += 4) if (out[i] === 0) { out[i - 3] = color[0]; out[i - 2] = color[1]; out[i - 1] = color[2]; out[i] = 14; }  // faint panel tint
  return out;
}

/** Soft fog-bank alpha (64px, tiles): layered sines. */
export function fogSprite(size = 64) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const n = 0.5 + 0.25 * Math.sin(u * 2 + Math.sin(v * 3)) + 0.15 * Math.sin(v * 2 - u) + 0.1 * Math.sin(u * 5 + v * 4);
    const i = (y * size + x) * 4; out[i] = out[i + 1] = out[i + 2] = 255; out[i + 3] = Math.round(Math.max(0, Math.min(1, n)) * 255);
  }
  return out;
}
