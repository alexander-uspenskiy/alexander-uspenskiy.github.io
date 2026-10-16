// Pure flow state machine (no DOM). ARCHITECTURE.md §7.
export const STATES = ['title', 'carSelect', 'garage', 'shop', 'paint', 'roster', 'trackSelect', 'raceSettings', 'loading', 'race', 'paused', 'results'];

export const TRANSITIONS = {
  title: ['carSelect', 'garage'],
  carSelect: ['garage', 'title'],
  garage: ['shop', 'paint', 'roster', 'trackSelect', 'title'],
  shop: ['garage', 'roster', 'paint'],
  paint: ['garage', 'shop'],
  roster: ['garage', 'shop'],
  trackSelect: ['raceSettings', 'garage'],
  raceSettings: ['loading', 'trackSelect', 'garage'],
  loading: ['race', 'garage'],
  race: ['paused', 'results'],
  paused: ['race', 'loading', 'garage'],
  results: ['garage'],
};

export function createFlowMachine({ initial = 'title', params: initialParams = {} } = {}) {
  if (!STATES.includes(initial)) throw new Error(`flowMachine: unknown initial state "${initial}"`);
  let state = initial;
  let params = initialParams;
  const listeners = new Set();

  const canTransition = (to) => (TRANSITIONS[state] || []).includes(to);

  function apply(to, p) {
    const from = state;
    state = to;
    params = p ?? {};
    for (const fn of [...listeners]) {
      try { fn(from, to, params); } catch (e) { console.error('[flow] listener error', e); }
    }
    return true;
  }

  return {
    get state() { return state; },
    get params() { return params; },
    canTransition,
    transition(to, p) { return canTransition(to) ? apply(to, p) : false; },
    /** Bypasses the table; debug hooks and error recovery only. */
    force(to, p) {
      if (!STATES.includes(to)) throw new Error(`flowMachine: unknown state "${to}"`);
      return apply(to, p);
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
