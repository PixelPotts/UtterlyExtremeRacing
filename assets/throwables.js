import * as THREE from 'three';

// ── Throwable ──────────────────────────────────────────────────────────────
// Base class for physics-arc projectiles.
// Subclasses override onLand(position) for impact behaviour.
export class Throwable {
  constructor(scene, startPos, vel, { gravity = 12 } = {}) {
    this._scene   = scene;
    this._vel     = vel.clone();
    this._g       = gravity;
    this._landed  = false;
    this._age     = 0;
    this._landPos = null;

    this.mesh = this._buildMesh();
    this.mesh.position.copy(startPos);
    scene.add(this.mesh);
  }

  // Override to return a THREE.Object3D
  _buildMesh() {
    return new THREE.Object3D();
  }

  // Called once when the projectile hits y=0. Override in subclasses.
  onLand(_position) {}

  // Returns true while alive
  update(dt) {
    this._age += dt;
    if (this._landed) return this._postLandAlive(dt);

    this._vel.y -= this._g * dt;
    this.mesh.position.addScaledVector(this._vel, dt);
    this._spin(dt);

    const groundY = this._groundY();
    if (this.mesh.position.y <= groundY) {
      this.mesh.position.y = groundY;
      this._landed  = true;
      this._landPos = this.mesh.position.clone();
      this.onLand(this._landPos);
    }
    return true;
  }

  // How long (seconds) to linger after landing before expiring
  _postLandAlive(_dt) { return this._age < 4.0; }

  // Ground level — override if needed
  _groundY() { return 0.13; }

  // Spin animation during flight — override or no-op
  _spin(dt) {
    this.mesh.rotation.x += dt * 6;
    this.mesh.rotation.z += dt * 4;
  }

  dispose() {
    this._scene.remove(this.mesh);
  }
}

// ── Grenade ────────────────────────────────────────────────────────────────
function _makeGridTex() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const cx = c.getContext('2d');
  cx.fillStyle = '#3a4e10';
  cx.fillRect(0, 0, S, S);
  cx.strokeStyle = '#111';
  cx.lineWidth = 3;
  for (let i = 0; i <= S; i += 16) {
    cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i, S); cx.stroke();
    cx.beginPath(); cx.moveTo(0, i); cx.lineTo(S, i); cx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// Shared resources — allocated once
const _gBodyGeo = new THREE.SphereGeometry(0.16, 8, 7);
const _gCapGeo  = new THREE.CylinderGeometry(0.042, 0.088, 0.09, 6);
const _gGlowGeo = new THREE.SphereGeometry(0.32, 8, 6);
const _gBodyMat = new THREE.MeshLambertMaterial({ map: _makeGridTex() });
const _gCapMat  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const _gGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.10,
  side: THREE.BackSide, depthWrite: false,
});

export class Grenade extends Throwable {
  constructor(scene, startPos, vel, { gravity = 12, onExplode = null } = {}) {
    super(scene, startPos, vel, { gravity });
    this._onExplode = onExplode;
  }

  _buildMesh() {
    const root = new THREE.Group();

    // Primitive 1: body — olive grid sphere, slightly elongated
    const body = new THREE.Mesh(_gBodyGeo, _gBodyMat);
    body.scale.set(1, 1.18, 1);
    body.castShadow = true;
    root.add(body);

    // Primitive 2: cap — dark cylinder on top
    const cap = new THREE.Mesh(_gCapGeo, _gCapMat);
    cap.position.y = 0.20;
    root.add(cap);

    // Bloom — slightly larger BackSide sphere (not a primitive, fx only)
    root.add(new THREE.Mesh(_gGlowGeo, _gGlowMat));

    // Soft white point light
    root.add(new THREE.PointLight(0xffffff, 8, 2.8));

    return root;
  }

  onLand(position) {
    if (this._onExplode) this._onExplode(position.clone());
  }

  _postLandAlive(_dt) {
    this.mesh.visible = false;
    return this._age < 4.0;
  }
}
