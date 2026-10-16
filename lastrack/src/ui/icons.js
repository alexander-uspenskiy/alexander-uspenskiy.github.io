// Shared vector icons ("Neon Holo"): weapon silhouettes, UI glyphs and top-down car outlines for damage diagrams.
// Node-safe at import: the DOM is only touched inside the builder functions. Everything else is pure data.
//
// Icon data format: { viewBox, paths: [{ d, fill?, stroke?, strokeWidth?, opacity?, ... }] }
// The <svg> root supplies fill:none, stroke:currentColor (round caps/joins), so a path without
// overrides is a thin outline; use { fill: 'currentColor', stroke: 'none' } for solid shapes.

const VB = '0 0 24 24';
const NS = 'http://www.w3.org/2000/svg';
const r2 = (n) => Math.round(n * 100) / 100;
const SOLID = { fill: 'currentColor', stroke: 'none' };
const SOFT = { fill: 'currentColor', stroke: 'none', opacity: 0.28 };

const ring = (cx, cy, r) => `M${r2(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0z`;
/** n radial line segments between radii r1 and r2 (angle offset rot, radians). */
function spokes(cx, cy, rIn, rOut, n, rot = 0) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n, c = Math.cos(a), s = Math.sin(a);
    d += `M${r2(cx + c * rIn)} ${r2(cy + s * rIn)}L${r2(cx + c * rOut)} ${r2(cy + s * rOut)}`;
  }
  return d;
}
/** Closed cog outline with n teeth. */
function cog(cx, cy, rIn, rOut, n) {
  const pts = [];
  const hw0 = (Math.PI / n) * 0.62, hw1 = (Math.PI / n) * 0.34;
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    for (const [da, r] of [[-hw0, rIn], [-hw1, rOut], [hw1, rOut], [hw0, rIn]]) pts.push([cx + Math.cos(a + da) * r, cy + Math.sin(a + da) * r]);
  }
  return 'M' + pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L') + 'z';
}

