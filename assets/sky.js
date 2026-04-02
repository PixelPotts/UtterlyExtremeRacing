import * as THREE from 'three';

// ── Sky presets ─────────────────────────────────────────────────────────────
// Each preset defines the full atmospheric state for a biome.
const PRESETS = {

  // Trees / default — dark overcast, threatening rain
  overcastStorm: {
    bg:            0x3E4A52,
    fog:           0x3E4A52,
    fogNear:       55,
    fogFar:        210,
    sunColor:      0xB0C4CC,
    sunIntensity:  0.04 * Math.PI,
    ambColor:      0x8AAABB,
    ambIntensity:  0.08 * Math.PI,
    cloudColor:    0x6A7880,
    cloudOpacity:  0.82,
    rainOpacity:   0.45,
  },

  // Dirt — hot, dusty, sun-baked. Haze closes in close.
  desertHaze: {
    bg:            0xA07850,
    fog:           0x9E7548,
    fogNear:       38,
    fogFar:        165,
    sunColor:      0xFFCC88,
    sunIntensity:  0.065 * Math.PI,
    ambColor:      0xC09070,
    ambIntensity:  0.10 * Math.PI,
    cloudColor:    0x9E8060,
    cloudOpacity:  0.45,
    rainOpacity:   0.0,
  },

  // Buildings / city — grey smog, flat light, close draw
  citySmog: {
    bg:            0x7A8090,
    fog:           0x808898,
    fogNear:       38,
    fogFar:        175,
    sunColor:      0xBBBBCC,
    sunIntensity:  0.025 * Math.PI,
    ambColor:      0x9999AA,
    ambIntensity:  0.07 * Math.PI,
    cloudColor:    0x888898,
    cloudOpacity:  0.90,
    rainOpacity:   0.25,
  },

  // Bridge — open sky over water, bright, far horizon
  openWater: {
    bg:            0x4A7090,
    fog:           0x6080A8,
    fogNear:       70,
    fogFar:        295,
    sunColor:      0xFFEECC,
    sunIntensity:  0.07 * Math.PI,
    ambColor:      0x7799BB,
    ambIntensity:  0.09 * Math.PI,
    cloudColor:    0xCCDDEE,
    cloudOpacity:  0.68,
    rainOpacity:   0.0,
  },
};

// null = don't change sky (e.g. tunnel — sky is invisible inside geometry)
const ZONE_PRESET = {
  start:        'overcastStorm',
  trees:        'overcastStorm',
  dirt:         'desertHaze',
  buildings:    'citySmog',
  intersection: 'citySmog',
  bridge:       'openWater',
  tunnel:       null,
};

const LERP_SPEED = 0.8;   // ~90% of transition complete in ~2.9 s
const _tmp = new THREE.Color();

// ── Sky ─────────────────────────────────────────────────────────────────────
export class Sky {
  // scene    : THREE.Scene  (must already have .background Color and .fog Fog)
  // sun      : THREE.DirectionalLight
  // ambLight : THREE.AmbientLight
  // cloudMat : THREE.MeshLambertMaterial used for all cloud puffs
  // rainMesh : THREE.LineSegments (rain streaks)
  constructor(scene, sun, ambLight, cloudMat, rainMesh) {
    this._scene    = scene;
    this._sun      = sun;
    this._amb      = ambLight;
    this._cloudMat = cloudMat;
    this._rainMesh = rainMesh;

    // Current interpolated state
    this._bg    = new THREE.Color();
    this._fog   = new THREE.Color();
    this._sun_c = new THREE.Color();
    this._amb_c = new THREE.Color();
    this._cloud = new THREE.Color();

    this._fogNear    = 55;
    this._fogFar     = 210;
    this._cloudOpac  = 0.82;
    this._rainOpac   = 0.45;
    this._sunInt     = PRESETS.overcastStorm.sunIntensity;
    this._ambInt     = PRESETS.overcastStorm.ambIntensity;

    this._targetName = 'overcastStorm';

    this._applyImmediate('overcastStorm');
  }

  // Returns the current background hex — used by lightning to restore after flash
  get normalBg() { return this._bg.getHex(); }

  // Re-apply current interpolated state — call after external color override (lightning)
  restore() { this._push(); }

  // Call once per frame; transitions smoothly toward the preset for the given zone
  setZone(zone) {
    const name = ZONE_PRESET[zone];
    if (!name || name === this._targetName) return;
    this._targetName = name;
  }

  update(dt) {
    const target = PRESETS[this._targetName];
    if (!target) return;
    const f = Math.min(1, LERP_SPEED * dt);

    _tmp.setHex(target.bg);        this._bg.lerp(_tmp, f);
    _tmp.setHex(target.fog);       this._fog.lerp(_tmp, f);
    _tmp.setHex(target.sunColor);  this._sun_c.lerp(_tmp, f);
    _tmp.setHex(target.ambColor);  this._amb_c.lerp(_tmp, f);
    _tmp.setHex(target.cloudColor); this._cloud.lerp(_tmp, f);

    this._fogNear   += (target.fogNear        - this._fogNear)   * f;
    this._fogFar    += (target.fogFar         - this._fogFar)    * f;
    this._cloudOpac += (target.cloudOpacity   - this._cloudOpac) * f;
    this._rainOpac  += (target.rainOpacity    - this._rainOpac)  * f;
    this._sunInt    += (target.sunIntensity   - this._sunInt)    * f;
    this._ambInt    += (target.ambIntensity   - this._ambInt)    * f;

    this._push();
  }

  _applyImmediate(name) {
    const p = PRESETS[name];
    this._bg.setHex(p.bg);
    this._fog.setHex(p.fog);
    this._sun_c.setHex(p.sunColor);
    this._amb_c.setHex(p.ambColor);
    this._cloud.setHex(p.cloudColor);
    this._fogNear   = p.fogNear;
    this._fogFar    = p.fogFar;
    this._cloudOpac = p.cloudOpacity;
    this._rainOpac  = p.rainOpacity;
    this._sunInt    = p.sunIntensity;
    this._ambInt    = p.ambIntensity;
    this._push();
  }

  _push() {
    this._scene.background.copy(this._bg);
    this._scene.fog.color.copy(this._fog);
    this._scene.fog.near = this._fogNear;
    this._scene.fog.far  = this._fogFar;
    this._sun.color.copy(this._sun_c);
    this._sun.intensity = this._sunInt;
    this._amb.color.copy(this._amb_c);
    this._amb.intensity = this._ambInt;
    this._cloudMat.color.copy(this._cloud);
    this._cloudMat.opacity = this._cloudOpac;
    if (this._rainMesh) {
      this._rainMesh.material.opacity = this._rainOpac;
      this._rainMesh.visible = this._rainOpac > 0.01;
    }
  }
}
