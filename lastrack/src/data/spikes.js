// Car spikes: purchasable ram gear (front rack, rear array, wheel blades), 2 tiers each. Pure + deterministic.
// dealt = bonus damage multiplier on a ram that lands on the spiked side (scaled by closing speed); taken = share of ram
// damage the owner no longer takes on that side. Never full immunity (MAX_PROTECT).
export const SPIKE_TIERS = 2;
export const MAX_PROTECT = 0.6;
export const SPIKE_MIN_CLOSE = 2.5;   // m/s closing speed before spikes bite (below the plain ram threshold, so tailgating scrapes)
export const SPIKE_K = 0.48;          // damage per m/s above the minimum, at dealt = 1
export const SPIKES = [
  { id: 'front', name: 'Ram Spikes', zone: 'front', blurb: 'Spike rack on the nose: head-on and front rams hurt more, and the nose takes less.',
    tiers: [{ name: 'Steel Spikes', price: 1600, dealt: 0.5, taken: 0.3 }, { name: 'Plasma-Tipped', price: 3800, dealt: 1.0, taken: 0.55 }] },
  { id: 'rear', name: 'Rear Spikes', zone: 'rear', blurb: 'Angled spike array on the tail: punishes tailgaters and rear hits.',
    tiers: [{ name: 'Steel Spikes', price: 900, dealt: 0.5, taken: 0.3 }, { name: 'Plasma-Tipped', price: 2300, dealt: 1.0, taken: 0.55 }] },
  { id: 'wheels', name: 'Wheel Blades', zone: 'side', blurb: 'Spinning spiked hubs: sideswipes and side hits bite back.',
    tiers: [{ name: 'Steel Hubs', price: 2200, dealt: 0.5, taken: 0.25 }, { name: 'Plasma Hubs', price: 5000, dealt: 1.0, taken: 0.5 }] },
];
export const SPIKE_IDS = SPIKES.map((s) => s.id);
export const getSpike = (id) => SPIKES.find((s) => s.id === id) || null;
export const noSpikes = () => ({ front: 0, rear: 0, wheels: 0 });
export function normalizeSpikes(raw) {
  const out = noSpikes();
  if (raw && typeof raw === 'object') for (const id of SPIKE_IDS) { const v = Math.floor(Number(raw[id])); if (Number.isFinite(v)) out[id] = Math.max(0, Math.min(SPIKE_TIERS, v)); }
  return out;
}
/** Price of buying `tier` (1-based) of a spike set; null if invalid. */
export function spikeCost(id, tier) { const s = getSpike(id); return s && Number.isInteger(tier) && tier >= 1 && tier <= SPIKE_TIERS ? s.tiers[tier - 1].price : null; }
export function spikeTier(spikes, id) { const s = getSpike(id); const t = spikes && spikes[id] | 0; return s && t > 0 ? s.tiers[Math.min(t, SPIKE_TIERS) - 1] : null; }

/** Pure: which part of car `a` (position/heading) a contact with point (px,py) is on: 'front' | 'rear' | 'side'. */
export function contactZone(a, px, py) {
  const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(py - a.y, px - a.x) - a.heading), Math.cos(Math.atan2(py - a.y, px - a.x) - a.heading)));
  return ang < Math.PI / 4 ? 'front' : ang > (3 * Math.PI) / 4 ? 'rear' : 'side';
}
const spikeForZone = (spikes, zone) => spikeTier(spikes, zone === 'side' ? 'wheels' : zone);
/** Pure: bonus spike damage the owner deals to the victim. close = closing speed (m/s), massShare = 2*mOther/(mA+mB). 0 when nothing bites. */
export function spikeDamage(spikes, zone, close, massShare = 1) {
  const t = spikeForZone(spikes, zone);
  if (!t || close <= SPIKE_MIN_CLOSE) return 0;
  return t.dealt * (close - SPIKE_MIN_CLOSE) * SPIKE_K * massShare;
}
/** Pure: multiplier (<=1, >= 1-MAX_PROTECT) on ram damage the owner takes on `zone`. */
export function spikeProtection(spikes, zone) {
  const t = spikeForZone(spikes, zone);
  return t ? 1 - Math.min(MAX_PROTECT, t.taken) : 1;
}
/** Total sticker value of a spike set (for sell/UI). */
export function spikesValue(spikes) { let v = 0; for (const s of SPIKES) for (let k = 1; k <= (spikes?.[s.id] | 0); k++) v += s.tiers[k - 1].price; return v; }
