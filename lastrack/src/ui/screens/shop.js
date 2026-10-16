import { h, button, screenHeader, fmtMoney, attachMenuKeys, clear } from '../dom.js';
import { WEAPONS } from '../../data/weapons.js';
import { getCar } from '../../data/cars.js';

/** Pure: one-line spec shown under a weapon's name in the armory. */
export function weaponSpec(w) {
  const slot = `slots ${w.slot}`;
  switch (w.kind) {
    case 'passive': return `passive · rams x${w.ramMult} dmg, takes x${w.ramTaken} · no ammo · ${slot}`;
    case 'flame': return `flame · ${(w.damage / w.cooldown).toFixed(0)} dmg/s · cone ${w.range}m · burns ammo fast · ${slot}`;
    case 'drop': return w.id === 'oil' ? `drop · slick, grip -${Math.round((1 - w.gripPenalty) * 100)}% · ${slot}` : `drop · ${w.id === 'mine' ? 'proximity blast' : 'pops tyres'} · dmg ${w.damage} · ${slot}`;
    default: return `${w.kind} · dmg ${w.damage} · range ${w.range}m · ${slot}`;
  }
}

export function createShopScreen({ game, flow }) {
  const cash = h('div.cash');
  const slots = h('div.muted');
  const list = h('div.shop-list');
  const msg = h('p.msg.muted');
  let detach = null;
  const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };

  function render() {
    const save = game.getSave();
    const car = getCar(save.carId);
    const used = save.weapons.reduce((n, w) => n + (WEAPONS.find((x) => x.id === w.id)?.slot ?? 1), 0);
    cash.textContent = fmtMoney(save.cash);
    slots.textContent = `WEAPON SLOTS ${used}/${car.base.slots}`;
    clear(list);
    for (const w of WEAPONS) {
      const own = save.weapons.find((x) => x.id === w.id);
      const passive = w.kind === 'passive';
      const act = own && passive
        ? button('INSTALLED', () => {}, 'btn-ammo')
        : own
        ? button(`AMMO +${w.ammoPack} ${fmtMoney(w.ammoPack * w.ammoPrice)}`, () => { const r = game.buy('ammo', w.id); say(r.ok ? `${w.name}: ammo loaded.` : r.error || 'Cannot buy ammo.', !r.ok); render(); }, 'btn-ammo')
        : button(`BUY ${fmtMoney(w.price)}`, () => { const r = game.buy('weapon', w.id); say(r.ok ? `${w.name} mounted.` : r.error || 'Cannot buy.', !r.ok); render(); }, 'btn-primary btn-weapon');
      act.dataset.weapon = w.id;
      act.disabled = own && passive ? true : own ? (own.ammo >= w.maxAmmo || save.cash < w.ammoPack * w.ammoPrice) : save.cash < w.price;
      list.append(h('div.shop-row' + (own ? '.owned' : ''),
        h('div.shop-name', h('b', w.name), h('small', weaponSpec(w)),
        h('small.muted', passive ? `${fmtMoney(w.price)} · no ammo` : `${fmtMoney(w.price)} · ammo ${fmtMoney(w.ammoPrice)}/rd · pack ${w.ammoPack} · max ${w.maxAmmo}`)),
        h('div.shop-ammo', own ? (passive ? 'ON' : `${own.ammo}/${w.maxAmmo}`) : '—'), act));
    }
  }
  const el = h('section.screen.screen-shop',
    screenHeader('ARMORY', 'Everything legal in the Last Track league. Which is everything.'),
    h('div.panel.shop-main', h('div.row.between', slots, cash), list, msg),
    h('footer.screen-foot', button('BACK', () => flow.transition('garage'), 'btn-back'), button('DRIVERS', () => flow.transition('roster'))));
  return { el, show() { detach = attachMenuKeys(el); say(''); render(); }, hide() { detach?.(); } };
}
