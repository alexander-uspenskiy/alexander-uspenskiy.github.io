// Paint presets, accent (underglow / light-strip) colours, default liveries and the field colour-assignment logic. Pure data + functions.
import { getCar } from './cars.js';

/** ~12 modern paint presets. finish = PBR hints for the clearcoat material (metalness / roughness / clearcoat). */
export const PAINTS = [
  { id: 'pearl-white', name: 'Pearl White', hex: 0xf2f0ea, finish: { metalness: 0.3, roughness: 0.25, clearcoat: 1 } },
  { id: 'midnight-blue', name: 'Midnight Blue', hex: 0x112d73, finish: { metalness: 0.7, roughness: 0.25, clearcoat: 1 } },
  { id: 'signal-red', name: 'Signal Red', hex: 0xd1122a, finish: { metalness: 0.55, roughness: 0.3, clearcoat: 1 } },
  { id: 'electric-cyan', name: 'Electric Cyan', hex: 0x19d3ff, finish: { metalness: 0.75, roughness: 0.25, clearcoat: 1 } },
  { id: 'acid-green', name: 'Acid Green', hex: 0x7dff1a, finish: { metalness: 0.6, roughness: 0.3, clearcoat: 1 } },
  { id: 'solar-orange', name: 'Solar Orange', hex: 0xff7a12, finish: { metalness: 0.6, roughness: 0.3, clearcoat: 1 } },
  { id: 'magenta', name: 'Magenta', hex: 0xe0218f, finish: { metalness: 0.6, roughness: 0.28, clearcoat: 1 } },
  { id: 'graphite', name: 'Graphite', hex: 0x3b3f46, finish: { metalness: 0.85, roughness: 0.3, clearcoat: 1 } },
  { id: 'gold', name: 'Gold', hex: 0xd6a62a, finish: { metalness: 1, roughness: 0.22, clearcoat: 0.6 } },
  { id: 'violet', name: 'Violet', hex: 0x7a3cff, finish: { metalness: 0.7, roughness: 0.25, clearcoat: 1 } },
  { id: 'stealth-black', name: 'Stealth Black', hex: 0x0d0d10, finish: { metalness: 0.2, roughness: 0.55, clearcoat: 0.25 } },
  { id: 'chrome', name: 'Chrome', hex: 0xdfe6ee, finish: { metalness: 1, roughness: 0.06, clearcoat: 0 } },
];
export const ACCENTS = [
  { id: 'cyan', name: 'Cyan', hex: 0x35e6ff }, { id: 'magenta', name: 'Magenta', hex: 0xff3df0 }, { id: 'amber', name: 'Amber', hex: 0xffb02e },
  { id: 'lime', name: 'Lime', hex: 0x7dff6a }, { id: 'white', name: 'White', hex: 0xe8f4ff }, { id: 'red', name: 'Red', hex: 0xff3050 },
  { id: 'violet', name: 'Violet', hex: 0xa070ff }, { id: 'ice', name: 'Ice', hex: 0x6aa8ff },
];
export const getPaint = (id) => PAINTS.find((p) => p.id === id) || null;
export const getAccent = (id) => ACCENTS.find((a) => a.id === id) || null;
export const paintHex = (id) => '#' + (getPaint(id) || PAINTS[0]).hex.toString(16).padStart(6, '0');
export const accentHex = (id) => '#' + (getAccent(id) || ACCENTS[0]).hex.toString(16).padStart(6, '0');

/** Stock paint per car (used until the player picks one). */
export const DEFAULT_PAINT = { wasp: 'signal-red', hammer: 'solar-orange', bulwark: 'acid-green' };
export const DEFAULT_ACCENT = 'cyan';
export const isNumberStr = (s) => typeof s === 'string' && /^\d{1,2}$/.test(s);

/** The player's resolved livery from a save: { paint, accent, number, decals, paintHex, accentHex } (hex as 0xRRGGBB numbers). */
export function playerLivery(save) {
  const car = getCar(save.carId);
  const paint = getPaint(save.paint) ? save.paint : DEFAULT_PAINT[car ? car.id : 'hammer'] || 'solar-orange';
  const accent = getAccent(save.accent) ? save.accent : DEFAULT_ACCENT;
  return { paint, accent, number: isNumberStr(save.number) ? save.number : '1', decals: (save.decals || []).map((d) => ({ ...d })), paintHex: getPaint(paint).hex, accentHex: getAccent(accent).hex };
}

/**
 * Resolve the field's liveries so that NO two cars share a paint, including the player's.
 * drivers: [{ id, liveries:[primary, secondary] }] in grid order. Each driver tries the primary paint, then the secondary,
 * then the first preset still free. Returns [{ driverId, paint, accent, number, decals, usedSecondary, fallback, paintHex, accentHex }].
 */
export function resolveFieldLiveries(drivers, playerPaintId) {
  const used = new Set([playerPaintId]);
  return drivers.map((d) => {
    const [a, b] = d.liveries || [];
    let pick = null, which = 0;
    for (const [i, l] of [a, b].entries()) if (l && !used.has(l.paint)) { pick = l; which = i; break; }
    let paint = pick ? pick.paint : null, fallback = false;
    if (!paint) { paint = (PAINTS.find((p) => !used.has(p.id)) || PAINTS[0]).id; fallback = true; }
    used.add(paint);
    const base = pick || a || {};
    const accent = getAccent(base.accent) ? base.accent : DEFAULT_ACCENT;
    return { driverId: d.id, paint, accent, number: isNumberStr(base.number) ? base.number : '00', decals: (base.decals || []).map((x) => ({ ...x })), usedSecondary: which === 1 && !fallback, fallback, paintHex: getPaint(paint).hex, accentHex: getAccent(accent).hex };
  });
}