// ---------------------------------------------------------------------------------------------
// Weapons (24x24, side/top silhouettes, all distinct at 16px)
// ---------------------------------------------------------------------------------------------
export const WEAPON_ICONS = {
  // Gun body + barrel + magazine + muzzle flash.
  machinegun: { viewBox: VB, paths: [
    { d: 'M2.5 8.5h10.5v4.5H8.5l-.4 1H2.5z' },
    { d: 'M13 10h6' },
    { d: 'M6 13l-.9 6h3.4l.7-6' },
    { d: 'M5 8.5V7h5v1.5' },
    { d: 'M20.5 10l2.2-1.4M20.8 10h2.4M20.5 10l2.2 1.4', opacity: 0.85 },
    { d: 'M13.5 14.5l2.5 0', opacity: 0.55 },
  ] },
  // Rocket with fins and exhaust, pointing right.
  rocket: { viewBox: VB, paths: [
    { d: 'M7.5 9.5h7c2.6 0 4.8 1.1 6.3 2.5-1.5 1.4-3.7 2.5-6.3 2.5h-7z' },
    { d: 'M9.5 9.5L7 5.8H4.8l1.9 3.7M9.5 14.5L7 18.2H4.8l1.9-3.7' },
    { d: ring(14, 12, 1.2), ...SOLID },
    { d: 'M6.5 12H3.2M5.6 10.4L3.2 9.2M5.6 13.6l-2.4 1.2', opacity: 0.8 },
  ] },
  // Four-pointed jack (the real caltrop) over a ground line, with satellites.
  caltrops: { viewBox: VB, paths: [
    { d: 'M12 11.5V3.5M12 11.5L5 16M12 11.5l7 4.5M12 11.5v8.5' },
    { d: ring(12, 3.4, 1), ...SOLID },
    { d: ring(5, 16, 1), ...SOLID },
    { d: ring(19, 16, 1), ...SOLID },
    { d: ring(12, 20, 1), ...SOLID },
    { d: 'M2.5 21.5h19', opacity: 0.4 },
  ] },
  // Homing missile locked on a reticle.
  terminator: { viewBox: VB, paths: [
    { d: 'M3.6 10.8h8.2l3 1.2-3 1.2H3.6z' },
    { d: 'M5.6 10.8L4 8.4M5.6 13.2L4 15.6' },
    { d: ring(17.4, 12, 4.6) },
    { d: 'M17.4 4.8v2M17.4 17.2v2M10.4 12h.8M23.4 12h-.4' , opacity: 0.8 },
    { d: ring(17.4, 12, 1), ...SOLID },
  ] },
  // Sleek missile with a seeker dome inside corner lock brackets.
  guided: { viewBox: VB, paths: [
    { d: 'M5 12h8.4c1.8 0 3.2-.5 4.6-1.4v2.8C16.6 12.5 15.2 12 13.4 12z' },
    { d: 'M7 12l-2.2-2.6M7 12l-2.2 2.6' },
    { d: 'M3 4.5h3.5M3 4.5V8M21 4.5h-3.5M21 4.5V8M3 19.5h3.5M3 19.5V16M21 19.5h-3.5M21 19.5V16', opacity: 0.85 },
    { d: ring(18.2, 12, 1), ...SOLID },
  ] },
  // Spiked disc mine, top view.
  mine: { viewBox: VB, paths: [
    { d: ring(12, 12, 5.2) },
    { d: spokes(12, 12, 6.2, 9.6, 8, Math.PI / 8) },
    { d: ring(12, 12, 2.1), ...SOLID },
    { d: ring(12, 12, 3.6), opacity: 0.45 },
  ] },
  // Oil droplet over a spreading puddle.
  oil: { viewBox: VB, paths: [
    { d: 'M12 2.8c3.2 4 5.2 6.7 5.2 9.4a5.2 5.2 0 0 1-10.4 0c0-2.7 2-5.4 5.2-9.4z' },
    { d: 'M9.4 12.6a2.8 2.8 0 0 0 2 2.8', opacity: 0.85 },
    { d: 'M4.5 20.2c2.5-1.2 12.5-1.2 15 0-2.5 1.2-12.5 1.2-15 0z', ...SOFT },
    { d: 'M4.5 20.2c2.5-1.2 12.5-1.2 15 0-2.5 1.2-12.5 1.2-15 0' },
  ] },
  // Nozzle + tank feeding a cone of fire.
  flamethrower: { viewBox: VB, paths: [
    { d: 'M2.5 9.5h4.6v5H2.5z' },
    { d: 'M7.1 11h2.4v2H7.1z', ...SOLID },
    { d: 'M10.2 12c3-.4 4.8-3 6-5 .9 1.7 1.6 2.2 3 2.6 1.6.5 2.4 1.5 2.4 2.4s-.8 1.9-2.4 2.4c-1.4.4-2.1.9-3 2.6-1.2-2-3-4.6-6-5z' },
    { d: 'M12.4 12c2-.2 3.4-1.4 4.4-2.6.4 1 1 1.4 1.8 1.6.8.2 1.2.6 1.2 1s-.4.8-1.2 1c-.8.2-1.4.6-1.8 1.6-1-1.2-2.4-2.4-4.4-2.6z', ...SOFT },
  ] },
  // Armoured wedge plate with ram spikes.
  ramplate: { viewBox: VB, paths: [
    { d: 'M3 20.5l2.4-8h13.2l2.4 8z' },
    { d: 'M7 12.5L8.6 5l1.6 7.5M13.8 12.5L15.4 5l1.6 7.5' },
    { d: ring(7.2, 17, 0.9), ...SOLID },
    { d: ring(12, 17, 0.9), ...SOLID },
    { d: ring(16.8, 17, 0.9), ...SOLID },
  ] },
};

