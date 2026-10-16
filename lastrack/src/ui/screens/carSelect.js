import { h, button, statBar, screenHeader, fmtMoney, attachMenuKeys } from '../dom.js';
import { CARS } from '../../data/cars.js';
import { getWeapon } from '../../data/weapons.js';
import { weaponIcon, icon } from '../icons.js';
import { uiHex } from '../colors.js';
import { useStage } from '../stage.js';
import { PAINTS, playerLivery } from '../../data/liveries.js';
import { swatch } from './paint.js';

const STATS = [
  ['SPEED', 'maxSpeed', 80], ['ACCEL', 'accel', 40], ['GRIP', 'grip', 1.6], ['ARMOR', 'armor', 200], ['SLOTS', 'slots', 3],
];

export function createCarSelectScreen({ game, flow }) {
  let idx = 0;
  const name = h('h2.car-name');
  const blurb = h('p.car-blurb');
  const weaponsEl = h('div.car-weapons');
  const bars = STATS.map(([label]) => statBar(label));
  const tabs = CARS.map((c, i) => h('button.car-tab', { type: 'button', dataset: { car: c.id }, style: { '--c': uiHex(c.color) }, onclick: () => pick(i) }, h('i'), c.name));
  const dots = h('div.car-dots', tabs);
  let stageApi = null;

  function pick(i) {
    idx = (i + CARS.length) % CARS.length;
    const c = CARS[idx];
    name.textContent = c.name.toUpperCase();
    name.style.color = uiHex(c.color);
    blurb.textContent = c.blurb;
    weaponsEl.replaceChildren(h('span.muted.small', 'STARTS WITH'), ...c.startWeapons.map((w) => h('span.wchip', weaponIcon(w.id, { size: 18 }), `${getWeapon(w.id)?.name ?? w.id} ×${w.ammo}`)));
    STATS.forEach(([, key, max], n) => bars[n].set(c.base[key], max, key === 'maxSpeed' ? Math.round(c.base[key] * 3.6) + ' kph' : key === 'grip' ? c.base[key].toFixed(2) : undefined));
    tabs.forEach((d, n) => d.classList.toggle('on', n === idx));
    try { stageApi?.show({ carId: c.id, color: c.color, upgrades: { armor: 0, engine: 0, tyres: 0 }, livery: game.liveryOf(c.id), weapons: c.startWeapons }); } catch (e) { game.reportError(e); }
    renderSwatches();
  }
  const sw = h('div.swatches');
  function renderSwatches() {
    const cur = playerLivery({ ...game.getSave(), carId: CARS[idx].id }).paint;
    sw.replaceChildren(...PAINTS.map((p) => swatch(p.hex, p.name, cur === p.id, () => { game.setPaint(p.id); try { game.stage?.setLivery?.(game.liveryOf(CARS[idx].id)); } catch (e) { game.reportError(e); } renderSwatches(); })));
  }
  const choose = button('SELECT & CONTINUE', () => { game.chooseCar(CARS[idx].id); flow.transition('garage'); }, 'btn-primary');
  const back = button('BACK', () => flow.transition('title'), 'btn-back');
  const el = h('section.screen.screen-cars.screen-3d',
    screenHeader('CHOOSE YOUR RIDE', 'Pick your first car. The rest comes with the winnings.'),
    h('div.cars-body',
      h('div.panel.car-info', name, blurb, h('div.bars', bars.map((b) => b.el)), weaponsEl, h('div.panel-title', 'PAINT'), sw, h('p.muted.small', { style: { marginTop: '10px' } }, 'Price: ' + fmtMoney(0) + ' — your first car is on the house.')),
      h('div.sel-strip', button('', () => pick(idx - 1), 'btn-small btn-icon btn-prev'), dots, button('', () => pick(idx + 1), 'btn-small btn-icon btn-next'))),
    h('footer.screen-foot', back, choose));
  el.querySelector('.btn-prev').append(icon('back', { size: 16 })); el.querySelector('.btn-next').append(icon('play', { size: 16 }));
  el.querySelector('.btn-prev').setAttribute('aria-label', 'Previous car'); el.querySelector('.btn-next').setAttribute('aria-label', 'Next car');
  let detach = null;
  return {
    el,
    show() {
      detach = attachMenuKeys(el);
      stageApi = useStage(game, el, { side: 1 });
      pick(Math.max(0, CARS.findIndex((c) => c.id === game.getSave().carId)));
    },
    hide() { detach?.(); stageApi?.hide(); stageApi = null; },
  };
}
