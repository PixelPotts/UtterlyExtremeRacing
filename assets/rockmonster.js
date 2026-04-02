import * as THREE from 'three';

// ── Shared materials ────────────────────────────────────────────────────────
const _MAT_ROCK = new THREE.MeshPhongMaterial({
  color: 0x524840, specular: 0x181410, shininess: 5, flatShading: true,
});
const _MAT_SNOW = new THREE.MeshPhongMaterial({
  color: 0xccd8e8, specular: 0x445566, shininess: 16, flatShading: true,
});
const _MAT_EYE = new THREE.MeshBasicMaterial({ color: 0xff2200 });

// Convert indexed geometry to non-indexed then randomly jitter every vertex.
// flatShading on the material makes each face appear as a separate rocky facet.
function _jitter(geo, factor = 0.20) {
  const ni  = geo.toNonIndexed();
  geo.dispose();
  const pos = ni.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const f = (Math.random() - 0.5) * factor;
    pos.setX(i, pos.getX(i) * (1 + f));
    pos.setY(i, pos.getY(i) * (1 + (Math.random() - 0.5) * factor));
    pos.setZ(i, pos.getZ(i) * (1 + (Math.random() - 0.5) * factor));
  }
  pos.needsUpdate = true;
  ni.computeVertexNormals();
  return ni;
}

// ── Phase timing (seconds) ─────────────────────────────────────────────────
// Full cycle ≈ 2.8 s → one boulder every ~3 s.
const PHASE_DUR  = { idle: 1.20, reach: 0.55, grab: 0.30, windup: 0.55, release: 0.22 };
const PHASE_NEXT = { idle: 'reach', reach: 'grab', grab: 'windup', windup: 'release', release: 'idle' };
const GRAVITY    = 20; // m/s² for boulder arc

// ── RockMonster ────────────────────────────────────────────────────────────
export class RockMonster {
  constructor(scene, x, z, groundY, roadX, roadZ, onHit) {
    this.scene    = scene;
    this._onHit   = onHit;
    this._groundY = groundY;
    this._phase   = 'idle';
    this._phaseT  = 0;
    this._heldBoulder = null;
    this._boulders    = [];   // [{mesh, vel}] flying boulders

    this._grp = new THREE.Group();
    this._grp.position.set(x, groundY, z);
    scene.add(this._grp);

    this._buildBody();
    // Face toward the road
    this._grp.lookAt(roadX, groundY, roadZ);
  }

  _buildBody() {
    const G = this._grp;

    // Feet / legs
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(_jitter(new THREE.CylinderGeometry(1.0, 1.35, 4.8, 6)), _MAT_ROCK);
      leg.position.set(s * 2.1, 2.4, 0);
      G.add(leg);
      const foot = new THREE.Mesh(_jitter(new THREE.BoxGeometry(2.0, 0.9, 2.8)), _MAT_ROCK);
      foot.position.set(s * 2.3, 0.45, 0.55);
      G.add(foot);
    }

    // Torso
    this._torso = new THREE.Mesh(_jitter(new THREE.IcosahedronGeometry(3.3, 1)), _MAT_ROCK);
    this._torso.scale.set(1.05, 1.30, 0.88);
    this._torso.position.set(0, 7.0, 0);
    G.add(this._torso);

    // Head
    this._head = new THREE.Mesh(_jitter(new THREE.IcosahedronGeometry(1.9, 1)), _MAT_ROCK);
    this._head.position.set(0, 11.5, 0.3);
    G.add(this._head);

    // Snow cap
    const cap = new THREE.Mesh(_jitter(new THREE.IcosahedronGeometry(1.2, 0)), _MAT_SNOW);
    cap.scale.set(1.3, 0.55, 1.1);
    cap.position.set(0.1, 12.9, 0);
    G.add(cap);

