import { h, button, statBar, pips, screenHeader, fmtMoney, attachMenuKeys, clear } from '../dom.js';
import { getCar } from '../../data/cars.js';
import { UPGRADES, upgradeCost, applyUpgrades } from '../../data/upgrades.js';
import { repairCost } from '../../data/economy.js';
import { paletteHex } from '../../data/palette.js';

export function createGarageScreen({ game, flow }) {
  const canvas = h('canvas.preview-canvas', { width: 480, height: 300 });
  const cash = h('div.cash');
  const carName = h('h2.car-name');
  const msg = h('p.msg.muted');
  const upgradesEl = h('div.upg-list');
  const bars = { speed: statBar('SPEED'), accel: statBar('ACCEL'), grip: statBar('GRIP'), armor: statBar('ARMOR') };
  const repairRow = h('div.repair-row');
  let preview = null;
  let detach = null;

  const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };

  function render() {
    const save = game.getSave();
    const car = getCar(save.carId);
    cash.textContent = fmtMoney(save.cash);
    carName.textContent = car.name.toUpperCase();
    carName.style.color = paletteHex(car.color);
    const st = applyUpgrades(car.base, save.upgrades);
    bars.speed.set(st.maxSpeed, 80, Math.round(st.maxSpeed * 3.6) + ' kph');
    bars.accel.set(st.accel, 40);
    bars.grip.set(st.grip, 1.6, st.grip.toFixed(2));
    bars.armor.set(st.armorMax, 200 );
    clear(upgradesEl);
    for (const u of UPGRADES) {
      const lvl = save.upgrades[u.id] || 0;
      const maxed = lvl >= u.maxLevel;
      const cost = maxed ? null : upgradeCost(u.id, lvl + 1);
      const b = button(maxed ? 'MAXED' : `BUY ${fmtMoney(cost)}`, () => {
        const r = game.buy('upgrade', u.id);
        if (!r.ok) say(r.error || 'Cannot buy.', true); else say(`${u.name} upgraded.`);
        render();
        preview?.show({ carId: car.id, color: car.color, upgrades: game.getSave().upgrades });
      }, 'btn-buy' + (maxed ? '' : ' btn-primary'));
      b.disabled = maxed || save.cash < cost;
      b.dataset.upgrade = u.id;
      upgradesEl.append(h('div.upg-row', h('div.upg-name', h('b', u.name), h('small', u.blurb)), pips(lvl, u.maxLevel), b));
    }
    clear(repairRow);
    const bill = save.damage > 0 ? Math.round(repairCost(save.damage, st.armorMax)) : 0;
    const rb = button(bill > 0 ? `REPAIR ${fmtMoney(bill)}` : 'NO DAMAGE', () => {
      const r = game.buy('repair');
      if (!r.ok) say(r.error || 'Cannot repair.', true); else say('Car repaired.');
      render();
    }, 'btn-repair');
    rb.disabled = bill <= 0 || save.cash < bill;
    repairRow.append(h('span', 'DAMAGE ' + Math.round(save.damage * 100) + '%'), rb);
  }

  const el = h('section.screen.screen-garage',
    screenHeader('THE GARAGE', 'Spend it before someone takes it from you.'),
    h('div.garage-body',
      h('div.panel.preview-box', canvas, carName, cash),
      h('div.panel.garage-main', h('div.bars', Object.values(bars).map((b) => b.el)), upgradesEl, repairRow, msg)),
    h('footer.screen-foot',
      button('MAIN MENU', () => flow.transition('title'), 'btn-back'),
      button('SHOP', () => flow.transition('shop'), 'btn-nav-shop'),
      button('DRIVERS', () => flow.transition('roster'), 'btn-nav-roster'),
      button('TO THE TRACK ▶', () => flow.transition('trackSelect'), 'btn-primary btn-nav-track')));
  return {
    el,
    show() {
      detach = attachMenuKeys(el);
      say('');
      preview = game.createPreview(canvas);
      const s = game.getSave();
      const car = getCar(s.carId);
      preview?.show({ carId: car.id, color: car.color, upgrades: s.upgrades });
      render();
    },
    hide() { detach?.(); preview?.dispose(); preview = null; },
  };
}
