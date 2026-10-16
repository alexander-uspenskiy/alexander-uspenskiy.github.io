// Lock-on for guided missiles (pure + deterministic). A car with a guided weapon selected scans its aiming cone;
// the best target accumulates lock progress and becomes `locked` after def.lockTime seconds in the cone.
import { wrapAngle } from '../core/mathUtil.js';

/** Pure: best enemy inside the cone (smallest angular error, distance as a tie-break). Returns { car, d, err } or null. */
export function findLockTarget(car, cars, cone, range) {
  let best = null, bs = Infinity;
  for (const o of cars) {
    if (o === car || o.wrecked) continue;
    const dx = o.x - car.x, dy = o.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d > range || d < 4) continue;
    const err = Math.abs(wrapAngle(Math.atan2(dy, dx) - car.heading));
    if (err > cone) continue;
    const score = err / cone + d / (range * 4);
    if (score < bs) { bs = score; best = { car: o, d, err }; }
  }
  return best;
}

export function newLock() { return { target: null, t: 0, locked: false }; }

/** Advance a car's lock state. Keeps the lock while the target stays in a slightly wider cone; drops it quickly otherwise. */
export function updateLock(car, cars, def, dt) {
  const lk = car.lock || (car.lock = newLock());
  if (!def || !def.guided || car.wrecked) { lk.target = null; lk.t = 0; lk.locked = false; return lk; }
  const cone = def.lockCone, range = def.lockRange;
  if (lk.target && !lk.target.wrecked) {
    const dx = lk.target.x - car.x, dy = lk.target.y - car.y;
    const err = Math.abs(wrapAngle(Math.atan2(dy, dx) - car.heading));
    if (err <= cone * 1.35 && Math.hypot(dx, dy) <= range * 1.1) {
      lk.t = Math.min(def.lockTime, lk.t + dt);
      lk.locked = lk.t >= def.lockTime;
      return lk;
    }
  }
  const f = findLockTarget(car, cars, cone, range);
  if (f) { lk.target = f.car; lk.t = Math.min(def.lockTime, dt); lk.locked = lk.t >= def.lockTime; }
  else { lk.target = null; lk.t = 0; lk.locked = false; }
  return lk;
}

/** Target for a launch: the locked one, else the nearest enemy ahead in a wide cone (fire held to lock on the way out). */
export function launchTarget(car, cars, def) {
  const lk = car.lock;
  if (lk && lk.locked && lk.target && !lk.target.wrecked) return lk.target;
  const f = findLockTarget(car, cars, def.lockCone * 2, def.lockRange);
  return f ? f.car : null;
}
