import * as THREE from 'three';

// ── Screen-space composite shader ───────────────────────────────────────────
const SCREEN_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;

const SCREEN_FS = /* glsl */`
uniform sampler2D uScene;
uniform float     uStrength;
uniform float     uTime;
uniform vec2      uResolution;
varying vec2      vUv;

float h21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  float s  = uStrength;
  vec2  uv = vUv;

  // ── Effect 1: Pushed back / barrel warp ───────────────────────────────
  // Centre the warp slightly above mid-screen so the road gets pulled hardest
  vec2  c  = uv - vec2(0.5, 0.44);
  float r2 = dot(c, c);
  uv = uv + c * (s * r2 * 3.8);

  // ── Effect 2: Pixelation (blocks grow with strength) ──────────────────
  float blk = 1.0 + s * s * 38.0;
  vec2 pixUv = (floor(uv * uResolution / blk) + 0.5) * blk / uResolution;
  uv = mix(uv, pixUv, smoothstep(0.10, 0.70, s));

  // ── Effect 3: Chromatic aberration (RGB channel split) ────────────────
  float ca = s * 0.024;
  vec3 col;
  col.r = texture2D(uScene, clamp(uv + vec2( ca * 1.7,  ca * 0.5), 0.0, 1.0)).r;
  col.g = texture2D(uScene, clamp(uv + vec2(-ca * 0.4, -ca * 0.3), 0.0, 1.0)).g;
  col.b = texture2D(uScene, clamp(uv - vec2( ca * 1.3,  0.0      ), 0.0, 1.0)).b;

  // ── Effect 4: Colour highlight shift (purple → cyan psychedelic cast) ─
  float lum    = dot(col, vec3(0.299, 0.587, 0.114));
  vec3  ethCol = mix(vec3(0.55, 0.0, 1.0), vec3(0.0, 0.9, 0.85), lum);
  col = mix(col, ethCol * (0.50 + lum * 0.90), s * 0.62);

  // ── Effect 5: Static noise + horizontal glitch bands ──────────────────
  float ft   = floor(uTime * 22.0);
  float noise = h21(uv + ft * vec2(0.17, 0.31));
  float gRow  = step(0.925, h21(vec2(floor(uv.y * 85.0 + ft * 0.6), ft)));
  col += s * (noise * 0.13 + gRow * 0.26);

  // ── Effect 6: Vignette tightens at peak ───────────────────────────────
  col *= 1.0 - s * r2 * 3.2;

  // Hard clip any UV pushed outside [0,1] by the barrel warp
  vec2 inBounds = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  col *= inBounds.x * inBounds.y;

  gl_FragColor = vec4(clamp(col, 0.0, 1.8), 1.0);
}`;

// ── Portal plane shader ──────────────────────────────────────────────────────
const PORTAL_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const PORTAL_FS = /* glsl */`
uniform float uTime;
varying vec2 vUv;

float h21(vec2 p) { p=fract(p*vec2(234.34,435.345)); p+=dot(p,p+34.23); return fract(p.x*p.y); }

void main() {
  vec2 uv = vUv;

  // Multi-layer aurora ripple
  float w1 = sin(uv.y * 11.0 + uTime * 1.5) * 0.5 + 0.5;
  float w2 = sin(uv.x *  7.0 - uTime * 1.1 + uv.y * 3.5) * 0.5 + 0.5;
  float w3 = sin(uv.y * 32.0 + uTime * 7.0) * 0.22 + 0.78;

  vec3 col = mix(
    vec3(0.58, 0.0, 1.0),  // deep violet
    vec3(0.0,  0.85, 1.0), // electric cyan
    w1 * w2
  ) * w3;

  // Fine shimmer
  float sh = h21(floor(uv * vec2(40.0, 58.0) + floor(uTime * 11.0)));
  col += sh * 0.07;

  // Soft edge fade so no hard border
  float fx = smoothstep(0.0, 0.07, uv.x) * smoothstep(1.0, 0.93, uv.x);
  float fy = smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.y);
  float alpha = (0.10 + w1 * 0.30) * fx * fy;

  gl_FragColor = vec4(col, alpha);
}`;

// Shared portal uniforms — all plane instances animate together
const _portalUniforms = { uTime: { value: 0 } };

// Singleton material — never disposed; all portals share the same compiled GPU program.
let _sharedPortalMat = null;
function _makePortalMaterial() {
  if (!_sharedPortalMat) {
    _sharedPortalMat = new THREE.ShaderMaterial({
      vertexShader:   PORTAL_VS,
      fragmentShader: PORTAL_FS,
      uniforms:       _portalUniforms,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.DoubleSide,
      blending:       THREE.AdditiveBlending,
    });
  }
  return _sharedPortalMat;
}

