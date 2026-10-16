import { h, button, screenHeader, fmtMoney, fmtTime, attachMenuKeys, clear } from '../dom.js';
import { GAME_TRACKS as TRACKS } from '../../data/tracks/index.js';
import { icon } from '../icons.js';
import { trackOutlinePath, difficultyOf, difficultyLabel } from '../menuLogic.js';

const NS = 'http://www.w3.org/2000/svg';
/** Mini track outline SVG from the track's control points. */
export function outlineSvg(control, w = 200, h2 = 110) {
  const o = trackOutlinePath(control, { w, h: h2, pad: 12 });
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h2}`); svg.setAttribute('class', 'outline'); svg.setAttribute('aria-hidden', 'true');
  const mk = (cls) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', o.d); p.setAttribute('class', cls); return p; };
  const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('class', 'o-start'); dot.setAttribute('cx', o.start[0]); dot.setAttribute('cy', o.start[1]); dot.setAttribute('r', 4);
  svg.append(mk('o-glow'), mk('o-line'), dot);
  return svg;
}
export const diffPips = (d) => h('span.diff', { title: difficultyLabel(d) }, [1, 2, 3, 4, 5].map((n) => h('i' + (n <= d ? (d >= 5 ? '.hot' : '.on') : ''))));

export function createTrackSelectScreen({ game, flow }) {
  const list = h('div.track-list');
  const count = h('span.chip');
  let detach = null;
  function render() {
    const save = game.getSave();
    clear(list);
    let nOpen = 0;
    TRACKS.forEach((t, i) => {
      const open = i === 0 || save.unlockedTracks.includes(t.id);
      if (open) nOpen++;
      const go = () => { game.setRaceSetup({ trackId: t.id }); flow.transition('raceSettings'); };
      const b = button(open ? 'SELECT' : 'LOCKED', go, open ? 'btn-primary' : '');
      b.disabled = !open;
      b.dataset.track = t.id;
      const prev = TRACKS[i - 1];
      const d = difficultyOf(i, TRACKS.length);
      const card = h('div.panel.track-card' + (open ? '' : '.locked'),
        h('div.track-top', h('span.num', String(i + 1).padStart(2, '0')), diffPips(d)),
        outlineSvg(t.control),
        h('div', h('h3', t.name), h('div.city', `${t.city} · ${difficultyLabel(d)}`)),
        open ? h('p.track-blurb', t.blurb) : h('p.track-blurb', h('span.lock-badge', icon('lock', { size: 14 }), `Win ${prev ? prev.name : 'a race'} to unlock`)),
        h('div.track-meta', h('span', 'Prize', h('b', fmtMoney(t.prize))), h('span', 'Laps', h('b', String(t.laps))), h('span', 'Best', h('b', fmtTime(save.bestTimes[t.id])))),
        b);
      if (open) card.addEventListener('click', (e) => { if (!e.target.closest('button')) go(); });
      list.append(card);
    });
    count.textContent = `${nOpen}/${TRACKS.length} UNLOCKED`;
  }
  const el = h('section.screen.screen-tracks', screenHeader('PICK YOUR TRACK', 'Win a race to unlock the next.', count), h('div.screen-body', list),
    h('footer.screen-foot', button('BACK', () => flow.transition('garage'), 'btn-back')));
  return { el, show() { detach = attachMenuKeys(el); render(); }, hide() { detach?.(); } };
}
