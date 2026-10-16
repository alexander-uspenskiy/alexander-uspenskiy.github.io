// DOM input: keyboard (+ touch source) -> PlayerInput, UI action callbacks.
import { keysToInput, actionForKey, isGameKey, isCycleKey, weaponSlotForKey, mergeInputs } from './inputMap.js';

const isTextTarget = (t) => !!t && !!t.tagName && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true);

/** createInput({ target, isRaceActive, onAction }); onAction(name) for 'pause' | 'camera' | 'mute' | 'quality'. */
export function createInput({ target = window, isRaceActive = () => false, onAction = () => {} } = {}) {
  const pressed = new Set();
  let cycleEdge = false;
  let selectEdge = null;
  let override = null;
  let touchSource = null;

  const onKeyDown = (e) => {
    if (isTextTarget(e.target)) return;
    if (isRaceActive() && isGameKey(e.code)) e.preventDefault();
    if (e.metaKey) pressed.clear();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!e.repeat) {
      if (isRaceActive()) {
        if (isCycleKey(e.code)) cycleEdge = true;
        const slot = weaponSlotForKey(e.code);
        if (slot !== null) selectEdge = slot;
      }
      const a = actionForKey(e.code);
      if (a) onAction(a, e);
    }
    pressed.add(e.code);
  };
  const onKeyUp = (e) => { pressed.delete(e.code); };
  const clearAll = () => { pressed.clear(); };
  const onVis = () => { if (document.hidden) clearAll(); };
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearAll);
  document.addEventListener('visibilitychange', onVis);

  return {
    pressed,
    /** @returns {PlayerInput}; cycleWeapon / selectWeapon are one-read edges. */
    read() {
      let inp = keysToInput(pressed);
      if (touchSource) inp = mergeInputs(inp, touchSource());
      inp = { ...inp, cycleWeapon: inp.cycleWeapon || cycleEdge, selectWeapon: selectEdge ?? inp.selectWeapon ?? null };
      cycleEdge = false;
      selectEdge = null;
      if (override) inp = { ...inp, ...override };
      return inp;
    },
    setTouchSource(fn) { touchSource = typeof fn === 'function' ? fn : null; },
    pulseCycle() { cycleEdge = true; },
    setOverride(partial) { override = partial ? { ...partial } : null; },
    clear() { clearAll(); cycleEdge = false; selectEdge = null; },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearAll);
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
