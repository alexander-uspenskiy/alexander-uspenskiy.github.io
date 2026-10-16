// Slice garage screen: the Hammer, the Neon Loop, the enemy field, graphics quality and START RACE. Slice-only.
import { h, button, statBar, attachMenuKeys } from '../dom.js';
import { getCar } from '../../data/cars.js';
import { getDriver } from '../../data/drivers.js';
import { getTrack } from '../../data/tracks/index.js';
import { paletteHex } from '../../data/palette.js';
import { SLICE_FIELD, SLICE_TRACK_ID, SLICE_LAPS } from '../../data/sliceConfig.js';
import { QUALITY_ORDER } from '../../render/pbr/quality.js';

export function createSliceGarageScreen({ game, flow }) {
  const car = getCar('hammer'), track = getTrack(SLICE_TRACK_ID);
  const bars = { speed: statBar('SPEED'), accel: statBar('ACCEL'), grip: statBar('GRIP'), armor: statBar('ARMOR') };
  bars.speed.set(car.base.maxSpeed, 80, Math.round(car.base.maxSpeed * 3.6) + ' kph'); bars.accel.set(car.base.accel, 40); bars.grip.set(car.base.grip, 1.6, car.base.grip.toFixed(2)); bars.armor.set(car.base.armor, 200);
  const qBtns = QUALITY_ORDER.map((q) => button(q.toUpperCase(), () => { game.pbr?.setQuality(q); sync(); }, 'btn-q'));
  const sync = () => qBtns.forEach((b, i) => b.classList.toggle('btn-primary', game.pbr && game.pbr.qualityName === QUALITY_ORDER[i]));
  const enemies = SLICE_FIELD.map((f) => { const d = getDriver(f.id); return h('div.sg-enemy', h('i', { style: { background: paletteHex(f.color) } }), h('span', `${d.name} #${f.number}`), h('em', d.favoriteWeapon.toUpperCase())); });
  let detach = null;
  const el = h('section.screen.screen-slice-garage',
    h('div.sg-panel.panel', h('h1.logo', h('span', 'LAST'), h('span.alt', 'TRACK')), h('p.tag', 'HERO SLICE'),
      h('h2.sg-car', 'HAMMER'), h('p.muted', 'Armoured muscle car. Fixed roof turret fires straight ahead — line the shot up.'),
      bars.speed.el, bars.accel.el, bars.grip.el, bars.armor.el,
      h('p.muted.small', 'WEAPON  MACHINE GUN ×200'),
      h('h3', 'TRACK'), h('p', `${track.name.toUpperCase()} · ${(1.15).toFixed(2)} km · ${SLICE_LAPS} laps`),
      h('h3', 'ENEMY HAMMERS'), ...enemies,
      h('h3', 'GRAPHICS'), h('div.row', ...qBtns),
      button('START RACE ▶', () => game.startSlice(), 'btn-primary btn-start'),
      h('p.muted.small', 'Drag to rotate · wheel to zoom · G in race: graphics · C camera · WASD/arrows drive · SPACE fire · P pause')));
  return { el, show() { detach = attachMenuKeys(el); sync(); }, hide() { if (detach) detach(); detach = null; } };
}
