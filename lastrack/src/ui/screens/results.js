import { h, button, screenHeader, fmtMoney, fmtTime, ordinal, attachMenuKeys, clear, animateCount } from '../dom.js';
import { getDriver } from '../../data/drivers.js';
import { getCar } from '../../data/cars.js';
import { icon } from '../icons.js';
import { podiumOrder } from '../menuLogic.js';
import { uiHex } from '../colors.js';

/** Money that can go negative (a missed contract's penalty): '−$300'. */
const signedMoney = (n) => (n < 0 ? '−' : '') + fmtMoney(Math.abs(n));

export function createResultsScreen({ game, flow }) {
  const head = h('div.res-head');
  const podium = h('div.podium');
  const table = h('div.res-table');
  const money = h('div.res-money');
  let detach = null, stops = [];
  const el = h('section.screen.screen-results', screenHeader('RESULTS'),
    h('div.screen-body', h('div.results-wrap',
      h('div', h('div.panel', head, podium), h('div.panel', { style: { marginTop: '12px' } }, h('div.panel-title', 'CLASSIFICATION'), table)),
      h('div.panel', h('div.panel-title', 'PAYOUT'), money))),
    h('footer.screen-foot', button('TO THE GARAGE', () => flow.transition('garage'), 'btn-primary btn-garage')));
  const colorOf = (r) => { const d = r.isPlayer ? null : getDriver(r.driverId); return uiHex(d ? d.color : getCar(game.getSave().carId)?.color ?? 9); };
  return {
    el,
    show(p) {
      detach = attachMenuKeys(el);
      stops.forEach((s) => s()); stops = [];
      const { result, summary } = p || {};
      clear(head); clear(table); clear(money); clear(podium);
      if (!result) return;
      head.append(h('h2' + (summary.wrecked ? '.bad' : ''), summary.wrecked ? 'WRECKED' : ordinal(summary.position) + ' PLACE'),
        h('p.muted', `${summary.mode.toUpperCase()} · ${result.laps} laps · ${summary.kills} kills${summary.time != null ? ' · ' + fmtTime(summary.time) : ''}`));
      for (const r of podiumOrder(result.finishOrder)) {
        podium.append(h('div.pod.p' + r.position + (r.isPlayer ? '.me' : ''), h('span.nm', game.driverName(r)), h('span.tm', r.wrecked ? 'WRECKED' : r.time != null ? fmtTime(r.time) : 'DNF'), h('div.blk', String(r.position))));
      }
      result.finishOrder.forEach((r, i) => {
        table.append(h('div.res-row' + (r.isPlayer ? '.me' : ''), { style: { animationDelay: 0.05 * i + 's' } }, h('b', String(r.position)), h('i', { style: { background: colorOf(r) } }), h('span', game.driverName(r)),
          h('span.r', r.wrecked ? 'WRECKED' : r.time != null ? fmtTime(r.time) : 'DNF'), h('span.r', r.kills ? `${r.kills} ✕` : '')));
      });
      if (summary.mode === 'practice') {
        money.append(h('p.muted', 'Practice: no prize money.'));
        if (summary.contractOpen) money.append(h('p.muted.small', 'Your contract stays open for the next race.'));
      } else {
        const c = summary.contract;
        const contractRow = !c ? null : c.complete ? [`CONTRACT · ${c.org} ${c.kills}/${c.quota}`, c.bounty] : ['CONTRACT FAILED', -c.penalty];
        const rows = [['PRIZE', summary.prize], [`KILL BONUS (${summary.kills})`, summary.killBonus], summary.pickupCash ? ['CASH PICKUPS', summary.pickupCash] : null, contractRow].filter(Boolean);
        let delay = 150;
        for (const [label, v] of rows) {
          const val = h('b', fmtMoney(0));
          money.append(h('div.pay-row', h('span', label), val));
          stops.push(animateCount(val, v, { fmt: signedMoney, delay, ms: 800 })); delay += 250;
        }
        const tot = h('b', fmtMoney(0));
        money.append(h('div.pay-row.total', h('span', 'TOTAL'), tot));
        stops.push(animateCount(tot, summary.total + (summary.pickupCash || 0) + (summary.contractNet || 0), { fmt: signedMoney, delay, ms: 1100 }));
        if (summary.damageFraction > 0) money.append(h('p.muted.small', { style: { marginTop: '8px' } }, `Car damage ${Math.round(summary.damageFraction * 100)}% — repair it in the garage.`));
        if (summary.newBest) money.append(h('span.badge', icon('trophy', { size: 14 }), 'New best time'));
        if (summary.unlocked) money.append(h('span.badge', icon('lock', { size: 14 }), 'Track unlocked: ' + summary.unlocked));
      }
    },
    hide() { detach?.(); stops.forEach((s) => s()); stops = []; },
  };
}
