import * as THREE from 'three';

// ── Shared materials ───────────────────────────────────────────────────────────
const _steelMat = new THREE.MeshPhongMaterial({ color: 0x252830, flatShading: true });
const _rustMat  = new THREE.MeshPhongMaterial({ color: 0x4a2e1a, flatShading: true });
const _concMat  = new THREE.MeshPhongMaterial({ color: 0x1c1c18, flatShading: true });
const _tankMat  = new THREE.MeshPhongMaterial({ color: 0x2c3028, flatShading: true });
const _pipeMat  = new THREE.MeshPhongMaterial({ color: 0x363840, flatShading: true });
const _warnMat  = new THREE.MeshBasicMaterial({ color: 0xff8800 }); // amber beacon

export const SCENERY_WARMUP_MATS = [_steelMat, _rustMat, _concMat, _tankMat, _pipeMat, _warnMat];

const _up = new THREE.Vector3(0, 1, 0);

// ── Pipe utility ───────────────────────────────────────────────────────────────
function _pipe(scene, ax, ay, az, bx, by, bz, r, meshes) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.05) return;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), _pipeMat);
  mesh.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  if (Math.abs(_up.dot(dir)) < 0.9999) {
    mesh.quaternion.setFromUnitVectors(_up, dir);
  } else if (dir.y < 0) {
    mesh.rotation.z = Math.PI;
  }
  scene.add(mesh);
  meshes.push(mesh);
}

// ── RefineryBuilding ──────────────────────────────────────────────────────────
// Dense modular factory block. Fills ~90% of the space close to road edge.
// Convention: BoxGeometry(xLen, yLen, zLen) with rotation.y = ang →
//   xLen spans along road (forward), zLen spans laterally (perpendicular).
export class RefineryBuilding {
  constructor(scene, ox, oz, groundY, angle, side) {
    this._scene  = scene;
    this.meshes  = [];
    this._build(ox, oz, groundY, angle, side);
  }

  _build(ox, oz, gY, ang, side) {
    const S  = this._scene, mx = this.meshes;
    const fx = Math.sin(ang), fz = -Math.cos(ang);   // forward along road
    const px = Math.cos(ang), pz =  Math.sin(ang);   // lateral

    const add = (geo, mat, wx, wy, wz, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(wx, wy, wz);
      if (ry) m.rotation.y = ry;
      S.add(m); mx.push(m);
      return m;
    };

    const w = 12;                           // width along road (X dim)
    const d = 18 + Math.random() * 4;      // depth laterally into toxic zone (Z dim)
    const h = 10 + Math.random() * 10;     // building height

    // Center: road edge (7m hw) + 1m buffer + half depth
    const latCenter = 8 + d * 0.5;
    const cx = ox + px * side * latCenter;
    const cz = oz + pz * side * latCenter;

    // Foundation slab
    add(new THREE.BoxGeometry(w, 0.7, d), _concMat, cx, gY + 0.35, cz, ang);

    // Main body
    add(new THREE.BoxGeometry(w - 0.4, h, d - 0.5), _steelMat, cx, gY + 0.7 + h * 0.5, cz, ang);

    // Roof parapet cap
    add(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), _rustMat, cx, gY + 0.7 + h + 0.2, cz, ang);

    // Window strip panels on road-facing facade (inner lateral face)
    const facadeX = cx - px * side * (d * 0.5 - 0.12);
    const facadeZ = cz - pz * side * (d * 0.5 - 0.12);
    for (const fy of [0.28, 0.60]) {
      add(new THREE.BoxGeometry(w - 2, 1.1, 0.2), _rustMat,
        facadeX, gY + 0.7 + h * fy, facadeZ, ang);
    }

