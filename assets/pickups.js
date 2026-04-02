import * as THREE from 'three';
import { Grenade } from './throwables.js';
export { Grenade };

// ── PickupLightPool ───────────────────────────────────────────────────────────
// Fixed-count pool of PointLights. Lights are repositioned, never added/removed,
// so NUM_POINT_LIGHTS stays constant and Three.js never recompiles shaders.
export class PickupLightPool {
  constructor(scene, size = 12) {
    this._free = [];
    this._lights = Array.from({ length: size }, (_, i) => {
      const pl = new THREE.PointLight(0xffffff, 40, 6);
      pl.position.set(0, -500, 0);
      scene.add(pl);
      this._free.push(i);
      return pl;
    });
  }

  acquire(x, y, z, color, intensity, distance) {
    const i = this._free.pop();
    if (i == null) return null;
    const pl = this._lights[i];
    pl.color.setHex(color);
    pl.intensity = intensity;
    pl.distance  = distance;
    pl.position.set(x, y, z);
    return i;
  }

  setPos(slot, x, y, z) {
    if (slot != null) this._lights[slot].position.set(x, y, z);
  }

  release(slot) {
    if (slot == null) return;
    this._lights[slot].position.set(0, -500, 0);
    this._free.push(slot);
  }

  // Called after scene.clear() (L1→L2 transition) to re-add lights to the new scene.
  restoreTo(scene) {
    for (const pl of this._lights) scene.add(pl);
  }
}

// ── Pickup base ──────────────────────────────────────────────────────────────
export class Pickup {
  constructor(scene, pos, segIdx) {
    this._scene     = scene;
    this._segIdx    = segIdx;
    this._pos       = pos.clone();
    this._collected = false;
    this._radius    = 2.5;
    this.mesh       = null;
    this._lightPool = null;
    this._lightSlot = null;
  }

  get segIdx()    { return this._segIdx; }
  get collected() { return this._collected; }

  animate(_dt, _t) {}

  tryCollect(px, pz) {
    if (this._collected) return false;
    const dx = px - this._pos.x, dz = pz - this._pos.z;
    if (dx*dx + dz*dz < this._radius * this._radius) {
      this._collected = true;
      if (this.mesh) this._scene.remove(this.mesh);
      this._releaseLight();
      return true;
    }
    return false;
  }

  _releaseLight() {
    if (this._lightPool && this._lightSlot != null) {
      this._lightPool.release(this._lightSlot);
      this._lightSlot = null;
    }
  }

  dispose() {
    if (this.mesh) this._scene.remove(this.mesh);
    this._releaseLight();
  }
}

// ── NitroPickup ──────────────────────────────────────────────────────────────
const _chevMats = [
  new THREE.MeshBasicMaterial({ color: 0x0099ff, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: 0x0099ff, side: THREE.DoubleSide }),
];
const _nitroGlowMat = new THREE.MeshBasicMaterial({
  color: 0x0066ff, transparent: true, opacity: 0.07,
  side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
});
const _nitroArmGeo  = new THREE.BoxGeometry(0.55, 0.07, 0.14);
const _nitroGlowGeo = new THREE.SphereGeometry(0.85, 8, 6);

export class NitroPickup extends Pickup {
  constructor(scene, pos, segIdx, lightPool) {
    super(scene, pos, segIdx);
    this._radius    = 3.0;
    this._baseY     = pos.y;
    this._lightPool = lightPool ?? null;
    this.mesh       = this._buildMesh();
    this.mesh.position.set(pos.x, pos.y + 0.8, pos.z);
    if (lightPool) this._lightSlot = lightPool.acquire(pos.x, pos.y + 1.5, pos.z, 0x0088ff, 45, 5.5);
    scene.add(this.mesh);
  }

