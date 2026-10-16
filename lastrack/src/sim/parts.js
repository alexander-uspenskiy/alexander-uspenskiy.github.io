// Progressive body-panel loss (pure, deterministic). A car sheds parts as it takes damage: a part comes off when the
// damage accumulated in its zone passes `zoneT` (0..1, see damage.addZoneDamage) OR the armor fraction drops below `frac`.
// The sim emits {type:'partLost', carId, part, ...} once per part; render/ turns each into a flying, tumbling piece.
// Zones: 0 front, 1 right, 2 rear, 3 left, -1 = no zone (armor fraction only).
export const PARTS = Object.freeze([
  { id: 'bumperF', zone: 0, zoneT: 0.5, frac: 0.82 },
  { id: 'hood', zone: 0, zoneT: 0.78, frac: 0.68 },
  { id: 'doorR', zone: 1, zoneT: 0.68, frac: 0.6 },
  { id: 'doorL', zone: 3, zoneT: 0.68, frac: 0.55 },
  { id: 'bumperR', zone: 2, zoneT: 0.6, frac: 0.46 },
  { id: 'spoiler', zone: 2, zoneT: 0.8, frac: 0.38 },
  { id: 'wheelFR', zone: 1, zoneT: 0.88, frac: 0.28 },
  { id: 'turret', zone: -1, zoneT: 2, frac: 0.22 },
  { id: 'wheelRL', zone: 3, zoneT: 0.92, frac: 0.14 },
]);
export const PART_IDS = PARTS.map((p) => p.id);

/** Pure: ids of parts that should be lost now and are not in `lost` yet. dmg = per-zone damage 0..1, frac = armor fraction. */
export function newlyLost(dmg, frac, lost) {
  const out = [];
  for (const p of PARTS) {
    if (lost.includes(p.id)) continue;
    const zoneHit = p.zone >= 0 && dmg && dmg[p.zone] >= p.zoneT;
    if (zoneHit || frac <= p.frac) out.push(p.id);
  }
  return out;
}

/** Pure: every part still on the car (used when the car is wrecked and the rest flies off). */
export function remainingParts(lost) { return PART_IDS.filter((id) => !lost.includes(id)); }

/** Pure: where a part flies from, in the car frame ({ fx forward m, fy right m }), and its ejection direction (car frame). */
export const PART_ORIGIN = Object.freeze({
  bumperF: { fx: 2.3, fy: 0, dx: 1, dy: 0 }, hood: { fx: 1.3, fy: 0, dx: 0.4, dy: 0 }, doorR: { fx: 0, fy: 1.0, dx: 0, dy: 1 },
  doorL: { fx: 0, fy: -1.0, dx: 0, dy: -1 }, bumperR: { fx: -2.3, fy: 0, dx: -1, dy: 0 }, spoiler: { fx: -2.0, fy: 0, dx: -0.6, dy: 0 },
  wheelFR: { fx: 1.4, fy: 1.0, dx: 0.5, dy: 1 }, turret: { fx: -0.3, fy: 0, dx: 0, dy: 0.3 }, wheelRL: { fx: -1.4, fy: -1.0, dx: -0.5, dy: -1 },
});