// ── EtherComposer ────────────────────────────────────────────────────────────
export class EtherComposer {
  constructor(renderer, cssW, cssH) {
    this._renderer = renderer;
    this._strength = 0;
    this._portals  = new Map(); // id → { x, z }

    const dpr = Math.min(devicePixelRatio, 2);
    this._rt = new THREE.WebGLRenderTarget(Math.ceil(cssW * dpr), Math.ceil(cssH * dpr), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this._uniforms = {
      uScene:      { value: this._rt.texture },
      uStrength:   { value: 0 },
      uTime:       { value: 0 },
      uResolution: { value: new THREE.Vector2(cssW, cssH) },
    };

    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader:   SCREEN_VS,
        fragmentShader: SCREEN_FS,
        uniforms:       this._uniforms,
        depthTest:      false,
        depthWrite:     false,
      })
    );
    this._screenScene = new THREE.Scene();
    this._screenScene.add(quad);
    this._screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // Build a portal plane mesh — callers add it to scene + decoration list.
  makePortalMesh(worldX, worldZ, angle, pathY) {
    const geo  = new THREE.PlaneGeometry(600, 130);
    const mesh = new THREE.Mesh(geo, _makePortalMaterial());
    mesh.position.set(worldX, pathY + 65, worldZ);
    // Rotate so the plane spans laterally (perpendicular to road travel)
    mesh.rotation.y = -angle;
    return mesh;
  }

  addPortal(id, x, z)  { this._portals.set(id, { x, z }); }
  removePortal(id)      { this._portals.delete(id); }

  render(scene, cam, playerX, playerZ, dt) {
    // Tick portal plane animation
    _portalUniforms.uTime.value += dt;
    this._uniforms.uTime.value  += dt;

    // Distance to nearest portal → smooth strength
    let minDist = Infinity;
    for (const p of this._portals.values()) {
      const d = Math.hypot(playerX - p.x, playerZ - p.z);
      if (d < minDist) minDist = d;
    }
    const MAX_DIST = 135;
    const raw    = this._portals.size > 0 ? Math.max(0, 1 - minDist / MAX_DIST) : 0;
    const target = raw * raw * (3 - 2 * raw); // smoothstep
    this._strength += (target - this._strength) * Math.min(dt * 3.5, 1);
    this._uniforms.uStrength.value = this._strength;

    // Fast path when inactive
    if (this._strength < 0.002 && this._portals.size === 0) {
      const _r0 = performance.now();
      this._renderer.setRenderTarget(null);
      this._renderer.render(scene, cam);
      const _ms = performance.now() - _r0;
      if (_ms > 5) window._etherDbg?.(`RENDER_FAST\tms=${_ms.toFixed(1)}`);
      return;
    }

    if (!this._fullPathUsed) {
      this._fullPathUsed = true;
      window._etherDbg?.('RENDER_FULL_FIRST');
    }
    const _r0 = performance.now();
    this._renderer.setRenderTarget(this._rt);
    this._renderer.render(scene, cam);
    const _ms1 = performance.now() - _r0;
    const _r1 = performance.now();
    this._renderer.setRenderTarget(null);
    this._renderer.render(this._screenScene, this._screenCam);
    const _ms2 = performance.now() - _r1;
    if (_ms1 > 5 || _ms2 > 5) window._etherDbg?.(`RENDER_FULL\tms1=${_ms1.toFixed(1)}\tms2=${_ms2.toFixed(1)}`);
  }

  resize(cssW, cssH) {
    const dpr = Math.min(devicePixelRatio, 2);
    this._rt.setSize(Math.ceil(cssW * dpr), Math.ceil(cssH * dpr));
    this._uniforms.uResolution.value.set(cssW, cssH);
  }

  // Pre-warm both the portal plane shader (in main scene) and the screen-space
  // composite shader (in _screenScene) so neither compiles mid-game.
  // Returns a Promise that resolves after both compileAsync calls finish.
  warmupCompile(renderer, scene, cam) {
    const dummy = this.makePortalMesh(0, -5000, 0, -5000);
    scene.add(dummy);
    return Promise.all([
      renderer.compileAsync(scene, cam),
      renderer.compileAsync(this._screenScene, this._screenCam),
    ]).then(() => {
      scene.remove(dummy);
      dummy.geometry.dispose();
      // Do NOT dispose dummy.material — it is the shared singleton; keeping it alive
      // ensures the compiled GPU program stays in Three.js's cache permanently.
    });
  }

  dispose() { this._rt.dispose(); }
}
