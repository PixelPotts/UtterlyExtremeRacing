import * as THREE from 'three';
import { Weapon }      from './weapons.js';

// Shared wheel geometry — one allocation for all Vehicle instances
const _wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 16);
const _wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

// ── Vehicle (base) ─────────────────────────────────────────────────────────────
//
// spec = {
//   color        : hex int
//   topSpeed     : segments/frame        (default 0.10)
//   accel        : segments/frame²       (default topSpeed * 2.2)
//   brake        : segments/frame²       (default topSpeed * 5.0)
//   drag         : segments/frame²       (default topSpeed * 0.6)
//   gearRatios   : float[]              (default [3.5, 2.1, 1.4, 1.0, 0.8])
//   headlights   : [{x,y,z}, ...]       SpotLight positions in local car space
//   taillights   : [{x,y,z}, ...]       Emissive mesh positions in local car space
//   engineSound  : 'car'|'truck'|'none'
//   SLEN         : number               Segment length in metres (default 13)
// }

export class Vehicle {
  constructor(scene, path, spec = {}) {
    this.scene = scene;
    this.path  = path;
    this.spec  = spec;

    // Physics state (public — used by callers)
    this.x        = 0;
    this.z        = 0;
    this.angle    = 0;
    this.speed    = 0;
    this.seg      = 0;
    this.t        = 0;
    this.topSpeed = spec.topSpeed ?? 0.10;
    this.accel    = spec.accel    ?? this.topSpeed * 2.2;
    this.brake    = spec.brake    ?? this.topSpeed * 5.0;
    this.drag     = spec.drag     ?? this.topSpeed * 0.6;
    this._SLEN    = spec.SLEN     ?? 13;

    // Vertical physics
    this.vy          = 0;
    this._justLanded = false;
    this._landSpeed  = 0;

    // Lateral slip
    this.lateralVel = 0;

    // Gear / RPM state (exposed for HUD)
    this._gear    = 1;
    this._rpmNorm = 0;

    // Three.js
    this._wheels     = [];
    this._headLights = [];   // [{ light: SpotLight, off: {x,y,z} }]
    this._actx       = null;

    // Build scene objects
    this.group = new THREE.Group();
    this._buildBody();
    this._buildHeadlights(spec.headlights ?? []);
    this._buildTaillights(spec.taillights ?? []);
    scene.add(this.group);
  }

