import { getCar } from './cars.js';
import { getTrack, TRACKS } from './tracks/index.js';
import { DRIVERS, getDriver } from './drivers.js';
import { applyUpgrades } from './upgrades.js';
import { getWeapon } from './weapons.js';
import { defaultSave } from './saveStore.js';

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const FIELD_SIZE = 4;
export const difficulty = (d) => d.skill * 0.65 + d.aggression * 0.35;
/** All drivers, easiest first (stable on ties). */
export const DRIVERS_BY_DIFFICULTY = [...DRIVERS].map((d, i) => ({ d, i })).sort((a, b) => difficulty(a.d) - difficulty(b.d) || a.i - b.i).map((x) => x.d);

/**
 * The 4 rivals on a track: a window over the drivers sorted by difficulty that slides from the easiest four (first track)
 * to the hardest four (last track). Returned in grid order, hardest on pole. Deterministic.
 */
export function fieldFor(trackId, trackIndex, trackCount = TRACKS.length) {
  let idx = Number.isInteger(trackIndex) ? trackIndex : TRACKS.findIndex((t) => t.id === trackId);
  idx = Math.max(0, idx);
  const spare = Math.max(0, DRIVERS_BY_DIFFICULTY.length - FIELD_SIZE);
  const start = trackCount > 1 ? Math.min(spare, Math.round((Math.min(idx, trackCount - 1) * spare) / (trackCount - 1))) : 0;
  return DRIVERS_BY_DIFFICULTY.slice(start, start + FIELD_SIZE).reverse().map((d) => d.id);
}
/** Track ids (in TRACKS order) on which a driver races. */
export function tracksFor(driverId) {
  return TRACKS.filter((t, i) => fieldFor(t.id, i).includes(driverId)).map((t) => t.id);
}

/**
 * RaceConfig per ARCHITECTURE §3. Extras: rivals[] also carry { carId, name, color, helmet }; player carries { color }.
 * Race mode defaults to fieldFor(track); practice defaults to none (pass rivalIds to override either).
 */
export function createRaceConfig({ mode = 'race', trackId, laps, save, rivalIds, seed } = {}) {
  const sv = save || defaultSave();
  const track = getTrack(trackId) || getTrack('scrapyard');
  const car = getCar(sv.carId) || getCar('wasp');
  const stats = applyUpgrades(car.base, sv.upgrades);
  const practice = mode === 'practice';
  const loadout = sv.weapons.filter((w) => getWeapon(w.id)).map((w) => ({ id: w.id, ammo: w.ammo }));
  const ids = (rivalIds ?? (practice ? [] : fieldFor(track.id))).filter((id) => getDriver(id));
  const rivals = ids.map((id) => {
    const d = getDriver(id);
    const rc = getCar(d.carId);
    return {
      driverId: d.id, carId: d.carId, name: d.name, color: d.color, helmet: d.helmet,
      stats: applyUpgrades(rc.base, d.upgrades), loadout: d.loadout.map((w) => ({ ...w })),
      skill: d.skill, aggression: d.aggression, favoriteWeapon: d.favoriteWeapon,
    };
  });
  return {
    mode: practice ? 'practice' : 'race',
    trackId: track.id,
    laps: Number.isInteger(laps) && laps > 0 ? laps : track.laps,
    seed: seed ?? (hashStr(`${track.id}:${sv.races}:${sv.carId}`) >>> 0),
    player: {
      carId: car.id, color: car.color, stats,
      armor: practice ? stats.armor : Math.max(1, Math.round(stats.armor * (1 - sv.damage))),
      loadout,
    },
    rivals,
  };
}
