export const LIBERTY = {
  id: 'liberty', name: 'Liberty Deathtrack', city: 'New York',
  blurb: 'The final circuit. Four laps under the skyline. Only one gets out.',
  laps: 4, prize: 40000, width: 14,
  theme: { ground: 0, road: 0, curb: [8, 7], sky: [0, 1], scenery: 'skyline' },
  control: [[0,0],[300,0],[600,10],[800,-30],[950,40],[980,160],[900,230],[780,200],[700,260],[740,350],[860,390],[950,470],[920,580],[800,620],[650,580],[560,500],[430,520],[380,610],[260,640],[130,590],[100,490],[200,430],[270,350],[200,290],[80,300],[-40,280],[-110,200],[-90,100],[-50,30]],
  pickups: [{ s: 0.1, type: 'ammo' }, { s: 0.27, type: 'cash' }, { s: 0.45, type: 'repair' }, { s: 0.62, type: 'ammo' }, { s: 0.78, type: 'cash' }, { s: 0.92, type: 'repair' }],
};
