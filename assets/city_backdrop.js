import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────────────────────────
// Buildings run in a row parallel to the road at BACK_DIST laterally.
// They span from Z_NEAR to Z_FAR ahead of the player in local group space
// (local -Z = forward along road after group rotation).
// With fog: false, the distant end (near the vanishing point) stays visible.
const BACK_DIST = 80;    // metres laterally — just outside the 70 m water edge
const Z_NEAR    = 300;   // metres ahead where the nearest building sits
const Z_FAR     = 1500;  // metres ahead where the farthest building sits
const NUM_BLDG  = 26;    // per side

// Water-illumination lights live near the player's Z (local Z ≈ 0) so their
// range can realistically cover the 8–70 m wide water strip.
const NUM_LIGHTS  = 8;
const LIGHT_LAT   = 90;   // metres laterally for lights (just outside buildings)
const LIGHT_Y     = 12;   // metres above road level
const LIGHT_RANGE = 160;
const LIGHT_COLORS = [0xff4400, 0x00ccff, 0xaa44ff, 0xff8800, 0x00ff88, 0xff0066, 0x4499ff, 0xff2266];

// ── Procedural window texture (24×18 px, NearestFilter) ───────────────────────
function makeWindowTex(seed) {
  const W = 24, H = 18;
  const d = new Uint8Array(W * H * 4);
  let s = (seed | 1) >>> 0;
  for (let i = 0; i < W * H; i++) {
    s ^= s << 13; s ^= s >> 7; s ^= s << 17; s >>>= 0;
    const lit  = (s & 0xff) > 85;
    const v    = lit ? 155 + ((s >> 8) & 0x60) : 4;
    const warm = (s >> 4) & 0x1c;
    d[i*4]   = lit ? v + warm : 4;
    d[i*4+1] = lit ? v        : 5;
    d[i*4+2] = lit ? v - warm : 8;
    d[i*4+3] = 255;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// ── Skyline profiles — sine harmonics, range 100–200 m ───────────────────────
function bldgH(i) {
  return 100
    + 60 * Math.abs(Math.sin(i * 1.37 + 0.30))
    + 30 * Math.abs(Math.sin(i * 0.71 + 1.10))
    + 10 * Math.abs(Math.sin(i * 2.89 + 0.70));
}
function bldgW(i) {
  return 28 + 27 * Math.abs(Math.sin(i * 2.11 + 0.60));   // 28–55 m
}

// ── CityBackdrop ──────────────────────────────────────────────────────────────
export class CityBackdrop {
  constructor(scene) {
    this._scene = scene;
    this._group = new THREE.Group();
    this._ldata = [];   // { light, base, freq, phase }
    this._res   = [];   // { geo, mat, tex } for dispose
    scene.add(this._group);
    this._build();
  }

  _build() {
    const g    = this._group;
    const span = Z_FAR - Z_NEAR;
    const step = span / (NUM_BLDG - 1);

    for (const side of [-1, 1]) {
      const bx = side * BACK_DIST;

      // ── Building quads ──────────────────────────────────────────────────────
      // Local Z is negative = ahead (group local -Z aligns with road forward
      // after rotation.y = -player.angle).
      for (let i = 0; i < NUM_BLDG; i++) {
        const lz = -(Z_NEAR + i * step);           // local Z: -300 … -1500
        const si = i + (side < 0 ? 0 : 13);       // seed offset so sides differ
        const h  = bldgH(si);
        const w  = bldgW(si);

        const geo = new THREE.PlaneGeometry(w, h);
        const tex = makeWindowTex(si * 37 + 2741);
        const mat = new THREE.MeshStandardMaterial({
          color:             0x050810,   // near-sky dark so silhouette blends
          roughness:         0.9,
          metalness:         0,
          emissive:          0xffffff,
          emissiveMap:       tex,
          emissiveIntensity: 1.4,
          fog:               false,      // always visible regardless of fog.far
        });
        this._res.push({ geo, mat, tex });

        const mesh = new THREE.Mesh(geo, mat);
        // Base of building sits at group Y (road level); centre at h/2
        mesh.position.set(bx, h * 0.5, lz);
        // Rotate face to point inward toward road centre.
        // Face normal in local group space = side > 0 ? (-1,0,0) : (+1,0,0).
        // Dot with camera direction always = BACK_DIST > 0, so always visible. ✓
        mesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(mesh);
      }

      // ── Water-illumination PointLights ─────────────────────────────────────
      // Placed NEAR the player's Z (local Z ≈ 0) so their range covers the
      // 8–70 m wide water strip beside the road.
      const lSpan = 180;   // lights span ±90 m around the player in local Z
      const lStep = lSpan / (NUM_LIGHTS - 1);
      for (let j = 0; j < NUM_LIGHTS; j++) {
        const lz    = -lSpan / 2 + j * lStep;    // local Z: −90 … +90 m
        const color = LIGHT_COLORS[(j + (side < 0 ? 0 : 4)) % LIGHT_COLORS.length];
        const base  = 22000 + j * 1800;

        const pl = new THREE.PointLight(color, base, LIGHT_RANGE, 1.8);
        pl.position.set(side * LIGHT_LAT, LIGHT_Y, lz);
        g.add(pl);

        this._ldata.push({
          light: pl,
          base,
          freq:  0.5 + j * 0.21,
          phase: j * 1.17 + (side < 0 ? 0 : 2.83),
        });
      }
    }
  }

  // Called every frame from frameL2.
  update(px, pz, pAngle, roadY, time) {
    this._group.position.set(px, roadY, pz);
    this._group.rotation.y = -pAngle;
    for (const { light, base, freq, phase } of this._ldata) {
      light.intensity = base * (0.58 + 0.42 * Math.sin(time * freq + phase));
    }
  }

  dispose() {
    this._scene.remove(this._group);
    for (const { geo, mat, tex } of this._res) {
      geo.dispose(); mat.dispose(); tex.dispose();
    }
    this._ldata.length = 0;
    this._res.length   = 0;
  }
}
