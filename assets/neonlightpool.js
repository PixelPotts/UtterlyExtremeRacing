import * as THREE from 'three';

// Pre-allocates a fixed number of SpotLights and PointLights in the scene.
// Lights are repositioned rather than added/removed, so the scene's light
// count never changes → Three.js never recompiles the PBR shader mid-game.

export class NeonLightPool {
  constructor(scene, numSpots, numPoints, color = 0x00ff88) {
    this._scene = scene;
    this._spotFree  = [];
    this._pointFree = [];

    this.spots = Array.from({ length: numSpots }, (_, i) => {
      const sl = new THREE.SpotLight(color, 900, 32, Math.PI / 9, 0.18, 1.6);
      sl.castShadow = false;
      sl.position.set(0, -500, 0);
      sl.target.position.set(0, -501, 0);
      sl.target.updateMatrixWorld();
      scene.add(sl); scene.add(sl.target);
      this._spotFree.push(i);
      return sl;
    });

    this.points = Array.from({ length: numPoints }, (_, i) => {
      const pl = new THREE.PointLight(color, 110, 10, 2);
      pl.position.set(0, -500, 0);
      scene.add(pl);
      this._pointFree.push(i);
      return pl;
    });
  }

  acquireSpot(x, y, z, tx, ty, tz) {
    const i = this._spotFree.pop();
    if (i == null) { console.warn('NeonLightPool: spot pool exhausted'); return null; }
    const sl = this.spots[i];
    sl.position.set(x, y, z);
    sl.target.position.set(tx, ty, tz);
    sl.target.updateMatrixWorld();
    return { idx: i, type: 'spot' };
  }

  acquirePoint(x, y, z) {
    const i = this._pointFree.pop();
    if (i == null) { console.warn('NeonLightPool: point pool exhausted'); return null; }
    this.points[i].position.set(x, y, z);
    return { idx: i, type: 'point' };
  }

  release(slot) {
    if (!slot) return;
    if (slot.type === 'spot') {
      const sl = this.spots[slot.idx];
      sl.position.set(0, -500, 0);
      sl.target.position.set(0, -501, 0);
      sl.target.updateMatrixWorld();
      this._spotFree.push(slot.idx);
    } else {
      this.points[slot.idx].position.set(0, -500, 0);
      this._pointFree.push(slot.idx);
    }
  }
}
