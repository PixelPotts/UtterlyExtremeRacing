import * as THREE from 'three';
import { Door, makeWindowInstances } from './door.js';
import { spawnSign } from './neon_signs.js';

// ── Facade materials ────────────────────────────────────────────────────────
// Indexed 0-4; textures are applied externally via applyTex() in index.html.
export const BLDG_MATS = [
  new THREE.MeshStandardMaterial({ color: 0xBBAA99, roughness: 0.88, metalness: 0 }), // 0 bricks_red
  new THREE.MeshStandardMaterial({ color: 0xCCBBAA, roughness: 0.88, metalness: 0 }), // 1 bricks_tan
  new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.82, metalness: 0 }), // 2 concrete_clean
  new THREE.MeshStandardMaterial({ color: 0xAAAAAA, roughness: 0.85, metalness: 0 }), // 3 concrete_dark
  new THREE.MeshStandardMaterial({ color: 0xDDCCBB, roughness: 0.80, metalness: 0 }), // 4 facade
];

// Ground-floor contrasting material index: brick buildings get concrete base, etc.
const GROUND_MAT_IDX = [3, 2, 0, 1, 2];  // BLDG_MATS index for ground floor per mat

// Precast stone / stucco trim — cornices, bands, pilasters, window sills
export const TRIM_MAT = new THREE.MeshStandardMaterial({
  color: 0xDDD8C8, roughness: 0.87, metalness: 0,
});

// Ground-floor height (metres, in world/scaled space)
const GROUND_H = 4.5;

// Pre-shared awning materials — one per colour, avoids per-building material creation
const AWNING_MATS = [0xCC2211, 0x113388, 0x227722, 0xCC6600, 0x882244, 0x334455, 0x994400]
  .map(c => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));

// Shared pilaster geometry — one instanced mesh per building (4 instances)
const _pilGeo = new THREE.BoxGeometry(0.55, 1, 0.55); // Y=1; scaled per-building via matrix

