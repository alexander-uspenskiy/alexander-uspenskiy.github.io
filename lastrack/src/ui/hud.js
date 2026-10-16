// In-race HUD (DOM, "Neon Holo"). Reads only the snapshot (§5). Minimap drawn by C's createMinimap, injected via begin().
// All colours/typography live in hud.css (CSS custom properties); this module only toggles classes and a few CSS vars.
// Runs at 60 fps: static structure is built once, update() touches only values that changed.
import { h, setText, setStyle, setClass, setChildren, kph, ordinal } from './dom.js';
import { createDash, gearLabel } from './dash.js';
import { icon, weaponIcon, carSilhouette, setDamageZones, damageColor } from './icons.js';
import * as paletteRef from '../render/paletteRef.js';

const FEED_MAX = 4;
const FEED_LIFE = 5; // s
const NS = 'http://www.w3.org/2000/svg';

export const GAUGE_MAX_KPH = 240;
const GAUGE_R = 74, GAUGE_RPM_R = 62, GAUGE_SWEEP = 270, GAUGE_START = 135; // degrees, clockwise from +x (screen space)

// ---------- pure helpers ----------

/** Pure: armor fraction -> legacy palette colour index (lime / yellow / orange / red). Kept for tests/back-compat. */
export function armorColorIndex(frac) {
  if (frac > 0.6) return 11;
  if (frac > 0.35) return 10;
  if (frac > 0.2) return 9;
  return 8;
}

/** Pure: armor fraction 1..0 -> '#rrggbb' (lime -> amber -> red). */
export function armorColorHex(frac) { return damageColor(1 - Math.min(1, Math.max(0, frac))); }

/** Pure: kph -> gauge fill fraction 0..1. */
export function speedFrac(kphValue, max = GAUGE_MAX_KPH) { return Math.min(1, Math.max(0, (kphValue || 0) / max)); }

/** Pure: 1 -> {n:'1', sfx:'st'}, 12 -> {n:'12', sfx:'th'}. */
export function posParts(n) {
  const s = ordinal(Math.max(1, Math.floor(n) || 1));
  const num = String(Math.max(1, Math.floor(n) || 1));
  return { n: num, sfx: s.slice(num.length) };
}

/** Pure: kill-feed line for a 'wreck' event, or null. */
export function feedLine(ev, names) {
  if (ev.type !== 'wreck') return null;
  const victim = names[ev.carId] ?? 'Car ' + ev.carId;
  if (ev.byId === undefined || ev.byId === null || ev.byId < 0 || ev.byId === ev.carId) return `${victim} wrecked`;
  return `${names[ev.byId] ?? 'Car ' + ev.byId} ✕ ${victim}${ev.weaponId === 'spikes' ? ' · SPIKES' : ''}`;
}

/** Pure: standings rows sorted by position. */
export function standings(snap) {
  return [...snap.cars].sort((a, b) => a.position - b.position);
}

/** Pure: co-racer status face: 'fin' (finished), 'dead' (wrecked), 'burn' (on fire), 'hurt' (armour under 35%), else 'ok'. */
export function coracerFace(car) {
  if (car.finished) return 'fin';
  if (car.wrecked) return 'dead';
  if (car.burning) return 'burn';
  if (car.armorMax > 0 && car.armor / car.armorMax < 0.35) return 'hurt';
  return 'ok';
}
const FACE_ICON = { ok: 'faceOk', hurt: 'faceHurt', burn: 'faceBurn', dead: 'faceDead', fin: 'faceFin' };

// ui-local neon fallback for the 16 car colour slots (used when render/paletteRef has no MODERN_HEX yet)
export const CHIP_FALLBACK = [
  '#1b2236', '#3b5bff', '#b0306e', '#1fbf7a', '#d2703c', '#8793a8', '#c9d4e6', '#f4f8ff',
  '#ff4466', '#ffb02e', '#ffe44d', '#5dff9d', '#35b8ff', '#8a7bff', '#ff77c8', '#ffd2b0',
];
/** Pure: car colour slot (0..15) -> hex for standings chips. */
export function carChip(colorIndex) {
  const i = (((Number(colorIndex) | 0) % 16) + 16) % 16;
  const modern = paletteRef.MODERN_HEX;
  return (Array.isArray(modern) && modern[i]) || CHIP_FALLBACK[i];
}

