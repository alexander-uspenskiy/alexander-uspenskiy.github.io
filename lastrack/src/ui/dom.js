// Tiny DOM helpers + formatting. Import-safe in Node (DOM touched only inside functions).
import { nextFocus, countValue } from './menuLogic.js';

/** h('div.cls#id', {onclick, dataset, style, class, text}, ...children) */
export function h(tag, props, ...children) {
  tag = String(tag).trim().replace(/\s+/g, '.');   // 'div.a b' -> 'div.a.b'
  let t = tag;
  const cls = [];
  let id = null;
  const m = /^([a-zA-Z0-9]+)?((?:[.#][\w-]+)*)$/.exec(tag);
  if (m) {
    t = m[1] || 'div';
    for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
      if (part[0] === '.') cls.push(part.slice(1)); else id = part.slice(1);
    }
  }
  const el = document.createElement(t);
  if (cls.length) el.setAttribute('class', cls.join(' '));
  if (id) el.id = id;
  if (props && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class' || k === 'className') el.setAttribute('class', [...cls, v].join(' '));
      else if (k === 'style' && typeof v === 'object') { for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val; } }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  return append(el, children);
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function setChildren(el, ...children) { clear(el); return append(el, children); }
export function setText(el, v) { const s = String(v); if (el._t !== s) { el._t = s; el.textContent = s; } }
export function setStyle(el, prop, v) { const k = '_s_' + prop; if (el[k] !== v) { el[k] = v; el.style[prop] = v; } }
export function setClass(el, cls, on) { const k = '_c_' + cls; if (el[k] !== !!on) { el[k] = !!on; el.classList.toggle(cls, !!on); } }

// ---------- formatting ----------
export const kph = (ms) => Math.round(ms * 3.6);
export const pad2 = (n) => String(n).padStart(2, '0');
export const fmtMoney = (n) => '$' + Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US');
export function fmtTime(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '--:--.--';
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(2).padStart(5, '0')}`;
}
export function ordinal(n) {
  const v = n % 100;
  const s = ['th', 'st', 'nd', 'rd'];
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- widgets ----------
export function button(label, onClick, cls = '') {
  return h('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button', onclick: onClick }, label);
}
/** Horizontal stat bar: returns {el, set(value, max)} */
export function statBar(label) {
  const fill = h('div.bar-fill');
  const val = h('span.bar-val');
  const el = h('div.statbar', h('span.bar-label', label), h('div.bar-track', fill), val);
  return {
    el,
    set(v, max = 100, text) {
      const p = Math.max(0, Math.min(100, (v / max) * 100));
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => { fill.style.width = p + '%'; }); else fill.style.width = p + '%';
      val.textContent = text ?? String(Math.round(v));
    },
  };
}
export function pips(level, max) {
  return h('span.pips', Array.from({ length: max }, (_, i) => h('i.pip' + (i < level ? '.on' : ''))));
}
export function screenHeader(title, subtitle, aside) {
  return h('header.screen-head', h('div', h('h1', title), subtitle ? h('p.sub', subtitle) : null), aside ? h('div.head-aside', aside) : null);
}
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';
const visibleFocusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((e) => e.offsetParent !== null && !e.closest('.hidden'));
function moveFocus(root, dir) {
  const els = visibleFocusables(root);
  if (!els.length) return;
  const cur = els.indexOf(document.activeElement);
  const rects = els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const n = nextFocus(rects, cur, dir);
  if (n >= 0 && els[n]) els[n].focus({ preventScroll: false });
}
export function focusFirst(root) {
  const el = root.querySelector('[data-autofocus]:not(:disabled)') || root.querySelector('.btn-primary:not(:disabled)') || visibleFocusables(root)[0];
  if (el) try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
}

/** Esc/B -> .btn-back, Enter/A -> .btn-primary (or the focused control); arrows/D-pad/left stick move focus spatially. Returns detach(). */
export function attachMenuKeys(root, { autofocus = true } = {}) {
  const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const modal = () => document.querySelector('.modal:not(.hidden)');
  const fn = (e) => {
    if (modal() && !root.contains(modal())) return;
    const tag = e.target && e.target.tagName;
    if (e.key === 'Escape') {
      const b = root.querySelector('.btn-back');
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (e.key === 'Enter' && !(tag === 'BUTTON')) {
      const b = root.querySelector('.btn-primary');
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (ARROWS[e.key] && !e.altKey && !e.ctrlKey && !e.metaKey && tag !== 'INPUT') {
      e.preventDefault(); moveFocus(root, ARROWS[e.key]);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tag === 'INPUT' && e.target.type !== 'range') { e.preventDefault(); moveFocus(root, ARROWS[e.key]); }
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && tag === 'INPUT') { e.preventDefault(); moveFocus(root, ARROWS[e.key]); }
  };
  window.addEventListener('keydown', fn);
  // gamepad: edge/repeat polling while the screen is shown
  let raf = 0, held = {}, rep = {};
  const poll = (t) => {
    raf = requestAnimationFrame(poll);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const state = { up: b(12) || ay < -0.55, down: b(13) || ay > 0.55, left: b(14) || ax < -0.55, right: b(15) || ax > 0.55, a: b(0), b: b(1), start: b(9) };
    for (const k of Object.keys(state)) {
      const on = state[k];
      if (on && (!held[k] || (['up', 'down', 'left', 'right'].includes(k) && t - (rep[k] || 0) > 220))) {
        rep[k] = t;
        if (modal() && !root.contains(modal())) { held[k] = on; continue; }
        if (k === 'a') { const f = document.activeElement; if (f && f.click && root.contains(f)) f.click(); else root.querySelector('.btn-primary')?.click(); }
        else if (k === 'b') root.querySelector('.btn-back')?.click();
        else if (k === 'start') root.querySelector('.btn-primary')?.click();
        else moveFocus(root, k);
      }
      held[k] = on;
    }
  };
  if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(poll);
  if (autofocus) setTimeout(() => focusFirst(root), 60);
  return () => { window.removeEventListener('keydown', fn); cancelAnimationFrame(raf); };
}

/** Animated number: counts from `from` to `to` over ms (instant when reduced motion). fmt(n) -> string. */
export function animateCount(el, to, { from = 0, ms = 900, fmt = String, delay = 0 } = {}) {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || ms <= 0) { el.textContent = fmt(to); return () => {}; }
  let raf = 0, t0 = 0, cancelled = false;
  el.textContent = fmt(from);
  const step = (t) => {
    if (cancelled) return;
    if (!t0) t0 = t + delay;
    const k = (t - t0) / ms;
    if (k < 0) { raf = requestAnimationFrame(step); return; }
    el.textContent = fmt(countValue(from, to, k));
    if (k < 1) raf = requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  raf = requestAnimationFrame(step);
  return () => { cancelled = true; cancelAnimationFrame(raf); };
}
