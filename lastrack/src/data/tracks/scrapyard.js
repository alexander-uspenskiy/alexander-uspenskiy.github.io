export const SCRAPYARD = {
  id: 'scrapyard', name: 'Detroit Scrapyard', city: 'Detroit',
  blurb: 'Tight turns between towers of crushed wrecks. Nobody leaves clean.',
  laps: 3, prize: 4000, width: 16,
  theme: { ground: 5, road: 0, curb: [8, 7], sky: [12, 1], scenery: 'junk' },
  control: [[0,0],[120,-10],[240,0],[330,40],[380,110],[350,180],[270,200],[230,260],[260,330],[200,380],[110,360],[60,300],[100,240],[40,190],[-40,200],[-100,150],[-90,70],[-40,20]].map(([x, y]) => [x * 1.15, y * 1.15]),
  // surface zones used by sim/surfaces.js (s = lap fraction, d = metres + right): oil slicks, puddles, dirt shoulders
  surfaces: {
    oil: [{ s: 0.115, d: -5.2, r: 2.6 }, { s: 0.335, d: 5.0, r: 2.4 }, { s: 0.585, d: -4.6, r: 2.8 }, { s: 0.815, d: 5.4, r: 2.4 }],
    puddles: [{ s: 0.2, d: 1.5, r: 3.4 }, { s: 0.455, d: -2.8, r: 3 }, { s: 0.69, d: 2.4, r: 3.4 }, { s: 0.955, d: -1.8, r: 3 }],
    dirt: [{ s0: 0.06, s1: 0.1, side: 1 }, { s0: 0.52, s1: 0.57, side: -1 }, { s0: 0.76, s1: 0.8, side: 1 }],
  },
  pickups: [{ s: 0.12, type: 'ammo' }, { s: 0.3, type: 'cash' }, { s: 0.5, type: 'repair' }, { s: 0.72, type: 'ammo' }, { s: 0.9, type: 'cash' }],
};