  // ── Body geometry (override in subclass) ───────────────────────────────────
  _buildBody() {
    const mat  = new THREE.MeshLambertMaterial({ color: this.spec.color ?? 0xFFFFFF });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 2.6, 8, 20), mat);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.72;
    body.castShadow = true;
    this.group.add(body);

    for (const [x, y, z] of [[-1, 0.36, -1.4], [1, 0.36, -1.4], [-1, 0.36, 1.4], [1, 0.36, 1.4]]) {
      const w = new THREE.Mesh(_wheelGeo, _wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, y, z);
      w.castShadow = true;
      this.group.add(w);
      this._wheels.push(w);
    }
  }

  _buildHeadlights(offsets) {
    for (const off of offsets) {
      const light = new THREE.SpotLight(0xFFFFCC, 350, 65, Math.PI / 6, 0.2, 2);
      light.castShadow = false;
      this.scene.add(light);
      this.scene.add(light.target);
      this._headLights.push({ light, off });
    }
  }

  _buildTaillights(offsets) {
    for (const off of offsets) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xFF1100 })
      );
      mesh.position.set(off.x, off.y, off.z);
      this.group.add(mesh);
    }
  }

  // ── Headlights — reposition SpotLights to match current world pose ──────────
  _updateHeadlights() {
    if (!this._headLights.length) return;
    const fx = Math.sin(this.angle), fz = -Math.cos(this.angle);
    const rx = Math.cos(this.angle), rz =  Math.sin(this.angle);
    for (const { light, off } of this._headLights) {
      const wx = this.x + fx * off.z + rx * off.x;
      const wz = this.z + fz * off.z + rz * off.x;
      light.position.set(wx, off.y, wz);
      light.target.position.set(
        this.x + fx * (off.z + 45) + rx * off.x,
        -1,
        this.z + fz * (off.z + 20) + rz * off.x
      );
      light.target.updateMatrixWorld();
    }
  }

  // ── Wheels ─────────────────────────────────────────────────────────────────
  _spinWheels(amount) {
    for (const w of this._wheels) w.rotation.x += amount;
  }

  // ── Gravity / road collision ────────────────────────────────────────────────
  // groundY = world Y the undercarriage must sit at or above.
  // Sets _justLanded=true and _landSpeed on hard impacts for caller to use.
  _applyGravity(dt, groundY) {
    const GRAVITY = 22;
    this._justLanded = false;
    this.vy -= GRAVITY * dt;
    this.group.position.y += this.vy * dt;
    if (this.group.position.y <= groundY) {
      const impact = -this.vy;
      this.group.position.y = groundY;
      if (impact > 3) {
        this._justLanded = true;
        this._landSpeed  = impact;
        this.vy = impact * 0.28;   // bounce
      } else {
        this.vy = 0;
      }
    }
  }

  // ── Transmission / RPM model ───────────────────────────────────────────────
  // Returns playback rate: climbs within each gear, drops slightly on upshift.
  _engineRate() {
    const t      = this.speed / this.topSpeed;
    const ratios = this.spec.gearRatios ?? [3.5, 2.1, 1.4, 1.0, 0.8];
    const n      = ratios.length;
    const gi     = Math.min(n - 1, Math.floor(t * n));
    const gearT  = t * n - gi;                    // 0..1 within current gear
    this._gear    = gi + 1;                        // expose for HUD
    this._rpmNorm = gearT;                         // expose for HUD
    const base   = 0.78 + (gi / n) * 0.32;        // rises with gear number
    const range  = 0.45 * (ratios[gi] / ratios[0]); // wider in lower gears
    return base + gearT * range;
  }

  // ── Audio (override in subclass) ───────────────────────────────────────────
  initAudio(_actx, _bufs) {}
  updateAudio(_dt) {}

  // ── Dispose ────────────────────────────────────────────────────────────────
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(c => { if (c.isMesh && !c.userData.sharedGeo) c.geometry.dispose(); });
    for (const { light } of this._headLights) {
      this.scene.remove(light);
      this.scene.remove(light.target);
    }
    this._headLights = [];
  }
}

// ── PlayerVehicle ──────────────────────────────────────────────────────────────
export class PlayerVehicle extends Vehicle {
  constructor(scene, path, spec) {
    super(scene, path, spec);
    // Weak red PointLights for tail lamps — parented to group so they move with it
    for (const off of (spec.taillights ?? [])) {
      const l = new THREE.PointLight(0xFF1100, 60, 5);
      l.position.set(off.x, off.y, off.z);
      this.group.add(l);
    }
    this._engLoSrc  = null;
    this._engHiSrc  = null;
    this._engLoGain  = null;
    this._engHiGain  = null;
    this.driftCharge = 0;
    this.isDrifting  = false;
  }

