import * as THREE from 'three';

// ── Shared materials ──────────────────────────────────────────────────────────
const _floorMat  = new THREE.MeshLambertMaterial({ color: 0x887755, side: THREE.DoubleSide });
const _ceilMat   = new THREE.MeshLambertMaterial({ color: 0xBBBBB0, side: THREE.DoubleSide });
const _wallMat   = new THREE.MeshLambertMaterial({ color: 0xC8BCAA, side: THREE.DoubleSide });
const _stairMat  = new THREE.MeshLambertMaterial({ color: 0x998877 });
const _railMat   = new THREE.MeshLambertMaterial({ color: 0x4A3A2A });

// Reusable dummy for InstancedMesh matrix writes
const _dummy = new THREE.Object3D();

// ── Layout constants ──────────────────────────────────────────────────────────
const HALL_HW   = 0.9;   // half-width of the central hallway corridor in Z
const WALL_T    = 0.15;  // interior partition thickness
const SLAB_T    = 0.08;  // floor slab thickness
const STAIR_W   = 1.4;   // staircase width in the Z direction
const N_STEPS   = 12;    // treads per flight

// ── Staircase ─────────────────────────────────────────────────────────────────
// Runs along X axis; bottom at xStart, top at xEnd.
// Z bounds: zL to zR (stair width = STAIR_W).
class Staircase {
  constructor({ zL, zR, xStart, xEnd, yBottom, floorH }) {
    const group    = new THREE.Group();
    const totalRun = Math.abs(xEnd - xStart);
    const dir      = Math.sign(xEnd - xStart);   // +1 or -1
    const tread    = totalRun / N_STEPS;
    const rise     = floorH  / N_STEPS;
    const sw       = zR - zL;    // stair width in Z
    const cz       = (zL + zR) * 0.5;  // Z center

    // ── Treads — single InstancedMesh (was N_STEPS separate meshes) ───────────
    const treadGeo  = new THREE.BoxGeometry(tread, SLAB_T, sw);
    const treadInst = new THREE.InstancedMesh(treadGeo, _stairMat, N_STEPS);
    for (let i = 0; i < N_STEPS; i++) {
      _dummy.position.set(xStart + dir * (i + 0.5) * tread, yBottom + (i + 0.5) * rise, cz);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      treadInst.setMatrixAt(i, _dummy.matrix);
    }
    treadInst.instanceMatrix.needsUpdate = true;
    group.add(treadInst);

    // ── Risers — single InstancedMesh (was N_STEPS separate meshes) ──────────
    const riserGeo  = new THREE.PlaneGeometry(sw, rise);
    const riserInst = new THREE.InstancedMesh(riserGeo, _stairMat, N_STEPS);
    const riserRotY = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (let i = 0; i < N_STEPS; i++) {
      _dummy.position.set(xStart + dir * i * tread, yBottom + (i + 0.5) * rise, cz);
      _dummy.rotation.set(0, riserRotY, 0);
      _dummy.updateMatrix();
      riserInst.setMatrixAt(i, _dummy.matrix);
    }
    riserInst.instanceMatrix.needsUpdate = true;
    group.add(riserInst);

    // ── Handrail — slanted box on the +Z (zR) side ───────────────────────────
    const railLen   = Math.sqrt(totalRun * totalRun + floorH * floorH) + 0.15;
    const railAngle = Math.atan2(floorH, totalRun);
    const railGeo   = new THREE.BoxGeometry(railLen, 0.05, 0.05);
    const rail      = new THREE.Mesh(railGeo, _railMat);
    rail.position.set((xStart + xEnd) * 0.5, yBottom + floorH * 0.5 + 0.9, zR - 0.04);
    rail.rotation.z = dir > 0 ? -railAngle : railAngle;
    group.add(rail);

    // ── Newel posts at top and bottom ─────────────────────────────────────────
    const postGeo = new THREE.BoxGeometry(0.08, 0.9, 0.08);
    const postB   = new THREE.Mesh(postGeo, _railMat);
    postB.position.set(xStart, yBottom + 0.45, zR - 0.04);
    group.add(postB);
    const postT   = new THREE.Mesh(postGeo, _railMat);
    postT.position.set(xEnd, yBottom + floorH + 0.45, zR - 0.04);
    group.add(postT);

    this.group   = group;
    this.xStart  = xStart;
    this.xEnd    = xEnd;
    this.zL      = zL;
    this.zR      = zR;
    this.yBottom = yBottom;
    this.floorH  = floorH;
  }

