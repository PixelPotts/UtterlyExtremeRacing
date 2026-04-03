import * as THREE from 'three';

// ── Shared materials ──────────────────────────────────────────────────────────
const _steelMat  = new THREE.MeshPhongMaterial({ color: 0x252830, flatShading: true });
const _rustMat   = new THREE.MeshPhongMaterial({ color: 0x4a2e1a, flatShading: true });
const _concMat   = new THREE.MeshPhongMaterial({ color: 0x1c1c18, flatShading: true });
const _tankMat   = new THREE.MeshPhongMaterial({ color: 0x2c3028, flatShading: true });
const _pipeMat   = new THREE.MeshPhongMaterial({ color: 0x363840, flatShading: true });
const _plankMat  = new THREE.MeshLambertMaterial({ color: 0x3d2a18 });
const _yellowMat = new THREE.MeshLambertMaterial({ color: 0xFFCC00 });
const _blackMat  = new THREE.MeshLambertMaterial({ color: 0x0f0f0f });
const _up = new THREE.Vector3(0, 1, 0);

// ── Pipe between two world points ─────────────────────────────────────────────
function _pipe(scene, ax, ay, az, bx, by, bz, r, meshes) {
  const dx = bx-ax, dy = by-ay, dz = bz-az;
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (len < 0.05) return;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), _pipeMat);
  mesh.position.set((ax+bx)*0.5, (ay+by)*0.5, (az+bz)*0.5);
  const dir = new THREE.Vector3(dx/len, dy/len, dz/len);
  if (Math.abs(_up.dot(dir)) < 0.9999) {
    mesh.quaternion.setFromUnitVectors(_up, dir);
  } else if (dir.y < 0) {
    mesh.rotation.z = Math.PI;
  }
  scene.add(mesh);
  meshes.push(mesh);
}

// ── Worker (walk-in-place on scaffolding) ─────────────────────────────────────
class Worker {
  constructor(scene, x, y, z, meshes) {
    this._phase = Math.random() * Math.PI * 2;
    const root  = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.y = Math.random() * Math.PI * 2;

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), _blackMat);
    head.position.y = 1.58;
    root.add(head);

    // Hardhat
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.17, 7), _yellowMat);
    hatTop.position.y = 1.78; root.add(hatTop);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10), _yellowMat);
    brim.position.y = 1.70; root.add(brim);

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.50, 6), _blackMat);
    torso.position.y = 1.08; root.add(torso);

    // Vest stripe (yellow)
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.05), _yellowMat);
    vest.position.set(0, 1.10, 0.15); root.add(vest);
    const vest2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.05), _yellowMat);
    vest2.position.set(0, 1.10, -0.15); root.add(vest2);

    // Legs
    this._lHip = new THREE.Group(); this._lHip.position.set(-0.08, 0.82, 0);
    this._rHip = new THREE.Group(); this._rHip.position.set( 0.08, 0.82, 0);
    const mkLeg = () => {
      const g = new THREE.Group();
      g.add(Object.assign(
        new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.68, 5), _blackMat),
        { position: new THREE.Vector3(0, -0.34, 0) }
      ));
      return g;
    };
    this._lHip.add(mkLeg()); this._rHip.add(mkLeg());
    root.add(this._lHip, this._rHip);

    // Arms
    this._lShoulder = new THREE.Group(); this._lShoulder.position.set(-0.19, 1.30, 0);
    this._rShoulder = new THREE.Group(); this._rShoulder.position.set( 0.19, 1.30, 0);
    const mkArm = () => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.38, 5), _blackMat);
      arm.position.y = -0.19;
      return arm;
    };
    this._lShoulder.add(mkArm()); this._rShoulder.add(mkArm());
    root.add(this._lShoulder, this._rShoulder);

    this._root = root;
    scene.add(root);
    meshes.push(root);
  }

  update(dt) {
    this._phase += dt * 2.0;
    const sw = Math.sin(this._phase);
    this._lHip.rotation.x      =  sw * 0.38;
    this._rHip.rotation.x      = -sw * 0.38;
    this._lShoulder.rotation.x = -sw * 0.24;
    this._rShoulder.rotation.x =  sw * 0.24;
  }
}

