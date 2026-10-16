// Pure helpers for choosing and dressing the enemy field. No three, no DOM.
import { DRIVERS } from './drivers.js';
import { mulberry32 } from '../core/mathUtil.js';
export { DRIVERS };
const diff = (d) => d.skill * 0.65 + d.aggression * 0.35;
export const DRIVERS_BY_DIFFICULTY_IDS = [...DRIVERS].sort((a, b) => diff(a) - diff(b)).map((d) => d.id);

/** Seeded pick of n distinct drivers; at least two different car types; returned hardest-first (pole position first). */
export function pickDrivers(seed, n = 5) {
  const r = mulberry32((seed >>> 0) ^ 0x51ed);
  for (let attempt = 0; attempt < 24; attempt++) {
    const pool = [...DRIVERS];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const pick = pool.slice(0, Math.min(n, pool.length));
    if (new Set(pick.map((d) => d.carId)).size >= Math.min(3, new Set(DRIVERS.map((d) => d.carId)).size) || attempt === 23) {
      return pick.sort((a, b) => diff(b) - diff(a)).map((d) => d.id);
    }
  }
  return DRIVERS.slice(0, n).map((d) => d.id);
}

/** Pure: give every rival a livery colour that differs from the player's and from each other (keeps the driver's own when free). */
export function assignLiveries(preferred, playerColor, pool) {
  const used = new Set([playerColor]), out = [];
  for (const c of preferred) {
    let col = c;
    if (used.has(col)) col = pool.find((x) => !used.has(x)) ?? col;
    used.add(col); out.push(col);
  }
  return out;
}
