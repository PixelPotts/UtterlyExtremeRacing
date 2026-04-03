import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── AssetRegistry ─────────────────────────────────────────────────────────────
// Central registry for all GLTF assets that must be pre-loaded before gameplay.
// Any module registers its assets at import time; the loading screen calls
// preloadAll() once and every future AssetRegistry.get() is synchronous.
//
// Usage:
//   // In any asset module (fires at import time):
//   AssetRegistry.register('myModel', 'assets/geometry/myModel.glb');
//
//   // In loading screen:
//   await AssetRegistry.preloadAll(onEachLoaded);
//
//   // Anywhere in gameplay:
//   const gltf = AssetRegistry.get('myModel'); // always non-null after preload

const _entries = new Map(); // name → { url, gltf }
const _loader  = new GLTFLoader();

export const AssetRegistry = {
  /** Register a GLTF asset. Safe to call multiple times with the same name. */
  register(name, url) {
    if (!_entries.has(name)) _entries.set(name, { url, gltf: null });
  },

  /** Number of registered assets — add to _TOTAL in the loading counter. */
  count() { return _entries.size; },

  /**
   * Pre-load all registered assets in parallel.
   * @param {Function} onEach  Called once per asset as it finishes loading.
   * @returns {Promise<void>}
   */
  preloadAll(onEach = () => {}) {
    const all = [..._entries.entries()];
    if (all.length === 0) return Promise.resolve();
    return Promise.all(all.map(([name, entry]) =>
      new Promise((resolve, reject) =>
        _loader.load(
          entry.url,
          gltf => { entry.gltf = gltf; onEach(); resolve(); },
          undefined,
          err  => { console.warn(`AssetRegistry: failed to load "${name}"`, err); onEach(); resolve(); }
        )
      )
    ));
  },

  /** Return the cached GLTF for name, or null if not yet loaded. */
  get(name) { return _entries.get(name)?.gltf ?? null; },
};
