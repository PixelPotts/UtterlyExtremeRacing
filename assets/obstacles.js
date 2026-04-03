import * as THREE from 'three';

// ── Base Obstacle ──────────────────────────────────────────────────────────
export class Obstacle {
  constructor(scene, si, x, z) {
    this.scene  = scene;
    this.si     = si;
    this.x      = x;
    this.z      = z;
    this.meshes = [];
  }
  update(_dt, _carX, _carZ, _cSeg) {}
  dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    this.meshes = [];
  }
}

// ── Shared geometry singletons — created once, reused by all pool instances ──
// Manhole geometry
const _MH_COVER_GEO = new THREE.CylinderGeometry(0.50, 0.50, 0.07, 16);
const _MH_RING_GEO  = new THREE.TorusGeometry(0.46, 0.055, 6, 16);
const _MH_HOLE_GEO  = new THREE.CylinderGeometry(0.44, 0.44, 0.04, 16);
// Pedestrian geometry
const _PED_HEAD_GEO  = new THREE.SphereGeometry(0.18, 7, 6);
const _PED_TORSO_GEO = new THREE.CylinderGeometry(0.13, 0.16, 0.52, 7);
const _PED_LEG_GEO   = new THREE.CylinderGeometry(0.065, 0.050, 0.72, 6);
const _PED_SHOE_GEO  = new THREE.BoxGeometry(0.15, 0.09, 0.26);
const _PED_ARM_GEO   = new THREE.CylinderGeometry(0.055, 0.042, 0.40, 5);
[_MH_COVER_GEO, _MH_RING_GEO, _MH_HOLE_GEO,
 _PED_HEAD_GEO, _PED_TORSO_GEO, _PED_LEG_GEO, _PED_SHOE_GEO, _PED_ARM_GEO,
].forEach(g => { g.userData.sharedGeo = true; });

// ── Manhole Cover ──────────────────────────────────────────────────────────
const _mhMat     = new THREE.MeshLambertMaterial({ color: 0x484848 });
const _mhRingMat = new THREE.MeshLambertMaterial({ color: 0x2E2E2E });
const _mhHoleMat = new THREE.MeshLambertMaterial({ color: 0x0A0A0A });

export class ManholeObstacle extends Obstacle {
  constructor(scene, si, x, z, explosive, onBlast, pathY = 0) {
    super(scene, si, x, z);
    this.explosive   = explosive;
    this.triggered   = false;
    this.onBlast     = onBlast;
    this._pathY      = pathY;
    this._phase      = null;   // null | 'rising' | 'hovering' | 'done'
    this._vy         = 0;
    this._hoverTimer = 0;
    this._steam      = [];

    const cover = new THREE.Mesh(_MH_COVER_GEO, _mhMat);
    cover.position.set(x, pathY + 0.47, z);
    cover.castShadow = cover.receiveShadow = true;
    scene.add(cover);

    const ring = new THREE.Mesh(_MH_RING_GEO, _mhRingMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, pathY + 0.50, z);
    scene.add(ring);

    const hole = new THREE.Mesh(_MH_HOLE_GEO, _mhHoleMat);
    hole.position.set(x, pathY + 0.43, z);
    scene.add(hole);

    this.cover  = cover;
    this.ring   = ring;
    this.hole   = hole;
    this.meshes      = [cover, ring, hole];
    this._sceneMeshes = [cover, ring, hole]; // for ObjectPool.restoreToScene
  }

  /** Reposition a pool instance for a new spawn — zero allocations. */
  resetAt(si, x, z, pathY, explosive, onBlast) {
    this.si          = si;
    this.x           = x;
    this.z           = z;
    this._pathY      = pathY;
    this.explosive   = explosive;
    this.onBlast     = onBlast;
    this.triggered   = false;
    this._phase      = null;
    this._vy         = 0;
    this._hoverTimer = 0;
    this.cover.position.set(x, pathY + 0.47, z);
    this.cover.rotation.set(0, 0, 0);
    this.ring.position.set(x, pathY + 0.50, z);
    this.hole.position.set(x, pathY + 0.43, z);
    this.meshes = [this.cover, this.ring, this.hole];
    return this;
  }

