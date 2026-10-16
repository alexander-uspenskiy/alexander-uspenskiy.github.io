// Pure (Node-testable) helpers for the menu UI: spatial focus navigation, track outlines, difficulty, rings, podium, counters.

/** Spatial focus: items = [{x,y,w,h}] (viewport rects); returns the index of the best neighbour of `cur` in `dir` ('up'|'down'|'left'|'right'), or cur. */
export function nextFocus(items, cur, dir) {
  if (!items.length) return -1;
  if (cur < 0 || cur >= items.length) return 0;
  const a = items[cur], ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  let best = -1, bestScore = Infinity;
  items.forEach((b, i) => {
    if (i === cur) return;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const dx = bx - ax, dy = by - ay;
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (along <= 1) return;                       // must lie in that direction
    if (across > along * 2.2 + 40) return;        // and not be mostly sideways
    const score = along + across * 2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best < 0 ? cur : best;
}

/** Closed Catmull-Rom through control points -> SVG path `d` fitted into w x h with padding. Returns { d, start:[x,y], w, h }. */
export function trackOutlinePath(control, { w = 200, h = 120, pad = 10 } = {}) {
  const pts = (control || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 3) return { d: '', start: [w / 2, h / 2], w, h };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const sx = (w - pad * 2) / Math.max(1e-6, maxX - minX), sy = (h - pad * 2) / Math.max(1e-6, maxY - minY);
  const s = Math.min(sx, sy);
  const ox = (w - (maxX - minX) * s) / 2, oy = (h - (maxY - minY) * s) / 2;
  const P = pts.map(([x, y]) => [ox + (x - minX) * s, oy + (y - minY) * s]);
  const n = P.length, f = (v) => Math.round(v * 10) / 10;
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return { d: d + 'Z', start: [f(P[0][0]), f(P[0][1])], w, h };
}

/** Track index -> difficulty 1..5 (ten tracks, two per star). */
export function difficultyOf(index, count = 10) { return Math.max(1, Math.min(5, 1 + Math.floor((index / Math.max(1, count)) * 5))); }
export const DIFFICULTY_LABELS = ['', 'ROOKIE', 'STREET', 'PRO', 'ELITE', 'LEGEND'];
export const difficultyLabel = (d) => DIFFICULTY_LABELS[Math.max(1, Math.min(5, d | 0))];

/** Progress ring: circumference + dash offset for level/max. */
export function ringGeometry(level, max, r = 21) {
  const c = 2 * Math.PI * r, f = max > 0 ? Math.max(0, Math.min(1, level / max)) : 0;
  return { r, c, offset: c * (1 - f), frac: f };
}

/** Finish order -> podium columns [2nd, 1st, 3rd] (missing places dropped). */
export function podiumOrder(finishOrder) {
  const by = [...(finishOrder || [])].sort((a, b) => a.position - b.position).slice(0, 3);
  return [by[1], by[0], by[2]].filter(Boolean);
}

export const easeOutCubic = (t) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
/** Counter value at normalised time t (0..1). */
export const countValue = (from, to, t) => Math.round(from + (to - from) * easeOutCubic(t));

/** Weapon-bar friendly percent clamp. */
export const pct = (v, max) => Math.max(0, Math.min(100, max > 0 ? (v / max) * 100 : 0));

/** Skill/aggression 0..1 -> bar percent. */
export const rating = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
