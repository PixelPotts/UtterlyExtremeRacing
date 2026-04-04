/**
 * props.js — Reusable world props for mission and NPC systems
 *
 * ExclamationMarker  — floating yellow ! above a world position
 * ShopNPC            — stationary animated humanoid inside a shop
 * makeShopCounter    — returns a counter Group in building-local space
 */

import * as THREE from 'three';

// ── ExclamationMarker ─────────────────────────────────────────────────────────
// Shared geometry — all markers use the same boxes
const _EXCL_MAT     = new THREE.MeshLambertMaterial({ color: 0xFFDD00 });
const _EXCL_BAR_GEO = new THREE.BoxGeometry(0.28, 1.1, 0.28);
const _EXCL_DOT_GEO = new THREE.BoxGeometry(0.34, 0.34, 0.34);

export class ExclamationMarker {
  constructor(scene, wx, wy, wz) {
    this._scene  = scene;
    this._t      = 0;
    this._baseY  = wy;

    const g   = new THREE.Group();
    const bar = new THREE.Mesh(_EXCL_BAR_GEO, _EXCL_MAT);
    bar.userData.sharedGeo = true;
    bar.position.y = 0.55;
    g.add(bar);

    const dot = new THREE.Mesh(_EXCL_DOT_GEO, _EXCL_MAT);
    dot.userData.sharedGeo = true;
    dot.position.y = -0.28;
    g.add(dot);

    g.position.set(wx, wy, wz);
    scene.add(g);
    this._group = g;
  }

  update(dt) {
    this._t += dt;
    this._group.position.y = this._baseY + Math.sin(this._t * 2.4) * 0.45;
    this._group.rotation.y += dt * 1.6;
  }

  dispose() {
    this._scene.remove(this._group);
    // geometry is shared — don't dispose it
  }
}

// ── ShopNPC geometry (shared across all ShopNPC instances) ───────────────────
const _S_HEAD  = new THREE.SphereGeometry(0.18, 7, 5);
const _S_TORSO = new THREE.CylinderGeometry(0.14, 0.12, 0.55, 6);
const _S_ARM   = new THREE.CylinderGeometry(0.055, 0.045, 0.42, 5);
const _S_LEG   = new THREE.CylinderGeometry(0.07, 0.06, 0.44, 5);
const _S_SHOE  = new THREE.BoxGeometry(0.14, 0.08, 0.22);

const _SKIN = [0xF5CBA7, 0xE8B880, 0xD4956A, 0xAF7845, 0x8B5E3C];
const _TOPS = [0x2266CC, 0xCC3322, 0x338855, 0x885522, 0x667788, 0x9933AA];
const _PNTS = [0x1A2040, 0x3A2810, 0x1A3020, 0x383838];
const _SHOE = [0x111111, 0x221100];
const _rp   = a => a[Math.random() * a.length | 0];

/**
 * ShopNPC — waving distressed NPC placed inside a shop, in building-local space.
 *
 * @param {THREE.Group} buildingGroup  — the building group to attach to
 * @param {number} lx   local X position (perpendicular to road, toward back wall)
 * @param {number} ly   local Y of ground floor surface
 * @param {number} lz   local Z position (along facade, 0 = centre)
 * @param {number} facingAngle  rotation.y so NPC faces the entrance
 */