  _blast() {
    this.triggered   = true;
    this._phase      = 'rising';
    this._vy         = 16;
    this._hoverTimer = 3.2;
    if (this.onBlast) this.onBlast();
    for (let i = 0; i < 22; i++) {
      const r  = 0.07 + Math.random() * 0.18;
      const sm = new THREE.Mesh(
        new THREE.SphereGeometry(r, 5, 4),
        new THREE.MeshLambertMaterial({ color: 0xBBCCDD, transparent: true, opacity: 0.78 })
      );
      sm.position.set(this.x, this._pathY + 0.5, this.z);
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 3.5;
      this.scene.add(sm);
      this.meshes.push(sm);
      this._steam.push({
        mesh: sm,
        vx: Math.cos(ang) * spd * 0.28,
        vy: 5 + Math.random() * 9,
        vz: Math.sin(ang) * spd * 0.28,
        life: 1.0,
      });
    }
  }

  update(dt, carX, carZ, cSeg) {
    if (this.explosive && !this.triggered) {
      const dx = carX - this.x, dz = carZ - this.z;
      if (dx*dx + dz*dz < 80*80 && cSeg >= this.si - 8) this._blast();
    }
    if (!this._phase) return;

    if (this._phase === 'rising') {
      this.cover.position.y += this._vy * dt;
      this._vy -= 20 * dt;
      this.cover.rotation.x += dt * 5;
      this.cover.rotation.z += dt * 2.5;
      if (this.cover.position.y >= this._pathY + 5.47) {
        this.cover.position.y = this._pathY + 5.47;
        this._vy = 0;
        this._phase = 'hovering';
      }
    } else if (this._phase === 'hovering') {
      this._hoverTimer -= dt;
      this.cover.position.y = this._pathY + 5.47 + Math.sin(Date.now() * 0.0022) * 0.14;
      this.cover.rotation.y += dt * 0.8;
      if (this._hoverTimer <= 0) this._phase = 'done';
    }

    for (let j = this._steam.length - 1; j >= 0; j--) {
      const sp = this._steam[j];
      sp.life -= dt * 0.85;
      sp.mesh.position.x += sp.vx * dt;
      sp.mesh.position.y += sp.vy * dt;
      sp.mesh.position.z += sp.vz * dt;
      sp.vy -= 2.0 * dt;
      sp.mesh.scale.setScalar(1 + (1 - sp.life) * 3.5);
      sp.mesh.material.opacity = Math.max(0, sp.life * 0.78);
      if (sp.life <= 0) {
        this.scene.remove(sp.mesh);
        sp.mesh.geometry.dispose();
        sp.mesh.material.dispose();
        const idx = this.meshes.indexOf(sp.mesh);
        if (idx !== -1) this.meshes.splice(idx, 1);
        this._steam.splice(j, 1);
      }
    }

    if (this._phase === 'done' && this._steam.length === 0) {
      this.scene.remove(this.cover);
      this.cover.geometry.dispose();
      const ci = this.meshes.indexOf(this.cover);
      if (ci !== -1) this.meshes.splice(ci, 1);
      this._phase = 'finished';
    }
  }

  dispose() {
    // Pool-managed: park off-screen via _poolRelease, don't destroy geometry.
    if (this._poolRelease) { this._poolRelease(); return; }
    // Non-pooled: full teardown.
    for (const sp of this._steam) {
      this.scene.remove(sp.mesh);
      sp.mesh.geometry.dispose();
      sp.mesh.material.dispose();
    }
    this._steam = [];
    if (this._phase === null || this._phase === 'rising' || this._phase === 'hovering') {
      this.scene.remove(this.cover);
    }
    this.scene.remove(this.ring);
    this.scene.remove(this.hole);
    this.meshes = [];
  }
}