// ---------------------------------------------------------------------------------------------
// UI glyphs
// ---------------------------------------------------------------------------------------------
export const UI_ICONS = {
  armor: { viewBox: VB, paths: [
    { d: 'M12 2.8l7.4 2.7v5.9c0 4.5-3.1 8-7.4 9.8-4.3-1.8-7.4-5.3-7.4-9.8V5.5z' },
    { d: 'M12 2.8v18.4', opacity: 0.45 },
    { d: 'M12 2.8l7.4 2.7v5.9c0 4.5-3.1 8-7.4 9.8z', ...SOFT },
  ] },
  // Spike glyphs: a row of spikes on a bar (front), angled spikes behind a bar (rear), a spiked hub (wheels).
  spikeFront: { viewBox: VB, paths: [{ d: 'M3 17.5h18v2.6H3z' }, { d: 'M4 17.5L6.2 8l2.2 9.5M9.8 17.5L12 5l2.2 12.5M15.6 17.5L17.8 8l2.2 9.5' }] },
  spikeRear: { viewBox: VB, paths: [{ d: 'M3 4h18v2.6H3z' }, { d: 'M5 6.6L3 16M12 6.6v11.4M19 6.6L21 16' }, { d: 'M6 20h12', opacity: 0.4 }] },
  spikeWheel: { viewBox: VB, paths: [{ d: ring(12, 12, 5.2) }, { d: ring(12, 12, 1.6), ...SOLID }, { d: spokes(12, 12, 6.4, 10.6, 8, 0) }] },
  bolt: { viewBox: VB, paths: [{ d: 'M13.6 2.5L5.4 13.2h5.6l-1 8.3 8.2-10.8h-5.6z' }, { d: 'M13.6 2.5L5.4 13.2h5.6l-1 8.3 8.2-10.8h-5.6z', ...SOFT }] },
  wrench: { viewBox: VB, paths: [
    { d: 'M14.6 6.2a4.2 4.2 0 0 0-5.2 5.4L3.6 17.4a1.9 1.9 0 0 0 2.7 2.7l5.8-5.8a4.2 4.2 0 0 0 5.4-5.2l-2.7 2.7-2.3-.6-.6-2.3z' },
    { d: ring(5.4, 18.6, 0.7), ...SOLID },
  ] },
  cash: { viewBox: VB, paths: [
    { d: 'M2.5 6.5h19v11h-19z' },
    { d: ring(12, 12, 2.8) },
    { d: ring(5.8, 12, 0.7), ...SOLID },
    { d: ring(18.2, 12, 0.7), ...SOLID },
  ] },
  // Co-racer status faces for the standings board: ok, hurt (low armour), burn (on fire), dead (wrecked), fin (finished).
  faceOk: { viewBox: VB, paths: [
    { d: ring(12, 12, 9.5) },
    { d: ring(9, 10.4, 0.9), ...SOLID }, { d: ring(15, 10.4, 0.9), ...SOLID },
    { d: 'M8 14q4 4 8 0' },
  ] },
  faceHurt: { viewBox: VB, paths: [
    { d: ring(12, 12, 9.5) },
    { d: 'M6 8.2l3.6 1.1M18 8.2l-3.6 1.1' },
    { d: ring(9.2, 11.6, 0.9), ...SOLID }, { d: ring(14.8, 11.6, 0.9), ...SOLID },
    { d: 'M8.5 16.6q3.5-2.8 7 0' },
  ] },
  faceBurn: { viewBox: VB, paths: [
    { d: ring(12, 12, 9.5) },
    { d: 'M7.4 10.6q1.4-1.4 2.8 0M13.8 10.6q1.4-1.4 2.8 0' },
    { d: 'M8.2 15.4h7.6M10.6 15.4v1.8M13.4 15.4v1.8' },
    { d: 'M17.2 5.6q1.3 1.8 0 3q-1.3-1.2 0-3z', ...SOLID },
  ] },
  faceDead: { viewBox: VB, paths: [
    { d: ring(12, 12, 9.5) },
    { d: 'M7.6 8.6l3 3M10.6 8.6l-3 3M13.4 8.6l3 3M16.4 8.6l-3 3' },
    { d: 'M8.6 16.2q1.7-1 3.4 0t3.4 0' },
  ] },
  faceFin: { viewBox: VB, paths: [
    { d: ring(12, 12, 9.5) },
    { d: 'M7.4 10.8q1.6-1.8 3.2 0M13.4 10.8q1.6-1.8 3.2 0' },
    { d: 'M7.6 13.4q4.4 5 8.8 0' },
  ] },
  lap: { viewBox: VB, paths: [
    { d: 'M5.5 21.5V3' },
    { d: 'M5.5 4.5h13.2l-2.6 3.6 2.6 3.6H5.5' },
    { d: 'M9.4 4.5v7.2M13.2 4.5v7.2', opacity: 0.5 },
    { d: 'M5.5 4.5h3.9v3.6H5.5zM13.2 8.1h3.4v3.6h-3.4zM9.4 8.1h3.8v3.6H9.4z', ...SOFT },
  ] },
  skull: { viewBox: VB, paths: [
    { d: 'M12 3a8 8 0 0 0-5.4 13.9V20h3v-1.7h1.2V20h2.4v-1.7h1.2V20h3v-3.1A8 8 0 0 0 12 3z' },
    { d: ring(9, 11.2, 1.7), ...SOLID },
    { d: ring(15, 11.2, 1.7), ...SOLID },
    { d: 'M12 13.4l-.9 2h1.8z', ...SOLID },
  ] },
  target: { viewBox: VB, paths: [
    { d: ring(12, 12, 8.5) },
    { d: ring(12, 12, 4.6) },
    { d: ring(12, 12, 1.2), ...SOLID },
    { d: 'M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3' },
  ] },
  camera: { viewBox: VB, paths: [
    { d: 'M3 7.5h4l1.5-2.5h7L17 7.5h4v12H3z' },
    { d: ring(12, 13.2, 3.5) },
    { d: ring(18, 10.2, 0.6), ...SOLID },
  ] },
  volume: { viewBox: VB, paths: [
    { d: 'M3.5 9.6h3.6l4.6-4v12.8l-4.6-4H3.5z' },
    { d: 'M15.4 9a4.4 4.4 0 0 1 0 6M18.2 6.4a8.4 8.4 0 0 1 0 11.2' },
  ] },
  mute: { viewBox: VB, paths: [
    { d: 'M3.5 9.6h3.6l4.6-4v12.8l-4.6-4H3.5z' },
    { d: 'M16 9.4l5 5.2M21 9.4l-5 5.2' },
  ] },
  gear: { viewBox: VB, paths: [{ d: cog(12, 12, 7.2, 9.6, 8) }, { d: ring(12, 12, 2.8) }] },
  lock: { viewBox: VB, paths: [
    { d: 'M5.5 10.5h13v10h-13z' },
    { d: 'M8.2 10.5V7.6a3.8 3.8 0 0 1 7.6 0v2.9' },
    { d: ring(12, 14.8, 1.2), ...SOLID },
    { d: 'M12 15.2v2.2' },
  ] },
  trophy: { viewBox: VB, paths: [
    { d: 'M7 3.5h10v5.2a5 5 0 0 1-10 0z' },
    { d: 'M7 5.4H4v1.6a3.2 3.2 0 0 0 3.2 3.2M17 5.4h3v1.6a3.2 3.2 0 0 1-3.2 3.2' },
    { d: 'M12 13.7v3.6M9 20.5h6M10 17.3h4v3.2h-4' },
  ] },
  play: { viewBox: VB, paths: [{ d: 'M7.5 4.8l11 7.2-11 7.2z' }, { d: 'M7.5 4.8l11 7.2-11 7.2z', ...SOFT }] },
  pause: { viewBox: VB, paths: [{ d: 'M7 5h3.2v14H7zM13.8 5H17v14h-3.2z' }] },
  back: { viewBox: VB, paths: [{ d: 'M19 12H5.5M11 6l-6 6 6 6' }] },
  forward: { viewBox: VB, paths: [{ d: 'M5 12h13.5M13 6l6 6-6 6' }] },
  close: { viewBox: VB, paths: [{ d: 'M6 6l12 12M18 6L6 18' }] },
  check: { viewBox: VB, paths: [{ d: 'M4.5 12.5l5 5 10-11' }] },
  star: { viewBox: VB, paths: [{ d: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z' }] },
  // Side-view hot-rod coupe.
  car: { viewBox: VB, paths: [
    { d: 'M2.6 16.2v-3l2.4-.8 2.6-3.7h7.6l3.2 3.7 2.4.8v3z' },
    { d: 'M8.4 8.7l-1.6 3.7h10.6l-2.6-3.7', opacity: 0.55 },
    { d: ring(7, 16.6, 2) },
    { d: ring(17, 16.6, 2) },
  ] },
  // Garage: roofed building with a roll-up door.
  garage: { viewBox: VB, paths: [
    { d: 'M2.8 10.4L12 3.6l9.2 6.8V20.5H2.8z' },
    { d: 'M6.6 20.5v-7.6h10.8v7.6' },
    { d: 'M6.6 15.4h10.8M6.6 18h10.8', opacity: 0.55 },
  ] },
};

const ALL_ICONS = { ...UI_ICONS, ...WEAPON_ICONS };
export const ICON_NAMES = Object.keys(UI_ICONS);
export const WEAPON_IDS = Object.keys(WEAPON_ICONS);

/** Pure: icon data for a UI glyph name or a weapon id (null if unknown). */
export function iconData(name) { return ALL_ICONS[name] || null; }

const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

function applyAttrs(el, obj) {
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) el.setAttribute(kebab(k), String(v));
}
function makeSvg(viewBox, size, cls, label) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  if (size) { svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); }
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', ('lt-icon ' + cls).trim());
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  return svg;
}
function appendPaths(svg, paths) {
  for (const p of paths) {
    const el = document.createElementNS(NS, 'path');
    applyAttrs(el, p);
    svg.appendChild(el);
  }
  return svg;
}

