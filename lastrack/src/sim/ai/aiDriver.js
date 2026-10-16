// AI driver: pure pursuit on the racing line, speed profile, avoidance, combat. Deterministic given rng.
import { clamp, wrapAngle } from '../../core/mathUtil.js';
import { TUNING } from '../carPhysics.js';
import { getRacingLine, buildSpeedProfile } from './racingLine.js';
import { getWeapon } from '../../data/weapons.js';

export function createAI(track, car, opts = {}) {
  return {
    speed: buildSpeedProfile(track, car.stats),
    line: getRacingLine(track),
    stuckT: 0, reverseT: 0, reverseSteer: 0,
    nextRoll: 0, willing: false, ramming: false,
    skill: opts.skill ?? 0.8, aggression: opts.aggression ?? 0.5,
    favorite: opts.favoriteWeapon || null,
    lastUse: {},
    rammer: opts.favoriteWeapon === 'ramplate',
    hunt: !!opts.hunt,   // fixed forward guns: steer and pace to line a target up
  };
}

const ZERO = () => ({ throttle: 0, brake: 0, steer: 0, fire: false, cycleWeapon: false, selectWeapon: null, handbrake: false });

/**
 * ctx = { track, cars, t, dt, playerProgress (unwrapped metres or null), cruise (0..1 speed scale, default 1) }
 * Cars need: x,y,heading,u,w,proj{s,d,i},progress,wrecked,weapons,activeWeapon,stats,ai,finished.
 */
