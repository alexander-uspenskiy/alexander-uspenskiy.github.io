export const WEAPONS = [
  { id: 'machinegun', name: 'Machine Gun', kind: 'hitscan', price: 800, ammoPrice: 1, ammoPack: 100, maxAmmo: 400,
    damage: 1.5, speed: 0, range: 70, cooldown: 0.1, spread: 0.03, homing: 0, radius: 0, life: 0, slot: 1 },
  { id: 'rocket', name: 'Rocket Launcher', kind: 'projectile', price: 1800, ammoPrice: 12, ammoPack: 10, maxAmmo: 30,
    damage: 24, speed: 90, range: 180, cooldown: 0.8, spread: 0, homing: 0, radius: 6, life: 3, slot: 1 },
  { id: 'guided', name: 'Guided Missile', kind: 'projectile', price: 3400, ammoPrice: 55, ammoPack: 4, maxAmmo: 12,
    damage: 28, speed: 82, range: 200, cooldown: 1.4, spread: 0, homing: 3.4, radius: 7.5, life: 4.5, slot: 1,
    guided: true, lockCone: 0.38, lockRange: 170, lockTime: 0.45 },
  { id: 'caltrops', name: 'Caltrops', kind: 'drop', price: 1000, ammoPrice: 30, ammoPack: 5, maxAmmo: 15,
    damage: 8, speed: 0, range: 0, cooldown: 1.0, spread: 0, homing: 0, radius: 3, life: 20, slot: 1,
    slowTime: 6, gripPenalty: 0.5 },
  { id: 'terminator', name: 'Terminator Missile', kind: 'projectile', price: 6000, ammoPrice: 150, ammoPack: 2, maxAmmo: 6,
    damage: 32, speed: 75, range: 220, cooldown: 2.0, spread: 0, homing: 1.6, radius: 9, life: 4, slot: 2 },
  // --- expansion: kind 'drop' (mine/oil), 'flame' (cone, ammo per tick), 'passive' (ramplate; ammo is a permanent 1)
  { id: 'mine', name: 'Mine', kind: 'drop', price: 1400, ammoPrice: 60, ammoPack: 4, maxAmmo: 12,
    damage: 30, speed: 0, range: 0, cooldown: 1.5, spread: 0, homing: 0, radius: 5, life: 30, slot: 1,
    trigger: 2.2, armTime: 1.0, hazard: 'mine' },
  { id: 'oil', name: 'Oil Slick', kind: 'drop', price: 900, ammoPrice: 25, ammoPack: 5, maxAmmo: 15,
    damage: 0, speed: 0, range: 0, cooldown: 1.2, spread: 0, homing: 0, radius: 3.4, life: 25, slot: 1,
    slowTime: 1.0, gripPenalty: 0.4, hazard: 'oil' },
  { id: 'flamethrower', name: 'Flamethrower', kind: 'flame', price: 2200, ammoPrice: 2, ammoPack: 100, maxAmmo: 300,
    damage: 0.6, speed: 0, range: 14, cooldown: 0.05, spread: 0, homing: 0, radius: 0, life: 0, slot: 1,
    cone: 0.38 },
  { id: 'ramplate', name: 'Ram Plate', kind: 'passive', price: 1500, ammoPrice: 0, ammoPack: 1, maxAmmo: 1,
    damage: 0, speed: 0, range: 0, cooldown: 0, spread: 0, homing: 0, radius: 0, life: 0, slot: 1,
    ramMult: 1.8, ramTaken: 0.75 },
];
export const isPassive = (w) => !!w && w.kind === 'passive';
export function getWeapon(id) {
  return WEAPONS.find((w) => w.id === id) || null;
}
