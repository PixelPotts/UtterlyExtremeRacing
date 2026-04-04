// assets/castle.js — Castle zone geometry factory
// Exports makeCastleSpawner({ scene, M, RW, SLEN, path, zoneTypes, quad })
// Returns spawnCastle(si) which buildMeshes() delegates to.

import * as THREE from 'three';

// ── Layout constants ───────────────────────────────────────────────────────────
const APPROACH_SEGS  = 8;    // segs 0..APPROACH_SEGS-1 = open approach road
// seg APPROACH_SEGS = gate (towers, arch, portcullis)
// seg APPROACH_SEGS+1 onwards = enclosed castle tunnel interior

const WALL_T          = 1.2;  // wall slab thickness
const APPROACH_WALL_H = 2.6;  // approach battlement wall height
const GATE_WALL_H     = 13.0; // connecting wall height on gate segment
const INT_WALL_H      = 7.0;  // interior tunnel wall height
const ARCH_H          = 9.5;  // arch opening height (floor to underside of lintel)
const ARCH_LINTEL_T   = 2.2;  // lintel slab height
const ARCH_DEPTH      = 3.0;  // arch depth in forward direction
const TOWER_R         = 4.2;  // tower cylinder radius
const TOWER_H         = 28.0; // tower height above road
const MERLON_H        = 1.2;  // crenellation merlon height
const MERLON_W        = 0.85; // merlon width (in forward direction along wall)
const MERLON_STEP     = 2.0;  // spacing between merlon centres
const MOAT_W          = 28;   // moat lateral width (each side beyond wall)
const MOAT_DEPTH      = 4.5;  // moat water depth below road
const PORT_H          = 4.2;  // portcullis visible drop from arch underside
const BRANCH_EVERY    = 9;    // Y-branch side passage every N interior segs
const PASS_LEN        = 9.0;  // passage lateral depth
const PASS_GAP        = 4.8;  // gap in main wall (forward span of opening)
const PASS_H_OFFSET   = 1.5;  // passage is this much shorter than main tunnel

