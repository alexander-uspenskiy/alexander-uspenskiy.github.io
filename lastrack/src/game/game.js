// Game orchestrator: flow, save, screens, race lifecycle, fixed-step loop, render/audio/HUD wiring.
import { createEventBus } from '../core/eventBus.js';
import { getDefaultStorage } from '../core/storage.js';
import { buildTrack } from '../core/trackModel.js';
import { advanceAccumulator } from '../sim/fixedStep.js';
import { createSaveStore } from '../data/saveStore.js';
import { getTrack } from '../data/tracks/index.js';
import { getDriver } from '../data/drivers.js';
import { getWeapon } from '../data/weapons.js';
import * as economy from '../data/economy.js';
import { createGameConfig, SLICE_TRACK_ID } from '../data/sliceConfig.js';
import { playerLivery } from '../data/liveries.js';
import { createPaintScreen } from '../ui/screens/paint.js';
import { createRaceSim } from '../sim/raceSim.js';
import { createRenderHost } from '../render/renderHost.js';
import { createRaceController } from '../render/raceController.js';
import { createCarPreview } from '../render/carPreview.js';
import { createMinimap } from '../render/minimap.js';
import { createMenuScene } from '../render/menuScene.js';
import { createAudioEngine } from '../audio/audioEngine.js';
import { attachPBR } from '../render/pbr/pbrHost.js';
import { readQuality, nextQuality } from '../render/pbr/quality.js';
import { createFlowMachine } from '../ui/flowMachine.js';
import { createInput } from '../ui/input.js';
import { createTouchControls } from '../ui/touchControls.js';
import { createHud } from '../ui/hud.js';
import { createAnalytics } from '../analytics.js';
import { attachAnalytics } from '../analyticsWiring.js';
import { VERSION } from '../version.js';
import { createOverlays } from '../ui/overlays.js';
import { h } from '../ui/dom.js';
import { createTitleScreen } from '../ui/screens/title.js';
import { createCarSelectScreen } from '../ui/screens/carSelect.js';
import { createGarageScreen } from '../ui/screens/garage.js';
import { createShopScreen } from '../ui/screens/shop.js';
import { createRosterScreen } from '../ui/screens/roster.js';
import { createTrackSelectScreen } from '../ui/screens/trackSelect.js';
import { createRaceSettingsScreen } from '../ui/screens/raceSettings.js';
import { createLoadingScreen } from '../ui/screens/loading.js';
import { createPauseScreen } from '../ui/screens/pause.js';
import { createResultsScreen } from '../ui/screens/results.js';
import { createSettingsSheet } from '../ui/screens/settingsSheet.js';
import { loadSettings, saveSettings, normalizeSettings } from '../ui/settings.js';

export const SIM_HZ = 120;
const SIM_DT = 1 / SIM_HZ;
const END_DELAY = 3;
export const WRECK_SPECTATE = 20; // s the field keeps racing after the player is wrecked before the results show          // s after the player finishes / is wrecked before the results show
const FF_MAX_STEPS = SIM_HZ * 420;   // enough to run the rest of the field to the flag (a 3-lap race is ~3 min)
const ERRORS = {
  'insufficient-cash': 'Not enough cash.', 'max-level': 'Already maxed.', 'already-owned': 'You already own that.',
  'no-slots': 'No free weapon slots on this car.', 'ammo-full': 'Ammo is full.', 'not-owned': 'You do not own that.',
  'nothing-to-repair': 'Nothing to repair.', 'decal-limit': 'Six decals per car — remove one first.',
};
const inRaceState = (s) => s === 'race' || s === 'paused';
const MENU_3D = new Set(['title', 'carSelect', 'garage', 'shop', 'paint']);   // states drawn over the live 3D showroom

/** Wrap an optional subsystem so that a bug in it never breaks the game. */
function safe(obj, onError) {
  if (!obj) return null;
  let fails = 0;
  return new Proxy(obj, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      return (...a) => {
        if (fails > 20) return undefined;
        try { return v.apply(t, a); } catch (e) { if (++fails <= 3) onError(e); return undefined; }
      };
    },
  });
}

