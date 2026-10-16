import { h, button, screenHeader, attachMenuKeys } from '../dom.js';
import { DRIVERS } from '../../data/drivers.js';
import { TRACKS, getTrack } from '../../data/tracks/index.js';
import { DRIVERS_BY_DIFFICULTY, tracksFor } from '../../data/raceConfig.js';
import { getCar } from '../../data/cars.js';
import { getWeapon } from '../../data/weapons.js';
import { drawPortrait } from '../../render/portraits.js';

export function createRosterScreen({ game, flow }) {
  let detach = null;
  const grid = h('div.roster-grid');
  for (const d of DRIVERS_BY_DIFFICULTY) {
    const c = h('canvas.portrait', { width: 96, height: 96, dataset: { driver: d.id } });
    try { drawPortrait(c.getContext('2d'), d); } catch (e) { game.reportError(e); }
    grid.append(h('div.panel.driver',
      c,
      h('div.driver-info', h('h3', d.name), h('p.nick', `"${d.nickname}"`), h('p.bio', d.bio),
        h('p.small', `CAR ${getCar(d.carId)?.name ?? d.carId} · FAVOURITE ${getWeapon(d.favoriteWeapon)?.name ?? d.favoriteWeapon}`),
        h('p.small.races', `RACES ON ${tracksFor(d.id).map((id) => getTrack(id)?.name ?? id).join(' · ') || '—'}`),
        h('p.small.muted', `SKILL ${Math.round(d.skill * 100)} · AGGRESSION ${Math.round(d.aggression * 100)}`))));
  }
  const el = h('section.screen.screen-roster',
    screenHeader('THE FIELD', `${DRIVERS.length} drivers, ${TRACKS.length} tracks. Four of them race you on each. Easiest first.`), grid,
    h('footer.screen-foot', button('BACK', () => flow.transition('garage'), 'btn-back'), button('SHOP', () => flow.transition('shop'))));
  return { el, show() { detach = attachMenuKeys(el); }, hide() { detach?.(); } };
}
