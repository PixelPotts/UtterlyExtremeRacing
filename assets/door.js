import * as THREE from 'three';

// ── Shared materials ─────────────────────────────────────────────────────────
const _frameMat = new THREE.MeshLambertMaterial({ color: 0x3D2B1F });

const _panelMats = {
  single:    new THREE.MeshLambertMaterial({ color: 0x5C3A1A, side: THREE.DoubleSide }),
  double:    new THREE.MeshLambertMaterial({ color: 0x2A1F1A, side: THREE.DoubleSide }),
  garage:    new THREE.MeshLambertMaterial({ color: 0x445566, side: THREE.DoubleSide }),
  enterable: new THREE.MeshLambertMaterial({ color: 0xFFCC00, side: THREE.DoubleSide }),
};

const _winMat = new THREE.MeshStandardMaterial({
  color: 0x4466AA, transparent: true, opacity: 0.74,
  roughness: 0.06, metalness: 0.28,
});
const _winFrameMat = new THREE.MeshLambertMaterial({ color: 0x888888 });

// ── Door ──────────────────────────────────────────────────────────────────────
// Local space: X = door-width axis, Y = height, +Z = outward normal (toward road).
// Caller positions/rotates the group like the old PlaneGeometry door:
//   group.position.set(-side * (hw + 0.01), -bldgH/2 + dh/2, 0)
//   group.rotation.y = side * (-Math.PI / 2)
export class Door {
  constructor({ w, h, doorType = 'single', enterable = false, doorColor = null }) {
    const group = new THREE.Group();
    const mat = doorColor != null
      ? new THREE.MeshLambertMaterial({ color: doorColor, side: THREE.DoubleSide })
      : (enterable
          ? _panelMats.enterable
          : (_panelMats[doorType] ?? _panelMats.single));

    // Panel
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    group.add(panel);

    // Frame proportions
    const ft = Math.max(0.07, w * 0.055); // frame-member thickness
    const fd = 0.07;                       // frame depth (projects toward road)

    const mkBox = (bw, bh, bd) =>
      new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), _frameMat);

    // Left jamb — left of opening (X = -(w/2 + ft/2)), projects outward in Z
    const jL = new THREE.Mesh(new THREE.BoxGeometry(ft, h + ft, fd), _frameMat);
    jL.position.set(-(w / 2 + ft * 0.5), 0, fd * 0.5);
    group.add(jL);

    // Right jamb
    const jR = new THREE.Mesh(new THREE.BoxGeometry(ft, h + ft, fd), _frameMat);
    jR.position.set(+(w / 2 + ft * 0.5), 0, fd * 0.5);
    group.add(jR);

    // Lintel — spans full door width at top, projects outward in Z
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + ft * 2, ft, fd), _frameMat);
    lintel.position.set(0, h * 0.5 + ft * 0.5, fd * 0.5);
    group.add(lintel);

    // Transom window above lintel (non-garage doors only)
    if (doorType !== 'garage') {
      const th = Math.max(0.28, w * 0.18);  // transom height proportional to door width
      // Glass pane
      const tGlass = new THREE.Mesh(new THREE.PlaneGeometry(w, th), _winMat);
      tGlass.position.set(0, h * 0.5 + ft + th * 0.5, fd * 0.3);
      group.add(tGlass);
      // Thin top frame over transom
      const tTop = new THREE.Mesh(new THREE.BoxGeometry(w + ft * 2, ft * 0.7, fd), _frameMat);
      tTop.position.set(0, h * 0.5 + ft + th + ft * 0.35, fd * 0.5);
      group.add(tTop);
    }

    // Front step / stoop — at door base, projects outward in +Z
    if (doorType !== 'garage') {
      const stepMat = new THREE.MeshLambertMaterial({ color: 0xBBBBB4 });
      const step = new THREE.Mesh(new THREE.BoxGeometry(w + 0.55, 0.17, 0.62), stepMat);
      // Door base in group local space = y = -h/2; step sits at ground level
      step.position.set(0, -h / 2 - 0.085, fd + 0.31);
      group.add(step);
    }

    this.group = group;
  }
}

// ── BuildingWindow ────────────────────────────────────────────────────────────
// Returns a single InstancedMesh covering all 4 faces of a building.
// All positions are in the building group's LOCAL space so the mesh can simply
// be added to the building group.
//
// Coordinate convention (matches Building class):
//   local X  — perpendicular to road (depth into block),  range ±w/2
//   local Y  — vertical,                                  range ±h/2
//   local Z  — parallel to road (along facade),           range ±d/2
//
// Face normals (outward):
//   -X face (road-facing for side=+1): needs rotation.y = -π/2
//   +X face (back):                    needs rotation.y = +π/2
//   -Z face (side):                    needs rotation.y =  π
//   +Z face (side):                    needs rotation.y =  0
export function makeWindowInstances(def) {
  const { w, h, d } = def;

  const WW = 1.1, WH = 0.72;        // window pane width, height
  const FLOOR_H_EST = 3.0;           // approximate floor height for row placement
  const nFloors = Math.min(8, Math.max(1, Math.floor(h / FLOOR_H_EST)));
  const fh      = h / nFloors;

  // Windows per floor per face — spaced evenly, leaving ≥0.5 m at each edge
  const nFront = Math.max(1, Math.floor((d - 1.0) / 2.0)); // along Z  (road/back faces)
  const nSide  = Math.max(1, Math.floor((w - 1.0) / 2.0)); // along X  (side faces)

  const total = (nFront * 2 + nSide * 2) * nFloors;
  if (total === 0) return null;

  const paneGeo = new THREE.PlaneGeometry(WW, WH);
  const mesh    = new THREE.InstancedMesh(paneGeo, _winMat, total);
  mesh.userData.sharedGeo = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Thin window-frame border (one per building, not per pane — instanced separately)
  // Skipped for now; the dark blue pane against the lighter wall reads well enough.

  const dummy = new THREE.Object3D();
  let idx = 0;

  // faceAxis  : 'x' | 'z'
  // faceSide  : -1 | +1
  // count     : windows per floor
  // faceDim   : dimension of the face along its long axis
  // floorY    : local Y of floor surface for this floor
  const placeFace = (faceAxis, faceSide, count, faceDim, floorY) => {
    const spacing = faceDim / (count + 1);
    for (let k = 0; k < count; k++) {
      const along  = -faceDim * 0.5 + spacing * (k + 1);
      const offset = faceSide * (faceAxis === 'x' ? w * 0.5 : d * 0.5) + faceSide * 0.022;

      if (faceAxis === 'x') {
        dummy.position.set(offset, floorY + fh * 0.62, along);
        dummy.rotation.y = faceSide > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      } else {
        dummy.position.set(along, floorY + fh * 0.62, offset);
        dummy.rotation.y = faceSide > 0 ? 0 : Math.PI;
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }
  };

  for (let f = 0; f < nFloors; f++) {
    const fy = -h * 0.5 + f * fh;
    placeFace('x', -1, nFront, d, fy); // road-facing  (−X)
    placeFace('x', +1, nFront, d, fy); // back         (+X)
    placeFace('z', -1, nSide,  w, fy); // side         (−Z)
    placeFace('z', +1, nSide,  w, fy); // side         (+Z)
  }

  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
