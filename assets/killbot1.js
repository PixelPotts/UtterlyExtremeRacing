import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EnemyMovement } from './enemy.js';
import { AssetRegistry } from './assetRegistry.js';

// Register GLB at import time — loading screen will pre-load it via AssetRegistry.preloadAll().
AssetRegistry.register('killbot1', 'assets/geometry/killbot1.glb');

// ── KillBot1 ───────────────────────────────────────────────────────────────────
// Positions on a sphere centred on the player — always in the FORWARD hemisphere,
// wandering between random elevations / azimuths at varying speeds.

// ── Shared laser geometry (single killbot — still avoids re-alloc per spawn) ──
const _LASER_CORE_GEO = new THREE.CylinderGeometry(0.125, 0.125, 1, 6);
const _LASER_GLOW_GEO = new THREE.CylinderGeometry(1.1, 1.1, 1, 8);

// ── Preload cache ─────────────────────────────────────────────────────────────
// Kept for backward-compat; actual preload is handled by AssetRegistry.preloadAll().
export function preloadKillBot1() {
  return Promise.resolve(AssetRegistry.get('killbot1'));
}

export class KillBot1 extends EnemyMovement {
  constructor(scene, path, spawnSeg, SLEN, { onExplosion = null } = {}) {
    super(scene, path, spawnSeg, SLEN, {
      topSpeed: 0.08,
      throwMin: 3.0,
      throwRand: 1.5,
    }, { onExplosion });

    // Sphere pathing
    this._R           = 18;
    this._theta       = 0;
    this._phi         = 0.30;
    this._tgtTheta    = 0;
    this._tgtPhi      = 0.30;
    this._wanderSpeed = 0.5;
    this._wanderTimer = 0;

    // Flee
    this._fleeVel     = 0;
    this.fleeComplete = false;

    this._model = null;

    // Laser system
    this._buildLaser();
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  _buildBody() {
    const apply = gltf => {
      const model = gltf.scene.clone(true);
      model.scale.setScalar(1.8);
      model.rotation.z = Math.PI / 2;
      model.traverse(c => {
        if (!c.isMesh) return;
        c.castShadow = true;
        c.frustumCulled = false;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => {
          if (!m || m.emissive === undefined) return;
          // Only add emissive glow to non-black materials (red accent parts)
          const bc = m.color;
          if (bc && (bc.r + bc.g + bc.b) > 0.15) {
            m.emissive.setHex(0x220000);
            m.emissiveIntensity = 1.0;
          }
        });
      });
      this.group.add(model);
      this._model = model;
    };

    const cached = AssetRegistry.get('killbot1');
    if (cached) {
      apply(cached);
    } else {
      // Fallback: load on-demand if preload was skipped (should not happen in normal flow).
      new GLTFLoader().load('assets/geometry/killbot1.glb', apply);
    }
  }

