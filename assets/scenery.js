import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Procedural bark textures (generated once at module load)
// ─────────────────────────────────────────────────────────────────────────────

function _barkTex(drawFn, repS = 2, repT = 4) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  drawFn(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repS, repT); return t;
}

const _birchTex = _barkTex(ctx => {
  ctx.fillStyle = '#CECAB5'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 55; i++) {             // grain streaks
    const x = Math.random() * 256;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(148,138,118,${(Math.random() * 0.22).toFixed(2)})`;
    ctx.lineWidth = Math.random() < 0.3 ? 2 : 1;
    ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 14, 256); ctx.stroke();
  }
  for (let y = 10; y < 256; y += 14 + Math.random() * 26) { // lenticels
    for (let x = Math.random() * 40; x < 260; x += 42 + Math.random() * 52) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(28,12,4,${(0.50 + Math.random() * 0.36).toFixed(2)})`;
      ctx.ellipse(x, y, 10 + Math.random() * 16, 1.5 + Math.random() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
});

const _pineTex = _barkTex(ctx => {
  ctx.fillStyle = '#3A1A06'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 9 + Math.random() * 11) {   // scales
    for (let x = 0; x < 256; x += 10 + Math.random() * 14) {
      const pw = 9 + Math.random() * 13 | 0, ph = 7 + Math.random() * 8 | 0;
      ctx.fillStyle = `rgb(${56 + Math.random() * 36 | 0},${20 + Math.random() * 18 | 0},4)`;
      ctx.fillRect(x, y, pw, ph);
      ctx.strokeStyle = 'rgba(8,2,0,0.65)'; ctx.lineWidth = 0.5; ctx.strokeRect(x, y, pw, ph);
    }
  }
  for (let i = 0; i < 14; i++) {              // fissures
    let x = Math.random() * 256; ctx.beginPath(); ctx.moveTo(x, 0);
    for (let s = 0; s < 8; s++) { x += (Math.random() - 0.5) * 9; ctx.lineTo(x, s * 33); }
    ctx.strokeStyle = `rgba(6,1,0,${(0.58 + Math.random() * 0.32).toFixed(2)})`;
    ctx.lineWidth = 1 + Math.random() * 1.8; ctx.stroke();
  }
});

