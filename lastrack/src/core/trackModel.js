// TrackModel: closed centripetal Catmull-Rom centreline resampled uniformly by arc length.
// Pure (no three, no DOM). Sim (x, y) == world (x, 0, z). Heading θ: forward = (cos θ, sin θ); +d = right of travel.
import { wrapAngle } from './mathUtil.js';

const ALPHA = 0.5;

function crSegment(p0, p1, p2, p3, count, out) {
  const d01 = Math.max(Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ALPHA), 1e-6);
  const d12 = Math.max(Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), ALPHA), 1e-6);
  const d23 = Math.max(Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), ALPHA), 1e-6);
  const t0 = 0;
  const t1 = t0 + d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;
  for (let k = 0; k < count; k++) {
    const t = t1 + ((t2 - t1) * k) / count;
    const a1x = ((t1 - t) * p0[0] + (t - t0) * p1[0]) / (t1 - t0);
    const a1y = ((t1 - t) * p0[1] + (t - t0) * p1[1]) / (t1 - t0);
    const a2x = ((t2 - t) * p1[0] + (t - t1) * p2[0]) / (t2 - t1);
    const a2y = ((t2 - t) * p1[1] + (t - t1) * p2[1]) / (t2 - t1);
    const a3x = ((t3 - t) * p2[0] + (t - t2) * p3[0]) / (t3 - t2);
    const a3y = ((t3 - t) * p2[1] + (t - t2) * p3[1]) / (t3 - t2);
    const b1x = ((t2 - t) * a1x + (t - t0) * a2x) / (t2 - t0);
    const b1y = ((t2 - t) * a1y + (t - t0) * a2y) / (t2 - t0);
    const b2x = ((t3 - t) * a2x + (t - t1) * a3x) / (t3 - t1);
    const b2y = ((t3 - t) * a2y + (t - t1) * a3y) / (t3 - t1);
    out.push(((t2 - t) * b1x + (t - t1) * b2x) / (t2 - t1), ((t2 - t) * b1y + (t - t1) * b2y) / (t2 - t1));
  }
}

/** Dense closed Catmull-Rom polyline (flat [x,y,...], not repeating the first point). */
export function denseCentreline(control, minPerSeg = 32) {
  const n = control.length;
  if (n < 4) throw new Error('trackModel: need at least 4 control points');
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = control[(i - 1 + n) % n];
    const p1 = control[i];
    const p2 = control[(i + 1) % n];
    const p3 = control[(i + 2) % n];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    crSegment(p0, p1, p2, p3, Math.max(minPerSeg, Math.ceil(segLen / 0.75)), out);
  }
  return out;
}