// ── Refinery ──────────────────────────────────────────────────────────────────
export class Refinery {
  constructor(scene, x, z, groundY, roadAngle) {
    this._scene   = scene;
    this._x       = x;
    this._z       = z;
    this._groundY = groundY;
    this._angle   = roadAngle;
    this._meshes  = [];
    this._workers = [];
    this._flames  = [];  // { light, cone, t }
    this._smokes  = [];  // { mesh, mat, t, vy, driftX, driftZ }
    this._smokeTimer = 0;
    this._build();
  }

  _build() {
    const S = this._scene, gY = this._groundY;
    const mx = this._meshes;
    const ang = this._angle;
    const fx = Math.sin(ang), fz = -Math.cos(ang);  // road forward
    const px = Math.cos(ang), pz =  Math.sin(ang);  // lateral
    const ox = this._x, oz = this._z;

    const add = (geo, mat, wx, wy, wz, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(wx, wy, wz);
      if (ry) m.rotation.y = ry;
      S.add(m); mx.push(m);
      return m;
    };

    // ── Foundation slabs ───────────────────────────────────────────────────
    for (let i = -1; i <= 1; i++) {
      add(new THREE.BoxGeometry(14, 0.6, 10), _concMat,
        ox + fx*i*16, gY + 0.3, oz + fz*i*16, ang);
    }

    // ── Storage tanks ──────────────────────────────────────────────────────
    const tankOffsets = [[-14, 10], [0, 8], [14, 12]];
    for (const [fOff, pOff] of tankOffsets) {
      const r = 3.2 + Math.random() * 0.8;
      const h = 7 + Math.random() * 3;
      const tx = ox + fx*fOff + px*pOff, tz = oz + fz*fOff + pz*pOff;
      add(new THREE.CylinderGeometry(r, r, h, 12), _tankMat, tx, gY + h*0.5, tz);
      add(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI*2, 0, Math.PI/2), _tankMat, tx, gY + h, tz);
      // Ladder strip
      add(new THREE.BoxGeometry(0.15, h, 0.12), _steelMat, tx + r + 0.1, gY + h*0.5, tz);
    }

