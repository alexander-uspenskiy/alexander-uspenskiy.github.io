// Slice-only short circuit: "Neon Loop" — Detroit ruins at dusk. ~1 km: long straight, fast sweeper, hairpin, back leg with a chicane.
// Not in TRACKS (the normal game never lists it); resolved by getTrack() via SLICE_TRACKS.
const RAW = [
  [140, 0], [220, 0], [300, 0], [380, 0],
  [432, 10], [470, 42], [488, 92], [490, 140], [490, 190],        // fast sweeper to the south
  [484, 232], [455, 258], [420, 250], [402, 215],                 // hairpin
  [400, 175], [378, 140], [335, 122], [285, 118],                 // back to the west
  [240, 130], [200, 112], [160, 126],                             // chicane
  [110, 126], [60, 105], [20, 70], [10, 30], [40, 6], [90, 0],    // final sweep onto the straight
];
export const NEON_LOOP = {
  id: 'neonloop', name: 'Neon Loop', city: 'Detroit',
  blurb: 'A short, wet, neon-lit circuit through the ruins. One long straight, one nasty hairpin.',
  laps: 3, prize: 4000, width: 16,
  theme: { ground: 5, road: 0, curb: [8, 7], sky: [12, 1], scenery: 'junk' },
  control: RAW.map(([x, y]) => [x * 0.88, y * 0.88]),
  pickups: [{ s: 0.2, type: 'ammo' }, { s: 0.5, type: 'repair' }, { s: 0.8, type: 'ammo' }],
  // surface zones (sim/surfaces.js): wet patches and an oil slick
  surfaces: {
    oil: [{ s: 0.42, d: -4.5, r: 2.6 }],
    puddles: [{ s: 0.1, d: 3.5, r: 3.2 }, { s: 0.3, d: -3, r: 3.4 }, { s: 0.55, d: 2.5, r: 3 }, { s: 0.7, d: -3.2, r: 3.2 }, { s: 0.9, d: 3, r: 3.2 }],
    dirt: [],
  },
};
/** Foundry Run: the Neon Loop's mirror image, stretched (left-hand hairpin, reversed chicane) with a hotter, industrial look. */
export const FOUNDRY_RUN = {
  id: 'foundry', name: 'Foundry Run', city: 'Detroit',
  blurb: 'Left-handers through a dead steelworks. Hot light, long shadows, a hairpin that bites.',
  laps: 3, prize: 6000, width: 16,
  theme: { ground: 5, road: 0, curb: [9, 7], sky: [9, 2], scenery: 'junk' },
  look: { fog: 0x3c2218, fogDensity: 0.0056, key: 0xff8a4a, keyIntensity: 1.7, bgIntensity: 0.32, seed: 191 },
  control: RAW.map(([x, y]) => [y * 1.12, x * 1.12]),
  pickups: [{ s: 0.15, type: 'ammo' }, { s: 0.4, type: 'repair' }, { s: 0.65, type: 'cash' }, { s: 0.85, type: 'ammo' }],
  surfaces: {
    oil: [{ s: 0.3, d: 4.6, r: 2.6 }, { s: 0.74, d: -4.2, r: 2.5 }],
    puddles: [{ s: 0.08, d: -3, r: 3.2 }, { s: 0.22, d: 3.2, r: 3.3 }, { s: 0.47, d: -2.6, r: 3 }, { s: 0.6, d: 3, r: 3.2 }, { s: 0.92, d: -3.4, r: 3 }],
    dirt: [],
  },
};
export const SLICE_TRACKS = [NEON_LOOP, FOUNDRY_RUN];
/** The tracks of the game, in unlock order. */
export const GAME_TRACKS = SLICE_TRACKS;
