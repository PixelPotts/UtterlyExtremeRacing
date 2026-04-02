import * as THREE from 'three';
import { LineSegments2 }      from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial }        from 'three/addons/lines/LineMaterial.js';
import { Kerb, KERB_NONE, RaceSegment } from './segments.js';

// Emissive lane stripe materials (shared geometry via quads, no dispose needed)
const _blueLaneMat = new THREE.MeshBasicMaterial({ color: 0x0055cc, transparent: true, opacity: 0.75 });
const _orgLaneMat  = new THREE.MeshBasicMaterial({ color: 0xcc4400, transparent: true, opacity: 0.75 });

// ── Neon Green Kerb ───────────────────────────────────────────────────────────
// Emissive green arch kerb — references M.kerbNeonGreen (added in index.html).
export class NeonGreenKerb extends Kerb {
  build(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1, _si, { M, buildKerb }) {
    return buildKerb(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1,
      M.kerbNeonGreen, { BASE: 0.38, PEAK: 0.22 });
  }
}

export const KERB_NEON_GREEN = new NeonGreenKerb();

const WATER_SIDE = 62;  // metres of water extending each side from kerb edge

// ── Neon Road Segment ─────────────────────────────────────────────────────────
export class NeonRoadSegment extends RaceSegment {
  get roadMat() { return 'roadBlack'; }
  get kerb()    { return KERB_NEON_GREEN; }

  buildMeshes(si, { path, M, RW, SLEN, quad, spawnNeonPole }) {
    if (!path[si + 1]) return [];
    const { pos: p0, angle: a0 } = path[si];
    const { pos: p1, angle: a1 } = path[si + 1];
    const px0 = Math.cos(a0), pz0 = Math.sin(a0);
    const px1 = Math.cos(a1), pz1 = Math.sin(a1);
    const hw = RW / 2, kw = 1.1;
    const kOuter = hw + kw;            // outer edge of kerb
    const wOuter = kOuter + WATER_SIDE; // outer edge of water
    const ry0 = p0.y + 0.35, ry1 = p1.y + 0.35; // slightly below road surface
    const arr = [];

    // Water ground on both sides
    for (const s of [-1, 1]) {
      arr.push(quad(
        p0.x + px0 * s * kOuter,  p0.z + pz0 * s * kOuter,
        p0.x + px0 * s * wOuter,  p0.z + pz0 * s * wOuter,
        p1.x + px1 * s * kOuter,  p1.z + pz1 * s * kOuter,
        p1.x + px1 * s * wOuter,  p1.z + pz1 * s * wOuter,
        ry0, ry1, M.blackWater
      ));
    }

    // Street lights — staggered, every ~5 segments, alternating sides
    // Left side: even multiples of 5; right side: offset by 2
    const poleOff = kOuter + 1.4;
    if (si % 5 === 0) {
      arr.push(...spawnNeonPole(
        p0.x - px0 * poleOff, p0.z - pz0 * poleOff,
        a0, -1, si));
    }
    if (si % 5 === 2) {
      arr.push(...spawnNeonPole(
        p0.x + px0 * poleOff, p0.z + pz0 * poleOff,
        a0, 1, si));
    }

    return arr;
  }
}

// ── Neon Ring Segment ─────────────────────────────────────────────────────────
// 3 sets of 3 large neon-pink rings spanning the road — drive-through portals.

const _RING_R        = 9.0;   // outer radius — just wider than half road-width (7 m)
const _RING_TUBE     = 0.45;
const _RING_GEO      = new THREE.TorusGeometry(_RING_R, _RING_TUBE, 16, 80);
const _RING_GLOW_GEO = new THREE.TorusGeometry(_RING_R + 0.7, _RING_TUBE * 2.4, 12, 60);
const _RING_MAT      = new THREE.MeshBasicMaterial({ color: 0xff00cc });
const _RING_GLOW_MAT = new THREE.MeshBasicMaterial({
  color: 0xff44ee, transparent: true, opacity: 0.22,
  depthWrite: false, blending: THREE.AdditiveBlending,
});

