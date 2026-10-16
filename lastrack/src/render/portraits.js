// Modern stylised rival portraits, generated in code (canvas-2D vector busts, cyberpunk look). No external assets.
// portraitSpec(driver) is pure + Node-testable (plain JSON describing palette / hair / visor / scars); drawPortrait paints it in a
// 256x256 logical space scaled to the target canvas, so it is crisp from ~96px up to 256px+ (and on hi-dpi canvases).
import { mulberry32 } from '../core/mathUtil.js';
import { modernHex, mixHex } from './paletteRef.js';
export { mixHex };

export const PORTRAIT_SIZE = 256;           // logical drawing space (the canvas may be any size)
export const HAIR_STYLES = ['swept', 'mohawk', 'buzz', 'long', 'helmet'];

// ---------- colour helpers (pure) ----------
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (h, a) => { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const lum = (h) => { const c = hexToRgb(h); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
const sat = (h) => { const c = hexToRgb(h), mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
/** make a colour usable as neon light: dull/dark colours are lifted towards white. */
function neon(h) { let c = h; if (sat(c) < 0.3) c = mixHex(c, '#ffffff', 0.5); if (lum(c) < 0.35) c = mixHex(c, '#ffffff', 0.25); return c; }

/**
 * Pure description of a driver's portrait. Deterministic from driver.portrait {seed, skin, hair, accent} + driver.color/helmet
 * (palette indices resolved through the modern ramp) + driver.skill. Returns a plain JSON-able object.
 */
export function portraitSpec(driver) {
  const por = (driver && driver.portrait) || { seed: 0, skin: 15, hair: 4, accent: 8 };
  const seed = por.seed | 0;
  const rng = mulberry32(seed * 7919 + 13);
  const skinIdx = por.skin ?? 15, hairIdx = por.hair ?? 4, accentIdx = por.accent ?? 8;
  const jacketIdx = driver && driver.color != null ? driver.color : accentIdx;
  const helmetIdx = driver && driver.helmet != null ? driver.helmet : 10;
  const style = HAIR_STYLES[(((seed * 2 + (hairIdx | 0)) % 5) + 5) % 5];
  const accent = neon(modernHex(accentIdx));
  const skin = mixHex(modernHex(skinIdx), '#c79c7c', 0.45);
  const hair = modernHex(hairIdx);
  const jacket = modernHex(jacketIdx);
  const helmet = modernHex(helmetIdx);
  const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng(), r6 = rng();
  const visor = style === 'helmet' ? 'visor' : (seed & 1) === 1 ? 'goggles' : r1 < 0.3 ? 'visor' : 'none';
  const cyber = !!(driver && driver.skill >= 0.99);
  return {
    seed, style, visor, cyber,
    accent, rim2: '#5ad0ff',
    skin: { base: skin, light: mixHex(skin, '#fff2e6', 0.35), shade: mixHex(skin, '#3a1226', 0.5), deep: mixHex(skin, '#1a0a18', 0.72) },
    hair: { base: hair, light: mixHex(hair, '#ffffff', 0.4), dark: mixHex(hair, '#05060c', 0.55) },
    jacket: { base: mixHex(jacket, '#07080f', 0.5), light: mixHex(jacket, '#07080f', 0.15), dark: mixHex(jacket, '#05060a', 0.8), raw: jacket },
    helmet: { base: helmet, light: mixHex(helmet, '#ffffff', 0.5), dark: mixHex(helmet, '#05060a', 0.6) },
    bg: { top: mixHex('#080a14', accent, 0.08), bottom: mixHex('#161a2e', accent, 0.16) },
    iris: mixHex(accent, '#10131c', 0.35),
    jaw: Math.round((r2 * 8 - 3) * 10) / 10,          // chin width tweak
    brow: Math.round((r3 * 0.5 - 0.1) * 100) / 100,   // brow tilt (stern <-> sly)
    mood: r4 < 0.5 ? 'stern' : 'smirk',
    scar: r5 < 0.7 ? { side: seed % 3 === 0 ? -1 : 1, tilt: Math.round((r1 * 0.5 + 0.2) * 100) / 100 } : null,
    beard: r6 < 0.4 ? (r1 < 0.5 ? 'stubble' : 'full') : null,
  };
}

// ---------- drawing ----------
function lin(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
function rad(ctx, x0, y0, r0, x1, y1, r1, stops) { const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }

function headPath(ctx, jaw) {
  const cw = 28 + jaw;                                    // half chin width control
  ctx.beginPath();
  ctx.moveTo(128, 52);
  ctx.bezierCurveTo(170, 52, 184, 90, 181, 126);
  ctx.bezierCurveTo(178, 160, 158 + (cw - 28) * 0.3, 186, 128, 188);
  ctx.bezierCurveTo(98 - (cw - 28) * 0.3, 186, 78, 160, 75, 126);
  ctx.bezierCurveTo(72, 90, 86, 52, 128, 52);
  ctx.closePath();
}
function glowLine(ctx, color, w, blur, fn) { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); fn(); ctx.stroke(); ctx.restore(); }

function drawBackdrop(ctx, s) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, 256, [[0, s.bg.top], [1, s.bg.bottom]]); ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = rad(ctx, 128, 112, 4, 128, 112, 150, [[0, rgba(s.accent, 0.5)], [0.55, rgba(s.accent, 0.14)], [1, rgba(s.accent, 0)]]); ctx.fillRect(0, 0, 256, 256);
  // city bokeh + light bars (seeded)
  const r = mulberry32(s.seed * 31 + 7);
  for (let i = 0; i < 9; i++) {
    const x = r() * 256, y = 20 + r() * 150, rr = 6 + r() * 16, col = r() < 0.5 ? s.accent : s.rim2;
    ctx.fillStyle = rgba(col, 0.05 + r() * 0.1); ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 4; i++) { const x = 14 + r() * 228, h = 40 + r() * 90; ctx.fillStyle = lin(ctx, x, 256 - h, x, 256, [[0, rgba(s.rim2, 0)], [1, rgba(s.rim2, 0.16)]]); ctx.fillRect(x, 256 - h, 2 + r() * 3, h); }
}

function drawJacket(ctx, s) {
  const j = s.jacket;
  ctx.beginPath(); ctx.moveTo(4, 256); ctx.bezierCurveTo(8, 222, 52, 206, 96, 198); ctx.lineTo(160, 198); ctx.bezierCurveTo(204, 206, 248, 222, 252, 256); ctx.closePath();
  ctx.fillStyle = lin(ctx, 40, 196, 216, 256, [[0, j.light], [0.55, j.base], [1, j.dark]]); ctx.fill();
  ctx.save(); ctx.clip();
  // fold shading + right rim light
  ctx.fillStyle = rad(ctx, 70, 205, 4, 70, 205, 110, [[0, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(0, 190, 256, 66);
  ctx.fillStyle = lin(ctx, 256, 0, 190, 0, [[0, rgba(s.accent, 0.55)], [1, rgba(s.accent, 0)]]); ctx.fillRect(190, 190, 66, 66);
  ctx.restore();
  // inner undershirt V + collar flaps
  ctx.beginPath(); ctx.moveTo(100, 198); ctx.lineTo(128, 238); ctx.lineTo(156, 198); ctx.closePath(); ctx.fillStyle = '#0b0d16'; ctx.fill();
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(128 + sx * 30, 194); ctx.lineTo(128 + sx * 50, 206); ctx.lineTo(128 + sx * 16, 256); ctx.lineTo(128 + sx * 2, 240); ctx.lineTo(128 + sx * 30, 200); ctx.closePath();
    ctx.fillStyle = lin(ctx, 128, 194, 128 + sx * 40, 256, [[0, mixHex(j.base, '#ffffff', 0.18)], [1, j.dark]]); ctx.fill();
  }
  glowLine(ctx, s.accent, 2, 8, () => { ctx.moveTo(100, 199); ctx.lineTo(128, 238); ctx.lineTo(156, 199); });
  glowLine(ctx, s.accent, 2.4, 8, () => { ctx.moveTo(30, 232); ctx.quadraticCurveTo(54, 214, 86, 207); });
  ctx.fillStyle = rgba(s.accent, 0.9); ctx.beginPath(); ctx.arc(46, 240, 4, 0, Math.PI * 2); ctx.fill();
}

function drawNeck(ctx, s) {
  ctx.beginPath(); ctx.moveTo(104, 160); ctx.lineTo(102, 208); ctx.quadraticCurveTo(128, 222, 154, 208); ctx.lineTo(152, 160); ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 160, 0, 214, [[0, s.skin.deep], [0.4, s.skin.shade], [1, s.skin.base]]); ctx.fill();
  ctx.fillStyle = lin(ctx, 150, 0, 120, 0, [[0, rgba(s.accent, 0.35)], [1, rgba(s.accent, 0)]]); ctx.fill();
}

function drawHairBack(ctx, s) {
  if (s.style !== 'long') return;
  ctx.beginPath(); ctx.moveTo(72, 100); ctx.bezierCurveTo(52, 140, 54, 200, 62, 238); ctx.lineTo(194, 238); ctx.bezierCurveTo(204, 200, 204, 140, 184, 100); ctx.bezierCurveTo(170, 40, 86, 40, 72, 100); ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 40, 0, 240, [[0, s.hair.light], [0.4, s.hair.base], [1, s.hair.dark]]); ctx.fill();
}

function drawHead(ctx, s) {
  const sk = s.skin;
  // ears
  for (const sx of [-1, 1]) { ctx.fillStyle = sx < 0 ? sk.shade : sk.base; ctx.beginPath(); ctx.ellipse(128 + sx * 53, 130, 7, 12, 0, 0, Math.PI * 2); ctx.fill(); }
  headPath(ctx, s.jaw);
  ctx.fillStyle = rad(ctx, 108, 104, 8, 128, 128, 100, [[0, sk.light], [0.45, sk.base], [1, sk.shade]]); ctx.fill();
  ctx.save(); headPath(ctx, s.jaw); ctx.clip();
  ctx.fillStyle = rad(ctx, 128, 196, 6, 128, 190, 52, [[0, rgba(sk.deep, 0.55)], [1, rgba(sk.deep, 0)]]); ctx.fillRect(60, 150, 140, 60); // under-chin shadow
  ctx.fillStyle = rad(ctx, 96, 150, 2, 96, 150, 22, [[0, rgba('#ff6a80', 0.16)], [1, rgba('#ff6a80', 0)]]); ctx.fillRect(60, 120, 80, 60);   // cheek blush
  ctx.fillStyle = lin(ctx, 190, 0, 150, 0, [[0, rgba(s.accent, 0.8)], [0.5, rgba(s.accent, 0.2)], [1, rgba(s.accent, 0)]]); ctx.fillRect(140, 40, 60, 170);   // neon rim (right)
  ctx.fillStyle = lin(ctx, 70, 0, 96, 0, [[0, rgba(s.rim2, 0.32)], [1, rgba(s.rim2, 0)]]); ctx.fillRect(60, 40, 50, 170);                               // cool rim (left)
  ctx.restore();
}

function drawHairFront(ctx, s) {
  const h = s.hair;
  if (s.style === 'swept') {
    ctx.beginPath(); ctx.moveTo(74, 112); ctx.bezierCurveTo(66, 60, 92, 28, 134, 28); ctx.bezierCurveTo(176, 30, 192, 62, 182, 114); ctx.bezierCurveTo(176, 96, 170, 84, 156, 78); ctx.bezierCurveTo(130, 70, 100, 80, 90, 106); ctx.closePath();
    ctx.fillStyle = lin(ctx, 80, 28, 180, 110, [[0, h.light], [0.5, h.base], [1, h.dark]]); ctx.fill();
    glowLine(ctx, rgba(h.light, 0.7), 2, 0, () => { ctx.moveTo(98, 58); ctx.bezierCurveTo(116, 38, 150, 36, 170, 56); });
  } else if (s.style === 'mohawk') {
    ctx.save(); headPath(ctx, s.jaw); ctx.clip(); ctx.fillStyle = rgba(h.base, 0.38); ctx.fillRect(60, 40, 140, 54); ctx.restore();   // shaved sides
    const spikes = [[112, 62, 104, 30], [120, 58, 116, 14], [128, 56, 130, 4], [136, 58, 144, 14], [144, 62, 154, 30]];
    for (const [bx, by, tx, ty] of spikes) {
      ctx.beginPath(); ctx.moveTo(bx - 7, by + 6); ctx.lineTo(tx, ty); ctx.lineTo(bx + 7, by + 6); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, ty, 0, by + 6, [[0, h.light], [1, h.base]]); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(112, 66); ctx.quadraticCurveTo(128, 54, 144, 66); ctx.lineTo(140, 92); ctx.quadraticCurveTo(128, 84, 116, 92); ctx.closePath(); ctx.fillStyle = h.base; ctx.fill();
  } else if (s.style === 'buzz') {
    ctx.save(); headPath(ctx, s.jaw); ctx.clip();
    ctx.beginPath(); ctx.moveTo(60, 30); ctx.lineTo(200, 30); ctx.lineTo(200, 104); ctx.bezierCurveTo(176, 88, 152, 82, 128, 82); ctx.bezierCurveTo(104, 82, 80, 88, 60, 104); ctx.closePath();
    ctx.fillStyle = lin(ctx, 90, 40, 170, 100, [[0, mixHex(h.base, s.skin.base, 0.15)], [1, mixHex(h.dark, s.skin.shade, 0.3)]]); ctx.fill();
    ctx.restore();
  } else if (s.style === 'long') {
    ctx.beginPath(); ctx.moveTo(72, 128); ctx.bezierCurveTo(60, 64, 92, 32, 130, 34); ctx.bezierCurveTo(172, 34, 196, 64, 184, 128); ctx.bezierCurveTo(182, 108, 176, 90, 160, 84); ctx.bezierCurveTo(144, 94, 118, 80, 98, 90); ctx.bezierCurveTo(86, 98, 78, 112, 72, 128); ctx.closePath();
    ctx.fillStyle = lin(ctx, 70, 30, 190, 130, [[0, h.light], [0.5, h.base], [1, h.dark]]); ctx.fill();
    for (const sx of [-1, 1]) {            // locks over the shoulders
      ctx.beginPath(); ctx.moveTo(128 + sx * 52, 110); ctx.bezierCurveTo(128 + sx * 62, 150, 128 + sx * 66, 190, 128 + sx * 62, 232); ctx.lineTo(128 + sx * 48, 232); ctx.bezierCurveTo(128 + sx * 50, 190, 128 + sx * 46, 150, 128 + sx * 44, 112); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, 110, 0, 232, [[0, h.base], [1, h.dark]]); ctx.fill();
    }
  } else {                                 // helmet
    const m = s.helmet;
    ctx.beginPath(); ctx.moveTo(68, 128); ctx.bezierCurveTo(60, 56, 94, 24, 130, 24); ctx.bezierCurveTo(170, 24, 198, 58, 188, 128); ctx.lineTo(182, 138); ctx.bezierCurveTo(150, 128, 106, 128, 74, 138); ctx.closePath();
    ctx.fillStyle = lin(ctx, 78, 24, 186, 130, [[0, m.light], [0.4, m.base], [1, m.dark]]); ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = lin(ctx, 190, 0, 150, 0, [[0, rgba(s.accent, 0.6)], [1, rgba(s.accent, 0)]]); ctx.fillRect(140, 20, 60, 120); ctx.restore();
    ctx.fillStyle = rgba('#ffffff', 0.4); ctx.beginPath(); ctx.ellipse(104, 52, 20, 7, -0.6, 0, Math.PI * 2); ctx.fill();   // glossy highlight
    ctx.fillStyle = s.accent; ctx.beginPath(); ctx.moveTo(124, 24); ctx.lineTo(134, 24); ctx.lineTo(138, 100); ctx.lineTo(120, 100); ctx.closePath(); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;   // centre stripe
    glowLine(ctx, '#0a0b12', 4, 0, () => { ctx.moveTo(76, 134); ctx.quadraticCurveTo(80, 172, 100, 186); });    // chin strap
  }
}

