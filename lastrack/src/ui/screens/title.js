// Title screen over the live 3D showroom: logo, Continue / New Game / Hero Slice / Settings.
import { h, attachMenuKeys, fmtMoney } from '../dom.js';
import { icon } from '../icons.js';
import { getCar } from '../../data/cars.js';
import { GAME_TRACKS } from '../../data/tracks/index.js';
import { VERSION } from '../../version.js';

/** Pure: one-line save summary for the Continue button. */
export function saveSummary(save) {
  if (!save) return '';
  const car = getCar(save.carId);
  const open = GAME_TRACKS.filter((t, i) => i === 0 || (save.unlockedTracks || []).includes(t.id)).length;
  return `${fmtMoney(save.cash)} · ${car ? car.name : 'No car'} · ${open}/${GAME_TRACKS.length} tracks`;
}

function menuButton(label, sub, onClick, cls = '', key = '') {
  const b = h('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button', onclick: onClick },
    h('span.lbl', label, sub ? h('span.sub', sub) : null), key ? h('span.k', key) : null, h('span.arrow', icon('play', { size: 16 })));
  return b;
}

export function createTitleScreen({ game, flow, openSettings }) {
  const cont = menuButton('CONTINUE', '', () => flow.transition('garage'), 'btn-primary btn-continue');
  const ng = menuButton('NEW GAME', 'Pick a car, start with $5,000', () => {
    if (game.hasSavedGame() && !confirm('Start over? Your current save will be erased.')) return;
    game.newGame();
    flow.transition('carSelect');
  }, 'btn-new');
  const setBtn = menuButton('SETTINGS', 'Graphics · audio · controls', () => openSettings(), 'btn-settings');
  const menu = h('nav.menu', { 'aria-label': 'Main menu' }, cont, ng, setBtn);
  const keys = h('p.keys',
    ...[['WASD', 'drive'], ['SPACE', 'fire'], ['E', 'weapon'], ['1-4', 'select'], ['SHIFT', 'drift'], ['C', 'camera'], ['P', 'pause'], ['M', 'mute']].map(([k, t]) => h('span', h('kbd', k), t)),
    h('span', h('kbd', '↑↓←→'), 'menus'), h('span', h('kbd', 'GAMEPAD'), 'supported'));
  const el = h('section.screen.screen-title.screen-3d',
    h('div.title-main',
      h('div.eyebrow', 'Vehicular combat league'),
      h('h1.logo', { 'aria-label': 'Last Track' }, h('span', 'LAST'), h('span.alt', 'TRACK')),
      h('p.tag', 'Race for money. Race for your life.'),
      menu),
    h('div.title-foot', keys, h('span.ver', `v${VERSION} · three.js`)));
  let detach = null;
  return {
    el,
    show() {
      detach = attachMenuKeys(el);
      const saved = game.hasSavedGame();
      cont.disabled = !saved;
      cont.classList.toggle('btn-primary', saved);
      ng.classList.toggle('btn-primary', !saved);
      const lbl = cont.querySelector('.lbl');
      lbl.querySelector('.sub')?.remove();
      lbl.append(h('span.sub', saved ? saveSummary(game.getSave()) : 'No saved game yet'));
      if (!saved) setTimeout(() => ng.focus({ preventScroll: true }), 80);
    },
    hide() { detach?.(); detach = null; },
  };
}