export class NeonRingSegment extends NeonRoadSegment {
  buildMeshes(si, ctx) {
    const arr = super.buildMeshes(si, ctx);  // water + poles from NeonRoadSegment
    const { path, RW } = ctx;
    if (!path[si + 1]) return arr;

    const { pos: p0, angle: a0 } = path[si];
    const { pos: p1 }            = path[si + 1];

    // Forward unit vector (road direction)
    const fwdX = Math.sin(a0), fwdZ = -Math.cos(a0);
    const fwd  = new THREE.Vector3(fwdX, 0, fwdZ);
    const rot  = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), fwd
    );

    // 3 sets at t=0.18, 0.50, 0.82; each set has 3 rings spaced ~1 m apart
    const setTs      = [0.18, 0.50, 0.82];
    const ringDr     = [-1.0, 0.0, 1.0];   // forward offsets within a set (m)

    for (const t of setTs) {
      const cx = p0.x + (p1.x - p0.x) * t;
      const cy = p0.y + (p1.y - p0.y) * t;
      const cz = p0.z + (p1.z - p0.z) * t;

      for (const dr of ringDr) {
        const rx = cx + fwdX * dr;
        const rz = cz + fwdZ * dr;
        const ry = cy + _RING_R;   // lift so bottom of ring sits on road

        const ring = new THREE.Mesh(_RING_GEO, _RING_MAT);
        ring.userData.sharedGeo = true;
        ring.position.set(rx, ry, rz);
        ring.setRotationFromQuaternion(rot);
        ctx.scene.add(ring);
        arr.push(ring);

        const glow = new THREE.Mesh(_RING_GLOW_GEO, _RING_GLOW_MAT);
        glow.userData.sharedGeo = true;
        glow.position.set(rx, ry, rz);
        glow.setRotationFromQuaternion(rot);
        ctx.scene.add(glow);
        arr.push(glow);
      }
    }

    return arr;
  }
}

// ── Neon Blue Kerb ────────────────────────────────────────────────────────────
export class NeonBlueKerb extends Kerb {
  build(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1, _si, { M, buildKerb }) {
    return buildKerb(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1,
      M.kerbNeonBlue, { BASE: 0.38, PEAK: 0.22 });
  }
}

export class NeonOrangeKerb extends Kerb {
  build(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1, _si, { M, buildKerb }) {
    return buildKerb(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1,
      M.kerbNeonOrange, { BASE: 0.38, PEAK: 0.22 });
  }
}

export const KERB_NEON_BLUE   = new NeonBlueKerb();
export const KERB_NEON_ORANGE = new NeonOrangeKerb();

// ── Split Road Segment ─────────────────────────────────────────────────────────
// Y-junction: road physically splits into two lanes that diverge then reconverge.
// Base road (buildSeg) uses transparent 'splitGap' — invisible but collidable so
// the player doesn't fall. Two visible lane quads are drawn in buildMeshes with
// per-run random height and lateral biases so each split looks different.
// Deep water plane 14 m below the deck is visible through the open gap.

const _SPLIT_MAX_GAP = 3.0;  // half-gap at peak (≈ highway median, each side)
const _DELAY_SEGS    = 8;    // segs before fork begins  (~104 m)
const _RAMP_SEGS     = 12;   // segs to reach full split (~156 m)

// Returns split fraction 0..1 using absolute segment position in run.
// Delays _DELAY_SEGS at each end, then ramps over _RAMP_SEGS.
function _splitFrac(relSeg, runSpan) {
  const fromStart = relSeg - _DELAY_SEGS;
  const fromEnd   = (runSpan - relSeg) - _DELAY_SEGS;
  const t = Math.min(fromStart, fromEnd);
  if (t <= 0) return 0;
  if (t >= _RAMP_SEGS) return 1;
  const r = t / _RAMP_SEGS;
  return r * r * (3 - 2 * r);  // smoothstep
}

