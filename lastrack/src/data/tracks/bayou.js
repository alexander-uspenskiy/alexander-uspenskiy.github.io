export const BAYOU = {
  id: 'bayou', name: 'Bayou Bloodbath', city: 'New Orleans',
  blurb: 'Slick switchbacks through the swamp. Gators watch, rivals ram.',
  laps: 3, prize: 12000, width: 14,
  theme: { ground: 3, road: 0, curb: [3, 7], sky: [11, 1], scenery: 'swamp' },
  control: [[0,0],[100,-10],[190,20],[240,90],[200,160],[120,170],[90,230],[130,300],[210,330],[260,400],[200,470],[110,450],[60,390],[-20,360],[-90,400],[-150,350],[-130,270],[-60,230],[-70,150],[-120,90],[-70,30]],
  pickups: [{ s: 0.1, type: 'ammo' }, { s: 0.27, type: 'cash' }, { s: 0.45, type: 'repair' }, { s: 0.62, type: 'ammo' }, { s: 0.78, type: 'cash' }, { s: 0.92, type: 'repair' }],
};
