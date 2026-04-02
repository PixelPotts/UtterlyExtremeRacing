import * as THREE from 'three';
import { EnemyMovement } from './enemy.js';

// ── Person (truck thrower) ─────────────────────────────────────────────────────
function buildThrower() {
  const root     = new THREE.Group();
  const skinMat  = new THREE.MeshLambertMaterial({ color: 0xC8845A });
  const topMat   = new THREE.MeshLambertMaterial({ color: 0x2A3A55 });
  const pantMat  = new THREE.MeshLambertMaterial({ color: 0x1A1F30 });
  const shoeMat  = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 6), skinMat);
  head.position.y = 1.62;
  root.add(head);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.52, 7), topMat);
  torso.position.y = 1.10;
  root.add(torso);

  const lHip = new THREE.Group(); lHip.position.set(-0.09, 0.84, 0);
  const rHip = new THREE.Group(); rHip.position.set( 0.09, 0.84, 0);
  const mkLeg = () => {
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.050, 0.72, 6), pantMat);
    cyl.position.y = -0.36;
    g.add(cyl);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.26), shoeMat);
    shoe.position.set(0, -0.76, 0.04);
    g.add(shoe);
    return g;
  };
  lHip.add(mkLeg()); rHip.add(mkLeg());
  root.add(lHip, rHip);

  const lShoulder = new THREE.Group(); lShoulder.position.set(-0.20, 1.35, 0);
  const rShoulder = new THREE.Group(); rShoulder.position.set( 0.20, 1.35, 0);
  const mkArm = mat => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.40, 5), mat);
    arm.position.y = -0.20;
    return arm;
  };
  lShoulder.add(mkArm(topMat)); rShoulder.add(mkArm(topMat));
  root.add(lShoulder, rShoulder);

  return { root, lHip, rHip, lShoulder, rShoulder };
}

// ── BoxTruck ───────────────────────────────────────────────────────────────────
export class BoxTruck extends EnemyMovement {
  constructor(scene, path, spawnSeg, SLEN, { onExplosion = null } = {}) {
    super(scene, path, spawnSeg, SLEN, {
      color:    0xBBBBBB,
      topSpeed: 0.10,
    }, { onExplosion });
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  _buildBody() {
    const g       = this.group;
    const white   = new THREE.MeshLambertMaterial({ color: 0xDDDDDD });
    const dark    = new THREE.MeshLambertMaterial({ color: 0x131313 });
    const cabMat  = new THREE.MeshLambertMaterial({ color: 0xBBBBBB });
    const wheelMat= new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.0), cabMat);
    cab.position.set(0, 1.1, 2.2);
    cab.castShadow = true;
    g.add(cab);

    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 0.05), dark);
    ws.position.set(0, 1.65, 1.18);
    g.add(ws);

    // Box body — 5 slabs + recessed interior back wall
    const BW = 2.6, BH = 2.8, BD = 4.4, T = 0.08;
    const cz = -1.1;

    const slab = (sx, sy, sz, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), white);
      m.position.set(px, py, pz);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    };

    slab(T,  BH, BD,   BW/2, BH/2, cz);
    slab(T,  BH, BD,  -BW/2, BH/2, cz);
    slab(BW, T,  BD,   0,    BH,   cz);
    slab(BW, T,  BD,   0,    0,    cz);
    slab(BW, BH, T,    0,    BH/2, cz + BD/2);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(BW - T*2, BH - T*2, T), dark);
    backWall.position.set(0, BH/2, cz - BD/2 + 0.5);
    g.add(backWall);

    const lipT = 0.12;
    const rearZ = cz - BD/2;
    const lip = (sx, sy, px, py) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, lipT), dark);
      m.position.set(px, py, rearZ);
      g.add(m);
    };
    lip(BW, lipT, 0, BH);
    lip(BW, lipT, 0, 0);
    lip(lipT, BH, -BW/2, BH/2);
    lip(lipT, BH,  BW/2, BH/2);

    // Wheels
    const wg = new THREE.CylinderGeometry(0.52, 0.52, 0.50, 16);
    [[-1.35, 0.45, -2.4],[1.35, 0.45, -2.4],[-1.35, 0.45, 2.2],[1.35, 0.45, 2.2]].forEach(([x,y,z]) => {
      const w = new THREE.Mesh(wg, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, y, z);
      w.castShadow = true;
      g.add(w);
      this._wheels.push(w);
    });

    // Thrower person
    const { root, lHip, rHip, lShoulder, rShoulder } = buildThrower();
    root.position.set(0.25, 0.0, cz - BD/2 + 1.2);
    root.rotation.y = 0;
    g.add(root);

    this._lHip       = lHip;
    this._rHip       = rHip;
    this._lShoulder  = lShoulder;
    this._rShoulder  = rShoulder;
    this._personRoot = root;
  }

  // ── Animation hooks ───────────────────────────────────────────────────────
  _animateThrow(throwAnimT) {
    const amt = Math.sin(throwAnimT * Math.PI);
    this._rShoulder.rotation.x = -amt * 2.0;
    this._lShoulder.rotation.x =  amt * 0.4;
  }

  _animateIdle(time) {
    const sw = Math.sin(time * 1.4) * 0.08;
    this._lShoulder.rotation.x =  sw;
    this._rShoulder.rotation.x = -sw;
    this._lHip.rotation.x      =  sw * 0.5;
    this._rHip.rotation.x      = -sw * 0.5;
  }

  // ── Audio ─────────────────────────────────────────────────────────────────
  initAudio(actx, bufs) {
    this._actx   = actx;
    this._panner = actx.createPanner();
    this._panner.panningModel  = 'HRTF';
    this._panner.distanceModel = 'inverse';
    this._panner.refDistance   = 10;
    this._panner.maxDistance   = 150;
    this._panner.rolloffFactor = 1.5;
    const gain = actx.createGain();
    gain.gain.value = 0.70;
    this._engSrc = actx.createBufferSource();
    this._engSrc.buffer = bufs.engLo;
    this._engSrc.loop   = true;
    this._engSrc.playbackRate.value = 0.52;
    this._engSrc.connect(gain);
    gain.connect(this._panner);
    this._panner.connect(actx.destination);
    this._engSrc.start();
  }

  updateAudio(_dt) {
    if (!this._actx || !this._panner) return;
    const t    = Math.min(1, this.speed / this.topSpeed);
    const rate = 0.45 + t * 0.40;
    const now  = this._actx.currentTime;
    this._engSrc.playbackRate.setTargetAtTime(rate, now, 0.15);
    if (this._panner.positionX !== undefined) {
      this._panner.positionX.value = this._enemyX;
      this._panner.positionY.value = 1.5;
      this._panner.positionZ.value = this._enemyZ;
    } else {
      this._panner.setPosition(this._enemyX, 1.5, this._enemyZ);
    }
  }
}
