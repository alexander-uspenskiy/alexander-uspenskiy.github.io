export const RUSTBELT = {
  id: 'rustbelt', name: 'Rustbelt Rumble', city: 'Pittsburgh',
  blurb: 'Furnaces, bridges and hairpins. Steel city, steel nerves.',
  laps: 3, prize: 29000, width: 14,
  theme: { ground: 5, road: 0, curb: [9, 4], sky: [9, 4], scenery: 'industrial' },
  control: [[0,0],[200,0],[330,-20],[400,40],[380,120],[300,150],[200,130],[130,180],[160,250],[260,280],[380,270],[450,330],[430,420],[320,450],[180,430],[60,400],[-40,340],[-60,250],[-120,180],[-110,90],[-60,30]],
  pickups: [{ s: 0.1, type: 'ammo' }, { s: 0.27, type: 'cash' }, { s: 0.45, type: 'repair' }, { s: 0.62, type: 'ammo' }, { s: 0.78, type: 'cash' }, { s: 0.92, type: 'repair' }],
};