// ── Building definitions ────────────────────────────────────────────────────
// w/h/d     : dimensions in metres (scaled ×3 by segments.js)
// mat       : index into BLDG_MATS
// easement  : extra lateral setback from road baseline
// doorType  : 'none' | 'single' | 'double' | 'garage'
export const BUILDING_DEFS = [
  // ── Narrow brick rowhouses ────────────────────────────────────────────────
  { w:  7, h: 10, d:  8, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  8, h: 12, d:  8, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  7, h: 14, d:  7, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  9, h: 11, d:  8, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  8, h:  9, d:  7, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  7, h: 16, d:  8, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  6, h: 10, d:  6, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  9, h: 13, d:  9, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  8, h:  8, d:  7, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  7, h: 11, d:  8, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  8, h: 10, d:  8, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },

  // ── Mid-rise apartments ───────────────────────────────────────────────────
  { w: 12, h: 18, d: 10, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 14, h: 22, d: 10, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 11, h: 16, d:  9, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 13, h: 20, d: 11, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 12, h: 24, d: 10, mat: 4, easement:  2, spaceBefore: 2, spaceAfter: 2, doorType: 'double', doorOpens: false },
  { w: 14, h: 18, d: 12, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 10, h: 20, d:  9, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 13, h: 15, d: 11, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },

  // ── Tall office towers (setback, space around them) ───────────────────────
  { w: 14, h: 40, d: 12, mat: 2, easement:  4, spaceBefore: 3, spaceAfter: 3, doorType: 'double', doorOpens: false },
  { w: 16, h: 38, d: 14, mat: 3, easement:  4, spaceBefore: 3, spaceAfter: 3, doorType: 'double', doorOpens: false },
  { w: 12, h: 44, d: 12, mat: 2, easement:  5, spaceBefore: 4, spaceAfter: 4, doorType: 'double', doorOpens: false },
  { w: 18, h: 36, d: 14, mat: 3, easement:  3, spaceBefore: 2, spaceAfter: 2, doorType: 'double', doorOpens: false },
  { w: 14, h: 42, d: 12, mat: 2, easement:  5, spaceBefore: 4, spaceAfter: 4, doorType: 'double', doorOpens: false },
  { w: 16, h: 34, d: 14, mat: 3, easement:  3, spaceBefore: 2, spaceAfter: 2, doorType: 'double', doorOpens: false },
  { w: 12, h: 30, d: 10, mat: 2, easement:  2, spaceBefore: 1, spaceAfter: 1, doorType: 'double', doorOpens: false },
  { w:  8, h: 28, d:  8, mat: 2, easement:  5, spaceBefore: 5, spaceAfter: 5, doorType: 'double', doorOpens: false }, // skinny tower
  { w: 18, h: 32, d: 14, mat: 2, easement:  4, spaceBefore: 3, spaceAfter: 3, doorType: 'double', doorOpens: false },
  { w: 10, h: 26, d:  9, mat: 1, easement:  2, spaceBefore: 1, spaceAfter: 1, doorType: 'double', doorOpens: false },

  // ── Wide low commercial / storefronts ─────────────────────────────────────
  { w: 18, h:  5, d: 12, mat: 2, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 20, h:  6, d: 14, mat: 3, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 16, h:  5, d: 10, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 22, h:  7, d: 14, mat: 2, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 14, h:  6, d: 10, mat: 4, easement: -2, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 18, h:  5, d: 12, mat: 3, easement: -2, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 16, h:  6, d: 11, mat: 2, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 20, h:  7, d: 13, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 22, h:  8, d: 16, mat: 3, easement:  6, spaceBefore: 4, spaceAfter: 4, doorType: 'double', doorOpens: false },
  { w: 24, h:  6, d: 12, mat: 3, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'garage', doorOpens: false },

  // ── Small shops / corner stores (closer to road) ──────────────────────────
  { w:  8, h:  5, d:  8, mat: 4, easement: -3, spaceBefore: 1, spaceAfter: 1, doorType: 'single', doorOpens: true },
  { w: 10, h:  6, d:  9, mat: 0, easement: -2, spaceBefore: 1, spaceAfter: 0, doorType: 'single', doorOpens: true },
  { w:  9, h:  5, d:  8, mat: 1, easement: -2, spaceBefore: 0, spaceAfter: 1, doorType: 'single', doorOpens: true },
  { w:  8, h:  6, d:  7, mat: 4, easement: -3, spaceBefore: 1, spaceAfter: 1, doorType: 'single', doorOpens: true },
  { w: 10, h:  5, d:  9, mat: 4, easement: -2, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  8, h:  7, d:  7, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  9, h:  6, d:  8, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w: 10, h:  7, d:  9, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w:  9, h:  6, d:  9, mat: 0, easement: -4, spaceBefore: 2, spaceAfter: 2, doorType: 'single', doorOpens: true },

  // ── Garages / warehouses ──────────────────────────────────────────────────
  { w: 16, h:  6, d: 18, mat: 3, easement:  0, spaceBefore: 2, spaceAfter: 2, doorType: 'garage', doorOpens: false },
  { w: 18, h:  7, d: 20, mat: 2, easement:  2, spaceBefore: 2, spaceAfter: 2, doorType: 'garage', doorOpens: false },
  { w: 14, h:  6, d: 16, mat: 3, easement:  0, spaceBefore: 1, spaceAfter: 1, doorType: 'garage', doorOpens: false },
  { w: 20, h:  7, d: 18, mat: 2, easement:  0, spaceBefore: 2, spaceAfter: 0, doorType: 'garage', doorOpens: false },
  { w: 16, h:  8, d: 20, mat: 3, easement:  2, spaceBefore: 0, spaceAfter: 2, doorType: 'garage', doorOpens: false },
  { w: 14, h:  6, d: 14, mat: 2, easement:  0, spaceBefore: 1, spaceAfter: 1, doorType: 'garage', doorOpens: false },

  // ── Varied mid-size ───────────────────────────────────────────────────────
  { w: 11, h: 14, d:  9, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w: 12, h: 12, d: 10, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 13, h: 16, d: 11, mat: 2, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 10, h: 14, d:  8, mat: 3, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 12, h: 10, d:  9, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 11, h: 18, d: 10, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 14, h: 14, d: 11, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 10, h: 12, d:  9, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w: 13, h: 11, d: 10, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 12, h: 16, d: 10, mat: 3, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 10, h: 13, d:  9, mat: 2, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 11, h: 15, d:  8, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 14, h: 12, d: 12, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 12, h: 20, d: 10, mat: 2, easement:  2, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 13, h: 18, d: 11, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 10, h: 16, d:  9, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w: 12, h: 14, d: 10, mat: 3, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 14, h: 10, d: 11, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 11, h: 12, d:  9, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w: 13, h: 14, d: 11, mat: 2, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 10, h: 11, d:  8, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w: 12, h: 13, d: 10, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 11, h: 17, d:  9, mat: 3, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 13, h: 15, d: 10, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 10, h:  9, d:  8, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w: 12, h:  8, d:  9, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 14, h:  9, d: 11, mat: 2, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 11, h: 10, d:  9, mat: 3, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w: 16, h: 14, d: 13, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 12, h: 22, d: 10, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 14, h: 16, d: 12, mat: 3, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 10, h: 20, d:  8, mat: 2, easement:  3, spaceBefore: 2, spaceAfter: 2, doorType: 'double', doorOpens: false },
  { w: 16, h: 10, d: 12, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 11, h:  9, d: 10, mat: 4, easement: -2, spaceBefore: 0, spaceAfter: 0, doorType: 'single', doorOpens: false },
  { w: 13, h:  7, d: 10, mat: 0, easement: -3, spaceBefore: 1, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 12, h: 11, d:  9, mat: 2, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 14, h: 13, d: 11, mat: 1, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 11, h: 16, d: 10, mat: 3, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 13, h: 19, d: 11, mat: 4, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
  { w: 10, h: 17, d:  9, mat: 0, easement:  0, spaceBefore: 0, spaceAfter: 0, doorType: 'double', doorOpens: false },
];

// ── Building class ─────────────────────────────────────────────────────────
// side: +1 = right of road, -1 = left.  Used to orient the door toward road.
//
// Local coordinate convention:
//   X — perpendicular to road (depth into block), range ±w/2
//   Y — vertical, range ±h/2  (bottom = −h/2 = ground surface)
//   Z — parallel to road (along facade), range ±d/2
//
export class Building {
  constructor(def, x, z, angle, pathY, side) {
    const { w, h, d, mat, doorType } = def;
    const group = new THREE.Group();

    // ── Body — split into ground floor + upper, or single for enterable ──────
    // All non-enterable buildings get a contrasting ground floor with trim band.
    const doSplit  = !def.enterable;
    const gfH      = doSplit ? Math.min(GROUND_H, h * 0.4) : h; // ground floor height
    const upH      = doSplit ? h - gfH : 0;                     // upper body height

    let body = null; // only non-null for enterable buildings (door-hole logic needs it)

    if (doSplit) {
      // Upper body
      const upper = new THREE.Mesh(new THREE.BoxGeometry(w, upH, d), BLDG_MATS[mat]);
      upper.castShadow = upper.receiveShadow = true;
      upper.position.y = -h / 2 + gfH + upH / 2;
      group.add(upper);

      // Ground floor — contrasting material (no shadow cast; upper covers it)
      const lower = new THREE.Mesh(
        new THREE.BoxGeometry(w, gfH, d), BLDG_MATS[GROUND_MAT_IDX[mat]]);
      lower.receiveShadow = true;
      lower.position.y = -h / 2 + gfH / 2;
      group.add(lower);

      // Horizontal trim band at the seam (slightly wider than body)
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.45, d + 0.5), TRIM_MAT);
      band.position.y = -h / 2 + gfH;
      group.add(band);

    } else {
      // Enterable — single body (door-hole geometry needs one mesh)
      const bodyMat = BLDG_MATS[mat].clone();
      bodyMat.side  = THREE.DoubleSide;
      body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      body.castShadow = body.receiveShadow = true;
      group.add(body);
      group.userData.enterable = true;
    }

    // ── Roofline cornice ──────────────────────────────────────────────────────
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.4, d + 0.7), TRIM_MAT);
    cornice.position.y = h / 2 + 0.2;
    group.add(cornice);

    // ── Corner pilasters — single InstancedMesh (4 instances, no shadow cast) ──
    const pilH = Math.min(gfH + 0.55, h);
    {
      const pilIM = new THREE.InstancedMesh(_pilGeo, TRIM_MAT, 4);
      pilIM.castShadow = false;
      pilIM.receiveShadow = false;
      const _d = new THREE.Object3D();
      const pilW = 0.55, pilD = 0.55;
      let ii = 0;
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        _d.position.set(sx * (w / 2 + pilW / 2 - 0.1), -h / 2 + pilH / 2, sz * (d / 2 + pilD / 2 - 0.1));
        _d.scale.set(1, pilH, 1);   // _pilGeo is 0.55×1×0.55; Y-scale = pilH
        _d.updateMatrix();
        pilIM.setMatrixAt(ii++, _d.matrix);
      }
      pilIM.instanceMatrix.needsUpdate = true;
      group.add(pilIM);
    }

    // ── Door ──────────────────────────────────────────────────────────────────
    if (doorType !== 'none') {
      const isGarage = doorType === 'garage';
      const isDbl    = doorType === 'double';
      const dw = isGarage ? w * 0.65 : (isDbl ? 2.0 : 1.0);
      const dh = isGarage ? Math.min(h * 0.80, 4.5) : 2.3;

      const doorObj = new Door({ w: dw, h: dh, doorType, enterable: !!def.enterable, doorColor: def.doorColor ?? null });
      doorObj.group.position.set(-side * (w / 2 + 0.01), -h / 2 + dh / 2, 0);
      doorObj.group.rotation.y = side * (-Math.PI / 2);
      group.add(doorObj.group);

      // Enterable door-hole and wall panels (only for single-body buildings)
      if (def.enterable && body) {
        const bodyMat    = body.material;
        const doorFaceIdx = side > 0 ? 1 : 0;
        const holeMat    = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const mats = [bodyMat, bodyMat, bodyMat, bodyMat, bodyMat, bodyMat];
        mats[doorFaceIdx] = holeMat;
        body.material = mats;

        const faceLX = side > 0 ? -w / 2 : +w / 2;
        const rotY   = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        const mkWallPanel = (pw, ph, offZ, offY) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), bodyMat.clone());
          m.material.side = THREE.DoubleSide;
          m.rotation.y = rotY;
          m.position.set(faceLX, offY, offZ);
          group.add(m);
        };
        const sideW = (d - dw) / 2;
        mkWallPanel(sideW, h, -(dw / 2 + sideW / 2), 0);
        mkWallPanel(sideW, h, +(dw / 2 + sideW / 2), 0);
        const transomH = h - dh;
        if (transomH > 0.1)
          mkWallPanel(dw, transomH, 0, -h / 2 + dh + transomH / 2);
      }
    }

    // ── House number plaque ───────────────────────────────────────────────────
    if (def.houseNumber) {
      const cvs = document.createElement('canvas');
      cvs.width = 128; cvs.height = 64;
      const ctx2 = cvs.getContext('2d');
      ctx2.fillStyle = '#D8D0C0';
      ctx2.fillRect(0, 0, 128, 64);
      ctx2.strokeStyle = '#888'; ctx2.lineWidth = 4;
      ctx2.strokeRect(4, 4, 120, 56);
      ctx2.fillStyle = '#111';
      ctx2.font = 'bold 36px Arial, sans-serif';
      ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
      ctx2.fillText(def.houseNumber, 64, 32);
      const plaqueTex = new THREE.CanvasTexture(cvs);
      const plaqueMat = new THREE.MeshLambertMaterial({ map: plaqueTex, side: THREE.DoubleSide });
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.32), plaqueMat);
      plaque.position.set(-side * (w / 2 + 0.03), -h / 2 + 2.1, 0.85);
      plaque.rotation.y = side * (-Math.PI / 2);
      group.add(plaque);
    }

    // ── Awning (storefronts and short commercial buildings) ───────────────────
    // h here is the scaled value; storefronts (raw h ≤ 8) → scaled h ≤ 24
    if (h <= 24 && doorType !== 'garage' && doorType !== 'none') {
      const dw      = doorType === 'double' ? 2.0 : 1.0;
      const awW     = Math.min(dw + 2.6, d * 0.55);
      const awDepth = 1.65;
      const awMat = def.awningMatIdx != null ? AWNING_MATS[def.awningMatIdx] : AWNING_MATS[Math.floor(Math.random() * AWNING_MATS.length)];

      // Flat awning canopy
      const aw = new THREE.Mesh(new THREE.BoxGeometry(awDepth, 0.12, awW), awMat);
      aw.position.set(-side * (w / 2 + awDepth / 2), -h / 2 + 2.75, 0);
      group.add(aw);

      // Thin metal valance (front drop)
      const valH = 0.55;
      const val = new THREE.Mesh(new THREE.BoxGeometry(0.04, valH, awW), awMat);
      val.position.set(-side * (w / 2 + awDepth + 0.02), -h / 2 + 2.75 - 0.06 - valH / 2, 0);
      group.add(val);
    }

    // ── Windows ───────────────────────────────────────────────────────────────
    const winMesh = makeWindowInstances(def);
    if (winMesh) group.add(winMesh);

    // ── Signs ─────────────────────────────────────────────────────────────────
    spawnSign(group, { side, w, h, d, doorType }, gfH);

    // ── Interior floor — occludes terrain when looking down inside building ───
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.04, d - 0.04),
      BLDG_MATS[GROUND_MAT_IDX[mat]]);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -h / 2 + 0.01;
    floor.receiveShadow = true;
    group.add(floor);

    // ── Position & orient ──────────────────────────────────────────────────────
    group.position.set(x, pathY + 0.4 + h / 2, z);
    // Max safe jitter: rotated Z footprint = d·cos θ + w·sin θ ≈ d + w·θ (small angle).
    // Budget per building = half the 1m inter-segment gap = 0.5m  →  θ_max = 0.5 / w.
    const thetaMax = 0.5 / w;
    group.rotation.y = -angle + (Math.random() - 0.5) * 2 * thetaMax;

    this.group = group;
    this.def   = def;
  }
}
