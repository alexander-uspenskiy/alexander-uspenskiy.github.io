// Wall and car-car collision response. Cars are plain objects (see carPhysics.createCarBody + raceSim fields).
import { clamp, wrapAngle } from '../core/mathUtil.js';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH } from './carPhysics.js';

export const WALL_RESTITUTION = 0.25;
const CIRCLE_OFFSETS = [1.3, -1.3];
export const CIRCLE_R = 1.1;

/**
 * Track edges are walls at |d| = halfWidth. `pr` = track.project(car) result (d, heading).
 * Pushes the car back inside and reflects velocity. Returns the impact speed (normal component) or 0.
 */
export function resolveWall(car, pr, halfWidth) {
  const dpsi = wrapAngle(car.heading - pr.heading);
  const sd = Math.sin(dpsi), cd = Math.cos(dpsi);
  let worst = 0, worstSign = 0;
  for (const cx of [CAR_HALF_LENGTH, -CAR_HALF_LENGTH]) {
    for (const cy of [CAR_HALF_WIDTH, -CAR_HALF_WIDTH]) {
      const dc = pr.d + cx * sd + cy * cd;
      const pen = Math.abs(dc) - halfWidth;
      if (pen > worst) { worst = pen; worstSign = dc > 0 ? 1 : -1; }
    }
  }
  if (worst <= 0) return 0;
  const nx = -Math.sin(pr.heading), ny = Math.cos(pr.heading);   // right normal
  const inX = -worstSign * nx, inY = -worstSign * ny;            // towards the track
  const push = worst + 0.02;
  car.x += inX * push; car.y += inY * push;
  pr.d -= worstSign * push;
  const vn = car.vx * inX + car.vy * inY;
  let impact = 0;
  if (vn < 0) {
    impact = -vn;
    const tx = car.vx - vn * inX, ty = car.vy - vn * inY;
    const tf = impact > 1 ? 0.9 : 0.985;
    car.vx = tx * tf + inX * impact * WALL_RESTITUTION;
    car.vy = ty * tf + inY * impact * WALL_RESTITUTION;
    // swing the nose along the wall
    const nudge = clamp(-dpsi * 1.5, -0.8, 0.8) * Math.min(1, impact / 8);
    car.yawRate = clamp(car.yawRate * 0.6 + nudge, -3.2, 3.2);
  }
  return impact;
}

/**
 * Two-circle car-car collision with impulse. Returns the closing speed (0 if no contact).
 * Mutates positions and velocities of both cars.
 */
export function resolveCarCar(A, B) {
  const cA = Math.cos(A.heading), sA = Math.sin(A.heading);
  const cB = Math.cos(B.heading), sB = Math.sin(B.heading);
  const mA = A.stats.mass, mB = B.stats.mass;
  const iA = 1 / mA, iB = 1 / mB, isum = iA + iB;
  let maxClose = 0;
  for (const oa of CIRCLE_OFFSETS) {
    for (const ob of CIRCLE_OFFSETS) {
      const rax = oa * cA, ray = oa * sA, rbx = ob * cB, rby = ob * sB;
      const dx = B.x + rbx - (A.x + rax), dy = B.y + rby - (A.y + ray);
      const d2 = dx * dx + dy * dy, rr = 2 * CIRCLE_R;
      if (d2 >= rr * rr) continue;
      let dist = Math.sqrt(d2), nx = 1, ny = 0;
      if (dist > 1e-6) { nx = dx / dist; ny = dy / dist; } else dist = 0;
      const corr = (0.6 * (rr - dist)) / isum;
      A.x -= nx * corr * iA; A.y -= ny * corr * iA;
      B.x += nx * corr * iB; B.y += ny * corr * iB;
      const vAx = A.vx - A.yawRate * ray, vAy = A.vy + A.yawRate * rax;
      const vBx = B.vx - B.yawRate * rby, vBy = B.vy + B.yawRate * rbx;
      const vn = (vBx - vAx) * nx + (vBy - vAy) * ny;
      if (vn >= 0) continue;
      if (-vn > maxClose) maxClose = -vn;
      const jn = (-(1 + 0.2) * vn) / isum;
      A.vx -= (jn * nx) * iA; A.vy -= (jn * ny) * iA;
      B.vx += (jn * nx) * iB; B.vy += (jn * ny) * iB;
      // small yaw kick from the off-centre contact
      A.yawRate = clamp(A.yawRate - clamp((rax * ny - ray * nx) * jn * iA * 0.15, -0.5, 0.5), -3.2, 3.2);
      B.yawRate = clamp(B.yawRate + clamp((rbx * ny - rby * nx) * jn * iB * 0.15, -0.5, 0.5), -3.2, 3.2);
    }
  }
  return maxClose;
}

/** Nearest-distance test of point (px,py) against a car's two circles; returns distance minus circle radius. */
export function pointCarDistance(car, px, py) {
  const c = Math.cos(car.heading), s = Math.sin(car.heading);
  let best = Infinity;
  for (const o of CIRCLE_OFFSETS) {
    const d = Math.hypot(px - (car.x + o * c), py - (car.y + o * s)) - CIRCLE_R;
    if (d < best) best = d;
  }
  return best;
}

/** Ray (ox,oy,dirx,diry) vs the car's circles; returns hit distance along the ray or -1. */
export function rayCar(car, ox, oy, dx, dy, maxDist) {
  const c = Math.cos(car.heading), s = Math.sin(car.heading);
  let best = -1;
  for (const o of CIRCLE_OFFSETS) {
    const fx = car.x + o * c - ox, fy = car.y + o * s - oy;
    const t = fx * dx + fy * dy;
    if (t < 0 || t > maxDist + CIRCLE_R) continue;
    const perp2 = fx * fx + fy * fy - t * t;
    if (perp2 > CIRCLE_R * CIRCLE_R) continue;
    const th = t - Math.sqrt(CIRCLE_R * CIRCLE_R - perp2);
    if (th <= maxDist && (best < 0 || th < best)) best = Math.max(0, th);
  }
  return best;
}
