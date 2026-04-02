import * as THREE from 'three';

// Shared geometry/material — allocated once, reused by all bullets of each type
const _stdBulletGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.30, 6);
const _stdBulletMat = new THREE.MeshBasicMaterial({ color: 0xFFDD00 });

class Bullet {
  constructor(scene, position, direction, speed) {
    this.scene    = scene;
    this.velocity = direction.clone().normalize().multiplyScalar(speed);
    this.life     = 1.6; // seconds before despawn

    this.mesh = new THREE.Mesh(_stdBulletGeo, _stdBulletMat);
    this.mesh.position.copy(position);
    // Align cylinder (Y-axis) along travel direction
    this.mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      this.velocity.clone().normalize()
    );
    scene.add(this.mesh);
  }

  update(dt) {
    this.mesh.position.addScaledVector(this.velocity, dt);
    this.life -= dt;
    return this.life > 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    // Shared geo/mat — do not dispose here
  }
}

class Weapon {
  constructor(scene, {
    name        = 'Cannon',
    ammo        = 30,
    rateOfFire  = 12,   // rounds / second
    bulletSpeed = 130,
  } = {}) {
    this.scene       = scene;
    this.name        = name;
    this.ammo        = ammo;
    this.maxAmmo     = ammo;
    this.rateOfFire  = rateOfFire;
    this.bulletSpeed = bulletSpeed;
    this.bullets     = [];
    this._cooldown   = 0;
  }

  // position: THREE.Vector3, direction: THREE.Vector3 (world-space forward)
  shoot(position, direction) {
    if (this._cooldown > 0 || this.ammo <= 0) return false;
    this.ammo--;
    this._cooldown = 1 / this.rateOfFire;
    this.bullets.push(new Bullet(this.scene, position, direction, this.bulletSpeed));
    return true;
  }

  update(dt) {
    if (this._cooldown > 0) this._cooldown -= dt;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      if (!this.bullets[i].update(dt)) {
        this.bullets[i].dispose();
        this.bullets.splice(i, 1);
      }
    }
  }

  get isEmpty() { return this.ammo <= 0 && this.bullets.length === 0; }

  dispose() {
    for (const b of this.bullets) b.dispose();
    this.bullets = [];
  }
}

export { Weapon };
