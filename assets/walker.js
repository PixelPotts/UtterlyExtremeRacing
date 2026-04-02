import * as THREE from 'three';

// ── Walker — on-foot FPS player ───────────────────────────────────────────────
// Shares pedestrian mesh geometry; body hidden in FPS (camera IS the eyes).
// Coordinates: forward = (sin(yaw), 0, -cos(yaw)); right = (cos(yaw), 0, sin(yaw))
export class Walker {
  constructor(scene, x, y, z, yaw) {
    this.x     = x;
    this.y     = y;   // ground-level Y (group base)
    this.z     = z;
    this.yaw   = yaw;
    this.pitch = 0;   // clamped ±1.3 rad
    this.vy    = 0;
    this.seg   = 0;

    this._phase  = 0;
    this._moving = false;
    this._scene  = scene;

    const root    = new THREE.Group();
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xF5CBA7 });
    const topMat  = new THREE.MeshLambertMaterial({ color: 0x2266CC });
    const pantMat = new THREE.MeshLambertMaterial({ color: 0x1A2040 });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 6), skinMat);
    head.position.y = 1.62;
    root.add(head);

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.52, 7), topMat);
    torso.position.y = 1.10;
    root.add(torso);

    // Legs — hip pivot groups
    this._lHip = new THREE.Group(); this._lHip.position.set(-0.09, 0.84, 0);
    this._rHip = new THREE.Group(); this._rHip.position.set( 0.09, 0.84, 0);
    const mkLeg = () => {
      const g   = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.050, 0.72, 6), pantMat);
      cyl.position.y = -0.36;
      g.add(cyl);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.26), shoeMat);
      shoe.position.set(0, -0.76, 0.04);
      g.add(shoe);
      return g;
    };
    this._lHip.add(mkLeg()); this._rHip.add(mkLeg());
    root.add(this._lHip, this._rHip);

    // Arms — shoulder pivot groups
    this._lShoulder = new THREE.Group(); this._lShoulder.position.set(-0.20, 1.35, 0);
    this._rShoulder = new THREE.Group(); this._rShoulder.position.set( 0.20, 1.35, 0);
    const mkArm = () => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.40, 5), topMat);
      arm.position.y = -0.20;
      return arm;
    };
    this._lShoulder.add(mkArm()); this._rShoulder.add(mkArm());
    root.add(this._lShoulder, this._rShoulder);

    // Body hidden in FPS — camera IS the eyes
    root.visible = false;
    this.group   = root;
    scene.add(root);
  }

  // Called from mousemove handler with raw movementX/Y
  look(dx, dy, sens = 0.0018) {
    this.yaw  += dx * sens;   // positive dx (mouse right) → yaw increases → cam.rotation.y = -yaw turns right
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy * sens));
  }

  update(dt, keys, floorY) {
    const SPEED = 8.4;  // m/s (base); shift = 2×
    const spd = keys.shift ? SPEED * 2 : SPEED;

    // Horizontal movement — WASD strafe relative to yaw
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let mx = 0, mz = 0;
    if (keys.w) { mx += sy; mz -= cy; }   // forward
    if (keys.s) { mx -= sy; mz += cy; }   // back
    if (keys.a) { mx -= cy; mz -= sy; }   // strafe left
    if (keys.d) { mx += cy; mz += sy; }   // strafe right

    this._moving = (mx !== 0 || mz !== 0);
    if (this._moving) {
      const len = Math.sqrt(mx * mx + mz * mz);
      this.x += (mx / len) * spd * dt;
      this.z += (mz / len) * spd * dt;
      this._phase += dt * spd * 3.2;
    }

    // Gravity / floor snap
    if (floorY === -Infinity) {
      this.vy -= 18 * dt;
      this.y  += this.vy * dt;
    } else {
      if (this.y > floorY + 0.05) {
        this.vy -= 18 * dt;
        this.y  += this.vy * dt;
        if (this.y < floorY) { this.y = floorY; this.vy = 0; }
      } else {
        this.y  = floorY;
        this.vy = 0;
      }
    }

    // Limb animation
    if (this._moving) {
      const sw = Math.sin(this._phase);
      this._lHip.rotation.x      =  sw * 0.52;
      this._rHip.rotation.x      = -sw * 0.52;
      this._lShoulder.rotation.x = -sw * 0.30;
      this._rShoulder.rotation.x =  sw * 0.30;
    } else {
      this._lHip.rotation.x      *= 0.85;
      this._rHip.rotation.x      *= 0.85;
      this._lShoulder.rotation.x *= 0.85;
      this._rShoulder.rotation.x *= 0.85;
    }

    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
  }

  // FPS camera eye position (above group base)
  eyePos() { return { x: this.x, y: this.y + 1.65, z: this.z }; }

  dispose() {
    this._scene.remove(this.group);
    this.group.traverse(c => { if (c.isMesh) { c.geometry.dispose(); } });
  }
}
