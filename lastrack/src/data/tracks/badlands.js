export const BADLANDS = {
  id: 'badlands', name: 'Badlands Blitz', city: 'South Dakota',
  blurb: 'Dusk over the rocks. Huge sweepers, no mercy, no witnesses.',
  laps: 3, prize: 20000, width: 18,
  theme: { ground: 2, road: 0, curb: [4, 15], sky: [9, 2], scenery: 'rocky' },
  control: [[0,0],[300,-30],[600,-20],[850,60],[1000,200],[1050,380],[950,550],[760,640],[540,600],[400,480],[250,430],[80,470],[-120,440],[-260,330],[-280,170],[-190,50]],
  pickups: [{ s: 0.1, type: 'ammo' }, { s: 0.27, type: 'cash' }, { s: 0.45, type: 'repair' }, { s: 0.62, type: 'ammo' }, { s: 0.78, type: 'cash' }, { s: 0.92, type: 'repair' }],
};
