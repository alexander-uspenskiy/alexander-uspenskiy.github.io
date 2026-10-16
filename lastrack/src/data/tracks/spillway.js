export const SPILLWAY = {
  id: 'spillway', name: 'Spillway Run', city: 'Los Angeles',
  blurb: 'Race the concrete flood channel. Long, fast and unforgiving.',
  laps: 3, prize: 25000, width: 18,
  theme: { ground: 6, road: 0, curb: [6, 7], sky: [12, 6], scenery: 'canal' },
  control: [[0,0],[500,0],[1000,0],[1400,10],[1600,100],[1620,250],[1500,340],[1200,330],[900,300],[600,340],[400,430],[200,470],[-50,440],[-200,350],[-230,200],[-150,60]].map(([x, y]) => [x * 0.86, y * 0.86]),
  pickups: [{ s: 0.1, type: 'ammo' }, { s: 0.27, type: 'cash' }, { s: 0.45, type: 'repair' }, { s: 0.62, type: 'ammo' }, { s: 0.78, type: 'cash' }, { s: 0.86, type: 'repair' }],
};
