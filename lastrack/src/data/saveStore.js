// Versioned save over an injectable storage adapter. Never throws on corrupt/missing data.
import { getDefaultStorage } from '../core/storage.js';
import { clamp } from '../core/mathUtil.js';
import { STARTING_CASH } from './economy.js';
import { CARS, getCar } from './cars.js';
import { getWeapon } from './weapons.js';
import { MAX_LEVEL } from './upgrades.js';
import { TRACKS } from './tracks/index.js';

export const SAVE_KEY = 'lasttrack.save.v1';
export const SAVE_VERSION = 1;
const MAX_CASH = 999_999_999;
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const num = (v, d) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : d;
};

export function defaultSave() {
  const car = CARS[0];
  return {
    version: SAVE_VERSION,
    cash: STARTING_CASH,
    carId: car.id,
    upgrades: { armor: 0, engine: 0, tyres: 0 },
    damage: 0,
    weapons: car.startWeapons.map((w) => ({ ...w })),
    wins: 0,
    races: 0,
    kills: 0,
    bestTimes: {},
    unlockedTracks: [TRACKS[0].id],
  };
}

export function normalizeSave(input) {
  const d = defaultSave();
  if (!isObj(input)) return d;
  d.cash = clamp(Math.floor(num(input.cash, d.cash)), 0, MAX_CASH);
  if (getCar(input.carId)) d.carId = input.carId;
  const car = getCar(d.carId);
  if (isObj(input.upgrades)) for (const k of Object.keys(d.upgrades)) d.upgrades[k] = clamp(Math.floor(num(input.upgrades[k], 0)), 0, MAX_LEVEL);
  d.damage = clamp(num(input.damage, 0), 0, 1);
  if (Array.isArray(input.weapons)) {
    const seen = new Set();
    const ws = [];
    let slots = 0;
    for (const w of input.weapons) {
      const def = isObj(w) ? getWeapon(w.id) : null;
      if (!def || seen.has(def.id) || slots + def.slot > car.base.slots) continue;
      seen.add(def.id);
      slots += def.slot;
      ws.push({ id: def.id, ammo: clamp(Math.floor(num(w.ammo, 0)), 0, def.maxAmmo) });
    }
    d.weapons = ws;
  } else {
    d.weapons = car.startWeapons.map((w) => ({ ...w }));
  }
  d.wins = clamp(Math.floor(num(input.wins, 0)), 0, MAX_CASH);
  d.races = clamp(Math.floor(num(input.races, 0)), 0, MAX_CASH);
  d.kills = clamp(Math.floor(num(input.kills, 0)), 0, MAX_CASH);
  if (isObj(input.bestTimes)) {
    for (const t of TRACKS) {
      const v = num(input.bestTimes[t.id], NaN);
      if (Number.isFinite(v) && v > 0) d.bestTimes[t.id] = v;
    }
  }
  if (Array.isArray(input.unlockedTracks)) {
    const ids = TRACKS.map((t) => t.id).filter((id) => id === TRACKS[0].id || input.unlockedTracks.includes(id));
    d.unlockedTracks = ids;
  }
  return d;
}

export function createSaveStore(storage = getDefaultStorage()) {
  return {
    load() {
      let text = null;
      try { text = storage.getItem(SAVE_KEY); } catch { text = null; }
      if (text == null) return defaultSave();
      try {
        return normalizeSave(JSON.parse(text));
      } catch {
        try { storage.setItem(SAVE_KEY + '.corrupt', text); } catch { /* ignore */ }
        return defaultSave();
      }
    },
    save(s) {
      const clean = normalizeSave(s);
      try { storage.setItem(SAVE_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
      return clean;
    },
    reset() {
      try { storage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      return defaultSave();
    },
    /** true if a stored save exists (for the Continue button). */
    exists() {
      try { return storage.getItem(SAVE_KEY) != null; } catch { return false; }
    },
  };
}
