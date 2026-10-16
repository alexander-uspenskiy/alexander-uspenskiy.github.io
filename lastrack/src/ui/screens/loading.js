import { h } from '../dom.js';

const TIPS = ['Rockets are loud. Caltrops are patient.', 'Oil slicks work on you too.', 'Armor is cheaper than a funeral.', 'Brake before the corner, fire after it.', 'Mines are only funny the first time.'];

export function createLoadingScreen() {
  const tip = h('p.muted');
  const el = h('section.screen.screen-loading', h('div.load-card', h('div.load-ring'), h('h2', 'LOADING'), h('div.loadbar', h('div.loadfill')), tip));
  return { el, show() { tip.textContent = TIPS[(Math.random() * TIPS.length) | 0]; } };
}
