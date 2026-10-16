// In-race HUD (DOM). Reads only the snapshot (§5). Minimap drawn by C's createMinimap, injected via begin().
import { h, setText, setStyle, setClass, setChildren, kph, ordinal } from './dom.js';
import { paletteHex } from '../data/palette.js';
import { createDash } from './dash.js';

const FEED_MAX = 4;
const FEED_LIFE = 5; // s

/** Pure: armor fraction -> palette colour index (lime / yellow / orange / red). */
export function armorColorIndex(frac) {
  if (frac > 0.6) return 11;
  if (frac > 0.35) return 10;
  if (frac > 0.2) return 9;
  return 8;
}

/** Pure: kill-feed line for a 'wreck' event, or null. */
export function feedLine(ev, names) {
  if (ev.type !== 'wreck') return null;
  const victim = names[ev.carId] ?? 'Car ' + ev.carId;
  if (ev.byId === undefined || ev.byId === null || ev.byId < 0 || ev.byId === ev.carId) return `${victim} wrecked`;
  return `${names[ev.byId] ?? 'Car ' + ev.byId} ✕ ${victim}`;
}

/** Pure: standings rows sorted by position. */
export function standings(snap) {
  return [...snap.cars].sort((a, b) => a.position - b.position);
}

export function createHud({ root, getWeapon = (id) => ({ name: id }) } = {}) {
  const speed = h('span.hud-speed-val', '0');
  const lap = h('span.hud-lap-val', '1/3');
  const pos = h('span.hud-pos-val', '1st');
  const armorFill = h('div.hud-armor-fill');
  const armorTxt = h('span.hud-armor-txt');
  const weapons = h('div.hud-weapons');
  const board = h('div.hud-board');
  const feed = h('div.hud-feed');
  const banner = h('div.hud-banner.hidden');
  const countdown = h('div.hud-count.hidden');
  const mapCanvas = h('canvas.hud-map', { width: 180, height: 180 });
  const toastEl = h('div.hud-toast.hidden');
  const note = h('div.hud-note.hidden');
  const el = h('div.hud.hidden',
    h('div.hud-tl.panel', h('div.hud-pos', pos), h('div.hud-lap', 'LAP ', lap)),
    h('div.hud-tr', mapCanvas),
    h('div.hud-board-wrap', board),
    h('div.hud-bl.panel', h('div.hud-speed', speed, h('small', ' KPH')),
      h('div.hud-armor', h('span', 'ARMOR'), h('div.hud-armor-track', armorFill), armorTxt)),
    weapons, feed, banner, note, countdown, toastEl);
  root.append(el);
  const dash = createDash({ root: el });

  let minimap = null;
  let names = [];
  let feedItems = [];
  let lastT = 0;
  let toastTimer = 0;
  let wpKey = '';
  let wasCount = false;
  let goUntil = 0;

  function addFeed(text, t) {
    feedItems.push({ text, until: t + FEED_LIFE });
    if (feedItems.length > FEED_MAX) feedItems.shift();
  }

  const api = {
    el,
    /** begin({ createMinimap, track, names:[...] }) */
    begin({ createMinimap, track, names: n = [], hero = false } = {}) {
      names = n;
      dash.setEnabled(hero);
      setClass(el, 'hud-hero', hero);
      feedItems = [];
      lastT = 0;
      wpKey = '';
      wasCount = false;
      goUntil = 0;
      feed.textContent = '';
      banner.classList.add('hidden');
      minimap = null;
      try { if (createMinimap && track) minimap = createMinimap(mapCanvas, track); } catch (e) { console.error('[hud] minimap', e); }
    },
    setNote(text) { setText(note, text || ''); setClass(note, 'hidden', !text); },
    show() { el.classList.remove('hidden'); },
    hide() { el.classList.add('hidden'); },
    end() { minimap = null; api.hide(); api.setNote(''); },
    toast(text, ms = 1500) {
      setText(toastEl, text);
      toastEl.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
    },
    update(snap) {
      const me = snap.cars[0];
      if (!me) return;
      setText(speed, kph(me.speed));
      dash.update(me);
      setText(lap, `${Math.min(me.lap, snap.lapsTotal)}/${snap.lapsTotal}`);
      setText(pos, `${ordinal(me.position)}/${snap.cars.length}`);
      const frac = me.armorMax > 0 ? Math.max(0, me.armor / me.armorMax) : 0;
      setStyle(armorFill, 'width', (frac * 100).toFixed(0) + '%');
      setStyle(armorFill, 'background', paletteHex(armorColorIndex(frac)));
      setText(armorTxt, Math.round(me.armor));
      setClass(el, 'hud-danger', frac < 0.3 && !me.wrecked);

      // weapons
      const key = me.weapons.map((w) => `${w.id}:${w.ammo}`).join('|') + '@' + me.activeWeapon;
      if (key !== wpKey) {
        wpKey = key;
        setChildren(weapons, me.weapons.map((w, i) => h('div.hud-wp' + (i === me.activeWeapon ? '.sel' : '') + (w.ammo <= 0 && getWeapon(w.id)?.kind !== 'passive' ? '.empty' : ''),
          h('b', String(i + 1)), h('span', getWeapon(w.id)?.name ?? w.id), h('em', getWeapon(w.id)?.kind === 'passive' ? 'ON' : String(w.ammo)))));
      }

      // standings
      const rows = standings(snap);
      const bkey = rows.map((c) => c.id + (c.finished ? 'f' : c.wrecked ? 'w' : '')).join(',');
      if (board._k !== bkey) {
        board._k = bkey;
        setChildren(board, rows.map((c) => h('div.hud-row' + (c.isPlayer ? '.me' : '') + (c.wrecked ? '.dead' : ''),
          h('b', String(c.position)), h('i', { style: { background: paletteHex(c.color) } }), h('span', c.name))));
      }

      // events -> feed
      for (const ev of snap.events || []) {
        const line = feedLine(ev, names);
        if (line) addFeed(line, snap.t);
        if (ev.type === 'pickup' && ev.carId === 0) api.toast(`PICKUP: ${String(ev.pickupType).toUpperCase()}`, 1000);
        if (ev.type === 'lap' && ev.carId === 0) api.toast(`LAP ${ev.lap}`, 1200);
      }
      if (snap.t < lastT) feedItems = [];
      lastT = snap.t;
      const live = feedItems.filter((f) => f.until > snap.t);
      const fkey = live.map((f) => f.text).join('\n');
      if (feed._k !== fkey) { feed._k = fkey; setChildren(feed, live.map((f) => h('div', f.text))); }

      // countdown / banners
      const inCount = snap.phase === 'countdown';
      setClass(countdown, 'hidden', !inCount);
      if (inCount) setText(countdown, String(Math.max(1, Math.ceil(snap.countdown))));
      else if (wasCount) goUntil = snap.t + 1;
      wasCount = inCount;
      let msg = '';
      if (me.wrecked) msg = 'WRECKED';
      else if (me.finished) msg = me.position === 1 ? 'FINISH — WINNER!' : 'FINISH';
      else if (snap.phase === 'racing' && snap.t < goUntil) msg = 'GO!';
      setClass(banner, 'hidden', !msg);
      if (msg) { setText(banner, msg); setClass(banner, 'bad', me.wrecked); }
      try { minimap?.draw(snap); } catch (e) { minimap = null; console.error('[hud] minimap draw', e); }
    },
    dispose() { clearTimeout(toastTimer); el.remove(); },
    dash,
  };
  return api;
}
