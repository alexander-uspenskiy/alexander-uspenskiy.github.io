// In-race world-anchored overlays: competitor nameplates (name + armour bar + skull when wrecked) and the guided-missile
// lock reticle. Pooled DOM nodes, screen-space projection from the camera matrices, no per-frame allocation.
import * as THREE from 'three';

export const PLATE_MAX = 5;          // plates shown at once (nearest first)
export const PLATE_RANGE = 150;      // m: beyond this no plate
export const PLATE_FADE_FROM = 70;   // m: alpha starts dropping here
export const PLATE_NEAR = 6;         // m: too close (inside the camera cone) -> hide
export const WRECK_FADE_DELAY = 1.2, WRECK_FADE_TIME = 2.2;

/** Pure: armour fraction -> css colour, green -> amber -> red. */
export function healthColor(f) {
  const k = Math.max(0, Math.min(1, f));
  let r, g;
  if (k > 0.5) { const t = (k - 0.5) * 2; r = Math.round(255 + (60 - 255) * t); g = Math.round(190 + (230 - 190) * t); }
  else { const t = k * 2; r = 255; g = Math.round(50 + (190 - 50) * t); }
  return `rgb(${r},${g},${k > 0.5 ? 90 : 50})`;
}

/** Pure: scale + alpha of a plate at distance d (m). show=false when out of range or too close. */
export function plateLook(d) {
  if (d > PLATE_RANGE || d < PLATE_NEAR) return { show: false, scale: 0, alpha: 0 };
  const scale = Math.max(0.62, Math.min(1.1, 1.25 - d / 160));
  const alpha = d <= PLATE_FADE_FROM ? 1 : Math.max(0, 1 - (d - PLATE_FADE_FROM) / (PLATE_RANGE - PLATE_FADE_FROM));
  return { show: alpha > 0.02, scale, alpha };
}

/** Pure: alpha multiplier for a wreck that has been dead for `t` seconds (0 -> gone after delay+time). */
export function wreckAlpha(t) { return Math.max(0, Math.min(1, 1 - (t - WRECK_FADE_DELAY) / WRECK_FADE_TIME)); }

/** Pure: lock reticle size (px) shrinks as lock progress p (0..1) closes in. */
export function reticleSize(p, base = 120, min = 54) { return min + (base - min) * (1 - Math.max(0, Math.min(1, p))); }

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const SKULL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C7 2 4 5.4 4 9.6c0 2.5 1.2 4.3 3 5.4V19h2v-2h1.5v2h3v-2H15v2h2v-4c1.8-1.1 3-2.9 3-5.4C20 5.4 17 2 12 2zM8.7 11.6a1.8 1.8 0 110-3.6 1.8 1.8 0 010 3.6zm6.6 0a1.8 1.8 0 110-3.6 1.8 1.8 0 010 3.6zM12 13l1.2 2h-2.4z"/></svg>';

function makePlate() {
  const el = document.createElement('div'); el.className = 'np';
  const name = document.createElement('span'); name.className = 'np-name';
  const skull = document.createElement('i'); skull.className = 'np-skull'; skull.innerHTML = SKULL;
  const row = document.createElement('div'); row.className = 'np-row'; row.append(skull, name);
  const bar = document.createElement('div'); bar.className = 'np-bar';
  const fill = document.createElement('div'); fill.className = 'np-fill'; bar.append(fill);
  el.append(row, bar);
  return { el, name, skull, fill, nameStr: '', accent: '', carId: -1, deadFor: 0, vis: false };
}

