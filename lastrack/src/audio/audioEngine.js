// Fully procedural WebAudio. All entry points are no-ops without an AudioContext (Node / old browsers).
// Graph: engine(osc x2 -> shaper -> lowpass -> gain) + sfx + music -> master -> compressor -> out.

import { createMusicPlayer } from './music.js';

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Pure: engine pitch model. speed m/s (0..~70) -> { gear, rpm01, freq Hz }. */
export function engineModel(speed, maxSpeed = 62) {
  const v = Math.max(0, speed);
  const gearW = maxSpeed / 5;
  const gear = Math.min(5, Math.floor(v / gearW) + 1);
  const within = (v - (gear - 1) * gearW) / gearW;
  const rpm01 = clamp(0.18 + 0.82 * within, 0, 1);
  return { gear, rpm01, freq: 38 + rpm01 * 95 };
}
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/**
 * Pure: map a snapshot car (rpm, gear, throttle, slip, braking, wheelspin, surface, speed, limiter) to audio layer targets.
 * Falls back to the speed-based engineModel when the extended fields are missing.
 */
export function engineLayers(c, maxSpeed = 56) {
  const v = Math.max(0, c.speed || 0);
  const m = engineModel(v, maxSpeed);
  const r = clamp(c.rpm ?? m.rpm01, 0.1, 1.05), t = clamp(c.throttle ?? (v > 1 ? 0.5 : 0), 0, 1);
  const boost = t * smooth(0.35, 0.9, r);
  const slipAmt = Math.max((c.slip || 0) * 0.95, (c.braking || 0) > 0.9 ? 0.55 : 0, (c.wheelspin || 0) * 0.7) * clamp(v / 6, 0, 1);
  const surf = c.surface || 'tarmac';
  return {
    fund: 20 + 112 * r, rpm: r, gear: c.gear || m.gear, throttle: t, boost,
    gLow: 0.2 + 0.1 * t + 0.05 * r, gMid: 0.05 + 0.15 * r * (0.35 + 0.65 * t), lpf: 240 + 2900 * r * (0.45 + 0.55 * t),
    gIntake: 0.01 + 0.11 * t * r, gTurbo: 0.03 * boost, turboHz: 1300 + 3600 * boost,
    burbleDepth: (1 - t) * 0.4 * smooth(0.25, 0.6, r), burbleHz: (20 + 112 * r) / 2,
    limiter: !!c.limiter,
    squeal: 0.2 * Math.pow(slipAmt, 1.4), squealHz: 650 + v * 7 + 350 * (c.slip || 0),
    gravel: surf === 'dirt' ? 0.2 * clamp(v / 18, 0, 1) : surf === 'kerb' ? 0.07 * clamp(v / 18, 0, 1) : surf === 'puddle' ? 0.06 * clamp(v / 14, 0, 1) : 0,
    gravelLpf: surf === 'dirt' ? 1100 : 700, rumble: surf === 'kerb' ? clamp(v / 25, 0, 1) : 0,
    wind: 0.11 * Math.pow(clamp(v / 62, 0, 1), 2),
  };
}
/** Pure: distance attenuation for world sounds relative to the listener. */
export function distanceGain(d, ref = 12, max = 220) { return d >= max ? 0 : 1 / (1 + Math.max(0, d - ref) / ref * 0.9) * (1 - d / max); }

const MUSIC_BPM = 148;
const BASS = [0, 0, 7, 0, 3, 3, 5, 7]; // semitones above A1, 8th-note loop
const LEAD = [12, 15, 19, 15, 12, 14, 15, 19, 24, 22, 19, 15, 14, 12, 10, 12];

