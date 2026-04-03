// ── ObjectPool ────────────────────────────────────────────────────────────────
// Generic pre-allocated pool.  Eliminates mid-game geometry/mesh allocation by
// pre-building N objects at level-start, then checking them out/in as needed.
//
// Pooled objects must follow two conventions:
//   obj._sceneMeshes  — Array of THREE objects that were added to scene in the
//                       constructor.  Used by restoreToScene() after scene.clear().
//   obj._poolRelease  — Callback set by the pool at create time; call it instead
//                       of destroy().  Automatically wired by this class.
//
// Usage:
//   const pool = new ObjectPool({
//     size:   10,
//     create: ()    => new MyObstacle(scene, ...parkParams),
//     reset:  (obj) => { /* park obj off-screen, clear state */ },
//   });
//
//   // Spawn:
//   const obs = pool.acquire();
//   obs.resetAt(x, z, ...);
//
//   // Retire (called from obs.dispose() when pool-managed):
//   pool.release(obs);   // or obs._poolRelease()
//
//   // After scene.clear():
//   pool.restoreToScene(scene);

export class ObjectPool {
  /**
   * @param {{ size: number, create: () => object, reset: (obj: object) => void }} opts
   */
  constructor({ size, create, reset }) {
    this._create = create;
    this._reset  = reset;
    this._free   = [];
    this._active = new Set();

    for (let i = 0; i < size; i++) {
      const obj = create();
      obj._poolRelease = () => this.release(obj);
      this._free.push(obj);
    }
  }

  /**
   * Check out an object.  Grows the pool by one if all slots are in use
   * (avoids hard failures at the cost of a single late allocation).
   */
  acquire() {
    let obj;
    if (this._free.length > 0) {
      obj = this._free.pop();
    } else {
      // Pool exhausted — grow by one and warn so pool sizes can be tuned.
      console.warn('ObjectPool: pool exhausted, growing by 1. Consider increasing size.');
      obj = this._create();
      obj._poolRelease = () => this.release(obj);
    }
    this._active.add(obj);
    return obj;
  }

  /** Return an object to the pool. Calls reset() to park it off-screen. */
  release(obj) {
    if (!this._active.delete(obj)) return;
    this._reset(obj);
    this._free.push(obj);
  }

  /** Release all active objects back to the free list (call before scene.clear). */
  releaseAll() {
    for (const obj of [...this._active]) this.release(obj);
  }

  /**
   * Re-add all managed objects to scene after a scene.clear().
   * Each object must populate _sceneMeshes in its constructor.
   */
  restoreToScene(scene) {
    for (const obj of [...this._free, ...this._active]) {
      if (Array.isArray(obj._sceneMeshes)) {
        for (const m of obj._sceneMeshes) scene.add(m);
      }
    }
  }

  /** Permanently destroy all pool objects (call on full game teardown). */
  dispose() {
    this.releaseAll();
    for (const obj of this._free) {
      if (typeof obj.dispose === 'function') obj.dispose();
    }
    this._free.length = 0;
  }

  get activeCount() { return this._active.size; }
  get freeCount()   { return this._free.length; }
  get totalSize()   { return this._active.size + this._free.length; }
}
