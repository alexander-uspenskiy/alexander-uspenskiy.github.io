export const LAKESHORE = {
  id: 'lakeshore', name: 'Lakeshore Drive', city: 'Chicago',
  blurb: 'The Windy City bites. Flat-out along the lake, then through the grid.',
  laps: 3, prize: 16000, width: 16,
  theme: { ground: 1, road: 0, curb: [13, 7], sky: [12, 13], scenery: 'city' },
  control: [[0,0],[300,0],[600,0],[850,30],[950,120],[940,250],[850,320],[700,330],[600,390],[480,450],[330,440],[250,370],[130,340],[0,360],[-110,320],[-160,220],[-120,110],[-60,40]],
  pickups: [{ s: 0.1, type: 'ammo' }, { s: 0.27, type: 'cash' }, { s: 0.45, type: 'repair' }, { s: 0.62, type: 'ammo' }, { s: 0.78, type: 'cash' }, { s: 0.92, type: 'repair' }],
};
