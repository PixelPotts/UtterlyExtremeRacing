import { BUILDING_DEFS } from './buildings.js';

// ── Kerb ──────────────────────────────────────────────────────────────────────
// Each subclass describes how to build one side of a kerb profile.
// build(ix0,iz0, ox0,oz0, ix1,iz1, ox1,oz1, si, ctx) → Mesh | null
//   ctx = { M, buildKerb }
//   buildKerb signature: (ix0,iz0,ox0,oz0,ix1,iz1,ox1,oz1, mat, opts?)
//   opts = { N, BASE, PEAK }  — cross-section profile overrides

export class Kerb {
  build() { return null; }
}

export class RedWhiteStripe extends Kerb {
  build(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1, si, { M, buildKerb }) {
    return buildKerb(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1,
      si % 2 === 0 ? M.red : M.white);
  }
}

export class Concrete extends Kerb {
  build(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1, _si, { M, buildKerb }) {
    return buildKerb(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1,
      M.sidewalk, { BASE: 0.40, PEAK: 0.16 });
  }
}

export class DirtPile extends Kerb {
  build(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1, _si, { M, buildKerb }) {
    return buildKerb(ix0, iz0, ox0, oz0, ix1, iz1, ox1, oz1,
      M.kerbDirt, { N: 4, BASE: 0.18, PEAK: 0.22 });
  }
}

export const KERB_NONE      = new Kerb();
export const KERB_RED_WHITE = new RedWhiteStripe();
export const KERB_CONCRETE  = new Concrete();
export const KERB_DIRT      = new DirtPile();

// ── RaceSegment ───────────────────────────────────────────────────────────────
// Base class + all zone-type subclasses.
//
// Normalised properties (override in subclass):
//   roadMat      'road' | 'dirt'  — key into the M materials object
//   kerb         Kerb instance    — kerb type for this segment (KERB_NONE to mute)
//   isTunnel     boolean          — activate tunnel ambient lighting in render loop
//   hasObstacles boolean          — run manhole / oil-spill / pedestrian spawning
//
// Method:
//   buildMeshes(si, ctx) → THREE.Object3D[]
//     ctx = { path, M, RW, SLEN, quad, buildKerb, spawnTree, spawnBuilding,
//              spawnLightPost, spawnTunnel }

export class RaceSegment {
  get roadMat()        { return 'road';         }
  get kerb()           { return KERB_RED_WHITE; }
  get isTunnel()       { return false;          }
  get hasObstacles()   { return false;          }
  get hasPedestrians() { return false;          }
  buildMeshes(_si, _ctx) { return []; }
  buildGround(_si, _ctx) { return []; }
}

// ── Start ─────────────────────────────────────────────────────────────────────
export class StartSegment extends RaceSegment {}

// ── Trees ─────────────────────────────────────────────────────────────────────
export class TreesSegment extends RaceSegment {
  buildGround(si, { spawnTerrain }) { return spawnTerrain(si); }
  buildMeshes(si, { path, RW, SLEN, spawnTree }) {
    const { pos, angle } = path[si];
    const px = Math.cos(angle), pz = Math.sin(angle);
    const fx = Math.sin(angle), fz = -Math.cos(angle);
    const arr = [];
    // Forest gets denser and wider the further along the course
    const prog   = Math.min(si / 450, 1);               // 0→1 over 450 segs
    const maxLat = 55 + prog * 110;                     // 55→165 m lateral reach
    const baseN  = 3 + prog * 9;                        // 3→12 avg trees per side
    for (let s = -1; s <= 1; s += 2) {
      const n = Math.round(baseN + Math.random() * (3 + prog * 5));
      for (let k = 0; k < n; k++) {
        const d = RW / 2 + 1.5 + Math.random() * maxLat;
        const f = (Math.random() - 0.5) * SLEN * 5;
        arr.push(spawnTree(pos.x + px*s*d + fx*f, pos.y, pos.z + pz*s*d + fz*f));
      }
    }
    return arr;
  }
}