// ---------- small DOM helpers ----------
const clamp01 = (v) => Math.min(1, Math.max(0, v));
function setVar(el, name, v) { const k = '_v_' + name; if (el[k] !== v) { el[k] = v; el.style.setProperty(name, v); } }
/** Restart a CSS animation without reflow by alternating between two identical keyframe classes. */
function retrigger(el, base) {
  el._flip = !el._flip;
  el.classList.remove(base + '-a', base + '-b');
  el.classList.add(base + (el._flip ? '-a' : '-b'));
}
function svgNode(tag, attrs, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
  for (const c of kids) if (c) n.appendChild(c);
  return n;
}
const polar = (r, deg) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 + r * Math.sin((deg * Math.PI) / 180)];
const f1 = (n) => Math.round(n * 10) / 10;
function arcPath(r) {
  const [x0, y0] = polar(r, GAUGE_START), [x1, y1] = polar(r, GAUGE_START + GAUGE_SWEEP);
  return `M${f1(x0)} ${f1(y0)}A${r} ${r} 0 1 1 ${f1(x1)} ${f1(y1)}`;
}
function tickPath(from, to, step, rIn, rOut) {
  let d = '';
  for (let v = from; v <= to; v += step) {
    const a = GAUGE_START + (GAUGE_SWEEP * v) / GAUGE_MAX_KPH, [x0, y0] = polar(rIn, a), [x1, y1] = polar(rOut, a);
    d += `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}`;
  }
  return d;
}

let hudSeq = 0;

function buildGauge() {
  const gid = 'hud-grad-' + ++hudSeq;
  const [hx0] = polar(GAUGE_R, 180), [hx1] = polar(GAUGE_R, 0);
  const arc = svgNode('path', { class: 'hud-g-arc', d: arcPath(GAUGE_R), pathLength: 100, stroke: `url(#${gid})` });
  const rpmArc = svgNode('path', { class: 'hud-g-rpm', d: arcPath(GAUGE_RPM_R), pathLength: 100 });
  const head = svgNode('g', { class: 'hud-g-head' }, svgNode('circle', { cx: f1(polar(GAUGE_R, 0)[0]), cy: 100, r: 5.5 }));
  const speedTxt = svgNode('text', { class: 'hud-g-speed', x: 100, y: 112, 'text-anchor': 'middle' });
  const gearTxt = svgNode('text', { class: 'hud-g-gear', x: 100, y: 150, 'text-anchor': 'middle' });
  speedTxt.textContent = '0';
  const unit = svgNode('text', { class: 'hud-g-unit', x: 100, y: 128, 'text-anchor': 'middle' });
  unit.textContent = 'KPH';
  const svg = svgNode('svg', { class: 'hud-gauge-svg', viewBox: '0 0 200 200', 'aria-hidden': 'true', focusable: 'false' },
    svgNode('defs', {}, svgNode('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: f1(hx0), y1: 100, x2: f1(hx1), y2: 100 },
      svgNode('stop', { offset: 0, 'stop-color': '#35e6ff' }), svgNode('stop', { offset: 1, 'stop-color': '#ff3df0' }))),
    svgNode('circle', { class: 'hud-g-face', cx: 100, cy: 100, r: 96 }),
    svgNode('path', { class: 'hud-g-track', d: arcPath(GAUGE_R), pathLength: 100 }),
    svgNode('path', { class: 'hud-g-ticks', d: tickPath(0, GAUGE_MAX_KPH, 10, 85, 89) }),
    svgNode('path', { class: 'hud-g-ticks major', d: tickPath(0, GAUGE_MAX_KPH, 40, 85, 93) }),
    svgNode('path', { class: 'hud-g-ticks red', d: tickPath(200, GAUGE_MAX_KPH, 10, 85, 91) }),
    svgNode('path', { class: 'hud-g-rpm-track', d: arcPath(GAUGE_RPM_R), pathLength: 100 }),
    rpmArc, arc, head, speedTxt, unit, gearTxt);
  return { svg, arc, rpmArc, head, speedTxt, gearTxt };
}

function buildBar(cls, label, iconName) {
  const fill = h('div.hud-bar-fill');
  const val = h('span.hud-bar-val', '0');
  const el = h('div.hud-bar.' + cls, h('div.hud-bar-head', icon(iconName, { size: 13 }), h('span.hud-bar-label', label), val), h('div.hud-bar-track', fill));
  return { el, fill, val };
}

