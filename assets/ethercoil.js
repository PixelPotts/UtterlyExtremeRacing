import * as THREE from 'three';

// ── Toroid shader ─────────────────────────────────────────────────────────────
const TOROID_VS = /* glsl */`
uniform float uCharge;
uniform float uTime;
varying vec3 vNorm;
varying vec2 vUv;
void main() {
  vec3 pos = position;
  float rip = sin(uv.x * 28.0 + uTime * 18.0) * uCharge * 0.18;
  pos += normal * rip;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  vNorm = normalize(normalMatrix * normal);
  vUv   = uv;
}`;

const TOROID_FS = /* glsl */`
uniform float uCharge;
uniform float uTime;
varying vec3 vNorm;
varying vec2 vUv;
void main() {
  vec3  base  = vec3(0.25, 0.26, 0.30);
  float fres  = pow(1.0 - abs(dot(vNorm, vec3(0.0, 1.0, 0.0))), 2.5);
  float pulse = sin(uTime * 9.0) * 0.5 + 0.5;
  vec3  arc   = mix(vec3(0.55, 0.0, 1.0), vec3(0.0, 0.85, 1.0), pulse);
  float gAmt  = uCharge * uCharge;
  vec3  col   = base + arc * (fres * 1.4 + gAmt * 2.2);
  gl_FragColor = vec4(col, 1.0);
}`;

// ── Bolt core shader ──────────────────────────────────────────────────────────
const BOLT_FS = /* glsl */`
uniform float uAge;
varying vec2 vUv;
void main() {
  float radial = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float core   = pow(radial, 1.5);
  float fade   = 1.0 - uAge * uAge;
  vec3  hot    = mix(vec3(0.3, 0.6, 1.0), vec3(1.0), core);
  gl_FragColor = vec4(hot * fade * 2.5, core * fade);
}`;

const BOLT_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// ── Glow halo shader ──────────────────────────────────────────────────────────
const GLOW_FS = /* glsl */`
uniform float uAge;
varying vec2 vUv;
void main() {
  float radial = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float fade   = (1.0 - uAge) * 0.35;
  gl_FragColor = vec4(0.2, 0.45, 1.0, radial * radial * fade);
}`;

// ── Impact flash shader ───────────────────────────────────────────────────────
const IMPACT_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const IMPACT_FS = /* glsl */`
uniform float uAge;
varying vec2 vUv;
void main() {
  float r    = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(0.6, 0.3, r) - smoothstep(0.3, 0.0, r);
  float fade = 1.0 - uAge;
  vec3  col  = mix(vec3(0.2, 0.5, 1.0), vec3(1.0), 1.0 - r);
  gl_FragColor = vec4(col * (1.0 + ring), (smoothstep(1.0, 0.0, r) + ring * 0.6) * fade);
}`;

// ── Fractal midpoint displacement ─────────────────────────────────────────────
function _fracture(pts, depth, spread) {
  if (depth === 0) return pts;
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const mid = a.clone().lerp(b, 0.5 + (Math.random() - 0.5) * 0.3);
    const dx = b.x - a.x, dz = b.z - a.z;
    mid.x += -dz * (Math.random() - 0.5) * spread;
    mid.z +=  dx * (Math.random() - 0.5) * spread;
    mid.y +=     (Math.random() - 0.5) * spread * 0.25;
    out.push(a, mid);
  }
  out.push(pts[pts.length - 1]);
  return _fracture(out, depth - 1, spread * 0.58);
}

// ── Static shared geometry ────────────────────────────────────────────────────
const _steelMat = new THREE.MeshPhongMaterial({ color: 0x2a2d35, flatShading: true });
const _copperMat = new THREE.MeshStandardMaterial({
  color: 0xb87333, metalness: 0.8, roughness: 0.25,
  emissive: new THREE.Color(0x1a0800), emissiveIntensity: 1.0,
});

