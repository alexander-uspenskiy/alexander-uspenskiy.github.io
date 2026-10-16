import { h, button } from '../dom.js';

export function createPauseScreen({ game, flow }) {
  const el = h('section.screen.screen-pause',
    h('div.panel.menu', h('h2', 'PAUSED'),
      button('RESUME', () => game.resume(), 'btn-primary btn-resume'),
      button('RESTART', () => game.restartRace(), 'btn-restart'),
      button('QUIT TO GARAGE', () => game.quitRace(), 'btn-quit')));
  return { el };
}
