// Impact feel: pure mapping from sim events to screen shake / hit-stop / slow-mo, plus the time scaler that applies them.
// Real-time only (never feeds the sim): game.js multiplies the sim's frame time by TimeScaler.scale.
const HEAVY = new Set(['rocket', 'terminator', 'mine']);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/**
 * Pure: how one sim event feels to the camera car `me` ({id,x,y}). Returns into `out` (reused): shake 0..1.5 added,
 * hitStop seconds of near-freeze, slow = {scale, dur} (real seconds) or dur 0.
 */
export function eventImpact(ev, me, out = { shake: 0, hitStop: 0, slowScale: 1, slowDur: 0 }) {
  out.shake = 0; out.hitStop = 0; out.slowScale = 1; out.slowDur = 0;
  if (!me) return out;
  switch (ev.type) {
    case 'explosion': {
      const d = Math.hypot(ev.x - me.x, ev.y - me.y), r = ev.radius || 6;
      if (ev.kind === 'wreck') {
        if (ev.carId === me.id) { out.shake = 1.3; out.hitStop = 0.09; out.slowScale = 0.28; out.slowDur = 1.5; }
        else {
          const k = clamp(1 - d / 70, 0, 1);
          out.shake = k * 0.9;
          if (d < 28) { out.hitStop = 0.04; out.slowScale = 0.55; out.slowDur = 0.4 * (1 - d / 28) + 0.1; }
        }
      } else {
        const k = clamp(1 - d / (28 + r * 3), 0, 1);
        out.shake = k * (0.35 + r * 0.07);
        if (d < r + 4 && r >= 5) { out.hitStop = 0.03; }
      }
      break;
    }
    case 'hit': {
      if (ev.carId === me.id && HEAVY.has(ev.weaponId)) { out.shake = 0.7; out.hitStop = 0.06; out.slowScale = 0.5; out.slowDur = 0.28; }
      else if (ev.carId === me.id && ev.weaponId !== 'machinegun' && ev.weaponId !== 'flamethrower') out.shake = 0.15;
      break;
    }
    case 'bump':
      if (ev.carId === me.id) { out.shake = Math.min(0.9, (ev.strength || 1) * 0.07); if ((ev.strength || 0) > 16) out.hitStop = 0.035; }
      break;
    case 'partLost':
      if (!ev.wreck) { const d = Math.hypot(ev.x - me.x, ev.y - me.y); if (d < 30) out.shake = 0.28 * (1 - d / 30) + (ev.carId === me.id ? 0.2 : 0); }
      break;
    case 'scrape':
      if (ev.carId === me.id) out.shake = 0.035;
      break;
    default: break;
  }
  return out;
}

/** Real-time hit-stop + slow-motion envelope. update(dt) -> the multiplier to apply to the sim's frame time (0.05..1). */
export class TimeScaler {
  constructor() { this.hitT = 0; this.slowT = 0; this.slowDur = 0; this.slowScale = 1; this.scale = 1; }
  trigger(hitStop, slowScale = 1, slowDur = 0) {
    if (hitStop > this.hitT) this.hitT = Math.min(0.15, hitStop);
    if (slowDur > 0 && (this.slowT <= 0 || slowScale <= this.slowScale || slowDur > this.slowT)) {
      this.slowScale = this.slowT > 0 ? Math.min(this.slowScale, slowScale) : slowScale;
      this.slowT = Math.max(this.slowT, slowDur); this.slowDur = Math.max(this.slowDur, this.slowT);
    }
  }
  update(dt) {
    let s = 1;
    if (this.hitT > 0) { this.hitT = Math.max(0, this.hitT - dt); s = 0.05; }
    else if (this.slowT > 0) {
      this.slowT = Math.max(0, this.slowT - dt);
      // hold the slow scale, then ease back to real time over the last 40 % of the duration
      const k = clamp(this.slowT / (this.slowDur * 0.4), 0, 1);
      s = this.slowScale + (1 - this.slowScale) * (1 - k * k * (3 - 2 * k));
      if (this.slowT <= 0) { this.slowDur = 0; this.slowScale = 1; }
    }
    return (this.scale = s);
  }
  reset() { this.hitT = this.slowT = this.slowDur = 0; this.slowScale = 1; this.scale = 1; }
}