  // Returns number of path segments advanced this frame (caller uses for road streaming).
  // surfaceY: raycasted floor Y from caller; -Infinity falls back to path-based height.
  // surface: 'asphalt' (default) or 'dirt' — changes grip and handling constants.
  update(dt, keys, speedMul, surfaceY = -Infinity, surface = 'asphalt') {
    const onDirt = surface === 'dirt';

    // Surface-dependent handling
    const effTop   = this.topSpeed * (onDirt ? 0.88 : 1.0);
    const effAccel = this.accel    * (onDirt ? 0.70 : 1.0);
    const effBrake = this.brake    * (onDirt ? 0.55 : 1.0);
    const effDrag  = this.drag     * (onDirt ? 1.30 : 1.0);
    const baseGrip = onDirt ? 0.28 : 0.82;

    if (keys.w)      this.speed = Math.min(effTop, this.speed + effAccel * dt);
    else if (keys.s) this.speed = Math.max(0,      this.speed - effBrake * dt);
    else             this.speed = Math.max(0,       this.speed - effDrag  * dt);
    // Bleed speed if coming onto dirt above its cap
    if (this.speed > effTop) this.speed = Math.max(effTop, this.speed - effDrag * dt);

    const eff       = this.speed * speedMul;
    const fwdDist   = this._SLEN * eff;
    const baseFwd   = this._SLEN * this.speed;  // slip pickup ignores nitro scale

    const steerBase  = onDirt ? 0.13 : 0.15;
    const steerSpeed = onDirt ? 0.65 : 0.75;
    const st       = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const dAngle   = st * dt * (steerBase + steerSpeed * (this.speed / this.topSpeed));
    this.angle    += dAngle;

    // Dynamic grip: drops at high speed + hard cornering (rear saturation / oversteer feel)
    // Countersteering (st opposite to slide direction) gets a recovery bonus
    const speedFactor = this.speed / this.topSpeed;
    let GRIP = baseGrip * (1 - 0.5 * speedFactor * Math.abs(st));
    GRIP = Math.max(onDirt ? 0.10 : 0.25, GRIP);
    if (st !== 0 && st * this.lateralVel < 0) GRIP = Math.min(baseGrip, GRIP * 1.2);

    // Lateral slip: heading change transfers forward momentum sideways
    this.lateralVel -= dAngle * baseFwd;
    this.lateralVel *= (1 - GRIP);
    const maxLat = Math.max(baseFwd * 0.6, 0.02);
    this.lateralVel = Math.max(-maxLat, Math.min(maxLat, this.lateralVel));

    const fx = Math.sin(this.angle), fz = -Math.cos(this.angle);
    const rx = Math.cos(this.angle), rz =  Math.sin(this.angle);
    this.x += fx * fwdDist + rx * this.lateralVel;
    this.z += fz * fwdDist + rz * this.lateralVel;

    let advanced = 0;
    this.t += eff;
    while (this.t >= 1) { this.t--; this.seg++; advanced++; }

    const ry0 = this.path[this.seg]?.pos.y ?? 0;
    const ry1 = this.path[this.seg + 1]?.pos.y ?? ry0;
    const pathY = ry0 + (ry1 - ry0) * this.t;
    // Road-mesh surface is authoritative. -Infinity = no road quad under player → fall.
    // The ±8-segment raycast window is generous enough that seam gaps are not a concern.
    const groundY = surfaceY;
    this._roadY = (groundY > -Infinity ? groundY : pathY + 0.4) - 0.4;
    this.group.position.x = this.x;
    this.group.position.z = this.z;
    this._applyGravity(dt, groundY + 0.1);
    this.group.rotation.y = Math.PI - this.angle;
    this.group.rotation.z = Math.max(-0.15, Math.min(0.15, -this.lateralVel * 2.5));
    this.group.rotation.x = -Math.atan((ry1 - ry0) / this._SLEN);
    this._spinWheels(eff * 5);
    this._updateHeadlights();

    // Drift state: meaningful lateral slide while at speed
    this.isDrifting = Math.abs(this.lateralVel) > 0.035 && this.speed > this.topSpeed * 0.25;
    if (this.isDrifting) this.driftCharge = Math.min(1, this.driftCharge + dt * 0.4);
    else                 this.driftCharge = Math.max(0, this.driftCharge - dt * 0.8);

    // Keep _gear/_rpmNorm current for HUD (not dependent on audio being active)
    this._engineRate();

    return advanced;
  }

  initAudio(actx, bufs) {
    this._actx      = actx;
    this._engLoGain = actx.createGain(); this._engLoGain.gain.value = 0.55;
    this._engHiGain = actx.createGain(); this._engHiGain.gain.value = 0.0;
    this._engLoSrc  = actx.createBufferSource();
    this._engHiSrc  = actx.createBufferSource();
    this._engLoSrc.buffer = bufs.engLo; this._engLoSrc.loop = true;
    this._engHiSrc.buffer = bufs.engHi; this._engHiSrc.loop = true;
    this._engLoSrc.connect(this._engLoGain); this._engLoGain.connect(actx.destination);
    this._engHiSrc.connect(this._engHiGain); this._engHiGain.connect(actx.destination);
    this._engLoSrc.start();
    this._engHiSrc.start();
  }

  updateAudio(_dt) {
    if (!this._actx || !this._engLoSrc) return;
    const rate = this._engineRate();
    const t    = this.speed / this.topSpeed;
    const now  = this._actx.currentTime;
    this._engLoGain.gain.setTargetAtTime(0.55 * (1 - t * 0.72), now, 0.09);
    this._engHiGain.gain.setTargetAtTime(0.70 * Math.min(1, t * 1.4), now, 0.09);
    this._engLoSrc.playbackRate.setTargetAtTime(rate, now, 0.10);
    this._engHiSrc.playbackRate.setTargetAtTime(rate * 1.12, now, 0.10);
  }