  // ── Laser ─────────────────────────────────────────────────────────────────
  _buildLaser() {
    // Core beam — unit-height cylinder, Y-scaled per frame to match distance
    this._laserCore = new THREE.Mesh(
      _LASER_CORE_GEO,
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    this._laserCore.visible = false;
    this._laserCore.frustumCulled = false;
    this._laserCore.userData.sharedGeo = true;
    this.scene.add(this._laserCore);

    // Glow layer — wider, additive
    this._laserGlow = new THREE.Mesh(
      _LASER_GLOW_GEO,
      new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this._laserGlow.visible = false;
    this._laserGlow.frustumCulled = false;
    this._laserGlow.userData.sharedGeo = true;
    this.scene.add(this._laserGlow);

    // SpotLight — illuminates road and player
    this._laserSpot = new THREE.SpotLight(0xff0000, 0, 45, 0.22, 0.55, 1.4);
    this._laserSpotTarget = new THREE.Object3D();
    this.scene.add(this._laserSpotTarget);
    this._laserSpot.target = this._laserSpotTarget;
    this.scene.add(this._laserSpot);

    // PointLight at source — self-illuminates the bot body
    this._laserSrcLight = new THREE.PointLight(0xff0000, 0, 12);
    this.scene.add(this._laserSrcLight);

    // State
    this._laserCooldown    = 5.0;
    this._laserLife        = 0;
    this._laserActive      = false;
    this._laserWanderAngle = 0;
    this._laserWanderVel   = 0;
  }

  _updateLaser(dt, carX, carZ, carAngle, surfaceY) {
    if (!this._laserActive) {
      this._laserCooldown -= dt;
      if (this._laserCooldown <= 0) {
        this._laserActive      = true;
        this._laserLife        = 2.0;
        this._laserWanderAngle = 0;
        this._laserWanderVel   = (Math.random() - 0.5) * 0.6;
      }
      return;
    }

    this._laserLife -= dt;
    if (this._laserLife <= 0) {
      this._laserActive = false;
      this._laserCooldown = 5.0;
      this._laserCore.visible = false;
      this._laserGlow.visible = false;
      this._laserSpot.intensity = 0;
      this._laserSrcLight.intensity = 0;
      return;
    }

    // Wander — slow random walk ±5°
    this._laserWanderVel += (Math.random() - 0.5) * 1.8 * dt;
    this._laserWanderVel *= 0.88;
    this._laserWanderAngle += this._laserWanderVel * dt;
    this._laserWanderAngle = Math.max(-0.088, Math.min(0.088, this._laserWanderAngle));

    // Aim point: player position at road level + lateral wander
    const roadY  = (surfaceY > -Infinity) ? surfaceY + 0.3 : carZ;
    const latX   = Math.cos(carAngle);
    const latZ   = Math.sin(carAngle);
    const wander = this._laserWanderAngle * this._R;
    const aimX   = carX + latX * wander;
    const aimY   = roadY;
    const aimZ   = carZ + latZ * wander;

    const botPos = this.group.position;
    const dx = aimX - botPos.x;
    const dy = aimY - botPos.y;
    const dz = aimZ - botPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    const dirN = new THREE.Vector3(dx / dist, dy / dist, dz / dist);
    const up   = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dirN);

    const mid = new THREE.Vector3(
      botPos.x + dirN.x * dist * 0.5,
      botPos.y + dirN.y * dist * 0.5,
      botPos.z + dirN.z * dist * 0.5
    );

    this._laserCore.position.copy(mid);
    this._laserCore.quaternion.copy(quat);
    this._laserCore.scale.y = dist;
    this._laserCore.visible = true;

    this._laserGlow.position.copy(mid);
    this._laserGlow.quaternion.copy(quat);
    this._laserGlow.scale.y = dist;
    this._laserGlow.visible = true;

    this._laserSpot.position.copy(botPos);
    this._laserSpotTarget.position.set(aimX, aimY, aimZ);
    this._laserSpot.intensity = 22;

    this._laserSrcLight.position.copy(botPos);
    this._laserSrcLight.intensity = 6;
  }

  // ── Update ────────────────────────────────────────────────────────────────
  update(dt, cSeg, cT, carX, carZ, carSpeed, carAngle, speedMul, surfaceY = -Infinity) {
    this._time += dt;

    if (this._fleeing) {
      this._fleeVel += 55 * dt;
      this._R       += this._fleeVel * dt;
      this._phi     += dt * 0.8;
      if (this._R > 200) { this.fleeComplete = true; return; }
    } else {
      this._wanderTimer -= dt;
      if (this._wanderTimer <= 0) {
        this._tgtTheta    = (Math.random() - 0.5) * 1.05;
        this._tgtPhi      = 0.14 + Math.random() * 0.38;
        this._wanderSpeed = 0.15 + Math.random() * 2.0;
        this._wanderTimer = 1.5 + Math.random() * 5.0;
      }
      const blend = Math.min(1, dt * this._wanderSpeed);
      this._theta += (this._tgtTheta - this._theta) * blend;
      this._phi   += (this._tgtPhi   - this._phi)   * blend;
    }

    // ── World position ─────────────────────────────────────────────────────
    const fwdX =  Math.sin(carAngle);
    const fwdZ = -Math.cos(carAngle);
    const rgtX =  Math.cos(carAngle);
    const rgtZ =  Math.sin(carAngle);

    const R    = this._R;
    const cosP = Math.cos(this._phi);
    const sinP = Math.sin(this._phi);
    const cosT = Math.cos(this._theta);
    const sinT = Math.sin(this._theta);

    const dx = (fwdX * cosP * cosT  +  rgtX * cosP * sinT) * R;
    const dz = (fwdZ * cosP * cosT  +  rgtZ * cosP * sinT) * R;
    const dy = sinP * R;

    const baseY  = (surfaceY > -Infinity) ? surfaceY : 0;
    this._enemyX = carX + dx;
    this._enemyZ = carZ + dz;
    this.group.position.set(this._enemyX, baseY + 1.0 + dy, this._enemyZ);

    this.group.rotation.y = Math.atan2(this._enemyX - carX, this._enemyZ - carZ) + Math.PI;

    this.seg   = cSeg;
    this.t     = cT;
    this.speed = carSpeed;

    // ── Laser ──────────────────────────────────────────────────────────────
    this._updateLaser(dt, carX, carZ, carAngle, surfaceY);

    // ── Throw timer ────────────────────────────────────────────────────────
    if (!this._fleeing) {
      this._throwTimer -= dt;
      if (this._throwTimer <= 0 && carSpeed > 0.005) {
        this._throwTimer = this._throwMin + Math.random() * this._throwRand;
        this._throwAnimT = 1.0;
        const spawnAng = Math.atan2(this._enemyX - carX, -(this._enemyZ - carZ));
        this._spawnGrenade(carX, carZ, carAngle, spawnAng, carSpeed, speedMul, dt);
      }
    }

    if (this._throwAnimT > 0) {
      this._throwAnimT = Math.max(0, this._throwAnimT - dt * 2.2);
      this._animateThrow(this._throwAnimT);
    } else {
      this._animateIdle(this._time);
    }

    for (let i = this._grenades.length - 1; i >= 0; i--) {
      if (!this._grenades[i].update(dt)) { this._grenades[i].dispose(); this._grenades.splice(i, 1); }
    }
    for (let i = this._explosions.length - 1; i >= 0; i--) {
      if (!this._explosions[i].update(dt)) { this._explosions[i].dispose(); this._explosions.splice(i, 1); }
    }
  }

  // ── Animation hooks ───────────────────────────────────────────────────────
  _animateThrow(throwAnimT) {
    if (!this._model) return;
    this._model.rotation.x = -Math.sin(throwAnimT * Math.PI) * 0.4;
  }

  _animateIdle(time) {
    if (!this._model) return;
    this._model.rotation.z = Math.PI / 2 + Math.sin(time * 0.65) * 0.09;
    this._model.rotation.y = Math.sin(time * 0.30) * 0.12;
  }

  // ── Audio ─────────────────────────────────────────────────────────────────
  initAudio(actx, bufs) {
    this._actx   = actx;
    this._panner = actx.createPanner();
    this._panner.panningModel  = 'HRTF';
    this._panner.distanceModel = 'inverse';
    this._panner.refDistance   = 12;
    this._panner.maxDistance   = 160;
    this._panner.rolloffFactor = 1.3;
    const gain = actx.createGain();
    gain.gain.value = 0.50;
    this._engSrc = actx.createBufferSource();
    this._engSrc.buffer = bufs.engLo;
    this._engSrc.loop   = true;
    this._engSrc.playbackRate.value = 1.55;
    this._engSrc.connect(gain);
    gain.connect(this._panner);
    this._panner.connect(actx.destination);
    this._engSrc.start();
  }

  updateAudio(_dt) {
    if (!this._actx || !this._panner) return;
    const p = this.group.position;
    if (this._panner.positionX !== undefined) {
      this._panner.positionX.value = p.x;
      this._panner.positionY.value = p.y;
      this._panner.positionZ.value = p.z;
    } else {
      this._panner.setPosition(p.x, p.y, p.z);
    }
  }

  // ── Dispose ───────────────────────────────────────────────────────────────
  dispose() {
    [this._laserCore, this._laserGlow, this._laserSpot,
     this._laserSpotTarget, this._laserSrcLight].forEach(o => {
      if (o) this.scene.remove(o);
    });
    // Geometries are shared module-level constants — only dispose materials
    if (this._laserCore) this._laserCore.material.dispose();
    if (this._laserGlow) this._laserGlow.material.dispose();
    super.dispose();
  }
}