  _buildMesh() {
    const root = new THREE.Group();
    for (let c = 0; c < 3; c++) {
      const grp = new THREE.Group();
      grp.position.z = (c - 1) * 0.32;
      const uArm = new THREE.Mesh(_nitroArmGeo, _chevMats[c]);
      uArm.position.set(0, 0.20, 0); uArm.rotation.z = -0.52;
      grp.add(uArm);
      const lArm = new THREE.Mesh(_nitroArmGeo, _chevMats[c]);
      lArm.position.set(0, -0.20, 0); lArm.rotation.z = 0.52;
      grp.add(lArm);
      root.add(grp);
    }
    root.add(new THREE.Mesh(_nitroGlowGeo, _nitroGlowMat));
    return root;
  }

  animate(_dt, t) {
    if (!this.mesh) return;
    const y = this._baseY + 0.8 + Math.sin(t * 2.4) * 0.12;
    this.mesh.position.y = y;
    this.mesh.rotation.y = t * 1.3;
    this._lightPool?.setPos(this._lightSlot, this.mesh.position.x, y + 0.7, this.mesh.position.z);
  }
}

// ── GrenadePickup ─────────────────────────────────────────────────────────────
// Singleton texture + materials — no per-instance allocation.
const _grenadePickupTex = (() => {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const cx = c.getContext('2d');
  cx.fillStyle = '#3a4e10'; cx.fillRect(0, 0, S, S);
  cx.strokeStyle = '#111'; cx.lineWidth = 3;
  for (let i = 0; i <= S; i += 16) {
    cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i, S); cx.stroke();
    cx.beginPath(); cx.moveTo(0, i); cx.lineTo(S, i); cx.stroke();
  }
  return new THREE.CanvasTexture(c);
})();
const _grenadeBodyMat = new THREE.MeshLambertMaterial({ map: _grenadePickupTex, emissive: 0x223300, emissiveIntensity: 0.4 });
const _grenadeCapMat  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const _grenadeGlowMat = new THREE.MeshBasicMaterial({
  color: 0x88ff44, transparent: true, opacity: 0.07,
  side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
});
const _grenadeBodyGeo = new THREE.SphereGeometry(0.40, 10, 8);
const _grenadeCapGeo  = new THREE.CylinderGeometry(0.10, 0.22, 0.22, 6);
const _grenadeGlowGeo = new THREE.SphereGeometry(0.72, 8, 6);

export class GrenadePickup extends Pickup {
  constructor(scene, pos, segIdx, lightPool) {
    super(scene, pos, segIdx);
    this._radius    = 2.8;
    this._baseY     = pos.y;
    this._lightPool = lightPool ?? null;
    this.mesh       = this._buildMesh();
    this.mesh.position.set(pos.x, pos.y + 1.1, pos.z);
    if (lightPool) this._lightSlot = lightPool.acquire(pos.x, pos.y + 1.8, pos.z, 0x88ff00, 40, 7);
    scene.add(this.mesh);
  }

  _buildMesh() {
    const root = new THREE.Group();
    const body = new THREE.Mesh(_grenadeBodyGeo, _grenadeBodyMat);
    body.scale.y = 1.18;
    root.add(body);
    const cap = new THREE.Mesh(_grenadeCapGeo, _grenadeCapMat);
    cap.position.y = 0.50;
    root.add(cap);
    root.add(new THREE.Mesh(_grenadeGlowGeo, _grenadeGlowMat));
    return root;
  }

  animate(_dt, t) {
    if (!this.mesh) return;
    const y = this._baseY + 1.1 + Math.sin(t * 2.0) * 0.14;
    this.mesh.position.y = y;
    this.mesh.rotation.y = t * 0.9;
    this.mesh.rotation.x = Math.sin(t * 1.3) * 0.10;
    this._lightPool?.setPos(this._lightSlot, this.mesh.position.x, y + 0.7, this.mesh.position.z);
  }
}

// ── AmmoPickup ────────────────────────────────────────────────────────────────
const _ammoGeo    = new THREE.CylinderGeometry(0.07, 0.07, 0.52, 6);
const _ammoMat    = new THREE.MeshBasicMaterial({ color: 0xFFDD00 });
const _ammoGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffdd00, transparent: true, opacity: 0.09,
  side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
});
const _ammoGlowGeo = new THREE.SphereGeometry(0.65, 8, 6);

