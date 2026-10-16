// Arcade-shooter 2D car dynamics. Pure module: no three, no DOM. Heading θ: forward (cos θ, sin θ), +θ turns right (+d side).
// Base: engine (gears, torque curve, rev limiter), friction-limited braking, longitudinal weight transfer, slip-angle grip
// curve, rear-axle oversteer, surfaces. Arcade layer on top: high forgiving grip, speed-sensitive steering, a drift state
// (handbrake / hard lock kick the tail out), auto counter-steer that recovers the slide on its own, mild auto-straighten,
// straight-line speed boost and an optional nitro (input.nitro, charge + cooldown). Deterministic: no Math.random, no clock.
import { clamp, wrapAngle } from '../core/mathUtil.js';

export const SIM_HZ = 120;
export const SIM_DT = 1 / 120;

export const TUNING = {
  g: 9.81,
  mu: 2.5,              // lateral grip coefficient at grip=1 (arcade: high, forgiving)
  wheelbase: 2.6,
  steerLock: 0.5,       // rad of road-wheel angle at steer=±1
  steerShape: 0.85,     // |steer|^shape: a touch more bite around the centre
  yawOverRatio: 1.3,    // max yaw-rate vs the no-slide limit (>1 lets a car rotate past its grip: visible, controllable slip)
  maxYaw: 3.2,
  yawResponse: 15,      // 1/s: how fast the yaw rate follows the steering target (snappy at any speed)
  steerRate: 12,        // 1/s input smoothing
  steerReturn: 20,      // 1/s centring speed when the stick is released (mild auto-straighten)
  drag: 0.02, roll: 0.35,
  handbrakeGrip: 0.42, handbrakeDecel: 7,
  slideDrag: 0.05,      // speed lost per unit of lateral velocity scrubbed (drifts keep their speed)
  reverseMax: 8, reverseAccel: 6,
  tyreGripMult: 0.5, tyreSpeedMult: 0.7,
  // --- braking: decel is limited by what the tyres can give; brakeGrip is tuned so a stock car stops at ~1.3 g
  brakeGrip: 0.55,
  brakeCircle: 0.35,    // lateral grip lost when braking at the limit (friction circle)
  // --- weight transfer
  cgHeight: 0.55,
  transferMax: 0.3,
  transferRate: 7,      // 1/s smoothing of the load shift
  loadSensitivity: 0.4, // axle grip change per unit of load share change (tyre load sensitivity)
  // --- slip-angle grip curve
  slipPeak: 0.2,        // rad at which a tyre gives peak lateral force
  slipFall: 0.16,       // grip lost beyond slipPeak by slip = slipPeak + 0.45 rad (shallow: a slide stays grippy)
  oversteerGain: 2.2,   // rad/s² of extra yaw per unit of rear saturation
  rwdSlide: 0.1,        // rear grip lost at full throttle while steering (RWD muscle car)
  // --- arcade drift + slide recovery
  driftSpeed: 22,       // m/s above which a hard turn kicks the tail out
  driftSteer: 0.72,     // |steer| above which the kick starts
  driftKick: 0.4,       // rear grip lost at full drift state
  driftHold: [0.3, 0.8], // s of sustained hard lock before the tail kick is fully in (taps never kick)
  driftAttack: 7, driftRelease: 3.2,   // 1/s drift-state smoothing
  driftYawBoost: 0.18,  // extra yaw target while drifting (the nose rotates into the turn)
  recoverDead: 0.1,     // rad of slip angle ignored by the assist (ordinary cornering slip)
  recoverGain: 5.0,     // yaw-rate (rad/s) pulled back toward the velocity direction per rad of slip angle
  recoverHold: 0.75,    // fraction of that assist removed while the player holds a drift (steering into it / handbrake)
  slipSoftCap: 0.55,    // rad: beyond this the assist stiffens so a slide can never become a spin
  slipHard: 0.9,        // rad: beyond this the rear grip is restored outright
  // --- straight-line boost and nitro
  straightBoost: 0.075, // +7.5 % top speed after holding the throttle straight for straightTime
  straightTime: 1.6,
  nitroAccel: 1.8, nitroSpeed: 1.2,
  nitroDrain: 0.5,      // charge/s while burning (2 s burst)
  nitroRecharge: 0.14,  // charge/s while idle
  nitroCooldown: 1.2,   // s before the charge starts coming back after a burn
  nitroMin: 0.12,       // charge needed to light it
  // --- engine
  idleRpm: 0.16,
  shiftUp: 0.93, shiftDown: 0.42, shiftTime: 0.07,
  shiftCut: 0.5,        // torque kept during a gear change
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
    // arcade state
    drift: 0, lockT: 0, straightT: 0, nitro: 1, nitroCd: 0, nitroOn: false, boost: 0,
  };
}

