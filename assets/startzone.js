// assets/startzone.js — Starting zone spawner
// Trees + blocky grass hills + road encouragement text

import * as THREE from 'three';

const PHRASES = [
  'GET READY!',
  "LET'S GO!",
  'FLOOR IT!!!',
];

// Canvas CanvasTexture with bold white/yellow road text
function makeTextMat(text) {
  const W = 1024, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.font = 'bold 140px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Yellow outline
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
  ctx.lineWidth = 10;
  ctx.strokeText(text, W / 2, H / 2);
  // White fill
  ctx.fillStyle = 'rgba(255, 255, 255, 0.93)';
  ctx.fillText(text, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
}

export function makeStartZoneSpawner({ scene, M, RW, SLEN, path, zoneTypes, quad, spawnTree }) {
  // Seeded per-segment RNG
  function rng(si, k) {
    return (((si * 2654435761 + k * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // Simple box at world position, no rotation
  function mkBlock(x, y, z, w, h, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.blockGrass);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  // Loose stack of 2–4 offset blocks forming a small grassy hill
  function spawnCluster(cx, groundY, cz, seed, arr) {
    let bw = 2.5 + rng(seed, 0) * 5.0;
    let bd = 2.5 + rng(seed, 1) * 5.0;
    let stackY = groundY;
    const nBlocks = 2 + Math.floor(rng(seed, 2) * 3);
    for (let k = 0; k < nBlocks; k++) {
      const bh  = 0.7 + rng(seed, k + 10) * 2.2;
      const ox  = (rng(seed, k + 20) - 0.5) * bw * 0.45;
      const oz  = (rng(seed, k + 30) - 0.5) * bd * 0.45;
      arr.push(mkBlock(cx + ox, stackY + bh / 2, cz + oz, bw, bh, bd));
      stackY += bh * 0.65;
      bw *= 0.55 + rng(seed, k + 40) * 0.35;
      bd *= 0.55 + rng(seed, k + 50) * 0.35;
    }
  }

  // Road text decal — flat quad on road surface
  // Corners ordered so player reads text as they drive into it
  function spawnTextDecal(si, phraseIdx, arr) {
    if (!path[si] || !path[si + 1]) return;
    const { pos: p0, angle } = path[si];
    const { pos: p1 }        = path[si + 1];
    const cx  = (p0.x + p1.x) / 2;
    const cy  = (p0.y + p1.y) / 2 + 0.45;   // just above road surface
    const cz  = (p0.z + p1.z) / 2;
    const px  = Math.cos(angle),  pz  = Math.sin(angle);
    const fw_x = Math.sin(angle), fw_z = -Math.cos(angle);
    const W   = RW * 0.84;        // lateral span of decal
    const H   = SLEN * 0.65;      // forward span of decal
    const mat = makeTextMat(PHRASES[phraseIdx]);

    // Far corners at y0 (UV v=0), near corners at y1 (UV v=1)
    // flipY=true → v=1 → canvas top → player sees canvas-top as they approach.
    // Text drawn with y=0 at canvas top, so text is readable on approach.
    const q = quad(
      cx - px * W / 2 + fw_x * H / 2, cz - pz * W / 2 + fw_z * H / 2,  // far-left  (UV 0,0)
      cx + px * W / 2 + fw_x * H / 2, cz + pz * W / 2 + fw_z * H / 2,  // far-right (UV 1,0)
      cx - px * W / 2 - fw_x * H / 2, cz - pz * W / 2 - fw_z * H / 2,  // near-left (UV 0,1)
      cx + px * W / 2 - fw_x * H / 2, cz + pz * W / 2 - fw_z * H / 2,  // near-right(UV 1,1)
      cy, cy, mat
    );
    q.renderOrder = 2;
    arr.push(q);
  }

  // ── Main spawner ──────────────────────────────────────────────────────────
  return function spawnStartZone(si) {
    if (!path[si] || !path[si + 1]) return [];
    const { pos: p0, angle } = path[si];
    const { pos: p1 }        = path[si + 1];
    const mid = {
      x: (p0.x + p1.x) / 2,
      y: (p0.y + p1.y) / 2,
      z: (p0.z + p1.z) / 2,
    };
    const px   = Math.cos(angle),  pz  = Math.sin(angle);
    const fw_x = Math.sin(angle),  fw_z = -Math.cos(angle);
    const groundY = mid.y + 0.42;
    const arr = [];

    // ── Blocky grass hill clusters (both sides) ───────────────────────────
    for (const s of [-1, 1]) {
      const nClusters = 4 + Math.floor(rng(si * 7 + (s > 0 ? 200 : 0), 1) * 4); // 4-7
      for (let c = 0; c < nClusters; c++) {
        const dist  = RW / 2 + 2.5 + rng(si * 13 + c, s > 0 ? 2 : 3) * 50;
        const fwOff = (rng(si * 11 + c, 5) - 0.5) * SLEN * 4.5;
        const clx   = mid.x + px * s * dist + fw_x * fwOff;
        const clz   = mid.z + pz * s * dist + fw_z * fwOff;
        const seed  = (si * 17 + c * 31 + (s > 0 ? 500 : 0)) | 0;
        spawnCluster(clx, groundY, clz, seed, arr);
      }
    }

    // ── Trees on both sides (same as tree zone) ───────────────────────────
    for (const s of [-1, 1]) {
      const n = 5 + Math.floor(rng(si + s * 99, 6) * 5);
      for (let k = 0; k < n; k++) {
        const d = RW / 2 + 2 + rng(si * 9 + k, s > 0 ? 7 : 8) * 45;
        const f = (rng(si * 5 + k, 9) - 0.5) * SLEN * 4;
        const t = spawnTree(
          mid.x + px * s * d + fw_x * f,
          mid.y,
          mid.z + pz * s * d + fw_z * f
        );
        if (t) arr.push(t);
      }
    }

    // ── Road text decals at relSeg 2, 5, 8 ───────────────────────────────
    let runStart = si;
    while (runStart > 0 && zoneTypes[runStart - 1] === 'start') runStart--;
    const rel = si - runStart;
    if (rel === 2) spawnTextDecal(si, 0, arr);
    if (rel === 5) spawnTextDecal(si, 1, arr);
    if (rel === 8) spawnTextDecal(si, 2, arr);

    return arr;
  };
}
