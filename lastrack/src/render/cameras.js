// Camera rig: chase / cockpit / top, finish orbit, countdown fly-in. Pure maths exported for tests.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, angleDiff, wrapAngle } from './geomUtil.js';

export const CAMERA_MODES = ['chase', 'cockpit', 'bumper', 'tv', 'top'];
export const CHASE = Object.freeze({ back: 8, up: 3, lookAhead: 7, lookUp: 0.9, rate: 5, fovBase: 62, fovPerSpeed: 0.18, fovMax: 85 });
export const COCKPIT = Object.freeze({ x: 0.1, y: 1.0, fov: 78 });
export const BUMPER = Object.freeze({ x: 2.45, y: 0.62, fov: 84 });
export const TV = Object.freeze({ ahead: 52, side: 13, height: 3.6, minBehind: -6, maxDist: 95 });
export const TOP = Object.freeze({ height: 70, perSpeed: 0.5, lookAhead: 0.5, fov: 45 });

export function smoothAngle(cur, target, rate, dt) { return wrapAngle(cur + angleDiff(target, cur) * (1 - Math.exp(-rate * dt))); }
export function chaseFov(speed) { return Math.min(CHASE.fovMax, CHASE.fovBase + CHASE.fovPerSpeed * Math.max(0, speed)); }
/** Chase pose in world coords (sim (x,y) -> (x,*,y)). */
export function chasePose(out, x, y, heading, back = CHASE.back, up = CHASE.up, lookAhead = CHASE.lookAhead) {
  const c = Math.cos(heading), s = Math.sin(heading);
  out.px = x - c * back; out.py = up; out.pz = y - s * back;
  out.lx = x + c * lookAhead; out.ly = CHASE.lookUp; out.lz = y + s * lookAhead;
  return out;
}
/** Car-frame offset (forward f, right r, up u) -> world. */
export function carFrameToWorld(out, x, y, heading, f, r, u) {
  const c = Math.cos(heading), s = Math.sin(heading);
  out.x = x + c * f - s * r; out.y = u; out.z = y + s * f + c * r;
  return out;
}
export function nextCameraMode(m) { return CAMERA_MODES[(CAMERA_MODES.indexOf(m) + 1) % CAMERA_MODES.length]; }

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.hs = 0; this.hsInit = false; this.t = 0; this.orbit = 0; this.trans = 0; this.transT = 0.35;
    this._kind = ''; this._pose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 };
    this._tp = new THREE.Vector3(); this._tl = new THREE.Vector3(); this._tq = new THREE.Quaternion(); this._m = new THREE.Matrix4();
    this._fp = new THREE.Vector3(); this._fq = new THREE.Quaternion(); this._ff = 60; this._v = { x: 0, y: 0, z: 0 };
    this._has = false; this._lastFov = -1; this._prev = null;
    this._q2 = new THREE.Quaternion(); this._zAxis = new THREE.Vector3(0, 0, 1);
    this.shake = 0; this._tv = null; this._tvSide = 1; this._roll = 0;
  }
  /** Camera shake (0..1.5): hits, explosions, kerbs. Decays on its own. */
  addShake(a) { this.shake = Math.min(1.5, this.shake + a); }
  snap() { this.hsInit = false; this.trans = 0; this._kind = ''; this._has = false; this._prev = null; }
  setMode(m) {
    if (!CAMERA_MODES.includes(m) || m === this.mode) return;
    this.mode = m; this._blend(0.35);
  }
  _blend(T) {
    if (!this._has) return;
    this._fp.copy(this.camera.position); this._fq.copy(this.camera.quaternion); this._ff = this.camera.fov;
    this.trans = T; this.transT = T;
  }
  /** car: followed CarSnapshot (interpolated x,y,heading ok); phase: snapshot.phase; countdown: seconds left. */
  update(dt, car, phase, countdown = 0) {
    if (!car || !Number.isFinite(car.x) || !Number.isFinite(car.y) || !Number.isFinite(car.heading)) return;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.5) this.snap();
    if (this._prev && Math.hypot(car.x - this._prev.x, car.y - this._prev.y) > 60) this.snap(); // teleport / restart
    this._prev = { x: car.x, y: car.y };
    this.t += dt;
    const tp = this._tp, tl = this._tl, hd = car.heading, speed = car.speed || 0;
    if (!this.hsInit) { this.hs = hd; this.hsInit = true; }
    const kind = phase === 'finished' || car.wrecked ? 'orbit' : phase === 'countdown' && this.mode !== 'cockpit' ? 'intro' : this.mode;
    if (kind !== this._kind) { this._blend(this._kind === '' ? 0 : kind === 'orbit' ? 1.2 : 0.35); this._kind = kind; }
    let fov;
    if (kind === 'intro') {
      this.hs = hd;
      const e = smoothstep(0, 1, 1 - clamp(countdown / 3, 0, 1));
      const psi = lerp(Math.PI - 1.8, Math.PI, e), r = lerp(26, CHASE.back, e), h = lerp(14, CHASE.up, e);
      carFrameToWorld(this._v, car.x, car.y, hd, r * Math.cos(psi), r * Math.sin(psi), h);
      tp.set(this._v.x, this._v.y, this._v.z);
      tl.set(car.x + Math.cos(hd) * 6, 0.8, car.y + Math.sin(hd) * 6);
      fov = lerp(50, chaseFov(0), e);
    } else if (kind === 'orbit') {
      this.orbit += dt * 0.35;
      const a = hd + Math.PI + this.orbit;
      tp.set(car.x + Math.cos(a) * 14, 4.5, car.y + Math.sin(a) * 14); tl.set(car.x, 0.8, car.y); fov = 52;
      this.hs = smoothAngle(this.hs, hd, CHASE.rate, dt);
    } else if (kind === 'cockpit') {
      this.hs = hd;
      carFrameToWorld(this._v, car.x, car.y, hd, COCKPIT.x, 0, COCKPIT.y);
      tp.set(this._v.x, this._v.y, this._v.z);
      const yaw = hd + clamp(car.steer || 0, -1, 1) * 0.06;
      tl.set(tp.x + Math.cos(yaw) * 30, COCKPIT.y - 0.12, tp.z + Math.sin(yaw) * 30);
      fov = COCKPIT.fov + Math.min(10, speed * 0.1);
    } else if (kind === 'bumper') {
      this.hs = hd;
      carFrameToWorld(this._v, car.x, car.y, hd, BUMPER.x, 0, BUMPER.y);
      tp.set(this._v.x, this._v.y, this._v.z);
      const yaw = hd + clamp(car.steer || 0, -1, 1) * 0.1;
      tl.set(tp.x + Math.cos(yaw) * 30, BUMPER.y + 0.1, tp.z + Math.sin(yaw) * 30);
      fov = BUMPER.fov + Math.min(14, speed * 0.16);
    } else if (kind === 'tv') {
      // trackside broadcast camera: hold a spot ahead of the car, pan to follow, zoom with distance; hop when passed
      const c0 = Math.cos(hd), s0 = Math.sin(hd);
      let tv = this._tv;
      if (tv) {
        const rel = (tv.x - car.x) * c0 + (tv.z - car.y) * s0, dist = Math.hypot(tv.x - car.x, tv.z - car.y);
        if (rel < TV.minBehind || dist > TV.maxDist) tv = null;
      }
      if (!tv) {
        this._tvSide = -this._tvSide;
        const f = TV.ahead + speed * 0.5;
        tv = this._tv = { x: car.x + c0 * f - s0 * TV.side * this._tvSide, z: car.y + s0 * f + c0 * TV.side * this._tvSide };
      }
      this.hs = smoothAngle(this.hs, hd, 2, dt);
      tp.set(tv.x, TV.height, tv.z); tl.set(car.x + c0 * 2, 0.9, car.y + s0 * 2);
      fov = clamp(2 * Math.atan(8 / Math.max(8, Math.hypot(tv.x - car.x, tv.z - car.y))) * 57.3, 22, 60);
    } else if (kind === 'top') {
      this.hs = smoothAngle(this.hs, hd, 2, dt);
      const hgt = TOP.height + speed * TOP.perSpeed, la = speed * TOP.lookAhead;
      tp.set(car.x + Math.cos(hd) * la, hgt, car.y + Math.sin(hd) * la + 0.01);
      tl.set(tp.x, 0, tp.z - 0.001); fov = TOP.fov;
    } else {
      this.hs = smoothAngle(this.hs, hd, CHASE.rate, dt);
      chasePose(this._pose, car.x, car.y, this.hs);
      const p = this._pose;
      tp.set(p.px, p.py, p.pz); tl.set(p.lx, p.ly, p.lz); fov = chaseFov(speed);
    }
    // vibration with speed (cheap)
    const amp = 0.004 * Math.min(1, speed / 80) + this.shake * 0.12;
    if (amp > 1e-4 && kind !== 'intro' && kind !== 'top' && kind !== 'tv') { tp.y += amp * Math.sin(this.t * 57); tp.x += amp * Math.sin(this.t * 43); tp.z += amp * 0.7 * Math.sin(this.t * 49 + 1); }
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this._m.lookAt(tp, tl, kind === 'top' ? new THREE.Vector3(Math.cos(hd), 0, Math.sin(hd)) : THREE.Object3D.DEFAULT_UP);
    this._tq.setFromRotationMatrix(this._m);
    if (kind === 'cockpit' || kind === 'bumper') { // lean the horizon with lateral g
      const tr = clamp(-(car.ay || 0) * 0.0028, -0.05, 0.05);
      this._roll += (tr - this._roll) * Math.min(1, dt * 6);
      this._tq.multiply(this._q2.setFromAxisAngle(this._zAxis, this._roll));
    } else this._roll = 0;
    if (this.trans > 0) {
      this.trans = Math.max(0, this.trans - dt);
      const k = smoothstep(0, 1, 1 - this.trans / this.transT);
      this.camera.position.lerpVectors(this._fp, tp, k);
      this.camera.quaternion.slerpQuaternions(this._fq, this._tq, k);
      fov = lerp(this._ff, fov, k);
    } else { this.camera.position.copy(tp); this.camera.quaternion.copy(this._tq); }
    if (Math.abs(fov - this._lastFov) > 0.02) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); this._lastFov = fov; }
    this._has = true;
  }
}
