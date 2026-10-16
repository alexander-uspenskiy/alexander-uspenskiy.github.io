export const HARBOR = {
  id: 'harbor', name: 'Gulf Harbor', city: 'Houston',
  blurb: 'Dockside straights and chicanes between the cranes. Brake late.',
  laps: 3, prize: 33000, width: 17,
  theme: { ground: 1, road: 0, curb: [10, 5], sky: [12, 13], scenery: 'harbor' },
  control: [[0,0],[350,0],[700,0],[780,-35],[860,10],[940,-25],[1100,-20],[1250,40],[1280,160],[1180,230],[900,230],[820,270],[740,215],[650,250],[400,250],[200,250],[40,260],[-80,210],[-110,110],[-70,30]],
  pickups: [{ s: 0.1, type: 'ammo' }, { s: 0.27, type: 'cash' }, { s: 0.45, type: 'repair' }, { s: 0.62, type: 'ammo' }, { s: 0.78, type: 'cash' }, { s: 0.92, type: 'repair' }],
};