export class ShopNPC {
  constructor(buildingGroup, lx, ly, lz, facingAngle) {
    this._t     = 0;
    this._bldgG = buildingGroup;

    const skinMat = new THREE.MeshLambertMaterial({ color: _rp(_SKIN) });
    const topMat  = new THREE.MeshLambertMaterial({ color: _rp(_TOPS) });
    const pantMat = new THREE.MeshLambertMaterial({ color: _rp(_PNTS) });
    const shoeMat = new THREE.MeshLambertMaterial({ color: _rp(_SHOE) });
    this._mats = [skinMat, topMat, pantMat, shoeMat];

    const root = new THREE.Group();
    root.position.set(lx, ly + 0.46, lz);
    root.rotation.y = facingAngle;

    // Head
    const head = new THREE.Mesh(_S_HEAD, skinMat);
    head.userData.sharedGeo = true;
    head.position.y = 1.62;
    root.add(head);

    // Torso
    const torso = new THREE.Mesh(_S_TORSO, topMat);
    torso.userData.sharedGeo = true;
    torso.position.y = 1.10;
    root.add(torso);

    // Legs (static — NPC stands behind counter)
    const mkLeg = (xOff) => {
      const g    = new THREE.Group();
      g.position.set(xOff, 0.84, 0);
      const cyl  = new THREE.Mesh(_S_LEG, pantMat);
      cyl.userData.sharedGeo = true;
      cyl.position.y = -0.36;
      g.add(cyl);
      const shoe = new THREE.Mesh(_S_SHOE, shoeMat);
      shoe.userData.sharedGeo = true;
      shoe.position.set(0, -0.76, 0.04);
      g.add(shoe);
      return g;
    };
    root.add(mkLeg(-0.09), mkLeg(0.09));

    // Arms — shoulder pivot groups so we can swing them up
    this._lShoulder = new THREE.Group();
    this._lShoulder.position.set(-0.20, 1.35, 0);
    this._rShoulder = new THREE.Group();
    this._rShoulder.position.set( 0.20, 1.35, 0);

    const mkArm = () => {
      const arm = new THREE.Mesh(_S_ARM, topMat);
      arm.userData.sharedGeo = true;
      arm.position.y = -0.20;
      return arm;
    };
    this._lShoulder.add(mkArm());
    this._rShoulder.add(mkArm());
    root.add(this._lShoulder, this._rShoulder);

    // Small ! above NPC head (interior indicator)
    const exclG = new THREE.Group();
    const bar   = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), _EXCL_MAT);
    bar.position.y = 0.22;
    exclG.add(bar);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), _EXCL_MAT);
    dot.position.y = -0.11;
    exclG.add(dot);
    exclG.position.y = 2.15;   // float above head
    root.add(exclG);
    this._exclG = exclG;

    this._root = root;
    buildingGroup.add(root);
  }

  update(dt) {
    this._t += dt;
    const t = this._t;

    // Arms wave: oscillate from raised (~horizontal) up past vertical
    const wave = Math.sin(t * 3.6) * 0.6;
    this._lShoulder.rotation.x = -1.85 + wave;
    this._rShoulder.rotation.x = -1.85 - wave;

    // Body leans side to side
    this._root.rotation.z = Math.sin(t * 1.9) * 0.13;

    // ! bobs gently
    this._exclG.position.y = 2.15 + Math.sin(t * 4.0) * 0.08;
  }

  dispose() {
    this._bldgG.remove(this._root);
    for (const m of this._mats) m.dispose();
    // shared geometry — don't dispose
  }
}

// ── makeShopCounter ──────────────────────────────────────────────────────────
// Returns a Group in building-local space to attach to the building group.
//
// side     : +1 or -1 (which side of road the building is on — determines
//            which X direction is "back wall")
// scaledW  : building's scaled width (def.w * 3), the X dimension
// scaledD  : building's scaled depth (def.d), the Z dimension
// floorY   : local Y of ground floor surface (typically -scaledH / 2)
const _woodMat  = new THREE.MeshLambertMaterial({ color: 0x7B4F2A });
const _glassMat = new THREE.MeshLambertMaterial({ color: 0xAADDFF, transparent: true, opacity: 0.30 });

export function makeShopCounter(side, scaledW, scaledD, floorY) {
  const g   = new THREE.Group();
  const cw  = Math.min(scaledD * 0.50, 4.0);   // counter width along Z (facade)
  const ch  = 1.05;                              // counter height
  const cd  = 0.80;                              // counter depth along X
  const bx  = side * (scaledW / 2 - 1.6);       // pushed toward back wall

  const body = new THREE.Mesh(new THREE.BoxGeometry(cd, ch, cw), _woodMat);
  body.userData.sharedGeo = true;
  body.position.set(bx, floorY + ch / 2 + 0.02, 0);
  g.add(body);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(cd + 0.05, 0.07, cw), _glassMat);
  glass.userData.sharedGeo = true;
  glass.position.set(bx, floorY + ch + 0.055, 0);
  g.add(glass);

  return g;
}