export function makeCastleSpawner({ scene, M, RW, SLEN, path, zoneTypes, quad }) {
  const tHW    = RW / 2 + 1.6;  // tunnel half-width: 7 + 1.6 = 8.6 m
  const segLen = SLEN + 2;

  // ── Run extent ─────────────────────────────────────────────────────────────
  function runExtent(si) {
    let s = si, e = si;
    while (s > 0 && zoneTypes[s - 1] === 'castle') s--;
    while (zoneTypes[e + 1] === 'castle') e++;
    return { start: s };
  }

  // ── Mesh helpers ───────────────────────────────────────────────────────────
  function mkBox(x, y, z, w, h, d, mat, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (ry !== undefined) m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  function mkCyl(x, y, z, rTop, rBot, h, mat, segs) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs ?? 14), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  // ── Merlons along a wall (crenellations) ───────────────────────────────────
  // cx/cz = wall lateral centre, topY = top of wall, len = forward span
  function mkBattlements(cx, topY, cz, len, angle, mat, arr) {
    const fw_x = Math.sin(angle), fw_z = -Math.cos(angle);
    const ry   = -angle;
    let t = -(len / 2) + MERLON_W / 2;
    while (t < len / 2 - 0.1) {
      arr.push(mkBox(
        cx + fw_x * t, topY + MERLON_H / 2, cz + fw_z * t,
        WALL_T + 0.12, MERLON_H, MERLON_W, mat, ry
      ));
      t += MERLON_STEP;
    }
  }

  // ── Torch (emissive flame sphere + iron sconce box) ─────────────────────────
  function mkTorch(x, y, z, arr) {
    // Sconce bracket
    arr.push(mkBox(x, y, z, 0.16, 0.45, 0.16, M.castleIron));
    // Flame mesh — emissive orange
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.30, 7, 6), M.castleFire);
    flame.position.set(x, y + 0.55, z);
    scene.add(flame);
    arr.push(flame);
  }

  // ── Portcullis (raised iron grid) ─────────────────────────────────────────
  // cx/cz = centre, cy = Y of portcullis bottom edge, width/height in metres
  function mkPortcullis(cx, cy, cz, width, height, angle, arr) {
    const ry      = -angle;
    const px      = Math.cos(angle), pz  = Math.sin(angle);
    const barW    = 0.13;
    const spacing = 0.65;
    const nBars   = Math.max(2, Math.round(width / spacing));

    // Vertical bars — InstancedMesh for efficiency
    const vGeo = new THREE.BoxGeometry(barW, height, barW);
    const im   = new THREE.InstancedMesh(vGeo, M.castleIron, nBars);
    im.castShadow = true;
    const tmp = new THREE.Object3D();
    tmp.rotation.y = ry;
    for (let i = 0; i < nBars; i++) {
      const t = (nBars === 1 ? 0 : (i / (nBars - 1) - 0.5)) * width;
      tmp.position.set(cx + px * t, cy + height / 2, cz + pz * t);
      tmp.updateMatrix();
      im.setMatrixAt(i, tmp.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
    arr.push(im);

    // Horizontal cross-bars (4 evenly spaced)
    const nH = 4;
    for (let j = 0; j < nH; j++) {
      const hy = cy + (j + 0.5) * (height / nH);
      arr.push(mkBox(cx, hy, cz, width, barW, barW, M.castleIron, ry));
    }
  }

  // ── Pseudo-random helper (deterministic per run) ───────────────────────────
  function rng(seed) {
    return (((seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // ── Main spawner ───────────────────────────────────────────────────────────
  return function spawnCastle(si) {
    if (!path[si] || !path[si + 1]) return [];
    const { pos: p0, angle } = path[si];
    const { pos: p1 }        = path[si + 1];
    const mid = {
      x: (p0.x + p1.x) * 0.5,
      y: (p0.y + p1.y) * 0.5,
      z: (p0.z + p1.z) * 0.5,
    };
    const px   = Math.cos(angle),  pz  = Math.sin(angle);
    const fw_x = Math.sin(angle),  fw_z = -Math.cos(angle);
    const ry   = -angle;
    const baseY = mid.y + 0.4;
    const arr   = [];

    const { start: runStart } = runExtent(si);
    const relSeg = si - runStart;

    // ═══════════════════════════════════════════════════════════════════════
    // APPROACH — open air, battlemented walls, moat, torches
    // ═══════════════════════════════════════════════════════════════════════
    if (relSeg < APPROACH_SEGS) {
      for (const s of [-1, 1]) {
        const wx = mid.x + px * s * (tHW + WALL_T * 0.5);
        const wz = mid.z + pz * s * (tHW + WALL_T * 0.5);

        // Approach battlement wall
        arr.push(mkBox(wx, baseY + APPROACH_WALL_H * 0.5, wz,
          WALL_T, APPROACH_WALL_H, segLen, M.castleStone, ry));
        mkBattlements(wx, baseY + APPROACH_WALL_H, wz, segLen, angle, M.castleStone, arr);

        // Stone shoulder (between road edge and wall inner face)
        const ki = RW / 2;
        arr.push(quad(
          p0.x + px * s * ki,   p0.z + pz * s * ki,
          p0.x + px * s * tHW,  p0.z + pz * s * tHW,
          p1.x + px * s * ki,   p1.z + pz * s * ki,
          p1.x + px * s * tHW,  p1.z + pz * s * tHW,
          baseY + 0.01, baseY + 0.01, M.stoneBridge
        ));

        // Moat water plane
        const kiW = tHW + WALL_T;
        const koW = kiW + MOAT_W;
        arr.push(quad(
          p0.x + px * s * kiW, p0.z + pz * s * kiW,
          p0.x + px * s * koW, p0.z + pz * s * koW,
          p1.x + px * s * kiW, p1.z + pz * s * kiW,
          p1.x + px * s * koW, p1.z + pz * s * koW,
          baseY - MOAT_DEPTH, baseY - MOAT_DEPTH, M.water
        ));
      }

      // Torches on approach walls every 3 segs
      if (relSeg % 3 === 0) {
        for (const s of [-1, 1]) {
          const tx = mid.x + px * s * tHW;
          const tz = mid.z + pz * s * tHW;
          mkTorch(tx, baseY + APPROACH_WALL_H + 0.15, tz, arr);
        }
      }
      return arr;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GATE — twin towers, arch, portcullis, wall connecting to towers
    // ═══════════════════════════════════════════════════════════════════════
    if (relSeg === APPROACH_SEGS) {
      const TOWER_OFF = tHW + WALL_T + TOWER_R + 0.8;

      for (const s of [-1, 1]) {
        const tx = mid.x + px * s * TOWER_OFF;
        const tz = mid.z + pz * s * TOWER_OFF;

        // Main tower cylinder (slightly tapered)
        arr.push(mkCyl(tx, baseY + TOWER_H * 0.5, tz, TOWER_R, TOWER_R * 1.04, TOWER_H, M.castleStone, 14));

        // Conical roof
        const cone = new THREE.Mesh(new THREE.ConeGeometry(TOWER_R + 0.6, 6.5, 14), M.castleDark);
        cone.position.set(tx, baseY + TOWER_H + 3.25, tz);
        cone.castShadow = true;
        scene.add(cone);
        arr.push(cone);

        // Battlements ring at tower top
        const N_MERLONS = 8;
        for (let i = 0; i < N_MERLONS; i++) {
          const ba = (i / N_MERLONS) * Math.PI * 2;
          const bx = tx + Math.cos(ba) * TOWER_R * 0.82;
          const bz = tz + Math.sin(ba) * TOWER_R * 0.82;
          arr.push(mkBox(bx, baseY + TOWER_H + MERLON_H * 0.5, bz,
            MERLON_W, MERLON_H, MERLON_W, M.castleStone));
        }

        // Connecting wall: arch pillar → tower (fills the gap in the gate wall)
        const wallSpan = TOWER_OFF - TOWER_R - tHW - WALL_T;
        if (wallSpan > 0.2) {
          const wallCX = mid.x + px * s * (tHW + WALL_T + wallSpan * 0.5);
          const wallCZ = mid.z + pz * s * (tHW + WALL_T + wallSpan * 0.5);
          arr.push(mkBox(wallCX, baseY + GATE_WALL_H * 0.5, wallCZ,
            wallSpan, GATE_WALL_H, WALL_T, M.castleStone, ry));
          mkBattlements(wallCX, baseY + GATE_WALL_H, wallCZ, wallSpan, angle, M.castleStone, arr);
        }

        // Tower facing torches (on road-facing side)
        const tfd = -s; // toward road centre
        mkTorch(tx + px * tfd * (TOWER_R + 0.3), baseY + 5.5, tz + pz * tfd * (TOWER_R + 0.3), arr);
        mkTorch(tx + px * tfd * (TOWER_R + 0.3), baseY + 9.0, tz + pz * tfd * (TOWER_R + 0.3), arr);
      }

      // ── Arch pillars flanking the road opening ─────────────────────────────
      for (const s of [-1, 1]) {
        const apx = mid.x + px * s * tHW;
        const apz = mid.z + pz * s * tHW;
        // Front pillar (entrance face)
        arr.push(mkBox(apx, baseY + ARCH_H * 0.5, apz,
          WALL_T, ARCH_H, ARCH_DEPTH, M.castleStone, ry));
        // Upper wall section above arch (pillar continues to GATE_WALL_H)
        const upperH = GATE_WALL_H - ARCH_H - ARCH_LINTEL_T;
        if (upperH > 0.1) {
          arr.push(mkBox(apx, baseY + ARCH_H + ARCH_LINTEL_T + upperH * 0.5, apz,
            WALL_T, upperH, ARCH_DEPTH, M.castleStone, ry));
        }
      }
      // Arch lintel (spans full opening + pillar width)
      arr.push(mkBox(mid.x, baseY + ARCH_H + ARCH_LINTEL_T * 0.5, mid.z,
        tHW * 2 + WALL_T, ARCH_LINTEL_T, ARCH_DEPTH, M.castleStone, ry));
      // Battlements above lintel
      mkBattlements(mid.x, baseY + ARCH_H + ARCH_LINTEL_T, mid.z,
        tHW * 2 + WALL_T, angle, M.castleStone, arr);

      // ── Portcullis (raised — visible from below as grid above head) ─────────
      const portWidth = tHW * 2 - WALL_T * 0.5;
      const portBottom = baseY + ARCH_H - PORT_H; // hangs from arch underside
      mkPortcullis(mid.x, portBottom, mid.z, portWidth, PORT_H, angle, arr);

      // Stone shoulder quads through gate
      for (const s of [-1, 1]) {
        const ki = RW / 2;
        arr.push(quad(
          p0.x + px * s * ki,   p0.z + pz * s * ki,
          p0.x + px * s * tHW,  p0.z + pz * s * tHW,
          p1.x + px * s * ki,   p1.z + pz * s * ki,
          p1.x + px * s * tHW,  p1.z + pz * s * tHW,
          baseY + 0.01, baseY + 0.01, M.stoneBridge
        ));
      }
      return arr;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTERIOR — enclosed castle tunnel, arch ribs, torches, Y-branches
    // ═══════════════════════════════════════════════════════════════════════
    const intRel    = relSeg - APPROACH_SEGS - 1;
    const isBranch  = intRel > 0 && (intRel % BRANCH_EVERY === 0);
    const branchIdx = Math.floor(intRel / BRANCH_EVERY);
    const branchSide = rng(runStart * 31 + branchIdx) < 0.5 ? -1 : 1;

    // ── Tunnel walls (with optional gap for branch) ───────────────────────
    for (const s of [-1, 1]) {
      const wx = mid.x + px * s * (tHW + WALL_T * 0.5);
      const wz = mid.z + pz * s * (tHW + WALL_T * 0.5);

      if (isBranch && s === branchSide) {
        // Two half-walls with a gap in the middle
        const halfLen = (segLen - PASS_GAP) / 2;
        for (const fwDir of [-1, 1]) {
          const off = fwDir * (halfLen / 2 + PASS_GAP / 2);
          arr.push(mkBox(wx + fw_x * off, baseY + INT_WALL_H * 0.5, wz + fw_z * off,
            WALL_T, INT_WALL_H, halfLen, M.castleDark, ry));
        }
        // ── Side passage geometry (extends laterally) ────────────────────
        const passH  = INT_WALL_H - PASS_H_OFFSET;
        const pLatCX = mid.x + px * s * (tHW + WALL_T + PASS_LEN * 0.5);
        const pLatCZ = mid.z + pz * s * (tHW + WALL_T + PASS_LEN * 0.5);
        const passW2 = PASS_GAP * 0.5 + WALL_T * 0.5;

        // Side walls of passage (span laterally, thin in road-forward direction)
        for (const fs of [-1, 1]) {
          arr.push(mkBox(
            pLatCX + fw_x * fs * passW2, baseY + passH * 0.5, pLatCZ + fw_z * fs * passW2,
            PASS_LEN, passH, WALL_T, M.castleDark, ry
          ));
        }
        // Back wall of passage (thin laterally, spans forward direction)
        arr.push(mkBox(
          mid.x + px * s * (tHW + WALL_T + PASS_LEN),
          baseY + passH * 0.5,
          mid.z + pz * s * (tHW + WALL_T + PASS_LEN),
          WALL_T, passH, PASS_GAP + WALL_T * 2, M.castleDark, ry
        ));
        // Passage ceiling
        arr.push(mkBox(pLatCX, baseY + passH + WALL_T * 0.5, pLatCZ,
          PASS_LEN, WALL_T, PASS_GAP, M.castleDark, ry));
        // Torch deep inside the passage
        mkTorch(
          mid.x + px * s * (tHW + WALL_T + PASS_LEN * 0.72),
          baseY + 2.1,
          mid.z + pz * s * (tHW + WALL_T + PASS_LEN * 0.72),
          arr
        );
      } else {
        // Full-length wall
        arr.push(mkBox(wx, baseY + INT_WALL_H * 0.5, wz,
          WALL_T, INT_WALL_H, segLen, M.castleDark, ry));
      }
    }

    // ── Tunnel ceiling slab ──────────────────────────────────────────────
    arr.push(mkBox(mid.x, baseY + INT_WALL_H + WALL_T * 0.5, mid.z,
      (tHW + WALL_T) * 2, WALL_T, segLen, M.castleDark, ry));

    // ── Stone arch ribs every 2 interior segments ───────────────────────
    if (intRel % 2 === 0) {
      // Ceiling band rib (thin strip spanning the full ceiling width)
      arr.push(mkBox(mid.x, baseY + INT_WALL_H - 0.01, mid.z,
        tHW * 2 - 0.4, 0.65, 0.5, M.castleStone, ry));
      // Wall pilasters (protruding column stubs on each wall face)
      for (const s of [-1, 1]) {
        arr.push(mkBox(
          mid.x + px * s * (tHW + WALL_T * 0.5 - 0.1),
          baseY + INT_WALL_H * 0.5,
          mid.z + pz * s * (tHW + WALL_T * 0.5 - 0.1),
          WALL_T + 0.3, INT_WALL_H, 0.5, M.castleStone, ry
        ));
      }
    }

    // ── Torch sconces every 3 interior segments ──────────────────────────
    if (intRel % 3 === 1) {
      for (const s of [-1, 1]) {
        if (isBranch && s === branchSide) continue;
        const tx = mid.x + px * s * (tHW - 0.08);
        const tz = mid.z + pz * s * (tHW - 0.08);
        mkTorch(tx, baseY + 2.8, tz, arr);
      }
    }

    // ── Stone floor quad (wider than road to fill to walls) ──────────────
    arr.push(quad(
      p0.x - px * tHW, p0.z - pz * tHW,
      p0.x + px * tHW, p0.z + pz * tHW,
      p1.x - px * tHW, p1.z - pz * tHW,
      p1.x + px * tHW, p1.z + pz * tHW,
      baseY + 0.01, baseY + 0.01, M.stoneBridge
    ));

    return arr;
  };
}
