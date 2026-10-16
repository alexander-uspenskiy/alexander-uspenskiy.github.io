// Palette index (data files) -> modern UI hex colour. Uses the render side's modern ramp when present.
import * as P from '../render/paletteRef.js';

const FALLBACK = ['#0b1020', '#2b4cff', '#b02fd1', '#16c784', '#d9622b', '#6b7a90', '#b8c4d6', '#f1f6ff', '#ff3b5c', '#ff9d2e', '#ffd84a', '#5dff9d', '#35b6ff', '#8a7bff', '#ff6fb1', '#ffc9a8'];
export const uiHex = (i) => { const t = P.MODERN_HEX || FALLBACK; return t[((i % 16) + 16) % 16]; };