// Seeded RNG so each run has consistent but different biases
function _rng(seed, i) {
  const v = ((seed * 1664525 + 1013904223) ^ (i * 22695477 + 1)) >>> 0;
  return (v & 0x7FFFFFFF) / 0x7FFFFFFF;
}

// Deep water visible through the gap
const _gapWaterMat = new THREE.MeshStandardMaterial({
  color: 0x001828, roughness: 0.03, metalness: 0.5,
  emissive: 0x000d14, emissiveIntensity: 0.7, side: THREE.DoubleSide,
});

export class SplitRoadSegment extends RaceSegment {
  get roadMat() { return 'splitGap'; }  // invisible collidable base — gap is open air
  get kerb()    { return KERB_NONE; }

  buildMeshes(si, ctx) {
    const { path, M, RW, buildKerb, spawnSplitPoleBlue, spawnSplitPoleOrange, quad, zoneTypes, addCollidable } = ctx;
    if (!path[si + 1]) return [];

    // Find run extent using absolute segment positions
    let runStart = si, runEnd = si;
    while (runStart > 0 && zoneTypes[runStart - 1] === 'splitRoad') runStart--;
    while (zoneTypes[runEnd + 1] === 'splitRoad') runEnd++;
    const runSpan = Math.max(1, runEnd - runStart);
    const sf0  = _splitFrac(si - runStart,     runSpan);
    const sf1  = _splitFrac(si + 1 - runStart, runSpan);
    const gap0 = sf0 * _SPLIT_MAX_GAP;
    const gap1 = sf1 * _SPLIT_MAX_GAP;

    // Per-run biases (seeded so same run always looks the same)
    const leftYBias  = (_rng(runStart, 0) * 2 - 1) * 12;   // -12 to +12 m
    const rightYBias = (_rng(runStart, 1) * 2 - 1) * 12;
    const leftLatEx  = _rng(runStart, 2) * 4;              // 0-4 m extra outward
    const rightLatEx = _rng(runStart, 3) * 4;

    const { pos: p0, angle: a0 } = path[si];
    const { pos: p1, angle: a1 } = path[si + 1];
    const px0 = Math.cos(a0), pz0 = Math.sin(a0);
    const px1 = Math.cos(a1), pz1 = Math.sin(a1);
    const hw = RW / 2, kw = 1.1;
    const ry0 = p0.y, ry1 = p1.y;
    const arr = [];

    // ── Deep water plane visible through gap ──────────────────────────────────
    const WD = 14;  // metres below road deck
    arr.push(quad(
      p0.x - px0 * 90, p0.z - pz0 * 90,
      p0.x + px0 * 90, p0.z + pz0 * 90,
      p1.x - px1 * 90, p1.z - pz1 * 90,
      p1.x + px1 * 90, p1.z + pz1 * 90,
      ry0 - WD, ry1 - WD, _gapWaterMat
    ));

    // ── Lane geometry ─────────────────────────────────────────────────────────
    // Each lane slides outward AND widens as the split opens.
    // Width: hw (half-road) at sf=0 → RW (full road) at sf=1.
    // Shift: 0 at sf=0 → _SPLIT_MAX_GAP at sf=1.
    const laneW0 = hw * (1 + sf0);   // 7 m → 14 m
    const laneW1 = hw * (1 + sf1);

    const lShift0 = (gap0 + leftLatEx  * sf0), lShift1 = (gap1 + leftLatEx  * sf1);
    const rShift0 = (gap0 + rightLatEx * sf0),  rShift1 = (gap1 + rightLatEx * sf1);

    const lIn0 = lShift0,           lIn1 = lShift1;
    const lOut0 = lShift0 + laneW0, lOut1 = lShift1 + laneW1;
    const lY0   = ry0 + 0.40 + leftYBias  * sf0;
    const lY1   = ry1 + 0.40 + leftYBias  * sf1;

    const rIn0 = rShift0,           rIn1 = rShift1;
    const rOut0 = rShift0 + laneW0, rOut1 = rShift1 + laneW1;
    const rY0   = ry0 + 0.40 + rightYBias * sf0;
    const rY1   = ry1 + 0.40 + rightYBias * sf1;

    // Left lane surface (outer is further left = more negative)
    const leftQuad = quad(
      p0.x - px0 * lOut0, p0.z - pz0 * lOut0,
      p0.x - px0 * lIn0,  p0.z - pz0 * lIn0,
      p1.x - px1 * lOut1, p1.z - pz1 * lOut1,
      p1.x - px1 * lIn1,  p1.z - pz1 * lIn1,
      lY0, lY1, M.roadBlack
    );
    arr.push(leftQuad);

    // Right lane surface (winding swapped so normals face up)
    const rightQuad = quad(
      p0.x + px0 * rIn0,  p0.z + pz0 * rIn0,
      p0.x + px0 * rOut0, p0.z + pz0 * rOut0,
      p1.x + px1 * rIn1,  p1.z + pz1 * rIn1,
      p1.x + px1 * rOut1, p1.z + pz1 * rOut1,
      rY0, rY1, M.roadBlack
    );
    arr.push(rightQuad);

    // Register both lane quads as the collidable floor for this segment
    addCollidable(si, leftQuad, rightQuad);

    // ── Inner edge glow strips ────────────────────────────────────────────────
    const sw = 0.28;
    if (gap0 > 0.2 || gap1 > 0.2) {
      arr.push(quad(
        p0.x - px0 * (lIn0 + sw), p0.z - pz0 * (lIn0 + sw),
        p0.x - px0 * (lIn0 - sw), p0.z - pz0 * (lIn0 - sw),
        p1.x - px1 * (lIn1 + sw), p1.z - pz1 * (lIn1 + sw),
        p1.x - px1 * (lIn1 - sw), p1.z - pz1 * (lIn1 - sw),
        lY0 + 0.01, lY1 + 0.01, _blueLaneMat
      ));
      arr.push(quad(
        p0.x + px0 * (rIn0 - sw), p0.z + pz0 * (rIn0 - sw),
        p0.x + px0 * (rIn0 + sw), p0.z + pz0 * (rIn0 + sw),
        p1.x + px1 * (rIn1 - sw), p1.z + pz1 * (rIn1 - sw),
        p1.x + px1 * (rIn1 + sw), p1.z + pz1 * (rIn1 + sw),
        rY0 + 0.01, rY1 + 0.01, _orgLaneMat
      ));
    }

    // ── Outer kerbs follow shifted lane outer edges (track lane Y) ───────────
    arr.push(buildKerb(
      p0.x - px0 * lOut0,        p0.z - pz0 * lOut0,
      p0.x - px0 * (lOut0 + kw), p0.z - pz0 * (lOut0 + kw),
      p1.x - px1 * lOut1,        p1.z - pz1 * lOut1,
      p1.x - px1 * (lOut1 + kw), p1.z - pz1 * (lOut1 + kw),
      M.kerbNeonBlue, { BASE: 0.38, PEAK: 0.22, y0: lY0 - 0.40, y1: lY1 - 0.40 }
    ));
    arr.push(buildKerb(
      p0.x + px0 * (rOut0 + kw), p0.z + pz0 * (rOut0 + kw),
      p0.x + px0 * rOut0,        p0.z + pz0 * rOut0,
      p1.x + px1 * (rOut1 + kw), p1.z + pz1 * (rOut1 + kw),
      p1.x + px1 * rOut1,        p1.z + pz1 * rOut1,
      M.kerbNeonOrange, { BASE: 0.38, PEAK: 0.22, y0: rY0 - 0.40, y1: rY1 - 0.40 }
    ));

    // ── Water beyond outer kerbs (follows lane Y) ─────────────────────────────
    const WEXT = 50;
    arr.push(quad(
      p0.x - px0 * (lOut0 + kw),        p0.z - pz0 * (lOut0 + kw),
      p0.x - px0 * (lOut0 + kw + WEXT), p0.z - pz0 * (lOut0 + kw + WEXT),
      p1.x - px1 * (lOut1 + kw),        p1.z - pz1 * (lOut1 + kw),
      p1.x - px1 * (lOut1 + kw + WEXT), p1.z - pz1 * (lOut1 + kw + WEXT),
      lY0, lY1, M.blackWater
    ));
    arr.push(quad(
      p0.x + px0 * (rOut0 + kw),        p0.z + pz0 * (rOut0 + kw),
      p0.x + px0 * (rOut0 + kw + WEXT), p0.z + pz0 * (rOut0 + kw + WEXT),
      p1.x + px1 * (rOut1 + kw),        p1.z + pz1 * (rOut1 + kw),
      p1.x + px1 * (rOut1 + kw + WEXT), p1.z + pz1 * (rOut1 + kw + WEXT),
      rY0, rY1, M.blackWater
    ));

    // ── Poles at outer edges ──────────────────────────────────────────────────
    if (si % 5 === 0) arr.push(...spawnSplitPoleBlue(
      p0.x - px0 * (lOut0 + kw + 1.4), p0.z - pz0 * (lOut0 + kw + 1.4), a0, -1, si));
    if (si % 5 === 2) arr.push(...spawnSplitPoleOrange(
      p0.x + px0 * (rOut0 + kw + 1.4), p0.z + pz0 * (rOut0 + kw + 1.4), a0, 1, si));

    return arr.filter(Boolean);
  }
}

