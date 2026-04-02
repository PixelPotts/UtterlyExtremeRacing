import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { Grenade } from './throwables.js';
import { Explosion } from './fx.js';

// ── EnemyMovement ──────────────────────────────────────────────────────────────
// Base class for road-following enemies that oscillate ahead of the player
// and lob grenades. Subclasses override _buildBody(), _animateThrow(), _animateIdle().
//
// spec = {
//   color          : hex int           (default 0xBBBBBB)
//   topSpeed       : segments/frame    (default 0.10)
//   anchorBase     : metres ahead      (default 28)
//   anchorAmp1     : metres            (default 10)
//   anchorFreq1    : Hz                (default 0.25)
//   anchorAmp2     : metres            (default 4)
//   anchorFreq2    : Hz                (default 0.58)
//   followCorrect  : blend factor      (default 0.35)
//   throwMin       : seconds           (default 2.4)
//   throwRand      : seconds           (default 2.0)
// }

export class EnemyMovement extends Vehicle {
  constructor(scene, path, spawnSeg, SLEN, spec = {}, { onExplosion = null } = {}) {
    super(scene, path, {
      color:       spec.color    ?? 0xBBBBBB,
      topSpeed:    spec.topSpeed ?? 0.10,
      headlights:  [],
      taillights:  [],
      SLEN,
    });
    this.seg          = spawnSeg;
    this.t            = 0;
    this._time        = 0;
    this._throwAnimT  = 0;
    this._grenades    = [];
    this._explosions  = [];
    this._onExplosion = onExplosion;
    this._fleeing     = false;
    this._enemyX      = 0;
    this._enemyZ      = 0;
    this._enemyAng    = 0;
    this._panner      = null;
    this._engSrc      = null;

    // Tuning — readable via window.PARAMS overrides in dev, spec defaults for production
    this._anchorBase    = spec.anchorBase    ?? 28;
    this._anchorAmp1    = spec.anchorAmp1    ?? 10;
    this._anchorFreq1   = spec.anchorFreq1   ?? 0.25;
    this._anchorAmp2    = spec.anchorAmp2    ?? 4;
    this._anchorFreq2   = spec.anchorFreq2   ?? 0.58;
    this._followCorrect = spec.followCorrect ?? 0.35;
    this._throwMin      = spec.throwMin      ?? 2.4;
    this._throwRand     = spec.throwRand     ?? 2.0;
    this._throwTimer    = this._throwMin;
  }

  // ── Main update ───────────────────────────────────────────────────────────
  update(dt, cSeg, cT, carX, carZ, carSpeed, carAngle, speedMul, surfaceY = -Infinity) {
    this._time += dt;
    const P = window.PARAMS || {};

    // ── Flee mode ─────────────────────────────────────────────────────────
    if (this._fleeing) {
      const advance = this.topSpeed * 4.5;
      this.t += advance; while (this.t >= 1) { this.t--; this.seg++; }
      this.speed = advance;
      if (this.seg + 1 >= this.path.length) return;
      const fp0  = this.path[this.seg].pos, fp1 = this.path[this.seg + 1].pos;
      const fang = this.path[this.seg].angle;
      const fpos = fp0.clone().lerp(fp1, this.t);
      this.group.position.x = fpos.x;
      this.group.position.z = fpos.z;
      this._enemyX = fpos.x; this._enemyZ = fpos.z; this._enemyAng = fang;
      const fgY = (surfaceY > -Infinity) ? surfaceY : fpos.y + 0.5;
      this._applyGravity(dt, fgY + 0.1);
      this.group.rotation.y = Math.PI - fang;
      this._spinWheels(advance * 3.5);
      return;
    }

    // ── Oscillating anchor distance ────────────────────────────────────────
    const anchorM = (P.anchorBase ?? this._anchorBase)
      + Math.sin(this._time * (P.anchorFreq1 ?? this._anchorFreq1)) * (P.anchorAmp1 ?? this._anchorAmp1)
      + Math.sin(this._time * (P.anchorFreq2 ?? this._anchorFreq2)) * (P.anchorAmp2 ?? this._anchorAmp2);
    const anchorSegs = anchorM / this._SLEN;

    const desired    = cSeg + cT + anchorSegs;
    const current    = this.seg + this.t;
    const correction = (desired - current) * (P.followCorrect ?? this._followCorrect);
    const advance    = Math.max(0, carSpeed * speedMul + correction);

    this.t += advance;
    while (this.t >= 1) { this.t--; this.seg++; }
    this.speed = advance;

    if (this.seg + 1 >= this.path.length) return;

    // ── Position along road ────────────────────────────────────────────────
    const p0  = this.path[this.seg].pos;
    const p1  = this.path[this.seg + 1].pos;
    const ang = this.path[this.seg].angle;
    const pos = p0.clone().lerp(p1, this.t);

    this.group.position.x = pos.x;
    this.group.position.z = pos.z;
    const groundY = (surfaceY > -Infinity) ? surfaceY : pos.y + 0.5;
    this._applyGravity(dt, groundY + 0.1);
    this.group.rotation.y = Math.PI - ang;
    this._enemyX   = pos.x;
    this._enemyZ   = pos.z;
    this._enemyAng = ang;

    this._spinWheels(advance * 3.5);

    // ── Throw timer ────────────────────────────────────────────────────────
    this._throwTimer -= dt;
    if (this._throwTimer <= 0 && carSpeed > 0.005) {
      const P2 = window.PARAMS || {};
      this._throwTimer = (P2.throwMin ?? this._throwMin) + Math.random() * (P2.throwRand ?? this._throwRand);
      this._throwAnimT = 1.0;
      this._spawnGrenade(carX, carZ, carAngle, ang, carSpeed, speedMul, dt);
    }

    // ── Throw / idle animation hooks ───────────────────────────────────────
    if (this._throwAnimT > 0) {
      this._throwAnimT = Math.max(0, this._throwAnimT - dt * 2.2);
      this._animateThrow(this._throwAnimT);
    } else {
      this._animateIdle(this._time);
    }

    // ── Tick grenades and explosions ───────────────────────────────────────
    for (let i = this._grenades.length - 1; i >= 0; i--) {
      if (!this._grenades[i].update(dt)) {
        this._grenades[i].dispose();
        this._grenades.splice(i, 1);
      }
    }
    for (let i = this._explosions.length - 1; i >= 0; i--) {
      if (!this._explosions[i].update(dt)) {
        this._explosions[i].dispose();
        this._explosions.splice(i, 1);
      }
    }
  }

