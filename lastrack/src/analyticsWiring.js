// Connects the game's bus to the analytics events. Low volume by design: no per-frame, per-shot or per-hit events.
import { appStartEvent, raceStartEvent, raceFinishEvent, raceQuitEvent, fpsReportEvent, purchaseEvent, errorEvent, settingChangeEvents } from './analyticsEvents.js';

export function attachAnalytics(game, { analytics, version, touch = false, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const send = (ev) => analytics.track(ev.name, ev.params);
  const quality = () => game.settings.quality;
  let stats = null, raceOn = false, prevSettings = game.settings, lastTrack = null, paintTimer = null;
  const off = [];
  const on = (name, fn) => { const u = game.bus.on(name, (...a) => { try { fn(...a); } catch { /* analytics must never break the game */ } }); if (typeof u === 'function') off.push(u); };

  send(appStartEvent({ version, quality: quality(), touch }));
  on('game:new', () => analytics.track('new_game', {}));
  on('car:chosen', (e) => analytics.track('car_select', { car: e.carId }));
  on('livery:changed', (l) => {   // trailing debounce: browsing swatches reports the final pick once
    clearTimer(paintTimer);
    paintTimer = setTimer(() => analytics.track('paint_change', { paint: l.paint, accent: l.accent }), 1200);
  });
  on('race:setup', (s) => { if (s.trackId && s.trackId !== lastTrack) { lastTrack = s.trackId; analytics.track('track_select', { track: s.trackId }); } });
  on('purchase', (p) => send(purchaseEvent(p)));
  on('error', (m) => send(errorEvent(m)));
  on('settings:changed', (next) => { for (const e of settingChangeEvents(prevSettings, next)) send(e); prevSettings = next; });
  on('race:created', ({ config }) => {
    stats = { shots: {}, wrecks: 0, config };
    raceOn = true;
    game.perf.sum = 0; game.perf.n = 0;
    const sim = game.sim;
    if (sim) {
      sim.events.on('shot', (e) => { if (e.carId === 0) stats.shots[e.weaponId] = (stats.shots[e.weaponId] || 0) + 1; });
      sim.events.on('wreck', () => { stats.wrecks++; });
    }
    send(raceStartEvent({ config, quality: quality() }));
  });
  const fps = (config) => { if (game.perf.n > 30) send(fpsReportEvent({ config, avgFps: game.perf.sum / game.perf.n, quality: quality(), frames: game.perf.n })); };
  on('race:finished', ({ result, summary }) => {
    if (!stats) return;
    raceOn = false;
    send(raceFinishEvent({ config: stats.config, result, summary, quality: quality(), stats }));
    fps(stats.config);
  });
  on('flow:state', ({ from, to }) => {
    if (from === 'title' && to === 'garage') analytics.track('continue_game', {});
    if (raceOn && stats && (from === 'race' || from === 'paused') && to !== 'race' && to !== 'paused' && to !== 'results') {
      raceOn = false;
      const snap = game.getSnapshot && game.getSnapshot();
      send(raceQuitEvent({ config: stats.config, lap: snap?.cars?.[0]?.lap, time: snap?.t }));
      fps(stats.config);
    }
  });
  return { dispose() { off.forEach((u) => u()); clearTimer(paintTimer); } };
}
