// Procedural vector decals (no assets). Everything draws into a Canvas 2D-like context `g` in "design space": the unit square
// [-0.5,0.5]², y UP, x RIGHT; callers flip/scale. Node-safe: only context method calls (tests pass a recording fake).
const TAU = Math.PI * 2;
const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const rect = (g, x, y, w, h) => { g.beginPath(); g.rect(x, y, w, h); g.fill(); };
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };

function skull(g, bg) {
  g.beginPath(); g.arc(0, 0.08, 0.34, 0, TAU); g.fill();
  rect(g, -0.2, -0.36, 0.4, 0.3);
  g.save(); g.globalCompositeOperation = 'destination-out';
  circle(g, -0.13, 0.08, 0.1); circle(g, 0.13, 0.08, 0.1);
  poly(g, [[0, -0.02], [-0.05, -0.12], [0.05, -0.12]]); g.fill();
  for (let i = -2; i <= 2; i++) rect(g, i * 0.075 - 0.012, -0.36, 0.024, 0.12);
  g.restore();
}
function bolt(g) { poly(g, [[0.12, 0.5], [-0.28, -0.04], [-0.02, -0.04], [-0.14, -0.5], [0.3, 0.1], [0.04, 0.1]]); g.fill(); }
function flames(g) {
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.19, h = 0.34 + 0.12 * Math.cos(i * 1.3);
    g.beginPath(); g.moveTo(x - 0.11, -0.42); g.bezierCurveTo(x - 0.16, -0.1, x + 0.02, -0.02, x - 0.02, h - 0.1); g.bezierCurveTo(x + 0.14, 0.0, x + 0.2, -0.2, x + 0.11, -0.42); g.closePath(); g.fill();
  }
}
function flamingSkull(g) { g.save(); g.translate(0, -0.08); g.scale(0.72, 0.72); skull(g); g.restore(); g.save(); g.translate(0, 0.2); g.scale(1, 0.55); flames(g); g.restore(); }
function wings(g) {
  for (const s of [1, -1]) {
    g.save(); g.scale(s, 1);
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0.06, 0.05 - i * 0.07); g.quadraticCurveTo(0.3, 0.2 - i * 0.12, 0.48 - i * 0.04, 0.1 - i * 0.13); g.quadraticCurveTo(0.32, 0.02 - i * 0.1, 0.06, -0.02 - i * 0.07); g.closePath(); g.fill(); }
    g.restore();
  }
  circle(g, 0, 0, 0.07);
}
function pistons(g) {
  for (const s of [1, -1]) { g.save(); g.rotate(s * 0.7); rect(g, -0.05, -0.4, 0.1, 0.62); rect(g, -0.11, 0.22, 0.22, 0.2); for (let i = 0; i < 3; i++) rect(g, -0.115, 0.24 + i * 0.06, 0.23, 0.02); g.restore(); }
  circle(g, 0, 0, 0.07);
}
function snake(g) {
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 0.1; g.beginPath(); g.moveTo(0.3, -0.42);
  g.bezierCurveTo(-0.4, -0.3, 0.4, -0.05, -0.2, 0.12); g.bezierCurveTo(-0.45, 0.2, -0.3, 0.42, 0.05, 0.38); g.stroke();
  circle(g, 0.07, 0.38, 0.075);
  g.save(); g.globalCompositeOperation = 'destination-out'; circle(g, 0.09, 0.4, 0.018); g.restore();
}
function claws(g) { for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 0.2 - 0.05, 0.5); g.quadraticCurveTo(i * 0.2 + 0.12, 0.05, i * 0.2 + 0.02 - 0.06 * i, -0.5); g.quadraticCurveTo(i * 0.2 + 0.2, 0.0, i * 0.2 + 0.1, 0.5); g.closePath(); g.fill(); } }
function tribal(g) {
  for (const s of [1, -1]) { g.save(); g.scale(s, 1); for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(0.02, -0.45 + i * 0.3); g.quadraticCurveTo(0.35, -0.3 + i * 0.3, 0.2, 0.0 + i * 0.3 - 0.05); g.quadraticCurveTo(0.12, -0.2 + i * 0.3, 0.02, -0.25 + i * 0.3); g.closePath(); g.fill(); } g.restore(); }
}
function racingStripes(g) { rect(g, -0.2, -0.5, 0.14, 1); rect(g, 0.06, -0.5, 0.14, 1); }
function checker(g) { const n = 6, c = 1 / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 2 === 0) rect(g, -0.5 + x * c, -0.5 + y * c, c, c); }
function shark(g) { const n = 7; for (let i = 0; i < n; i++) poly(g, [[-0.5 + i / n, 0.1], [-0.5 + (i + 1) / n, 0.1], [-0.5 + (i + 0.5) / n, -0.3]]), g.fill(); rect(g, -0.5, 0.1, 1, 0.08); }
function radiation(g) {
  g.beginPath(); g.arc(0, 0, 0.46, 0, TAU); g.lineWidth = 0.04; g.stroke();
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 0.4, k * (TAU / 3) + 0.4, k * (TAU / 3) + 0.4 + 1.05); g.closePath(); g.fill(); }
  g.save(); g.globalCompositeOperation = 'destination-out'; circle(g, 0, 0, 0.1); g.restore(); circle(g, 0, 0, 0.07);
}
function crown(g) { poly(g, [[-0.4, -0.25], [-0.4, 0.25], [-0.2, 0.0], [0, 0.35], [0.2, 0.0], [0.4, 0.25], [0.4, -0.25]]); g.fill(); rect(g, -0.4, -0.38, 0.8, 0.09); circle(g, -0.4, 0.28, 0.04); circle(g, 0, 0.38, 0.04); circle(g, 0.4, 0.28, 0.04); }
function star(g) { const p = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * TAU) / 10, r = i % 2 ? 0.19 : 0.48; p.push([Math.cos(a) * r, Math.sin(a) * r]); } poly(g, p); g.fill(); }
function eye(g) {
  g.beginPath(); g.moveTo(-0.5, 0); g.quadraticCurveTo(0, 0.5, 0.5, 0); g.quadraticCurveTo(0, -0.5, -0.5, 0); g.closePath(); g.fill();
  g.save(); g.globalCompositeOperation = 'destination-out'; circle(g, 0, 0, 0.17); g.restore(); circle(g, 0, 0, 0.07);
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 0.1, 0.34 + Math.abs(i) * -0.03); g.lineTo(i * 0.13, 0.46 - Math.abs(i) * 0.02); g.lineWidth = 0.03; g.stroke(); }
}
function barcode(g) { let x = -0.5; const w = [2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 2, 1]; const tot = w.reduce((a, b) => a + b * 2, 0); w.forEach((v, i) => { const ww = (v / tot) * 2 * 1; if (i % 1 === 0) rect(g, x, -0.3, ww * 0.5, 0.6); x += ww; }); }
function plate(g) { g.beginPath(); g.rect(-0.5, -0.22, 1, 0.44); g.fill(); g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.rect(-0.46, -0.18, 0.92, 0.36); g.fill(); g.restore(); rect(g, -0.36, -0.07, 0.72, 0.14); }