    // Chimney stack (random along-road offset)
    const stkFwd = (Math.random() - 0.5) * 7;
    const stkX   = cx + fx * stkFwd, stkZ = cz + fz * stkFwd;
    const stkH   = h * 0.5 + 3;
    add(new THREE.CylinderGeometry(0.22, 0.28, stkH, 6), _steelMat,
      stkX, gY + 0.7 + h + stkH * 0.5, stkZ);
    add(new THREE.CylinderGeometry(0.36, 0.22, 0.4, 6), _steelMat,
      stkX, gY + 0.7 + h + stkH + 0.2, stkZ);

    // Amber warning beacon above chimney
    add(new THREE.SphereGeometry(0.24, 5, 4), _warnMat,
      stkX, gY + 0.7 + h + stkH + 0.65, stkZ);

    // Exterior pipe: vertical up the road-side facade, then horizontal elbow inward
    const pFwd = (Math.random() - 0.5) * 5;
    const pX   = facadeX + fx * pFwd, pZ = facadeZ + fz * pFwd;
    const pipeTopY = gY + h * 0.65;
    _pipe(S, pX, gY + 1.2, pZ, pX, pipeTopY, pZ, 0.14, mx);
    // Elbow: horizontal toward building (inward)
    const elbX = cx + px * side * (latCenter - 3);
    const elbZ = cz + pz * side * (latCenter - 3);
    _pipe(S, pX, pipeTopY, pZ, elbX, pipeTopY, elbZ, 0.14, mx);
  }
}

// ── LargePipeRun ──────────────────────────────────────────────────────────────
// Bundle of 3 large horizontal pipes running parallel to the road, with pylons.
// Sits just outside the road edge, stacked at 3.8 / 5.6 / 7.4 m.
export class LargePipeRun {
  constructor(scene, ox, oz, groundY, angle, side, segLen = 13) {
    this._scene = scene;
    this.meshes = [];
    this._build(ox, oz, groundY, angle, side, segLen);
  }

  _build(ox, oz, gY, ang, side, segLen) {
    const S  = this._scene, mx = this.meshes;
    const fx = Math.sin(ang), fz = -Math.cos(ang);
    const px = Math.cos(ang), pz =  Math.sin(ang);

    const add = (geo, mat, wx, wy, wz, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(wx, wy, wz);
      if (ry) m.rotation.y = ry;
      S.add(m); mx.push(m);
      return m;
    };

    // Pipe run lateral offset: just outside road edge (hw=7 + 1m buffer = 8m)
    const lat = 8.2;
    const halfLen = segLen * 0.5;

    // Start/end of pipe run
    const ax = ox - fx * halfLen + px * side * lat;
    const az = oz - fz * halfLen + pz * side * lat;
    const bx = ox + fx * halfLen + px * side * lat;
    const bz = oz + fz * halfLen + pz * side * lat;

    // 3 pipes stacked at increasing heights
    const pipeSpecs = [
      { r: 0.55, y: gY + 3.8 },
      { r: 0.38, y: gY + 5.6 },
      { r: 0.25, y: gY + 7.4 },
    ];
    for (const { r, y } of pipeSpecs) {
      _pipe(S, ax, y, az, bx, y, bz, r, mx);
    }

    // Support pylons at segment start, midpoint, end
    for (const t of [0, 0.5, 1]) {
      const pylonX = ax + (bx - ax) * t;
      const pylonZ = az + (bz - az) * t;
      const pylonH = 8.0;

      // Vertical post
      add(new THREE.CylinderGeometry(0.12, 0.16, pylonH, 5), _steelMat,
        pylonX, gY + pylonH * 0.5, pylonZ);

      // Cap sphere at top
      add(new THREE.SphereGeometry(0.22, 5, 4), _steelMat, pylonX, gY + pylonH, pylonZ);

      // Pipe saddle block at each pipe level
      for (const { r, y } of pipeSpecs) {
        add(new THREE.BoxGeometry(0.28, 0.18, 0.28), _steelMat, pylonX, y + r + 0.09, pylonZ);
      }
    }
  }
}