/** Grip-limited lateral acceleration (m/s²) for a stats block; shared with the AI's speed planner. */
export function gripAccel(stats, gripMult = 1) {
  return TUNING.g * TUNING.mu * (stats.grip ?? 1) * gripMult;
}

/** Max braking deceleration (m/s²) the tyres allow (≈1.3 g on a stock car, scaled by grip). */
export function brakeLimit(stats, gripMult = 1) {
  return Math.min(stats.brake ?? 40, gripAccel(stats, gripMult) * TUNING.brakeGrip);
}

/** Torque curve: rpm01 (0..1 of redline) -> 0..1 relative torque, peaking near 60 %. */
export function torqueCurve(r) {
  const x = clamp(r, 0, 1);
  return clamp((0.5 + 1.9 * x - 1.6 * x * x) / 1.07, 0.35, 1);
}

/** Lateral grip fraction vs tyre slip angle (rad): flat to the peak, then falls off gently (drift). */
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
 * Pure: the drift-kick target (0..1) for an input at a forward speed. Handbrake = full kick; a hard lock at speed = a
 * partial one that ramps in over the last 28 % of the stick travel. `kick` (0..1) scales it (AI cars pass 0).
 */
export function driftTarget(steer, u, handbrake, throttle, kick = 1) {
  if (kick <= 0 || u < 8) return 0;
  if (handbrake) return clamp(u / 15, 0, 1) * kick;
  const T = TUNING, a = Math.abs(steer);
  if (a < T.driftSteer || u < T.driftSpeed) return 0;
  const ramp = clamp((a - T.driftSteer) / (1 - T.driftSteer), 0, 1) * clamp((u - T.driftSpeed) / 14, 0, 1);
  return ramp * (0.55 + 0.45 * clamp(throttle, 0, 1)) * kick;
}

/**
 * Pure: the auto counter-steer yaw-rate correction (rad/s, + = turn right). `beta` = slip angle (rad, + when the velocity
 * points to the right of the nose), `hold` 0..1 = how much the driver is deliberately holding the slide.
 */
export function slideRecovery(beta, u, hold) {
  const T = TUNING, a = Math.max(0, Math.abs(beta) - T.recoverDead);   // normal cornering slip is left alone
  const speed = clamp(Math.abs(u) / 12, 0, 1);
  let k = T.recoverGain * (1 - T.recoverHold * clamp(hold, 0, 1));
  const over = Math.max(0, Math.abs(beta) - T.slipSoftCap);
  k += over * T.recoverGain * 3;            // stiffens past the soft cap: no spin-outs
  return Math.sign(beta) * a * k * speed;
}

/**
 * Advance one body. input = {throttle, brake, steer, handbrake, nitro}.
 * mods = {gripMult, speedMult, accelMult, pull, dragExtra, rough, locked, kick (0..1 drift kick, default 1), noNitro}.
 */
