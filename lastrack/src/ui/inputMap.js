// Pure keyboard/touch -> PlayerInput mapping (no DOM). ARCHITECTURE.md §4 PlayerInput, §7 controls.
const has = (set, ...codes) => codes.some((c) => set.has(c));

export function neutralInput() {
  return { throttle: 0, brake: 0, steer: 0, fire: false, cycleWeapon: false, selectWeapon: null, handbrake: false };
}

/** @param {Set<string>} pressed KeyboardEvent.code values */
export function keysToInput(pressed) {
  const right = has(pressed, 'ArrowRight', 'KeyD') ? 1 : 0;
  const left = has(pressed, 'ArrowLeft', 'KeyA') ? 1 : 0;
  return {
    throttle: has(pressed, 'ArrowUp', 'KeyW') ? 1 : 0,
    brake: has(pressed, 'ArrowDown', 'KeyS') ? 1 : 0,
    steer: right - left,
    fire: pressed.has('Space'),
    cycleWeapon: false,
    selectWeapon: null,
    handbrake: has(pressed, 'ShiftLeft', 'ShiftRight'),
  };
}

export const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyE',
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
]);

export const ACTION_KEYS = { Escape: 'pause', KeyP: 'pause', KeyC: 'camera', KeyM: 'mute', KeyG: 'quality' };
export const actionForKey = (code) => ACTION_KEYS[code] || null;
export const isGameKey = (code) => GAME_KEYS.has(code);
export const isCycleKey = (code) => code === 'KeyE' || code === 'Tab';
/** Digit1..Digit4 -> slot index 0..3, else null. */
export function weaponSlotForKey(code) {
  const m = /^Digit([1-4])$/.exec(code);
  return m ? Number(m[1]) - 1 : null;
}

/** Combine two inputs: strongest analog wins, booleans OR. */
export function mergeInputs(a, b) {
  if (!b) return a;
  const pick = (x, y) => (Math.abs(y) > Math.abs(x) ? y : x);
  return {
    throttle: Math.max(a.throttle, b.throttle),
    brake: Math.max(a.brake, b.brake),
    steer: pick(a.steer, b.steer),
    fire: a.fire || b.fire,
    cycleWeapon: a.cycleWeapon || b.cycleWeapon,
    selectWeapon: b.selectWeapon ?? a.selectWeapon ?? null,
    handbrake: a.handbrake || b.handbrake,
  };
}
