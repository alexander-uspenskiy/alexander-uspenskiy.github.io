import { h, button, statBar, screenHeader, fmtMoney, attachMenuKeys, clear } from '../dom.js';
import { getCar } from '../../data/cars.js';
import { UPGRADES, upgradeCost, applyUpgrades } from '../../data/upgrades.js';
import { repairCost } from '../../data/economy.js';
import { uiHex } from '../colors.js';
import { carSilhouette, setDamageZones } from '../icons.js';
import { ringGeometry } from '../menuLogic.js';
import { useStage } from '../stage.js';

/** Pure: spread the save's single damage fraction over [front, right, rear, left] (front/rear take more). */
export function damageZones(d) { const f = Math.max(0, Math.min(1, d || 0)); return [Math.min(1, f * 1.25), f * 0.85, f, f * 0.85]; }

function ring(level, max) {
  const g = ringGeometry(level, max);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 52 52');
  const bg = document.createElementNS(NS, 'circle'); bg.setAttribute('class', 'ring-bg'); bg.setAttribute('cx', 26); bg.setAttribute('cy', 26); bg.setAttribute('r', g.r);
  const fg = document.createElementNS(NS, 'circle'); fg.setAttribute('class', 'ring-fg' + (level >= max ? ' max' : '')); fg.setAttribute('cx', 26); fg.setAttribute('cy', 26); fg.setAttribute('r', g.r);
  fg.setAttribute('stroke-dasharray', g.c.toFixed(2)); fg.setAttribute('stroke-dashoffset', g.c.toFixed(2));
  svg.append(bg, fg);
  requestAnimationFrame(() => fg.setAttribute('stroke-dashoffset', g.offset.toFixed(2)));
  return h('div.ring', svg, h('b', `${level}/${max}`));
}

export function createGarageScreen({ game, flow }) {
  const cash = h('span.chip.cash');
  const carName = h('h2.car-name');
  const msg = h('p.msg.muted');
  const upgradesEl = h('div.upg-list');
  const bars = { speed: statBar('SPEED'), accel: statBar('ACCEL'), grip: statBar('GRIP'), armor: statBar('ARMOR') };
  const repairRow = h('div.repair-row');
  const diagram = h('div.diagram');
  let stageApi = null, detach = null;

  const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };
  const refreshCar = () => {
    const s = game.getSave(), car = getCar(s.carId);
    stageApi?.show({ carId: car.id, color: car.color, upgrades: s.upgrades });
  };

  function render() {
    const save = game.getSave();
    const car = getCar(save.carId);
    cash.textContent = fmtMoney(save.cash);
    carName.textContent = car.name.toUpperCase();
    carName.style.color = uiHex(car.color);
    const st = applyUpgrades(car.base, save.upgrades);
    bars.speed.set(st.maxSpeed, 80, Math.round(st.maxSpeed * 3.6) + ' kph');
    bars.accel.set(st.accel, 40);
    bars.grip.set(st.grip, 1.6, st.grip.toFixed(2));
    bars.armor.set(st.armorMax, 200);
    clear(upgradesEl);
    for (const u of UPGRADES) {
      const lvl = save.upgrades[u.id] || 0;
      const maxed = lvl >= u.maxLevel;
      const cost = maxed ? null : upgradeCost(u.id, lvl + 1);
      const b = button(maxed ? 'MAXED' : fmtMoney(cost), () => {
        const r = game.buy('upgrade', u.id);
        if (!r.ok) say(r.error || 'Cannot buy.', true); else say(`${u.name} upgraded.`);
        render(); refreshCar();
      }, 'btn-buy btn-small' + (maxed ? '' : ' btn-primary'));
      b.disabled = maxed || save.cash < cost;
      b.dataset.upgrade = u.id;
      upgradesEl.append(h('div.upg-row', ring(lvl, u.maxLevel), h('div.upg-name', h('b', u.name), h('small', u.blurb)), b));
    }
    clear(repairRow);
    const bill = save.damage > 0 ? Math.round(repairCost(save.damage, st.armorMax)) : 0;
    const rb = button(bill > 0 ? `REPAIR ${fmtMoney(bill)}` : 'NO DAMAGE', () => {
      const r = game.buy('repair');
      if (!r.ok) say(r.error || 'Cannot repair.', true); else say('Car repaired.');
      render();
    }, 'btn-repair btn-small' + (bill > 0 ? ' btn-primary' : ''));
    rb.disabled = bill <= 0 || save.cash < bill;
    repairRow.append(h('span.muted.small', 'REPAIR BAY'), rb);
    const sil = carSilhouette(car.id); setDamageZones(sil, damageZones(save.damage));
    diagram.replaceChildren(sil, h('div', h('div.muted.small', 'HULL INTEGRITY'), h('div.dmg-pct', { style: { color: save.damage > 0.5 ? 'var(--red)' : save.damage > 0.2 ? 'var(--amber)' : 'var(--lime)' } }, Math.round((1 - save.damage) * 100) + '%')));
    const si = diagram.querySelector('svg'); if (si) si.classList.add('carsil');
  }

  const el = h('section.screen.screen-garage.screen-3d',
    screenHeader('THE GARAGE', 'Spend it before someone takes it from you.', cash),
    h('div.garage-body',
      h('div.garage-left', h('div.panel', carName, h('div.bars', Object.values(bars).map((b) => b.el))), h('div.panel', diagram)),
      h('div.panel.garage-main', h('div.panel-title', 'UPGRADES'), upgradesEl, repairRow, msg)),
    h('footer.screen-foot',
      button('MAIN MENU', () => flow.transition('title'), 'btn-back'),
      h('span.spacer'),
      button('PAINT & DECALS', () => flow.transition('paint'), 'btn-nav-paint'),
      button('ARMORY', () => flow.transition('shop'), 'btn-nav-shop'),
      button('DRIVERS', () => flow.transition('roster'), 'btn-nav-roster'),
      button('TO THE TRACK', () => flow.transition('trackSelect'), 'btn-primary btn-nav-track')));
  return {
    el,
    show() {
      detach = attachMenuKeys(el);
      say('');
      stageApi = useStage(game, el, { side: -1, mode: 'garage' });
      render(); refreshCar();
    },
    hide() { detach?.(); stageApi?.hide(); stageApi = null; },
  };
}