export function stepBody(b, input, dt, mods = {}) {
  const T = TUNING, st = b.stats;
  const gripMult = mods.gripMult ?? 1, accelMult = mods.accelMult ?? 1;
  if (mods.locked) {
    b.vx = b.vy = 0; b.yawRate = 0; b.u = b.w = b.speed = 0;
    b.rpm = T.idleRpm + (clamp(input.throttle || 0, 0, 1)) * 0.5; b.gear = 1; b.ax = b.ay = b.slip = b.wheelspin = b.braking = 0;
    b.drift = 0; b.lockT = 0; b.nitroOn = false;
    return;
  }
  const throttle = clamp(input.throttle || 0, 0, 1);
  const brake = clamp(input.brake || 0, 0, 1);
  const handbrake = !!input.handbrake;
  const rawSteer = clamp((input.steer || 0) + (mods.pull || 0), -1, 1);
  const target = Math.sign(rawSteer) * Math.pow(Math.abs(rawSteer), T.steerShape);
  // stick released (or reversed) centres faster than it builds: mild auto-straighten
  const rate = (Math.abs(target) < Math.abs(b.steer) || target * b.steer < 0 ? T.steerReturn : T.steerRate) * dt;
  b.steer += clamp(target - b.steer, -rate, rate);
  b.shifted = 0;

  // decompose velocity in the current body frame
  let c = Math.cos(b.heading), s = Math.sin(b.heading);
  let u = b.vx * c + b.vy * s;
  let w = -b.vx * s + b.vy * c;      // + = to the right of travel (right normal is (-s, c))

  // ---- nitro (charge + cooldown) and straight-line boost
  const wantNitro = !!input.nitro && !mods.noNitro && u > 3;
  if (wantNitro && b.nitro > (b.nitroOn ? 0 : T.nitroMin) && b.nitroCd <= 0) {
    b.nitroOn = true; b.nitro = Math.max(0, b.nitro - T.nitroDrain * dt);
    if (b.nitro <= 0) { b.nitroOn = false; b.nitroCd = T.nitroCooldown; }
  } else {
    if (b.nitroOn) b.nitroCd = T.nitroCooldown;
    b.nitroOn = false;
    if (b.nitroCd > 0) b.nitroCd = Math.max(0, b.nitroCd - dt);
    else b.nitro = Math.min(1, b.nitro + T.nitroRecharge * dt);
  }
  const straight = throttle > 0.9 && Math.abs(b.steer) < 0.12 && u > st.maxSpeed * 0.7 && Math.abs(w) < 2;
  b.straightT = straight ? Math.min(T.straightTime, b.straightT + dt) : Math.max(0, b.straightT - dt * 2);
  b.boost = clamp(b.straightT / T.straightTime, 0, 1);
  const speedMult = (mods.speedMult ?? 1) * (1 + T.straightBoost * b.boost) * (b.nitroOn ? T.nitroSpeed : 1);
  const accelBoost = accelMult * (b.nitroOn ? T.nitroAccel : 1);

  // ---- drift state: the tail is kicked out by the handbrake or a hard lock at speed, released smoothly
  const hard = Math.abs(b.steer) > T.driftSteer && u > T.driftSpeed;
  b.lockT = hard ? b.lockT + dt : Math.max(0, b.lockT - dt * 2);
  const sustain = handbrake ? 1 : clamp((b.lockT - T.driftHold[0]) / (T.driftHold[1] - T.driftHold[0]), 0, 1);
  const dTarget = driftTarget(b.steer, u, handbrake, throttle, mods.kick ?? 1) * sustain;
  b.drift += (dTarget - b.drift) * Math.min(1, (dTarget > b.drift ? T.driftAttack : T.driftRelease) * dt);

  // ---- axle loads (longitudinal weight transfer): +load = nose heavy (braking)
  const tgtLoad = clamp(-b.ax * T.cgHeight / (T.wheelbase * T.g), -T.transferMax, T.transferMax);
  b.load += (tgtLoad - b.load) * Math.min(1, T.transferRate * dt);
  const frontShare = 0.5 + b.load, rearShare = 0.5 - b.load;
  let gripF = 1 + T.loadSensitivity * (frontShare / 0.5 - 1);
  let gripR = 1 + T.loadSensitivity * (rearShare / 0.5 - 1);
  gripR *= 1 - T.rwdSlide * throttle * Math.min(1, Math.abs(b.steer) * 1.5) * Math.min(1, Math.abs(u) / 25);
  gripR *= 1 - T.driftKick * b.drift;
  if (handbrake) gripR *= T.handbrakeGrip / (1 - T.driftKick * b.drift || 1);
  // slide beyond the hard slip limit: the rear tyres bite again so a slide never becomes a spin
  const beta0 = Math.atan2(w, Math.max(Math.abs(u), 4));
  if (Math.abs(beta0) > T.slipSoftCap) gripR = Math.max(gripR, 0.55 + 0.45 * clamp((Math.abs(beta0) - T.slipSoftCap) / (T.slipHard - T.slipSoftCap), 0, 1));

  // ---- braking demand (needed up-front for the friction circle)
  const bLim = brakeLimit(st, gripMult);
  const brakeDecel = u > 0.3 ? bLim * brake : 0;
  const circle = 1 - T.brakeCircle * clamp(brakeDecel / Math.max(1, gripAccel(st, gripMult)), 0, 1) ** 2;

  // yaw
  const lim = gripAccel(st, gripMult);
  const limF = lim * gripF * circle;
  const yawCap = Math.min(T.maxYaw, (T.yawOverRatio * limF) / Math.max(Math.abs(u), 8));
  let yawT = (u * Math.tan(b.steer * T.steerLock * (st.turn ?? 1))) / T.wheelbase;
  yawT = clamp(yawT * (1 + T.driftYawBoost * b.drift), -yawCap, yawCap);
  // auto counter-steer: pull the nose back toward the direction of travel, unless the driver is deliberately holding a slide
  const beta = Math.atan2(w, Math.max(Math.abs(u), 4));
  const into = -Math.sign(beta) * b.steer;                       // + when steering into the slide (drift hold)
  const hold = handbrake ? 1 : clamp(into * 1.3, 0, 1) * clamp(b.drift * 1.6 + 0.3, 0, 1);
  if (u > 2) yawT = clamp(yawT + slideRecovery(beta, u, hold), -T.maxYaw, T.maxYaw);
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
  const gr = gearFor(fwd, Math.max(vmax, st.maxSpeed), b.gear);   // boosted / nitro top speed stretches the gearing (no limiter wall)
  if (gr.gear !== b.gear) { b.gear = gr.gear; b.shiftT = T.shiftTime; b.shifted = 1; }
  let rpm01 = gr.rpm01;
  b.limiter = rpm01 >= T.limiterCut && throttle > 0.5 && b.gear === T.gearTop.length;
  let a = 0;
  if (throttle > 0) {
    const r = fwd / vmax;
    const cut = b.shiftT > 0 ? T.shiftCut : 1;           // torque interruption during a gear change
    const limiter = rpm01 >= 1 ? 0.2 : 1;                // rev limiter bounce
    a += st.accel * accelBoost * throttle * Math.max(0, 1 - r * r * r) * torqueCurve(rpm01) * T.gearPull[b.gear - 1] * cut * limiter / 0.85;
  }
  // drive demand beyond what the rear tyres can plant => wheelspin
  const driveLimit = lim * gripR * 1.1;
  b.wheelspin = a > driveLimit && fwd < 35 ? clamp((a - driveLimit) / driveLimit, 0, 1) : 0;
  if (b.wheelspin > 0) a = driveLimit + (a - driveLimit) * 0.55;
  // rpm display: flare on wheelspin / limiter, creep up in neutral-ish launch
  b.rpm += ((rpm01 + b.wheelspin * 0.25) - b.rpm) * Math.min(1, 14 * dt);
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
  b.slip = clamp(Math.max(alpha / (T.slipPeak * 2.2), saturated ? 0.6 : 0, b.drift * 0.9), 0, 1) * clamp(b.speed / 8, 0, 1);
  b.braking = brakeDecel > 0 ? clamp(brakeDecel / Math.max(1, bLim), 0, 1) : 0;
}
