import { h, button, screenHeader, fmtMoney, fmtTime, attachMenuKeys, clear } from '../dom.js';
import { TRACKS } from '../../data/tracks/index.js';

export function createTrackSelectScreen({ game, flow }) {
  const list = h('div.track-list');
  const count = h('span.muted');
  let detach = null;
  function render() {
    const save = game.getSave();
    clear(list);
    let nOpen = 0;
    TRACKS.forEach((t, i) => {
      const open = save.unlockedTracks.includes(t.id);
      if (open) nOpen++;
      const b = button(open ? 'SELECT' : 'LOCKED', () => { game.setRaceSetup({ trackId: t.id }); flow.transition('raceSettings'); }, open ? 'btn-primary' : '');
      b.disabled = !open;
      b.dataset.track = t.id;
      const prev = TRACKS[i - 1];
      list.append(h('div.panel.track-card' + (open ? '' : '.locked'),
        h('div.track-name', h('h3', `${i + 1}. ${t.name}`), h('p.muted', t.city)),
        h('p', open ? t.blurb : `Locked — win ${prev ? prev.name : 'a race'} to unlock.`),
        h('p.small', `PRIZE ${fmtMoney(t.prize)} · ${t.laps} LAPS · BEST ${fmtTime(save.bestTimes[t.id])}`),
        b));
    });
    count.textContent = `${nOpen}/${TRACKS.length} UNLOCKED`;
  }
  const el = h('section.screen.screen-tracks', screenHeader('PICK YOUR TRACK', 'Win a race to unlock the next.'), count, list,
    h('footer.screen-foot', button('BACK', () => flow.transition('garage'), 'btn-back')));
  return { el, show() { detach = attachMenuKeys(el); render(); }, hide() { detach?.(); } };
}