/** Weapon icon as an <svg>. Unknown ids get the generic target glyph. */
export function weaponIcon(id, { size = 24, cls = '', title = '' } = {}) {
  const def = WEAPON_ICONS[id] || UI_ICONS.target;
  return appendPaths(makeSvg(def.viewBox, size, ('lt-weapon-icon ' + cls).trim(), title), def.paths);
}

/** UI glyph (or weapon id) as an <svg>. Unknown names yield an empty icon. */
export function icon(name, { size = 24, cls = '', title = '' } = {}) {
  const def = iconData(name);
  return appendPaths(makeSvg(def ? def.viewBox : VB, size, cls, title), def ? def.paths : []);
}

// ---------------------------------------------------------------------------------------------
// Damage colours + top-down car silhouettes
// ---------------------------------------------------------------------------------------------
export const DAMAGE_STOPS = [[0.15, [0x5d, 0xff, 0x9d]], [0.55, [0xff, 0xb0, 0x2e]], [0.95, [0xff, 0x44, 0x66]]];
const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');
/** Pure: damage fraction 0..1 -> '#rrggbb' (lime -> amber -> red). Non-finite = undamaged. */
export function damageColor(d) {
  const v = Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0;
  const S = DAMAGE_STOPS;
  let c;
  if (v <= S[0][0]) c = S[0][1];
  else if (v >= S[2][0]) c = S[2][1];
  else {
    const [a, b] = v < S[1][0] ? [S[0], S[1]] : [S[1], S[2]];
    const t = (v - a[0]) / (b[0] - a[0]);
    c = a[1].map((x, i) => x + (b[1][i] - x) * t);
  }
  return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
}
/** Pure: [front,right,rear,left] 0..1 -> 4 hex colours. */
export function zoneColors(dmg) {
  return [0, 1, 2, 3].map((i) => damageColor(dmg ? dmg[i] : 0));
}
export const ZONE_NAMES = ['front', 'right', 'rear', 'left'];