const _oakTex = _barkTex(ctx => {
  ctx.fillStyle = '#5A3C26'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++) {              // plates
    const x = Math.random() * 256, y = Math.random() * 256;
    const w = 20 + Math.random() * 40 | 0, h = 16 + Math.random() * 34 | 0;
    ctx.fillStyle = `rgba(${86 + Math.random() * 42 | 0},${58 + Math.random() * 28 | 0},${26 + Math.random() * 20 | 0},0.44)`;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
  }
  for (let i = 0; i < 24; i++) {              // furrows
    let x = Math.random() * 256; ctx.beginPath(); ctx.moveTo(x, 0);
    for (let s = 0; s < 9; s++) { x += (Math.random() - 0.5) * 18; ctx.lineTo(x, s * 29); }
    ctx.strokeStyle = `rgba(15,6,2,${(0.42 + Math.random() * 0.36).toFixed(2)})`;
    ctx.lineWidth = 0.8 + Math.random() * 2.0; ctx.stroke();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────────────────────

const _mBirch = new THREE.MeshLambertMaterial({ color: 0xE2DAC2, map: _birchTex });
const _mPine  = new THREE.MeshLambertMaterial({ color: 0x784420, map: _pineTex  });
const _mOak   = new THREE.MeshLambertMaterial({ color: 0x886848, map: _oakTex   });

const _pick = arr => arr[Math.random() * arr.length | 0];

const _lBirch = [0xB2CC56, 0xCADE68, 0xA0C63E, 0xD2E86E, 0xB6CE58].map(c => new THREE.MeshLambertMaterial({ color: c }));
const _lPine  = [0x183618, 0x112A10, 0x1C3C1A, 0x0E2210, 0x1E3A18].map(c => new THREE.MeshLambertMaterial({ color: c }));
const _lOak   = [0x2A5620, 0x386228, 0x1E4816, 0x32602E, 0x265E26].map(c => new THREE.MeshLambertMaterial({ color: c }));
const _lGeneric=[0x2D6A2D, 0x1E5C1E, 0x387038, 0x295929, 0x4A9A3A].map(c => new THREE.MeshLambertMaterial({ color: c }));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Tapered cylinder from y=0 to y=h. shadow only when explicitly requested.
function _cyl(mat, rb, rt, h, segs = 7, shadow = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
  m.position.y = h * 0.5; if (shadow) m.castShadow = true; return m;
}

// Branch group attached to parent at height y.
// tiltX: 0=straight up, π/2=horizontal, >π/2=drooping.
// Returns group so caller can add leaves directly.
function _arm(parent, mat, y, len, rb, rt, tiltX, yaw) {
  const g = new THREE.Group();
  g.position.y = y; g.rotation.y = yaw; g.rotation.x = tiltX;
  g.add(_cyl(mat, rb, rt, len));
  parent.add(g); return g;
}

// Leaf blob (ellipsoid). Never casts shadows — too small, too many.
function _blob(mat, r, sx = 1, sy = 0.78, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), mat);
  m.scale.set(sx, sy, sz); return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Birch — white bark, 1–2 stems, drooping arms, light yellow-green tips
// Target: 9–14 meshes
// ─────────────────────────────────────────────────────────────────────────────

function _buildBirch() {
  const g   = new THREE.Group();
  const h   = 9 + Math.random() * 6;        // 9–15 m
  g.userData.treeHeight = h;
  const rb  = 0.055 + Math.random() * 0.04; // thin trunk
  const stems = 1 + (Math.random() < 0.28 ? 1 : 0); // 72% single, 28% twin

  for (let s = 0; s < stems; s++) {
    const sg = new THREE.Group();
    sg.position.set((s - (stems - 1) * 0.5) * 0.40, 0, (Math.random() - 0.5) * 0.28);
    sg.rotation.z = (Math.random() - 0.5) * 0.12;
    const sh = h * (0.88 + Math.random() * 0.18);
    sg.add(_cyl(_mBirch, rb, rb * 0.26, sh, 7, true)); // trunk casts shadow

    const nArms = 4 + (Math.random() * 3 | 0); // 4–6 arms
    for (let b = 0; b < nArms; b++) {
      const by   = sh * (0.50 + Math.random() * 0.44);
      const blen = 1.0 + Math.random() * 2.5;
      // tiltX 0.46π–0.64π → mostly horizontal to drooping
      const ag = _arm(sg, _mBirch, by, blen,
                      rb * 0.16, rb * 0.06,
                      Math.PI * (0.46 + Math.random() * 0.18), Math.random() * Math.PI * 2);
      const lr = 0.32 + Math.random() * 0.48;
      const ls = _blob(_pick(_lBirch), lr, 1.1 + Math.random() * 0.5, 0.58 + Math.random() * 0.28, 1.0 + Math.random() * 0.42);
      ls.position.y = blen + lr * 0.52; ag.add(ls);
    }
    g.add(sg);
  }
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pine — dark scaly bark, tiered flat needle layers, dark blue-green
// Target: 7–10 meshes  (1 trunk + 5–8 tier-cones + 1 spire)
// ─────────────────────────────────────────────────────────────────────────────

function _buildPine() {
  const g  = new THREE.Group();
  const h  = 7 + Math.random() * 14;        // 7–21 m
  g.userData.treeHeight = h;
  const rb = 0.14 + Math.random() * 0.12;
  g.add(_cyl(_mPine, rb, rb * 0.15, h, 7, true)); // trunk casts shadow

  const tiers = 5 + (Math.random() * 3 | 0);
  for (let l = 0; l < tiers; l++) {
    const lf = l / (tiers - 1);             // 0=bottom … 1=top
    // flat needle-cluster cone: wide radius, low height ratio
    const r  = (2.2 - lf * 1.7) * (0.72 + Math.random() * 0.45);
    const ty = h * (0.18 + lf * 0.74) + (Math.random() - 0.5) * 0.3;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.55, 7), _pick(_lPine));
    cone.position.set((Math.random() - 0.5) * 0.4, ty, (Math.random() - 0.5) * 0.4);
    cone.rotation.y = Math.random() * Math.PI;
    g.add(cone);
  }
  // spire tip
  const tip = new THREE.Mesh(new THREE.ConeGeometry(rb * 0.9, rb * 5.5, 7), _pick(_lPine));
  tip.position.y = h * 0.88; g.add(tip);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Oak — thick grey-brown trunk, upward-spreading arms, dense canopy
// Target: 9–13 meshes
// ─────────────────────────────────────────────────────────────────────────────

function _buildOak() {
  const g  = new THREE.Group();
  const h  = 5 + Math.random() * 8;         // 5–13 m
  g.userData.treeHeight = h;
  const rb = 0.22 + Math.random() * 0.16;   // thick trunk
  g.add(_cyl(_mOak, rb, rb * 0.40, h, 8, true)); // trunk casts shadow

  const nArms = 3 + (Math.random() * 2 | 0); // 3–4 main arms
  for (let b = 0; b < nArms; b++) {
    const by   = h * (0.60 + Math.random() * 0.32);
    const blen = 2.5 + Math.random() * 3.8;
    const bRb  = rb * 0.28, bRt = rb * 0.10;
    // tiltX 0.20π–0.40π → upward-spreading (36–72° from vertical)
    const ag = _arm(g, _mOak, by, blen, bRb, bRt,
                    Math.PI * (0.20 + Math.random() * 0.20),
                    (b / nArms) * Math.PI * 2 + Math.random() * 0.6);

    // two leaf clusters per arm: one at ~60% along, one at tip
    for (let k = 0; k < 2; k++) {
      const lr = 0.80 + Math.random() * 1.2;
      const ls = _blob(_pick(_lOak), lr, 1.0 + Math.random() * 0.45, 0.82 + Math.random() * 0.28, 1.0 + Math.random() * 0.38);
      ls.position.y = (k === 0 ? blen * 0.58 : blen) + lr * 0.40; ag.add(ls);
    }
  }
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bushy — low shrub, dense sphere canopy
// Target: 6–9 meshes
// ─────────────────────────────────────────────────────────────────────────────

function _buildBushy() {
  const g  = new THREE.Group();
  const h  = 0.8 + Math.random() * 3.5;
  g.userData.treeHeight = h;
  const rb = 0.14 + Math.random() * 0.12;
  g.add(_cyl(_mOak, rb, rb * 0.55, h, 6, false));
  const clumps = 5 + (Math.random() * 4 | 0);
  const baseR  = 1.3 + Math.random() * 1.3;
  for (let c = 0; c < clumps; c++) {
    const cr  = baseR * (0.42 + Math.random() * 0.65);
    const ang = (c / clumps) * Math.PI * 2 + Math.random();
    const sp  = baseR * (0.26 + Math.random() * 0.64);
    const ls  = _blob(_pick(_lGeneric), cr, 0.82 + Math.random() * 0.45, 0.52 + Math.random() * 0.38, 0.82 + Math.random() * 0.42);
    ls.position.set(Math.cos(ang) * sp, h + cr * (0.26 + Math.random() * 0.48), Math.sin(ang) * sp);
    g.add(ls);
  }
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dead — bare trunk, jagged arms only, no foliage
// Target: 4–7 meshes
// ─────────────────────────────────────────────────────────────────────────────

function _buildDead() {
  const g  = new THREE.Group();
  const h  = 4 + Math.random() * 9;
  g.userData.treeHeight = h;
  const rb = 0.14 + Math.random() * 0.12;
  g.add(_cyl(_mOak, rb, rb * 0.22, h, 6, true));

  const nArms = 2 + (Math.random() * 3 | 0);
  for (let b = 0; b < nArms; b++) {
    const by   = h * (0.46 + Math.random() * 0.44);
    const blen = 1.8 + Math.random() * 3.5;
    const bRb  = rb * 0.22, bRt = rb * 0.08;
    const ag = _arm(g, _mOak, by, blen, bRb, bRt,
                    Math.PI * (0.28 + Math.random() * 0.44),
                    (b / nArms) * Math.PI * 2 + Math.random() * 0.72);
    // one short sub-arm per branch
    const slen = 0.6 + Math.random() * 1.6;
    _arm(ag, _mOak, blen * (0.42 + Math.random() * 0.40), slen,
         bRt, bRt * 0.40, Math.PI * (0.24 + Math.random() * 0.38), Math.random() * Math.PI * 2);
  }
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prototype pools + factory
// Geometries are shared on .clone() — never call geometry.dispose() on removal.
// ─────────────────────────────────────────────────────────────────────────────

const N = 4; // 4 prototypes per species
const _BIRCH = Array.from({ length: N }, _buildBirch);
const _PINE  = Array.from({ length: N }, _buildPine);
const _OAK   = Array.from({ length: N }, _buildOak);
const _BUSHY = Array.from({ length: N }, _buildBushy);
const _DEAD  = Array.from({ length: N }, _buildDead);

// ─────────────────────────────────────────────────────────────────────────────
// Low-poly rocks (cube-ish, randomly perturbed, flat-shaded)
// Pool of 20 unique geometries built once at module load.
// ─────────────────────────────────────────────────────────────────────────────

const _ROCK_MATS = [
  0x6B5A48, 0x5A504A, 0x4E4840, 0x7A6B58, 0x4A4238,
  0x635548, 0x524A40, 0x7E7060, 0x403830, 0x5C5248,
].map(c => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));

function _buildRock() {
  // Random cube-ish proportions: width/depth similar, height shorter
  const sx  = 0.5 + Math.random() * 1.6;
  const sy  = 0.28 + Math.random() * 0.65;
  const sz  = 0.45 + Math.random() * 1.5;
  // 1–2 subdivisions gives chunky low-poly silhouette
  const seg = Math.random() < 0.55 ? 1 : 2;
  const geo = new THREE.BoxGeometry(sx, sy, sz, seg, seg, seg);

  const pos = geo.attributes.position;
  const amp = Math.min(sx, sy, sz) * 0.24;
  for (let i = 0; i < pos.count; i++) {
    // Perturb laterally more than vertically so rock stays flat-ish on bottom
    pos.setXYZ(i,
      pos.getX(i) + (Math.random() - 0.5) * amp,
      pos.getY(i) + (Math.random() - 0.5) * amp * 0.5,
      pos.getZ(i) + (Math.random() - 0.5) * amp,
    );
  }
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeVertexNormals();

  const m = new THREE.Mesh(geo, _ROCK_MATS[Math.random() * _ROCK_MATS.length | 0]);
  m.castShadow    = true;
  m.receiveShadow = true;
  // Store how much to lift the rock so its bottom sits on y=0
  m.userData.groundOffset = -geo.boundingBox.min.y;
  return m;
}

const _ROCKS = Array.from({ length: 20 }, _buildRock);

export function makeSpawnRock(scene) {
  return function spawnRock(x, y, z, scale = 1) {
    const proto = _ROCKS[Math.random() * _ROCKS.length | 0];
    const m = proto.clone();
    const s = scale * (0.72 + Math.random() * 0.56);
    m.scale.setScalar(s);
    m.position.set(x, y + proto.userData.groundOffset * s, z);
    m.rotation.set(
      (Math.random() - 0.5) * 0.28,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.28,
    );
    scene.add(m);
    return m;
  };
}

export function makeSpawnTree(scene) {
  return function spawnTree(x, y, z) {
    const t = Math.random();
    const pool = t < 0.26 ? _PINE  :
                 t < 0.52 ? _OAK   :
                 t < 0.70 ? _BIRCH :
                 t < 0.86 ? _BUSHY : _DEAD;
    const g = _pick(pool).clone();
    g.position.set(x, y, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    g.userData.sharedGeo = true;
    g.userData.isTree    = true;
    const th = g.userData.treeHeight ?? 8;
    g.userData.crushable = th < 5.5;
    g.userData.hitRadius = g.userData.crushable ? 1.4 : 0.3;
    scene.add(g); return g;
  };
}
