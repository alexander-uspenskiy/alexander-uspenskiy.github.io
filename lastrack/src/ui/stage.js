// Bridge between a screen and the 3D showroom stage (game.stage). Falls back to a vector car silhouette when WebGL is unavailable.
import { h } from './dom.js';
import { carSilhouette } from './icons.js';

/** useStage(game, screenEl, { side: 1 | -1 | 0, mode }) -> { show(spec), hide() }. side = which half of the screen the car sits in. */
export function useStage(game, screenEl, { side = 1, mode = 'showcase' } = {}) {
  let fb = null;
  return {
    show(spec) {
      const st = game.stage;
      if (st) {
        st.setMode(mode, { side });
        if (spec) st.setCar(spec.livery || !game.liveryOf ? spec : { ...spec, livery: game.liveryOf(spec.carId) });
        return;
      }
      if (!spec) return;
      if (!fb) { fb = h('div.stage-fallback' + (side < 0 ? '.left' : '')); screenEl.prepend(fb); }
      fb.textContent = '';
      fb.append(carSilhouette(spec.carId));
    },
    hide() { if (fb) { fb.remove(); fb = null; } },
  };
}
