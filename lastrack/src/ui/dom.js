// Tiny DOM helpers + formatting. Import-safe in Node (DOM touched only inside functions).

/** h('div.cls#id', {onclick, dataset, style, class, text}, ...children) */
export function h(tag, props, ...children) {
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
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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
      fill.style.width = p + '%';
      val.textContent = text ?? String(Math.round(v));
    },
  };
}
export function pips(level, max) {
  return h('span.pips', Array.from({ length: max }, (_, i) => h('i.pip' + (i < level ? '.on' : ''))));
}
export function screenHeader(title, subtitle) {
  return h('header.screen-head', h('h1', title), subtitle ? h('p.sub', subtitle) : null);
}
/** Esc -> .btn-back, Enter -> .btn-primary while shown. Returns detach(). */
export function attachMenuKeys(root) {
  const fn = (e) => {
    if (e.key === 'Escape') {
      const b = root.querySelector('.btn-back');
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) {
      const b = root.querySelector('.btn-primary');
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    }
  };
  window.addEventListener('keydown', fn);
  return () => window.removeEventListener('keydown', fn);
}