function buildCar({ a, nf, nr, L, sf, sr, wheel = [5, 13], extras = [] }) {
  const cx = 30, cy = 50, y0 = cy - L, y1 = cy + L, H = 2 * L;
  const yf = r2(y0 + H * 0.3), yr = r2(y1 - H * 0.28), ia = r2(a * 0.5);
  const poly = (pts) => 'M' + pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L') + 'z';
  const outline = poly([[cx - nf, y0], [cx + nf, y0], [cx + a, y0 + sf], [cx + a, y1 - sr], [cx + nr, y1], [cx - nr, y1], [cx - a, y1 - sr], [cx - a, y0 + sf]]);
  const zones = {
    front: poly([[cx - nf, y0], [cx + nf, y0], [cx + a, y0 + sf], [cx + a, yf], [cx - a, yf], [cx - a, y0 + sf]]),
    right: poly([[cx + ia, yf], [cx + a, yf], [cx + a, yr], [cx + ia, yr]]),
    rear: poly([[cx - a, yr], [cx + a, yr], [cx + a, y1 - sr], [cx + nr, y1], [cx - nr, y1], [cx - a, y1 - sr]]),
    left: poly([[cx - a, yf], [cx - ia, yf], [cx - ia, yr], [cx - a, yr]]),
  };
  const [ww, wh] = wheel;
  const ay = [y0 + H * 0.2, y1 - H * 0.2 - wh];
  const wheels = [];
  for (const y of ay) for (const x of [cx - a - ww * 0.55, cx + a - ww * 0.45]) wheels.push(`M${r2(x)} ${r2(y)}h${ww}v${wh}h${-ww}z`);
  const gy0 = yf + (yr - yf) * 0.12, gy1 = yr - (yr - yf) * 0.12;
  const glass = poly([[cx - ia * 0.62, gy0], [cx + ia * 0.62, gy0], [cx + ia * 0.82, gy1], [cx - ia * 0.82, gy1]]);
  const chassis = poly([[cx - ia, yf], [cx + ia, yf], [cx + ia, yr], [cx - ia, yr]]);
  return { viewBox: '0 0 60 100', outline, chassis, zones, glass, wheels, extras };
}

