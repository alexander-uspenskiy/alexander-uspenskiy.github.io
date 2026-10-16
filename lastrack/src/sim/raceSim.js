// Race simulation: owns cars, weapons, projectiles, director, AI. Fixed 120 Hz step, deterministic.
import { clamp, mulberry32 } from '../core/mathUtil.js';
import { createEventBus } from '../core/eventBus.js';
import { buildTrack } from '../core/trackModel.js';
import { getTrack } from '../data/tracks/index.js';
import { getCar } from '../data/cars.js';
import { getDriver } from '../data/drivers.js';
import { SIM_DT, createCarBody, stepBody } from './carPhysics.js';
import { initDamage, applyDamage, damageZone, addZoneDamage, popTyres, updateDamage, damageMods, isSmoking, isBurning, repair } from './damage.js';
import { initWeapons, tryFire, cycleWeapon, selectWeapon, tickCooldowns, addAmmo } from './weapons.js';
import { updateLock } from './lockOn.js';
import { getWeapon } from '../data/weapons.js';
import { createProjectileSystem, createHazardSystem } from './projectiles.js';
import { resolveWall, softEdge, wallDamage, resolveCarCar, pointCarDistance } from './collisions.js';
import { newlyLost, remainingParts, PART_ORIGIN } from './parts.js';
import { initRecovery, recoveryTimers, beginRecovery, stepRecovery } from './recovery.js';
import { createDirector } from './raceDirector.js';
import { contactZone, spikeDamage, spikeProtection } from '../data/spikes.js';
import { createAI, driveAI } from './ai/aiDriver.js';
import { surfaceAt, surfaceMods } from './surfaces.js';

export const COUNTDOWN_SECONDS = 3;
const PICKUP_RADIUS = 3.5;
const PICKUP_RESPAWN = 15;
const REPAIR_FRACTION = 0.25;
const CASH_PICKUP = 250;
const RAM_MIN = 4, RAM_K = 0.4;
const SPIKE_MIN_CLOSE = 2.5;
const KILL_CREDIT_WINDOW = 4;
const EMPTY_INPUT = { throttle: 0, brake: 0, steer: 0, fire: false, cycleWeapon: false, selectWeapon: null, handbrake: false, nitro: false };

