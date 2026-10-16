import { normalizeSpikes } from '../../data/spikes.js';
import { h, button, screenHeader, attachMenuKeys } from '../dom.js';
import { DRIVERS } from '../../data/drivers.js';
import { DRIVERS_BY_DIFFICULTY } from '../../data/raceConfig.js';
import { getCar } from '../../data/cars.js';
import { getWeapon } from '../../data/weapons.js';
import { drawPortrait } from '../../render/portraits.js';
import { weaponIcon, icon } from '../icons.js';
import { rating } from '../menuLogic.js';
import { uiHex } from '../colors.js';
import { getPaint, getAccent } from '../../data/liveries.js';
import { getDecal } from '../../data/decals.js';

const miniBar = (label, v, color) => [h('span', label), h('div.bar-track', h('div.bar-fill', { style: { width: rating(v) + '%', background: color } }))];

/** Primary + fallback livery of a driver: paint dot, accent dot, number, decal names. */
export function liveryStrip(d) {
  const row = (l, label) => { const p = getPaint(l.paint), a = getAccent(l.accent); return h('div.livery-strip', { title: `${label}: ${p?.name} · ${a?.name} · #${l.number}` }, h('i', { style: { background: '#' + (p?.hex ?? 0).toString(16).padStart(6, '0') } }), h('i', { style: { background: '#' + (a?.hex ?? 0).toString(16).padStart(6, '0') } }), h('b', '#' + l.number), ...l.decals.map((x) => h('span.dchip', getDecal(x.id)?.name ?? x.id)), h('span.muted.small', label)); };
  const [a, b] = d.liveries || [];
  return h('div.liveries', a ? row(a, 'LIVERY') : null, b ? row(b, 'ALT') : null);
}
/** Pure-ish: the rival's spike kit as a chip ('SPIKES F2 R2 W1'), or nothing. */
export function spikeLabel(d) {
  const sp = normalizeSpikes(d.spikes), parts = [['F', sp.front], ['R', sp.rear], ['W', sp.wheels]].filter(([, t]) => t > 0).map(([k, t]) => k + t);
  return parts.length ? 'SPIKES ' + parts.join(' ') : '';
}
function spikeChip(d) { const l = spikeLabel(d); return l ? [h('span.chip.spk', icon('spikeFront', { size: 14 }), l)] : []; }
export function createRosterScreen({ game, flow }) {
  let detach = null;
  const grid = h('div.roster-grid');
  DRIVERS_BY_DIFFICULTY.forEach((d, i) => {
    const c = h('canvas.portrait', { width: 224, height: 224, dataset: { driver: d.id }, role: 'img', 'aria-label': `Portrait of ${d.name}` });
    try { drawPortrait(c.getContext('2d'), d); } catch (e) { game.reportError(e); }
    const fav = getWeapon(d.favoriteWeapon);
    grid.append(h('div.panel.driver', { style: { '--accent': uiHex(d.color) } },
      c,
      h('div.driver-info', h('h3', d.name), h('p.nick', `"${d.nickname}"`), h('p.bio', d.bio),
        h('div.driver-tags',
          h('span.wchip', weaponIcon(d.favoriteWeapon, { size: 18 }), fav?.name ?? d.favoriteWeapon),
          h('span.chip', getCar(d.carId)?.name ?? d.carId),
          ...spikeChip(d)),
        liveryStrip(d),
        h('p.small.muted.races', 'DRAWN INTO RANDOM LINE-UPS'),
        h('div.mini-bars', ...miniBar('SKILL', d.skill, 'linear-gradient(90deg,var(--cyan),var(--violet))'), ...miniBar('AGGRESSION', d.aggression, 'linear-gradient(90deg,var(--amber),var(--red))'))),
      h('span.rank-badge', `#${i + 1}`)));
  });
  const el = h('section.screen.screen-roster',
    screenHeader('THE FIELD', `${DRIVERS.length} drivers. Five of them are drawn to race you each time, in all three cars. Easiest first.`),
    h('div.screen-body', grid),
    h('footer.screen-foot', button('BACK', () => flow.transition('garage'), 'btn-back'), h('span.spacer'), button('ARMORY', () => flow.transition('shop'))));
  return { el, show() { detach = attachMenuKeys(el); el.querySelector('.screen-body').scrollTop = 0; }, hide() { detach?.(); } };
}
