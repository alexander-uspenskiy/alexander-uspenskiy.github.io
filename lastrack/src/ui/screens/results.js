import { h, button, screenHeader, fmtMoney, fmtTime, ordinal, attachMenuKeys, clear } from '../dom.js';

export function createResultsScreen({ game, flow }) {
  const head = h('div.res-head');
  const table = h('div.res-table');
  const money = h('div.res-money');
  let detach = null;
  const el = h('section.screen.screen-results', screenHeader('RESULTS'),
    h('div.panel', head), h('div.panel', table), h('div.panel', money),
    h('footer.screen-foot', button('TO THE GARAGE ▶', () => flow.transition('garage'), 'btn-primary btn-garage')));
  return {
    el,
    show(p) {
      detach = attachMenuKeys(el);
      const { result, summary } = p || {};
      clear(head); clear(table); clear(money);
      if (!result) return;
      head.append(h('h2' + (summary.wrecked ? '.bad' : ''), summary.wrecked ? 'WRECKED' : ordinal(summary.position) + ' PLACE'),
        h('p.muted', `${summary.mode.toUpperCase()} · ${result.laps} laps · ${summary.kills} kills`));
      for (const r of result.finishOrder) {
        const name = game.driverName(r);
        table.append(h('div.res-row' + (r.isPlayer ? '.me' : ''), h('b', String(r.position)), h('span', name),
          h('span.r', r.wrecked ? 'WRECKED' : r.time != null ? fmtTime(r.time) : 'DNF'), h('span.r', r.kills ? `${r.kills} ✕` : '')));
      }
      if (summary.mode === 'practice') money.append(h('p.muted', 'Practice: no prize money.'));
      else {
        money.append(...[h('div.row.between', h('span', 'PRIZE'), h('b', fmtMoney(summary.prize))),
          h('div.row.between', h('span', `KILL BONUS (${summary.kills})`), h('b', fmtMoney(summary.killBonus))),
          summary.pickupCash ? h('div.row.between', h('span', 'CASH PICKUPS'), h('b', fmtMoney(summary.pickupCash))) : null,
          h('div.row.between.total', h('span', 'TOTAL'), h('b', fmtMoney(summary.total + (summary.pickupCash || 0)))),
          summary.damageFraction > 0 ? h('p.muted', `Car damage ${Math.round(summary.damageFraction * 100)}% — repair it in the garage.`) : null,
          summary.newBest ? h('p.good', 'NEW BEST TIME!') : null,
          summary.unlocked ? h('p.good', 'NEW TRACK UNLOCKED: ' + summary.unlocked.toUpperCase()) : null].filter(Boolean));
      }
    },
    hide() { detach?.(); },
  };
}