export function driveAI(car, ctx, rng) {
  const ai = car.ai, track = ctx.track, L = track.length;
  const out = ZERO();
  const hw = track.width / 2;
  const n = ai.line.n, ds = ai.line.ds;
  const idx = (s) => ((Math.round(s / ds) % n) + n) % n;
  const s0 = car.proj.s, u = car.u;
  const c = Math.cos(car.heading), sn = Math.sin(car.heading);

  // --- stuck / reverse recovery
  if (ai.reverseT > 0) {
    ai.reverseT -= ctx.dt;
    out.brake = 1; out.steer = ai.reverseSteer;
    return out;
  }
  if (ctx.racing && Math.abs(u) < 1.2) ai.stuckT += ctx.dt; else ai.stuckT = 0;
  if (ai.stuckT > 1.3) {
    ai.stuckT = 0; ai.reverseT = 1.1;
    const err = wrapAngle(car.proj.heading - car.heading);
    ai.reverseSteer = err > 0 ? -1 : 1;
    // wall to the right: reverse steering towards the right swings the nose left (towards the road)
    out.brake = 1; out.steer = ai.reverseSteer;
    return out;
  }

  // --- avoidance & car interaction
  let wantD = ai.line.offset[idx(s0 + 8)];
  let speedCap = Infinity;
  let beside = null, nearBehind = null, front = null;
  for (const o of ctx.cars) {
    if (o === car || (o.wrecked && o.wreckTimer <= 0)) continue;
    let dsl = o.proj.s - s0;
    dsl = dsl - Math.round(dsl / L) * L;
    const gapD = o.proj.d - car.proj.d;
    if (dsl > -3 && dsl < 3 && Math.abs(gapD) < 5) { if (!beside || Math.abs(gapD) < Math.abs(beside.gapD)) beside = { o, gapD }; }
    if (dsl < 0 && dsl > -25 && Math.abs(gapD) < 4 && (!nearBehind || dsl > nearBehind.dsl)) nearBehind = { o, dsl, gapD };
    if (dsl > 2.5 && dsl < 38 && Math.abs(gapD) < 3.4 && (!front || dsl < front.dsl)) front = { o, dsl, gapD };
  }
  // --- hunting (slice): every weapon fires along the heading, so line up behind the nearest live car ahead
  let hunt = null;
  if (ai.hunt && ctx.racing && !car.finished && ctx.t > 5 && car.weapons.some((w) => w.ammo > 0 && getWeapon(w.id)?.kind !== 'drop' && getWeapon(w.id)?.kind !== 'passive')) {
    for (const o of ctx.cars) {
      if (o === car || o.wrecked || o.finished) continue;
      let dsl = o.proj.s - s0; dsl -= Math.round(dsl / L) * L;
      const gapD = o.proj.d - car.proj.d;
      if (dsl > 8 && dsl < 70 && Math.abs(gapD) < 9 && (!hunt || dsl < hunt.dsl)) hunt = { o, dsl, gapD };
    }
  }
  if (front && hunt && hunt.o === front.o && front.dsl > 13) { /* lined up and clear: keep the target in the sights instead of dodging */ }
  else if (front) {
    const o = front.o;
    const side = o.proj.d >= car.proj.d ? -1 : 1;
    const dodge = clamp(o.proj.d + side * 3.4, -(hw - 2), hw - 2);
    const w = clamp(1.2 - front.dsl / 30, 0, 1);
    // the ram-plate driver aims at the car ahead instead of dodging it
    const charge = ai.rammer && ai.ramming && !o.wrecked && ctx.t > 8;
    wantD += ((charge ? clamp(o.proj.d, -(hw - 2), hw - 2) : dodge) - wantD) * w;
    const slow = o.wrecked ? 0 : Math.max(0, o.u);
    if (!charge && front.dsl < 9 && Math.abs(front.gapD) < 2.4) speedCap = Math.max(slow - 2, 0) + front.dsl * 0.8;
  }
  if (hunt) {
    const k = ai.aggression * clamp(1.15 - hunt.dsl / 80, 0.25, 1);
    wantD += (clamp(hunt.o.proj.d, -(hw - 2), hw - 2) - wantD) * k;
    if (hunt.dsl > 12 && hunt.dsl < 55) speedCap = Math.min(speedCap, Math.max(0, hunt.o.u) + 3 + (hunt.dsl - 22) * 0.25);
  }
  if (ctx.t >= ai.nextRoll) {
    ai.nextRoll = ctx.t + 0.45;
    ai.willing = rng() < 0.2 + 0.75 * ai.aggression;
    ai.ramming = ai.aggression > 0.7 && rng() < (ai.rammer ? 0.95 : 0.5) * ai.aggression;
  }
  if (beside && ai.ramming && !beside.o.wrecked) {
    wantD += (beside.o.proj.d - wantD) * 0.7;
  } else if (beside) {
    // keep apart
    const away = beside.gapD > 0 ? -1 : 1;
    wantD += away * clamp(3.6 - Math.abs(beside.gapD), 0, 2.4);
  }
  wantD = clamp(wantD, -(hw - 2.2), hw - 2.2);

  // --- steering (pure pursuit)
  const Ld = 7 + 0.33 * Math.max(0, u);
  const pt = track.pointAt(s0 + Ld);
  const nx = -Math.sin(pt.heading), ny = Math.cos(pt.heading);
  // blend lateral target from current offset-line value at the lookahead point
  const dLook = ai.line.offset[idx(s0 + Ld)] + (wantD - ai.line.offset[idx(s0 + 8)]);
  const tx = pt.x + nx * clamp(dLook, -(hw - 2.2), hw - 2.2);
  const ty = pt.y + ny * clamp(dLook, -(hw - 2.2), hw - 2.2);
  const ex = (tx - car.x) * c + (ty - car.y) * sn;
  const ey = -(tx - car.x) * sn + (ty - car.y) * c;
  const alpha = Math.atan2(ey, Math.max(ex, 0.5));
  const kappa = (2 * Math.sin(alpha)) / Math.max(3, Math.hypot(ex, ey));
  out.steer = clamp(Math.atan(kappa * TUNING.wheelbase) / (TUNING.steerLock * (car.stats.turn ?? 1)), -1, 1);

  // --- speed
  let rubber = 1;
  if (ctx.playerProgress != null && !car.isPlayer) {
    rubber += clamp((ctx.playerProgress - car.progress) / 250, -1, 1) * 0.08;
  }
  const pace = (0.85 + 0.15 * ai.skill) * rubber * (ctx.cruise ?? 1);
  const look = Math.max(0, u) * 0.12;
  let tgt = Math.min(ai.speed[idx(s0 + look)], ai.speed[idx(s0 + look + 8)]);
  tgt = Math.min(tgt * pace, speedCap + 0.0);
  // wall hugging: slow down when far off line
  const e = tgt - u;
  if (e < -0.6) { out.brake = clamp(-e / 5, 0, 1); out.throttle = 0; }
  else out.throttle = clamp(e / 1.5, 0, 1);
  if (Math.abs(car.w) > 4.5) out.throttle *= 0.4;

  // --- combat
  if (ctx.racing && !car.finished && !car.wrecked) combat(car, ctx, out, ai);
  return out;
}

