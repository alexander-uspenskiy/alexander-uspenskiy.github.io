// Dashboard HUD (hero slice): smooth anti-aliased neon canvas — rpm + speed arc gauges, gear, damage diagram, armour bar.
// Canvas can't read CSS variables, so the "Neon Holo" tokens are hard-coded here (kept in sync with hud.css :root fallbacks).
import { h, setClass } from './dom.js';
import { damageColor, carSilhouetteData, ZONE_NAMES } from './icons.js';

const W = 420, H = 168; // logical CSS pixels; backing store is scaled by devicePixelRatio

const C = {
  bg0: '#04060c', bg1: '#0a1222', glass: 'rgba(12,20,38,0.82)', line: 'rgba(120,210,255,0.22)', lineStrong: 'rgba(120,230,255,0.5)',
  cyan: '#35e6ff', magenta: '#ff3df0', amber: '#ffb02e', lime: '#5dff9d', red: '#ff4466', text: '#eaf6ff', dim: '#8da4bd',
};
const FONT = '"Eurostile","Bank Gothic","Segoe UI",system-ui,sans-serif';

/** Pure: damage fraction 0..1 -> '#rrggbb' (lime -> amber -> red). */
export function zoneColor(d) { return damageColor(d); }
/** Pure: needle angle (rad) for a value on a 270° dial starting at 135° (bottom-left) sweeping clockwise. */
export function gaugeAngle(value, max) { return (0.75 + 1.5 * Math.min(1, Math.max(0, value / max))) * Math.PI; }
export function gearLabel(gear, reversing, speed) { return reversing && speed > 0.5 ? 'R' : speed < 0.3 ? 'N' : String(gear || 1); }

const GAUGES = [
  { cx: 80, cy: 90, r: 56, max: 8, step: 1, major: 2, red: 7, label: 'RPM', sub: 'x1000' },
  { cx: 340, cy: 90, r: 56, max: 280, step: 20, major: 40, red: 240, label: 'KPH', sub: '' },
];

