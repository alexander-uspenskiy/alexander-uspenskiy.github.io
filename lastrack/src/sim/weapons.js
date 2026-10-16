// Per-car weapon handling: ammo, cooldowns, firing. Spawns projectiles/hazards through the sim context.
import { getWeapon } from '../data/weapons.js';
import { rayCar } from './collisions.js';
import { wrapAngle } from '../core/mathUtil.js';

export const DROP_LIFE = 20;

export function initWeapons(car, loadout) {
  car.weapons = (loadout || []).map((w) => ({ id: w.id, ammo: w.ammo }));
  const first = car.weapons.findIndex((w) => getWeapon(w.id)?.kind !== 'passive');
  car.activeWeapon = Math.max(0, first);
  // passive ram plate: damage dealt / taken multipliers for car-car rams
  const plate = car.weapons.map((w) => getWeapon(w.id)).find((d) => d && d.kind === 'passive' && d.ramMult);
  car.ramMult = plate ? plate.ramMult : 1;
  car.ramTaken = plate ? plate.ramTaken ?? 1 : 1;
  car.cooldowns = car.weapons.map(() => 0);
  car.firing = false;
  car.fireHeld = false;
  car.cycleHeld = false;
}

export function hasAmmo(w) { return w && w.ammo > 0; }
const isPassive = (w) => getWeapon(w.id)?.kind === 'passive';

export function cycleWeapon(car) {
  const n = car.weapons.length;
  for (let k = 1; k <= n; k++) {
    const i = (car.activeWeapon + k) % n;
    if (car.weapons[i].ammo > 0 && !isPassive(car.weapons[i])) { car.activeWeapon = i; return; }
  }
}

export function selectWeapon(car, idx) {
  if (Number.isInteger(idx) && idx >= 0 && idx < car.weapons.length) car.activeWeapon = idx;
}

export function tickCooldowns(car, dt) {
  for (let i = 0; i < car.cooldowns.length; i++) if (car.cooldowns[i] > 0) car.cooldowns[i] -= dt;
}

export function addAmmo(car, amount) {
  for (const w of car.weapons) {
    const def = getWeapon(w.id);
    if (!def) continue;
    w.ammo = Math.min(def.maxAmmo ?? w.ammo + amount, w.ammo + (def.ammoPack ?? amount));
  }
}

/**
 * Try to fire the active weapon. ctx = { cars, projectiles (system), hazards, rng, t, emit, damage(victim, amount, byId, weaponId, x, y) }.
 * Returns true if a shot was fired.
 */
export function tryFire(car, ctx) {
  if (car.wrecked || !car.weapons.length) return false;
  let idx = car.activeWeapon;
  if (!hasAmmo(car.weapons[idx]) || isPassive(car.weapons[idx])) { cycleWeapon(car); idx = car.activeWeapon; }
  const slot = car.weapons[idx];
  if (!hasAmmo(slot) || car.cooldowns[idx] > 0) return false;
  const def = getWeapon(slot.id);
  if (!def || def.kind === 'passive') return false;
  slot.ammo -= 1;
  car.cooldowns[idx] = def.cooldown;
  const c = Math.cos(car.heading), s = Math.sin(car.heading);
  const nx = car.x + c * 2.4, ny = car.y + s * 2.4;
  if (def.kind === 'hitscan') {
    const ang = car.heading + (ctx.rng() * 2 - 1) * (def.spread || 0);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const range = def.range || 100;
    let best = null, bd = range;
    for (const o of ctx.cars) {
      if (o === car || (o.wrecked && o.wreckTimer <= 0)) continue;
      const d = rayCar(o, nx, ny, dx, dy, bd);
      if (d >= 0 && d <= bd) { bd = d; best = o; }
    }
    const hx = nx + dx * bd, hy = ny + dy * bd;
    ctx.emit('shot', { carId: car.id, weaponId: def.id, x: nx, y: ny, x2: hx, y2: hy, hit: best ? best.id : null });
    if (best && !best.wrecked) ctx.damage(best, def.damage, car.id, def.id, hx, hy);
  } else if (def.kind === 'projectile') {
    ctx.emit('shot', { carId: car.id, weaponId: def.id, x: nx, y: ny });
    const ang = car.heading + (ctx.rng() * 2 - 1) * (def.spread || 0);
    ctx.projectiles.spawn({ def, owner: car, x: nx, y: ny, heading: ang, carSpeed: Math.max(0, car.u) });
  } else if (def.kind === 'flame') {
    ctx.emit('flame', { carId: car.id, weaponId: def.id, x: nx, y: ny, heading: car.heading, range: def.range, cone: def.cone });
    for (const o of ctx.cars) {
      if (o === car || o.wrecked) continue;
      const dist = Math.hypot(o.x - nx, o.y - ny);
      if (dist - 1.6 > def.range) continue;
      const off = Math.abs(wrapAngle(Math.atan2(o.y - ny, o.x - nx) - car.heading));
      if (off < def.cone + Math.atan2(1.1, Math.max(dist, 1.1))) ctx.damage(o, def.damage, car.id, def.id, o.x, o.y);
    }
  } else if (def.kind === 'drop') {
    ctx.emit('shot', { carId: car.id, weaponId: def.id, x: car.x - c * 3, y: car.y - s * 3 });
    ctx.hazards.drop({ type: def.hazard || 'caltrops', def, owner: car, x: car.x - c * 3, y: car.y - s * 3, heading: car.heading });
  }
  return true;
}
