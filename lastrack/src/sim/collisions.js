// Wall and car-car collision response. Cars are plain objects (see carPhysics.createCarBody + raceSim fields).
import { clamp, wrapAngle } from '../core/mathUtil.js';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH, SIM_DT } from './carPhysics.js';

export const WALL_RESTITUTION = 0.12;
/** Forgiving-wall tuning: soft run-off band, glancing-blow response and the damage threshold. */
export const WALL = {
  soft: 1.4,         // m: width of the soft run-off band in front of the solid wall (measured at the body corners)
  softPush: 10,      // m/s² of inward push at full depth of the band
  softBleed: 3.5,    // 1/s: outward normal velocity bled off at full depth
  friction: 0.15,    // wall friction coefficient: tangential speed lost = friction * normal speed absorbed
  align: 6,          // 1/s: the nose swings along the wall while in contact
  dmgMin: 9,         // m/s of impact (normal) speed below which a wall does no damage
  dmgK: 0.9,         // armor points per m/s above the threshold
};
const CIRCLE_OFFSETS = [1.3, -1.3];
export const CIRCLE_R = 1.1;

/** Pure: armor damage for a wall hit of the given normal impact speed (0 below the threshold). */
export function wallDamage(impact) {
  return impact > WALL.dmgMin ? (impact - WALL.dmgMin) * WALL.dmgK : 0;
}

/** Deepest body corner past `limit` from the centreline: { depth, sign } (depth <= 0 = clear). */
function worstCorner(car, pr, limit) {
  const dpsi = wrapAngle(car.heading - pr.heading);
  const sd = Math.sin(dpsi), cd = Math.cos(dpsi);
  let worst = -Infinity, worstSign = 0;
  for (const cx of [CAR_HALF_LENGTH, -CAR_HALF_LENGTH]) {
    for (const cy of [CAR_HALF_WIDTH, -CAR_HALF_WIDTH]) {
      const dc = pr.d + cx * sd + cy * cd;
      const pen = Math.abs(dc) - limit;
      if (pen > worst) { worst = pen; worstSign = dc > 0 ? 1 : -1; }
    }
  }
  return { depth: worst, sign: worstSign, dpsi };
}

/** Heading of the wall tangent closest to the car's heading (the way the car "wants" to run along the wall). */
function alongWall(car, pr) {
  const dpsi = wrapAngle(car.heading - pr.heading);
  if (Math.abs(Math.abs(dpsi) - Math.PI / 2) < 0.25) return pr.heading;        // square-on: follow the track direction
  return Math.abs(dpsi) > Math.PI / 2 ? wrapAngle(pr.heading + Math.PI) : pr.heading;
}

/**
 * Soft run-off band: a gentle inward push and some outward-speed bleed before the solid wall, so brushing the edge
 * nudges the car back instead of stopping it. Call before resolveWall. Returns the band depth 0..1 (0 = clear).
 */
export function softEdge(car, pr, halfWidth, dt = SIM_DT) {
  const { depth, sign } = worstCorner(car, pr, halfWidth - WALL.soft);
  if (depth <= 0) return 0;
  const k = clamp(depth / WALL.soft, 0, 1);
  const nx = -Math.sin(pr.heading), ny = Math.cos(pr.heading);
  const inX = -sign * nx, inY = -sign * ny;
  const vn = car.vx * inX + car.vy * inY;       // < 0: moving toward the wall
  const push = WALL.softPush * k * dt;
  const bleed = vn < 0 ? vn * Math.min(1, WALL.softBleed * k * dt) : 0;
  car.vx += inX * (push - bleed); car.vy += inY * (push - bleed);
  const err = wrapAngle(alongWall(car, pr) - car.heading);
  car.heading = wrapAngle(car.heading + err * Math.min(1, 4 * k * dt));
  return k;
}

/**
 * Track edges are walls at |d| = halfWidth. `pr` = track.project(car) result (d, heading).
 * Pushes the car back inside and deflects it along the wall: glancing blows keep nearly all of their speed, only a
 * near-perpendicular hit scrubs it. Returns the impact speed (normal component) or 0.
 */
export function resolveWall(car, pr, halfWidth) {
  const { depth: worst, sign: worstSign } = worstCorner(car, pr, halfWidth);
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
    // Coulomb-style wall friction: the tangential speed lost is proportional to the normal speed absorbed, so a glancing
    // blow (small normal component) barely slows the car while a square hit scrubs most of it
    const tl = Math.hypot(tx, ty) || 1;
    const tf = Math.max(0, tl - WALL.friction * (1 + WALL_RESTITUTION) * impact) / tl;
    car.vx = tx * tf + inX * impact * WALL_RESTITUTION;
    car.vy = ty * tf + inY * impact * WALL_RESTITUTION;
  }
  // swing the nose along the wall (and stop the yaw from spinning the car off it)
  const err = wrapAngle(alongWall(car, pr) - car.heading);
  car.heading = wrapAngle(car.heading + err * Math.min(1, WALL.align * SIM_DT));
  car.yawRate = clamp(car.yawRate * 0.8 + clamp(err * 2, -2, 2) * 0.2, -3.2, 3.2);
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
