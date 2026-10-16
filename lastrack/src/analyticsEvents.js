// Pure builders for the game's analytics events (GA4 snake_case; no personal data, no ids of the user).
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
export const weaponsString = (loadout) => (loadout || []).map((w) => w.id).join('+').slice(0, 100);

export const appStartEvent = ({ version, quality, touch }) => ({ name: 'app_start', params: { version, quality, device: touch ? 'touch' : 'desktop' } });
export const raceStartEvent = ({ config, quality }) => ({
  name: 'race_start',
  params: { track: config.trackId, car: config.player?.carId, laps: config.laps, field_size: 1 + (config.rivals || []).length, mode: config.mode, quality, weapons: weaponsString(config.player?.loadout) },
});
/** stats = { shots: {weaponId: n}, wrecks: n } counted by the wiring from sim events. */
export function raceFinishEvent({ config, result, summary, quality, stats = {} }) {
  const params = {
    track: config.trackId, car: config.player?.carId, position: summary.position, field_size: result.finishOrder.length, mode: config.mode,
    time_s: summary.time == null ? 0 : r1(summary.time), kills: summary.kills || 0, wrecked: summary.wrecked ? 1 : 0, prize: summary.total || 0,
    damage_pct: Math.round((summary.damageFraction || 0) * 100), wrecks_total: stats.wrecks || 0, quality,
  };
  for (const [id, n] of Object.entries(stats.shots || {})) if (n > 0) params['shots_' + id] = n;
  return { name: 'race_finish', params };
}
export const raceQuitEvent = ({ config, lap, time }) => ({ name: 'race_quit', params: { track: config.trackId, car: config.player?.carId, lap: lap || 0, time_s: r1(time) } });
export const fpsReportEvent = ({ config, avgFps, quality, frames }) => ({ name: 'fps_report', params: { track: config.trackId, quality, fps_avg: Math.round(avgFps || 0), frames } });
export const purchaseEvent = ({ kind, id, cost, balance, level }) => ({ name: 'purchase', params: { item_type: kind, item_id: id, level: level ?? 0, price: cost || 0, balance_after: balance ?? 0 } });
export const errorEvent = (message) => ({ name: 'error', params: { message: String(message || '').split('\n')[0].slice(0, 100) } });

const SETTING_KEYS = ['quality', 'master', 'music', 'sfx', 'muted', 'hints', 'nameplates', 'camera'];
/** One settings_change event per changed key (volumes rounded to 0.1). The analytics opt-out itself is never reported. */
export function settingChangeEvents(prev, next) {
  const out = [];
  for (const key of SETTING_KEYS) {
    if (!prev || prev[key] === next[key]) continue;
    const v = typeof next[key] === 'number' ? Math.round(next[key] * 10) / 10 : next[key];
    if (typeof next[key] === 'number' && Math.round(prev[key] * 10) === Math.round(next[key] * 10)) continue;
    out.push({ name: 'settings_change', params: { key, value: v } });
  }
  return out;
}