export function createAudioEngine() {
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  const score = createMusicPlayer(); // cinematic score (assets/music); lazy, attaches once the context exists
  let ctx = null, master = null, sfxBus = null, musicBus = null, comp = null, noiseBuf = null;
  let eng = null;
  let volume = 0.7, muted = false, racing = false, music = true;
  let lastTick = -1, lastCount = -1, lastPhase = '';
  let nextNote = 0, noteIdx = 0;

  function ensure() {
    if (ctx || !AC) return !!ctx;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
      master = ctx.createGain(); master.gain.value = muted ? 0 : volume;
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
      musicBus = ctx.createGain(); musicBus.gain.value = 0.16;
      sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
      const len = ctx.sampleRate * 1.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
      noiseBuf = buf;
      buildEngine();
      score.attach(ctx, master);
      return true;
    } catch (e) { ctx = null; return false; }
  }
  function loopNoise() {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.loopStart = 0; src.start(0, Math.random()); return src;
  }
  function buildEngine() {
    const mk = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    const o1 = mk('sawtooth', 40), o2 = mk('square', 80), o3 = mk('triangle', 20);   // fundamental, firing-order harmonic, sub
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; curve[i] = Math.tanh(2.6 * x); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 2.2;
    const gLow = ctx.createGain(), gMid = ctx.createGain(), gSub = ctx.createGain(); gLow.gain.value = gMid.gain.value = gSub.gain.value = 0;
    o1.connect(gLow); o2.connect(gMid); o3.connect(gSub);
    gLow.connect(shaper); gMid.connect(shaper); shaper.connect(lp);
    const burble = ctx.createGain(); burble.gain.value = 0.8;                      // V8 burble: amplitude LFO at firing rate
    const lfo = mk('sine', 10), lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0; lfo.connect(lfoDepth); lfoDepth.connect(burble.gain);
    const g = ctx.createGain(); g.gain.value = 0;
    lp.connect(burble); gSub.connect(burble); burble.connect(g); g.connect(master);
    // intake roar
    const nIn = loopNoise(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
    const gIntake = ctx.createGain(); gIntake.gain.value = 0; nIn.connect(bp); bp.connect(gIntake); gIntake.connect(master);
    // turbo whistle
    const oT = mk('sine', 1500), gTurbo = ctx.createGain(); gTurbo.gain.value = 0; oT.connect(gTurbo); gTurbo.connect(master);
    // tyre squeal
    const nSq = loopNoise(), sq = ctx.createBiquadFilter(); sq.type = 'bandpass'; sq.frequency.value = 900; sq.Q.value = 9;
    const gSq = ctx.createGain(); gSq.gain.value = 0; nSq.connect(sq); sq.connect(gSq); gSq.connect(master);
    // gravel / kerb rumble / puddle hiss
    const nGr = loopNoise(), gl = ctx.createBiquadFilter(); gl.type = 'lowpass'; gl.frequency.value = 900;
    const grMod = ctx.createGain(); grMod.gain.value = 1; const gGr = ctx.createGain(); gGr.gain.value = 0;
    const rumLfo = mk('sine', 26), rumDepth = ctx.createGain(); rumDepth.gain.value = 0; rumLfo.connect(rumDepth); rumDepth.connect(grMod.gain);
    nGr.connect(gl); gl.connect(grMod); grMod.connect(gGr); gGr.connect(master);
    // wind
    const nW = loopNoise(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const gW = ctx.createGain(); gW.gain.value = 0; nW.connect(hp); hp.connect(gW); gW.connect(master);
    eng = { o1, o2, o3, lp, g, gLow, gMid, gSub, bp, gIntake, lfo, lfoDepth, oT, gTurbo, sq, gSq, gl, gGr, rumDepth, gW, prevThr: 0, shiftT: 0, lastPop: 0 };
  }

  function noise(dur, { type = 'lowpass', f0 = 800, f1 = f0, q = 0.7, vol = 0.5, attack = 0.002, pan = 0, when = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); out = p; }
    out.connect(sfxBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  function tone(freq, dur, { type = 'square', vol = 0.25, slide = 0, when = 0, bus = sfxBus } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  const explosion = (v = 1) => {
    score.duck(clamp(0.45 * v, 0, 0.5), 0.3);
    noise(1.1, { f0: 1500, f1: 60, vol: 0.9 * v, q: 0.8 });                                  // blast body
    tone(90, 0.6, { type: 'sine', vol: 0.7 * v, slide: -60 }); tone(48, 0.9, { type: 'sine', vol: 0.55 * v, slide: -20 });   // sub thump
    noise(0.12, { type: 'highpass', f0: 5000, f1: 3000, vol: 0.45 * v, attack: 0.001 });      // initial crack
    for (let i = 0; i < 4; i++) noise(0.08, { type: 'bandpass', f0: 1800 - i * 300, f1: 500, q: 2.2, vol: 0.22 * v, when: 0.25 + i * 0.17 }); // debris rain
  };
  // tiered blast: tier 3 = a wrecked car (sub boom, secondary bangs, tearing metal, falling scrap, fire roar)
  const bigExplosion = (v, tier) => {
    explosion(v);
    if (tier >= 2) { tone(34, 1.3, { type: 'sine', vol: 0.8 * v, slide: -8 }); noise(0.9, { type: 'lowpass', f0: 380, f1: 50, vol: 0.7 * v, q: 0.5 }); }
    if (tier >= 3) {
      noise(0.5, { f0: 1200, f1: 80, vol: 0.55 * v, when: 0.11 }); tone(70, 0.5, { type: 'sine', vol: 0.45 * v, slide: -40, when: 0.11 });
      noise(0.6, { f0: 900, f1: 60, vol: 0.5 * v, when: 0.3 }); tone(55, 0.7, { type: 'sine', vol: 0.4 * v, slide: -25, when: 0.3 });
      noise(1.4, { type: 'bandpass', f0: 700, f1: 260, q: 0.6, vol: 0.28 * v, attack: 0.25, when: 0.4 });                    // fire roar
      for (let i = 0; i < 7; i++) { const f = 700 + ((i * 937) % 2400); tone(f, 0.05, { type: 'triangle', vol: 0.1 * v, slide: -f * 0.5, when: 0.18 + i * 0.09 }); noise(0.05, { type: 'bandpass', f0: f, f1: f * 0.6, q: 6, vol: 0.18 * v, when: 0.2 + i * 0.09 }); }   // scrap clanging down
    }
  };
  const partTear = (v) => { noise(0.22, { type: 'bandpass', f0: 2200, f1: 500, q: 3, vol: 0.4 * v }); tone(240, 0.12, { type: 'sawtooth', vol: 0.12 * v, slide: -150 }); tone(1500, 0.06, { type: 'triangle', vol: 0.1 * v, slide: -700, when: 0.1 }); };
  const scrapeSnd = (v, k) => { noise(0.1, { type: 'bandpass', f0: 2400 + 1200 * k, f1: 1800, q: 1.4, vol: 0.2 * v }); noise(0.07, { type: 'highpass', f0: 5200, f1: 4200, vol: 0.1 * v }); };
  const mg = (v) => {
    noise(0.05, { type: 'bandpass', f0: 2600, f1: 1400, q: 1.2, vol: 0.35 * v });             // crack
    noise(0.03, { type: 'highpass', f0: 6000, f1: 4000, vol: 0.12 * v });                      // brass spit
    tone(180, 0.04, { type: 'square', vol: 0.12 * v, slide: -80 }); tone(70, 0.07, { type: 'sine', vol: 0.28 * v, slide: -30 }); // chamber thump
    tone(1800, 0.02, { type: 'square', vol: 0.05 * v, when: 0.03 });                          // bolt clack
  };
  const whoosh = (v, big) => noise(big ? 0.9 : 0.6, { type: 'bandpass', f0: big ? 300 : 500, f1: big ? 1800 : 2600, q: 0.8, vol: 0.5 * v, attack: 0.15 });

  function musicTick() {
    if (!ctx || !music || !racing) return;
    const spb = 60 / MUSIC_BPM / 2;
    const now = ctx.currentTime;
    if (nextNote < now) nextNote = now + 0.05;
    while (nextNote < now + 0.25) {
      const i = noteIdx++;
      const hz = (n) => 55 * Math.pow(2, n / 12);
      const b = BASS[i % BASS.length];
      const tb = nextNote - now;
      tone(hz(b), spb * 0.9, { type: 'square', vol: 0.5, bus: musicBus, when: tb });
      if (i % 2 === 0) tone(hz(LEAD[(i >> 1) % LEAD.length] + 12), spb * 1.6, { type: 'triangle', vol: 0.45, bus: musicBus, when: tb });
      if (i % 4 === 0) noise(0.08, { f0: 150, f1: 60, vol: 0.5 });
      if (i % 4 === 2) noise(0.05, { type: 'highpass', f0: 6000, f1: 6000, vol: 0.12 });
      nextNote += spb;
    }
  }

  const coolAt = {};
  const snapCool = (key, gap) => { const t = ctx ? ctx.currentTime : 0; if ((coolAt[key] || 0) > t) return false; coolAt[key] = t + gap; return true; };
  let nitroPrev = false;
  function handleEvents(snap, player) {
    const posOf = (id) => snap.cars[id];
    const vol = (x, y) => (player ? distanceGain(Math.hypot(x - player.x, y - player.y)) : 1);
    for (const ev of snap.events || []) {
      switch (ev.type) {
        case 'shot': {
          const c = posOf(ev.carId); if (!c) break;
          const v = c.isPlayer ? 1 : vol(c.x, c.y); if (v < 0.03) break;
          if (ev.weaponId === 'machinegun') mg(v);
          else if (ev.weaponId === 'caltrops') { tone(1800, 0.05, { vol: 0.15 * v }); tone(1200, 0.08, { vol: 0.12 * v, when: 0.04 }); }
          else if (ev.weaponId === 'mine') { tone(220, 0.09, { type: 'square', vol: 0.2 * v }); tone(330, 0.09, { type: 'square', vol: 0.18 * v, when: 0.1 }); }
          else if (ev.weaponId === 'oil') noise(0.35, { type: 'lowpass', f0: 500, f1: 180, vol: 0.35 * v });
          else whoosh(v, ev.weaponId === 'terminator');
          break;
        }
        case 'explosion': {
          const tier = ev.kind === 'wreck' ? 3 : ev.kind === 'terminator' || ev.kind === 'mine' || (ev.radius || 0) >= 8 ? 2 : (ev.radius || 6) >= 5 ? 1 : 0;
          bigExplosion(clamp(vol(ev.x, ev.y) * (0.6 + (ev.radius || 6) / 12) * (tier >= 3 ? 1.15 : 1), 0, 1.3), tier); break;
        }
        case 'wreck': break;                                                    // the 'explosion' event of the wreck carries the sound
        case 'partLost': { const v = vol(ev.x, ev.y); if (v > 0.05 && !ev.wreck) partTear(v); break; }
        case 'scrape': { const c = posOf(ev.carId); const v = c ? (c.isPlayer ? 1 : vol(c.x, c.y) * 0.6) : 0.3; if (v > 0.05 && snapCool('scrape' + ev.carId, 0.09)) scrapeSnd(v, clamp((ev.speed || 10) / 50, 0, 1)); break; }
        case 'recover': { const c = posOf(ev.carId); if (c && c.isPlayer) { tone(520, 0.12, { type: 'triangle', vol: 0.18 }); tone(780, 0.16, { type: 'triangle', vol: 0.18, when: 0.1 }); } break; }
        case 'flame': { const c = posOf(ev.carId); const v = c ? (c.isPlayer ? 1 : vol(c.x, c.y)) : 0.5; if (v > 0.05) noise(0.1, { type: 'bandpass', f0: 900, f1: 450, q: 0.7, vol: 0.2 * v }); break; }
        case 'hit': { if (ev.weaponId === 'flamethrower') break; const v = vol(ev.x ?? 0, ev.y ?? 0); if (v > 0.05) { noise(0.07, { type: 'bandpass', f0: 1800, f1: 800, q: 2, vol: 0.3 * v }); tone(140, 0.08, { type: 'square', vol: 0.15 * v }); } break; }
        case 'bump': { const c = posOf(ev.carId); const v = c ? (c.isPlayer ? 1 : vol(c.x, c.y)) : 0.5; noise(0.18, { f0: 400, f1: 80, vol: clamp((ev.strength || 0.5), 0.2, 1) * 0.7 * v }); tone(70, 0.15, { type: 'sine', vol: 0.5 * v, slide: -30 }); break; }
        case 'spikeHit': { const c = posOf(ev.carId); const v = c ? (c.isPlayer ? 1 : vol(c.x, c.y)) : 0.5; if (v < 0.03) break; noise(0.22, { type: 'highpass', f0: 2600, f1: 6000, vol: 0.5 * v }); tone(1900, 0.07, { type: 'square', vol: 0.14 * v, slide: -900 }); tone(1250, 0.1, { type: 'triangle', vol: 0.12 * v, when: 0.03 }); break; }
        case 'lap': { const c = posOf(ev.carId); if (c && c.isPlayer) { tone(660, 0.1, { vol: 0.25 }); tone(990, 0.18, { vol: 0.25, when: 0.1 }); } break; }
        case 'finish': { const c = posOf(ev.carId); if (c && c.isPlayer) [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { vol: 0.25, when: i * 0.12 })); break; }
        case 'pickup': { const c = posOf(ev.carId); if (c && c.isPlayer) [880, 1175, 1568].forEach((f, i) => tone(f, 0.07, { vol: 0.2, when: i * 0.05 })); break; }
        default: break;
      }
    }
  }

  return {
    /** Call from a user gesture. */
    resume() { if (!ensure()) return; if (ctx.state === 'suspended') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } },
    /** Score scene: 'menu' | 'race' | 'win' | 'lose' | 'off' (remembered until the first user gesture). */
    setScene(name) { score.setScene(name); },
    startRace() { score.setScene('race'); racing = true; lastTick = -1; lastCount = -1; lastPhase = ''; noteIdx = 0; nextNote = 0; if (ensure() && ctx.state === 'suspended') this.resume(); },
    update(snap, dt = 1 / 60) {
      if (!ctx || !snap) return;
      const player = snap.cars.find((c) => c.isPlayer) || snap.cars[0];
      if (player && eng) {
        const t = ctx.currentTime;
        const L = engineLayers(player, 56);
        const live = racing && !player.wrecked;
        const dead = !live;
        let fund = L.fund;
        if (player.shifted) eng.shiftT = 0.12;
        eng.shiftT = Math.max(0, eng.shiftT - dt);
        if (eng.shiftT > 0) fund *= 0.9;                                     // rpm dip during the shift
        const k = 0.04;
        eng.o1.frequency.setTargetAtTime(fund, t, k); eng.o2.frequency.setTargetAtTime(fund * 2.01, t, k); eng.o3.frequency.setTargetAtTime(fund * 0.5, t, k);
        eng.gLow.gain.setTargetAtTime(L.gLow, t, 0.06); eng.gMid.gain.setTargetAtTime(L.gMid, t, 0.06); eng.gSub.gain.setTargetAtTime(0.16 + 0.1 * (1 - L.rpm), t, 0.1);
        eng.lp.frequency.setTargetAtTime(L.lpf, t, 0.06);
        eng.g.gain.setTargetAtTime(dead ? 0 : 0.62, t, 0.1);
        eng.lfo.frequency.setTargetAtTime(L.limiter ? 22 : L.burbleHz, t, 0.05);
        eng.lfoDepth.gain.setTargetAtTime(L.limiter ? 0.7 : L.burbleDepth, t, 0.05);
        eng.bp.frequency.setTargetAtTime(350 + 1600 * L.rpm, t, 0.08); eng.gIntake.gain.setTargetAtTime(dead ? 0 : L.gIntake, t, 0.08);
        eng.oT.frequency.setTargetAtTime(L.turboHz, t, 0.1); eng.gTurbo.gain.setTargetAtTime(dead ? 0 : L.gTurbo, t, 0.15);
        eng.sq.frequency.setTargetAtTime(L.squealHz, t, 0.05); eng.gSq.gain.setTargetAtTime(dead ? 0 : L.squeal, t, 0.04);
        eng.gl.frequency.setTargetAtTime(L.gravelLpf, t, 0.1); eng.gGr.gain.setTargetAtTime(dead ? 0 : L.gravel, t, 0.08);
        eng.rumDepth.gain.setTargetAtTime(L.rumble * 0.9, t, 0.08);
        eng.gW.gain.setTargetAtTime(dead ? 0 : L.wind, t, 0.2);
        // one-shots: lift-off backfire + turbo blow-off, upshift pop
        if (live && eng.prevThr > 0.7 && L.throttle < 0.25 && L.rpm > 0.6 && t - eng.lastPop > 0.25) {
          eng.lastPop = t;
          noise(0.09, { type: 'bandpass', f0: 420, f1: 180, q: 1.1, vol: 0.5 }); tone(62, 0.12, { type: 'sine', vol: 0.4, slide: -25 });
          if (eng.boostPrev > 0.5) noise(0.35, { type: 'highpass', f0: 3200, f1: 2200, q: 0.5, vol: 0.18, attack: 0.02 });
          if (Math.random() < 0.6) noise(0.05, { type: 'bandpass', f0: 900, f1: 500, q: 2, vol: 0.3 });
        }
        if (live && player.shifted && L.throttle > 0.5) noise(0.06, { type: 'bandpass', f0: 600, f1: 250, q: 1.4, vol: 0.28 });
        eng.prevThr = L.throttle; eng.boostPrev = L.boost;
      }
      if (snap.phase === 'countdown') {
        const c = Math.ceil(snap.countdown);
        if (c !== lastCount && c > 0) { tone(440, 0.18, { vol: 0.3 }); }
        lastCount = c;
      } else if (lastPhase === 'countdown' && snap.phase === 'racing') tone(880, 0.5, { vol: 0.35 });
      lastPhase = snap.phase;
      if (player && !!player.nitroOn !== nitroPrev) { nitroPrev = !!player.nitroOn; if (nitroPrev) { noise(0.7, { type: 'bandpass', f0: 500, f1: 3200, q: 0.7, vol: 0.5, attack: 0.08 }); tone(180, 0.5, { type: 'sawtooth', vol: 0.18, slide: 380 }); } }
      if (snap.tick !== lastTick) { lastTick = snap.tick; handleEvents(snap, player); }
      score.update(snap, dt);
      if (score.failed) musicTick(); // procedural fallback only if the score files can't load
    },
    stop() { racing = false; if (eng && ctx) { for (const n of [eng.g, eng.gIntake, eng.gTurbo, eng.gSq, eng.gGr, eng.gW]) n.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } },
    setMuted(b) { muted = !!b; if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03); },
    setVolume(v) { volume = clamp(+v || 0, 0, 1); if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03); },
    setMusic(b) { music = !!b; score.setVolume(music ? 1 : 0); },
    get score() { return score; },
    get running() { return !!ctx && ctx.state === 'running'; },
    dispose() { racing = false; score.dispose(); try { if (eng) { eng.o1.stop(); eng.o2.stop(); eng.o3.stop(); eng.oT.stop(); eng.lfo.stop(); } if (ctx) ctx.close(); } catch (e) { /* ignore */ } ctx = null; eng = null; },
  };
}