export function createOverlays({ root }) {
  const layer = document.createElement('div'); layer.className = 'overlay-layer';
  const plates = [];
  for (let i = 0; i < PLATE_MAX + 1; i++) { const p = makePlate(); layer.append(p.el); plates.push(p); }
  const ret = document.createElement('div'); ret.className = 'lock-reticle';
  ret.innerHTML = '<b></b><b></b><b></b><b></b><span>LOCK</span>';
  const retLabel = ret.lastChild;
  layer.append(ret);
  root.append(layer);
  const v = new THREE.Vector3();
  const byCar = new Map();           // carId -> plate (stable assignment so names do not thrash)
  const deadFor = new Map();         // carId -> seconds wrecked
  const cand = new Array(16).fill(null).map(() => ({ c: null, d: 0, x: 0, y: 0 }));
  let retVis = false, retMode = '';
  let enabled = true;

  function project(camera, x, y, z, w, h) {
    v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    if (v.z > -0.1) return false;   // behind the camera
    v.applyMatrix4(camera.projectionMatrix);
    if (v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15) return false;
    px = (v.x * 0.5 + 0.5) * w; py = (-v.y * 0.5 + 0.5) * h;
    return true;
  }
  let px = 0, py = 0;

  function hidePlate(p) { if (p.vis) { p.vis = false; p.el.style.opacity = '0'; p.el.style.visibility = 'hidden'; } }

  return {
    el: layer,
    setEnabled(on) { enabled = !!on; if (!enabled) this.clear(); },
    get enabled() { return enabled; },
    /** snap: latest snapshot; camera: THREE camera (matrices current); w/h: css px of the canvas; dt seconds. */
    update(snap, camera, w, h, dt, poseOf) {
      if (!snap || !camera || !(w > 0)) return this.clear();
      const me = snap.cars[0];
      let n = 0;
      if (enabled && me) {
        const cx = camera.position.x, cz = camera.position.z;
        for (let i = 1; i < snap.cars.length; i++) {
          const c = snap.cars[i];
          if (c.wrecked) deadFor.set(c.id, (deadFor.get(c.id) || 0) + dt); else deadFor.set(c.id, 0);
          const dead = deadFor.get(c.id) || 0;
          if (c.wrecked && wreckAlpha(dead) <= 0.01) continue;
          const pz = poseOf && poseOf(c.id); const d = Math.hypot((pz ? pz.x : c.x) - cx, (pz ? pz.y : c.y) - cz);
          const look = plateLook(d);
          if (!look.show) continue;
          if (n < cand.length) { const k = cand[n++]; k.c = c; k.d = d; }
        }
        // nearest first, no allocation: insertion sort over <=16 entries
        for (let i = 1; i < n; i++) { const k = cand[i]; let j = i - 1; const tc = k.c, td = k.d; while (j >= 0 && cand[j].d > td) { cand[j + 1].c = cand[j].c; cand[j + 1].d = cand[j].d; j--; } cand[j + 1].c = tc; cand[j + 1].d = td; }
      }
      for (const p of plates) p.used = false;
      let shown = 0;
      for (let i = 0; i < n && shown < PLATE_MAX; i++) {
        const { c, d } = cand[i];
        const pz = poseOf && poseOf(c.id);
        if (!project(camera, pz ? pz.x : c.x, 2.3, pz ? pz.y : c.y, w, h)) continue;
        let p = byCar.get(c.id);
        if (!p || p.used) { p = null; for (const q of plates) if (!q.used && (!q.vis || q.carId < 0)) { p = q; break; } if (!p) for (const q of plates) if (!q.used) { p = q; break; } if (!p) continue; byCar.set(c.id, p); }
        p.used = true; shown++;
        const look = plateLook(d);
        if (p.carId !== c.id) { p.carId = c.id; p.nameStr = ''; p.accent = ''; }
        if (p.nameStr !== c.name) { p.nameStr = c.name; p.name.textContent = c.name; }
        const acc = c.livery ? hex(c.livery.accentHex ?? c.livery.paintHex) : '#9ff';
        if (p.accent !== acc) { p.accent = acc; p.el.style.setProperty('--acc', acc); }
        const frac = c.armorMax > 0 ? Math.max(0, c.armor / c.armorMax) : 0;
        p.fill.style.width = (frac * 100).toFixed(0) + '%';
        p.fill.style.background = healthColor(frac);
        const dead = c.wrecked;
        if (p.dead !== dead) { p.dead = dead; p.el.classList.toggle('dead', dead); }
        const a = look.alpha * (dead ? wreckAlpha(deadFor.get(c.id) || 0) : 1);
        p.el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-100%) scale(${look.scale.toFixed(2)})`;
        p.el.style.opacity = a.toFixed(2);
        if (!p.vis) { p.vis = true; p.el.style.visibility = 'visible'; }
      }
      for (const p of plates) if (!p.used) { hidePlate(p); if (byCar.get(p.carId) === p) byCar.delete(p.carId); p.carId = -1; }
      // --- lock reticle (player's guided missile)
      let on = false;
      if (me && me.lock) {
        const t = snap.cars[me.lock.id], tp = poseOf && t && poseOf(t.id);
        const aw = me.weapons && me.weapons[me.activeWeapon];
        if (t && !t.wrecked && aw && aw.id === 'guided' && project(camera, tp ? tp.x : t.x, 1.1, tp ? tp.y : t.y, w, h)) {
          const prog = me.lock.locked ? 1 : me.lock.t / 0.45;
          const s = reticleSize(prog);
          ret.style.width = ret.style.height = s.toFixed(0) + 'px';
          ret.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-50%)`;
          const mode = me.lock.locked ? 'locked' : 'acq';
          if (mode !== retMode) { retMode = mode; ret.className = 'lock-reticle ' + mode; retLabel.textContent = me.lock.locked ? 'LOCKED' : 'LOCKING'; }
          on = true;
        }
      }
      if (on !== retVis) { retVis = on; ret.style.visibility = on ? 'visible' : 'hidden'; if (!on) retMode = ''; }
    },
    clear() { for (const p of plates) { hidePlate(p); p.carId = -1; } byCar.clear(); deadFor.clear(); if (retVis) { retVis = false; retMode = ''; ret.style.visibility = 'hidden'; } },
    dispose() { layer.remove(); },
  };
}
