import * as THREE from 'three';

// ── LoopTrack ─────────────────────────────────────────────────────────────────
// Visual Hot-Wheels-style vertical loop: a DoubleSide torus + outer glow ring.
// The torus is oriented so the hole faces the road forward direction, meaning
// the road (and car) passes straight through the center.

const TUBE_R = 7.0;   // cross-section radius — slightly wider than road half-width

export class LoopTrack {
  constructor(scene, centerPos, entryAngle, R) {
    this._scene  = scene;
    this._meshes = [];

    // The torus hole must face the road's forward direction: (sin(a), 0, -cos(a)).
    // THREE.TorusGeometry default: hole faces +Z. Rotate from Z to forward.
    const fwd  = new THREE.Vector3(Math.sin(entryAngle), 0, -Math.cos(entryAngle));
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), fwd
    );

    // Main torus — DoubleSide so inside surface (road tunnel walls) is visible
    const geo  = new THREE.TorusGeometry(R, TUBE_R, 24, 90);
    const mat  = new THREE.MeshStandardMaterial({
      color:             0xff6600,
      emissive:          0xff4400,
      emissiveIntensity: 1.8,
      roughness:         0.3,
      metalness:         0.5,
      side:              THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(centerPos);
    mesh.setRotationFromQuaternion(quat);
    scene.add(mesh);
    this._meshes.push(mesh);

    // Outer glow halo — additive, slightly larger
    const glowGeo  = new THREE.TorusGeometry(R, TUBE_R + 4.0, 16, 60);
    const glowMat  = new THREE.MeshBasicMaterial({
      color:       0xff4400,
      transparent: true,
      opacity:     0.08,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.position.copy(centerPos);
    glowMesh.setRotationFromQuaternion(quat);
    scene.add(glowMesh);
    this._meshes.push(glowMesh);
  }

  // Array of scene meshes — push into decorSeg so dropDecorations cleans them up
  get meshes() { return this._meshes; }
}