export function createHud({ root, getWeapon = (id) => ({ name: id }) } = {}) {
  // --- top-left: position + lap ---
  const posN = h('span.hud-pos-n', '1');
  const posSfx = h('span.hud-pos-sfx', 'st');
  const posOf = h('span.hud-pos-of', '/8');
  const lapVal = h('span.hud-lap-val', '1/3');
  const pips = h('div.hud-pips');
  // --- right: minimap + standings ---
  const mapCanvas = h('canvas.hud-map', { width: 180, height: 180 });
  const board = h('div.hud-board');
  // --- bottom-left: gauge + vitals ---
  const gauge = buildGauge();
  const armor = buildBar('hud-armor', 'ARMOUR', 'armor');
  const shield = buildBar('hud-shield.hidden', 'SHIELD', 'bolt');
  const boost = buildBar('hud-boost.hidden', 'BOOST', 'bolt');
  let diagCar = 'hammer';
  const diagHost = h('div.hud-diag');
  let diagSvg = carSilhouette(diagCar);
  diagHost.append(diagSvg);
  // --- centre ---
  const weapons = h('div.hud-weapons');
  const feed = h('div.hud-feed');
  const countNum = h('span');
  const countdown = h('div.hud-count.hidden', countNum);
  const bannerTxt = h('span');
  const banner = h('div.hud-banner.hidden', bannerTxt);
  const noteTxt = h('span');
  const note = h('div.hud-note.hidden', noteTxt);
  const toastTxt = h('span');
  const toastEl = h('div.hud-toast.hidden', toastTxt);
  const vignette = h('div.hud-vignette');
  const fx = h('div.hud-fx');

  const el = h('div.hud.hidden',
    fx, vignette,
    h('div.hud-tl.hud-glass',
      h('div.hud-pos', posN, posSfx, posOf),
      h('div.hud-lap', icon('lap', { size: 14 }), h('span.hud-lap-label', 'LAP'), lapVal), pips),
    h('div.hud-tr',
      h('div.hud-map-frame', mapCanvas),
      h('div.hud-board-wrap.hud-glass', board)),
    h('div.hud-bl',
      h('div.hud-gauge', gauge.svg),
      h('div.hud-vitals', diagHost, h('div.hud-bars', armor.el, shield.el, boost.el))),
    weapons, feed, banner, note, countdown, toastEl);
  root.append(el);
  const dash = createDash({ root: el });

  let minimap = null;
  let names = [];
  let feedItems = [];
  let lastT = 0;
  let toastTimer = 0;
  let wpKey = '';
  let tiles = [];
  let pipKey = '';
  let wasCount = false;
  let goUntil = 0;
  let lastCount = 0;
  let prevArmor = -1;
  let prevDmg = null;
  let lastMsg = '';

  function dropFeedItem(it) { if (it.el) it.el.remove(); }
  function addFeed(text, t, kill) {
    feedItems.push({ text, kill, until: t + FEED_LIFE, el: null });
    while (feedItems.length > FEED_MAX) dropFeedItem(feedItems.shift());
  }

  function buildWeaponTiles(list) {
    tiles = list.map((w, i) => {
      const def = getWeapon(w.id) || { name: w.id };
      const passive = def.kind === 'passive';
      const ammo = h('em.hud-wp-ammo', passive ? 'ON' : String(w.ammo));
      const fill = h('i');
      const tile = h('div.hud-wp' + (passive ? '.passive' : ''), { dataset: { weapon: w.id } },
        h('b.hud-wp-key', String(i + 1)),
        weaponIcon(w.id, { size: 28, cls: 'hud-wp-icon' }),
        h('span.hud-wp-name', def.name ?? w.id),
        ammo,
        passive ? null : h('div.hud-wp-bar', fill));
      return { el: tile, ammo, fill, passive, max: def.maxAmmo || 100 };
    });
    setChildren(weapons, tiles.map((t) => t.el));
  }

  const api = {
    el,
    /** begin({ createMinimap, track, names:[...], hero, carId? }) */
    begin({ createMinimap, track, names: n = [], hero = false, carId } = {}) {
      names = n;
      dash.setEnabled(hero);
      dash.setCar?.(carId);
      setClass(el, 'hud-hero', hero);
      if (carId && carId !== diagCar) {
        diagCar = carId;
        const next = carSilhouette(carId);
        diagSvg.replaceWith(next);
        diagSvg = next;
      }
      setDamageZones(diagSvg, null);
      for (const it of feedItems) dropFeedItem(it);
      feedItems = [];
      lastT = 0;
      wpKey = '';
      pipKey = '';
      wasCount = false;
      goUntil = 0;
      lastCount = 0;
      lastMsg = '';
      prevArmor = -1;
      prevDmg = null;
      setClass(banner, 'hidden', true);
      setClass(countdown, 'hidden', true);
      setClass(el, 'hud-danger', false);
      minimap = null;
      try { if (createMinimap && track) minimap = createMinimap(mapCanvas, track); } catch (e) { console.error('[hud] minimap', e); }
    },
    setNote(text) { setText(noteTxt, text || ''); setClass(note, 'hidden', !text); },
    show() { el.classList.remove('hidden'); },
    hide() { el.classList.add('hidden'); },
    end() { minimap = null; api.hide(); api.setNote(''); },
    toast(text, ms = 1500) {
      setText(toastTxt, text);
      toastEl.classList.remove('hidden');
      retrigger(toastEl, 'pop');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
    },
    update(snap) {
      const me = snap.cars[0];
      if (!me) return;
      const kphNow = kph(me.speed);

      // --- speed gauge ---
      setText(gauge.speedTxt, kphNow);
      const sf = Math.round(speedFrac(kphNow) * 500) / 500;
      if (gauge.arc._f !== sf) {
        gauge.arc._f = sf;
        gauge.arc.style.strokeDasharray = `${(sf * 100).toFixed(2)} 100`; // pathLength=100 spans the whole 270° sweep
        gauge.arc.style.opacity = sf < 0.004 ? '0' : '1';
        gauge.head.style.opacity = sf < 0.004 ? '0' : '1';
        gauge.head.setAttribute('transform', `rotate(${f1(GAUGE_START + GAUGE_SWEEP * sf)} 100 100)`);
      }
      setClass(el, 'hud-fast', sf > 0.82);
      setVar(fx, '--spd', String(Math.round(sf * 20) / 20));
      if (typeof me.rpm === 'number') {
        const rf = Math.round(clamp01(me.rpm) * 200) / 200;
        if (gauge.rpmArc._f !== rf) { gauge.rpmArc._f = rf; gauge.rpmArc.style.strokeDasharray = `${(rf * 100).toFixed(2)} 100`; }
        setClass(el, 'hud-redline', !!me.limiter);
        setText(gauge.gearTxt, gearLabel(me.gear, me.reversing, me.speed || 0));
      }
      dash.update(me);

      // --- position / lap ---
      const pp = posParts(me.position);
      setText(posN, pp.n); setText(posSfx, pp.sfx); setText(posOf, '/' + snap.cars.length);
      const lapNow = Math.min(me.lap, snap.lapsTotal);
      setText(lapVal, `${lapNow}/${snap.lapsTotal}`);
      const pk = snap.lapsTotal + ':' + lapNow;
      if (pk !== pipKey) {
        pipKey = pk;
        const n = Math.min(snap.lapsTotal, 12);
        setChildren(pips, Array.from({ length: n }, (_, i) => h('i.hud-pip' + (i + 1 < lapNow ? '.done' : i + 1 === lapNow ? '.cur' : ''))));
      }

      // --- armour / shield / boost ---
      const frac = me.armorMax > 0 ? clamp01(me.armor / me.armorMax) : 0;
      const q = Math.round(frac * 100);
      setStyle(armor.fill, 'width', q + '%');
      setVar(armor.el, '--c', armorColorHex(q / 100));
      setText(armor.val, Math.round(me.armor));
      const danger = frac < 0.3 && !me.wrecked;
      setClass(el, 'hud-danger', danger);
      if (prevArmor >= 0 && me.armor < prevArmor - 0.5 && me.armorMax > 0) {
        const k = Math.min(1, 0.4 + ((prevArmor - me.armor) / me.armorMax) * 5);
        setVar(vignette, '--k', k.toFixed(2));
        retrigger(vignette, 'flash');
        retrigger(armor.el, 'hit');
      }
      prevArmor = me.armor;
      if (typeof me.shield === 'number') {
        setClass(shield.el, 'hidden', false);
        const sv = me.shieldMax > 0 ? clamp01(me.shield / me.shieldMax) : clamp01(me.shield);
        setStyle(shield.fill, 'width', Math.round(sv * 100) + '%');
        setText(shield.val, Math.round(sv * 100));
      } else setClass(shield.el, 'hidden', true);
      if (me.boost !== undefined && me.boost !== null) {
        setClass(boost.el, 'hidden', false);
        const bv = typeof me.boost === 'boolean' ? (me.boost ? 1 : 0) : me.boostMax > 0 ? clamp01(me.boost / me.boostMax) : clamp01(me.boost);
        setStyle(boost.fill, 'width', Math.round(bv * 100) + '%');
        setText(boost.val, Math.round(bv * 100));
      } else setClass(boost.el, 'hidden', true);

      // --- damage diagram ---
      setDamageZones(diagSvg, me.dmg, { wrecked: !!me.wrecked });
      if (me.dmg) {
        if (prevDmg && me.dmg.some((v, i) => v > (prevDmg[i] ?? 0) + 0.004)) retrigger(diagHost, 'hit');
        prevDmg = me.dmg.slice();
      }
      setClass(diagHost, 'burning', !!me.burning);
      setClass(diagHost, 'smoking', !!me.smoke && !me.burning);

      // --- weapons ---
      const list = me.weapons || [];
      const key = list.map((w) => w.id).join('|');
      if (key !== wpKey) { wpKey = key; buildWeaponTiles(list); }
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i], w = list[i];
        setClass(t.el, 'sel', i === me.activeWeapon);
        setClass(t.el, 'empty', !t.passive && w.ammo <= 0);
        if (!t.passive) {
          setText(t.ammo, String(w.ammo));
          setStyle(t.fill, 'width', Math.round(clamp01(w.ammo / t.max) * 100) + '%');
        }
      }

      // --- standings ---
      const rows = standings(snap);
      const bkey = rows.map((c) => c.id + (c.finished ? 'f' : c.wrecked ? 'w' : '') + (c.isPlayer ? '' : coracerFace(c))).join(',');
      if (board._k !== bkey) {
        board._k = bkey;
        setChildren(board, rows.map((c, i) => {
          const face = coracerFace(c);
          return h('div.hud-row' + (c.isPlayer ? '.me' : '') + (c.wrecked ? '.dead' : '') + (c.finished ? '.fin' : ''),
            h('b', String(c.position ?? i + 1)), h('i.hud-chip', { style: { background: c.livery ? '#' + (c.livery.paintHex >>> 0).toString(16).padStart(6, '0') : carChip(c.color) } }), h('span', c.name),
            ...(c.isPlayer ? [] : [icon(FACE_ICON[face], { size: 13, cls: 'hud-face ' + face })]));
        }));
      }

      // --- events -> feed / toasts ---
      for (const ev of snap.events || []) {
        const line = feedLine(ev, names);
        if (line) addFeed(line, snap.t, ev.byId !== undefined && ev.byId !== null && ev.byId >= 0 && ev.byId !== ev.carId);
        if (ev.type === 'pickup' && ev.carId === 0) api.toast(`PICKUP: ${String(ev.pickupType).toUpperCase()}`, 1000);
        if (ev.type === 'lap' && ev.carId === 0) api.toast(`LAP ${ev.lap}`, 1200);
      }
      if (snap.t < lastT) { for (const it of feedItems) dropFeedItem(it); feedItems = []; }
      lastT = snap.t;
      for (let i = feedItems.length - 1; i >= 0; i--) {
        const it = feedItems[i];
        if (it.until <= snap.t) { dropFeedItem(it); feedItems.splice(i, 1); }
      }
      for (const it of feedItems) {
        if (!it.el) { it.el = h('div.hud-feed-item', icon(it.kill ? 'target' : 'skull', { size: 14 }), h('span', it.text)); feed.append(it.el); }
        setClass(it.el, 'out', it.until - snap.t < 0.5);
      }

      // --- countdown / banners ---
      const inCount = snap.phase === 'countdown';
      setClass(countdown, 'hidden', !inCount);
      if (inCount) {
        const n = Math.max(1, Math.ceil(snap.countdown));
        if (n !== lastCount) { lastCount = n; setText(countNum, String(n)); retrigger(countdown, 'tick'); }
      } else lastCount = 0;
      if (!inCount && wasCount) goUntil = snap.t + 1;
      wasCount = inCount;
      let msg = '';
      if (me.wrecked) msg = 'WRECKED';
      else if (me.finished) msg = me.position === 1 ? 'FINISH — WINNER!' : 'FINISH';
      else if (snap.phase === 'racing' && snap.t < goUntil) msg = 'GO!';
      setClass(banner, 'hidden', !msg);
      if (msg) {
        setText(bannerTxt, msg);
        setClass(banner, 'bad', me.wrecked);
        setClass(banner, 'go', msg === 'GO!');
        setClass(banner, 'win', !!me.finished && !me.wrecked);
        if (msg !== lastMsg) retrigger(banner, 'pop');
      }
      lastMsg = msg;
      try { minimap?.draw(snap); } catch (e) { minimap = null; console.error('[hud] minimap draw', e); }
    },
    dispose() { clearTimeout(toastTimer); el.remove(); },
    dash,
  };
  return api;
}