    // ── 3 Distillation columns ─────────────────────────────────────────────
    const colData = [];
    const colFOffsets = [-18, 0, 18];
    for (let ci = 0; ci < 3; ci++) {
      const fOff = colFOffsets[ci];
      const cx = ox + fx*fOff, cz = oz + fz*fOff;
      const ch = 28 + ci * 3;
      colData.push({ cx, cz, ch });

      // Tower
      add(new THREE.CylinderGeometry(1.3, 1.7, ch, 8), _steelMat, cx, gY + ch*0.5, cz);
      // Top dome
      add(new THREE.SphereGeometry(1.4, 8, 5, 0, Math.PI*2, 0, Math.PI/2), _steelMat, cx, gY + ch, cz);

      // Platform rings at 1/3, 2/3, 5/6 height
      for (const frac of [0.33, 0.60, 0.82]) {
        const ry = gY + ch * frac;
        add(new THREE.TorusGeometry(2.1, 0.11, 4, 14), _steelMat, cx, ry, cz).rotation.x = Math.PI/2;
        add(new THREE.CylinderGeometry(2.1, 2.1, 0.07, 10), _rustMat, cx, ry + 0.04, cz);
      }

      // ── Flare stack + flame ───────────────────────────────────────────────
      const stkH = 7;
      const stkX = cx + (Math.random()-0.5)*2.5, stkZ = cz + (Math.random()-0.5)*2.5;
      add(new THREE.CylinderGeometry(0.15, 0.22, stkH, 5), _steelMat, stkX, gY + ch + stkH*0.5, stkZ);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.85, depthWrite: false });
      const flameCone = add(new THREE.ConeGeometry(0.9, 3.0, 7), flameMat, stkX, gY + ch + stkH + 1.5, stkZ);
      const flameLight = new THREE.PointLight(0xff6600, 14, 40);
      flameLight.position.set(stkX, gY + ch + stkH + 2.0, stkZ);
      S.add(flameLight); mx.push(flameLight);
      this._flames.push({ light: flameLight, cone: flameCone, mat: flameMat, t: Math.random() * Math.PI * 2 });
    }

    // ── 2 Freestanding tall flare stacks ──────────────────────────────────
    const freeStacks = [{ fOff: -28, pOff: 6, h: 20 }, { fOff: 28, pOff: 4, h: 24 }];
    for (const { fOff, pOff, h } of freeStacks) {
      const sx = ox + fx*fOff + px*pOff, sz = oz + fz*fOff + pz*pOff;
      add(new THREE.CylinderGeometry(0.17, 0.28, h, 5), _steelMat, sx, gY + h*0.5, sz);
      // Cross brace
      add(new THREE.CylinderGeometry(0.06, 0.06, 8, 4), _steelMat, sx, gY + h*0.4, sz).rotation.z = 0.35;
      const fMat = new THREE.MeshBasicMaterial({ color: 0xff9900, transparent: true, opacity: 0.85, depthWrite: false });
      const fCone = add(new THREE.ConeGeometry(1.1, 3.5, 7), fMat, sx, gY + h + 1.75, sz);
      const fLight = new THREE.PointLight(0xff7700, 18, 55);
      fLight.position.set(sx, gY + h + 2.5, sz);
      S.add(fLight); mx.push(fLight);
      this._flames.push({ light: fLight, cone: fCone, mat: fMat, t: Math.random() * Math.PI * 2 + 1.5 });
    }

    // ── Plumbing network ──────────────────────────────────────────────────
    const { cx: c0x, cz: c0z, ch: c0h } = colData[0];
    const { cx: c1x, cz: c1z, ch: c1h } = colData[1];
    const { cx: c2x, cz: c2z, ch: c2h } = colData[2];
    const nodes = [
      [ox,              gY + 3.5, oz],
      [c0x, gY + c0h * 0.35, c0z],
      [c1x, gY + c1h * 0.35, c1z],
      [c2x, gY + c2h * 0.35, c2z],
      [c0x, gY + c0h * 0.62, c0z],
      [c1x, gY + c1h * 0.62, c1z],
      [ox + fx*8,  gY + 8,  oz + fz*8],
      [ox + px*9,  gY + 5,  oz + pz*9],
      [ox - fx*8,  gY + 6,  oz - fz*8],
    ];
    const pipes = [
      [0,1,0.18],[0,2,0.20],[0,3,0.18],[1,2,0.14],[2,3,0.14],
      [1,4,0.12],[2,5,0.12],[4,5,0.14],[0,6,0.16],[0,7,0.18],
      [6,2,0.12],[7,3,0.12],[3,8,0.16],[8,0,0.14],[5,7,0.10],
    ];
    for (const [ai, bi, r] of pipes) {
      const [ax,ay,az] = nodes[ai], [bx,by,bz] = nodes[bi];
      _pipe(S, ax, ay, az, bx, by, bz, r, mx);
      // Elbow joint node
      add(new THREE.SphereGeometry(r * 1.4, 5, 4), _pipeMat, (ax+bx)*0.5, (ay+by)*0.5, (az+bz)*0.5);
    }

    // ── Scaffolding ───────────────────────────────────────────────────────
    const scafLevels = [gY + 10, gY + 19];
    const scafSpan   = 36;
    for (const sLevel of scafLevels) {
      // Main horizontal beam along road
      add(new THREE.BoxGeometry(scafSpan, 0.13, 0.13), _steelMat, ox, sLevel, oz, ang);
      // Cross member (perpendicular to road)
      add(new THREE.BoxGeometry(0.13, 0.13, 10), _steelMat, ox, sLevel, oz, ang);

      // Vertical posts every 6m along road
      for (let i = -2; i <= 2; i++) {
        const postX = ox + fx*i*6, postZ = oz + fz*i*6;
        add(new THREE.CylinderGeometry(0.09, 0.09, 3.8, 4), _steelMat, postX, sLevel - 1.9, postZ);
        // Plank
        add(new THREE.BoxGeometry(5.8, 0.07, 0.90), _plankMat, postX, sLevel + 0.04, postZ, ang);
      }

      // Diagonal cross-braces
      for (let i = -2; i < 2; i++) {
        const braceX = ox + fx*(i*6 + 3), braceZ = oz + fz*(i*6 + 3);
        add(new THREE.BoxGeometry(6.5, 0.08, 0.08), _steelMat, braceX, sLevel - 1.5, braceZ, ang + 0.5);
      }
    }

    // ── Workers on scaffolding ────────────────────────────────────────────
    const workerY = scafLevels[0] + 0.12;
    const wSpots = [
      [ox,            workerY, oz],
      [ox + fx*10,    workerY, oz + fz*10],
      [ox - fx*10,    workerY, oz - fz*10],
      [ox + fx*6,  scafLevels[1] + 0.12, oz + fz*6],
      [ox - fx*6,  scafLevels[1] + 0.12, oz - fz*6],
    ];
    for (const [wx, wy, wz] of wSpots) {
      this._workers.push(new Worker(S, wx, wy - 0.46, wz, mx));
    }

    // Store smoke origins (column tops)
    this._smokeOrigins = colData.map(({ cx, cz, ch }) => ({
      x: cx, y: gY + ch + 1.5, z: cz,
    }));
  }

  // ── Spawn one smoke puff ──────────────────────────────────────────────────
  _spawnSmoke(origin) {
    const r   = 0.9 + Math.random() * 1.4;
    const geo = new THREE.SphereGeometry(r, 5, 4);
    const mat = new THREE.MeshLambertMaterial({ color: 0x484840, transparent: true, opacity: 0.55 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      origin.x + (Math.random()-0.5) * 2.5,
      origin.y,
      origin.z + (Math.random()-0.5) * 2.5
    );
    this._scene.add(mesh);
    this._meshes.push(mesh);
    return { mesh, mat, t: 0, vy: 2.0 + Math.random() * 2.8, dx: (Math.random()-0.5) * 0.6, dz: (Math.random()-0.5) * 0.6 };
  }

  // ── Update ────────────────────────────────────────────────────────────────
  update(dt, _cx, _cz, _cSeg) {
    // Flame flicker
    for (const fl of this._flames) {
      fl.t += dt * (4.5 + Math.random() * 4);
      const flk = 0.72 + 0.28 * Math.sin(fl.t * 3.2) + 0.10 * Math.sin(fl.t * 7.1);
      fl.light.intensity = 14 * flk;
      fl.cone.scale.y = 0.75 + 0.50 * flk;
      fl.mat.opacity   = 0.55 + 0.30 * flk;
    }

    // Workers walk-in-place
    for (const w of this._workers) w.update(dt);

    // Smoke puffs
    this._smokeTimer += dt;
    if (this._smokeTimer > 0.45) {
      this._smokeTimer = 0;
      for (const o of this._smokeOrigins) this._smokes.push(this._spawnSmoke(o));
    }
    for (let i = this._smokes.length - 1; i >= 0; i--) {
      const sp = this._smokes[i];
      sp.t += dt;
      sp.mesh.position.y += sp.vy  * dt;
      sp.mesh.position.x += sp.dx  * dt;
      sp.mesh.position.z += sp.dz  * dt;
      sp.mesh.scale.setScalar(1.0 + sp.t * 0.75);
      sp.mat.opacity = Math.max(0, 0.55 * (1.0 - sp.t / 6.5));
      if (sp.t > 6.5) {
        this._scene.remove(sp.mesh);
        sp.mesh.geometry.dispose();
        sp.mat.dispose();
        const idx = this._meshes.indexOf(sp.mesh);
        if (idx !== -1) this._meshes.splice(idx, 1);
        this._smokes.splice(i, 1);
      }
    }
  }

  // ── Dispose ───────────────────────────────────────────────────────────────
  dispose() {
    for (const sp of this._smokes) {
      this._scene.remove(sp.mesh);
      sp.mesh.geometry.dispose();
      sp.mat.dispose();
    }
    this._smokes = [];
    for (const fl of this._flames) fl.mat.dispose();
    for (const m of this._meshes) {
      this._scene.remove(m);
      if (m.isGroup) {
        m.traverse(c => { if (c.isMesh) c.geometry?.dispose(); });
      } else if (m.isMesh) {
        m.geometry?.dispose();
      }
    }
    this._meshes = [];
  }
}