  // Returns the stair-surface local Y at (lx, lz) if the walker is near this
  // flight, otherwise null.
  surfaceYAt(lx, lz, approxLocalY) {
    if (lz < this.zL - 0.3 || lz > this.zR + 0.3) return null;
    const minX = Math.min(this.xStart, this.xEnd);
    const maxX = Math.max(this.xStart, this.xEnd);
    if (lx < minX || lx > maxX) return null;
    const t        = (lx - this.xStart) / (this.xEnd - this.xStart);
    const stairSurfY = this.yBottom + t * this.floorH + SLAB_T * 0.5;
    if (Math.abs(approxLocalY - stairSurfY) > this.floorH + 0.6) return null;
    return stairSurfY;
  }
}

// ── BuildingInterior ─────────────────────────────────────────────────────────
// Procedurally builds floors, ceilings, partition walls, staircases and lighting
// for a single building.  Geometry is attached to the existing building group so
// that it inherits the group's world position and rotation.
//
// Call build(buildingGroup) to attach geometry (lazy — called on player intent).
// Call getLocalFloorY(lx, lz, approxLocalY) from the game loop for walker physics.
// Call dispose(buildingGroup) when the segment is unloaded.
export class BuildingInterior {
  /**
   * @param {object} def
   * @param {number} side
   * @param {object} [opts]
   * @param {number} [opts.maxFloors=8]  Cap on number of floors (use 3 for mission buildings)
   */
  constructor(def, side, { maxFloors = 8 } = {}) {
    this.def      = def;
    this.side     = side;

    const { h } = def;
    // Shop buildings: single open floor, no partitions or staircases
    this.nFloors  = def.isShop ? 1 : Math.min(maxFloors, Math.max(1, Math.floor(h / 3.2)));
    this.floorH   = h / this.nFloors;

    // Staircase runs along X; Z bounds = ±STAIR_W/2 (width).
    // xStart = 0 (building center, where player arrives from door side)
    // xEnd   = back wall in local X = side*(w/2 - WALL_T)
    this.stairXStart = 0;
    this.stairXEnd   = side * (def.w * 0.5 - WALL_T);
    this.stairZL     = -STAIR_W * 0.5;
    this.stairZR     = +STAIR_W * 0.5;

    this._group   = null;
    this.staircases = [];
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  build(buildingGroup) {
    if (this._group) return;               // idempotent
    const { w, h, d } = this.def;
    const group = new THREE.Group();
    const totalRun = Math.abs(this.stairXEnd - this.stairXStart);
    const canStair = totalRun >= 1.5 && this.nFloors > 1;

    for (let f = 0; f < this.nFloors; f++) {
      const floorY = -h * 0.5 + f * this.floorH;   // local Y of floor-f surface
      this._buildFloor(group, f, floorY, w, d, canStair);
    }

    buildingGroup.add(group);
    this._group = group;
  }

  // Returns the local-space floor Y the walker should stand on at (lx, lz)
  // given their current approximate local Y.
  getLocalFloorY(lx, lz, approxLocalY) {
    // Check active staircases first
    for (const sc of this.staircases) {
      const sy = sc.surfaceYAt(lx, lz, approxLocalY);
      if (sy !== null) return sy;
    }
    // Determine floor level from walker's current height
    const { h } = this.def;
    const groundY = -h * 0.5;
    const fIdx = Math.max(0, Math.min(
      this.nFloors - 1,
      Math.floor((approxLocalY - groundY + 0.35) / this.floorH)
    ));
    return groundY + fIdx * this.floorH;
  }

  dispose(buildingGroup) {
    if (!this._group) return;
    buildingGroup.remove(this._group);
    this._group.traverse(c => {
      if (c.isMesh) c.geometry.dispose();
    });
    this._group    = null;
    this.staircases = [];
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  _buildFloor(parent, f, floorY, w, d, canStair) {
    const { h } = this.def;
    const fh     = this.floorH;
    const iw     = w - WALL_T * 2;   // inner width  (X)
    const id     = d - WALL_T * 2;   // inner depth  (Z)
    const ceilY  = floorY + fh - 0.04;

    // ── Floor slab ────────────────────────────────────────────────────────────
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(iw, id), _floorMat
    );
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.position.set(0, floorY + 0.015, 0);
    parent.add(floorMesh);

    // ── Ceiling (not for the top floor) ───────────────────────────────────────
    if (f < this.nFloors - 1) {
      const ceilMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(iw, id), _ceilMat
      );
      ceilMesh.rotation.x = Math.PI * 0.5;
      ceilMesh.position.set(0, ceilY, 0);
      parent.add(ceilMesh);
    }

    // ── Hallway partition walls (waist-height, with centre opening) ───────────
    // Skip for shop buildings — open floor plan
    if (id > 3.5 && !this.def.isShop) {
      this._addPartition(parent, w, fh, floorY, +HALL_HW);
      this._addPartition(parent, w, fh, floorY, -HALL_HW);
    }

    // ── Staircase ─────────────────────────────────────────────────────────────
    // Runs along X from xStart=0 toward xEnd (back wall).
    if (canStair && f < this.nFloors - 1) {
      const sc = new Staircase({
        zL:      this.stairZL,
        zR:      this.stairZR,
        xStart:  this.stairXStart,
        xEnd:    this.stairXEnd,
        yBottom: floorY,
        floorH:  fh,
      });
      parent.add(sc.group);
      this.staircases.push(sc);

      // Small landing pad at top of stairs
      const landW = 0.8;
      const landD = STAIR_W + 0.3;
      const landing = new THREE.Mesh(
        new THREE.PlaneGeometry(landW, landD), _floorMat
      );
      landing.rotation.x = -Math.PI * 0.5;
      const lx = this.stairXEnd - Math.sign(this.stairXEnd - this.stairXStart) * landW * 0.5;
      landing.position.set(lx, floorY + fh + 0.016, (this.stairZL + this.stairZR) * 0.5);
      parent.add(landing);
    }

    // ── Interior point light ─────────────────────────────────────────────────
    const light = new THREE.PointLight(0xFFDDBB, 55, fh * 4.5);
    light.position.set(0, floorY + fh * 0.60, 0);
    parent.add(light);
  }

  // Waist-high partition wall at local Z = zPos, with a doorway opening
  // in the centre third so the hallway and rooms connect.
  _addPartition(parent, w, fh, floorY, zPos) {
    const wallH  = Math.min(fh * 0.45, 1.2);
    const usableW = w - WALL_T * 2;
    const openW   = Math.min(usableW * 0.35, 2.0); // opening width
    const sideW   = (usableW - openW) * 0.5;

    if (sideW < 0.3) return; // building too narrow for a partition

    const mkSeg = (sw) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sw, wallH, WALL_T), _wallMat);
      m.position.y = floorY + wallH * 0.5 + 0.04;
      m.position.z = zPos;
      return m;
    };

    // Left segment
    const lSeg = mkSeg(sideW);
    lSeg.position.x = -(openW * 0.5 + sideW * 0.5);
    parent.add(lSeg);

    // Right segment
    const rSeg = mkSeg(sideW);
    rSeg.position.x = +(openW * 0.5 + sideW * 0.5);
    parent.add(rSeg);
  }
}