export class AmmoPickup extends Pickup {
  constructor(scene, pos, segIdx, lightPool) {
    super(scene, pos, segIdx);
    this._radius    = 2.5;
    this._baseY     = pos.y;
    this._lightPool = lightPool ?? null;
    this.mesh       = this._buildMesh();
    this.mesh.position.set(pos.x, pos.y + 0.75, pos.z);
    if (lightPool) this._lightSlot = lightPool.acquire(pos.x, pos.y + 1.5, pos.z, 0xffcc00, 35, 5);
    scene.add(this.mesh);
  }

  _buildMesh() {
    const root = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(_ammoGeo, _ammoMat);
      b.position.x = (i - 1) * 0.28;
      root.add(b);
    }
    root.add(new THREE.Mesh(_ammoGlowGeo, _ammoGlowMat));
    return root;
  }

  animate(_dt, t) {
    if (!this.mesh) return;
    const y = this._baseY + 0.75 + Math.sin(t * 3.0) * 0.09;
    this.mesh.position.y = y;
    this.mesh.rotation.y = t * 1.6;
    this._lightPool?.setPos(this._lightSlot, this.mesh.position.x, y + 0.7, this.mesh.position.z);
  }
}

// ── PickupManager ─────────────────────────────────────────────────────────────
export class PickupManager {
  constructor(scene, path, zoneTypes) {
    this._scene     = scene;
    this._path      = path;
    this._zoneTypes = zoneTypes;
    this._bySeg     = new Map();
    this._cb        = {};
    this._lightPool = new PickupLightPool(scene, 12);
  }

  on(type, fn) { this._cb[type] = fn; }
  _emit(type)  { this._cb[type]?.(); }

  // After scene.clear() (L1→L2), re-add pool lights to the new scene.
  restorePool(scene) {
    this._scene = scene;
    this._lightPool.restoreTo(scene);
  }

  spawnForSeg(si, gunPickedUp) {
    if (this._bySeg.has(si)) return;
    const list = [];
    const p = this._path[si];
    if (!p) { this._bySeg.set(si, list); return; }

    const lateralOff = (Math.random() - 0.5) * 4;
    const perpX = Math.cos(p.angle), perpZ = Math.sin(p.angle);
    const pos = new THREE.Vector3(
      p.pos.x + lateralOff * perpX,
      p.pos.y,
      p.pos.z + lateralOff * perpZ,
    );

    if (si >= 1 && si <= 3) {
      list.push(new NitroPickup(this._scene, pos, si, this._lightPool));
      this._bySeg.set(si, list);
      return;
    }

    const zone = this._zoneTypes[si] ?? 'trees';
    if (zone === 'tunnel' || zone === 'intersection' || zone === 'start') {
      this._bySeg.set(si, list);
      return;
    }

    const r = Math.random();
    if      (r < 0.042)                  list.push(new NitroPickup  (this._scene, pos, si, this._lightPool));
    else if (r < 0.082)                  list.push(new GrenadePickup(this._scene, pos, si, this._lightPool));
    else if (r < 0.145 && gunPickedUp)   list.push(new AmmoPickup   (this._scene, pos, si, this._lightPool));

    this._bySeg.set(si, list);
  }

  dropSeg(si) {
    const list = this._bySeg.get(si);
    if (!list) return;
    for (const p of list) p.dispose();
    this._bySeg.delete(si);
  }

  update(dt, px, pz) {
    const t = performance.now() * 0.001;
    for (const list of this._bySeg.values()) {
      for (const pickup of list) {
        if (pickup.collected) continue;
        pickup.animate(dt, t);
        if (pickup.tryCollect(px, pz)) {
          this._emit(
            pickup instanceof NitroPickup   ? 'nitro'   :
            pickup instanceof GrenadePickup ? 'grenade' : 'ammo'
          );
        }
      }
    }
  }

  reset() {
    for (const si of [...this._bySeg.keys()]) this.dropSeg(si);
  }
}
