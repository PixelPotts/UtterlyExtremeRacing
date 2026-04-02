import * as THREE from 'three';

// ── Shared geometries/materials ────────────────────────────────────────────
const _ringGeo   = new THREE.RingGeometry(0.1, 1.0, 32);
const _sparkGeo  = new THREE.SphereGeometry(0.12, 4, 3);
const _smokeGeo  = new THREE.SphereGeometry(0.22, 4, 3);

// ── Explosion ──────────────────────────────────────────────────────────────
// Usage: new Explosion(scene, position)
// Call update(dt) each frame; returns false when finished.
// Call dispose() to force-clean early.
export class Explosion {
  constructor(scene, position) {
    this._scene    = scene;
    this._parts    = [];  // { mesh, vx, vy, vz, life, maxLife, type }
    this._alive    = true;

    const p = position;

    // ── Shockwave ring ──────────────────────────────────────────────
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xFF8800, side: THREE.DoubleSide,
      transparent: true, opacity: 0.7, depthWrite: false,
    });
    const ring = new THREE.Mesh(_ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(p).setY(0.05);
    scene.add(ring);
    this._parts.push({ mesh: ring, life: 1, maxLife: 1, type: 'ring',
      sx: 1, sy: 1 });

    // ── Fireball sparks ─────────────────────────────────────────────
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.5 ? 0xFF5500 : 0xFFCC00,
        transparent: true, opacity: 1,
      });
      const m = new THREE.Mesh(_sparkGeo, mat);
      m.position.copy(p);
      scene.add(m);
      const ang  = Math.random() * Math.PI * 2;
      const tilt = Math.random() * Math.PI * 0.55;
      const spd  = 4 + Math.random() * 9;
      this._parts.push({
        mesh: m, type: 'spark',
        vx: Math.cos(ang) * Math.sin(tilt) * spd,
        vy: Math.cos(tilt) * spd * 0.9 + 2,
        vz: Math.sin(ang) * Math.sin(tilt) * spd,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
      });
    }

    // ── Smoke puffs ─────────────────────────────────────────────────
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshLambertMaterial({
        color: 0x333333, transparent: true, opacity: 0.55, depthWrite: false,
      });
      const m = new THREE.Mesh(_smokeGeo, mat);
      m.position.copy(p);
      scene.add(m);
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.6 + Math.random() * 1.4;
      this._parts.push({
        mesh: m, type: 'smoke',
        vx: Math.cos(ang) * spd,
        vy: 2.2 + Math.random() * 2.8,
        vz: Math.sin(ang) * spd,
        life: 1.2 + Math.random() * 0.6,
        maxLife: 1.8,
      });
    }
  }

  update(dt) {
    if (!this._alive) return false;
    let anyAlive = false;

    for (let i = this._parts.length - 1; i >= 0; i--) {
      const p = this._parts[i];
      p.life -= dt;

      if (p.type === 'ring') {
        const t = 1 - Math.max(0, p.life);
        const s = 1 + t * 14;
        p.mesh.scale.set(s, s, 1);
        p.mesh.material.opacity = Math.max(0, p.life * 0.7);
      } else if (p.type === 'spark') {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 14 * dt;
        const t = Math.max(0, p.life / p.maxLife);
        p.mesh.material.opacity = t;
        p.mesh.scale.setScalar(0.4 + t * 0.8);
      } else if (p.type === 'smoke') {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy *= 0.97;
        const t = Math.max(0, p.life / p.maxLife);
        p.mesh.material.opacity = t * 0.55;
        p.mesh.scale.setScalar(1 + (1 - t) * 3.5);
      }

      if (p.life <= 0) {
        this._scene.remove(p.mesh);
        p.mesh.material.dispose();
        this._parts.splice(i, 1);
      } else {
        anyAlive = true;
      }
    }

    if (!anyAlive) this._alive = false;
    return this._alive;
  }

  dispose() {
    for (const p of this._parts) {
      this._scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    this._parts = [];
    this._alive = false;
  }
}