// ── EtherCoil ────────────────────────────────────────────────────────────────
export class EtherCoil {
  /**
   * @param {THREE.Scene} scene
   * @param {number} x        world X of coil base
   * @param {number} z        world Z of coil base
   * @param {number} groundY  road/ground Y at placement
   * @param {number} roadX    road centre X (for player hit detection reference)
   * @param {number} roadZ    road centre Z
   * @param {Function} getActx  () => AudioContext | null
   * @param {Function} onHit        called on direct hit (<8 m)
   * @param {Function} onNearMiss   called on near miss (8–18 m)
   */
  constructor(scene, x, z, groundY, roadX, roadZ, getActx, onHit, onNearMiss) {
    this._scene    = scene;
    this._x        = x;
    this._z        = z;
    this._groundY  = groundY;
    this._getActx  = getActx;
    this._onHit    = onHit;
    this._onNearMiss = onNearMiss;

    this._group = new THREE.Group();
    this._group.position.set(x, groundY, z);
    scene.add(this._group);

    // Phase state machine
    // phases: idle | charge | prestrike | strike | decay | rest
    this._phase      = 'idle';
    this._phaseTimer = 0;
    this._strikeFlicker = 0;
    this._flickOn       = false;
    this._hitFired      = false;
    this._targetX = x;
    this._targetZ = z;

    // Audio handles
    this._chargeOscA  = null;
    this._chargeOscB  = null;
    this._chargeFilter= null;
    this._chargeGain  = null;

    // Three separate uniform sets — driven bottom-up during charge
    this._toroidUniBott  = { uCharge: { value: 0 }, uTime: { value: 0.0 } };  // lowest / largest
    this._toroidUniMid   = { uCharge: { value: 0 }, uTime: { value: 2.1 } };  // middle
    this._toroidUniforms = { uCharge: { value: 0 }, uTime: { value: 4.3 } };  // crown (original)
    this._boltCoreUni    = { uAge: { value: 0 } };
    this._boltGlowUni    = { uAge: { value: 0 } };
    this._impactUni      = { uAge: { value: 1 } };

    this._buildCoil();
    this._buildBoltRig();
  }