  dispose() {
    super.dispose();
    if (this._engLoSrc) { try { this._engLoSrc.stop(); } catch (_) {} }
    if (this._engHiSrc) { try { this._engHiSrc.stop(); } catch (_) {} }
  }
}

// ── AI personality presets ─────────────────────────────────────────────────────
const _AI_P = {
  aggressive: { topMul: 1.10, followGap: 0.6, laneChangeTime: 1.8, curveBrake: 0.92 },
  normal:     { topMul: 1.00, followGap: 1.4, laneChangeTime: 3.5, curveBrake: 0.80 },
  defensive:  { topMul: 0.92, followGap: 2.2, laneChangeTime: 6.0, curveBrake: 0.68 },
};

// ── AiVehicle ──────────────────────────────────────────────────────────────────
export class AiVehicle extends Vehicle {
  constructor(scene, path, spec) {
    super(scene, path, { ...spec, headlights: [], taillights: [] });
    const P          = _AI_P[spec.personality ?? 'normal'] ?? _AI_P.normal;
    this._P          = P;
    this._laneX      = spec.laneX ?? 0;
    this._targetLaneX = this._laneX;
    this._blockedTimer = 0;
    this._lcCooldown   = 0;
    this._shootTimer   = 1 + Math.random() * 2;
    this.topSpeed     *= P.topMul;
    this._baseTop      = this.topSpeed;
    this.weapon        = new Weapon(scene, { ammo: 9999, rateOfFire: 3, bulletSpeed: 130 });
    this._panner       = null;
    this._engSrc       = null;
  }

