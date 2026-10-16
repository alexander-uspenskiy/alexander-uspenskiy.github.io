import { SPIKES, SPIKE_TIERS } from '../../data/spikes.js';
import { h, button, screenHeader, fmtMoney, attachMenuKeys, clear } from '../dom.js';
import { WEAPONS } from '../../data/weapons.js';
import { getCar } from '../../data/cars.js';
import { weaponIcon, icon } from '../icons.js';
import { pct } from '../menuLogic.js';
import { useStage } from '../stage.js';

/** Pure: one-line spec shown under a weapon's name in the armory. */
export function weaponSpec(w) {
  const slot = `slots ${w.slot}`;
  switch (w.kind) {
    case 'passive': return `passive · rams x${w.ramMult} dmg, takes x${w.ramTaken} · no ammo · ${slot}`;
    case 'flame': return `flame · ${(w.damage / w.cooldown).toFixed(0)} dmg/s · cone ${w.range}m · burns ammo fast · ${slot}`;
    case 'drop': return w.id === 'oil' ? `drop · slick, grip -${Math.round((1 - w.gripPenalty) * 100)}% · ${slot}` : `drop · ${w.id === 'mine' ? 'proximity blast' : 'pops tyres'} · dmg ${w.damage} · ${slot}`;
    default:
      if (w.guided) return `guided · lock-on · dmg ${w.damage} · blast ${w.radius}m · range ${w.range}m · ${slot}`;
      return `${w.kind} · dmg ${w.damage} · range ${w.range}m · ${slot}`;
  }
}

export function createShopScreen({ game, flow }) {
  const cash = h('span.chip.cash');
  const slots = h('span.chip');
  const list = h('div.shop-list');
  const msg = h('p.msg.muted');
  let detach = null, stageApi = null;
  const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };

  function refreshStage() { const s = game.getSave(); game.stage?.setLoadout?.(s.weapons, s.spikes); }

  function render() {
    const save = game.getSave();
    const car = getCar(save.carId);
    const used = save.weapons.reduce((n, w) => n + (WEAPONS.find((x) => x.id === w.id)?.slot ?? 1), 0);
    cash.textContent = fmtMoney(save.cash);
    slots.textContent = `WEAPON SLOTS ${used}/${car.base.slots}`;
    clear(list);
    for (const w of [...WEAPONS].sort((a, b) => a.price - b.price)) {   // cheap -> premium
      const own = save.weapons.find((x) => x.id === w.id);
      const passive = w.kind === 'passive';
      const act = own && passive
        ? button('INSTALLED', () => {}, 'btn-ammo btn-small')
        : own
        ? button(`+${w.ammoPack} · ${fmtMoney(w.ammoPack * w.ammoPrice)}`, () => { const r = game.buy('ammo', w.id); say(r.ok ? `${w.name}: ammo loaded.` : r.error || 'Cannot buy ammo.', !r.ok); render(); if (r.ok) refreshStage(); }, 'btn-ammo btn-small')
        : button(`BUY ${fmtMoney(w.price)}`, () => { const r = game.buy('weapon', w.id); say(r.ok ? `${w.name} mounted.` : r.error || 'Cannot buy.', !r.ok); render(); if (r.ok) refreshStage(); }, 'btn-primary btn-weapon btn-small');
      act.dataset.weapon = w.id;
      act.disabled = own && passive ? true : own ? (own.ammo >= w.maxAmmo || save.cash < w.ammoPack * w.ammoPrice) : save.cash < w.price;
      const ammo = own && !passive ? h('div.ammo-meter', h('span', `AMMO ${own.ammo}/${w.maxAmmo}`), h('div.bar-track', h('div.bar-fill', { style: { width: pct(own.ammo, w.maxAmmo) + '%' } }))) : h('div.ammo-meter', h('span', passive ? (own ? 'ON' : 'PASSIVE') : `${fmtMoney(w.ammoPrice)}/rd · pack ${w.ammoPack}`));
      list.append(h('div.shop-row' + (own ? '.owned' : ''),
        h('div.shop-icon', weaponIcon(w.id, { size: 32 })),
        h('div.shop-name', h('b', w.name), h('small', weaponSpec(w))),
        h('div.shop-foot', ammo, act)));
    }
    // ---- spikes: three bolt-on sets, two tiers each (pure cosmetic + ram effect, see data/spikes.js)
    list.append(h('h3.shop-head', 'RAM GEAR · SPIKES'));
    for (const sp of SPIKES) {
      const tier = (save.spikes && save.spikes[sp.id]) || 0;
      const next = tier < SPIKE_TIERS ? sp.tiers[tier] : null;
      const act = next
        ? button(`${tier ? 'UPGRADE' : 'BUY'} ${fmtMoney(next.price)}`, () => { const r = game.buy('spikes', sp.id); say(r.ok ? `${next.name} fitted.` : r.error || 'Cannot buy.', !r.ok); render(); if (r.ok) refreshStage(); }, 'btn-primary btn-weapon btn-small')
        : button('MAXED', () => {}, 'btn-ammo btn-small');
      act.dataset.spikes = sp.id; act.disabled = !next || save.cash < next.price;
      const cur = tier ? sp.tiers[tier - 1] : null;
      const pips = h('div.ammo-meter', h('span', cur ? `${cur.name.toUpperCase()} · +${Math.round(cur.dealt * 100)}% dealt · -${Math.round(cur.taken * 100)}% taken` : `${sp.tiers[0].name} · +${Math.round(sp.tiers[0].dealt * 100)}% dealt · -${Math.round(sp.tiers[0].taken * 100)}% taken`),
        h('div.bar-track', h('div.bar-fill', { style: { width: pct(tier, SPIKE_TIERS) + '%' } })));
      list.append(h('div.shop-row' + (tier ? '.owned' : ''),
        h('div.shop-icon', icon(sp.id === 'front' ? 'spikeFront' : sp.id === 'rear' ? 'spikeRear' : 'spikeWheel', { size: 32 })),
        h('div.shop-name', h('b', `${sp.name}${tier ? ' · TIER ' + tier : ''}`), h('small', sp.blurb)),
        h('div.shop-foot', pips, act)));
    }
  }
  const el = h('section.screen.screen-shop.screen-3d',
    screenHeader('ARMORY', 'Everything legal in the Last Track league. Which is everything.', [slots, cash]),
    h('div.panel.shop-main', list, msg),
    h('footer.screen-foot', button('BACK', () => flow.transition('garage'), 'btn-back'), h('span.spacer'), button('DRIVERS', () => flow.transition('roster'))));
  return {
    el,
    show() { detach = attachMenuKeys(el); say(''); render(); stageApi = useStage(game, el, { side: -1, mode: 'garage' }); const s = game.getSave(); stageApi.show({ carId: s.carId, color: getCar(s.carId).color, upgrades: s.upgrades }); },
    hide() { detach?.(); stageApi?.hide(); stageApi = null; },
  };
}