// ── Buildings (city) ──────────────────────────────────────────────────────────
export class BuildingsSegment extends RaceSegment {
  get kerb()           { return KERB_CONCRETE; }
  get hasObstacles()   { return true;           }
  get hasPedestrians() { return true;           }

  buildMeshes(si, ctx) {
    const { path, RW, SLEN, M, quad, spawnLightPost, spawnBuilding } = ctx;
    const { pos, angle } = path[si];
    const px = Math.cos(angle), pz = Math.sin(angle);
    const fx = Math.sin(angle), fz = -Math.cos(angle);
    const kOuter  = RW * 0.5 + 1.1;
    const swOuter = kOuter + 4.5;
    const p1  = path[si + 1]?.pos;
    const a1  = path[si + 1]?.angle ?? angle;
    const px1 = Math.cos(a1), pz1 = Math.sin(a1);
    const arr = [];

    // ── Pre-compute building placements so pavement can be clipped to their front facade ──
    // Derived constants — change only these two lines to tune spacing/size:
    const MIN_GAP   = 1.0;
    const halfRange = (SLEN - MIN_GAP) / 2;   // 6.0 m  (SLEN=13)
    const placements = {};
    for (let s = -1; s <= 1; s += 2) {
      let cursor = -halfRange;
      while (cursor < halfRange) {
        const raw     = BUILDING_DEFS[Math.random() * BUILDING_DEFS.length | 0];
        const scaledD = halfRange * 2;   // always 12m — fills the window exactly
        if (cursor + scaledD > halfRange) break;
        const baseDef  = { ...raw, w: raw.w * 3, h: raw.h * 3, d: scaledD, easement: raw.easement * 3 };
        const canEnter = baseDef.doorType !== 'garage' && baseDef.h <= 84;
        // Mission system owns all enterable buildings — no random enterable spawning.
        const mo = ctx.missionOverride;
        const forceMission = mo && !mo._applied && canEnter;
        const def = forceMission ? { ...baseDef, enterable: true, ...mo.props } : baseDef;
        if (forceMission) { mo._applied = true; mo._side = s; }
        const center = cursor + def.d * 0.5;
        const depth  = swOuter + def.w * 0.5 + 0.5 + Math.random() * 2 + def.easement;
        placements[s] = { def, center, depth };
        cursor += def.d + MIN_GAP;
      }
    }

    // ── Sidewalk + pavement quads ────────────────────────────────────────────
    if (p1) {
      const ry0 = pos.y, ry1 = p1.y;
      for (let s = -1; s <= 1; s += 2) {
        const sw = quad(
          pos.x+px *s*kOuter,  pos.z+pz *s*kOuter,
          pos.x+px *s*swOuter, pos.z+pz *s*swOuter,
          p1.x+px1*s*kOuter,   p1.z+pz1*s*kOuter,
          p1.x+px1*s*swOuter,  p1.z+pz1*s*swOuter,
          ry0 + 0.46, ry1 + 0.46, M.sidewalk);
        sw.userData.collidable = true;
        arr.push(sw);

        // Pavement outer edge clipped to the building's front facade — nothing under the footprint
        const pl = placements[s];
        const buildFront = pl ? pl.depth - pl.def.w / 2 : swOuter + 20;
        if (buildFront > swOuter + 0.2) {
          const pavOuter = Math.min(buildFront, swOuter + 20);
          const pv = quad(
            pos.x+px *s*swOuter,  pos.z+pz *s*swOuter,
            pos.x+px *s*pavOuter, pos.z+pz *s*pavOuter,
            p1.x+px1*s*swOuter,   p1.z+pz1*s*swOuter,
            p1.x+px1*s*pavOuter,  p1.z+pz1*s*pavOuter,
            ry0 + 0.43, ry1 + 0.43, M.pavement);
          pv.userData.collidable = true;
          arr.push(pv);
        }
      }
    }

    // ── Light posts ──────────────────────────────────────────────────────────
    for (let s = -1; s <= 1; s += 2) {
      if ((si + (s > 0 ? 1 : 0)) % 2 === 0) {
        arr.push(...spawnLightPost(
          pos.x + px*s*(kOuter + 0.7),
          pos.z + pz*s*(kOuter + 0.7),
          angle, s, si));
      }
    }

    // ── Spawn buildings from pre-computed placements ─────────────────────────
    for (let s = -1; s <= 1; s += 2) {
      const pl = placements[s];
      if (!pl) continue;
      const { def, center, depth } = pl;
      const bg = spawnBuilding(def, s, pos.x + px*s*depth + fx*center, pos.z + pz*s*depth + fz*center, angle, pos.y);
      bg.userData.isBuilding = true;
      bg.userData.hw         = def.w / 2;
      bg.userData.hd         = def.d / 2;
      bg.userData.side       = s;
      if (def.enterable) {
        const dw = def.doorType === 'garage' ? def.w * 0.65 : (def.doorType === 'double' ? 2.0 : 1.0);
        bg.userData.enterable = true;
        bg.userData.doorHW    = dw / 2 + 0.4;
        // Tag mission buildings so enterBuilding() can notify MissionSystem
        const mo = ctx.missionOverride;
        if (mo?.stageId && s === mo._side) bg.userData.missionId = mo.stageId;
      }
      arr.push(bg);
    }
    return arr;
  }
}