// ── Oil Spill ──────────────────────────────────────────────────────────────
function _makeOilGeo(angle, length, width) {
  const N  = 22;
  const fx = Math.sin(angle), fz = -Math.cos(angle);
  const px = Math.cos(angle), pz =  Math.sin(angle);
  const pos = [0, 0.45, 0];
  for (let i = 0; i < N; i++) {
    const t     = (i / N) * Math.PI * 2;
    const noise = 0.70 + Math.random() * 0.60 + 0.20 * Math.sin(t * 3.1 + Math.random());
    const lf    = Math.cos(t) * length * 0.5 * noise;
    const lp    = Math.sin(t) * width  * 0.5 * noise;
    pos.push(fx * lf + px * lp, 0.45, fz * lf + pz * lp);
  }
  const idx = [];
  for (let i = 0; i < N; i++) idx.push(0, i + 1, ((i + 1) % N) + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const OIL_VS = /* glsl */`
varying vec3 vWorldPos;
varying vec3 vViewDir;
void main() {
  vec4 wp   = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vViewDir  = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const OIL_FS = /* glsl */`
uniform float uTime;
uniform vec3  uSunDir;
varying vec3 vWorldPos;
varying vec3 vViewDir;
#define PI 3.14159265
void main() {
  vec3  N       = vec3(0.0, 1.0, 0.0);
  float NdotV   = clamp(dot(N, vViewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - NdotV, 2.2);
  // Thin-film iridescence — hue shifts with view angle + world pos
  float phase = NdotV * 4.4 + vWorldPos.x * 0.09 + vWorldPos.z * 0.07 + uTime * 0.2;
  vec3  iri   = 0.5 + 0.5 * cos(2.0 * PI * (vec3(0.0, 0.33, 0.67) + phase));
  // Sharp sun specular (high exponent = mirror-like)
  vec3  halfV = normalize(uSunDir + vViewDir);
  float spec  = pow(max(dot(N, halfV), 0.0), 512.0);
  // Dark oil base + iridescent sheen + hard specular glint
  vec3 col = vec3(0.008, 0.008, 0.018);
  col += iri * 0.70 * (0.20 + fresnel * 0.80);
  col += vec3(0.88, 0.94, 1.0) * spec * 1.4;
  gl_FragColor = vec4(col, 0.42 + fresnel * 0.58);
}`;

const _sunDir = new THREE.Vector3(60, 150, 50).normalize();

export class OilSpillObstacle extends Obstacle {

  constructor(scene, si, x, z, angle, pathY = 0) {
    super(scene, si, x, z);
    const length = 10 + Math.random() * 6;   // 10–16 m long
    const width  = 2.0 + Math.random() * 1.6; // 2–3.6 m wide
    this._mat = new THREE.ShaderMaterial({
      vertexShader:   OIL_VS,
      fragmentShader: OIL_FS,
      uniforms: {
        uTime:   { value: 0 },
        uSunDir: { value: _sunDir },
      },
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(_makeOilGeo(angle, length, width), this._mat);
    mesh.position.set(x, pathY, z);
    mesh.renderOrder = 1;
    scene.add(mesh);
    this.meshes = [mesh];
  }

  update(dt, _carX, _carZ, _cSeg) {
    this._mat.uniforms.uTime.value += dt;
  }

  dispose() {
    super.dispose();
    this._mat.dispose();
  }
}

// ── Pedestrian ─────────────────────────────────────────────────────────────
const _SKIN  = [0xF5CBA7, 0xE8B880, 0xD4956A, 0xAF7845, 0x8B5E3C];
const _TOPS  = [0x2266CC, 0xCC3322, 0x338855, 0x885522, 0x667788,
                0x9933AA, 0x22AACC, 0xDD7722, 0xBBBBBB, 0x334466];
const _PANTS = [0x1A2040, 0x3A2810, 0x1A3020, 0x383838, 0x8B8060, 0x3D2B3D];
const _SHOES = [0x111111, 0x221100, 0x2A3010];
const _pick  = arr => arr[Math.random() * arr.length | 0];

export class PedestrianObstacle extends Obstacle {
  constructor(scene, si, x, z, walkDir, roadAngle, pathY = 0) {
    super(scene, si, x, z);
    this._pathY = pathY;
    // Walk vector in world space
    this._fx    = Math.sin(roadAngle) * walkDir;
    this._fz    = -Math.cos(roadAngle) * walkDir;
    this._speed = 0.7 + Math.random() * 0.8;   // m/s
    this._phase = Math.random() * Math.PI * 2;  // desync
    this._wx    = x;
    this._wz    = z;
    this._ragdoll = false;

    const root  = new THREE.Group();
    const scale = 0.86 + Math.random() * 0.28;
    root.scale.setScalar(scale);
    root.position.set(x, pathY + 0.46, z);
    // Face the walk direction (local +Z = walk dir)
    root.rotation.y = Math.atan2(this._fx, this._fz);

    const skinMat = new THREE.MeshLambertMaterial({ color: _pick(_SKIN)  });
    const topMat  = new THREE.MeshLambertMaterial({ color: _pick(_TOPS)  });
    const pantMat = new THREE.MeshLambertMaterial({ color: _pick(_PANTS) });
    const shoeMat = new THREE.MeshLambertMaterial({ color: _pick(_SHOES) });
    this._mats = [skinMat, topMat, pantMat, shoeMat];

    // Head – sphere (shared geometry)
    const head = new THREE.Mesh(_PED_HEAD_GEO, skinMat);
    head.position.y = 1.62;
    root.add(head);

    // Torso – round cylinder (shared geometry)
    const torso = new THREE.Mesh(_PED_TORSO_GEO, topMat);
    torso.position.y = 1.10;
    root.add(torso);

    // Legs – pivot group at hip
    this._lHip = new THREE.Group(); this._lHip.position.set(-0.09, 0.84, 0);
    this._rHip = new THREE.Group(); this._rHip.position.set( 0.09, 0.84, 0);

    const mkLeg = () => {
      const g   = new THREE.Group();
      const cyl = new THREE.Mesh(_PED_LEG_GEO, pantMat);
      cyl.position.y = -0.36;
      g.add(cyl);
      const shoe = new THREE.Mesh(_PED_SHOE_GEO, shoeMat);
      shoe.position.set(0, -0.76, 0.04);
      g.add(shoe);
      return g;
    };
    this._lHip.add(mkLeg()); this._rHip.add(mkLeg());
    root.add(this._lHip, this._rHip);

    // Arms – pivot at shoulder (shared geometry)
    this._lShoulder = new THREE.Group(); this._lShoulder.position.set(-0.20, 1.35, 0);
    this._rShoulder = new THREE.Group(); this._rShoulder.position.set( 0.20, 1.35, 0);

    const mkArm = () => {
      const arm = new THREE.Mesh(_PED_ARM_GEO, topMat);
      arm.position.y = -0.20;
      return arm;
    };
    this._lShoulder.add(mkArm()); this._rShoulder.add(mkArm());
    root.add(this._lShoulder, this._rShoulder);

    this._root        = root;
    this._sceneMeshes = [root]; // for ObjectPool.restoreToScene
    scene.add(root);
    this.meshes = [root];
  }

  /** Reposition a pool instance for a new spawn — re-randomizes colors, zero allocs. */
  resetAt(si, x, z, walkDir, roadAngle, pathY) {
    this.si       = si;
    this.x        = x;
    this.z        = z;
    this._pathY   = pathY;
    this._fx      = Math.sin(roadAngle) * walkDir;
    this._fz      = -Math.cos(roadAngle) * walkDir;
    this._speed   = 0.7 + Math.random() * 0.8;
    this._phase   = Math.random() * Math.PI * 2;
    this._wx      = x;
    this._wz      = z;
    this._ragdoll = false;
    this._vx = 0; this._vy = 0; this._vz = 0;
    // Re-randomize appearance on existing materials (color.setHex = no new alloc)
    this._mats[0].color.setHex(_pick(_SKIN));
    this._mats[1].color.setHex(_pick(_TOPS));
    this._mats[2].color.setHex(_pick(_PANTS));
    this._mats[3].color.setHex(_pick(_SHOES));
    this._root.position.set(x, pathY + 0.46, z);
    this._root.rotation.set(0, Math.atan2(this._fx, this._fz), 0);
    this._root.scale.setScalar(0.86 + Math.random() * 0.28);
    this.meshes = [this._root];
    return this;
  }

  ragdoll(speed, dirX, dirZ) {
    if (this._ragdoll) return;
    this._ragdoll = true;
    this._vx = dirX * speed * 200;
    this._vy = (4 + Math.random() * 8) + speed * 55;
    this._vz = dirZ * speed * 200;
    this._tumbleX = (Math.random() - 0.5) * 12;
    this._tumbleZ = (Math.random() - 0.5) * 12;
  }

  update(dt, _carX, _carZ, _cSeg) {
    if (this._ragdoll) {
      this._vy -= 16 * dt;
      this._wx += this._vx * dt;
      this._wz += this._vz * dt;
      const floor = this._pathY + 0.3;
      let ny = this._root.position.y + this._vy * dt;
      if (ny <= floor) {
        ny = floor;
        this._vy = 0;
        this._vx *= Math.max(0, 1 - 8 * dt);
        this._vz *= Math.max(0, 1 - 8 * dt);
      } else {
        this._vx *= (1 - 0.8 * dt);
        this._vz *= (1 - 0.8 * dt);
      }
      this._root.position.set(this._wx, ny, this._wz);
      this._root.rotation.x += this._tumbleX * dt;
      this._root.rotation.z += this._tumbleZ * dt;
      this._tumbleX *= (1 - 4 * dt);
      this._tumbleZ *= (1 - 4 * dt);
      return;
    }
    this._phase += dt * this._speed * 3.2;
    const sw = Math.sin(this._phase);
    // Legs alternate; arms cross-swing (opposite side)
    this._lHip.rotation.x       =  sw * 0.52;
    this._rHip.rotation.x       = -sw * 0.52;
    this._lShoulder.rotation.x  = -sw * 0.32;
    this._rShoulder.rotation.x  =  sw * 0.32;
    // Advance position
    this._wx += this._fx * this._speed * dt;
    this._wz += this._fz * this._speed * dt;
    this._root.position.x = this._wx;
    this._root.position.z = this._wz;
  }

  dispose() {
    // Pool-managed: park off-screen via _poolRelease, keep geometry + materials.
    if (this._poolRelease) { this._poolRelease(); return; }
    // Non-pooled: full teardown (geometry is shared — skip geo dispose).
    for (const m of this._mats) m.dispose();
    this.scene.remove(this._root);
    this.meshes = [];
  }
}

// ── Neon Cube (Level 2) ─────────────────────────────────────────────────────
// Shared geometry + materials — every instance is the same size and colour.
const _neonCubeGeo  = new THREE.BoxGeometry(2.5, 2.5, 2.5);
const _neonEdgeGeo  = new THREE.EdgesGeometry(_neonCubeGeo);
const _neonBodyMat  = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.8, metalness: 0.05 });
const _neonEdgeMat  = new THREE.LineBasicMaterial({ color: 0x00ff88 });

export class NeonCubeObstacle extends Obstacle {
  constructor(scene, si, x, y, z, angle, lightPool = null) {
    super(scene, si, x, z);

    const body = new THREE.Mesh(_neonCubeGeo, _neonBodyMat);
    body.position.set(x, y, z);
    body.rotation.y = angle;

    const edges = new THREE.LineSegments(_neonEdgeGeo, _neonEdgeMat);
    edges.position.set(x, y, z);
    edges.rotation.y = angle;

    scene.add(body, edges);
    this.meshes = [body, edges];

    // Use pool if provided (L2) so light count stays constant; else create directly (fallback).
    if (lightPool) {
      this._poolSlot = lightPool.acquirePoint(x, y, z);
      this._lightPool = lightPool;
    } else {
      const pl = new THREE.PointLight(0x00ff88, 110, 10, 2);
      pl.position.set(x, y, z);
      scene.add(pl);
      this.meshes.push(pl);
      this._poolSlot = null;
      this._lightPool = null;
    }
  }

  // Shared geometries/materials must not be disposed — just remove from scene.
  dispose() {
    if (this._poolSlot) this._lightPool.release(this._poolSlot);
    for (const m of this.meshes) this.scene.remove(m);
    this.meshes = [];
  }
}

// ── Oil Spray (toxic zone nozzle) ───────────────────────────────────────────
const _nozzleMat = new THREE.MeshLambertMaterial({ color: 0x3a3020 });
const _nozzleTipOff = new THREE.MeshBasicMaterial({ color: 0x556600 });
const _nozzleTipOn  = new THREE.MeshBasicMaterial({ color: 0xaaff00 });
const _slickMat = () => new THREE.MeshBasicMaterial({
  color: 0x111a02, transparent: true, opacity: 0, depthWrite: false,
});

export class OilSprayObstacle extends Obstacle {
  constructor(scene, si, x, z, pathY = 0, onHit = null) {
    super(scene, si, x, z);
    this._pathY    = pathY;
    this._onHit    = onHit;
    this._timer    = Math.random() * 7;   // desync starts
    this._active   = false;
    this._slicks   = [];
    this._spawnT   = 0;
    this._hitCD    = 0;

    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 1.2, 6), _nozzleMat);
    nozzle.position.set(x, pathY + 0.6, z);
    scene.add(nozzle);
    this._tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 5, 4), _nozzleTipOff.clone());
    this._tip.position.set(x, pathY + 1.32, z);
    scene.add(this._tip);
    this.meshes = [nozzle, this._tip];
  }

  update(dt, carX, carZ) {
    this._timer  += dt;
    this._hitCD  -= dt;
    const tCycle  = this._timer % 7.0;
    const wasOn   = this._active;
    this._active  = tCycle < 2.0;
    this._tip.material.color.set(this._active ? 0xaaff00 : 0x556600);

    // Spawn slicks while spraying
    if (this._active) {
      this._spawnT += dt;
      if (this._spawnT > 0.32) {
        this._spawnT = 0;
        const r   = 1.8 + Math.random() * 1.6;
        const geo = new THREE.CircleGeometry(r, 12);
        const mat = _slickMat();
        const m   = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(
          this.x + (Math.random()-0.5) * 7,
          this._pathY + 0.48,
          this.z + (Math.random()-0.5) * 7
        );
        m.renderOrder = 2;
        this.scene.add(m);
        this.meshes.push(m);
        this._slicks.push({ m, mat, life: 1.0, fadingIn: true });
      }
      // Hit detection
      if (this._hitCD <= 0) {
        const d2 = (carX - this.x) ** 2 + (carZ - this.z) ** 2;
        if (d2 < 49) { this._onHit?.(); this._hitCD = 0.5; }
      }
    } else {
      this._spawnT = 0;
    }

    // Animate slick opacity
    for (let i = this._slicks.length - 1; i >= 0; i--) {
      const sl = this._slicks[i];
      if (sl.fadingIn) {
        sl.mat.opacity = Math.min(0.62, sl.mat.opacity + dt * 2.2);
        if (sl.mat.opacity >= 0.62) sl.fadingIn = false;
      } else {
        sl.life -= dt / 4.5;
        sl.mat.opacity = Math.max(0, sl.life * 0.62);
        if (sl.life <= 0) {
          this.scene.remove(sl.m);
          sl.m.geometry.dispose();
          sl.mat.dispose();
          const idx = this.meshes.indexOf(sl.m);
          if (idx !== -1) this.meshes.splice(idx, 1);
          this._slicks.splice(i, 1);
        }
      }
    }
  }

  dispose() {
    for (const sl of this._slicks) {
      this.scene.remove(sl.m);
      sl.m.geometry.dispose();
      sl.mat.dispose();
    }
    this._slicks = [];
    this._tip.material.dispose();
    super.dispose();
  }
}

// ── Warmup material for OilSpill shader ─────────────────────────────────────
// Identical source to OilSpillObstacle's ShaderMaterial — Three.js reuses the
// compiled GL program for all instances with matching vertex/fragment source.
const _oilWarmupMat = new THREE.ShaderMaterial({
  vertexShader: OIL_VS, fragmentShader: OIL_FS,
  uniforms: { uTime: { value: 0 }, uSunDir: { value: _sunDir } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});

// Materials that need shader warmup — kept resident by invisible meshes.
// Add any new obstacle material here to prevent mid-game shader compile spikes.
export const WARMUP_MATS = [
  _mhMat, _mhRingMat, _mhHoleMat,
  _neonBodyMat, _neonEdgeMat,
  _nozzleMat, _nozzleTipOff,
  _oilWarmupMat,
];
