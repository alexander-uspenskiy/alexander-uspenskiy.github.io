// Hero-slice race setup: the player's Hammer vs four enemy Hammers on the Neon Loop. Pure data (no three).
import { createRaceConfig } from './raceConfig.js';
import { getCar } from './cars.js';
import { getDriver } from './drivers.js';
import { applyUpgrades } from './upgrades.js';

export const SLICE_TRACK_ID = 'neonloop';
export const SLICE_LAPS = 3;
/** Enemy field (grid order is set by createRaceConfig): name -> livery palette index (player's Hammer is orange 9). */
export const SLICE_FIELD = [
  { id: 'vex', color: 12, number: '07' },     // fast, aggressive, machine gun
  { id: 'fuse', color: 11, number: '33' },    // precise, rockets
  { id: 'kane', color: 2, number: '66' },     // champion, terminator missile + ramming
  { id: 'cinder', color: 8, number: '13' },   // brawler, flamethrower
];

export function createSliceConfig({ save, seed, laps = SLICE_LAPS, field = SLICE_FIELD } = {}) {
  const cfg = createRaceConfig({ mode: 'race', trackId: SLICE_TRACK_ID, laps, save, seed, rivalIds: field.map((f) => f.id) });
  cfg.rivals = cfg.rivals.map((r) => {
    const f = field.find((x) => x.id === r.driverId), d = getDriver(r.driverId);
    return { ...r, carId: 'hammer', color: f ? f.color : r.color, number: f ? f.number : '00', stats: applyUpgrades(getCar('hammer').base, d.upgrades), hunt: true };
  });
  cfg.slice = true;
  return cfg;
}
