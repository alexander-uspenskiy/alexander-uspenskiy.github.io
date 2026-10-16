// 2D-canvas minimap: track outline + car dots. Pure transform maths exported for tests.
import { MODERN_HEX, mixHex } from './paletteRef.js';

export function computeMapTransform(bbox, w, h = w, pad = 10) {
  const bw = Math.max(1, bbox.maxX - bbox.minX), bh = Math.max(1, bbox.maxY - bbox.minY);
  const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  return { scale, ox: (w - bw * scale) / 2 - bbox.minX * scale, oy: (h - bh * scale) / 2 - bbox.minY * scale };
}
export function trackBBox(track, stride = 4) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < track.n; i += stride) { const s = track.samples[i]; if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x; if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y; }
  return { minX, maxX, minY, maxY };
}

/** createMinimap(canvas, track) -> { draw(snapshot), resize() } */
export function createMinimap(canvas, track) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  const bbox = trackBBox(track);
  const stride = Math.max(1, Math.round(8 / (track.ds || 2)));
  const pts = [];
  for (let i = 0; i < track.n; i += stride) pts.push(track.samples[i]);
  let tf = null, tfW = 0, tfH = 0;
  function draw(snap) {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    if (!tf || tfW !== w || tfH !== h) { tf = computeMapTransform(bbox, w, h, Math.max(6, w * 0.06)); tfW = w; tfH = h; }
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const path = () => { ctx.beginPath(); pts.forEach((p, i) => { const x = p.x * tf.scale + tf.ox, y = p.y * tf.scale + tf.oy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
    ctx.strokeStyle = MODERN_HEX[0]; ctx.lineWidth = Math.max(4, w * 0.06); path(); ctx.stroke();
    ctx.strokeStyle = mixHex(MODERN_HEX[6], MODERN_HEX[7], 0.6); ctx.lineWidth = Math.max(3, w * 0.045); path(); ctx.stroke();
    const s0 = pts[0]; // start marker
    ctx.fillStyle = MODERN_HEX[7]; ctx.fillRect(s0.x * tf.scale + tf.ox - 3, s0.y * tf.scale + tf.oy - 3, 6, 6);
    if (!snap) return;
    for (const p of snap.pickups || []) if (p.active) { ctx.fillStyle = p.type === 'repair' ? MODERN_HEX[11] : p.type === 'cash' ? MODERN_HEX[12] : MODERN_HEX[10]; ctx.fillRect(p.x * tf.scale + tf.ox - 1.5, p.y * tf.scale + tf.oy - 1.5, 3, 3); }
    const order = snap.cars.slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const c of order) {
      const x = c.x * tf.scale + tf.ox, y = c.y * tf.scale + tf.oy, r = c.isPlayer ? 6 : 3.5;
      if (c.wrecked) { ctx.strokeStyle = MODERN_HEX[8]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke(); continue; }
      // player: gold fill, heavier outline and a soft glow so it reads over the pale trace
      if (c.isPlayer) { ctx.shadowColor = MODERN_HEX[10]; ctx.shadowBlur = 8; }
      ctx.fillStyle = c.isPlayer ? MODERN_HEX[10] : c.livery ? '#' + (c.livery.paintHex >>> 0).toString(16).padStart(6, '0') : MODERN_HEX[(c.color ?? 8) % 16]; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.strokeStyle = MODERN_HEX[0]; ctx.lineWidth = c.isPlayer ? 2 : 1; ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      ctx.shadowBlur = 0;
    }
  }
  return { draw, bbox };
}