function combat(car, ctx, out, ai) {
  if (!car.weapons.length || !ai.willing || ctx.t < 8) return;   // grid settles before the shooting starts
  const c = Math.cos(car.heading), s = Math.sin(car.heading);
  const have = (id) => car.weapons.findIndex((w) => w.id === id && w.ammo > 0);
  let ahead = null, behind = null;
  for (const o of ctx.cars) {
    if (o === car || o.wrecked) continue;
    const dx = o.x - car.x, dy = o.y - car.y;
    const fx = dx * c + dy * s, ly = -dx * s + dy * c;
    if (fx > 3 && (!ahead || fx < ahead.fx) && Math.abs(ly) < fx * 0.5 + 2) ahead = { o, fx, ly };
    if (fx < -3 && fx > -26 && Math.abs(ly) < 3.5 && (!behind || fx > behind.fx)) behind = { o, fx, ly };
  }
  const choose = (id, ok) => {
    const i = have(id);
    if (i < 0 || !ok) return false;
    const d = getWeapon(id);
    // heavy weapons are rationed so a whole grid is not wiped out in the first lap
    const gap = d.kind === 'hitscan' || d.kind === 'flame' ? 0 : d.guided ? 16 : d.homing > 0 ? 40 : d.id === 'mine' ? 9 : d.kind === 'drop' ? 6 : 10;
    if (gap > 0 && ctx.t - (ai.lastUse[id] ?? 0) < gap * (1.3 - ai.aggression)) return false;
    ai.lastUse[id] = ctx.t;
    out.selectWeapon = i; out.fire = true; return true;
  };
  const fav = ai.favorite;
  const tryWeapon = (id) => {
    const d = getWeapon(id);
    if (!d) return false;
    if (d.kind === 'passive') return false;
    if (d.kind === 'drop') {
      // trap layers drop behind a car that is tailing them; oil wants it closer, mines a bit further back
      const reach = id === 'oil' ? -16 : id === 'mine' ? -26 : -22;
      return !!behind && behind.fx > reach && choose(id, true);
    }
    if (!ahead) return false;
    if (d.kind === 'flame') return ahead.fx < d.range - 1 && Math.abs(ahead.ly) < ahead.fx * Math.tan(d.cone) + 1.2 && choose(id, true);
    const range = d.range || 100;
    if (ahead.fx > range * 0.9) return false;
    if (d.guided) return ahead.fx > 25 && Math.abs(ahead.ly) < ahead.fx * 0.4 + 1.5 && choose(id, true);
    if (d.homing > 0) return ahead.fx > 20 && Math.abs(ahead.ly) < ahead.fx * 0.35 + 1.5 && choose(id, true);
    if (d.kind === 'projectile') return ahead.fx > 14 && Math.abs(ahead.ly) < ahead.fx * 0.1 + 1.6 && choose(id, true);
    return Math.abs(ahead.ly) < ahead.fx * 0.06 + 1.4 && choose(id, true);   // hitscan
  };
  const order = [];
  if (fav) order.push(fav);
  for (const w of car.weapons) if (!order.includes(w.id)) order.push(w.id);
  for (const id of order) if (tryWeapon(id)) return;
}
