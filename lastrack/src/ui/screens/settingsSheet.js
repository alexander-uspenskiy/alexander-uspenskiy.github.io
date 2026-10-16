// Settings modal (title + pause): quality, master/music/sfx volume, mute, control hints, default camera.
import { h, button } from '../dom.js';
import { QUALITIES, CAMERAS } from '../settings.js';

const CAMERA_LABEL = { chase: 'CHASE', cockpit: 'COCKPIT', bumper: 'BUMPER', tv: 'TV', top: 'TOP' };

export function createSettingsSheet({ game }) {
  const rows = {};
  const slider = (key, label) => {
    const input = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': label });
    const val = h('span.val');
    input.addEventListener('input', () => { game.updateSettings({ [key]: input.value / 100 }); sync(); });
    rows[key] = { input, val };
    return h('div.setting-row', h('label', label), h('div.ctl', input, val));
  };
  const seg = (key, values, labels) => {
    const btns = values.map((v) => button(labels ? labels[v] : v.toUpperCase(), () => { game.updateSettings({ [key]: v }); sync(); }, 'btn-small'));
    rows[key] = { btns, values };
    return h('div.seg', { role: 'group' }, btns);
  };
  const toggle = (key, label) => {
    const sw = h('button.switch', { type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': 'false' });
    sw.addEventListener('click', () => { game.updateSettings({ [key]: !game.settings[key] }); sync(); });
    rows[key] = { sw };
    return h('div.setting-row', h('label', label), h('div.ctl', sw));
  };
  function sync() {
    const s = game.settings;
    for (const k of ['master', 'music', 'sfx']) {
      const r = rows[k]; r.input.value = Math.round(s[k] * 100); r.val.textContent = Math.round(s[k] * 100); r.input.style.setProperty('--v', Math.round(s[k] * 100) + '%');
    }
    for (const k of ['quality', 'camera']) rows[k].btns.forEach((b, i) => b.classList.toggle('on', rows[k].values[i] === s[k]));
    for (const k of ['muted', 'hints', 'nameplates', 'analytics']) rows[k].sw.setAttribute('aria-checked', String(!!s[k]));
  }
  const closeBtn = button('DONE', () => api.close(), 'btn-primary btn-back');
  const sheet = h('div.panel.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' },
    h('h2', 'SETTINGS'),
    h('div.setting-row', h('label', 'GRAPHICS QUALITY'), h('div.ctl', seg('quality', QUALITIES))),
    slider('master', 'MASTER VOLUME'), slider('music', 'MUSIC'), slider('sfx', 'SFX'),
    toggle('muted', 'MUTE ALL'),
    toggle('hints', 'CONTROL HINTS'),
    toggle('nameplates', 'RIVAL NAMEPLATES'),
    toggle('analytics', 'SHARE ANONYMOUS USAGE STATS'),
    h('div.setting-row', h('label', 'DEFAULT CAMERA'), h('div.ctl', seg('camera', CAMERAS, CAMERA_LABEL))),
    h('p.muted.small', 'G cycles quality · C cycles camera · M mutes during a race. Settings are saved on this device.'),
    h('div.row.center', closeBtn));
  const el = h('div.modal.hidden', { onclick: (e) => { if (e.target === el) api.close(); } }, sheet);
  let prevFocus = null;
  const onKey = (e) => {
    if (el.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); }
    else if (e.key === 'Tab') {
      const f = [...sheet.querySelectorAll('button:not(:disabled), input')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  };
  document.addEventListener('keydown', onKey, true);
  const api = {
    el,
    open() { prevFocus = document.activeElement; sync(); el.classList.remove('hidden'); setTimeout(() => (sheet.querySelector('.seg .btn.on') || closeBtn).focus(), 30); },
    close() { el.classList.add('hidden'); try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch { /* ignore */ } },
    get isOpen() { return !el.classList.contains('hidden'); },
    dispose() { document.removeEventListener('keydown', onKey, true); el.remove(); },
  };
  return api;
}