export function buildTrack(def, ds = 2) {
  const dense = denseCentreline(def.control);
  const M = dense.length / 2;
  const cum = new Float64Array(M + 1);
  for (let i = 0; i < M; i++) {
    const j = (i + 1) % M;
    cum[i + 1] = cum[i] + Math.hypot(dense[2 * j] - dense[2 * i], dense[2 * j + 1] - dense[2 * i + 1]);
  }
  const rawLength = cum[M];
  const n = Math.max(8, Math.round(rawLength / ds));
  const step = rawLength / n; // actual spacing (so the loop closes exactly)
  const length = rawLength;
  const width = def.width ?? 16;
  const half = width / 2;

  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    while (seg < M - 1 && cum[seg + 1] <= s) seg++;
    const j = (seg + 1) % M;
    const sl = cum[seg + 1] - cum[seg];
    const f = sl > 0 ? (s - cum[seg]) / sl : 0;
    X[i] = dense[2 * seg] + (dense[2 * j] - dense[2 * seg]) * f;
    Y[i] = dense[2 * seg + 1] + (dense[2 * j + 1] - dense[2 * seg + 1]) * f;
  }
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  const H = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const dx = X[b] - X[a];
    const dy = Y[b] - Y[a];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
    H[i] = Math.atan2(ty[i], tx[i]);
  }
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = wrapAngle(H[(i + 1) % n] - H[(i - 1 + n) % n]) / (2 * step);
  const K = new Float64Array(n);
  for (let i = 0; i < n; i++) K[i] = (raw[(i - 1 + n) % n] + raw[i] + raw[(i + 1) % n]) / 3;

  const samples = [];
  for (let i = 0; i < n; i++) samples.push({ x: X[i], y: Y[i], heading: H[i], curv: K[i], s: i * step, width });

  const wrapS = (s) => {
    const r = s % length;
    return r < 0 ? r + length : r;
  };
  function frame(s) {
    s = wrapS(s);
    const f0 = s / step;
    let i = Math.floor(f0);
    if (i >= n) i = n - 1;
    const f = f0 - i;
    const j = (i + 1) % n;
    let ax = tx[i] + (tx[j] - tx[i]) * f;
    let ay = ty[i] + (ty[j] - ty[i]) * f;
    const l = Math.hypot(ax, ay) || 1;
    ax /= l;
    ay /= l;
    return {
      x: X[i] + (X[j] - X[i]) * f,
      y: Y[i] + (Y[j] - Y[i]) * f,
      tx: ax, ty: ay, nx: -ay, ny: ax,
      heading: Math.atan2(ay, ax),
      curv: K[i] + (K[j] - K[i]) * f,
      width,
      s,
    };
  }
  function pointAt(s) {
    const p = frame(s);
    return { x: p.x, y: p.y, heading: p.heading, curv: p.curv, width };
  }

  function nearestInRange(px, py, from, count) {
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < count; k++) {
      const i = (((from + k) % n) + n) % n;
      const d2 = (px - X[i]) ** 2 + (py - Y[i]) ** 2;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  }
  function refine(px, py, k) {
    let bestS = k * step;
    let bd = Infinity;
    for (let side = -1; side <= 0; side++) {
      const a = (((k + side) % n) + n) % n;
      const b = (a + 1) % n;
      const sx = X[b] - X[a];
      const sy = Y[b] - Y[a];
      const l2 = sx * sx + sy * sy || 1;
      const t = Math.min(1, Math.max(0, ((px - X[a]) * sx + (py - Y[a]) * sy) / l2));
      const d2 = (X[a] + sx * t - px) ** 2 + (Y[a] + sy * t - py) ** 2;
      if (d2 < bd) { bd = d2; bestS = (k + side + t) * step; }
    }
    return wrapS(bestS);
  }
  function polish(px, py, s) {
    for (let it = 0; it < 3; it++) {
      const f = frame(s);
      const e = (px - f.x) * f.tx + (py - f.y) * f.ty;
      const d = (px - f.x) * f.nx + (py - f.y) * f.ny;
      const denom = 1 - d * f.curv;
      if (denom < 0.2) break;
      const st = Math.max(-step, Math.min(step, e / denom));
      s = wrapS(s + st);
      if (Math.abs(st) < 1e-7) break;
    }
    return s;
  }
  function project(px, py, hintIndex) {
    const hinted = Number.isFinite(hintIndex);
    const find = (hint) => {
      const k = hint ? nearestInRange(px, py, Math.floor(hintIndex) - 60, 121) : nearestInRange(px, py, 0, n);
      const s = polish(px, py, refine(px, py, k));
      const f = frame(s);
      return { s, f, d: (px - f.x) * f.nx + (py - f.y) * f.ny };
    };
    let r = find(hinted);
    if (hinted && Math.abs(r.d) > width * 2) r = find(false);
    return {
      i: Math.floor(r.s / step) % n,
      s: r.s,
      d: r.d,
      heading: r.f.heading,
      onRoad: Math.abs(r.d) <= half,
    };
  }

  const edge = (i, sgn) => {
    i = ((i % n) + n) % n;
    const sm = samples[i];
    const f = frame(sm.s);
    return { x: f.x + sgn * half * f.nx, y: f.y + sgn * half * f.ny };
  };
  const leftEdge = (i) => edge(i, -1);
  const rightEdge = (i) => edge(i, 1);

  function startGrid(nCars) {
    const out = [];
    for (let k = 0; k < nCars; k++) {
      const row = Math.floor(k / 2);
      const col = k % 2;
      const s = -(5 + row * 8 + col * 4);
      const f = frame(s);
      const d = col === 0 ? -3.5 : 3.5;
      out.push({ x: f.x + d * f.nx, y: f.y + d * f.ny, heading: f.heading });
    }
    return out;
  }

  const pickups = (def.pickups || []).map((p, idx) => {
    const s = wrapS(p.s * length);
    const f = frame(s);
    return { id: idx, type: p.type, s, x: f.x, y: f.y };
  });

  return { id: def.id, length, ds: step, n, closed: true, width, def, samples, pointAt, project, leftEdge, rightEdge, startGrid, pickups, wrapS };
}

function segIntersect(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Geometry report used by tests and tools/plotTracks.mjs. */
export function analyzeTrack(track) {
  const { samples: sm, n, length, ds } = track;
  let maxK = 0;
  for (const p of sm) maxK = Math.max(maxK, Math.abs(p.curv));
  let minSep = Infinity;
  let crossings = 0;
  const skip = Math.ceil(80 / ds);
  for (let i = 0; i < n; i++) {
    for (let j = i + skip; j < n; j++) {
      if (n - (j - i) < skip) continue;
      const d = Math.hypot(sm[i].x - sm[j].x, sm[i].y - sm[j].y);
      if (d < minSep) minSep = d;
      if (j > i + 1 && (j + 1) % n !== i && segIntersect(sm[i], sm[(i + 1) % n], sm[j], sm[(j + 1) % n])) crossings++;
    }
  }
  const closeGap = Math.hypot(sm[0].x - sm[n - 1].x, sm[0].y - sm[n - 1].y);
  return { length, minRadius: maxK > 0 ? 1 / maxK : Infinity, minSeparation: minSep, crossings, closeGap, spacing: ds };
}
