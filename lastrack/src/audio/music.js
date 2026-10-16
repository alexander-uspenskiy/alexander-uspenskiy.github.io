// Cinematic score player. Streams nothing: tracks are fetched lazily, decoded once, played via WebAudio.
// Pure helpers (formats, combat model, scene plan) are exported for Node tests; everything touching
// AudioContext is guarded so importing/creating in Node (or before a user gesture) is a no-op.

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Track table. `dur` = exact musical loop length (decoded files carry ~7 ms of codec padding). */
export const TRACKS = {
  menu: { file: 'menu', loop: true, dur: 80 },
  'race-base': { file: 'race-base', loop: true, dur: 51.2 },
  'race-combat': { file: 'race-combat', loop: true, dur: 51.2 },
  'results-win': { file: 'results-win', loop: false, dur: 8 },
  'results-lose': { file: 'results-lose', loop: false, dur: 8 },
};
export const SCENES = ['off', 'menu', 'race', 'win', 'lose'];
const SCENE_TRACKS = { menu: ['menu'], race: ['race-base', 'race-combat'], win: ['results-win'], lose: ['results-lose'], off: [] };

/** Pure: pick 'ogg' (opus, gapless) when the browser can play it, else 'mp3'. */
export function pickFormat(canPlay) {
  return canPlay && canPlay('audio/ogg; codecs="opus"') ? 'ogg' : 'mp3';
}
/** Pure: asset URL. */
export function trackUrl(id, fmt = 'ogg', base = 'assets/music/') { return `${base}${TRACKS[id].file}.${fmt}`; }
/** Pure: which tracks a scene needs, with target gain per track given combat level 0..1. */
export function scenePlan(scene, combat = 0) {
  const c = clamp(combat, 0, 1);
  if (scene === 'race') return { 'race-base': 1, 'race-combat': c };
  if (scene === 'menu') return { menu: 1 };
  if (scene === 'win') return { 'results-win': 1 };
  if (scene === 'lose') return { 'results-lose': 1 };
  return {};
}

/** Pure: how much an event raises combat intensity (0..~0.5), given player position for proximity. */
export function eventWeight(ev, player) {
  if (!ev) return 0;
  const near = (r) => {
    if (!player || ev.x == null || ev.y == null) return 0.6;
    const d = Math.hypot(ev.x - player.x, ev.y - player.y);
    return d >= r ? 0 : 1 - d / r;
  };
  switch (ev.type) {
    case 'explosion': return 0.4 * near(80) + 0.05;
    case 'wreck': return 0.35 * near(100);
    case 'hit': return 0.22 * near(60);
    case 'bump': return 0.1 * near(30);
    case 'shot': return ev.carId === 0 ? 0.08 : 0.04 * near(70);
    default: return 0;
  }
}
/** Pure combat-intensity model: events push it up, it decays; `level` is smoothed 0..1. */
export function createCombatModel({ decay = 0.09, attack = 1.6, release = 0.35 } = {}) {
  let raw = 0, level = 0;
  return {
    push(events, player) { for (const ev of events || []) raw = clamp(raw + eventWeight(ev, player), 0, 1.2); },
    step(dt) {
      raw = Math.max(0, raw - decay * dt);
      const target = clamp(raw * 1.6, 0, 1);
      const k = target > level ? attack : release;
      level += (target - level) * (1 - Math.exp(-k * dt));
      return level;
    },
    reset() { raw = 0; level = 0; },
    get level() { return level; },
    get raw() { return raw; },
  };
}

/**
 * createMusicPlayer({ fetchFn?, baseUrl?, format?, crossfade? })
 * Nothing audible/allocated until attach(ctx, destination) (called from a user-gesture path by the engine).
 * setScene() before attach is remembered and applied on attach.
 */