function drawFace(ctx, s) {
  const eyeY = 122, hidden = s.visor !== 'none';
  const sk = s.skin;
  // nose
  glowLine(ctx, rgba(sk.deep, 0.35), 3, 0, () => { ctx.moveTo(131, 124); ctx.quadraticCurveTo(136, 146, 128, 152); ctx.quadraticCurveTo(122, 154, 119, 150); });
  glowLine(ctx, rgba(sk.light, 0.5), 2, 0, () => { ctx.moveTo(122, 126); ctx.lineTo(121, 146); });
  // eyes + brows
  const browC = s.style === 'helmet' || s.hair.base === sk.base ? s.hair.dark : s.hair.base;
  for (const sx of [-1, 1]) {
    const cx = 128 + sx * 26;
    if (!hidden && !(s.cyber && sx > 0)) {
      ctx.fillStyle = '#f4f0ee'; ctx.beginPath(); ctx.ellipse(cx, eyeY, 10.5, 5.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s.iris; ctx.beginPath(); ctx.arc(cx + sx * -0.5, eyeY, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#05060a'; ctx.beginPath(); ctx.arc(cx + sx * -0.5, eyeY, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx - 2, eyeY - 1.8, 1.4, 0, Math.PI * 2); ctx.fill();
      glowLine(ctx, rgba(sk.deep, 0.9), 2.4, 0, () => { ctx.moveTo(cx - 11, eyeY + 0.5); ctx.quadraticCurveTo(cx, eyeY - 8, cx + 11, eyeY + 0.5); });
    } else if (!hidden && s.cyber && sx > 0) {   // cybernetic eye
      ctx.fillStyle = '#12141c'; ctx.beginPath(); ctx.ellipse(cx, eyeY, 10.5, 6, 0, 0, Math.PI * 2); ctx.fill();
      glowLine(ctx, '#ff2d4b', 2, 10, () => { ctx.arc(cx, eyeY, 4.2, 0, Math.PI * 2); });
      ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.arc(cx, eyeY, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // brow: inner end (towards the nose) sits lower for stern, flatter for smirk
    const t = (s.mood === 'stern' ? 3 : 0.5) + s.brow * 6;
    ctx.save(); ctx.strokeStyle = browC; ctx.lineWidth = 4.6; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(cx - sx * 12, eyeY - 13 + t * 0.6); ctx.lineTo(cx + sx * 12, eyeY - 16 - t * 0.5);
    ctx.stroke(); ctx.restore();
  }
  // mouth
  const my = 166, lip = mixHex(sk.base, '#7a2438', 0.55);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = lip; ctx.beginPath();
  if (s.mood === 'stern') { ctx.moveTo(110, my); ctx.quadraticCurveTo(128, my + 2, 146, my); } else { ctx.moveTo(110, my + 1); ctx.quadraticCurveTo(130, my + 3, 148, my - 5); }
  ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = rgba(sk.deep, 0.5); ctx.beginPath(); ctx.moveTo(118, my + 8); ctx.quadraticCurveTo(128, my + 11, 138, my + 8); ctx.stroke();
  ctx.restore();
  // beard
  if (s.beard) {
    ctx.save(); headPath(ctx, s.jaw); ctx.clip();
    ctx.beginPath(); ctx.moveTo(70, 140); ctx.bezierCurveTo(96, 156, 104, 156, 114, 158); ctx.quadraticCurveTo(128, 154, 142, 158); ctx.bezierCurveTo(152, 156, 160, 156, 186, 140); ctx.lineTo(190, 200); ctx.lineTo(66, 200); ctx.closePath();
    ctx.globalAlpha = s.beard === 'full' ? 0.92 : 0.38; ctx.fillStyle = lin(ctx, 0, 140, 0, 196, [[0, s.hair.base], [1, s.hair.dark]]); ctx.fill(); ctx.globalAlpha = 1;
    if (s.beard === 'full') { ctx.strokeStyle = lip; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(116, my + 2); ctx.quadraticCurveTo(128, my + 4, 142, my + 1); ctx.stroke(); }
    ctx.restore();
  }
  // scar
  if (s.scar) {
    const sc = s.scar, x0 = 128 + sc.side * 22, y0 = 96, x1 = x0 + sc.side * (14 + sc.tilt * 10), y1 = 152;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(200,58,85,0.9)'; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,214,222,0.8)'; ctx.lineWidth = 1.4;
    for (let i = 1; i <= 5; i++) { const t = i / 6, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t; ctx.beginPath(); ctx.moveTo(px - 4, py - 1.5); ctx.lineTo(px + 4, py + 1.5); ctx.stroke(); }
    ctx.restore();
  }
}

function drawCyberJaw(ctx, s) {
  if (!s.cyber) return;
  ctx.save(); headPath(ctx, s.jaw); ctx.clip();
  ctx.beginPath(); ctx.moveTo(126, 150); ctx.bezierCurveTo(146, 138, 172, 138, 186, 124); ctx.lineTo(190, 200); ctx.lineTo(126, 200); ctx.closePath();
  ctx.fillStyle = lin(ctx, 130, 140, 188, 190, [[0, '#e8edf8'], [0.35, '#9aa4ba'], [1, '#3a4258']]); ctx.fill();
  ctx.strokeStyle = 'rgba(12,14,22,0.7)'; ctx.lineWidth = 1.6;
  for (const [a, b, c, d] of [[140, 156, 188, 150], [136, 170, 188, 166], [150, 150, 144, 200]]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  ctx.restore();
  glowLine(ctx, s.accent, 2.2, 10, () => { ctx.moveTo(132, 184); ctx.quadraticCurveTo(152, 184, 178, 160); });
  ctx.fillStyle = '#ff2d4b'; ctx.shadowColor = '#ff2d4b'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(168, 152, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
}

function drawVisor(ctx, s) {
  const a = s.accent;
  if (s.visor === 'visor') {
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); };
    ctx.save(); ctx.shadowColor = a; ctx.shadowBlur = 16; rr(72, 104, 112, 32, 14); ctx.fillStyle = '#06080f'; ctx.fill(); ctx.restore();
    rr(72, 104, 112, 32, 14); ctx.fillStyle = lin(ctx, 72, 0, 184, 0, [[0, rgba(a, 0.15)], [0.5, rgba(a, 0.55)], [1, rgba(a, 0.9)]]); ctx.fill();
    ctx.save(); rr(72, 104, 112, 32, 14); ctx.clip(); ctx.fillStyle = lin(ctx, 0, 104, 0, 136, [[0, 'rgba(255,255,255,0.28)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.3)']]); ctx.fillRect(70, 100, 116, 40); ctx.restore();
    glowLine(ctx, '#ffffff', 2, 10, () => { ctx.moveTo(86, 120); ctx.lineTo(170, 120); });
    glowLine(ctx, rgba('#ffffff', 0.55), 1.6, 0, () => { ctx.moveTo(84, 110); ctx.lineTo(112, 108); });
  } else if (s.visor === 'goggles') {
    glowLine(ctx, '#15161e', 11, 0, () => { ctx.moveTo(68, 116); ctx.lineTo(188, 116); });                         // strap
    glowLine(ctx, rgba('#ffffff', 0.12), 1.4, 0, () => { ctx.moveTo(68, 112); ctx.lineTo(188, 112); });
    for (const sx of [-1, 1]) {
      const cx = 128 + sx * 28, cy = 120;
      ctx.save(); ctx.shadowColor = a; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(cx, cy, 19, 0, Math.PI * 2); ctx.fillStyle = '#07090f'; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fillStyle = rad(ctx, cx - 4, cy - 5, 1, cx, cy, 16, [[0, '#ffffff'], [0.25, a], [1, rgba(mixHex(a, '#05060c', 0.6), 1)]]); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 17.5, 0, Math.PI * 2); ctx.lineWidth = 4.5; ctx.strokeStyle = lin(ctx, cx - 18, cy - 18, cx + 18, cy + 18, [[0, '#d6dcea'], [0.5, '#5b6379'], [1, '#262b3a']]); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(cx - 6, cy - 7, 4.5, 2, -0.7, 0, Math.PI * 2); ctx.fill();
    }
    glowLine(ctx, '#5b6379', 4, 0, () => { ctx.moveTo(123, 120); ctx.lineTo(133, 120); });
  }
}

function drawOverlay(ctx, s) {
  ctx.fillStyle = rad(ctx, 128, 120, 90, 128, 128, 190, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(3,4,10,0.62)']]); ctx.fillRect(0, 0, 256, 256);
  // HUD corner brackets
  ctx.save(); ctx.strokeStyle = rgba(s.accent, 0.7); ctx.lineWidth = 2; ctx.shadowColor = s.accent; ctx.shadowBlur = 6; ctx.lineCap = 'square';
  const b = (x, y, dx, dy) => { ctx.beginPath(); ctx.moveTo(x + dx * 16, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * 16); ctx.stroke(); };
  b(10, 10, 1, 1); b(246, 10, -1, 1); b(10, 246, 1, -1); b(246, 246, -1, -1);
  ctx.restore();
}

/** Paints a portraitSpec into the 256x256 logical space of ctx (caller sets the transform). */
export function paintPortrait(ctx, spec) {
  drawBackdrop(ctx, spec);
  drawHairBack(ctx, spec);
  drawJacket(ctx, spec);
  drawNeck(ctx, spec);
  drawHead(ctx, spec);
  drawFace(ctx, spec);
  drawCyberJaw(ctx, spec);
  drawHairFront(ctx, spec);
  drawVisor(ctx, spec);
  drawOverlay(ctx, spec);
}

/** drawPortrait(canvasOrCtx, driver): paints the portrait scaled to the canvas size (smooth, any size). */
export function drawPortrait(target, driver) {
  const ctx = target && target.getContext ? target.getContext('2d') : target;
  if (!ctx) return;
  const cv = ctx.canvas;
  const W = (cv && cv.width) || PORTRAIT_SIZE, H = (cv && cv.height) || PORTRAIT_SIZE;
  ctx.save();
  if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
  if ('imageSmoothingEnabled' in ctx) { ctx.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high'; }
  ctx.scale(W / PORTRAIT_SIZE, H / PORTRAIT_SIZE);
  ctx.beginPath(); ctx.rect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE); ctx.clip();
  try { paintPortrait(ctx, portraitSpec(driver)); } finally { ctx.restore(); }
}