  // ── Static geometry ─────────────────────────────────────────────────────────
  _buildCoil() {
    const g = this._group;

    // ── Base ring
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(7, 0.55, 5, 18),
      _steelMat
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.1;
    g.add(baseRing);

    // ── Bottom socket
    const socket = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.5, 3, 8),
      _steelMat
    );
    socket.position.y = 1.5;
    g.add(socket);

    // ── 3 support legs, angled 25° outward, spaced 120°
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 1.1, 14, 6),
        _steelMat
      );
      const angle = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(angle) * 5.5, 4.5, Math.sin(angle) * 5.5);
      leg.rotation.z = (Math.cos(angle) * 25 * Math.PI) / 180;
      leg.rotation.x = (Math.sin(angle) * 25 * Math.PI) / 180;
      g.add(leg);
    }

    // ── Inner support column (y=3→27)
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 24, 6),
      _steelMat
    );
    col.position.y = 3 + 12;
    g.add(col);

    // ── 4 vertical struts at r=2.8, 90° apart + cross-braces
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 24, 4),
        _steelMat
      );
      strut.position.set(Math.cos(a) * 2.8, 3 + 12, Math.sin(a) * 2.8);
      g.add(strut);

      // Cross-braces at y=9,15,21
      for (const braceY of [9, 15, 21]) {
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.18, 2.8 * 2),
          _steelMat
        );
        brace.position.set(0, braceY, 0);
        brace.rotation.y = a + Math.PI / 4;
        g.add(brace);
      }
    }

    // ── Helix winding: 20 turns × 10 pts/turn = 200 points
    {
      const pts = [];
      const turns = 20, ppt = 10, R = 3.2, H = 22;
      for (let i = 0; i <= turns * ppt; i++) {
        const t = i / (turns * ppt);
        const θ = t * turns * Math.PI * 2;
        pts.push(new THREE.Vector3(R * Math.cos(θ), 3 + t * H, R * Math.sin(θ)));
      }
      const curve  = new THREE.CatmullRomCurve3(pts);
      const helixGeo = new THREE.TubeGeometry(curve, 400, 0.10, 5, false);
      const helix = new THREE.Mesh(helixGeo, _copperMat.clone());
      this._helixMesh = helix;
      g.add(helix);
    }

    // ── Primary coil: 3 pancake rings at base
    for (let i = 0; i < 3; i++) {
      const r = [4.5, 4.0, 3.5][i];
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.14, 5, 22),
        _copperMat
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 3.5 + i * 0.9;
      g.add(ring);
    }

    // ── Three stacked toroids: bottom (largest) → middle → crown (smallest)
    const _mkToroid = (radius, tube, y, unis) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader:   TOROID_VS,
        fragmentShader: TOROID_FS,
        uniforms:       unis,
        side:           THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 20, 50), mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = y;
      g.add(mesh);
      return mesh;
    };

    _mkToroid(10.5, 1.5, 15.5, this._toroidUniBott);  // bottom — largest
    _mkToroid( 8.5, 1.8, 22.0, this._toroidUniMid);   // middle
    const crownMesh = _mkToroid(6.5, 2.2, 28.5, this._toroidUniforms); // crown
    this._toroid = crownMesh;

    // ── Inner discharge ball (shares crown material)
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 10, 8),
      crownMesh.material
    );
    ball.position.y = 28.5;
    g.add(ball);

    // ── Charge point light (starts off)
    const ptLight = new THREE.PointLight(0x8800ff, 0, 80);
    ptLight.position.y = 28.5;
    g.add(ptLight);
    this._ptLight = ptLight;

    // ── Impact point light (at ground, starts off)
    const impactLight = new THREE.PointLight(0x88aaff, 0, 60);
    impactLight.position.set(0, 0.5, 0);
    this._scene.add(impactLight);   // world space — positioned at strike point
    this._impactLight = impactLight;
  }

  // ── Bolt rig (hidden until strike) ─────────────────────────────────────────
  _buildBoltRig() {
    const boltCoreMat = new THREE.ShaderMaterial({
      vertexShader:   BOLT_VS,
      fragmentShader: BOLT_FS,
      uniforms:       this._boltCoreUni,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      side:           THREE.DoubleSide,
    });
    const boltGlowMat = new THREE.ShaderMaterial({
      vertexShader:   BOLT_VS,
      fragmentShader: GLOW_FS,
      uniforms:       this._boltGlowUni,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      side:           THREE.DoubleSide,
    });
    const impactMat = new THREE.ShaderMaterial({
      vertexShader:   IMPACT_VS,
      fragmentShader: IMPACT_FS,
      uniforms:       this._impactUni,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      side:           THREE.DoubleSide,
    });

    // Placeholder geometry — rebuilt each strike
    const dummyGeo = new THREE.BufferGeometry();
    this._boltCoreMesh = new THREE.Mesh(dummyGeo, boltCoreMat);
    this._boltGlowMesh = new THREE.Mesh(dummyGeo.clone(), boltGlowMat);
    this._boltCoreMesh.visible = false;
    this._boltGlowMesh.visible = false;
    this._scene.add(this._boltCoreMesh);
    this._scene.add(this._boltGlowMesh);

    // Branches (3 max)
    this._branches = [];
    for (let i = 0; i < 3; i++) {
      const bm = new THREE.Mesh(dummyGeo.clone(), boltCoreMat);
      bm.visible = false;
      this._scene.add(bm);
      this._branches.push(bm);
    }

    // Impact disc (world space, near ground)
    const impactGeo = new THREE.CircleGeometry(9, 24);
    this._impactMesh = new THREE.Mesh(impactGeo, impactMat);
    this._impactMesh.rotation.x = -Math.PI / 2;
    this._impactMesh.visible = false;
    this._scene.add(this._impactMesh);
  }

  // ── Rebuild bolt geometry toward target ─────────────────────────────────────
  _rebuildBolt(tx, tz) {
    const start = new THREE.Vector3(
      this._x, this._groundY + 28.5, this._z
    );
    const end = new THREE.Vector3(tx, this._groundY + 0.3, tz);

    const pts = _fracture([start, end], 5, 8.0);

    const curve = new THREE.CatmullRomCurve3(pts);
    const n = pts.length;

    // Core
    const oldCore = this._boltCoreMesh.geometry;
    this._boltCoreMesh.geometry = new THREE.TubeGeometry(curve, n * 2, 0.28, 5, false);
    oldCore.dispose();

    // Glow
    const oldGlow = this._boltGlowMesh.geometry;
    this._boltGlowMesh.geometry = new THREE.TubeGeometry(curve, n, 1.8, 5, false);
    oldGlow.dispose();

    // Branches: pick 2–3 split points between 25% and 60% along main path
    const numBranch = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < this._branches.length; i++) {
      const bm = this._branches[i];
      if (i >= numBranch) { bm.visible = false; continue; }
      const splitIdx = Math.floor(pts.length * (0.25 + Math.random() * 0.35));
      const bStart = pts[splitIdx].clone();
      const bEnd = end.clone().add(
        new THREE.Vector3((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20)
      );
      const bPts = _fracture([bStart, bEnd], 3, 4.0);
      const bCurve = new THREE.CatmullRomCurve3(bPts);
      const oldB = bm.geometry;
      bm.geometry = new THREE.TubeGeometry(bCurve, bPts.length * 2, 0.14, 4, false);
      oldB.dispose();
      bm.visible = true;
    }

    // Position impact disc
    this._impactMesh.position.set(tx, this._groundY + 0.05, tz);
    this._impactLight.position.set(tx, this._groundY + 1.5, tz);
  }

  // ── Audio: charge hum ────────────────────────────────────────────────────────
  _startCharge(actx) {
    if (!actx || this._chargeOscA) return;
    try {
      this._chargeFilter = actx.createBiquadFilter();
      this._chargeFilter.type = 'bandpass';
      this._chargeFilter.Q.value = 3;
      this._chargeFilter.frequency.value = 400;

      this._chargeGain = actx.createGain();
      this._chargeGain.gain.value = 0;

      const now = actx.currentTime;
      this._chargeFilter.frequency.linearRampToValueAtTime(2200, now + 2.8);
      this._chargeGain.gain.linearRampToValueAtTime(0.09, now + 2.8);

      this._chargeOscA = actx.createOscillator();
      this._chargeOscA.type = 'sawtooth';
      this._chargeOscA.frequency.value = 80;
      this._chargeOscA.frequency.linearRampToValueAtTime(520, now + 2.8);
      this._chargeOscA.detune.value = -4;

      this._chargeOscB = actx.createOscillator();
      this._chargeOscB.type = 'square';
      this._chargeOscB.frequency.value = 80;
      this._chargeOscB.frequency.linearRampToValueAtTime(520, now + 2.8);
      this._chargeOscB.detune.value = 4;

      this._chargeOscA.connect(this._chargeFilter);
      this._chargeOscB.connect(this._chargeFilter);
      this._chargeFilter.connect(this._chargeGain);
      this._chargeGain.connect(actx.destination);

      this._chargeOscA.start(now);
      this._chargeOscB.start(now);
    } catch (e) { /* audio unavailable */ }
  }

  _stopCharge() {
    try {
      this._chargeOscA?.stop();
      this._chargeOscB?.stop();
    } catch (e) {}
    this._chargeOscA  = null;
    this._chargeOscB  = null;
    this._chargeFilter= null;
    this._chargeGain  = null;
  }

  // ── Audio: strike crack ──────────────────────────────────────────────────────
  _fireCrack(actx) {
    if (!actx) return;
    try {
      const dur = 0.8;
      const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * dur), actx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);

      const now = actx.currentTime;

      // Crack layer: fast exp decay
      const crackGain = actx.createGain();
      crackGain.gain.setValueAtTime(0.7, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      // Rumble layer: low-pass + slow decay
      const rumbleLp = actx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.value = 280;
      const rumbleGain = actx.createGain();
      rumbleGain.gain.setValueAtTime(0.4, now);
      rumbleGain.gain.setTargetAtTime(0.001, now, 0.4);

      const srcCrack  = actx.createBufferSource();
      srcCrack.buffer = buf;
      srcCrack.connect(crackGain).connect(actx.destination);
      srcCrack.start(now);

      const srcRumble = actx.createBufferSource();
      srcRumble.buffer = buf;
      srcRumble.connect(rumbleLp).connect(rumbleGain).connect(actx.destination);
      srcRumble.start(now);
    } catch (e) {}
  }

  // ── Audio: near-miss crackle ─────────────────────────────────────────────────
  _fireNearMiss(actx) {
    if (!actx) return;
    try {
      const now = actx.createOscillator ? actx.currentTime : null;
      if (now === null) return;
      const osc  = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.connect(gain).connect(actx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  // ── State machine update ─────────────────────────────────────────────────────
  /**
   * @param {number} dt   delta time in seconds
   * @param {number} px   player world X
   * @param {number} pz   player world Z
   */
  // Helper: set all three toroid charge values
  _setCharge(bott, mid, top) {
    this._toroidUniBott.uCharge.value  = bott;
    this._toroidUniMid.uCharge.value   = mid;
    this._toroidUniforms.uCharge.value = top;
  }

  update(dt, px, pz) {
    const actx = this._getActx();
    const dist = Math.hypot(px - this._x, pz - this._z);
    const u    = this._toroidUniforms;
    // Tick uTime for all three (each has its own phase offset baked in)
    this._toroidUniBott.uTime.value += dt;
    this._toroidUniMid.uTime.value  += dt;
    u.uTime.value += dt;

    switch (this._phase) {
      case 'idle': {
        if (dist < 220) {
          // Lock target with slight spread toward player pos
          const spread = 6;
          this._targetX = px + (Math.random() - 0.5) * spread;
          this._targetZ = pz + (Math.random() - 0.5) * spread;
          this._phase = 'charge';
          this._phaseTimer = 0;
          this._hitFired = false;
          this._startCharge(actx);
        }
        break;
      }

      case 'charge': {
        this._phaseTimer += dt;
        const T = 2.8;
        const ct = this._phaseTimer;
        // Bottom fires first (full at 50%), middle next (starts 25%, full 75%), top last (starts 50%, full 100%)
        const cBott = Math.min(1, ct / (T * 0.5));
        const cMid  = Math.min(1, Math.max(0, (ct - T * 0.25) / (T * 0.5)));
        const cTop  = Math.min(1, Math.max(0, (ct - T * 0.50) / (T * 0.5)));
        this._setCharge(cBott, cMid, cTop);
        const t = cTop; // used for light intensity + target tracking
        this._ptLight.intensity = t * 18;
        // Continuously re-track player during charge
        const spread = 6;
        this._targetX = px + (Math.random() - 0.5) * spread * (1 - t);
        this._targetZ = pz + (Math.random() - 0.5) * spread * (1 - t);
        if (this._phaseTimer >= 2.8) {
          this._stopCharge();
          this._phase = 'prestrike';
          this._phaseTimer = 0;
        }
        break;
      }

      case 'prestrike': {
        this._phaseTimer += dt;
        this._setCharge(1, 1, 1);
        this._ptLight.intensity = 24;
        if (this._phaseTimer >= 0.05) {
          // Build bolt geometry
          this._rebuildBolt(this._targetX, this._targetZ);
          this._boltCoreUni.uAge.value = 0;
          this._boltGlowUni.uAge.value = 0;
          this._impactUni.uAge.value   = 0;
          this._boltCoreMesh.visible   = true;
          this._boltGlowMesh.visible   = true;
          this._impactMesh.visible     = true;
          this._impactLight.intensity  = 80;
          this._fireCrack(actx);
          // Hit detection
          if (!this._hitFired) {
            this._hitFired = true;
            const hitDist = Math.hypot(px - this._targetX, pz - this._targetZ);
            if (hitDist < 8) {
              this._onHit?.();
            } else if (hitDist < 18) {
              this._onNearMiss?.();
              this._fireNearMiss(actx);
            }
          }
          this._phase = 'strike';
          this._phaseTimer = 0;
          this._strikeFlicker = 0;
          this._flickOn = true;
        }
        break;
      }

      case 'strike': {
        this._phaseTimer += dt;
        this._strikeFlicker += dt;

        // Flicker: 3 frames ~on, 1 ~off, repeating (roughly 60fps cadence)
        const flickPeriod = 4 / 60;
        const flickPhase  = (this._strikeFlicker % flickPeriod) / flickPeriod;
        this._flickOn = flickPhase < 0.75;

        if (this._flickOn) {
          // Rebuild for random fracture each flicker
          if (flickPhase < 0.05) {
            this._rebuildBolt(this._targetX, this._targetZ);
          }
          this._boltCoreMesh.visible = true;
          this._boltGlowMesh.visible = true;
        } else {
          this._boltCoreMesh.visible = false;
          this._boltGlowMesh.visible = false;
        }

        const age = this._phaseTimer / 0.25;
        this._boltCoreUni.uAge.value = Math.min(age, 1);
        this._boltGlowUni.uAge.value = Math.min(age, 1);
        this._impactUni.uAge.value   = Math.min(age, 1);
        this._impactLight.intensity  = 80 * (1 - age);

        if (this._phaseTimer >= 0.25) {
          this._boltCoreMesh.visible = false;
          this._boltGlowMesh.visible = false;
          this._branches.forEach(b => { b.visible = false; });
          this._impactMesh.visible   = false;
          this._impactLight.intensity = 0;
          this._phase = 'decay';
          this._phaseTimer = 0;
        }
        break;
      }

      case 'decay': {
        this._phaseTimer += dt;
        const t = this._phaseTimer / 0.6;
        const c = Math.max(0, 1 - t);
        this._setCharge(c, c, c);
        this._ptLight.intensity = Math.max(0, 18 * c);
        if (this._phaseTimer >= 0.6) {
          this._setCharge(0, 0, 0);
          this._ptLight.intensity = 0;
          this._phase = 'rest';
          this._phaseTimer = 0;
        }
        break;
      }

      case 'rest': {
        this._phaseTimer += dt;
        if (this._phaseTimer >= 1.2) {
          this._phase = 'idle';
          this._phaseTimer = 0;
        }
        break;
      }
    }
  }

  // ── Dispose ──────────────────────────────────────────────────────────────────
  dispose() {
    this._stopCharge();
    this._scene.remove(this._group);
    this._group.traverse(c => {
      if (c.isMesh) {
        c.geometry.dispose();
        if (!c.material.isShared) c.material.dispose();
      }
    });
    this._scene.remove(this._boltCoreMesh);
    this._scene.remove(this._boltGlowMesh);
    this._scene.remove(this._impactMesh);
    this._scene.remove(this._impactLight);
    this._branches.forEach(b => {
      this._scene.remove(b);
      b.geometry.dispose();
    });
    this._boltCoreMesh.geometry.dispose();
    this._boltGlowMesh.geometry.dispose();
  }
}
