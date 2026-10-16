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
import { createRaceConfig } from '../data/raceConfig.js';
import { createSliceConfig, SLICE_TRACK_ID } from '../data/sliceConfig.js';
import { createSliceGarageScreen } from '../ui/screens/sliceGarage.js';
import { createGarageScene } from '../render/pbr/garageScene.js';
import { createRaceSim } from '../sim/raceSim.js';
import { createRenderHost } from '../render/renderHost.js';
import { createRaceController } from '../render/raceController.js';
import { createCarPreview } from '../render/carPreview.js';
import { createMinimap } from '../render/minimap.js';
import { createAudioEngine } from '../audio/audioEngine.js';
import { attachPBR } from '../render/pbr/pbrHost.js';
import { readQuality, nextQuality } from '../render/pbr/quality.js';
import { createFlowMachine } from '../ui/flowMachine.js';
import { createInput } from '../ui/input.js';
import { createTouchControls } from '../ui/touchControls.js';
import { createHud } from '../ui/hud.js';
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

export const SIM_HZ = 120;
const SIM_DT = 1 / SIM_HZ;
const END_DELAY = 3;
export const WRECK_SPECTATE = 20; // s the field keeps racing after the player is wrecked before the results show          // s after the player finishes / is wrecked before the results show
const FF_MAX_STEPS = SIM_HZ * 420;   // enough to run the rest of the field to the flag (a 3-lap race is ~3 min)
const ERRORS = {
  'insufficient-cash': 'Not enough cash.', 'max-level': 'Already maxed.', 'already-owned': 'You already own that.',
  'no-slots': 'No free weapon slots on this car.', 'ammo-full': 'Ammo is full.', 'not-owned': 'You do not own that weapon.',
  'nothing-to-repair': 'Nothing to repair.',
};
const inRaceState = (s) => s === 'race' || s === 'paused';

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

