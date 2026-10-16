// Precomputed racing line: lateral offset per sample (cached per track) and target-speed profile (per car stats).
import { TUNING, gripAccel } from '../carPhysics.js';

const lineCache = new Map();
const EDGE_MARGIN = 3.6;     // m kept between the line and each wall

/** Offset (+ = right of centreline) and signed line curvature per sample. Cached by track id. */
export function getRacingLine(track) {
  const key = track.id + ':' + track.n + ':' + track.length.toFixed(2);
  let line = lineCache.get(key);
  if (line) return line;
  const n = track.n, ds = track.ds;
  const curv = new Float64Array(n);
  for (let i = 0; i < n; i++) curv[i] = track.samples[i].curv;
  const R = Math.max(1, Math.round(35 / ds));
  const smooth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (let k = -R; k <= R; k++) a += curv[(i + k + n) % n];
    smooth[i] = a / (2 * R + 1);
  }
  const maxOff = Math.max(0, track.width / 2 - EDGE_MARGIN);
  const offset = new Float64Array(n);
  for (let i = 0; i < n; i++) offset[i] = Math.max(-maxOff, Math.min(maxOff, smooth[i] * 260));
  // curvature of the offset line (first-order)
  const lineK = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const den = Math.max(0.3, 1 - curv[i] * offset[i]);
    lineK[i] = curv[i] / den;
  }
  line = { offset, curv: lineK, n, ds, length: track.length };
  lineCache.set(key, line);
  return line;
}

/** Target speed per sample (m/s) for a car with `stats`; braking-limited backwards pass over two laps. */
export function buildSpeedProfile(track, stats, pace = 1) {
  const line = getRacingLine(track);
  const n = line.n, ds = line.ds;
  const aLat = gripAccel(stats) * 0.88;
  const aBrake = Math.min(stats.brake ?? 40, gripAccel(stats) * 1.0) * 0.6;
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(line.curv[i]);
    v[i] = Math.min(stats.maxSpeed * pace, k > 1e-5 ? Math.sqrt(aLat / k) : Infinity);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const nx = v[(i + 1) % n];
      const lim = Math.sqrt(nx * nx + 2 * aBrake * ds);
      if (lim < v[i]) v[i] = lim;
    }
  }
  return v;
}

/** Ideal (standing-start-free) lap time from the speed profile, seconds. Used by tests as a reference. */
export function idealLapTime(track, stats) {
  const v = buildSpeedProfile(track, stats);
  let t = 0;
  for (let i = 0; i < v.length; i++) t += track.ds / Math.max(5, v[i]);
  return t;
}

export { TUNING };