// ── Hills Segment (Level 2) ───────────────────────────────────────────────────
// Dramatic low-poly terrain hills extending ~140 m on both sides of the road.
// Bright light-blue wireframe edges give a neon synthwave aesthetic.

// vertexColors: true — per-vertex edge-glow baked in _buildHillMeshes
const _HILL_DARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });

// Thick line materials — LineMaterial renders lines as screen-space quads
const _HILL_LINE_RES  = new THREE.Vector2(window.innerWidth || 1920, window.innerHeight || 1080);
const _HILL_EDGE_L2_MAT = new LineMaterial({ color: 0x66ddff, linewidth: 3, resolution: _HILL_LINE_RES });
const _HILL_GLOW_L2_MAT = new LineMaterial({
  color: 0x33aaee, linewidth: 9, resolution: _HILL_LINE_RES,
  transparent: true, opacity: 0.20, depthWrite: false, blending: THREE.AdditiveBlending,
});

const _HILL_NX   = 3;    // was 9 — ÷3 poly count
const _HILL_NZ   = 3;    // longitudinal rows per segment
const _HILL_WIDE = 140;  // metres per side from kerb edge

function _buildHillMeshes(p0, p1, px0, pz0, px1, pz1, kOuter, side, scene) {
  const NX = _HILL_NX, NZ = _HILL_NZ;
  const TW = _HILL_WIDE, FADE = 10;
  const PI2 = Math.PI * 2;
  const roadH0 = p0.y + 0.42;
  const roadH1 = p1.y + 0.42;
  const verts  = [];
  const colors = [];  // per-vertex edge glow: cyan at mesh borders, black inside

  for (let j = 0; j <= NZ; j++) {
    const tf  = j / NZ;
    const bx  = p0.x + (p1.x - p0.x) * tf;
    const bz  = p0.z + (p1.z - p0.z) * tf;
    const bH  = roadH0 + (roadH1 - roadH0) * tf;
    const pxt = px0 + (px1 - px0) * tf;
    const pzt = pz0 + (pz1 - pz0) * tf;

    for (let i = 0; i <= NX; i++) {
      const lf   = i / NX;
      const lat  = kOuter + lf * TW;
      const wx   = bx + pxt * side * lat;
      const wz   = bz + pzt * side * lat;
      const ft   = Math.min(1, (lat - kOuter) / FADE);
      const fade = ft * ft * (3 - 2 * ft);

      const dh =
        14  * Math.sin(wx * PI2 / 140 + 0.33) * Math.cos(wz * PI2 / 120 + 1.80) +
         7  * Math.sin(wx * PI2 /  65 + 2.60) * Math.cos(wz * PI2 /  70 + 0.45) +
         2.5 * Math.sin(wx * PI2 /  28 + 4.20) * Math.cos(wz * PI2 /  32 + 2.10);

      verts.push(wx, bH + fade * dh, wz);

      // Edge proximity: 0 at mesh border, ramps to 1.0 over ~1.5 grid units
      const edgeDist = Math.min(i, NX - i, j, NZ - j);
      const t = Math.min(1, edgeDist / 1.5);
      const g = (1 - t) * (1 - t) * 0.043;  // 3× darker than before (was 0.13)
      colors.push(g * 0.30, g * 0.55, g);    // cyan tint: R×0.30, G×0.55, B×1.0
    }
  }

  const idx = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1;
      const c = (j + 1) * (NX + 1) + i, d = c + 1;
      if (side > 0) idx.push(a, b, c, b, d, c);
      else          idx.push(a, c, b, c, d, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,  3));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const fill = new THREE.Mesh(geo, _HILL_DARK_MAT);
  fill.receiveShadow = true;

  // Build thick edges via LineSegments2 (EdgesGeometry → LineSegmentsGeometry)
  const edgesGeo = new THREE.EdgesGeometry(geo);
  const linesGeo = new LineSegmentsGeometry().fromEdgesGeometry(edgesGeo);
  edgesGeo.dispose();   // intermediate no longer needed

  const edge = new LineSegments2(linesGeo, _HILL_EDGE_L2_MAT);
  // glow shares linesGeo — edge disposes it on segment drop, glow is skipped
  const glow = new LineSegments2(linesGeo, _HILL_GLOW_L2_MAT);
  glow.userData.sharedGeo = true;

  scene.add(fill, edge, glow);
  return [fill, edge, glow];
}

