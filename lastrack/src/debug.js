// window.__game debug/automation hook. Installed by main.js immediately, even if the game fails to construct.
const clone = (o) => (o == null ? o : structuredClone(o));

export function createDebug() {
  const errors = [];
  let game = null;
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  const need = () => { if (!game) throw new Error('__game: game is not initialised (see __game.errors)'); return game; };
  const pushError = (m) => { if (errors.length < 200) errors.push(String(m)); };
  window.addEventListener('error', (e) => pushError(`${e.message}${e.filename ? ` @ ${e.filename}:${e.lineno}` : ''}`));
  window.addEventListener('unhandledrejection', (e) => pushError('unhandledrejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));

  const api = {
    ready, errors,
    get state() { return game ? game.flow.state : 'boot'; },
    get sim() { return game?.sim ?? null; },
    get save() { return game ? clone(game.getSave()) : null; },
    get game() { return game; },
    snapshot() { return game ? clone(game.getSnapshot()) : null; },
    result() { return game ? clone(game.lastResult) : null; },
    setCash(n) { const g = need(); return clone(g.setSave({ ...g.getSave(), cash: Math.max(0, Math.floor(n)) })); },
    /** Jump straight into a race (synchronously). opts: {mode, laps, practiceRivals} */
    skipToRace(trackId = 'scrapyard', opts = {}) {
      const g = need();
      g.setRaceSetup({ trackId, ...opts });
      g.flow.force('loading');
      g.startRace();
      g.flow.force('race');
      return clone(g.getSnapshot());
    },
    /** Step the sim headless with the given input (default: full throttle). */
    fastForward(seconds, input = { throttle: 1 }) {
      const g = need();
      if (!g.sim) throw new Error('no race running');
      const inp = { throttle: 0, brake: 0, steer: 0, fire: false, cycleWeapon: false, selectWeapon: null, handbrake: false, ...input };
      const n = Math.round(seconds * 120);
      for (let i = 0; i < n && !g.sim.isOver(); i++) g.sim.step(inp);
      return clone(g.sim.snapshot());
    },
    finishRace() { need().finishRace(); return api.state; },
    goto(state, params) { return need().flow.force(state, params); },
    stats() { return game ? game.getStats() : {}; },
  };
  window.__game = api;
  return {
    api, pushError,
    attach(g) { game = g; g.firstFrame.then(() => resolveReady(api)); setTimeout(() => resolveReady(api), 1500); },
    failed() { resolveReady(api); },
  };
}
