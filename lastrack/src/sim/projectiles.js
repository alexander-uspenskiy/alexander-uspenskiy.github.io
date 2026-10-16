// Projectile + hazard systems (rockets, terminator missiles, caltrops). Deterministic; ids are sequential.
import { wrapAngle } from '../core/mathUtil.js';
import { pointCarDistance } from './collisions.js';
import { DROP_LIFE } from './weapons.js';

const HIT_RADIUS = 0.6;           // extra reach on top of the car circles
const OWNER_SAFE = 0.25;          // s before a projectile can hit its owner (it can still never hit it directly)
const HOMING_CONE = (25 * Math.PI) / 180;
const HOMING_RANGE = 120;
const DROP_OWNER_SAFE = 1;
const CALTROP_RADIUS = 1.8;
const MINE_OWNER_SAFE = 3;

export function createProjectileSystem(env) {
  // env = { cars, track, halfWidth, emit, damage, blast(x,y,def,owner), nextId() }
  const list = [];
  return {
    list,
    spawn({ def, owner, x, y, heading, carSpeed }) {
      list.push({
        id: env.nextId(), def, owner, x, y, heading, speed: (def.speed || 80) + 0.0 * carSpeed,
        life: def.life || 3, age: 0, target: null,
      });
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt; p.life -= dt;
        const def = p.def;
        if (def.homing > 0) {
          if (!p.target || p.target.wrecked) p.target = acquire(p, env.cars);
          if (p.target) {
            const want = Math.atan2(p.target.y - p.y, p.target.x - p.x);
            const diff = wrapAngle(want - p.heading);
            const maxTurn = def.homing * dt;
            p.heading = wrapAngle(p.heading + Math.max(-maxTurn, Math.min(maxTurn, diff)));
          }
        }
        const step = p.speed * dt;
        const dx = Math.cos(p.heading) * step, dy = Math.sin(p.heading) * step;
        // sub-sample so fast projectiles cannot tunnel through a car
        const sub = Math.max(1, Math.ceil(step / 0.8));
        let hit = null;
        for (let k = 1; k <= sub && !hit; k++) {
          const px = p.x + (dx * k) / sub, py = p.y + (dy * k) / sub;
          for (const c of env.cars) {
            if (c === p.owner || (c.wrecked && c.wreckTimer <= 0)) continue;
            if (pointCarDistance(c, px, py) < HIT_RADIUS) { hit = c; p.x = px; p.y = py; break; }
          }
        }
        if (!hit) { p.x += dx; p.y += dy; }
        let boom = !!hit || p.life <= 0;
        if (!boom) {
          const pr = env.track.project(p.x, p.y);
          if (Math.abs(pr.d) > env.halfWidth + 0.3) boom = true;
        }
        if (boom) {
          list.splice(i, 1);
          if (def.radius > 0) env.blast(p.x, p.y, def, p.owner, hit);
          else if (hit) env.damage(hit, def.damage, p.owner.id, def.id, p.x, p.y);
        }
      }
    },
  };
}

function acquire(p, cars) {
  let best = null, bd = Infinity;
  for (const c of cars) {
    if (c === p.owner || c.wrecked) continue;
    const dx = c.x - p.x, dy = c.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > HOMING_RANGE || d < 1) continue;
    if (Math.abs(wrapAngle(Math.atan2(dy, dx) - p.heading)) > HOMING_CONE) continue;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function createHazardSystem(env) {
  // env = { cars, emit, damage, popTyres, blast(x,y,def,owner,direct), nextId() }
  const list = [];
  return {
    list,
    drop({ type, def, owner, x, y, heading }) {
      list.push({ id: env.nextId(), type, def, owner, x, y, heading, life: def.life || DROP_LIFE, age: 0 });
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const h = list[i];
        h.age += dt; h.life -= dt;
        if (h.life <= 0) { list.splice(i, 1); continue; }
        if (h.type === 'oil') {
          // persistent puddle: any car in it loses grip for a moment after leaving
          for (const c of env.cars) {
            if (c.wrecked || (c === h.owner && h.age < DROP_OWNER_SAFE)) continue;
            if (Math.hypot(c.x - h.x, c.y - h.y) < h.def.radius) c.oilTimer = Math.max(c.oilTimer || 0, h.def.slowTime ?? 1);
          }
          continue;
        }
        if (h.type === 'mine') {
          if (h.age < (h.def.armTime ?? 1)) continue;
          for (const c of env.cars) {
            if (c.wrecked || (c === h.owner && h.age < MINE_OWNER_SAFE)) continue;
            if (Math.hypot(c.x - h.x, c.y - h.y) < h.def.trigger) {
              list.splice(i, 1);
              env.blast(h.x, h.y, h.def, h.owner, c);
              break;
            }
          }
          continue;
        }
        for (const c of env.cars) {
          if (c.wrecked) continue;
          if (c === h.owner && h.age < DROP_OWNER_SAFE) continue;
          if (Math.hypot(c.x - h.x, c.y - h.y) < CALTROP_RADIUS) {
            env.popTyres(c);
            env.damage(c, h.def.damage ?? 8, h.owner.id, h.def.id, h.x, h.y);
            list.splice(i, 1);
            break;
          }
        }
      }
    },
  };
}
