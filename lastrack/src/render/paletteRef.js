// Palette access for render/ (single import point; data/palette.js is the source of truth, §2.1).
import { PALETTE, COLOR, paletteHex } from '../data/palette.js';
export { PALETTE, COLOR, paletteHex };
/** Palette as 0..255 rgb triples. */
export const PALETTE_RGB = PALETTE.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