export function createGame({ root, canvas, storage, onError = () => {}, slice = false, sliceStyle = 'pbr', quality } = {}) {
  storage = storage || getDefaultStorage();
  const bus = createEventBus();
  const store = createSaveStore(storage);
  let saveData = store.load();
  const reportError = (e) => {
    console.error('[game]', e);
    try { onError(e && (e.stack || e.message) ? String(e.stack || e.message) : String(e)); } catch { /* ignore */ }
  };

  let host = null;
  try { host = createRenderHost(canvas, slice && sliceStyle === 'pbr' ? { palettePass: false } : {}); } catch (e) { reportError(e); }
  let pbr = null;
  if (host && slice && sliceStyle === 'pbr') { try { pbr = attachPBR(host, { quality: quality || readQuality(typeof location !== 'undefined' ? location.search : '', typeof localStorage !== 'undefined' ? localStorage : null), env: 'dusk' }); } catch (e) { reportError(e); } }
  let audio = null;
  try { audio = safe(createAudioEngine(), reportError); } catch (e) { reportError(e); }

  let garage = null;
  const flow = createFlowMachine({ initial: 'title' });
  if (host && pbr && slice && sliceStyle === 'pbr') { try { garage = createGarageScene(host, { color: 9, canvas }); } catch (e) { reportError(e); } }
  let raceSetup = { trackId: 'scrapyard', laps: 3, mode: 'race', practiceRivals: false };
  let sim = null, controller = null, track = null, config = null;
  let snapA = null, snapB = null, acc = 0, endTimer = 0, wreckTimer = 0, finalized = false;
  let lastResult = null;
  let rafId = 0, lastT = 0, disposed = false, muted = false;
  const perf = { fps: 60, frameMs: 16 };
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
    slice: !!slice, sliceStyle,
    get pbr() { return pbr; },
  };

  // ---------- save helpers ----------
  const commit = (s) => { saveData = store.save(s); bus.emit('save:changed', saveData); try { storage.setItem('lasttrack.started', '1'); } catch { /* ignore */ } return saveData; };
  Object.assign(game, {
    getSave: () => saveData,
    setSave: (s) => commit(s),
    hasSavedGame: () => store.exists(),
    newGame() { saveData = store.reset(); raceSetup = { ...raceSetup, trackId: 'scrapyard', laps: 3, mode: 'race' }; return saveData; },
    chooseCar(carId) {
      const r = economy.chooseCar(saveData, carId);
      if (!r.ok) throw new Error('chooseCar: ' + r.error);
      return commit(r.save);
    },
    /** buy('upgrade'|'weapon'|'ammo'|'repair', id) -> {ok, error?} */
    buy(kind, id) {
      let r;
      if (kind === 'upgrade') r = economy.purchaseUpgrade(saveData, id);
      else if (kind === 'weapon') r = economy.purchaseWeapon(saveData, id);
      else if (kind === 'ammo') r = economy.buyAmmo(saveData, id, getWeapon(id)?.ammoPack ?? 10);
      else if (kind === 'repair') r = economy.repairCar(saveData);
      else return { ok: false, error: 'Unknown purchase.' };
      if (!r.ok) return { ok: false, error: ERRORS[r.error] || r.error };
      commit(r.save);
      bus.emit('purchase', { kind, id });
      return { ok: true };
    },
    /** Hero Slice: lock to the Hammer on Detroit Scrapyard with a fresh save, then go straight to the race. */
    startSlice() {
      saveData = store.reset();
      const r = economy.chooseCar(saveData, 'hammer');
      if (r.ok) saveData = r.save;
      raceSetup = sliceStyle === 'pbr' ? { trackId: SLICE_TRACK_ID, laps: 3, mode: 'race', practiceRivals: false } : { trackId: 'scrapyard', laps: 3, mode: 'race', practiceRivals: false };
      return flow.force('loading');
    },
    getRaceSetup: () => raceSetup,
    setRaceSetup(p) { raceSetup = { ...raceSetup, ...p }; return raceSetup; },
    driverName: (r) => (r.isPlayer ? 'YOU (the rookie)' : getDriver(r.driverId)?.name ?? `Car ${r.carId}`),
    createPreview(c) {
      try { return createCarPreview(c); } catch (e) { reportError(e); return null; }
    },
  });

  // ---------- HUD / input / touch ----------
  const hud = createHud({ root, getWeapon });
  game.hud = hud;
  game.audio = audio;
  const input = createInput({ isRaceActive: () => flow.state === 'race', onAction: (a) => handleAction(a) });
  game.input = input;
  const touch = createTouchControls({ root, onAction: (a) => handleAction(a), onCycle: () => input.pulseCycle() });
  input.setTouchSource(touch.read);

  function handleAction(a) {
    const st = flow.state;
    if (a === 'pause') { if (st === 'race') game.pause(); else if (st === 'paused') game.resume(); }
    else if (a === 'camera') { if (st === 'race' && controller) { controller.cycleCamera(); } }
    else if (a === 'quality') { if (pbr) { const n = pbr.setQuality(nextQuality(pbr.qualityName)); hud.toast('GRAPHICS: ' + n.toUpperCase(), 1200); } }
    else if (a === 'mute') { muted = !muted; audio?.setMuted(muted); hud.toast(muted ? 'MUTED' : 'SOUND ON', 900); }
  }

  // ---------- screens ----------
  const ctx = { game, flow, bus };
  const screens = {
    title: createTitleScreen(ctx), carSelect: createCarSelectScreen(ctx), garage: createGarageScreen(ctx),
    shop: createShopScreen(ctx), roster: createRosterScreen(ctx), trackSelect: createTrackSelectScreen(ctx),
    raceSettings: createRaceSettingsScreen(ctx), loading: createLoadingScreen(ctx), paused: createPauseScreen(ctx),
    results: createResultsScreen(ctx),
  };
  if (slice && sliceStyle === 'pbr') screens.garage = createSliceGarageScreen(ctx);
  for (const s of Object.values(screens)) { s.el.classList.add('hidden'); root.append(s.el); }
  let shown = null;
  function showScreen(state, params) {
    if (slice && (state === 'carSelect' || state === 'trackSelect' || state === 'raceSettings' || (state === 'garage' && sliceStyle !== 'pbr'))) { flow.force(sliceStyle === 'pbr' ? 'garage' : 'title'); return; } // slice: car and track are locked
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
    hud.end();
    sim = null; snapA = snapB = null;
  }

  function startRace(setup = raceSetup) {
    disposeRace();
    const def = getTrack(setup.trackId);
    if (!def) throw new Error('Unknown track ' + setup.trackId);
    track = buildTrack(def);
    const practice = setup.mode === 'practice';
    const seed = (Date.now() ^ ((saveData.races + 1) * 2654435761)) >>> 0;
    config = slice && sliceStyle === 'pbr' && def.id === SLICE_TRACK_ID ? createSliceConfig({ save: saveData, seed, laps: setup.laps }) : createRaceConfig({
      mode: setup.mode, trackId: def.id, laps: setup.laps, save: saveData, seed,
      rivalIds: practice && !setup.practiceRivals ? [] : undefined,
    });
    if (slice) { config.hero = true; config.heroStyle = sliceStyle; }
    sim = createRaceSim(config);
    snapA = snapB = sim.snapshot();
    acc = 0; endTimer = 0; wreckTimer = 0; finalized = false; lastResult = null;
    if (host) {
      controller = createRaceController(host, track, config);
      try { host.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight); } catch (e) { reportError(e); }
    }
    const names = snapA.cars.map((c) => c.name);
    hud.begin({ createMinimap, track, names, hero: !!config.hero });
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
      if (garage) { if (to === 'garage') { garage.show(); pbr?.setEnv('showroom'); } else if (from === 'garage') { garage.hide(); if (to === 'loading') pbr?.setEnv('dusk'); } }
      if (to === 'title') document.body.classList.remove('racing');
      document.body.classList.toggle('racing', inRaceState(to));
      showScreen(to, params);
    } catch (e) { reportError(e); }
  });
  if (slice && sliceStyle === 'pbr') flow.force('garage'); else showScreen('title', {});
  audio?.setScene('menu'); // plays once the first user gesture creates the AudioContext

  // ---------- main loop ----------
  function tick(t) {
    const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 1 / 60;
    if (lastT) { perf.frameMs += ((t - lastT) - perf.frameMs) * 0.1; perf.fps = 1000 / Math.max(perf.frameMs, 0.1); }
    lastT = t;
    const st = flow.state;
    if (st === 'race' && sim) {
      const { steps, acc: a } = advanceAccumulator(acc, dt, SIM_HZ);
      acc = a;
      const inp = input.read();
      let events = [];
      for (let i = 0; i < steps; i++) {
        sim.step(inp);
        snapA = snapB;
        snapB = sim.snapshot();
        if (snapB.events?.length) events = events.concat(snapB.events);
        inp.cycleWeapon = false; inp.selectWeapon = null; // edges apply to the first step only
      }
      if (steps > 0 && events.length !== (snapB.events?.length ?? 0)) snapB = { ...snapB, events };
      const me = snapB.cars[0];
      if (controller) { controller.update(snapA, snapB, acc, dt); host.render(); }
      hud.update(snapB);
      audio?.update(snapB, dt);
      if (sim.isOver()) finishRace();
      else if (me && me.finished) { endTimer += dt; if (endTimer >= END_DELAY) finishRace(); }
      else if (me && me.wrecked) {
        // the field keeps racing for the ranking: results after it finishes (sim over) or a short timeout
        wreckTimer += dt;
        hud.setNote?.(`SPECTATING — RESULTS IN ${Math.max(0, Math.ceil(WRECK_SPECTATE - wreckTimer))}`);
        if (wreckTimer >= WRECK_SPECTATE) finishRace();
      } else hud.setNote?.('');
    } else if (st === 'garage' && garage) {
      try { garage.update(dt); host.render(); } catch (e) { reportError(e); }
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
      disposeRace(); hud.dispose();
      audio?.dispose();
      try { host?.dispose(); } catch { /* ignore */ }
    },
  });
  return game;
}
