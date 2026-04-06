/**
 * pursuer.js — PursuerVehicle + PursuerSquad
 *
 * PursuerVehicle: an AiVehicle that chases the player directly,
 * has an HP pool, and displays a health bar sprite above itself.
 *
 * PursuerSquad: manages two PursuerVehicles with role-swapping
 * (aggressive ↔ backing_off) on a random timer, bullet-hit API,
 * and an onKill callback for mission integration.
 */

import * as THREE from 'three';
import { AiVehicle } from './vehicle.js';

// ── Health bar (CanvasTexture sprite, parented to vehicle group) ────────────

function _makeHealthBar(group) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 16;
  const ctx = canvas.getContext('2d');

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.8, 0.36, 1);
  sprite.position.set(0, 2.9, 0);
  group.add(sprite);

  function draw(hp, max) {
    ctx.clearRect(0, 0, 128, 16);
    ctx.fillStyle = '#220000';
    ctx.fillRect(2, 3, 124, 10);
    const pct = Math.max(0, hp / max);
    ctx.fillStyle = pct > 0.5 ? '#22ff44' : pct > 0.25 ? '#ffaa00' : '#ff2200';
    ctx.fillRect(2, 3, Math.floor(124 * pct), 10);
    tex.needsUpdate = true;
  }

  draw(100, 100);

  return {
    draw,
    dispose() { group.remove(sprite); mat.dispose(); tex.dispose(); },
  };
}

// ── PursuerVehicle ──────────────────────────────────────────────────────────

/**
 * Modes:
 *   'aggressive'  — closes on player hard, full speed, shoots often
 *   'backing_off' — falls behind, opposite lane, reduced speed
 */
export class PursuerVehicle extends AiVehicle {
  /**
   * @param {THREE.Scene} scene
   * @param {Array}       path
   * @param {object}      spec  { color, topSpeed, accel, brake, drag, laneX, SLEN, onDeath }
   */
  constructor(scene, path, spec = {}) {
    super(scene, path, {
      color:       spec.color      ?? 0xFF2200,
      topSpeed:    spec.topSpeed   ?? 0.12,
      accel:       spec.accel      ?? 0.018,
      brake:       spec.brake      ?? 0.022,
      drag:        spec.drag       ?? 0.005,
      gearRatios:  [3.0, 1.8, 1.2, 0.9],
      laneX:       spec.laneX     ?? 0,
      personality: 'aggressive',
      SLEN:        spec.SLEN,
    });

    this.hp       = 100;
    this.maxHp    = 100;
    this.alive    = true;
    this._mode    = 'aggressive';
    this._hpBar   = _makeHealthBar(this.group);
    this.onDeath  = spec.onDeath ?? null;

    // Store the true base top for mode scaling (AiVehicle sets this._baseTop in super())
    this._chaseTop = this._baseTop;

    // More aggressive shoot cadence than vanilla AiVehicle
    this.weapon.rateOfFire = 6;
    this._shootTimer = 0.4 + Math.random() * 0.5;
  }

  get mode()  { return this._mode; }
  set mode(m) { this._mode = m; }

  /** Reduce HP by dmg. Fires onDeath when HP reaches 0. */
  takeDamage(dmg) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - dmg);
    this._hpBar.draw(this.hp, this.maxHp);
    if (this.hp <= 0) {
      this.alive = false;
      this._hpBar.dispose();
      this.onDeath?.(this);
    }
  }

  /**
   * @param {number} dt
   * @param {number} speedMul
   * @param {number} surfaceY
   * @param {object|null} player  — { x, z, seg, t, speed }
   */
  update(dt, speedMul, surfaceY = -Infinity, player = null) {
    if (!this.alive) return;

    const aggressive = this._mode === 'aggressive';

    // Speed modulation by mode
    this._baseTop = aggressive ? this._chaseTop * 1.20 : this._chaseTop * 0.60;

    // Compute player's lateral offset from road centre at our current seg
    let targetLane = this._targetLaneX; // fallback
    if (player) {
      const seg = this.path[this.seg];
      if (seg) {
        const ang = seg.angle;
        // Lateral axis in AiVehicle is (cos(ang), sin(ang)) in XZ
        const lateralOff = (player.x - seg.pos.x) * Math.cos(ang)
                         + (player.z - seg.pos.z) * Math.sin(ang);
        if (aggressive) {
          targetLane = lateralOff; // converge on player's lane
        } else {
          // Pick opposite side at moderate distance
          targetLane = -Math.sign(lateralOff || 1) * 6.0;
        }
      }
    }

    // Assert target BEFORE super (so the lerp this frame uses it)
    this._targetLaneX = targetLane;

    // Run parent physics — pass no lane-change context (pursuers ignore other cars)
    super.update(dt, speedMul, surfaceY, {
      others:   [],
      player,
      allLanes: [targetLane],
    });

    // Re-assert after super in case blocked-logic changed it
    this._targetLaneX = targetLane;
  }

  /** Remove from scene and free GPU resources. */
  dispose() {
    this.group.parent?.remove(this.group);
    // weapon bullets / geometry disposed lazily by weapon.update()
  }
}