export function createRaceSim(config, opts = {}) {
  const track = opts.track || buildTrack(getTrack(config.trackId));
  const laps = config.laps || track.def?.laps || 3;
  const halfWidth = track.width / 2;
  const seed = (config.seed ?? 1) >>> 0;
  const rng = mulberry32(seed);
  const fxRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);   // separate stream: cosmetic seeds never perturb gameplay randomness
  const bus = createEventBus();
  let frameEvents = [];
  const emit = (type, payload) => {
    const ev = { type, ...payload };
    frameEvents.push(ev);
    bus.emit(type, ev);
  };
  let idCounter = 1;
  const nextId = () => idCounter++;

  // ---- cars
  const entries = [{ isPlayer: true, stats: config.player.stats, armor: config.player.armor, loadout: config.player.loadout, spikes: config.player.spikes || null, driverId: 'player', carId: config.player.carId, livery: config.player.livery || null }];
  for (const r of config.rivals || []) entries.push({ isPlayer: false, stats: r.stats, armor: r.stats.armor, loadout: r.loadout, driverId: r.driverId, skill: r.skill, aggression: r.aggression, favoriteWeapon: r.favoriteWeapon, spikes: r.spikes || null, color: r.color, hunt: !!r.hunt, livery: r.livery || null });
  const grid = track.startGrid(entries.length);
  const cars = entries.map((e, i) => {
    const car = createCarBody(grid[i], e.stats);
    car.id = i; car.isPlayer = e.isPlayer; car.driverId = e.driverId;
    const driver = e.isPlayer ? null : getDriver(e.driverId);
    const def = e.isPlayer ? getCar(e.carId) : null;
    car.name = e.isPlayer ? 'You' : driver?.name ?? e.driverId;
    car.color = e.isPlayer ? def?.color ?? 8 : e.color ?? driver?.color ?? 9;
    car.helmetColor = e.isPlayer ? 7 : driver?.helmet ?? 10;
    initDamage(car, e.stats.armor ?? 60, e.armor);
    car.partsLost = [];
    initWeapons(car, e.loadout);
    car.livery = e.livery || null;
    car.spikes = e.spikes || null;
    car.kills = 0; car.bumpCd = 0; car.cash = 0; car.rank = i + 1;
    car.proj = track.project(car.x, car.y);
    initRecovery(car); car.scrapeCd = 0; car.wallT = -9;
    car.aiControlled = !e.isPlayer || !!opts.aiPlayer;
    if (car.aiControlled || e.isPlayer) {
      car.ai = createAI(track, car, e.isPlayer ? { skill: opts.aiSkill ?? 1, aggression: 0 } : { skill: e.skill ?? 0.8, aggression: e.aggression ?? 0.5, favoriteWeapon: e.favoriteWeapon, hunt: e.hunt });
      car.aiRng = mulberry32(seed + 7919 * (i + 1));
    }
    return car;
  });
  const director = createDirector(track, laps, { maxTime: opts.maxTime });
  cars.forEach((c) => director.initCar(c));
  director.rank(cars);

  // ---- damage routing
  function shedParts(victim, ids, wreck, power) {
    if (!ids.length) return;
    const c = Math.cos(victim.heading), sn = Math.sin(victim.heading);
    for (const id of ids) {
      victim.partsLost.push(id);
      const o = PART_ORIGIN[id];
      emit('partLost', {
        carId: victim.id, part: id, wreck: !!wreck, power,
        x: victim.x + o.fx * c - o.fy * sn, y: victim.y + o.fx * sn + o.fy * c,
        dx: o.dx * c - o.dy * sn, dy: o.dx * sn + o.dy * c,
        vx: victim.vx, vy: victim.vy, heading: victim.heading, seed: (fxRng() * 4294967296) >>> 0,
      });
    }
  }
  function damage(victim, amount, byId, weaponId, x, y) {
    if (victim.wrecked || amount <= 0) return;
    let credit = byId;
    if ((credit === null || credit === undefined) && raceTime - victim.lastHitT < KILL_CREDIT_WINDOW) credit = victim.lastHitBy;
    addZoneDamage(victim, damageZone(victim, x ?? victim.x, y ?? victim.y), amount);
    const killed = applyDamage(victim, amount, credit, raceTime);
    emit('hit', { carId: victim.id, byId: byId ?? null, weaponId, dmg: amount, x: x ?? victim.x, y: y ?? victim.y });
    const power = clamp(amount / Math.max(1, victim.armorMax) * 4, 0.2, 1.5);
    if (!killed) shedParts(victim, newlyLost(victim.dmgMap, victim.armor / victim.armorMax, victim.partsLost), false, power);
    if (killed) {
      if (credit !== null && credit !== undefined && credit !== victim.id && cars[credit]) cars[credit].kills++;
      emit('wreck', { carId: victim.id, byId: credit !== victim.id ? credit ?? null : null, x: victim.x, y: victim.y, vx: victim.vx, vy: victim.vy, heading: victim.heading, weaponId, seed: (fxRng() * 4294967296) >>> 0 });
      emit('explosion', { x: victim.x, y: victim.y, radius: 5, kind: 'wreck', big: true, carId: victim.id, weaponId });
      shedParts(victim, remainingParts(victim.partsLost), true, 1 + power * 0.5);
    }
  }
  function blast(x, y, def, owner, direct) {
    emit('explosion', { x, y, radius: def.radius, kind: def.id, big: def.radius >= 6, ownerId: owner ? owner.id : null });
    for (const c of cars) {
      if (c.wrecked) continue;
      const dist = c === direct ? 0 : Math.max(0, pointCarDistance(c, x, y));
      if (dist > def.radius) continue;
      let dmg = def.damage * (1 - 0.75 * (dist / def.radius));
      if (c === owner) dmg *= 0.5;
      const k = 1 - dist / def.radius;
      const d = Math.hypot(c.x - x, c.y - y) || 1;
      const kick = 8 * k * (1100 / Math.max(900, c.stats.mass));   // applied over ~0.3 s by stepBody (no velocity snap)
      c.kickX += ((c.x - x) / d) * kick; c.kickY += ((c.y - y) / d) * kick;
      damage(c, dmg, owner.id, def.id, x, y);
    }
  }
  /** `owner`'s spikes on contact zone `zone` bite `victim`: extra damage (credited to the owner, weapon 'spikes') + a spark event. */
  function spikeHit(owner, victim, zone, close, victimMass) {
    if (!owner.spikes || victim.wrecked) return;
    const share = (2 * victimMass) / (owner.stats.mass + victimMass);
    const extra = spikeDamage(owner.spikes, zone, close, share);
    if (extra <= 0) return;
    const mx = (owner.x + victim.x) / 2, my = (owner.y + victim.y) / 2;
    emit('spikeHit', { carId: victim.id, byId: owner.id, zone, strength: close, dmg: extra, x: mx, y: my });
    damage(victim, extra, owner.id, 'spikes', mx, my);
  }
  const projectiles = createProjectileSystem({ cars, track, halfWidth, emit, damage, blast, nextId });
  const hazards = createHazardSystem({ cars, emit, damage, popTyres, blast, nextId });
  const fireCtx = { cars, projectiles, hazards, rng, emit, damage, get t() { return raceTime; } };

  // ---- pickups
  const pickups = track.pickups.map((p) => ({ id: p.id, type: p.type, x: p.x, y: p.y, active: true, timer: 0 }));

  let phase = 'countdown', countdown = COUNTDOWN_SECONDS, raceTime = 0, tick = 0, lastCountN = COUNTDOWN_SECONDS + 1;
  const wrecksSeen = new Set();

  function carInput(car, pin, racing) {
    if (car.aiControlled || car.finished) return aiInput(car, racing, car.finished ? 0.45 : 1);
    return car.isPlayer ? pin : EMPTY_INPUT;
  }
  function aiInput(car, racing, cruise) {
    return driveAI(car, { track, cars, t: raceTime, dt: SIM_DT, racing, cruise, playerProgress: opts.aiPlayer ? null : cars[0].progress }, car.aiRng);
  }

  function step(playerInput) {
    if (phase === 'finished') return;
    const pin = playerInput || EMPTY_INPUT;
    tick++;
    const dt = SIM_DT;
    if (phase === 'countdown') {
      countdown = Math.max(0, countdown - dt);
      const n = Math.ceil(countdown - 1e-9);
      if (n > 0 && n < lastCountN) { lastCountN = n; emit('countdown', { n }); }
      if (countdown <= 0) { phase = 'racing'; raceTime = 0; emit('go', {}); }
    } else raceTime += dt;
    const racing = phase === 'racing';

    for (const car of cars) {
      tickCooldowns(car, dt);
      updateDamage(car, dt);
      car.bumpCd = Math.max(0, car.bumpCd - dt);
      let inp;
      if (car.wrecked) inp = { throttle: 0, brake: 1, steer: 0 };
      else inp = carInput(car, pin, racing);
      car.firing = false;
      if (car.wrecked && car.lock) updateLock(car, cars, null, dt);
      if (racing && !car.wrecked) {
        if (inp.selectWeapon !== null && inp.selectWeapon !== undefined) selectWeapon(car, inp.selectWeapon);
        if (inp.cycleWeapon && !car.cycleHeld) cycleWeapon(car);
        car.cycleHeld = !!inp.cycleWeapon;
        const aw = car.weapons[car.activeWeapon];
        updateLock(car, cars, aw ? getWeapon(aw.id) : null, dt);
        if (inp.fire) car.firing = tryFire(car, fireCtx);
      }
      const mods = damageMods(car);
      const sfName = surfaceAt(track, car.proj.s, car.proj.d);
      const sf = surfaceMods(sfName);
      car.surface = sfName;
      mods.gripMult *= sf.grip; mods.dragExtra = sf.drag; mods.rough = sf.rough;
      mods.locked = !racing;
      mods.kick = car.aiControlled ? 0 : 1; mods.noNitro = car.aiControlled;   // AI drives clean; nitro is a human toy
      car.throttleIn = inp.throttle || 0;
      stepBody(car, inp, dt, mods);
      if (car.wrecked) { car.vx *= 0.97; car.vy *= 0.97; }
    }

    // walls: soft run-off band first, then the solid wall (glancing blows deflect, damage only above a clear impact)
    for (const car of cars) {
      car.proj = track.project(car.x, car.y, car.proj.i);
      if (car.recT > 0) continue;
      softEdge(car, car.proj, halfWidth, dt);
      car.scrapeCd = Math.max(0, car.scrapeCd - dt);
      const impact = resolveWall(car, car.proj, halfWidth);
      if (impact > 0) {
        car.wallT = raceTime;
        const side = Math.sign(car.proj.d || 1);
        const wx = car.x - Math.sin(car.proj.heading) * side * 1.5, wy = car.y + Math.cos(car.proj.heading) * side * 1.5;
        if (impact > 2) emit('bump', { carId: car.id, strength: impact });
        if (car.scrapeCd <= 0 && car.speed > 6) { car.scrapeCd = 0.07; emit('scrape', { carId: car.id, x: wx, y: wy, speed: car.speed, impact, side }); }
        const dmg = wallDamage(impact);
        if (dmg > 0 && !car.wrecked) damage(car, dmg * (1100 / Math.max(900, car.stats.mass)) ** 0.5, null, 'wall', car.x - Math.sin(car.proj.heading) * side * 3, car.y + Math.cos(car.proj.heading) * side * 3);
        car.proj = track.project(car.x, car.y, car.proj.i);
      }
    }
    // human cars: auto-recover when facing the wrong way or wedged against a wall
    if (racing) for (const car of cars) {
      if (car.aiControlled || car.wrecked || car.finished) continue;
      if (stepRecovery(car, car.proj, halfWidth, dt)) { car.proj = track.project(car.x, car.y, car.proj.i); continue; }
      const err = Math.atan2(Math.sin(car.heading - car.proj.heading), Math.cos(car.heading - car.proj.heading));
      if (recoveryTimers(car, err, raceTime - car.wallT < 0.3, dt)) {
        beginRecovery(car, car.proj);
        emit('recover', { carId: car.id, x: car.x, y: car.y });
      }
    }
    // car-car
    for (let i = 0; i < cars.length; i++) {
      const A = cars[i];
      if (A.wrecked && A.wreckTimer <= 0) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const B = cars[j];
        if (B.wrecked && B.wreckTimer <= 0) continue;
        if (Math.abs(A.x - B.x) > 6 || Math.abs(A.y - B.y) > 6) continue;
        const close = resolveCarCar(A, B);
        if ((close > RAM_MIN || ((A.spikes || B.spikes) && close > SPIKE_MIN_CLOSE)) && A.bumpCd <= 0 && B.bumpCd <= 0) {
          const base = Math.max(0, close - RAM_MIN) * RAM_K;
          const tm = A.stats.mass + B.stats.mass;
          const zA = A.spikes || B.spikes ? contactZone(A, B.x, B.y) : 'front', zB = A.spikes || B.spikes ? contactZone(B, A.x, A.y) : 'front';
          const pA = spikeProtection(A.spikes, zA), pB = spikeProtection(B.spikes, zB);   // owner takes less ram damage on a spiked side
          if (!A.wrecked) damage(A, base * (2 * B.stats.mass) / tm * B.ramMult * A.ramTaken * pA, B.id, 'ram', B.x, B.y);
          if (!B.wrecked) damage(B, base * (2 * A.stats.mass) / tm * A.ramMult * B.ramTaken * pB, A.id, 'ram', A.x, A.y);
          spikeHit(A, B, zA, close, B.stats.mass);
          spikeHit(B, A, zB, close, A.stats.mass);
          emit('bump', { carId: A.id, strength: close });
          emit('bump', { carId: B.id, strength: close });
          A.bumpCd = B.bumpCd = 0.25;
        }
      }
    }
    projectiles.update(dt);
    hazards.update(dt);

    // pickups
    for (const p of pickups) {
      if (!p.active) { p.timer -= dt; if (p.timer <= 0) p.active = true; continue; }
      for (const car of cars) {
        if (car.wrecked || Math.hypot(car.x - p.x, car.y - p.y) > PICKUP_RADIUS) continue;
        if (p.type === 'ammo') addAmmo(car, 0);
        else if (p.type === 'repair') repair(car, car.armorMax * REPAIR_FRACTION);
        else if (p.type === 'cash') car.cash += CASH_PICKUP;
        p.active = false; p.timer = PICKUP_RESPAWN;
        emit('pickup', { carId: car.id, pickupType: p.type });
        break;
      }
    }

    if (racing) {
      director.update(cars, raceTime, emit);
      if (director.over) phase = 'finished';
    }
    for (const car of cars) if (car.wrecked) wrecksSeen.add(car.id);
  }

  function snapshot() {
    const ev = frameEvents; frameEvents = [];
    return {
      t: raceTime, tick, phase, countdown, lapsTotal: laps,
      cars: cars.map((c) => ({
        id: c.id, driverId: c.driverId, isPlayer: c.isPlayer, name: c.name,
        x: c.x, y: c.y, heading: c.heading, vx: c.vx, vy: c.vy, speed: c.speed, steer: c.steer, yawRate: c.yawRate,
        armor: c.armor, armorMax: c.armorMax, wrecked: c.wrecked, wreckT: c.wrecked ? c.wreckTimer : 0, smoke: isSmoking(c), burning: isBurning(c), tyresPopped: c.tyreTimer > 0, oiled: c.oilTimer > 0,
        lap: director.lapOf(c), s: director.sOf(c), position: c.rank, finished: c.finished, finishTime: c.finishTime, kills: c.kills,
        weapons: c.weapons.map((w) => ({ id: w.id, ammo: w.ammo })), activeWeapon: c.activeWeapon, firing: c.firing,
        lock: c.lock && c.lock.target ? { id: c.lock.target.id, t: c.lock.t, locked: c.lock.locked } : null,
        color: c.color, helmetColor: c.helmetColor, livery: c.livery,
        gear: c.gear, rpm: c.rpm, limiter: c.limiter, shifted: c.shifted, ax: c.ax, ay: c.ay, load: c.load, slip: c.slip,
        wheelspin: c.wheelspin, braking: c.braking, surface: c.surface, throttle: c.throttleIn ?? 0,
        dmg: c.dmgMap ? c.dmgMap.slice() : null, spikes: c.spikes || null,
        nitro: c.nitro, nitroOn: c.nitroOn, drift: c.drift, boost: c.boost, parts: c.partsLost ? c.partsLost.slice() : [],
      })),
      projectiles: projectiles.list.map((p) => ({ id: p.id, type: p.def.id, x: p.x, y: p.y, heading: p.heading, ownerId: p.owner.id, targetId: p.target ? p.target.id : null })),
      hazards: [
        ...hazards.list.map((h) => ({ id: h.id, type: h.type, x: h.x, y: h.y, heading: h.heading, ...(h.type === 'mine' ? { armed: h.age >= (h.def.armTime ?? 1) } : {}) })),
        ...cars.filter((c) => c.wrecked && c.wreckTimer > 0).map((c) => ({ id: 'w' + c.id, type: 'wreck', x: c.x, y: c.y, heading: c.heading })),
      ],
      pickups: pickups.map((p) => ({ id: p.id, type: p.type, x: p.x, y: p.y, active: p.active })),
      events: ev,
    };
  }

  function result() {
    const order = director.rank(cars);
    const finishOrder = order.map((c, i) => ({ carId: c.id, driverId: c.driverId, isPlayer: c.isPlayer, position: i + 1, time: c.finished ? c.finishTime : null, wrecked: c.wrecked, kills: c.kills }));
    const p = cars[0];
    return {
      trackId: track.id, laps, finishOrder,
      player: {
        position: p.rank, time: p.finished ? p.finishTime : null, kills: p.kills, wrecked: p.wrecked,
        armorLeft: p.armor, armorMax: p.armorMax, damageFraction: clamp(1 - p.armor / p.armorMax, 0, 1),
        ammoLeft: p.weapons.map((w) => ({ id: w.id, ammo: w.ammo })), pickupCash: p.cash,
      },
      date: null,
    };
  }

  return {
    step, snapshot, events: bus, result, track, cars,
    get phase() { return phase; },
    get time() { return raceTime; },
    isOver: () => phase === 'finished',
  };
}
