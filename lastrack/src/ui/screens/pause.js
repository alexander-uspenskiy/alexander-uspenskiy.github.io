import { h, button, attachMenuKeys } from '../dom.js';

export function createPauseScreen({ game, openSettings }) {
  let detach = null;
  const el = h('section.screen.screen-pause',
    h('div.panel.pause-card', h('h2', 'PAUSED'),
      button('RESUME', () => game.resume(), 'btn-primary btn-resume'),
      button('RESTART', () => game.restartRace(), 'btn-restart'),
      button('SETTINGS', () => openSettings(), 'btn-settings'),
      button('QUIT TO GARAGE', () => game.quitRace(), 'btn-quit btn-danger')));
  return { el, show() { detach = attachMenuKeys(el); }, hide() { detach?.(); detach = null; } };
}
