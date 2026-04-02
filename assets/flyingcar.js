import * as THREE from 'three';

export const NEON_COLORS = [0xFF00AA, 0x00AAFF, 0xFFDD00, 0xFF3300, 0xFFFFFF];

// Shared geometry — allocated once for all FlyingCar instances
const _bodyGeo  = new THREE.BoxGeometry(3.2, 0.32, 1.6);
const _wingGeo  = new THREE.BoxGeometry(0.9, 0.07, 0.65);
const _stripGeo = new THREE.BoxGeometry(3.8, 0.06, 0.10);
const _bodyMat  = new THREE.MeshLambertMaterial({ color: 0x0a0a14 });
const _wingMat  = new THREE.MeshLambertMaterial({ color: 0x151520 });

// ── FlyingCar ─────────────────────────────────────────────────────────────────
// Lightweight flying car: flat slab body + delta wings + neon understrip.
// Flies in a fixed world-space direction (no road-following). Caller resets
// position when the car drifts too far, creating a perpetual cross-traffic effect.
//
// Usage:
//   const fc = new FlyingCar(scene, colorHex);
//   fc.reset(x, y, z, vx, vz);   // place and set velocity
//   fc.update(dt);                // call each frame
//   fc.dispose();                 // remove from scene
export class FlyingCar {
  constructor(scene, color = 0x00AAFF) {
    this.scene = scene;
    this._vx   = 0;
    this._vz   = 0;

    const stripMat = new THREE.MeshBasicMaterial({ color });
    this._light    = new THREE.PointLight(color, 160, 26);

    this.group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(_bodyGeo, _bodyMat);
    body.castShadow = true;
    this.group.add(body);

    // Delta wings (left / right)
    for (const xo of [-2.1, 2.1]) {
      const w = new THREE.Mesh(_wingGeo, _wingMat);
      w.position.set(xo, 0, 0);
      this.group.add(w);
    }

    // Neon understrip
    const strip = new THREE.Mesh(_stripGeo, stripMat);
    strip.position.y = -0.18;
    this.group.add(strip);

    // Point light (parented to group, moves with car)
    this._light.position.set(0, -0.3, 0);
    this.group.add(this._light);

    scene.add(this.group);
  }

  // Set world position + velocity; yaw to face travel direction.
  reset(x, y, z, vx, vz) {
    this._vx = vx;
    this._vz = vz;
    this.group.position.set(x, y, z);
    this.group.rotation.y = Math.atan2(vx, -vz);
  }

  // Advance position; apply gentle bank roll proportional to lateral speed.
  update(dt) {
    this.group.position.x += this._vx * dt;
    this.group.position.z += this._vz * dt;
    this.group.rotation.z  = -this._vx * 0.011;
  }

  dispose() {
    this.scene.remove(this.group);
    // Do NOT dispose shared geometry/material — other instances still use them
  }
}