export const CAR_SILHOUETTES = {
  // Light wedge: pointed nose, narrow body, rear wing.
  wasp: buildCar({ a: 10.5, nf: 4.5, nr: 8, L: 42, sf: 15, sr: 7, wheel: [4.6, 12], extras: ['M18 93.5h24', 'M20 90v3.5M40 90v3.5'] }),
  // Muscle car: wide shoulders, roof-mounted gun.
  hammer: buildCar({ a: 13.5, nf: 10, nr: 11.5, L: 42, sf: 7, sr: 5, wheel: [5.4, 14], extras: ['M27.5 46h5v10h-5z', 'M30 46v-7'] }),
  // Armoured brick: boxy outline, bull bar and side skirts.
  bulwark: buildCar({ a: 15, nf: 13, nr: 13.5, L: 40, sf: 3.5, sr: 3, wheel: [5.6, 15], extras: ['M15.5 7.5h29', 'M17 7.5v3.5M43 7.5v3.5'] }),
};

/** Pure: silhouette data for a car id (falls back to hammer). */
export function carSilhouetteData(carId) { return CAR_SILHOUETTES[carId] || CAR_SILHOUETTES.hammer; }

/**
 * Top-down car outline (nose up) as an <svg> with four damage zones: <path data-zone="front|right|rear|left">.
 * Colour them with setDamageZones(svg, [front,right,rear,left]). Zones fill via inline style (default undamaged lime).
 */
export function carSilhouette(carId, { cls = '', size = 0 } = {}) {
  const def = carSilhouetteData(carId);
  const svg = makeSvg(def.viewBox, 0, ('lt-car ' + cls).trim(), '');
  svg.setAttribute('stroke-width', '1.1');
  if (size) { svg.setAttribute('height', String(size)); svg.setAttribute('width', String(Math.round(size * 0.6))); }
  const add = (d, attrs) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); applyAttrs(p, attrs); svg.appendChild(p); return p; };
  for (const d of def.wheels) add(d, { class: 'lt-car-wheel', fill: 'currentColor', stroke: 'none', opacity: 0.5 });
  add(def.chassis, { class: 'lt-car-chassis', fill: 'currentColor', stroke: 'none', opacity: 0.22 });
  for (const z of ZONE_NAMES) {
    const p = add(def.zones[z], { class: 'lt-car-zone', 'data-zone': z, 'fill-opacity': 0.82, stroke: 'currentColor', 'stroke-opacity': 0.5 });
    p.style.fill = damageColor(0);
  }
  add(def.outline, { class: 'lt-car-outline', fill: 'none' });
  add(def.glass, { class: 'lt-car-glass', fill: 'currentColor', stroke: 'none', opacity: 0.35 });
  for (const d of def.extras) add(d, { class: 'lt-car-extra', fill: 'none' });
  return svg;
}

/**
 * Colour a carSilhouette's zones from [front,right,rear,left] damage 0..1 (undefined = all healthy).
 * Cheap to call every frame: only touches zones whose colour changed.
 */
export function setDamageZones(svgEl, dmg, { wrecked = false } = {}) {
  if (!svgEl) return;
  if (!svgEl._dz) {
    svgEl._dz = ZONE_NAMES.map((z) => svgEl.querySelector(`[data-zone="${z}"]`));
    svgEl._dzc = [null, null, null, null];
  }
  const cols = wrecked ? ZONE_NAMES.map(() => '#5a2a3a') : zoneColors(dmg);
  for (let i = 0; i < 4; i++) {
    if (svgEl._dzc[i] === cols[i]) continue;
    svgEl._dzc[i] = cols[i];
    const p = svgEl._dz[i];
    if (p) p.style.fill = cols[i];
    svgEl.style.setProperty('--dz-' + ZONE_NAMES[i], cols[i]);
  }
}
