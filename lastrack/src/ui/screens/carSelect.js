import { h, button, statBar, screenHeader, fmtMoney, attachMenuKeys } from '../dom.js';
import { CARS } from '../../data/cars.js';
import { paletteHex } from '../../data/palette.js';
import { getWeapon } from '../../data/weapons.js';

const STATS = [
  ['SPEED', 'maxSpeed', 80], ['ACCEL', 'accel', 40], ['GRIP', 'grip', 1.6], ['ARMOR', 'armor', 200], ['SLOTS', 'slots', 3],
];

export function createCarSelectScreen({ game, flow }) {
  let idx = 0;
  const canvas = h('canvas.preview-canvas', { width: 480, height: 300 });
  const name = h('h2.car-name');
  const blurb = h('p.car-blurb');
  const weaponsEl = h('p.muted.small');
  const bars = STATS.map(([label]) => statBar(label));
  const dots = h('div.car-dots', CARS.map((c, i) => h('button.dot', { type: 'button', 'aria-label': c.name, dataset: { car: c.id }, onclick: () => pick(i) })));
  let preview = null;

  function pick(i) {
    idx = (i + CARS.length) % CARS.length;
    const c = CARS[idx];
    name.textContent = c.name.toUpperCase();
    name.style.color = paletteHex(c.color);
    blurb.textContent = c.blurb;
    weaponsEl.textContent = 'STARTS WITH: ' + c.startWeapons.map((w) => `${getWeapon(w.id)?.name ?? w.id} ×${w.ammo}`).join(', ');
    STATS.forEach(([, key, max], n) => bars[n].set(c.base[key], max, key === 'maxSpeed' ? Math.round(c.base[key] * 3.6) + ' kph' : undefined));
    [...dots.children].forEach((d, n) => d.classList.toggle('on', n === idx));
    if (preview) try { preview.show({ carId: c.id, color: c.color, upgrades: { armor: 0, engine: 0, tyres: 0 } }); } catch (e) { game.reportError(e); }
  }
  const choose = button('BUY & CONTINUE', () => { game.chooseCar(CARS[idx].id); flow.transition('garage'); }, 'btn-primary');
  const back = button('BACK', () => flow.transition('title'), 'btn-back');
  const el = h('section.screen.screen-cars',
    screenHeader('CHOOSE YOUR RIDE', 'Pick your first car. The rest comes with the winnings.'),
    h('div.cars-body',
      h('div.panel.preview-box', canvas, h('div.row.center', button('◀', () => pick(idx - 1), 'btn-small'), dots, button('▶', () => pick(idx + 1), 'btn-small'))),
      h('div.panel.car-info', name, blurb, h('div.bars', bars.map((b) => b.el)), weaponsEl, h('p.muted.small', 'Price: ' + fmtMoney(0) + ' — your first car is on the house.'))),
    h('footer.screen-foot', back, choose));
  let detach = null;
  return {
    el,
    show() {
      detach = attachMenuKeys(el);
      preview = game.createPreview(canvas);
      pick(Math.max(0, CARS.findIndex((c) => c.id === game.getSave().carId)));
    },
    hide() { detach?.(); preview?.dispose(); preview = null; },
  };
}
