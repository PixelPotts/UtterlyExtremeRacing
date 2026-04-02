import * as THREE from 'three';
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

// ── Loop Buffer Segment ────────────────────────────────────────────────────────
// Flat straight neon road — 10 segs before and after the loop.
export class LoopBufferSegment extends NeonRoadSegment {}

// ── Loop Segment ──────────────────────────────────────────────────────────────
// The N segments forming the vertical circle.
// buildSeg is suppressed (splitGap + no collidable). Physics handled in frameL2.
// Visible road + kerbs are built as a single 3D ribbon mesh in buildMeshes,
// created once at segStart.
export class LoopSegment extends RaceSegment {
  get roadMat() { return 'splitGap'; }
  get kerb()    { return KERB_NONE;  }

  buildMeshes(si, ctx) {
    const ls = ctx.loopState;
    if (!ls || si !== ls.segStart) return [];

    const { scene, M, RW } = ctx;
    const N    = ls.N;
    const R    = ls.R;
    const hw   = RW / 2;
    const kw   = 1.1;
    const fwdX =  Math.sin(ls.entryAngle);
    const fwdZ = -Math.cos(ls.entryAngle);
    const latX =  Math.cos(ls.entryAngle);   // rightward perp in XZ
    const latZ =  Math.sin(ls.entryAngle);
    const ex   = ls.entryPos.x, ey = ls.entryY, ez = ls.entryPos.z;
    const meshes = [];

    // Cross-section at loop angle θ: centre position + inward-radial "up" for driver
    const cross = (θ) => {
      const sinθ = Math.sin(θ), cosθ = Math.cos(θ);
      return {
        cx:  ex + fwdX * R * sinθ,
        cy:  ey + R * (1 - cosθ) + 0.42,   // +0.02 above buffer-seg quads to avoid z-fight
        cz:  ez + fwdZ * R * sinθ,
        rux: -fwdX * sinθ,   // inward radial (toward loop centre = "up" for driver)
        ruy:  cosθ,
        ruz: -fwdZ * sinθ,
      };
    };

    // Ribbon must be DoubleSide — at θ=π the camera is below looking up (back-face)
    const _ribbonRoadMat = M.roadBlack.clone();
    _ribbonRoadMat.side = THREE.DoubleSide;
    const _ribbonKerbMat = M.kerbNeonGreen.clone();
    _ribbonKerbMat.side = THREE.DoubleSide;

    const debugRoadMat = ctx.loopDebug
      ? new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, side: THREE.DoubleSide })
      : null;
    const debugKerbMat = ctx.loopDebug
      ? new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, side: THREE.DoubleSide })
      : null;

    // ── Road surface ─────────────────────────────────────────────────────────
    {
      const pos = [], uvs = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const { cx, cy, cz } = cross((i / N) * 2 * Math.PI);
        pos.push(cx - latX * hw, cy, cz - latZ * hw,
                 cx + latX * hw, cy, cz + latZ * hw);
        uvs.push(0, i / N,  1, i / N);
      }
      for (let i = 0; i < N; i++) {
        const a = i*2, b = i*2+1, c = i*2+2, d = i*2+3;
        idx.push(a, b, c,  b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, debugRoadMat ?? _ribbonRoadMat);
      m.receiveShadow = true; scene.add(m); meshes.push(m);
    }

    // ── Kerbs — arched cross-section following inward radial "up" ────────────
    const NP = 5, BASE = 0.38, PEAK_H = 0.22;
    for (const s of [-1, 1]) {
      const pos = [], uvs = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const { cx, cy, cz, rux, ruy, ruz } = cross((i / N) * 2 * Math.PI);
        for (let t = 0; t < NP; t++) {
          const tf   = t / (NP - 1);
          const lat  = hw + kw * tf;
          const arch = BASE + PEAK_H * Math.sin(Math.PI * tf);
          pos.push(cx + s * latX * lat + rux * arch,
                   cy                  + ruy * arch,
                   cz + s * latZ * lat + ruz * arch);
          uvs.push(tf, i / N);
        }
      }
      for (let i = 0; i < N; i++) {
        for (let t = 0; t < NP - 1; t++) {
          const r0 = i * NP + t, r1 = (i + 1) * NP + t;
          idx.push(r0, r0+1, r1,  r0+1, r1+1, r1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, debugKerbMat ?? _ribbonKerbMat);
      m.receiveShadow = true; m.castShadow = true; scene.add(m); meshes.push(m);
    }

    return meshes;
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────
export const SEGMENT_TYPES_L2 = {
  neonRoad:   new NeonRoadSegment(),
  neonRing:   new NeonRingSegment(),
  splitRoad:  new SplitRoadSegment(),
  loopEntry:  new LoopBufferSegment(),
  loop:       new LoopSegment(),
  loopExit:   new LoopBufferSegment(),
  start:      new NeonRoadSegment(),
};

export const ZONE_PROBS_L2 = [['neonRoad', 1.0]];