  // ── Grenade spawning ──────────────────────────────────────────────────────
  _spawnGrenade(carX, carZ, carAngle, ang, carSpeed, speedMul, dt) {
    const P = window.PARAMS || {};
    const spawnOffset = P.spawnOffset  ?? 3.4;
    const spawnJitter = P.spawnJitter  ?? 0.8;
    const spawnHeight = P.spawnHeight  ?? 2.1;
    const T           = (P.flightTimeMin ?? 1.3) + Math.random() * (P.flightTimeRand ?? 0.5);
    const G           = P.gravity      ?? 12;
    const leadOffset  = P.leadDist     ?? 0;
    const spreadLat   = P.spreadLat    ?? 3.5;
    const spreadFwd   = P.spreadFwd    ?? 3.5;

    const bx = -Math.sin(ang), bz = Math.cos(ang);
    const sx = this._enemyX + bx * spawnOffset + (Math.random() - 0.5) * spawnJitter;
    const sy = spawnHeight  + (Math.random() - 0.5) * 0.25;
    const sz = this._enemyZ + bz * spawnOffset + (Math.random() - 0.5) * spawnJitter;

    const mps      = carSpeed * speedMul * this._SLEN / dt;
    const autoLead = mps * T;
    const fwdX = Math.sin(carAngle), fwdZ = -Math.cos(carAngle);
    const latX = fwdZ,              latZ  = -fwdX;
    const lead = autoLead + leadOffset + (Math.random() - 0.5) * spreadFwd;
    const lat  = (Math.random() - 0.5) * spreadLat;
    const tx = carX + fwdX * lead + latX * lat;
    const tz = carZ + fwdZ * lead + latZ * lat;

    const vel = new THREE.Vector3(
      (tx - sx) / T,
      (0.5 - sy + 0.5 * G * T * T) / T,
      (tz - sz) / T,
    );

    this._grenades.push(new Grenade(this.scene,
      new THREE.Vector3(sx, sy, sz), vel, {
        gravity:   G,
        onExplode: pos => {
          this._explosions.push(new Explosion(this.scene, pos));
          if (this._onExplosion) this._onExplosion(pos.x, pos.z);
        },
      }));
  }

  // ── Animation hooks (no-op defaults) ─────────────────────────────────────
  _animateThrow(_throwAnimT) {}
  _animateIdle(_time) {}

  // ── Dispose ───────────────────────────────────────────────────────────────
  dispose() {
    this._grenades.forEach(g => g.dispose());
    this._explosions.forEach(e => e.dispose());
    if (this._engSrc) { try { this._engSrc.stop(); } catch (_) {} }
    super.dispose();
  }
}
