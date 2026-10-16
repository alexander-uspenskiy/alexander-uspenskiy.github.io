// Pure, immutable economy functions. Every purchase returns { ok, save, error? } (save unchanged on failure).
import { getCar } from './cars.js';
import { getWeapon } from './weapons.js';
import { UPGRADES, getUpgrade, upgradeCost, applyUpgrades } from './upgrades.js';
import { TRACKS, getTrack } from './tracks/index.js';

export const STARTING_CASH = 5000;
export const KILL_BONUS = 500;
export const killBonus = KILL_BONUS;
export const REPAIR_COST_PER_ARMOR = 6;
export const WEAPON_SELL_RATIO = 0.5;
export const PRIZE_SHARES = [1, 0.6, 0.35, 0.15, 0.05];

/** Prize money for a 1-based finishing position (wrecked/unclassified players still get their position's share). */
export function prizeFor(position, nCars = 5, trackPrize = 4000) {
  if (!Number.isInteger(position) || position < 1 || position > nCars) return 0;
  const share = PRIZE_SHARES[position - 1] ?? 0;
  return Math.round(trackPrize * share);
}
/** Repair bill for `damageFraction` (0..1) of an armor pool of `armorMax`. */
export function repairCost(damageFraction, armorMax) {
  const f = Math.min(1, Math.max(0, Number(damageFraction) || 0));
  return Math.round(f * armorMax * REPAIR_COST_PER_ARMOR);
}
export function playerArmorMax(save) {
  const car = getCar(save.carId);
  return car ? applyUpgrades(car.base, save.upgrades).armor : 0;
}
export function slotsUsed(save) {
  return save.weapons.reduce((n, w) => n + (getWeapon(w.id)?.slot ?? 0), 0);
}

const fail = (save, error) => ({ ok: false, save, error });

export function purchaseUpgrade(save, id) {
  const u = getUpgrade(id);
  if (!u) return fail(save, 'unknown-upgrade');
  const next = (save.upgrades[id] || 0) + 1;
  if (next > u.maxLevel) return fail(save, 'max-level');
  const cost = upgradeCost(id, next);
  if (save.cash < cost) return fail(save, 'insufficient-cash');
  return { ok: true, cost, save: { ...save, cash: save.cash - cost, upgrades: { ...save.upgrades, [id]: next } } };
}

export function purchaseWeapon(save, id) {
  const w = getWeapon(id);
  if (!w) return fail(save, 'unknown-weapon');
  if (save.weapons.some((x) => x.id === id)) return fail(save, 'already-owned');
  const car = getCar(save.carId);
  if (!car || slotsUsed(save) + w.slot > car.base.slots) return fail(save, 'no-slots');
  if (save.cash < w.price) return fail(save, 'insufficient-cash');
  return { ok: true, cost: w.price, save: { ...save, cash: save.cash - w.price, weapons: [...save.weapons, { id, ammo: w.ammoPack }] } };
}

/** Sell an owned weapon for half price (frees its slot). */
export function sellWeapon(save, id) {
  const w = getWeapon(id);
  if (!w || !save.weapons.some((x) => x.id === id)) return fail(save, 'not-owned');
  const refund = Math.round(w.price * WEAPON_SELL_RATIO);
  return { ok: true, save: { ...save, cash: save.cash + refund, weapons: save.weapons.filter((x) => x.id !== id) } };
}

/** Buy n units of ammo (clamped to maxAmmo). */
export function buyAmmo(save, weaponId, n) {
  const w = getWeapon(weaponId);
  if (!w) return fail(save, 'unknown-weapon');
  const idx = save.weapons.findIndex((x) => x.id === weaponId);
  if (idx < 0) return fail(save, 'not-owned');
  const want = Math.floor(Number(n));
  if (!(want > 0)) return fail(save, 'bad-amount');
  const room = w.maxAmmo - save.weapons[idx].ammo;
  const units = Math.min(want, room);
  if (units <= 0) return fail(save, 'ammo-full');
  const cost = units * w.ammoPrice;
  if (save.cash < cost) return fail(save, 'insufficient-cash');
  const weapons = save.weapons.map((x, i) => (i === idx ? { ...x, ammo: x.ammo + units } : x));
  return { ok: true, cost, units, save: { ...save, cash: save.cash - cost, weapons } };
}

export function repairCar(save) {
  if (!(save.damage > 0)) return fail(save, 'nothing-to-repair');
  const cost = repairCost(save.damage, playerArmorMax(save));
  if (save.cash < cost) return fail(save, 'insufficient-cash');
  return { ok: true, cost, save: { ...save, cash: save.cash - cost, damage: 0 } };
}

/** New game / swap car: resets upgrades, damage and weapons to the car's starting kit (cash kept). */
export function chooseCar(save, carId) {
  const car = getCar(carId);
  if (!car) return fail(save, 'unknown-car');
  return { ok: true, save: { ...save, carId, upgrades: { armor: 0, engine: 0, tyres: 0 }, damage: 0, weapons: car.startWeapons.map((w) => ({ ...w })) } };
}

/**
 * Apply a finished RaceResult to the save (race mode: prize, kill bonus, damage, ammo, stats, best time, unlock;
 * practice mode: only best time is NOT recorded and nothing changes).
 * Returns { save, prize, killBonus, total, unlockedTrack|null }.
 */
export function applyRaceResult(save, result, { mode = 'race', nCars = result?.finishOrder?.length ?? 5 } = {}) {
  if (mode !== 'race' || !result) return { save, prize: 0, killBonus: 0, total: 0, unlockedTrack: null };
  const track = getTrack(result.trackId);
  const p = result.player;
  const prize = prizeFor(p.position, nCars, track ? track.prize : 4000);
  const bonus = (p.kills || 0) * KILL_BONUS;
  const best = { ...save.bestTimes };
  if (p.time != null && (best[result.trackId] == null || p.time < best[result.trackId])) best[result.trackId] = p.time;
  let unlocked = [...save.unlockedTracks];
  let unlockedTrack = null;
  if (p.position === 1 && track) {
    const next = TRACKS[TRACKS.indexOf(track) + 1];
    if (next && !unlocked.includes(next.id)) { unlocked.push(next.id); unlockedTrack = next.id; }
  }
  const ammoMap = new Map((p.ammoLeft || []).map((a) => [a.id, a.ammo]));
  const out = {
    ...save,
    cash: save.cash + prize + bonus,
    damage: Math.min(1, Math.max(0, p.damageFraction || 0)),
    weapons: save.weapons.map((w) => ({ ...w, ammo: ammoMap.has(w.id) ? ammoMap.get(w.id) : w.ammo })),
    wins: save.wins + (p.position === 1 ? 1 : 0),
    races: save.races + 1,
    kills: save.kills + (p.kills || 0),
    bestTimes: best,
    unlockedTracks: unlocked,
  };
  return { save: out, prize, killBonus: bonus, total: prize + bonus, unlockedTrack };
}