  // aiCtx = { others: AiVehicle[], player: {x,z,seg,t,speed}, allLanes: number[] }
  update(dt, speedMul, surfaceY = -Infinity, aiCtx = {}) {
    const { others = [], player = null, allLanes = [this._laneX] } = aiCtx;
    const P = this._P;

    // ── Rubber-band vs player ──────────────────────────────────────────────
    const segGap = (player?.seg ?? this.seg) - this.seg;
    const rbMul  = 1 + Math.min(Math.max(segGap, -10), 25) * 0.006;
    const topNow = this._baseTop * rbMul;

    // ── Curve braking — look 5 segs ahead ────────────────────────────────
    let curveMul = 1.0;
    const ahead5 = this.path[this.seg + 5];
    if (ahead5) {
      let dAng = (ahead5.angle - this.path[this.seg].angle + Math.PI) % (Math.PI * 2) - Math.PI;
      dAng = Math.abs(dAng);
      if (dAng > 0.12) curveMul = P.curveBrake + (1 - P.curveBrake) * Math.max(0, 1 - (dAng - 0.12) / 0.4);
      curveMul = Math.max(0.5, curveMul);
    }

    // ── Car-following / braking ───────────────────────────────────────────
    const ang  = this.path[this.seg]?.angle ?? 0;
    const lpx  = Math.cos(ang), lpz = Math.sin(ang); // lateral axis
    const myF  = this.seg + this.t;
    let desiredTop = topNow * curveMul;
    let blocked    = false;

    const candidates = player ? [...others, player] : others;
    for (const other of candidates) {
      if (other === this) continue;
      const segDiff = (other.seg + (other.t ?? 0)) - myF;
      if (segDiff <= 0 || segDiff > 3.5) continue;
      const ox = other.x ?? 0, oz = other.z ?? 0;
      if (Math.abs((ox - this.x) * lpx + (oz - this.z) * lpz) > 4.5) continue;
      const gap = segDiff / P.followGap;
      desiredTop = Math.min(desiredTop, (other.speed ?? 0) * Math.min(gap, 1.0));
      if ((other.speed ?? 0) < this._baseTop * 0.65) blocked = true;
    }
    this.speed = Math.max(0, Math.min(desiredTop, this.speed + this.accel * dt));

    // ── Lane changing when blocked ────────────────────────────────────────
    if (blocked) this._blockedTimer += dt;
    else         this._blockedTimer  = Math.max(0, this._blockedTimer - dt * 0.5);
    if (this._lcCooldown > 0) this._lcCooldown -= dt;

    if (this._blockedTimer > P.laneChangeTime && this._lcCooldown <= 0) {
      const clear = allLanes.filter(lx => {
        if (Math.abs(lx - this._laneX) < 2) return false;
        for (const ot of candidates) {
          if (ot === this) continue;
          if (Math.abs((ot.seg + (ot.t ?? 0)) - myF) > 4) continue;
          const cx = this.path[this.seg].pos.x + lpx * lx;
          const cz = this.path[this.seg].pos.z + lpz * lx;
          if (((ot.x ?? 0) - cx) ** 2 + ((ot.z ?? 0) - cz) ** 2 < 25) return false;
        }
        return true;
      });
      if (clear.length) {
        this._targetLaneX  = clear[Math.random() * clear.length | 0];
        this._blockedTimer = 0;
        this._lcCooldown   = 4.0;
      }
    }

    // Smooth lane lerp
    this._laneX += (this._targetLaneX - this._laneX) * Math.min(1, dt * 2.0);

    // ── Advance along path ────────────────────────────────────────────────
    const eff = this.speed * speedMul;
    this.t += eff;
    while (this.t >= 1) { this.t--; this.seg++; }
    if (this.seg + 1 >= this.path.length) return;

    const p0     = this.path[this.seg].pos;
    const p1     = this.path[this.seg + 1].pos;
    const segAng = this.path[this.seg].angle;
    const pos    = p0.clone().lerp(p1, this.t);
    pos.x += Math.cos(segAng) * this._laneX;
    pos.z += Math.sin(segAng) * this._laneX;

    this.x = pos.x; this.z = pos.z; this.angle = segAng;
    this.group.position.x = pos.x;
    this.group.position.z = pos.z;
    this._applyGravity(dt, surfaceY > -Infinity ? surfaceY + 0.1 : -Infinity);
    this.group.rotation.y = Math.PI - segAng;
    const ry1 = this.path[this.seg + 1]?.pos.y ?? pos.y;
    this.group.rotation.x = -Math.atan((ry1 - this.path[this.seg].pos.y) / this._SLEN);
    this._spinWheels(eff * 5);

    // ── Shoot at player (25% accuracy) ───────────────────────────────────
    if (this.weapon && player) {
      this.weapon.update(dt);
      this._shootTimer -= dt;
      if (this._shootTimer <= 0) {
        this._shootTimer = 0.5 + Math.random() * 1.2;
        const dx = player.x - this.x, dz = player.z - this.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 75 * 75) {
          const d   = Math.sqrt(d2);
          const hit = Math.random() < 0.25;
          const sp  = hit ? (Math.random() - 0.5) * 0.08 : (Math.random() - 0.5) * 0.70;
          const cs  = Math.cos(sp), sn = Math.sin(sp);
          const dir = new THREE.Vector3(
            (dx / d) * cs - (dz / d) * sn,
            (Math.random() - 0.5) * 0.06,
            (dx / d) * sn + (dz / d) * cs
          );
          this.weapon.shoot(new THREE.Vector3(this.x, 0.9, this.z), dir);
        }
      }
    }
  }

  initAudio(actx, bufs) {
    this._actx   = actx;
    this._panner = actx.createPanner();
    this._panner.panningModel  = 'HRTF';
    this._panner.distanceModel = 'inverse';
    this._panner.refDistance   = 8;
    this._panner.maxDistance   = 120;
    this._panner.rolloffFactor = 1.8;
    this._engSrc = actx.createBufferSource();
    this._engSrc.buffer = bufs.engLo;
    this._engSrc.loop   = true;
    this._engSrc.playbackRate.value = 0.82 + Math.random() * 0.22;
    this._engSrc.connect(this._panner);
    this._panner.connect(actx.destination);
    this._engSrc.start();
  }

  updateAudio(_dt) {
    if (!this._actx || !this._panner) return;
    const rate = this._engineRate();
    const now  = this._actx.currentTime;
    this._engSrc.playbackRate.setTargetAtTime(rate * 0.85, now, 0.15);
    if (this._panner.positionX !== undefined) {
      this._panner.positionX.value = this.x;
      this._panner.positionY.value = 0.5;
      this._panner.positionZ.value = this.z;
    } else {
      this._panner.setPosition(this.x, 0.5, this.z);
    }
  }

  dispose() {
    super.dispose();
    if (this._engSrc) { try { this._engSrc.stop(); } catch (_) {} }
    if (this.weapon)  { this.weapon.dispose(); }
  }
}