    // Glowing eyes
    const eg = new THREE.SphereGeometry(0.28, 4, 3);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(eg, _MAT_EYE);
      eye.position.set(s * 0.70, 11.9, 1.65);
      G.add(eye);
    }

    // ── Left arm (passive, slight sway in idle) ──────────────────────────
    this._lArmGrp = new THREE.Group();
    this._lArmGrp.position.set(-3.6, 8.5, 0);
    this._lArmGrp.rotation.z = -0.38;
    this._lArmGrp.add(this.__limb(0, -1.8, 0, 0.78, 0.68, 3.8, 6));
    this._lArmGrp.add(this.__limb(-0.5, -5.3, 0.3, 0.60, 0.52, 3.2, 5, 0.28));
    const lhand = new THREE.Mesh(_jitter(new THREE.IcosahedronGeometry(0.88, 0)), _MAT_ROCK);
    lhand.position.set(-0.9, -7.5, 0.4);
    this._lArmGrp.add(lhand);
    G.add(this._lArmGrp);

    // ── Right arm (throwing arm) — shoulder pivot ────────────────────────
    this._rShoulderGrp = new THREE.Group();
    this._rShoulderGrp.position.set(3.6, 8.5, 0);
    this._rShoulderGrp.rotation.z = 0.38;
    this._rShoulderGrp.add(this.__limb(0, -1.8, 0, 0.78, 0.68, 3.8, 6));

    // Elbow pivot sub-group
    this._rElbowGrp = new THREE.Group();
    this._rElbowGrp.position.set(0.4, -3.7, 0);
    this._rElbowGrp.add(this.__limb(0.2, -1.6, 0, 0.60, 0.50, 3.2, 5, 0.22));
    this._rHand = new THREE.Mesh(_jitter(new THREE.IcosahedronGeometry(0.92, 0)), _MAT_ROCK);
    this._rHand.position.set(0.5, -3.5, 0);
    this._rElbowGrp.add(this._rHand);
    this._rShoulderGrp.add(this._rElbowGrp);
    G.add(this._rShoulderGrp);
  }

  // Helper: make a cylinder limb segment
  __limb(x, y, z, rTop, rBot, h, segs, tilt = 0) {
    const m = new THREE.Mesh(_jitter(new THREE.CylinderGeometry(rTop, rBot, h, segs)), _MAT_ROCK);
    m.position.set(x, y, z);
    if (tilt) m.rotation.z = tilt;
    return m;
  }

  _handWorldPos() {
    const v = new THREE.Vector3();
    this._rHand.getWorldPosition(v);
    return v;
  }

  // Called by game loop: obs.update(dt, player.x, player.z, player.seg)
  update(dt, playerX, playerZ) {
    this._phaseT += dt;
    const t = Math.min(this._phaseT / PHASE_DUR[this._phase], 1.0);
    this._animate(t);

    if (this._phaseT >= PHASE_DUR[this._phase]) this._nextPhase(playerX, playerZ);

    // Keep held boulder glued to hand
    if (this._heldBoulder) this._heldBoulder.position.copy(this._handWorldPos());

    // Advance flying boulders
    for (let i = this._boulders.length - 1; i >= 0; i--) {
      const b = this._boulders[i];
      b.vel.y -= GRAVITY * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += dt * 2.8;
      b.mesh.rotation.z += dt * 1.9;
      if (b.mesh.position.y <= this._groundY + 0.5) {
        const dx = b.mesh.position.x - playerX;
        const dz = b.mesh.position.z - playerZ;
        if (dx * dx + dz * dz < 6 * 6) this._onHit?.();
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        this._boulders.splice(i, 1);
      }
    }
  }

  _animate(t) {
    const e = t * t * (3 - 2 * t); // smoothstep easing
    switch (this._phase) {
      case 'idle':
        // Gentle sway; left arm mirrors slowly
        this._rShoulderGrp.rotation.x = Math.sin(this._phaseT * 1.6) * 0.07;
        this._rShoulderGrp.rotation.z = 0.38;
        this._lArmGrp.rotation.x      = Math.sin(this._phaseT * 1.6 + 1.0) * 0.05;
        this._torso.rotation.y         = Math.sin(this._phaseT * 0.8) * 0.06;
        break;
      case 'reach':
        // Lean forward, right arm swings down toward ground
        this._torso.rotation.x        = e * 0.58;
        this._rShoulderGrp.rotation.x = e * 1.40;
        this._rShoulderGrp.rotation.z = 0.38 - e * 0.55;
        this._rElbowGrp.rotation.x    = e * 0.65;
        this._head.rotation.x         = e * 0.35;
        break;
      case 'grab':
        // Hold reach pose (boulder snaps into hand at phase start)
        this._torso.rotation.x        = 0.58;
        this._rShoulderGrp.rotation.x = 1.40;
        this._rShoulderGrp.rotation.z = -0.17;
        this._rElbowGrp.rotation.x    = 0.65;
        this._head.rotation.x         = 0.35;
        break;
      case 'windup':
        // Straighten up, haul arm back
        this._torso.rotation.x        = 0.58 - e * 0.80;
        this._rShoulderGrp.rotation.x = 1.40 - e * 2.90;
        this._rShoulderGrp.rotation.z = -0.17 + e * 0.55;
        this._rElbowGrp.rotation.x    = 0.65 - e * 0.95;
        this._head.rotation.x         = 0.35 - e * 0.40;
        break;
      case 'release':
        // Fast whip-forward
        this._torso.rotation.x        = -0.22 * e;
        this._rShoulderGrp.rotation.x = (1.40 - 2.90) + e * 2.70;
        this._rShoulderGrp.rotation.z = 0.38;
        this._rElbowGrp.rotation.x    = e * 0.75;
        this._head.rotation.x         = -0.05 * e;
        break;
    }
  }

  _nextPhase(playerX, playerZ) {
    const prev    = this._phase;
    this._phase   = PHASE_NEXT[prev];
    this._phaseT  = 0;

    if (prev === 'reach') {
      // Grab: spawn boulder in hand
      const geo = _jitter(new THREE.IcosahedronGeometry(1.35, 1), 0.28);
      this._heldBoulder = new THREE.Mesh(geo, _MAT_ROCK);
      this._heldBoulder.position.copy(this._handWorldPos());
      this.scene.add(this._heldBoulder);
    }

    if (prev === 'windup') {
      // Release boulder at start of throwing swing
      if (this._heldBoulder) {
        const start = this._handWorldPos();
        const dx    = playerX - start.x;
        const dz    = playerZ - start.z;
        const horiz = Math.sqrt(dx * dx + dz * dz) + 0.1;
        const T     = horiz / 26;            // horizontal speed ≈ 26 m/s
        const vy    = (this._groundY + 1 - start.y) / T + 0.5 * GRAVITY * T;
        this._boulders.push({
          mesh: this._heldBoulder,
          vel:  new THREE.Vector3(dx / T, vy, dz / T),
        });
        this._heldBoulder = null;
      }
    }
  }

  dispose() {
    if (this._heldBoulder) {
      this.scene.remove(this._heldBoulder);
      this._heldBoulder.geometry.dispose();
      this._heldBoulder = null;
    }
    for (const b of this._boulders) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
    }
    this._boulders = [];
    this.scene.remove(this._grp);
    this._grp.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }
}