// ── RoadCatwalk ───────────────────────────────────────────────────────────────
// Industrial walkway bridge spanning the full road at ~14m height.
// Two structural pylons anchor each side with observation platforms.
export class RoadCatwalk {
  constructor(scene, ox, oz, groundY, angle, roadWidth) {
    this._scene = scene;
    this.meshes = [];
    this._build(ox, oz, groundY, angle, roadWidth);
  }

  _build(ox, oz, gY, ang, RW) {
    const S  = this._scene, mx = this.meshes;
    const fx = Math.sin(ang), fz = -Math.cos(ang);
    const px = Math.cos(ang), pz =  Math.sin(ang);

    const add = (geo, mat, wx, wy, wz, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(wx, wy, wz);
      if (ry) m.rotation.y = ry;
      S.add(m); mx.push(m);
      return m;
    };

    const pylonH   = 14;
    const walkY    = gY + pylonH;
    const pylonLat = RW * 0.5 + 1.1 + 2.5;  // past kerb + margin
    const span     = pylonLat * 2;            // full lateral walkway span

    // Pylons — one on each side
    for (const side of [-1, 1]) {
      const pylonX = ox + px * side * pylonLat;
      const pylonZ = oz + pz * side * pylonLat;

      // Main column
      add(new THREE.CylinderGeometry(0.34, 0.42, pylonH, 7), _steelMat,
        pylonX, gY + pylonH * 0.5, pylonZ);

      // Observation platform (oriented along road = X dim)
      add(new THREE.BoxGeometry(4.5, 0.28, 2.8), _rustMat, pylonX, walkY + 0.14, pylonZ, ang);

      // Platform railing posts (at -1.8, 0, +1.8 m along road from pylon)
      for (const fOff of [-1.8, 0, 1.8]) {
        add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4), _steelMat,
          pylonX + fx * fOff, walkY + 0.28 + 0.55, pylonZ + fz * fOff);
      }

      // Top railing bar
      add(new THREE.BoxGeometry(4.5, 0.06, 0.06), _steelMat, pylonX, walkY + 1.18, pylonZ, ang);

      // Amber hazard beacon
      add(new THREE.SphereGeometry(0.22, 5, 4), _warnMat, pylonX, walkY + 1.6, pylonZ);

      // Diagonal brace pipe outward from column
      const braceEndX = pylonX + px * side * 4.5;
      const braceEndZ = pylonZ + pz * side * 4.5;
      _pipe(S, pylonX, gY + pylonH * 0.58, pylonZ, braceEndX, gY + pylonH * 0.78, braceEndZ, 0.10, mx);
    }

    // Horizontal walkway bridge (Z dim = span = lateral)
    add(new THREE.BoxGeometry(2.6, 0.22, span), _steelMat, ox, walkY + 0.11, oz, ang);

    // Walkway surface grating (slightly narrower, raised)
    add(new THREE.BoxGeometry(2.2, 0.06, span - 0.6), _rustMat, ox, walkY + 0.22, oz, ang);

    // Side handrails running along the walkway length (Z dim = span)
    for (const fOff of [-1.08, 1.08]) {
      add(new THREE.BoxGeometry(0.06, 1.0, span), _steelMat,
        ox + fx * fOff, walkY + 0.72, oz + fz * fOff, ang);
    }

    // Handrail vertical posts every ~5m along walkway (at road-forward offsets)
    for (const fOff of [-1.08, 1.08]) {
      for (const wsOff of [-span * 0.35, 0, span * 0.35]) {
        // wsOff is lateral offset — but we need to place post in world space
        // lateral offset in world: px * wsOff, pz * wsOff
        const postX = ox + fx * fOff + px * wsOff;
        const postZ = oz + fz * fOff + pz * wsOff;
        add(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), _steelMat, postX, walkY + 0.72, postZ);
      }
    }
  }
}

// ── HoldingTankPair ───────────────────────────────────────────────────────────
// Two large cylindrical storage tanks placed 25m from road center with berm.
export class HoldingTankPair {
  constructor(scene, ox, oz, groundY, angle, side) {
    this._scene = scene;
    this.meshes = [];
    this._build(ox, oz, groundY, angle, side);
  }

