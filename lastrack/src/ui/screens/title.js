import { h, button } from '../dom.js';

export function createTitleScreen({ game, flow }) {
  const cont = button('CONTINUE', () => flow.transition('garage'), 'btn-primary btn-continue');
  const ng = button('NEW GAME', () => {
    if (game.hasSavedGame() && !confirm('Start over? Your current save will be erased.')) return;
    game.newGame();
    flow.transition('carSelect');
  }, 'btn-new');
  const slice = !!game.slice;
  const heroBtn = button(slice ? 'START — HAMMER × SCRAPYARD' : 'HERO SLICE', () => {
    if (slice) game.startSlice(); else location.search = '?slice=1';
  }, slice ? 'btn-primary btn-hero' : 'btn-hero');
  const fullBtn = button('FULL GAME', () => { location.search = ''; }, 'btn-full');
  const el = h('section.screen.screen-title',
    h('div.title-art', h('h1.logo', h('span', 'LAST'), h('span.alt', 'TRACK')),
      h('p.tag', slice ? 'HERO SLICE — HAMMER · DETROIT SCRAPYARD' : 'RACE FOR MONEY. RACE FOR YOUR LIFE.')),
    h('div.panel.menu', ...(slice ? [heroBtn, fullBtn] : [cont, ng, heroBtn])),
    h('p.muted.small.keys', 'WASD/ARROWS drive · SPACE fire · E/TAB weapon · 1-4 select · SHIFT drift · C camera · P pause · M mute'));
  return {
    el,
    show() {
      if (slice) return;
      const saved = game.hasSavedGame();
      cont.disabled = !saved;
      cont.classList.toggle('btn-primary', saved);
      ng.classList.toggle('btn-primary', !saved);
    },
  };
}