export function createGame({ root, canvas, storage, onError = () => {}, quality } = {}) {   // the photoreal PBR slice is the game; `?slice=1` is kept as a no-op alias
  storage = storage || getDefaultStorage();
  const bus = createEventBus();
  const store = createSaveStore(storage);
  let saveData = store.load();
  const reportError = (e) => {
    console.error('[game]', e);
    try { bus.emit('error', e && e.message ? e.message : String(e)); } catch { /* ignore */ }
    try { onError(e && (e.stack || e.message) ? String(e.stack || e.message) : String(e)); } catch { /* ignore */ }
  };

  let host = null;
  try { host = createRenderHost(canvas, { palettePass: false }); } catch (e) { reportError(e); }
  let pbr = null, envKind = 'showroom';
  if (host) { try { pbr = attachPBR(host, { quality: quality || readQuality(typeof location !== 'undefined' ? location.search : '', typeof localStorage !== 'undefined' ? localStorage : null), env: envKind }); } catch (e) { reportError(e); } }
  const setEnv = (k) => { if (pbr && envKind !== k) { envKind = k; try { pbr.setEnv(k); } catch (e) { reportError(e); } } };
  // player settings live in real localStorage even when the save is in-memory (?fresh=1 / slice)
  const settingsStorage = getDefaultStorage();
  let settings = loadSettings(settingsStorage);
  if (pbr) settings = { ...settings, quality: pbr.qualityName };
  let stage = null;
  if (host && pbr) { try { stage = createMenuScene(host, { canvas }); } catch (e) { reportError(e); } }
  let audio = null;
  try { audio = safe(createAudioEngine(), reportError); } catch (e) { reportError(e); }

  const flow = createFlowMachine({ initial: 'title' });
  let raceSetup = { trackId: SLICE_TRACK_ID, laps: 3, mode: 'race', practiceRivals: false };
  let sim = null, controller = null, track = null, config = null;
  let snapA = null, snapB = null, acc = 0, endTimer = 0, wreckTimer = 0, finalized = false;
  let lastResult = null;
  let rafId = 0, lastT = 0, disposed = false, muted = false;
  const perf = { fps: 60, frameMs: 16, sum: 0, n: 0 };
  let firstFrameResolve; const firstFrame = new Promise((r) => { firstFrameResolve = r; });

  const game = {
    bus, flow, firstFrame, perf, reportError,
    get sim() { return sim; },
    get save() { return saveData; },
    get lastResult() { return lastResult; },
    get track() { return track; },
    get config() { return config; },
    get host() { return host; },
    get controller() { return controller; },
    slice: true,
    get pbr() { return pbr; },
    get stage() { return stage; },
    get settings() { return settings; },
  };

  // ---------- save helpers ----------
  const commit = (s) => { saveData = store.save(s); bus.emit('save:changed', saveData); try { storage.setItem('lasttrack.started', '1'); } catch { /* ignore */ } return saveData; };
  Object.assign(game, {
    getSave: () => saveData,
    setSave: (s) => commit(s),
    hasSavedGame: () => store.exists(),
    newGame() { saveData = store.reset(); bus.emit('game:new'); raceSetup = { ...raceSetup, trackId: SLICE_TRACK_ID, laps: 3, mode: 'race' }; return saveData; },
    chooseCar(carId) {
      const r = economy.chooseCar(saveData, carId);
      if (!r.ok) throw new Error('chooseCar: ' + r.error);
      bus.emit('car:chosen', { carId });
      return commit(r.save);
    },
    /** buy('upgrade'|'weapon'|'ammo'|'repair', id) -> {ok, error?} */
    buy(kind, id) {
      let r;
      if (kind === 'upgrade') r = economy.purchaseUpgrade(saveData, id);
      else if (kind === 'weapon') r = economy.purchaseWeapon(saveData, id);
      else if (kind === 'spikes') r = economy.purchaseSpikes(saveData, id);
      else if (kind === 'ammo') r = economy.buyAmmo(saveData, id, getWeapon(id)?.ammoPack ?? 10);
      else if (kind === 'repair') r = economy.repairCar(saveData);
      else return { ok: false, error: 'Unknown purchase.' };
      if (!r.ok) return { ok: false, error: ERRORS[r.error] || r.error };
      commit(r.save);
      bus.emit('purchase', { kind, id, cost: r.cost || 0, balance: saveData.cash, level: (kind === 'upgrade' ? saveData.upgrades[id] : kind === 'spikes' ? saveData.spikes[id] : 0) });
      return { ok: true };
    },
    /** Quick start (debug / `?slice=1` alias): fresh save with the Hammer, straight into a race on the first track. */
    startSlice() {
      saveData = store.reset();
      const r = economy.chooseCar(saveData, 'hammer');
      if (r.ok) saveData = r.save;
      raceSetup = { trackId: SLICE_TRACK_ID, laps: 3, mode: 'race', practiceRivals: false };
      return flow.force('loading');
    },
    /** The player's resolved livery for a car (default: the saved car). Used by every 3D preview. */
    liveryOf: (carId) => playerLivery(carId ? { ...saveData, carId } : saveData),
    getRaceSetup: () => raceSetup,
    setRaceSetup(p) { raceSetup = { ...raceSetup, ...p }; bus.emit('race:setup', raceSetup); return raceSetup; },
    driverName: (r) => (r.isPlayer ? 'YOU (the rookie)' : getDriver(r.driverId)?.name ?? `Car ${r.carId}`),
    createPreview(c) {
      try { return createCarPreview(c); } catch (e) { reportError(e); return null; }
    },
  });

  // ---------- paint & decals (cosmetic save changes; every change is committed and pushed to the live 3D preview) ----------
  const liveryCall = (fn) => (...a) => {
    const r = fn(saveData, ...a);
    if (!r.ok) return { ok: false, error: ERRORS[r.error] || r.error };
    commit(r.save); stage?.setLivery?.(playerLivery(saveData));
    bus.emit('livery:changed', playerLivery(saveData));
    if (r.cost > 0) bus.emit('purchase', { kind: 'decal', id: String(a[0] && a[0].id || a[0] || ''), cost: r.cost, balance: saveData.cash, level: 0 });
    return { ok: true, cost: r.cost || 0 };
  };
  Object.assign(game, {
    setPaint: liveryCall(economy.setPaint), setAccent: liveryCall(economy.setAccent), setNumber: liveryCall(economy.setNumber),
    buyDecal: liveryCall(economy.purchaseDecal), placeDecal: liveryCall(economy.placeDecal), updateDecal: liveryCall(economy.updateDecal), removeDecal: liveryCall(economy.removeDecal),
  });

  // ---------- analytics (GA4 events; opt-out in Settings) ----------
  const analytics = createAnalytics({ getOptIn: () => settings.analytics });
  game.analytics = analytics;

  // ---------- settings ----------
  function applySettings(prev) {
    document.body.classList.toggle('no-hints', !settings.hints);
    if (audio) {
      audio.setMuted(settings.muted); muted = settings.muted;
      audio.setVolume(settings.master);
      audio.setMusic(settings.music > 0.02);
      audio.setMusicVolume?.(settings.music); audio.setSfxVolume?.(settings.sfx);
    }
    if (pbr && prev && prev.quality !== settings.quality) { pbr.setQuality(settings.quality); stage?.setQuality(settings.quality); }
    overlays.setEnabled(settings.nameplates);
    if (controller && prev && prev.camera !== settings.camera) controller.setCamera(settings.camera);
  }
  game.updateSettings = (patch) => {
    const prev = settings;
    settings = normalizeSettings({ ...settings, ...patch });
    saveSettings(settingsStorage, settings);
    applySettings(prev);
    if (prev.analytics !== settings.analytics) analytics.setOptIn(settings.analytics);
    bus.emit('settings:changed', settings);
    return settings;
  };

  // ---------- HUD / input / touch ----------
  const hud = createHud({ root, getWeapon });
  game.hud = hud;
  const overlays = createOverlays({ root });
  overlays.setEnabled(settings.nameplates);
  game.overlays = overlays;
  game.audio = audio;
  const input = createInput({ isRaceActive: () => flow.state === 'race', onAction: (a) => handleAction(a) });
  game.input = input;
  const touch = createTouchControls({ root, onAction: (a) => handleAction(a), onCycle: () => input.pulseCycle() });
  input.setTouchSource(touch.read);

  function handleAction(a) {
    const st = flow.state;
    if (a === 'pause') { if (st === 'race') game.pause(); else if (st === 'paused') game.resume(); }
    else if (a === 'camera') { if (st === 'race' && controller) { controller.cycleCamera(); } }
    else if (a === 'quality') { if (pbr) { const n = pbr.setQuality(nextQuality(pbr.qualityName)); settings = { ...settings, quality: n }; saveSettings(settingsStorage, settings); stage?.setQuality(n); hud.toast('GRAPHICS: ' + n.toUpperCase(), 1200); } }
    else if (a === 'mute') { muted = !muted; settings = { ...settings, muted }; saveSettings(settingsStorage, settings); audio?.setMuted(muted); hud.toast(muted ? 'MUTED' : 'SOUND ON', 900); }
  }

  // ---------- screens ----------
  const sheet = createSettingsSheet({ game });
  root.append(sheet.el);
  const ctx = { game, flow, bus, openSettings: () => sheet.open() };
  const screens = {
    title: createTitleScreen(ctx), carSelect: createCarSelectScreen(ctx), garage: createGarageScreen(ctx),
    shop: createShopScreen(ctx), roster: createRosterScreen(ctx), trackSelect: createTrackSelectScreen(ctx),
    raceSettings: createRaceSettingsScreen(ctx), loading: createLoadingScreen(ctx), paused: createPauseScreen(ctx),
    results: createResultsScreen(ctx), paint: createPaintScreen(ctx),
  };
  for (const s of Object.values(screens)) { s.el.classList.add('hidden'); root.append(s.el); }
  let shown = null;
  function showScreen(state, params) {
    if (shown) { try { shown.hide?.(); } catch (e) { reportError(e); } shown.el.classList.add('hidden'); shown = null; }
    const s = screens[state];
    if (!s) return;
    shown = s;
    s.el.classList.remove('hidden');
    try { s.show?.(params); } catch (e) { reportError(e); }
  }

  // ---------- race lifecycle ----------
  function disposeRace() {
    try { controller?.dispose(); } catch (e) { reportError(e); }
    controller = null;
    audio?.stop();
    hud.end(); overlays.clear();
    sim = null; snapA = snapB = null;
  }

  function startRace(setup = raceSetup) {
    disposeRace();
    const def = getTrack(setup.trackId);
    if (!def) throw new Error('Unknown track ' + setup.trackId);
    track = buildTrack(def);
    const practice = setup.mode === 'practice';
    const seed = (Date.now() ^ ((saveData.races + 1) * 2654435761)) >>> 0;
    config = createGameConfig({ mode: setup.mode, trackId: def.id, laps: setup.laps, save: saveData, seed, practiceRivals: !!setup.practiceRivals });
    void practice;
    sim = createRaceSim(config);
    snapA = snapB = sim.snapshot();
    acc = 0; endTimer = 0; wreckTimer = 0; finalized = false; lastResult = null;
    if (host) {
      controller = createRaceController(host, track, config);
      if (settings.camera && settings.camera !== 'chase') controller.setCamera(settings.camera);
      try { host.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight); } catch (e) { reportError(e); }
    }
    const names = snapA.cars.map((c) => c.name);
    hud.begin({ createMinimap, track, names, hero: !!config.hero, carId: (config.player && config.player.carId) || saveData.carId });
    audio?.resume();
    audio?.startRace();
    bus.emit('race:created', { config });
    return sim;
  }

  function finishRace() {
    if (finalized || !sim) return;
    finalized = true;
    let guard = 0;
    while (!sim.isOver() && guard++ < FF_MAX_STEPS) sim.step({ throttle: 0, brake: 0, steer: 0, fire: false, cycleWeapon: false, selectWeapon: null, handbrake: false });
    const result = sim.result();
    const before = saveData;
    const applied = economy.applyRaceResult(saveData, result, { mode: config.mode, nCars: result.finishOrder.length });
    const p = result.player;
    const summary = {
      mode: config.mode, position: p.position, time: p.time, kills: p.kills, wrecked: !!p.wrecked,
      prize: applied.prize, killBonus: applied.killBonus, total: applied.total,
      unlocked: applied.unlockedTrack, damageFraction: p.damageFraction,
      newBest: config.mode === 'race' && p.time != null && (before.bestTimes[result.trackId] == null || p.time < before.bestTimes[result.trackId]),
    };
    const pickupCash = config.mode === 'race' ? Math.max(0, Math.round(p.pickupCash || 0)) : 0;
    summary.pickupCash = pickupCash;
    if (config.mode === 'race') commit({ ...applied.save, cash: applied.save.cash + pickupCash });
    lastResult = { result, summary };
    bus.emit('race:finished', lastResult);
    if (!flow.transition('results', lastResult)) flow.force('results', lastResult);
  }

  function pause() { if (flow.state !== 'race') return false; return flow.transition('paused'); }
  function resume() { if (flow.state !== 'paused') return false; return flow.transition('race'); }
  function restartRace() { return flow.state === 'paused' ? flow.transition('loading') : flow.force('loading'); }
  function quitRace() { return flow.state === 'paused' ? flow.transition('garage') : flow.force('garage'); }

  // ---------- flow wiring ----------
  const sceneFor = (to, params) => (to === 'race' || to === 'paused' ? 'race'
    : to === 'results' ? (params?.summary && !params.summary.wrecked && (params.summary.mode === 'practice' || params.summary.position <= 3) ? 'win' : 'lose')
      : to === 'loading' ? null : 'menu');
  flow.onChange((from, to, params) => {
    try {
      bus.emit('flow:state', { from, to, params });
      touch.setVisible(to === 'race');
      if (to === 'race') { input.clear(); hud.show(); audio?.resume(); } else if (to !== 'paused') hud.hide();
      if (inRaceState(from) && !inRaceState(to)) disposeRace();
      { const sc = sceneFor(to, params); if (sc) audio?.setScene(sc); }
      if (to === 'loading') {
        // leave two frames so the loading screen paints, then build the race
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (flow.state !== 'loading') return;
          try { startRace(); flow.transition('race'); } catch (e) { reportError(e); flow.transition('garage'); }
        }));
      }
      const menu3d = !!stage && MENU_3D.has(to);
      if (stage) { if (menu3d) { setEnv('showroom'); stage.show(); } else stage.hide(); }
      if (to === 'loading' || inRaceState(to)) setEnv('dusk');
      if (to === 'title') document.body.classList.remove('racing');
      document.body.classList.toggle('racing', inRaceState(to));
      document.body.classList.toggle('scene3d', menu3d);
      showScreen(to, params);
    } catch (e) { reportError(e); }
  });
  applySettings(null);
  analytics.setOptIn(settings.analytics);
  try { attachAnalytics(game, { analytics, version: VERSION, touch: document.body.classList.contains('touch') }); } catch (e) { console.error('[analytics]', e); }
  { if (stage) { stage.setCar({ carId: 'hammer', color: 9 }); stage.setMode('title', { side: 1 }); stage.show(); document.body.classList.add('scene3d'); } showScreen('title', {}); }
  audio?.setScene('menu'); // plays once the first user gesture creates the AudioContext

  // ---------- main loop ----------
  function tick(t) {
    const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 1 / 60;
    if (lastT) { perf.frameMs += ((t - lastT) - perf.frameMs) * 0.1; perf.fps = 1000 / Math.max(perf.frameMs, 0.1); }
    lastT = t;
    const st = flow.state;
    if (st === 'race') { perf.sum += perf.fps; perf.n++; }
    if (st === 'race' && sim) {
      // hit-stop / slow-mo on wrecks and big hits: the controller scales the real frame time the sim is fed (sim stays deterministic)
      const ts = controller && controller.stepTime ? controller.stepTime(dt) : 1;
      const { steps, acc: a } = advanceAccumulator(acc, dt * ts, SIM_HZ);
      acc = a;
      const inp = input.read();
      inp.nitro = inp.nitro || input.pressed.has('KeyF') || input.pressed.has('KeyX');   // nitro: F / X (Shift stays the handbrake)
      let events = [];
      for (let i = 0; i < steps; i++) {
        sim.step(inp);
        snapA = snapB;
        snapB = sim.snapshot();
        if (snapB.events?.length) events = events.concat(snapB.events);
        inp.cycleWeapon = false; inp.selectWeapon = null; // edges apply to the first step only
      }
      if (steps > 0 && events.length !== (snapB.events?.length ?? 0)) snapB = { ...snapB, events };
      else if (steps === 0 && snapB?.events?.length) snapB = { ...snapB, events: [] };   // slow-mo / hit-stop frames: do not replay the last tick's events (HUD feed)
      const me = snapB.cars[0];
      if (controller) { controller.update(snapA, snapB, acc, dt); host.render(); }
      hud.update(snapB);
      if (host && controller) overlays.update(snapB, host.camera, canvas.clientWidth, canvas.clientHeight, dt, controller.poseOf);
      audio?.update(snapB, dt);
      if (sim.isOver()) finishRace();
      else if (me && me.finished) { endTimer += dt; if (endTimer >= END_DELAY) finishRace(); }
      else if (me && me.wrecked) {
        // the field keeps racing for the ranking: results after it finishes (sim over) or a short timeout
        wreckTimer += dt;
        hud.setNote?.(`SPECTATING — RESULTS IN ${Math.max(0, Math.ceil(WRECK_SPECTATE - wreckTimer))}`);
        if (wreckTimer >= WRECK_SPECTATE) finishRace();
      } else hud.setNote?.('');
    } else if (stage && stage.shown && MENU_3D.has(st)) {
      try { stage.update(dt); host.render(); } catch (e) { reportError(e); }
    } else if (st === 'paused' && controller) {
      try { controller.update(snapB, snapB, 0, 0); host.render(); } catch (e) { reportError(e); }
    }
    if (firstFrameResolve) { firstFrameResolve(); firstFrameResolve = null; }
  }
  let errCount = 0, streak = 0;
  function frame(t) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    try { tick(t); streak = 0; } catch (e) {
      errCount++; streak++;
      if (errCount <= 20) reportError(e);
      if (streak >= 5) { streak = 0; try { if (inRaceState(flow.state)) flow.force('garage'); } catch (e2) { reportError(e2); } }
    }
  }
  rafId = requestAnimationFrame(frame);

  // ---------- DOM listeners ----------
  const cleanups = [];
  const listen = (tg, ev, fn, o) => { tg.addEventListener(ev, fn, o); cleanups.push(() => tg.removeEventListener(ev, fn, o)); };
  listen(window, 'resize', () => { try { host?.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight); } catch (e) { reportError(e); } });
  listen(document, 'visibilitychange', () => { if (document.hidden) pause(); });
  listen(window, 'pointermove', (e) => {
    const x = (e.clientX / (window.innerWidth || 1)) * 2 - 1, y = (e.clientY / (window.innerHeight || 1)) * 2 - 1, st = document.documentElement.style;
    st.setProperty('--px', x.toFixed(3)); st.setProperty('--py', y.toFixed(3));
  });
  const unlock = () => audio?.resume();
  listen(window, 'pointerdown', unlock, { once: true });
  listen(window, 'keydown', unlock, { once: true });

  Object.assign(game, {
    startRace, restartRace, quitRace, pause, resume, finishRace,
    getSnapshot: () => snapB,
    getStats() {
      const info = host?.renderer?.info;
      return { fps: Math.round(perf.fps), frameMs: Math.round(perf.frameMs * 10) / 10, drawCalls: info ? info.render.calls : 0, triangles: info ? info.render.triangles : 0 };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      cleanups.forEach((c) => c());
      input.dispose(); touch.dispose();
      disposeRace(); hud.dispose(); sheet.dispose(); try { stage?.dispose(); } catch { /* ignore */ }
      audio?.dispose();
      try { host?.dispose(); } catch { /* ignore */ }
    },
  });
  return game;
}
