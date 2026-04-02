import * as THREE from 'three';
import { Grenade } from './throwables.js';
export { Grenade };

// ── Pickup base ──────────────────────────────────────────────────────────────
export class Pickup {
  constructor(scene, pos, segIdx) {
    this._scene     = scene;
    this._segIdx    = segIdx;
    this._pos       = pos.clone();
    this._collected = false;
    this._radius    = 2.5;
    this.mesh       = null;
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
      return true;
    }
    return false;
  }

  dispose() {
    if (this.mesh) this._scene.remove(this.mesh);
  }
}

// ── NitroPickup ──────────────────────────────────────────────────────────────
// 3 spinning blue/white chevrons hovering over the road.
const _chevMats = [
  new THREE.MeshBasicMaterial({ color: 0x0099ff, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: 0x0099ff, side: THREE.DoubleSide }),
];

export class NitroPickup extends Pickup {
  constructor(scene, pos, segIdx) {
    super(scene, pos, segIdx);
    this._radius = 3.0;
    this._baseY  = pos.y;
    this.mesh    = this._buildMesh();
    this.mesh.position.set(pos.x, pos.y + 0.8, pos.z);
    scene.add(this.mesh);
  }

  _buildMesh() {
    const root   = new THREE.Group();
    const armGeo = new THREE.BoxGeometry(0.55, 0.07, 0.14);

    for (let c = 0; c < 3; c++) {
      const grp = new THREE.Group();
      grp.position.z = (c - 1) * 0.32;

      const uArm = new THREE.Mesh(armGeo, _chevMats[c]);
      uArm.position.set(0, 0.20, 0);
      uArm.rotation.z = -0.52;
      grp.add(uArm);

      const lArm = new THREE.Mesh(armGeo, _chevMats[c]);
      lArm.position.set(0, -0.20, 0);
      lArm.rotation.z = 0.52;
      grp.add(lArm);

      root.add(grp);
    }

    root.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0x0066ff, transparent: true, opacity: 0.07,
        side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    ));
    root.add(new THREE.PointLight(0x0088ff, 45, 5.5));
    return root;
  }

  animate(_dt, t) {
    if (!this.mesh) return;
    this.mesh.position.y = this._baseY + 0.8 + Math.sin(t * 2.4) * 0.12;
    this.mesh.rotation.y = t * 1.3;
  }
}

// ── GrenadePickup ─────────────────────────────────────────────────────────────
// Enlarged floating grenade (~2.5× normal projectile size).
function _makeGrenadePickupTex() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const cx = c.getContext('2d');
  cx.fillStyle = '#3a4e10';
  cx.fillRect(0, 0, S, S);
  cx.strokeStyle = '#111'; cx.lineWidth = 3;
  for (let i = 0; i <= S; i += 16) {
    cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i, S); cx.stroke();
    cx.beginPath(); cx.moveTo(0, i); cx.lineTo(S, i); cx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

export class GrenadePickup extends Pickup {
  constructor(scene, pos, segIdx) {
    super(scene, pos, segIdx);
    this._radius = 2.8;
    this._baseY  = pos.y;
    this.mesh    = this._buildMesh();
    this.mesh.position.set(pos.x, pos.y + 1.1, pos.z);
    scene.add(this.mesh);
  }

  _buildMesh() {
    const root    = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ map: _makeGrenadePickupTex(), emissive: 0x223300, emissiveIntensity: 0.4 });
    const capMat  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.40, 10, 8), bodyMat);
    body.scale.y = 1.18;
    root.add(body);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.22, 0.22, 6), capMat);
    cap.position.y = 0.50;
    root.add(cap);

    root.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0x88ff44, transparent: true, opacity: 0.07,
        side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    ));
    root.add(new THREE.PointLight(0x88ff00, 40, 7));
    return root;
  }

  animate(_dt, t) {
    if (!this.mesh) return;
    this.mesh.position.y = this._baseY + 1.1 + Math.sin(t * 2.0) * 0.14;
    this.mesh.rotation.y = t * 0.9;
    this.mesh.rotation.x = Math.sin(t * 1.3) * 0.10;
  }
}

// ── AmmoPickup ────────────────────────────────────────────────────────────────
// 3 bullet cylinders in a horizontal row.
const _ammoGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.52, 6);
const _ammoMat = new THREE.MeshBasicMaterial({ color: 0xFFDD00 });

export class AmmoPickup extends Pickup {
  constructor(scene, pos, segIdx) {
    super(scene, pos, segIdx);
    this._radius = 2.5;
    this._baseY  = pos.y;
    this.mesh    = this._buildMesh();
    this.mesh.position.set(pos.x, pos.y + 0.75, pos.z);
    scene.add(this.mesh);
  }

  _buildMesh() {
    const root = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(_ammoGeo, _ammoMat);
      b.position.x = (i - 1) * 0.28;
      root.add(b);
    }
    root.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffdd00, transparent: true, opacity: 0.09,
        side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    ));
    root.add(new THREE.PointLight(0xffcc00, 35, 5));
    return root;
  }

  animate(_dt, t) {
    if (!this.mesh) return;
    this.mesh.position.y = this._baseY + 0.75 + Math.sin(t * 3.0) * 0.09;
    this.mesh.rotation.y = t * 1.6;
  }
}

// ── PickupManager ─────────────────────────────────────────────────────────────
export class PickupManager {
  constructor(scene, path, zoneTypes) {
    this._scene     = scene;
    this._path      = path;
    this._zoneTypes = zoneTypes;
    this._bySeg     = new Map();
    this._cb        = {};  // 'nitro' | 'grenade' | 'ammo' → fn()
  }

  on(type, fn) { this._cb[type] = fn; }
  _emit(type)  { this._cb[type]?.(); }

  // si: segment index; gunPickedUp: whether player currently has the gun
  spawnForSeg(si, gunPickedUp) {
    if (this._bySeg.has(si)) return;
    const list = [];
    const p = this._path[si];
    if (!p) { this._bySeg.set(si, list); return; }

    // Slight lateral offset within road bounds
    const lateralOff = (Math.random() - 0.5) * 4;
    const perpX = Math.cos(p.angle), perpZ = Math.sin(p.angle);
    const pos = new THREE.Vector3(
      p.pos.x + lateralOff * perpX,
      p.pos.y,
      p.pos.z + lateralOff * perpZ,
    );

    // Fixed nitro boosts near start of each level
    if (si >= 1 && si <= 3) {
      list.push(new NitroPickup(this._scene, pos, si));
      this._bySeg.set(si, list);
      return;
    }

    const zone = this._zoneTypes[si] ?? 'trees';
    if (zone === 'tunnel' || zone === 'intersection' || zone === 'start') {
      this._bySeg.set(si, list);
      return;
    }

    // Probabilistic — at most 1 pickup per segment (~1 per zone)
    const r = Math.random();
    if      (r < 0.042) { list.push(new NitroPickup  (this._scene, pos, si)); }
    else if (r < 0.082) { list.push(new GrenadePickup (this._scene, pos, si)); }
    else if (r < 0.145 && gunPickedUp) { list.push(new AmmoPickup(this._scene, pos, si)); }

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
