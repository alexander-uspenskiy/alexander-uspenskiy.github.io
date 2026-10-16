// 16-colour pixel-art rival portraits generated in code. portraitPixels() is pure (Node-testable).
import { mulberry32 } from './geomUtil.js';
import { PALETTE, COLOR as K } from './paletteRef.js';

export const PORTRAIT_SIZE = 48;

/** -> Uint8Array(48*48) of palette indices. Deterministic from driver.portrait + driver.color/helmet. */
export function portraitPixels(driver, size = PORTRAIT_SIZE) {
  const S = size;
  const px = new Uint8Array(S * S);
  const por = (driver && driver.portrait) || { seed: 0, skin: 15, hair: 4, accent: 8 };
  const rng = mulberry32((por.seed | 0) * 7919 + 13);
  const skin = por.skin ?? K.sand, hair = por.hair ?? K.rust, accent = por.accent ?? K.red;
  const jacket = driver && driver.color != null ? driver.color : accent;
  const helmet = driver && driver.helmet != null ? driver.helmet : K.yellow;
  const shade = skin === K.sand ? K.pink : skin === K.pink ? K.plum : skin === K.lightGrey ? K.lavender : K.black;
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) px[y * S + x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const ell = (cx, cy, rx, ry, c) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, c); };
  const u = S / 48;
  const U = (v) => Math.round(v * u);
  // backdrop: accent-tinted stripes
  const bg = [K.black, K.navy][por.seed & 1];
  rect(0, 0, S - 1, S - 1, bg);
  for (let y = 0; y < S; y += U(4)) rect(0, y, S - 1, y + U(1), K.navy === bg ? K.black : K.navy);
  ell(U(24), U(14), U(15), U(15), accent === K.black ? K.darkGrey : accent); // halo/sun
  ell(U(24), U(14), U(11), U(11), bg);
  // shoulders / jacket
  ell(U(24), U(52), U(22), U(14), jacket);
  rect(U(21), U(36), U(27), U(42), skin); // neck
  rect(U(21), U(36), U(27), U(38), shade);
  rect(U(22), U(40), U(26), U(47), K.white); // collar / shirt
  for (let i = 0; i < U(8); i++) { set(U(22) - 1 - (i >> 1), U(40) + i, jacket); set(U(26) + 1 + (i >> 1), U(40) + i, jacket); }
  rect(U(8), U(46), U(12), U(47), accent); // shoulder badge
  // head
  const fw = U(10) + (rng() * 2 | 0), fh = U(13);
  ell(U(24), U(22), fw, fh, skin);
  ell(U(24), U(28), fw - 1, U(8), skin);
  rect(U(24) - fw, U(26), U(24) - fw + 1, U(30), shade); // side shade
  // hair styles by seed
  const style = ((por.seed | 0) + (por.hair | 0)) % 5;
  if (style === 0) { ell(U(24), U(13), fw + 1, U(7), hair); rect(U(24) - fw - 1, U(13), U(24) - fw + 1, U(24), hair); rect(U(24) + fw - 1, U(13), U(24) + fw + 1, U(24), hair); }
  else if (style === 1) { rect(U(22), U(2), U(26), U(14), hair); rect(U(20), U(8), U(28), U(14), hair); } // mohawk
  else if (style === 2) { ell(U(24), U(12), fw + 1, U(5), hair); }                                          // buzz
  else if (style === 3) { ell(U(24), U(12), fw + 2, U(8), hair); rect(U(24) - fw - 2, U(12), U(24) - fw, U(36), hair); rect(U(24) + fw, U(12), U(24) + fw + 2, U(36), hair); } // long
  else { ell(U(24), U(11), fw + 1, U(6), helmet); rect(U(24) - fw - 1, U(11), U(24) + fw + 1, U(14), helmet); rect(U(24) - fw - 1, U(14), U(24) + fw + 1, U(15), K.black); } // helmet
  // eyes / brows / nose / mouth
  const ey = U(21), ex = U(6);
  const goggles = (por.seed & 1) === 1 && style !== 4;
  if (goggles) { rect(U(24) - ex - 3, ey - 2, U(24) - ex + 3, ey + 2, K.black); rect(U(24) + ex - 3, ey - 2, U(24) + ex + 3, ey + 2, K.black); rect(U(24) - ex + 3, ey, U(24) + ex - 3, ey, K.black); rect(U(24) - ex - 2, ey - 1, U(24) - ex + 2, ey + 1, accent); rect(U(24) + ex - 2, ey - 1, U(24) + ex + 2, ey + 1, accent); }
  else { for (const sx of [-1, 1]) { rect(U(24) + sx * ex - 2, ey - 1, U(24) + sx * ex + 2, ey + 1, K.white); rect(U(24) + sx * ex - 1, ey - 1, U(24) + sx * ex + 1, ey + 1, K.black); rect(U(24) + sx * ex - 3, ey - 4, U(24) + sx * ex + 3, ey - 3, hair === skin ? K.black : hair); } }
  rect(U(24), U(24), U(24) + 1, U(28), shade);
  rect(U(24) - 3, U(29) + 1, U(24) + 3, U(29) + 1, shade);
  const mood = rng();
  if (mood < 0.5) rect(U(24) - 4, U(33), U(24) + 4, U(33), K.black); else { rect(U(24) - 4, U(33), U(24) + 4, U(33), K.black); set(U(24) + 5, U(32), K.black); set(U(24) + 6, U(31), K.black); rect(U(24) - 2, U(34), U(24) + 2, U(34), K.white); }
  // distinguishing marks
  if (rng() < 0.7) { for (let i = 0; i < U(7); i++) set(U(24) + fw - 4 + (i >> 2), U(18) + i, K.red); }              // scar
  if (rng() < 0.4) rect(U(24) - 6, U(35), U(24) + 6, U(37), hair === skin ? K.darkGrey : hair);                    // beard
  if (driver && driver.skill >= 0.99) { rect(U(24) + fw - 3, U(26), U(24) + fw, U(36), K.darkGrey); rect(U(24) + fw - 3, U(30), U(24) + fw, U(30), K.lightGrey); set(U(24) + fw - 2, U(20), K.red); } // cybernetic jaw
  return px;
}

/** drawPortrait(canvasOrCtx, driver): renders the 48x48 palette image scaled with nearest-neighbour to the canvas size. */
export function drawPortrait(target, driver) {
  const ctx = target && target.getContext ? target.getContext('2d') : target;
  if (!ctx) return;
  const cv = ctx.canvas;
  const W = cv ? cv.width : PORTRAIT_SIZE, H = cv ? cv.height : PORTRAIT_SIZE;
  const px = portraitPixels(driver);
  const S = PORTRAIT_SIZE;
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = false;
  const sx = W / S, sy = H / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    ctx.fillStyle = PALETTE[px[y * S + x]];
    ctx.fillRect(Math.floor(x * sx), Math.floor(y * sy), Math.ceil(sx), Math.ceil(sy));
  }
}