export class HillsSegment extends RaceSegment {
  get roadMat() { return 'roadBlack'; }
  get kerb()    { return KERB_NEON_GREEN; }

  buildMeshes(si, ctx) {
    const { path, RW, scene, spawnNeonPole } = ctx;
    if (!path[si + 1]) return [];
    const { pos: p0, angle: a0 } = path[si];
    const { pos: p1, angle: a1 } = path[si + 1];
    const px0 = Math.cos(a0), pz0 = Math.sin(a0);
    const px1 = Math.cos(a1), pz1 = Math.sin(a1);
    const kOuter = RW / 2 + 1.1;
    const arr    = [];

    for (const side of [-1, 1]) {
      arr.push(..._buildHillMeshes(p0, p1, px0, pz0, px1, pz1, kOuter, side, scene));
    }

    // Neon poles — same stagger as NeonRoadSegment
    const poleOff = kOuter + 1.4;
    if (si % 5 === 0) arr.push(...spawnNeonPole(p0.x - px0 * poleOff, p0.z - pz0 * poleOff, a0, -1, si));
    if (si % 5 === 2) arr.push(...spawnNeonPole(p0.x + px0 * poleOff, p0.z + pz0 * poleOff, a0,  1, si));

    return arr;
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────
export const SEGMENT_TYPES_L2 = {
  neonRoad:   new NeonRoadSegment(),
  neonRing:   new NeonRingSegment(),
  splitRoad:  new SplitRoadSegment(),
  hills:      new HillsSegment(),
  start:      new NeonRoadSegment(),
};

export const ZONE_PROBS_L2 = [['neonRoad', 1.0]];