  _build(ox, oz, gY, ang, side) {
    const S  = this._scene, mx = this.meshes;
    const fx = Math.sin(ang), fz = -Math.cos(ang);
    const px = Math.cos(ang), pz =  Math.sin(ang);

    const add = (geo, mat, wx, wy, wz, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(wx, wy, wz);
      if (ry) m.rotation.y = ry;
      S.add(m); mx.push(m);
      return m;
    };

    // Pair center: 25m from road center (mid toxic zone depth)
    const latCenter = 25;
    const cx = ox + px * side * latCenter;
    const cz = oz + pz * side * latCenter;

    // Tank A — forward along road, larger
    const rA = 5.5, hA = 12;
    const tAX = cx + fx * 9, tAZ = cz + fz * 9;
    add(new THREE.CylinderGeometry(rA, rA, hA, 14), _tankMat, tAX, gY + hA * 0.5, tAZ);
    // Dome cap
    add(new THREE.SphereGeometry(rA, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), _tankMat, tAX, gY + hA, tAZ);
    // Access ladder strip
    add(new THREE.BoxGeometry(0.15, hA, 0.12), _steelMat, tAX + rA + 0.1, gY + hA * 0.5, tAZ);
    // Platform ring at mid height
    add(new THREE.TorusGeometry(rA + 0.35, 0.1, 4, 14), _steelMat, tAX, gY + hA * 0.55, tAZ).rotation.x = Math.PI / 2;

    // Tank B — behind along road, slightly shorter and wider
    const rB = 6, hB = 10;
    const tBX = cx - fx * 9, tBZ = cz - fz * 9;
    add(new THREE.CylinderGeometry(rB, rB, hB, 14), _tankMat, tBX, gY + hB * 0.5, tBZ);
    add(new THREE.SphereGeometry(rB, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), _tankMat, tBX, gY + hB, tBZ);
    add(new THREE.BoxGeometry(0.15, hB, 0.12), _steelMat, tBX + rB + 0.1, gY + hB * 0.5, tBZ);
    add(new THREE.TorusGeometry(rB + 0.35, 0.1, 4, 14), _steelMat, tBX, gY + hB * 0.5, tBZ).rotation.x = Math.PI / 2;

    // Connecting pipe between tanks (mid-height)
    _pipe(S, tAX, gY + 5, tAZ, tBX, gY + 5, tBZ, 0.22, mx);

    // Ground drain pipe from Tank B toward road
    const drainEndX = tBX - px * side * 4, drainEndZ = tBZ - pz * side * 4;
    _pipe(S, tBX, gY + 1.5, tBZ, drainEndX, gY + 1.5, drainEndZ, 0.16, mx);

    // Amber beacon on Tank A dome
    add(new THREE.SphereGeometry(0.24, 5, 4), _warnMat, tAX, gY + hA + rA * 0.35 + 0.5, tAZ);

    // Containment berm — 4 low concrete walls forming a rectangle
    // Road-forward half-extent of berm, lateral half-extent
    const bFH = 13, bLH = 9;
    const bermY = gY + 0.6;

    // Front wall (road-side, inner face)
    const frontX = cx - px * side * bLH, frontZ = cz - pz * side * bLH;
    add(new THREE.BoxGeometry(bFH * 2, 1.2, 1.1), _concMat, frontX, bermY, frontZ, ang);

    // Back wall
    const backX = cx + px * side * bLH, backZ = cz + pz * side * bLH;
    add(new THREE.BoxGeometry(bFH * 2, 1.2, 1.1), _concMat, backX, bermY, backZ, ang);

    // End walls (at ±fwd half, lateral span = bLH * 2 as Z dim)
    for (const fSign of [-1, 1]) {
      const ewX = cx + fx * fSign * bFH, ewZ = cz + fz * fSign * bFH;
      add(new THREE.BoxGeometry(1.1, 1.2, bLH * 2), _concMat, ewX, bermY, ewZ, ang);
    }
  }
}
