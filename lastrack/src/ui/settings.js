// Player settings (quality, volumes, mute, hints, camera). Pure normalise + storage; apply() wires them to the game.
export const SETTINGS_KEY = 'lasttrack.settings';
export const DEFAULT_SETTINGS = Object.freeze({ quality: 'med', master: 0.7, music: 0.8, sfx: 0.9, muted: false, hints: true, camera: 'chase' });
export const QUALITIES = ['low', 'med', 'high'];
export const CAMERAS = ['chase', 'cockpit', 'bumper', 'tv', 'top'];
const clamp01 = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.max(0, Math.min(1, +v)) : d);

export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    quality: QUALITIES.includes(r.quality) ? r.quality : d.quality,
    master: clamp01(r.master, d.master), music: clamp01(r.music, d.music), sfx: clamp01(r.sfx, d.sfx),
    muted: typeof r.muted === 'boolean' ? r.muted : d.muted,
    hints: typeof r.hints === 'boolean' ? r.hints : d.hints,
    camera: CAMERAS.includes(r.camera) ? r.camera : d.camera,
  };
}
export function loadSettings(storage) {
  try { const s = storage && storage.getItem(SETTINGS_KEY); return normalizeSettings(s ? JSON.parse(s) : null); } catch { return normalizeSettings(null); }
}
export function saveSettings(storage, s) {
  try { storage && storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(s))); } catch { /* ignore */ }
}
