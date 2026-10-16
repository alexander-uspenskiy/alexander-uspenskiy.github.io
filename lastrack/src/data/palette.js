export const PALETTE = [
  '#0b0b14', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
];
export const COLOR = {
  black: 0, navy: 1, plum: 2, green: 3, rust: 4, darkGrey: 5, lightGrey: 6, white: 7,
  red: 8, orange: 9, yellow: 10, lime: 11, sky: 12, lavender: 13, pink: 14, sand: 15,
};
export function paletteHex(i) {
  return PALETTE[((i % 16) + 16) % 16];
}
