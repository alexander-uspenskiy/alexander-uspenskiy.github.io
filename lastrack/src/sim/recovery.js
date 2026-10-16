// Auto-recovery for human-driven cars: facing the wrong way, or wedged against a wall, for too long => the car is swung
// around to face the track and nudged back onto the road over a short tween. Pure + deterministic (no clock, no random).
import { clamp, wrapAngle } from '../core/mathUtil.js';

export const RECOVERY = {
  wrongAngle: 2.0,    // rad between the car and the track direction that counts as "wrong way" (≈115°)
  wrongTime: 1.4,     // s of wrong-way driving below wrongSpeed before the recovery kicks in
  wrongSpeed: 14,     // m/s: a fast spin-out clears itself, only a slow wrong-way car is recovered
  stuckTime: 1.8,     // s of near-standstill in wall contact
  stuckSpeed: 2.5,
  tween: 0.7,         // s the swing-round takes
  restartSpeed: 8,    // m/s forward speed the car leaves with
  cooldown: 3,        // s before another recovery can start
  inset: 0.45,        // fraction of the half-width the car is brought back inside
};

export function initRecovery(car) {
  car.wrongT = 0; car.stuckT = 0; car.recT = 0; car.recCd = 0; car.recStart = null;
}

/** Pure: should this car recover now? Updates the timers. contact = touched a wall within the last ~0.3 s. */
export function recoveryTimers(car, headingErr, contact, dt) {
  const R = RECOVERY;
  car.recCd = Math.max(0, car.recCd - dt);
  car.wrongT = Math.abs(headingErr) > R.wrongAngle && car.speed < R.wrongSpeed ? car.wrongT + dt : Math.max(0, car.wrongT - dt * 2);
  car.stuckT = contact && car.speed < R.stuckSpeed ? car.stuckT + dt : Math.max(0, car.stuckT - dt * 2);
  return car.recCd <= 0 && (car.wrongT > R.wrongTime || car.stuckT > R.stuckTime);
}

/**
 * Advance the recovery for one tick. pr = track.project result (heading, d), hw = half width. Returns true while the tween
 * runs (the caller skips normal driving), and `started` is reported through the return of `beginRecovery`.
 */
export function beginRecovery(car, pr) {
  car.recT = RECOVERY.tween; car.recCd = RECOVERY.cooldown; car.wrongT = car.stuckT = 0;
  car.recStart = { heading: car.heading, d: pr.d, x: car.x, y: car.y };
}

export function stepRecovery(car, pr, hw, dt) {
  if (car.recT <= 0 || !car.recStart) return false;
  const R = RECOVERY, st = car.recStart;
  car.recT = Math.max(0, car.recT - dt);
  const k = 1 - car.recT / R.tween;
  const e = k * k * (3 - 2 * k);
  const targetD = clamp(st.d, -hw * R.inset, hw * R.inset);
  const dd = (targetD - st.d) * e;
  const nx = -Math.sin(pr.heading), ny = Math.cos(pr.heading);
  car.x = st.x + nx * dd; car.y = st.y + ny * dd;
  car.heading = wrapAngle(st.heading + wrapAngle(pr.heading - st.heading) * e);
  car.yawRate = 0; car.steer = 0;
  const sp = R.restartSpeed * e;
  car.vx = Math.cos(car.heading) * sp; car.vy = Math.sin(car.heading) * sp;
  car.u = sp; car.w = 0; car.speed = sp;
  car.drift = 0;
  return true;
}