export const DECAL_DRAWERS = { skull, bolt, flames, 'flaming-skull': flamingSkull, wings, pistons, snake, claws, tribal, 'racing-stripes': racingStripes, checker, shark, radiation, crown, star, eye, barcode, plate };
/** Draw decal `id` in design space filled/stroked with css colour `color`. Unknown id -> false. */
export function drawDecal(g, id, color = '#ffffff') {
  const f = DECAL_DRAWERS[id];
  if (!f) return false;
  g.save(); g.fillStyle = color; g.strokeStyle = color; g.globalCompositeOperation = 'source-over'; f(g); g.restore();
  return true;
}

/** Design size (metres, at scale 1) per zone. */
export const ZONE_BASE = { hood: 0.9, trunk: 0.6, doorL: 0.3, doorR: 0.3, roof: 0.7 };

/** Set the 2D transform that maps design space (metres; s right, t up) into texture pixels for a zone frame. */
export function frameTransform(g, frame, W, H) {
  const M = frame.M;
  g.setTransform(W * M[0][0], -H * M[1][0], W * M[0][1], -H * M[1][1], W * frame.u, H * (1 - frame.v));
}
const tintCss = (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0');

/**
 * Bake the body-shell decals (hood, doors, trunk) + the racing number into a W×H canvas context.
 * frames: zone -> { u, v, M } from carBody.zoneFrames(); tintOf(id) -> 0xRRGGBB for a paint preset id.
 * Returns the number of draw operations (for tests).
 */
export function composeBodyDecals(g, W, H, placements, frames, tintOf, number = '') {
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  let n = 0;
  for (const p of placements) {
    const fr = frames[p.zone];
    if (!fr || p.zone === 'roof') continue;
    g.save(); frameTransform(g, fr, W, H);
    g.rotate((p.rot * Math.PI) / 180); g.scale((p.mirror ? -1 : 1) * ZONE_BASE[p.zone] * p.scale, ZONE_BASE[p.zone] * p.scale);
    drawDecal(g, p.id, tintCss(tintOf(p.tint))); g.restore(); n++;
  }
  if (number) for (const z of ['doorL', 'doorR']) {
    const fr = frames[z]; if (!fr) continue;
    g.save(); frameTransform(g, fr, W, H); g.translate(0.0, -0.12);
    g.fillStyle = '#f4f6fa'; g.beginPath(); g.arc(0, 0, 0.13, 0, TAU); g.fill();
    g.scale(1, -1); g.fillStyle = '#0b0d12'; g.font = 'bold 0.15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(number, 0, 0.005);
    g.restore(); n++;
  }
  return n;
}
/** Roof decals into a W×H canvas that maps 1:1 onto the roof-panel UV square (roofW × roofL metres). */
export function composeRoofDecals(g, W, H, placements, tintOf, roofW = 1.0, roofL = 1.4) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  let n = 0;
  for (const p of placements) {
    if (p.zone !== 'roof') continue;
    g.save(); g.setTransform(-W / roofW, 0, 0, -H / roofL, W / 2, H / 2);
    g.rotate((p.rot * Math.PI) / 180); g.scale((p.mirror ? -1 : 1) * ZONE_BASE.roof * p.scale, ZONE_BASE.roof * p.scale);
    drawDecal(g, p.id, tintCss(tintOf(p.tint))); g.restore(); n++;
  }
  return n;
}