// ── PursuerSquad ────────────────────────────────────────────────────────────

const SWAP_MIN = 8;
const SWAP_MAX = 14;

/**
 * PursuerSquad — owns two PursuerVehicles and handles:
 *   - Spawning them behind the player
 *   - Role-swapping (aggressive ↔ backing_off) on a random timer
 *   - Bullet-hit detection (call checkBulletHit(bullets) each frame)
 *   - onKill callback fired per elimination
 *
 * Example:
 *   const squad = new PursuerSquad(scene, path, { SLEN, onKill });
 *   squad.spawn(playerSeg);
 *   // per frame:
 *   squad.update(dt, speedMul, getFloorY, player);
 *   if (activeWeapon) squad.checkBulletHit(activeWeapon.bullets);
 *   if (!squad.alive) { squad.dispose(); }
 */
export class PursuerSquad {
  /**
   * @param {THREE.Scene}  scene
   * @param {Array}        path
   * @param {object}       opts  { SLEN, onKill, colors }
   */
  constructor(scene, path, { SLEN, onKill = () => {}, colors = [0xFF2200, 0xFF7700] } = {}) {
    this._scene   = scene;
    this._path    = path;
    this._SLEN    = SLEN;
    this._onKill  = onKill;
    this._colors  = colors;
    this.pursuers = [];
    this._swapTimer = SWAP_MIN + Math.random() * (SWAP_MAX - SWAP_MIN);
    this._active = false;
  }

  /** Place both pursuers behind playerSeg and activate. */
  spawn(playerSeg) {
    if (this._active) return;
    this._active = true;

    const segOffsets = [-4, -8];   // segs behind player
    const initLanes  = [-5, 5];    // start on opposite sides

    this.pursuers = segOffsets.map((off, i) => {
      const seg = Math.max(2, playerSeg + off);
      const pt  = this._path[seg];
      const ang = pt?.angle ?? 0;
      const lx  = initLanes[i];

      const p = new PursuerVehicle(this._scene, this._path, {
        color:    this._colors[i],
        topSpeed: 0.13,  // slightly faster than player base (SPD=0.10)
        SLEN:     this._SLEN,
        laneX:    lx,
        onDeath:  (pv) => this._onKill(pv),
      });

      p.seg = seg;
      p.t   = 0;
      p.x   = (pt?.pos.x ?? 0) + Math.cos(ang) * lx;
      p.z   = (pt?.pos.z ?? 0) + Math.sin(ang) * lx;
      p.group.position.set(p.x, (pt?.pos.y ?? 0) + 3.5, p.z);
      p.group.rotation.y = Math.PI;
      this._scene.add(p.group);

      p.mode = i === 0 ? 'aggressive' : 'backing_off';
      return p;
    });
  }

  /** Returns true if at least one pursuer is still alive. */
  get alive() { return this.pursuers.some(p => p.alive); }

  /**
   * Call once per frame after squad is spawned.
   * @param {number}   dt
   * @param {number}   speedMul
   * @param {function} getFloorY  — (x, z, seg) → number
   * @param {object}   player     — { x, z, seg, t, speed }
   */
  update(dt, speedMul, getFloorY, player) {
    if (!this._active) return;

    // Role-swap timer
    this._swapTimer -= dt;
    if (this._swapTimer <= 0) {
      this._swapRoles();
      this._swapTimer = SWAP_MIN + Math.random() * (SWAP_MAX - SWAP_MIN);
    }

    for (const p of this.pursuers) {
      if (!p.alive) continue;
      const sy = getFloorY(p.x, p.z, p.seg);
      p.update(dt, speedMul, sy, player);
    }
  }

  /**
   * Check player's live bullets against all living pursuers.
   * Marks hit bullets as dead (b.life = -1) and calls takeDamage().
   * @param {Array} bullets  — activeWeapon.bullets
   */
  checkBulletHit(bullets) {
    for (const b of bullets) {
      if (b.life < 0) continue;
      for (const p of this.pursuers) {
        if (!p.alive) continue;
        const dx = b.mesh.position.x - p.group.position.x;
        const dy = b.mesh.position.y - p.group.position.y;
        const dz = b.mesh.position.z - p.group.position.z;
        if (dx*dx + dy*dy + dz*dz < 2.8 * 2.8) {
          b.life = -1;
          p.takeDamage(34); // 3 hits to kill
          break;
        }
      }
    }
  }

  /** Dispose all pursuers and clear state. */
  dispose() {
    for (const p of this.pursuers) p.dispose();
    this.pursuers = [];
    this._active  = false;
  }

  _swapRoles() {
    const alive = this.pursuers.filter(p => p.alive);
    if (alive.length < 2) return; // last one standing — always aggressive
    for (const p of alive) {
      p.mode = p.mode === 'aggressive' ? 'backing_off' : 'aggressive';
    }
  }
}
