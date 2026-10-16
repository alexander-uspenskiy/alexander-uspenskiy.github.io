// Dashboard HUD (hero slice): analog rpm + speed gauges, gear, and a top-down damage diagram, drawn pixel-style in the 16-colour palette.
import { h, setClass } from './dom.js';
import { paletteHex } from '../data/palette.js';

const W = 300, H = 120;

/** Pure: palette index for a damage fraction 0..1 (lime / yellow / orange / red). */
export function zoneColor(d) { return d < 0.2 ? 11 : d < 0.45 ? 10 : d < 0.7 ? 9 : 8; }
/** Pure: needle angle (rad) for a value on a 270° dial starting at 135° (bottom-left) sweeping clockwise. */
export function gaugeAngle(value, max) { return (0.75 + 1.5 * Math.min(1, Math.max(0, value / max))) * Math.PI; }
export function gearLabel(gear, reversing, speed) { return reversing && speed > 0.5 ? 'R' : speed < 0.3 ? 'N' : String(gear || 1); }

function px(ctx, x, y, w, hh, c) { ctx.fillStyle = paletteHex(c); ctx.fillRect(Math.round(x), Math.round(y), w, hh); }
function line(ctx, x0, y0, x1, y1, c) {
  ctx.fillStyle = paletteHex(c);
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx - dy;
  for (;;) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 > -dy) { e -= dy; x0 += sx; } if (e2 < dx) { e += dx; y0 += sy; } }
}
const DIGITS = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111', N: '101111111111101', R: '110101110101101' };
function glyph(ctx, ch, x, y, s, c) { const g = DIGITS[ch]; if (!g) return; for (let i = 0; i < 15; i++) if (g[i] === '1') px(ctx, x + (i % 3) * s, y + ((i / 3) | 0) * s, s, s, c); }
function number(ctx, text, x, y, s, c) { for (let i = 0; i < text.length; i++) glyph(ctx, text[i], x + i * 4 * s, y, s, c); }

function dial(ctx, cx, cy, r, max, step, redFrom, value, label, unit) {
  // face
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const q = x * x + y * y; if (q <= r * r) px(ctx, cx + x, cy + y, 1, 1, q > (r - 2) * (r - 2) ? 5 : 0); }
  for (let v = 0; v <= max; v += step) {
    const a = gaugeAngle(v, max), c = v >= redFrom ? 8 : 7, big = v % (step * 2) === 0;
    line(ctx, cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), cx + Math.cos(a) * (r - (big ? 9 : 6)), cy + Math.sin(a) * (r - (big ? 9 : 6)), c);
  }
  for (let v = redFrom; v < max; v += step / 4) { const a = gaugeAngle(v, max); px(ctx, cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), 1, 1, 8); }
  const a = gaugeAngle(value, max);
  line(ctx, cx, cy, cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6), value >= redFrom ? 8 : 10);
  px(ctx, cx - 1, cy - 1, 3, 3, 6);
  ctx.fillStyle = paletteHex(13); ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, cx, cy + r - 12); ctx.fillText(unit, cx, cy + r - 3);
}

/** Top-down Hammer silhouette; zones coloured by dmg map [front,right,rear,left]. */
function carDiagram(ctx, ox, oy, car) {
  const d = car.dmg || [0, 0, 0, 0], dead = car.wrecked;
  const zc = (z) => (dead ? 0 : zoneColor(z));
  px(ctx, ox, oy + 6, 22, 44, 5);                                  // chassis
  px(ctx, ox + 3, oy, 16, 8, zc(d[0])); px(ctx, ox + 3, oy + 48, 16, 8, zc(d[2]));   // front, rear
  px(ctx, ox + 19, oy + 8, 4, 40, zc(d[1])); px(ctx, ox - 1, oy + 8, 4, 40, zc(d[3]));  // right, left
  px(ctx, ox + 5, oy + 20, 12, 14, dead ? 0 : 1);                  // cabin glass
  px(ctx, ox + 6, oy + 36, 10, 5, 13);
  const wheel = car.tyresPopped ? 8 : 6;
  for (const [x, y] of [[-4, 6], [22, 6], [-4, 38], [22, 38]]) px(ctx, ox + x, oy + y, 4, 10, wheel);
  const hot = car.burning ? (Math.floor(performance.now() / 120) % 2 ? 9 : 8) : car.smoke ? 5 : null;
  if (hot !== null) px(ctx, ox + 7, oy + 8, 8, 6, hot); else px(ctx, ox + 7, oy + 8, 8, 6, 6);
}

export function createDash({ root }) {
  const canvas = h('canvas.hud-dash-canvas', { width: W, height: H });
  const el = h('div.hud-dash.hidden', canvas);
  root.append(el);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let enabled = false;
  const api = {
    el,
    setEnabled(b) { enabled = !!b; setClass(el, 'hidden', !enabled); },
    update(car) {
      if (!enabled || !car) return;
      ctx.clearRect(0, 0, W, H);
      px(ctx, 0, 0, W, H, 0);
      px(ctx, 0, 0, W, 2, 5); px(ctx, 0, H - 2, W, 2, 5);
      const kph = (car.speed || 0) * 3.6, rpm = (car.rpm || 0) * 8;
      dial(ctx, 62, 62, 52, 8, 1, 7, rpm, 'RPM x1000', '');
      for (let v = 0; v <= 8; v += 2) { const a = gaugeAngle(v, 8); number(ctx, String(v), 62 + Math.cos(a) * 34 - 1, 62 + Math.sin(a) * 34 - 2, 1, 7); }
      dial(ctx, 238, 62, 52, 280, 20, 240, kph, 'KPH', '');
      for (let v = 0; v <= 280; v += 80) { const a = gaugeAngle(v, 280); number(ctx, String(v), 238 + Math.cos(a) * 33 - (String(v).length * 2), 62 + Math.sin(a) * 33 - 2, 1, 7); }
      // centre cluster: gear + digital speed + diagram
      px(ctx, 112, 6, 76, 108, 0);
      const gl = gearLabel(car.gear, car.reversing, car.speed || 0);
      number(ctx, gl, 126, 12, 4, car.limiter ? 8 : 10);
      number(ctx, String(Math.round(kph)).padStart(3, ' ').trim(), 120, 40, 2, 7);
      carDiagram(ctx, 140, 58, car);
      if (car.limiter) { px(ctx, 114, 8, 4, 4, 8); }
      const af = car.armorMax > 0 ? Math.max(0, car.armor / car.armorMax) : 0;   // armour bar
      px(ctx, 117, 112 - 8, 66, 6, 5); px(ctx, 118, 112 - 7, Math.round(64 * af), 4, af > 0.6 ? 11 : af > 0.35 ? 10 : af > 0.2 ? 9 : 8);
    },
  };
  return api;
}
