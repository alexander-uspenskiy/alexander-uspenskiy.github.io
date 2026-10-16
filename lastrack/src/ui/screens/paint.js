// Paint & decals: pick the car's paint (12 clearcoat presets), underglow colour and racing number, buy decals and place up to six on the
// hood / doors / roof / trunk (tint, scale, rotation, mirror). Every change updates the live 3D car and is saved. Free to change or remove.
import { h, button, screenHeader, fmtMoney, attachMenuKeys, clear } from '../dom.js';
import { PAINTS, ACCENTS, playerLivery } from '../../data/liveries.js';
import { DECALS, ZONES, ZONE_NAMES, MAX_DECALS, SCALE_MIN, SCALE_MAX, defaultPlacement, getDecal } from '../../data/decals.js';
import { drawDecal } from '../../render/decalArt.js';
import { useStage } from '../stage.js';
import { getCar } from '../../data/cars.js';

const css = (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0');
/** Thumbnail canvas of a decal (design space is y-up, so flip). */
export function decalThumb(id, color = '#ffffff', size = 44) {
  const c = h('canvas', { width: size * 2, height: size * 2 }); c.style.width = size + 'px'; c.style.height = size + 'px';
  const g = c.getContext('2d'); g.translate(size, size); g.scale(size * 1.7, -size * 1.7); drawDecal(g, id, color);
  return c;
}
export const swatch = (hex, title, on, onclick) => h('button.swatch' + (on ? '.on' : ''), { type: 'button', title, 'aria-label': title, style: { '--sw': css(hex) }, onclick });

export function createPaintScreen({ game, flow }) {
  let tab = 'paint', zone = 'hood', sel = -1, detach = null, stageApi = null;
  const cash = h('span.chip.cash'), msg = h('p.msg.muted'), body = h('div.paint-body-inner');
  const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };
  const save = () => game.getSave();
  const run = (r, ok) => { if (!r.ok) say(r.error || 'Cannot do that.', true); else if (ok) say(ok); render(); };

  function paintTab() {
    const lv = playerLivery(save()), car = getCar(save().carId);
    return h('div.paint-tab',
      h('div.panel-title', `PAINT — ${car ? car.name.toUpperCase() : ''}`),
      h('div.swatches', PAINTS.map((p) => swatch(p.hex, p.name, lv.paint === p.id, () => run(game.setPaint(p.id), `${p.name}.`)))),
      h('p.muted.small', PAINTS.find((p) => p.id === lv.paint)?.name ?? ''),
      h('div.panel-title', 'UNDERGLOW & LIGHT STRIPS'),
      h('div.swatches', ACCENTS.map((a) => swatch(a.hex, a.name, lv.accent === a.id, () => run(game.setAccent(a.id))))),
      h('div.panel-title', 'RACING NUMBER'),
      h('div.row', h('input.num-input', { type: 'text', maxlength: 2, inputmode: 'numeric', value: save().number || '', placeholder: '--', 'aria-label': 'Racing number', oninput: (e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); e.target.value = v; const r = game.setNumber(v); if (!r.ok) say(r.error, true); } }),
        h('span.muted.small', 'Shown on both doors. Leave empty for none.')));
  }
  function decalsTab() {
    const sv = save(), owned = sv.decalsOwned || [], placed = sv.decals || [], lv = playerLivery(sv);
    const zoneBtns = ZONES.map((z) => button(ZONE_NAMES[z], () => { zone = z; render(); }, 'btn-small' + (zone === z ? ' btn-primary' : '')));
    const tiles = DECALS.map((d) => {
      const own = owned.includes(d.id);
      const t = h('button.decal-tile' + (own ? '.owned' : ''), { type: 'button', title: `${d.name}${own ? '' : ' — ' + fmtMoney(d.price)}`, dataset: { decal: d.id },
        onclick: () => {
          if (!own) return run(game.buyDecal(d.id), `${d.name} bought — ${fmtMoney(d.price)}.`);
          const r = game.placeDecal(defaultPlacement(d.id, zone, lv.paint === 'pearl-white' ? 'stealth-black' : 'pearl-white'));
          if (r.ok) sel = (save().decals || []).length - 1;
          run(r, `${d.name} on the ${ZONE_NAMES[zone].toLowerCase()}.`);
        } }, decalThumb(d.id, own ? '#e8f4ff' : '#7c8ba3'), h('small', d.name), h('em', own ? 'OWNED' : fmtMoney(d.price)));
      if (!own && sv.cash < d.price) t.classList.add('poor');
      return t;
    });
    const rows = placed.map((p, i) => h('button.placed-row' + (sel === i ? '.on' : ''), { type: 'button', onclick: () => { sel = i; render(); } }, decalThumb(p.id, css(PAINTS.find((x) => x.id === p.tint)?.hex ?? 0xffffff), 28), h('span', `${getDecal(p.id)?.name ?? p.id} · ${ZONE_NAMES[p.zone]}`)));
    const cur = placed[sel];
    const editor = cur ? h('div.decal-editor',
      h('div.row', ...ZONES.map((z) => button(ZONE_NAMES[z], () => run(game.updateDecal(sel, { zone: z })), 'btn-small' + (cur.zone === z ? ' btn-primary' : '')))),
      h('div.swatches.mini', PAINTS.map((p) => swatch(p.hex, `Tint: ${p.name}`, cur.tint === p.id, () => run(game.updateDecal(sel, { tint: p.id }))))),
      h('label.slider', 'SCALE', h('input', { type: 'range', min: SCALE_MIN, max: SCALE_MAX, step: 0.05, value: cur.scale, oninput: (e) => game.updateDecal(sel, { scale: +e.target.value }) })),
      h('label.slider', 'ROTATION', h('input', { type: 'range', min: -180, max: 180, step: 5, value: cur.rot, oninput: (e) => game.updateDecal(sel, { rot: +e.target.value }) })),
      h('div.row', button(cur.mirror ? 'MIRRORED' : 'MIRROR', () => run(game.updateDecal(sel, { mirror: !cur.mirror })), 'btn-small' + (cur.mirror ? ' btn-primary' : '')),
        button('REMOVE', () => { const r = game.removeDecal(sel); sel = -1; run(r, 'Decal removed (free).'); }, 'btn-small btn-remove'))) : h('p.muted.small', placed.length ? 'Select a placed decal to tint, scale, rotate or mirror it.' : 'Buy a decal, then tap it to put it on the selected zone.');
    return h('div.decals-tab',
      h('div.panel-title', 'PLACE ON'), h('div.row.wrap', zoneBtns),
      h('div.panel-title', `DECALS — ${placed.length}/${MAX_DECALS} PLACED`), h('div.decal-grid', tiles),
      h('div.placed-list', rows), editor);
  }
  function render() {
    cash.textContent = fmtMoney(save().cash);
    clear(body);
    body.append(h('div.row.tabs', button('PAINT', () => { tab = 'paint'; render(); }, 'btn-small' + (tab === 'paint' ? ' btn-primary' : '')), button('DECALS', () => { tab = 'decals'; render(); }, 'btn-small' + (tab === 'decals' ? ' btn-primary' : ''))),
      tab === 'paint' ? paintTab() : decalsTab(), msg);
  }
  const el = h('section.screen.screen-paint.screen-3d',
    screenHeader('PAINT & DECALS', 'Make it yours. Changing or removing anything is free.', cash),
    h('div.panel.paint-main', body),
    h('footer.screen-foot', button('BACK', () => flow.transition('garage'), 'btn-back'), h('span.spacer'), button('ARMORY', () => flow.transition('shop'))));
  return {
    el,
    show() { detach = attachMenuKeys(el); say(''); sel = -1; render(); stageApi = useStage(game, el, { side: -1, mode: 'garage' }); const s = save(); stageApi.show({ carId: s.carId, color: getCar(s.carId).color, upgrades: s.upgrades }); },
    hide() { detach?.(); stageApi?.hide(); stageApi = null; },
  };
}
