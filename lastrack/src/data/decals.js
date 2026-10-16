// Paint decals: catalog (procedural vector art is drawn in render/decalArt.js), zones, and the pure placement rules.
export const ZONES = ['hood', 'doorL', 'doorR', 'roof', 'trunk'];
export const ZONE_NAMES = { hood: 'Hood', doorL: 'Left door', doorR: 'Right door', roof: 'Roof', trunk: 'Trunk' };
export const MAX_DECALS = 6;
export const SCALE_MIN = 0.4, SCALE_MAX = 2.2;

// tier 1 $300-500, tier 2 $600-1200, tier 3 $1500-2500
export const DECALS = [
  { id: 'racing-stripes', name: 'Racing stripes', price: 300, tier: 1 },
  { id: 'checker', name: 'Checkerboard', price: 350, tier: 1 },
  { id: 'star', name: 'Star', price: 300, tier: 1 },
  { id: 'barcode', name: 'Barcode', price: 400, tier: 1 },
  { id: 'plate', name: 'Number plate', price: 400, tier: 1 },
  { id: 'tribal', name: 'Tribal stripes', price: 500, tier: 1 },
  { id: 'bolt', name: 'Lightning bolt', price: 600, tier: 2 },
  { id: 'flames', name: 'Flames', price: 800, tier: 2 },
  { id: 'shark', name: 'Shark teeth', price: 800, tier: 2 },
  { id: 'claws', name: 'Claw marks', price: 900, tier: 2 },
  { id: 'eye', name: 'All-seeing eye', price: 1000, tier: 2 },
  { id: 'radiation', name: 'Radiation', price: 1000, tier: 2 },
  { id: 'wings', name: 'Wings', price: 1200, tier: 2 },
  { id: 'skull', name: 'Skull', price: 1500, tier: 3 },
  { id: 'pistons', name: 'Crossed pistons', price: 1600, tier: 3 },
  { id: 'snake', name: 'Snake', price: 1800, tier: 3 },
  { id: 'crown', name: 'Crown', price: 2000, tier: 3 },
  { id: 'flaming-skull', name: 'Flaming skull', price: 2500, tier: 3 },
];
export const getDecal = (id) => DECALS.find((d) => d.id === id) || null;
export const isZone = (z) => ZONES.includes(z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Default placement for a decal in a zone. tint = paint preset id. */
export function defaultPlacement(id, zone = 'hood', tint = 'pearl-white') { return { id, zone, tint, scale: 1, rot: 0, mirror: false }; }

/** Pure: clean a placement (clamps scale/rotation, drops unknown ids/zones). Returns null if invalid. */
export function normalizePlacement(p, validTints = null) {
  if (!p || typeof p !== 'object' || !getDecal(p.id) || !isZone(p.zone)) return null;
  const scale = Number.isFinite(+p.scale) ? clamp(+p.scale, SCALE_MIN, SCALE_MAX) : 1;
  const rotRaw = Number.isFinite(+p.rot) ? +p.rot : 0, rot = ((((rotRaw + 180) % 360) + 360) % 360) - 180;
  const tint = typeof p.tint === 'string' && (!validTints || validTints.includes(p.tint)) ? p.tint : 'pearl-white';
  return { id: p.id, zone: p.zone, tint, scale: Math.round(scale * 100) / 100, rot: Math.round(rot), mirror: !!p.mirror };
}
/** Pure: sanitise a placed list against the owned list (placements need ownership; at most MAX_DECALS). */
export function normalizePlacements(list, owned, validTints = null) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const p = normalizePlacement(raw, validTints);
    if (p && owned.includes(p.id) && out.length < MAX_DECALS) out.push(p);
  }
  return out;
}