export function createMusicPlayer({ fetchFn, baseUrl = 'assets/music/', format, crossfade = 1.6 } = {}) {
  const doFetch = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const fmt = format || (typeof document !== 'undefined' && document.createElement
    ? pickFormat((t) => { try { return document.createElement('audio').canPlayType(t); } catch { return ''; } }) : 'mp3');
  let ctx = null, out = null, duckNode = null, volNode = null;
  let scene = 'off', pendingScene = 'off', volume = 1, muted = false, disposed = false;
  const buffers = new Map();   // id -> Promise<AudioBuffer|null>
  const active = new Map();    // scene-instance -> { scene, gain, voices:{id:{src,gain}} }
  const combat = createCombatModel();
  let current = null, token = 0, lastCombatSet = -1, lastTick = -1, failed = false;

  const publish = () => { try { if (typeof document !== 'undefined' && document.documentElement) document.documentElement.dataset.music = scene; } catch { /* ignore */ } };

  function load(id) {
    if (buffers.has(id)) return buffers.get(id);
    const p = (async () => {
      if (!ctx || !doFetch) return null;
      try {
        const res = await doFetch(trackUrl(id, fmt, baseUrl));
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        return await new Promise((ok, no) => { const r = ctx.decodeAudioData(ab, ok, no); if (r && r.then) r.then(ok, no); });
      } catch { buffers.delete(id); return null; }
    })();
    buffers.set(id, p);
    return p;
  }

  function fadeTo(g, v, secs) {
    const t = ctx.currentTime;
    try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + Math.max(0.01, secs)); } catch { g.gain.value = v; }
  }

  async function startScene(name) {
    const my = ++token;
    const prev = current;
    if (prev) { // fade out old scene, stop after the fade
      fadeTo(prev.gain, 0, crossfade);
      const stopAt = ctx.currentTime + crossfade + 0.1;
      for (const v of Object.values(prev.voices)) { try { v.src.stop(stopAt); } catch { /* ignore */ } }
      current = null;
    }
    scene = name; publish();
    const ids = SCENE_TRACKS[name] || [];
    if (!ids.length) return;
    const bufs = await Promise.all(ids.map(load));
    if (disposed || my !== token) return;
    if (!bufs.some(Boolean)) { failed = true; return; }
    failed = false;
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(duckNode);
    const when = ctx.currentTime + 0.05, plan = scenePlan(name, combat.level), voices = {};
    ids.forEach((id, i) => {
      if (!bufs[i]) return;
      const src = ctx.createBufferSource(), g = ctx.createGain(), tr = TRACKS[id];
      src.buffer = bufs[i]; src.loop = tr.loop;
      if (tr.loop) { src.loopStart = 0; src.loopEnd = Math.min(tr.dur, bufs[i].duration); }
      g.gain.value = plan[id] ?? 0; src.connect(g); g.connect(gain); src.start(when);
      voices[id] = { src, gain: g };
    });
    fadeTo(gain, 1, name === 'win' || name === 'lose' ? 0.05 : crossfade);
    current = { scene: name, gain, voices };
    lastCombatSet = -1;
    // one-shot stingers: let the node end on its own; clear `current` voices reference stays harmless
  }

  const api = {
    /** Called by the audio engine once its AudioContext exists (after a user gesture). */
    attach(audioCtx, destination) {
      if (ctx || !audioCtx || disposed) return !!ctx;
      ctx = audioCtx; out = destination || ctx.destination;
      volNode = ctx.createGain(); volNode.gain.value = muted ? 0 : volume;
      duckNode = ctx.createGain(); duckNode.gain.value = 1;
      duckNode.connect(volNode); volNode.connect(out);
      if (pendingScene !== 'off') startScene(pendingScene);
      return true;
    },
    setScene(name) {
      if (!SCENES.includes(name)) return;
      if (name === pendingScene && name === scene) return;
      pendingScene = name;
      if (name !== 'race') combat.reset();
      if (ctx) startScene(name); else { scene = name; publish(); }
    },
    /** Feed snapshot events (hits/explosions...) and advance the combat layer. Cheap: call every frame. */
    update(snap, dt = 1 / 60) {
      if (scene !== 'race') return;
      const player = snap && (snap.cars?.find((c) => c.isPlayer) || snap.cars?.[0]);
      if (snap && snap.tick !== lastTick) { lastTick = snap.tick; if (snap.events && snap.events.length) combat.push(snap.events, player); }
      const lvl = combat.step(dt);
      const v = current && current.voices['race-combat'];
      if (v && Math.abs(lvl - lastCombatSet) > 0.01) { lastCombatSet = lvl; v.gain.gain.setTargetAtTime(lvl, ctx.currentTime, 0.25); }
    },
    /** Dip the music under an SFX burst: depth 0..1, hold seconds, then recover. */
    duck(depth = 0.4, hold = 0.25) {
      if (!ctx) return;
      const t = ctx.currentTime, g = duckNode.gain;
      g.cancelScheduledValues(t); g.setTargetAtTime(1 - clamp(depth, 0, 0.9), t, 0.02); g.setTargetAtTime(1, t + hold, 0.35);
    },
    setVolume(v) { volume = clamp(+v || 0, 0, 1); if (volNode && !muted) volNode.gain.setTargetAtTime(volume, ctx.currentTime, 0.05); },
    setMuted(b) { muted = !!b; if (volNode) volNode.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05); },
    preload(sceneName) { if (ctx) (SCENE_TRACKS[sceneName] || []).forEach(load); },
    get scene() { return scene; },
    /** True when the current scene's files could not be loaded (caller may fall back to procedural music). */
    get failed() { return failed; },
    get combatLevel() { return combat.level; },
    /** Debug/verification snapshot (also mirrored as <html data-music="scene">). */
    get state() {
      return { attached: !!ctx, scene, format: fmt, combat: +combat.level.toFixed(3), muted, volume, ctxState: ctx ? ctx.state : 'none',
        playing: current ? Object.keys(current.voices) : [], loaded: [...buffers.keys()] };
    },
    dispose() { disposed = true; try { for (const v of Object.values(current?.voices || {})) v.src.stop(); } catch { /* ignore */ } current = null; },
  };
  return api;
}
