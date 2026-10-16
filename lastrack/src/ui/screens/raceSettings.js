import { h, button, screenHeader, fmtMoney, attachMenuKeys } from '../dom.js';
import { getTrack, GAME_TRACKS as TRACKS } from '../../data/tracks/index.js';
import { outlineSvg, diffPips } from './trackSelect.js';
import { difficultyOf, difficultyLabel } from '../menuLogic.js';

export function createRaceSettingsScreen({ game, flow }) {
  let detach = null;
  const title = h('h2');
  const sub = h('p');
  const hero = h('div.track-hero.panel', title, sub);
  const lapsVal = h('span.big');
  const modeBtns = {};
  const rivalsSw = h('button.switch', { type: 'button', role: 'switch', 'aria-label': 'Include rivals in practice', 'aria-checked': 'false' });
  const rivalsRow = h('div.setting-row', h('label', 'RIVALS IN PRACTICE'), h('div.ctl', rivalsSw));
  const info = h('p.muted');
  const setup = () => game.getRaceSetup();
  function render() {
    const s = setup();
    const t = getTrack(s.trackId);
    const i = Math.max(0, TRACKS.findIndex((x) => x.id === t.id));
    title.textContent = t.name.toUpperCase();
    sub.textContent = `${t.city} — ${t.blurb}`;
    hero.replaceChildren(title, h('div.row', diffPips(difficultyOf(i, TRACKS.length)), h('span.muted.small', difficultyLabel(difficultyOf(i, TRACKS.length)))), outlineSvg(t.control, 260, 150), sub);
    lapsVal.textContent = String(s.laps);
    for (const [m, b] of Object.entries(modeBtns)) b.classList.toggle('on', s.mode === m);
    rivalsRow.style.display = s.mode === 'practice' ? '' : 'none';
    rivalsSw.setAttribute('aria-checked', String(!!s.practiceRivals));
    info.textContent = s.mode === 'race' ? `Winner takes ${fmtMoney(t.prize)}. Kills pay a bonus. Damage costs you.` : 'No money, no clock, no mercy for your nerves.';
  }
  modeBtns.race = button('RACE', () => { game.setRaceSetup({ mode: 'race' }); render(); }, 'btn-mode btn-small');
  modeBtns.practice = button('PRACTICE', () => { game.setRaceSetup({ mode: 'practice' }); render(); }, 'btn-mode btn-small');
  rivalsSw.addEventListener('click', () => { game.setRaceSetup({ practiceRivals: !setup().practiceRivals }); render(); });
  const el = h('section.screen.screen-settings',
    screenHeader('RACE SETTINGS'),
    h('div.screen-body', h('div.settings-wrap', hero,
      h('div.panel.settings-main',
        h('div.setting-row', h('label', 'MODE'), h('div.ctl', h('div.seg', modeBtns.race, modeBtns.practice))),
        h('div.setting-row', h('label', 'LAPS'), h('div.ctl', button('−', () => { game.setRaceSetup({ laps: Math.max(1, setup().laps - 1) }); render(); }, 'btn-small btn-icon'), lapsVal,
          button('+', () => { game.setRaceSetup({ laps: Math.min(8, setup().laps + 1) }); render(); }, 'btn-small btn-icon'))),
        rivalsRow, info))),
    h('footer.screen-foot', button('BACK', () => flow.transition('trackSelect'), 'btn-back'),
      button('START RACE', () => flow.transition('loading'), 'btn-primary btn-start')));
  return { el, show() { detach = attachMenuKeys(el); render(); }, hide() { detach?.(); } };
}
