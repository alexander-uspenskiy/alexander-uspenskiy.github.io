// Entry point. Only debug.js is imported statically so a failure in any other module shows a message, not a blank page.
import { createDebug } from './debug.js';

const params = new URLSearchParams(location.search);
const debug = createDebug();

function showFatal(title, message) {
  const root = document.getElementById('ui-root') || document.body;
  const box = document.createElement('div');
  box.className = 'fatal panel';
  const h2 = document.createElement('h2'); h2.textContent = title;
  const p = document.createElement('p'); p.textContent = message;
  const hint = document.createElement('p'); hint.className = 'muted';
  hint.textContent = 'Last Track needs a modern browser with WebGL and must be served over http (npm run serve, then open http://localhost:8123).';
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'RELOAD';
  btn.onclick = () => location.reload();
  box.append(h2, p, hint, btn);
  root.append(box);
}

try {
  const touchParam = params.get('touch');
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (touchParam === '1' || (touchParam !== '0' && coarse)) document.body.classList.add('touch');
  const canvas = document.getElementById('game-canvas');
  const root = document.getElementById('ui-root');
  let storage;
  if (params.get('fresh') === '1') {
    const { createMemoryStorage } = await import('./core/storage.js');
    storage = createMemoryStorage();
  }
  const { createGame } = await import('./game/game.js');
  const game = createGame({ root, canvas, storage, quality: params.get('q') || undefined, onError: (m) => debug.pushError(m) });
  debug.attach(game);
  window.addEventListener('pagehide', () => { try { game.dispose(); } catch { /* ignore */ } });
} catch (e) {
  console.error(e);
  debug.pushError('boot: ' + ((e && e.stack) || e));
  showFatal('Last Track could not start', (e && e.message) || String(e));
  debug.failed();
}
