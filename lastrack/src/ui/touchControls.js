// On-screen controls for touch devices: steer pad + gas/brake + fire/cycle/handbrake/camera.
import { h } from './dom.js';
import { icon } from './icons.js';

/** Pure: hold state -> PlayerInput fields. */
export function holdsToInput(hold) {
  return {
    throttle: hold.gas ? 1 : 0,
    brake: hold.brake ? 1 : 0,
    steer: (hold.right ? 1 : 0) - (hold.left ? 1 : 0),
    fire: !!hold.fire,
    cycleWeapon: false,
    selectWeapon: null,
    handbrake: !!hold.hand,
  };
}

export function createTouchControls({ root, onAction = () => {}, onCycle = () => {} } = {}) {
  const hold = { left: false, right: false, gas: false, brake: false, fire: false, hand: false };
  const active = new Map();

  // Visual only: round glass buttons (hud.css .tc*). Each button = glyph + caption; the aria-label keeps the spoken name.
  const face = (glyph, label, text) => [glyph ? icon(glyph, { size: 22, cls: 'tc-ico' }) : null, text === null ? null : h('span.tc-cap', text ?? label)];

  function holdButton(key, cls, label, glyph, text) {
    const btn = h('button.tc-btn.' + cls, { type: 'button', 'aria-label': label, tabindex: -1 }, face(glyph, label, text));
    const down = (e) => {
      e.preventDefault();
      if (active.has(e.pointerId)) return;
      try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      active.set(e.pointerId, { btn, key });
      hold[key] = true; btn.classList.add('down');
    };
    const up = (e) => {
      const a = active.get(e.pointerId);
      if (!a || a.btn !== btn) return;
      active.delete(e.pointerId);
      hold[key] = [...active.values()].some((v) => v.key === key);
      btn.classList.remove('down');
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    return btn;
  }
  function tapButton(cls, label, fn, glyph) {
    const btn = h('button.tc-btn.' + cls, { type: 'button', 'aria-label': label, tabindex: -1 }, face(glyph, label));
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.classList.add('down'); fn(); });
    const clr = () => btn.classList.remove('down');
    btn.addEventListener('pointerup', clr);
    btn.addEventListener('pointercancel', clr);
    btn.addEventListener('pointerleave', clr);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    return btn;
  }

  const el = h('div.tc.hidden',
    h('div.tc-steer', holdButton('left', 'tc-left', 'LEFT', 'back', null), holdButton('right', 'tc-right', 'RIGHT', 'forward', null)),
    h('div.tc-rgroup',
      h('div.tc-aux', holdButton('hand', 'tc-hand', 'DRIFT', 'car'), tapButton('tc-cycle', 'WPN', () => onCycle(), 'target'), tapButton('tc-cam', 'CAM', () => onAction('camera'), 'camera')),
      h('div.tc-pedals', holdButton('brake', 'tc-brake', 'BRAKE', 'pause'), holdButton('fire', 'tc-fire', 'FIRE', 'skull'), holdButton('gas', 'tc-gas', 'GAS', 'bolt'))));
  el.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  root.append(el);

  function release() {
    active.clear();
    for (const k of Object.keys(hold)) hold[k] = false;
    for (const b of el.querySelectorAll('.tc-btn.down')) b.classList.remove('down');
  }
  return {
    el,
    read() { return holdsToInput(hold); },
    setVisible(on) { el.classList.toggle('hidden', !on); if (!on) release(); },
    release,
    dispose() { release(); el.remove(); },
  };
}