function roundRect(ctx, x, y, w, hh, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Static layer: panel, tracks, ticks, numerals, captions. Drawn once into an offscreen canvas. */
function drawStatic(ctx) {
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(16,28,54,0.88)'); g.addColorStop(1, 'rgba(6,10,20,0.9)');
  roundRect(ctx, 1, 1, W - 2, H - 2, 18); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = C.lineStrong; ctx.stroke();
  // faint top highlight
  ctx.beginPath(); ctx.moveTo(30, 2); ctx.lineTo(W - 30, 2); ctx.strokeStyle = 'rgba(180,240,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.lineCap = 'round';
  for (const gg of GAUGES) {
    const a0 = gaugeAngle(0, 1), a1 = gaugeAngle(1, 1);
    ctx.beginPath(); ctx.arc(gg.cx, gg.cy, gg.r, a0, a1); ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(120,210,255,0.14)'; ctx.stroke();
    for (let v = 0; v <= gg.max + 1e-6; v += gg.step) {
      const a = gaugeAngle(v, gg.max), big = v % gg.major === 0, red = v >= gg.red;
      const r0 = gg.r + 8, r1 = gg.r + (big ? 15 : 12);
      ctx.beginPath(); ctx.moveTo(gg.cx + Math.cos(a) * r0, gg.cy + Math.sin(a) * r0); ctx.lineTo(gg.cx + Math.cos(a) * r1, gg.cy + Math.sin(a) * r1);
      ctx.lineWidth = big ? 1.8 : 1; ctx.strokeStyle = red ? C.red : big ? C.text : 'rgba(141,164,189,0.7)'; ctx.stroke();
    }
    ctx.fillStyle = C.dim; ctx.font = `600 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let v = 0; v <= gg.max + 1e-6; v += gg.major) {
      const a = gaugeAngle(v, gg.max);
      ctx.fillStyle = v >= gg.red ? C.red : C.dim;
      ctx.fillText(String(v), gg.cx + Math.cos(a) * (gg.r - 12), gg.cy + Math.sin(a) * (gg.r - 12));
    }
    ctx.fillStyle = C.dim; ctx.font = `700 10px ${FONT}`;
    ctx.fillText(gg.label, gg.cx, gg.cy + 36);
    if (gg.sub) { ctx.font = `600 8px ${FONT}`; ctx.fillText(gg.sub, gg.cx, gg.cy + 46); }
  }
  // centre column rails
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  for (const x of [148, 272]) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, H - 20); ctx.stroke(); }
  ctx.fillStyle = C.dim; ctx.font = `700 8px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('GEAR', 210, 20);
  ctx.fillText('ARMOUR', 210, H - 28);
}

export function createDash({ root }) {
  const canvas = h('canvas.hud-dash-canvas', { width: W, height: H });
  const el = h('div.hud-dash.hidden', canvas);
  root.append(el);
  const ctx = canvas.getContext('2d');
  let enabled = false;
  let dpr = 0;
  let layer = null;
  let lastKey = '';
  let carId = 'hammer';
  let paths = null; // Path2D cache for the current car silhouette
  const grads = [];

  function ensureSize() {
    const d = Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    if (d === dpr && layer) return;
    dpr = d;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    layer = document.createElement('canvas');
    layer.width = canvas.width; layer.height = canvas.height;
    const lc = layer.getContext('2d');
    lc.scale(dpr, dpr);
    drawStatic(lc);
    grads.length = 0;
    for (const gg of GAUGES) {
      const g = ctx.createLinearGradient(gg.cx - gg.r, 0, gg.cx + gg.r, 0);
      g.addColorStop(0, C.cyan); g.addColorStop(1, C.magenta);
      grads.push(g);
    }
    lastKey = '';
  }

  function getPaths() {
    if (paths && paths.id === carId) return paths;
    const s = carSilhouetteData(carId);
    paths = {
      id: carId,
      wheels: s.wheels.map((d) => new Path2D(d)), chassis: new Path2D(s.chassis), outline: new Path2D(s.outline),
      glass: new Path2D(s.glass), extras: s.extras.map((d) => new Path2D(d)), zones: ZONE_NAMES.map((z) => new Path2D(s.zones[z])),
    };
    return paths;
  }

  function arcGauge(gg, i, value, hot) {
    const f = Math.min(1, Math.max(0, value / gg.max));
    if (f > 0.002) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineWidth = 8;
      ctx.shadowColor = hot ? C.red : C.cyan; ctx.shadowBlur = 12;
      ctx.strokeStyle = hot ? C.red : grads[i];
      ctx.beginPath(); ctx.arc(gg.cx, gg.cy, gg.r, gaugeAngle(0, 1), gaugeAngle(f, 1)); ctx.stroke();
      ctx.restore();
      const a = gaugeAngle(value, gg.max);
      ctx.beginPath(); ctx.arc(gg.cx + Math.cos(a) * gg.r, gg.cy + Math.sin(a) * gg.r, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
    }
  }

  function drawCar(car, x, y, s) {
    const p = getPaths();
    const d = car.dmg || [0, 0, 0, 0], dead = !!car.wrecked;
    ctx.save();
    ctx.translate(x - 30 * s, y - 50 * s); ctx.scale(s, s);
    ctx.fillStyle = car.tyresPopped ? C.red : C.dim; ctx.globalAlpha = 0.6;
    for (const w of p.wheels) ctx.fill(w);
    ctx.globalAlpha = 0.22; ctx.fillStyle = C.text; ctx.fill(p.chassis);
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 4; i++) { ctx.fillStyle = dead ? '#5a2a3a' : damageColor(d[i] || 0); ctx.fill(p.zones[i]); }
    ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2; ctx.strokeStyle = C.text;
    for (const z of p.zones) ctx.stroke(z);
    ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6; ctx.strokeStyle = C.text; ctx.stroke(p.outline);
    ctx.globalAlpha = 0.4; ctx.fillStyle = C.text; ctx.fill(p.glass);
    ctx.globalAlpha = 0.8; ctx.lineWidth = 1.4; for (const e of p.extras) ctx.stroke(e);
    if (car.burning || car.smoke) {
      const flick = car.burning && Math.floor(performance.now() / 120) % 2;
      ctx.globalAlpha = car.burning ? 0.9 : 0.5;
      ctx.fillStyle = car.burning ? (flick ? C.amber : C.red) : C.dim;
      ctx.beginPath(); ctx.arc(30, 24, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  const api = {
    el,
    setEnabled(b) { enabled = !!b; setClass(el, 'hidden', !enabled); },
    /** Pick the top-down silhouette used by the damage diagram (wasp | hammer | bulwark). */
    setCar(id) { if (id && id !== carId) { carId = id; paths = null; lastKey = ''; } },
    update(car) {
      if (!enabled || !car) return;
      ensureSize();
      const kph = (car.speed || 0) * 3.6, rpm = (car.rpm || 0) * 8;
      const af = car.armorMax > 0 ? Math.max(0, Math.min(1, car.armor / car.armorMax)) : 0;
      const gl = gearLabel(car.gear, car.reversing, car.speed || 0);
      const dm = car.dmg ? car.dmg.map((v) => Math.round(v * 100)).join(',') : '';
      const anim = car.burning || car.limiter ? Math.floor(performance.now() / 100) : 0;
      const key = `${Math.round(kph)}|${Math.round(rpm * 40)}|${gl}|${Math.round(af * 100)}|${dm}|${car.wrecked ? 1 : 0}${car.tyresPopped ? 1 : 0}${car.smoke ? 1 : 0}|${car.limiter ? 1 : 0}|${anim}`;
      if (key === lastKey) return;
      lastKey = key;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(layer, 0, 0, W, H);
      ctx.lineCap = 'round';
      arcGauge(GAUGES[0], 0, rpm, rpm >= GAUGES[0].red);
      arcGauge(GAUGES[1], 1, kph, kph >= GAUGES[1].red);
      // digital readouts
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text; ctx.font = `italic 800 30px ${FONT}`;
      ctx.fillText(String(Math.round(kph)), GAUGES[1].cx, GAUGES[1].cy - 2);
      ctx.font = `italic 800 22px ${FONT}`;
      ctx.fillText(rpm.toFixed(1), GAUGES[0].cx, GAUGES[0].cy - 2);
      // gear
      ctx.save();
      ctx.font = `italic 800 40px ${FONT}`; ctx.fillStyle = car.limiter ? C.red : C.cyan;
      ctx.shadowColor = car.limiter ? C.red : C.cyan; ctx.shadowBlur = 14;
      ctx.fillText(gl, 210, 44);
      ctx.restore();
      // damage diagram
      drawCar(car, 210, 94, 0.5);
      // armour bar: 12 glass segments
      const bx = 150, bw = 120, by = H - 18, segs = 12, gap = 2, sw = (bw - gap * (segs - 1)) / segs;
      const col = damageColor(1 - af);
      for (let i = 0; i < segs; i++) {
        const on = i < Math.ceil(af * segs - 1e-6);
        ctx.fillStyle = on ? col : 'rgba(120,210,255,0.14)';
        ctx.fillRect(bx + i * (sw + gap), by - 5, sw, 7);
      }
    },
  };
  return api;
}
