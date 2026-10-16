import { h, button, screenHeader, fmtMoney, attachMenuKeys } from '../dom.js';
import { getTrack } from '../../data/tracks/index.js';

export function createRaceSettingsScreen({ game, flow }) {
  let detach = null;
  const title = h('h2');
  const lapsVal = h('span.big');
  const modeBtns = {};
  const rivalsBox = h('input', { type: 'checkbox', id: 'rivals' });
  const rivalsRow = h('label.row', rivalsBox, ' Include rivals in practice');
  const info = h('p.muted');
  const setup = () => game.getRaceSetup();
  function render() {
    const s = setup();
    const t = getTrack(s.trackId);
    title.textContent = t.name.toUpperCase();
    lapsVal.textContent = String(s.laps);
    for (const [m, b] of Object.entries(modeBtns)) b.classList.toggle('on', s.mode === m);
    rivalsRow.style.display = s.mode === 'practice' ? '' : 'none';
    rivalsBox.checked = !!s.practiceRivals;
    info.textContent = s.mode === 'race' ? `Winner takes ${fmtMoney(t.prize)}. Kills pay a bonus. Damage costs you.` : 'No money, no clock, no mercy for your nerves.';
  }
  modeBtns.race = button('RACE', () => { game.setRaceSetup({ mode: 'race' }); render(); }, 'btn-mode');
  modeBtns.practice = button('PRACTICE', () => { game.setRaceSetup({ mode: 'practice' }); render(); }, 'btn-mode');
  rivalsBox.addEventListener('change', () => { game.setRaceSetup({ practiceRivals: rivalsBox.checked }); });
  const el = h('section.screen.screen-settings',
    screenHeader('RACE SETTINGS'),
    h('div.panel.settings-main', title,
      h('div.row.center', h('span', 'MODE'), modeBtns.race, modeBtns.practice),
      h('div.row.center', h('span', 'LAPS'), button('−', () => { game.setRaceSetup({ laps: Math.max(1, setup().laps - 1) }); render(); }, 'btn-small'), lapsVal,
        button('+', () => { game.setRaceSetup({ laps: Math.min(8, setup().laps + 1) }); render(); }, 'btn-small')),
      rivalsRow, info),
    h('footer.screen-foot', button('BACK', () => flow.transition('trackSelect'), 'btn-back'),
      button('START ▶', () => flow.transition('loading'), 'btn-primary btn-start')));
  return { el, show() { detach = attachMenuKeys(el); render(); }, hide() { detach?.(); } };
}
