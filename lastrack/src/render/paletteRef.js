// Palette access for render/. data/palette.js still defines the 16 semantic colour IDS (theme.road, car colours, helmets...),
// but the game no longer LOOKS 16-colour: every index is mapped to a designed full-colour MODERN ramp here.
// PALETTE / PALETTE_RGB stay exported as the legacy retro values (used by the ?style=retro hero art textures only).
import { PALETTE, COLOR, paletteHex } from '../data/palette.js';
export { PALETTE, COLOR, paletteHex };
/** Legacy 16-colour palette as 0..255 rgb triples (retro hero textures). */
export const PALETTE_RGB = PALETTE.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

/**
 * Modern ramp: same 16 semantic slots as data/palette.js (index-stable), richer saturated/graded colours.
 * 0 charcoal asphalt, 1 electric blue, 2 magenta, 3 emerald, 4 burnt orange, 5 steel, 6 light steel, 7 near-white,
 * 8 vivid red, 9 amber, 10 gold, 11 neon green, 12 cyan/sky, 13 violet, 14 hot pink, 15 warm sand.
 */
export const MODERN_HEX = Object.freeze([
  '#161923', '#2a49c2', '#9a2a78', '#12905c', '#b6522b', '#4e5565', '#a9b4c8', '#f3f6fc',
  '#ff2d4b', '#ff9b1f', '#ffd23c', '#3df06d', '#2db8ff', '#8b65ea', '#ff5fa9', '#f1c59d',
]);
/** Modern ramp as 0..255 rgb triples. */
export const MODERN_RGB = Object.freeze(MODERN_HEX.map((h) => Object.freeze([parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)])));
/** palette index (any integer, wraps) -> '#rrggbb' modern colour. */
export function modernHex(i) { return MODERN_HEX[(((i | 0) % 16) + 16) % 16]; }
/** index or '#hex' -> '#rrggbb' modern colour (hex strings pass through). */
export function resolveHex(c) { return typeof c === 'number' ? modernHex(c) : c; }
/** mix two '#rrggbb' colours (t=0 -> a, t=1 -> b). */
export function mixHex(a, b, t) {
  const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t))).toString(16).padStart(2, '0')).join('');
}
