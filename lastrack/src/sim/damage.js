// Armor pool, wreck state and tyre status. Operates on car objects owned by raceSim.
export const WRECK_LIFETIME = 5;     // s a wreck stays as an obstacle
export const TYRE_POP_TIME = 6;      // s
export const OIL_GRIP = 0.4;       // grip multiplier while on / just off an oil slick
export const SMOKE_FRAC = 0.3;
export const BURN_FRAC = 0.15;

export function initDamage(car, armorMax, armor) {
  car.armorMax = armorMax;
  car.armor = Math.max(1, Math.min(armor ?? armorMax, armorMax));
  car.wrecked = false;
  car.wreckTimer = 0;
  car.tyreTimer = 0;
  car.oilTimer = 0;
  car.lastHitBy = null;
  car.lastHitT = -99;
  car.dmgMap = [0, 0, 0, 0];   // accumulated damage per zone 0..1: front, right, rear, left
}

/** Pure: which car zone (0 front, 1 right, 2 rear, 3 left) a world point (x,y) hits. */
export function damageZone(car, x, y) {
  let a = Math.atan2(y - car.y, x - car.x) - car.heading;
  a -= Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
  if (Math.abs(a) <= Math.PI / 4) return 0;
  if (Math.abs(a) >= (3 * Math.PI) / 4) return 2;
  return a > 0 ? 1 : 3;
}

/** Accumulate zone damage (used for dents, panels and the HUD diagram). */
export function addZoneDamage(car, zone, amount) {
  if (!car.dmgMap) car.dmgMap = [0, 0, 0, 0];
  const k = car.armorMax > 0 ? amount / car.armorMax : 0;
  car.dmgMap[zone] = Math.min(1, car.dmgMap[zone] + k * 2.4);
}

/** Pure: damage stage for rendering: 0 pristine, 1 dented, 2 smoking (panels missing), 3 burning, 4 wrecked. */
export function damageStage(frac, wrecked) {
  if (wrecked) return 4;
  if (frac < BURN_FRAC) return 3;
  if (frac < SMOKE_FRAC) return 2;
  if (frac < 0.7) return 1;
  return 0;
}

export const isSmoking = (car) => !car.wrecked && car.armor / car.armorMax < SMOKE_FRAC;
export const isBurning = (car) => !car.wrecked && car.armor / car.armorMax < BURN_FRAC;

/**
 * Apply damage. Returns true if this hit destroyed the car.
 * `byId` (car index or null) gets kill credit; self-inflicted damage gives none.
 */
export function applyDamage(car, amount, byId, t) {
  if (car.wrecked || amount <= 0) return false;
  car.armor -= amount;
  if (byId !== null && byId !== undefined && byId !== car.id) { car.lastHitBy = byId; car.lastHitT = t; }
  if (car.armor <= 0) {
    car.armor = 0;
    car.wrecked = true;
    car.wreckTimer = WRECK_LIFETIME;
    return true;
  }
  return false;
}

export function popTyres(car, duration = TYRE_POP_TIME) {
  car.tyreTimer = Math.max(car.tyreTimer, duration);
}

export function updateDamage(car, dt) {
  if (car.oilTimer > 0) car.oilTimer = Math.max(0, car.oilTimer - dt);
  if (car.tyreTimer > 0) car.tyreTimer = Math.max(0, car.tyreTimer - dt);
  if (car.wrecked && car.wreckTimer > 0) car.wreckTimer = Math.max(0, car.wreckTimer - dt);
}

/** Physics modifiers from damage state. */
export function damageMods(car) {
  const popped = car.tyreTimer > 0;
  const m = damageHandling(car.armorMax > 0 ? car.armor / car.armorMax : 1, car.id);
  return {
    gripMult: (popped ? 0.5 : 1) * (car.oilTimer > 0 ? OIL_GRIP : 1) * m.grip,
    speedMult: (popped ? 0.7 : 1) * m.top, accelMult: m.accel, pull: m.pull,
  };
}

/**
 * Handling penalties from the armor fraction (pure): below 60 % the car pulls to one side (bent steering),
 * below 50 % the engine loses power, below 25 % tyres/suspension are mangled too. id picks the pull direction.
 */
export function damageHandling(frac, id = 0) {
  const f = Math.max(0, Math.min(1, frac));
  const dir = (id | 0) % 2 === 0 ? 1 : -1;
  return {
    pull: f < 0.6 ? dir * (0.6 - f) * 0.07 : 0,
    accel: f < 0.5 ? 0.8 + 0.4 * f : 1,
    top: f < 0.35 ? 0.93 + 0.2 * f : 1,
    grip: f < 0.25 ? 0.88 + 0.48 * f : 1,
  };
}

export function repair(car, amount) {
  if (car.wrecked) return;
  car.armor = Math.min(car.armorMax, car.armor + amount);
}