// ── Tunnel ────────────────────────────────────────────────────────────────────
export class TunnelSegment extends RaceSegment {
  get isTunnel() { return true;          }
  get kerb()     { return KERB_CONCRETE; }
  buildMeshes(si, { spawnTunnel }) { return spawnTunnel(si); }
}

// ── Dirt road ─────────────────────────────────────────────────────────────────
export class DirtSegment extends RaceSegment {
  get roadMat() { return 'dirt';    }
  get kerb()    { return KERB_DIRT; }
  buildGround(si, { spawnTerrain, M }) { return spawnTerrain(si, M.dirtGround); }
  buildMeshes(si, { spawnDirtRocks }) { return spawnDirtRocks(si); }
}

// ── Ether (dimensional boundary) ─────────────────────────────────────────────
export class EtherSegment extends RaceSegment {
  get roadMat() { return 'etherRoad'; }
  get kerb()    { return KERB_NONE;   }
  // No buildMeshes — portal planes are spawned by addDecorations at zone edges
}

// ── Mountains (snowy alpine) ───────────────────────────────────────────────────
export class MountainsSegment extends RaceSegment {
  get roadMat() { return 'snow';    }
  get kerb()    { return KERB_NONE; }
  buildGround(si, { spawnMountainTerrain }) { return spawnMountainTerrain(si); }
  buildMeshes(si, { spawnMountainPeaks })  { return spawnMountainPeaks(si);   }
}

// ── Bridge over water ─────────────────────────────────────────────────────────
export class BridgeSegment extends RaceSegment {
  get kerb() { return KERB_NONE; }   // barriers are built inside spawnBridge
  buildMeshes(si, { spawnBridge }) { return spawnBridge(si); }
}

// ── Intersection (city cross street) ─────────────────────────────────────────
export class IntersectionSegment extends BuildingsSegment {
  get kerb()         { return KERB_NONE; }  // gap at intersection — no concrete bump
  get hasObstacles() { return false; }

