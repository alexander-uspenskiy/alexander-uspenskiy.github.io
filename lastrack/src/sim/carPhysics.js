// Arcade-plus 2D car dynamics. Pure module: no three, no DOM. Heading θ: forward (cos θ, sin θ), +θ turns right (+d side).
// Adds over the original arcade model: engine (gears, torque curve, rev limiter), friction-limited braking, longitudinal
// weight transfer (front/rear axle grip), slip-angle grip curve (peak then fall-off => drift), rear-axle oversteer, surfaces.
import { clamp, wrapAngle } from '../core/mathUtil.js';

export const SIM_HZ = 120;
export const SIM_DT = 1 / 120;

export const TUNING = {
  g: 9.81,
  mu: 1.35,             // lateral grip coefficient at grip=1
  wheelbase: 2.6,
  steerLock: 0.5,       // rad of road-wheel angle at steer=±1
  yawOverRatio: 1.25,   // max yaw-rate vs the no-slide limit (>1 lets a car break away)
  maxYaw: 3.2,
  yawResponse: 12,      // 1/s
  steerRate: 8,         // 1/s input smoothing
  drag: 0.02, roll: 0.35,
  handbrakeGrip: 0.35, handbrakeDecel: 10,
  slideDrag: 0.12,      // speed lost per unit of lateral velocity scrubbed
  reverseMax: 8, reverseAccel: 6,
  tyreGripMult: 0.5, tyreSpeedMult: 0.7,
  // --- braking: decel is limited by what the tyres can give (stats.brake is the pedal-side ceiling)
  brakeGrip: 1.0,       // fraction of the grip budget usable for braking (≈1.3 g on a stock Hammer)
  brakeCircle: 0.45,    // lateral grip lost when braking at the limit (friction circle)
  // --- weight transfer
  cgHeight: 0.55,
  transferMax: 0.3,
  transferRate: 7,      // 1/s smoothing of the load shift
  loadSensitivity: 0.55, // axle grip change per unit of load share change (tyre load sensitivity)
  // --- slip-angle grip curve
  slipPeak: 0.17,       // rad at which a tyre gives peak lateral force
  slipFall: 0.3,        // grip lost beyond slipPeak by slip = slipPeak + 0.45 rad
  oversteerGain: 5,     // rad/s² of extra yaw per unit of rear saturation
  rwdSlide: 0.18,       // rear grip lost at full throttle while steering (RWD muscle car)
  // --- engine
  idleRpm: 0.16,
  shiftUp: 0.93, shiftDown: 0.42, shiftTime: 0.14,
  gearTop: [0.2, 0.38, 0.57, 0.78, 1.0], // fraction of maxSpeed reached at the redline of each gear
  gearPull: [1.7, 1.35, 1.12, 0.95, 0.82], // acceleration multiplier per gear (short gears pull harder)
  limiterCut: 0.97,     // rpm01 at which the limiter bounces
};

export const CAR_HALF_LENGTH = 2.2;
export const CAR_HALF_WIDTH = 1.0;

export function createCarBody(pose, stats) {
  return {
    x: pose.x, y: pose.y, heading: pose.heading, vx: 0, vy: 0, yawRate: 0, steer: 0,
    u: 0, w: 0, speed: 0, stats, slideMult: 1, throttleOut: 0,
    // dynamics read-outs (also published in the snapshot)
    gear: 1, rpm: TUNING.idleRpm, shiftT: 0, limiter: false, shifted: 0,
    ax: 0, ay: 0, load: 0, slip: 0, wheelspin: 0, braking: 0, surface: 'tarmac',
    kickX: 0, kickY: 0,
  };
}

/** Grip-limited lateral acceleration (m/s²) for a stats block; shared with the AI's speed planner. */
export function gripAccel(stats, gripMult = 1) {
  return TUNING.g * TUNING.mu * (stats.grip ?? 1) * gripMult;
}

/** Max braking deceleration (m/s²) the tyres allow. */
export function brakeLimit(stats, gripMult = 1) {
  return Math.min(stats.brake ?? 40, gripAccel(stats, gripMult) * TUNING.brakeGrip);
}

/** Torque curve: rpm01 (0..1 of redline) -> 0..1 relative torque, peaking near 60 %. */
export function torqueCurve(r) {
  const x = clamp(r, 0, 1);
  return clamp((0.5 + 1.9 * x - 1.6 * x * x) / 1.07, 0.35, 1);
}

