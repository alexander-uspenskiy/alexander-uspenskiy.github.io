// Quality presets for the PBR hero slice. Pure data + helpers (Node-safe).
export const QUALITY = Object.freeze({
  low: Object.freeze({ name: 'low', post: false, ssao: false, bloom: false, motionBlur: false, msaa: 0, shadowMap: 1024, shadowSoft: false, dpr: 1, particles: 0.5, envSize: 256, reflections: 0.8 }),
  med: Object.freeze({ name: 'med', post: true, ssao: false, bloom: true, motionBlur: false, msaa: 0, shadowMap: 2048, shadowSoft: true, dpr: 1.5, particles: 0.8, envSize: 512, reflections: 1 }),
  high: Object.freeze({ name: 'high', post: true, ssao: true, bloom: true, motionBlur: true, msaa: 4, shadowMap: 2048, shadowSoft: true, dpr: 2, particles: 1, envSize: 512, reflections: 1.1 }),
});
export const QUALITY_ORDER = ['low', 'med', 'high'];
export const DEFAULT_QUALITY = 'med';
export function resolveQuality(q) { return QUALITY[q] || QUALITY[DEFAULT_QUALITY]; }
export function nextQuality(q) { return QUALITY_ORDER[(QUALITY_ORDER.indexOf(q) + 1) % QUALITY_ORDER.length]; }
/** Read ?q= / localStorage (browser) with a safe fallback. */
export function readQuality(search = '', storage = null) {
  const m = /[?&]q=(low|med|high)/.exec(search);
  if (m) return m[1];
  try { const v = storage && storage.getItem('lasttrack.quality'); if (QUALITY[v]) return v; } catch { /* ignore */ }
  return DEFAULT_QUALITY;
}