  buildMeshes(si, ctx) {
    // Do NOT call super — suppress sidewalk quads and buildings at the crossing
    const { path, M, RW, quad, buildKerb, spawnIntersectionLights } = ctx;
    const arr = [];
    if (!path[si]) return arr;
    const { pos, angle } = path[si];
    const fx = Math.sin(angle), fz = -Math.cos(angle);
    const px = Math.cos(angle), pz =  Math.sin(angle);
    const hw       = RW / 2;          // 7 m — half road width
    const kw       = 1.1;             // kerb width (matches buildSeg)
    const crossExt = RW + 4;          // 18 m — cross road extent from center
    const ry       = pos.y + 0.4;     // road surface Y
    const ky       = pos.y;           // raw Y for kerb base (BASE=0.40 → top ≈ ry)
    const ko       = { BASE: 0.40, PEAK: 0.16, y0: ky, y1: ky }; // concrete kerb opts

    // ── Cross road surface ──────────────────────────────────────────────────
    arr.push(quad(
      pos.x - px*crossExt - fx*hw, pos.z - pz*crossExt - fz*hw,
      pos.x - px*crossExt + fx*hw, pos.z - pz*crossExt + fz*hw,
      pos.x + px*crossExt - fx*hw, pos.z + pz*crossExt - fz*hw,
      pos.x + px*crossExt + fx*hw, pos.z + pz*crossExt + fz*hw,
      ry + 0.01, ry + 0.01, M.road
    ));

    // ── Center dashes on cross road (two halves, skip main-road zone) ───────
    const dw = 0.28;
    const lMidX = pos.x - px * (hw + (crossExt - hw) * 0.5);
    const lMidZ = pos.z - pz * (hw + (crossExt - hw) * 0.5);
    const rMidX = pos.x + px * (hw + (crossExt - hw) * 0.5);
    const rMidZ = pos.z + pz * (hw + (crossExt - hw) * 0.5);
    arr.push(quad(
      pos.x - px*crossExt - fx*dw, pos.z - pz*crossExt - fz*dw,
      pos.x - px*crossExt + fx*dw, pos.z - pz*crossExt + fz*dw,
      lMidX               - fx*dw, lMidZ               - fz*dw,
      lMidX               + fx*dw, lMidZ               + fz*dw,
      ry + 0.05, ry + 0.05, M.dash
    ));
    arr.push(quad(
      rMidX               - fx*dw, rMidZ               - fz*dw,
      rMidX               + fx*dw, rMidZ               + fz*dw,
      pos.x + px*crossExt - fx*dw, pos.z + pz*crossExt - fz*dw,
      pos.x + px*crossExt + fx*dw, pos.z + pz*crossExt + fz*dw,
      ry + 0.05, ry + 0.05, M.dash
    ));

    // ── Kerb caps at cross road ends (perpendicular arches) ─────────────────
    // Right cap
    arr.push(buildKerb(
      pos.x + px*crossExt      - fx*hw, pos.z + pz*crossExt      - fz*hw,
      pos.x + px*(crossExt+kw) - fx*hw, pos.z + pz*(crossExt+kw) - fz*hw,
      pos.x + px*crossExt      + fx*hw, pos.z + pz*crossExt      + fz*hw,
      pos.x + px*(crossExt+kw) + fx*hw, pos.z + pz*(crossExt+kw) + fz*hw,
      M.sidewalk, ko
    ));
    // Left cap
    arr.push(buildKerb(
      pos.x - px*(crossExt+kw) - fx*hw, pos.z - pz*(crossExt+kw) - fz*hw,
      pos.x - px*crossExt      - fx*hw, pos.z - pz*crossExt      - fz*hw,
      pos.x - px*(crossExt+kw) + fx*hw, pos.z - pz*(crossExt+kw) + fz*hw,
      pos.x - px*crossExt      + fx*hw, pos.z - pz*crossExt      + fz*hw,
      M.sidewalk, ko
    ));

    // ── Side kerbs along cross road (outside the main road zone) ────────────
    // Each side has 2 halves split at ±px*hw where the main road cuts through.
    // Bottom side (at -fx*hw → -fx*(hw+kw)):
    arr.push(buildKerb(
      pos.x - px*crossExt - fx*hw,       pos.z - pz*crossExt - fz*hw,
      pos.x - px*crossExt - fx*(hw+kw),  pos.z - pz*crossExt - fz*(hw+kw),
      pos.x - px*hw       - fx*hw,       pos.z - pz*hw       - fz*hw,
      pos.x - px*hw       - fx*(hw+kw),  pos.z - pz*hw       - fz*(hw+kw),
      M.sidewalk, ko
    ));
    arr.push(buildKerb(
      pos.x + px*hw       - fx*hw,       pos.z + pz*hw       - fz*hw,
      pos.x + px*hw       - fx*(hw+kw),  pos.z + pz*hw       - fz*(hw+kw),
      pos.x + px*crossExt - fx*hw,       pos.z + pz*crossExt - fz*hw,
      pos.x + px*crossExt - fx*(hw+kw),  pos.z + pz*crossExt - fz*(hw+kw),
      M.sidewalk, ko
    ));
    // Top side (at +fx*hw → +fx*(hw+kw)):
    arr.push(buildKerb(
      pos.x - px*crossExt + fx*hw,       pos.z - pz*crossExt + fz*hw,
      pos.x - px*crossExt + fx*(hw+kw),  pos.z - pz*crossExt + fz*(hw+kw),
      pos.x - px*hw       + fx*hw,       pos.z - pz*hw       + fz*hw,
      pos.x - px*hw       + fx*(hw+kw),  pos.z - pz*hw       + fz*(hw+kw),
      M.sidewalk, ko
    ));
    arr.push(buildKerb(
      pos.x + px*hw       + fx*hw,       pos.z + pz*hw       + fz*hw,
      pos.x + px*hw       + fx*(hw+kw),  pos.z + pz*hw       + fz*(hw+kw),
      pos.x + px*crossExt + fx*hw,       pos.z + pz*crossExt + fz*hw,
      pos.x + px*crossExt + fx*(hw+kw),  pos.z + pz*crossExt + fz*(hw+kw),
      M.sidewalk, ko
    ));

    // ── Stop lines at all 4 approaches ──────────────────────────────────────
    const addStop = (cx, cz, sdx, sdz) => {
      const bx = -sdz, bz = sdx, hs = hw - 0.5, w = 0.55;
      arr.push(quad(
        cx - sdx*hs - bx*w, cz - sdz*hs - bz*w,
        cx + sdx*hs - bx*w, cz + sdz*hs - bz*w,
        cx - sdx*hs,        cz - sdz*hs,
        cx + sdx*hs,        cz + sdz*hs,
        ry + 0.03, ry + 0.03, M.dash
      ));
    };
    addStop(pos.x - fx*(hw+0.3), pos.z - fz*(hw+0.3), px, pz);               // main, from behind
    addStop(pos.x + fx*(hw+0.3), pos.z + fz*(hw+0.3), px, pz);               // main, from ahead
    addStop(pos.x - px*(crossExt-0.3), pos.z - pz*(crossExt-0.3), fx, fz);   // cross, left
    addStop(pos.x + px*(crossExt-0.3), pos.z + pz*(crossExt-0.3), fx, fz);   // cross, right

    // ── Traffic light poles ─────────────────────────────────────────────────
    if (spawnIntersectionLights) arr.push(...spawnIntersectionLights(si, pos, angle));

    return arr;
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────
export const SEGMENT_TYPES = {
  start:        new StartSegment(),
  trees:        new TreesSegment(),
  buildings:    new BuildingsSegment(),
  tunnel:       new TunnelSegment(),
  dirt:         new DirtSegment(),
  bridge:       new BridgeSegment(),
  intersection: new IntersectionSegment(),
  mountains:    new MountainsSegment(),
  ether:        new EtherSegment(),
};

export const ZONE_PROBS = [
  ['buildings', 0.36],
  ['trees',     0.54],
  ['mountains', 0.65],
  ['ether',     0.72],  // ~7% chance — rare dimensional rift
  ['tunnel',    0.82],
  ['bridge',    0.91],
  ['dirt',      1.00],
];