/** Lateral grip fraction vs tyre slip angle (rad): flat to the peak, then falls off (drift). */
export function slipGrip(alpha) {
  const a = Math.abs(alpha);
  if (a <= TUNING.slipPeak) return 1;
  return 1 - TUNING.slipFall * clamp((a - TUNING.slipPeak) / 0.45, 0, 1);
}

/** Gear for a forward speed, given the current gear (hysteresis). Returns { gear, rpm01 }. */
export function gearFor(u, maxSpeed, gear) {
  const T = TUNING, tops = T.gearTop;
  const rpmIn = (g) => T.idleRpm + (1 - T.idleRpm) * (u / (maxSpeed * tops[g - 1]));
  let r = rpmIn(gear);
  while (gear < tops.length && r > T.shiftUp) { gear++; r = rpmIn(gear); }
  while (gear > 1 && r < T.shiftDown) { gear--; r = rpmIn(gear); }
  return { gear, rpm01: clamp(r, T.idleRpm, 1.02) };
}

/**
 * Advance one body. input = {throttle, brake, steer, handbrake}.
 * mods = {gripMult, speedMult, accelMult, pull, dragExtra, rough, locked}.
 */
export function stepBody(b, input, dt, mods = {}) {
  const T = TUNING, st = b.stats;
  const gripMult = mods.gripMult ?? 1, speedMult = mods.speedMult ?? 1, accelMult = mods.accelMult ?? 1;
  if (mods.locked) {
    b.vx = b.vy = 0; b.yawRate = 0; b.u = b.w = b.speed = 0;
    b.rpm = T.idleRpm + (clamp(input.throttle || 0, 0, 1)) * 0.5; b.gear = 1; b.ax = b.ay = b.slip = b.wheelspin = b.braking = 0;
    return;
  }
  const throttle = clamp(input.throttle || 0, 0, 1);
  const brake = clamp(input.brake || 0, 0, 1);
  const handbrake = !!input.handbrake;
  const target = clamp((input.steer || 0) + (mods.pull || 0), -1, 1);
  b.steer += clamp(target - b.steer, -T.steerRate * dt, T.steerRate * dt);
  b.shifted = 0;

  // decompose velocity in the current body frame
  let c = Math.cos(b.heading), s = Math.sin(b.heading);
  let u = b.vx * c + b.vy * s;
  let w = -b.vx * s + b.vy * c;      // + = to the right of travel (right normal is (-s, c))

  // ---- axle loads (longitudinal weight transfer): +load = nose heavy (braking)
  const tgtLoad = clamp(-b.ax * T.cgHeight / (T.wheelbase * T.g), -T.transferMax, T.transferMax);
  b.load += (tgtLoad - b.load) * Math.min(1, T.transferRate * dt);
  const frontShare = 0.5 + b.load, rearShare = 0.5 - b.load;
  let gripF = 1 + T.loadSensitivity * (frontShare / 0.5 - 1);
  let gripR = 1 + T.loadSensitivity * (rearShare / 0.5 - 1);
  gripR *= 1 - T.rwdSlide * throttle * Math.min(1, Math.abs(b.steer) * 1.5) * Math.min(1, Math.abs(u) / 25);
  if (handbrake) gripR *= T.handbrakeGrip;

  // ---- braking demand (needed up-front for the friction circle)
  const bLim = brakeLimit(st, gripMult);
  const brakeDecel = u > 0.3 ? bLim * brake : 0;
  const circle = 1 - T.brakeCircle * clamp(brakeDecel / Math.max(1, gripAccel(st, gripMult)), 0, 1) ** 2;

  // yaw
  const lim = gripAccel(st, gripMult);
  const limF = lim * gripF * circle;
  const yawCap = Math.min(T.maxYaw, (T.yawOverRatio * limF) / Math.max(Math.abs(u), 8));
  let yawT = (u * Math.tan(b.steer * T.steerLock * (st.turn ?? 1))) / T.wheelbase;
  yawT = clamp(yawT, -yawCap, yawCap);
  b.yawRate += (yawT - b.yawRate) * Math.min(1, T.yawResponse * dt);
  // rear axle past its slip peak: the tail steps out (oversteer), nose rotates further into the slide
  const alphaR = Math.atan2(Math.abs(w), Math.max(Math.abs(u), 3));
  const over = clamp((alphaR - T.slipPeak * (0.7 + 0.3 * gripR)) / 0.3, 0, 1);
  if (over > 0 && Math.abs(u) > 6) b.yawRate = clamp(b.yawRate - Math.sign(w) * T.oversteerGain * over * dt, -T.maxYaw, T.maxYaw);
  b.heading = wrapAngle(b.heading + b.yawRate * dt);
  c = Math.cos(b.heading); s = Math.sin(b.heading);
  u = b.vx * c + b.vy * s;
  w = -b.vx * s + b.vy * c;

  // ---- engine / longitudinal
  const vmax = st.maxSpeed * speedMult;
  const fwd = Math.max(0, u);
  if (b.shiftT > 0) b.shiftT = Math.max(0, b.shiftT - dt);
  const gr = gearFor(fwd, st.maxSpeed, b.gear);
  if (gr.gear !== b.gear) { b.gear = gr.gear; b.shiftT = T.shiftTime; b.shifted = 1; }
  let rpm01 = gr.rpm01;
  b.limiter = rpm01 >= T.limiterCut && throttle > 0.5 && b.gear === T.gearTop.length;
  let a = 0;
  if (throttle > 0) {
    const r = fwd / vmax;
    const cut = b.shiftT > 0 ? 0.15 : 1;                 // torque interruption during a gear change
    const limiter = rpm01 >= 1 ? 0.2 : 1;                // rev limiter bounce
    a += st.accel * accelMult * throttle * Math.max(0, 1 - r * r * r) * torqueCurve(rpm01) * T.gearPull[b.gear - 1] * cut * limiter / 0.85;
  }
  // drive demand beyond what the rear tyres can plant => wheelspin
  const driveLimit = lim * gripR * 1.1;
  b.wheelspin = a > driveLimit && fwd < 35 ? clamp((a - driveLimit) / driveLimit, 0, 1) : 0;
  if (b.wheelspin > 0) a = driveLimit + (a - driveLimit) * 0.55;
  // rpm display: flare on wheelspin / limiter, creep up in neutral-ish launch
  b.rpm += ((rpm01 + b.wheelspin * 0.25 + (throttle > 0 ? 0 : 0)) - b.rpm) * Math.min(1, 14 * dt);
  b.rpm = clamp(b.rpm, T.idleRpm, 1.05);

  if (u > 0.3) {
    a -= (T.drag * u + T.roll) + (mods.dragExtra || 0) * u;
    if (u > vmax) a -= (u - vmax) * 3;
    a -= brakeDecel;
    if (handbrake) a -= T.handbrakeDecel;
  } else if (u < -0.3) {
    a += T.reverseAccel;           // rolling stop
  }
  if (brake > 0.05 && throttle < 0.05 && u <= 0.3) {
    // brake held at a standstill -> reverse
    a -= T.reverseAccel * brake;
    if (u < -T.reverseMax) a = Math.max(a, 0);
  }
  let nu = u + a * dt;
  if (u > 0 && nu < 0 && brake < 0.05 && !handbrake) nu = 0;

  // ---- lateral grip with slip-angle curve; rear axle does the correcting
  const alpha = Math.atan2(Math.abs(w), Math.max(Math.abs(nu), 2));
  const gl = lim * gripR * circle * slipGrip(alpha) * (mods.rough ? 1 - 0.1 * mods.rough : 1);
  const dw = clamp(-w, -gl * dt, gl * dt);
  const nw = w + dw;
  const saturated = Math.abs(dw) >= gl * dt * 0.999;
  nu -= Math.abs(dw) * T.slideDrag * Math.sign(nu || 1) * (saturated ? 2 : 0.5);
  // external kick (blast impulse) is applied over a short time to avoid velocity snaps
  let kx = 0, ky = 0;
  if (b.kickX || b.kickY) {
    const f = Math.min(1, dt * 7);
    kx = b.kickX * f; ky = b.kickY * f; b.kickX -= kx; b.kickY -= ky;
    if (Math.abs(b.kickX) + Math.abs(b.kickY) < 0.02) b.kickX = b.kickY = 0;
  }
  b.vx = nu * c - nw * s + kx;
  b.vy = nu * s + nw * c + ky;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // read-outs (smoothed accelerations for suspension/audio/HUD)
  const axNow = (nu - u) / dt, ayNow = b.yawRate * nu;
  b.ax += (axNow - b.ax) * Math.min(1, 10 * dt);
  b.ay += (ayNow - b.ay) * Math.min(1, 10 * dt);
  b.u = nu; b.w = nw; b.speed = Math.hypot(b.vx, b.vy);
  b.slip = clamp(Math.max(alpha / (T.slipPeak * 2.2), saturated ? 0.6 : 0), 0, 1) * clamp(b.speed / 8, 0, 1);
  b.braking = brakeDecel > 0 ? clamp(brakeDecel / Math.max(1, bLim), 0, 1) : 0;
}
