import { h } from '../dom.js';

export function createLoadingScreen() {
  const el = h('section.screen.screen-loading', h('div.panel', h('h2', 'LOADING'), h('div.loadbar', h('div.loadfill')), h('p.muted', 'Welding the doors shut…')));
  return { el };
}
