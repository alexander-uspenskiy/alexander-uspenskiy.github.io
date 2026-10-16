import { getCar } from './cars.js';

export const MAX_LEVEL = 3;
export const UPGRADES = [
  { id: 'armor', name: 'Armor Plating', blurb: '+25% armor per level', maxLevel: 3, costs: [1200, 2800, 5500] },
  { id: 'engine', name: 'Engine Tune', blurb: '+8% top speed & acceleration per level', maxLevel: 3, costs: [1200, 2800, 5500] },
  { id: 'tyres', name: 'Racing Tyres', blurb: '+10% grip & turn-in per level', maxLevel: 3, costs: [1200, 2800, 5500] },
];
export function getUpgrade(id) {
  return UPGRADES.find((u) => u.id === id) || null;
}
/** Cost of buying `level` (1-based: the level you would buy). null if invalid / above max. */
export function upgradeCost(id, level) {
  const u = getUpgrade(id);
  if (!u || !Number.isInteger(level) || level < 1 || level > u.maxLevel) return null;
  return u.costs[level - 1];
}
/** Returns new stats (same keys as base, plus armorMax === armor). */
export function applyUpgrades(carBase, levels = {}) {
  const a = levels.armor || 0, e = levels.engine || 0, t = levels.tyres || 0;
  const armor = Math.round(carBase.armor * (1 + 0.25 * a));
  return {
    ...carBase,
    armor,
    armorMax: armor,
    maxSpeed: carBase.maxSpeed * (1 + 0.08 * e),
    accel: carBase.accel * (1 + 0.08 * e),
    grip: carBase.grip * (1 + 0.1 * t),
    turn: carBase.turn * (1 + 0.1 * t),
  };
}
export function statsForCar(carId, levels) {
  return applyUpgrades(getCar(carId).base, levels);
}
