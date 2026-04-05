/**
 * minimap.js — Circular minimap renderer
 *
 * Usage:
 *   Minimap.init(canvasEl);
 *   Minimap.addMarker('id', worldX, worldZ, { type: 'objective', route: false });
 *   Minimap.removeMarker('id');
 *   Minimap.update(path, playerSeg, playerX, playerZ, playerAngle);  // each frame
 *   Minimap.clear();   // level teardown
 *
 * Marker types: 'objective' (yellow) | 'poi' (blue) | 'enemy' (red)
 * Add new types to MARKER_STYLES — everything else is automatic.
 *
 * route:true markers draw a yellow road line from player to the objective.
 */

const R           = 76;    // content clip radius (canvas 200px, border drawn at r=78)
const CX          = 100;
const CY          = 100;
const SCALE       = 0.23;  // px per world unit  (SLEN=13 ≈ 25 segs visible ahead)
const LOOK_AHEAD  = 55;
const LOOK_BEHIND = 20;

// Per-type visual config — extend freely
const MARKER_STYLES = {
  objective: { rimColor: '#FFE44D', dotColor: '#FFE44D', dotR: 5, arrowSz: 10 },
  poi:       { rimColor: '#44aaff', dotColor: '#44aaff', dotR: 4, arrowSz: 7 },
  enemy:     { rimColor: '#ff4422', dotColor: '#ff4422', dotR: 3, arrowSz: 6 },
};

class MinimapImpl {
  constructor() {
    this._canvas  = null;
    this._ctx     = null;
    this._markers = new Map();   // id → { worldX, worldZ, type, color?, route }
  }

  init(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
  }

  /**
   * Register or update a world-space marker.
   * @param {string} id         Unique key (e.g. mission stage id)
   * @param {number} worldX
   * @param {number} worldZ
   * @param {object} [opts]
   * @param {string} [opts.type='objective']  Key in MARKER_STYLES
   * @param {string} [opts.color]             Override color
   * @param {boolean} [opts.route=false]      Draw yellow road line from player to this marker
   */
  addMarker(id, worldX, worldZ, { type = 'objective', color, route = false } = {}) {
    this._markers.set(id, { worldX, worldZ, type, color, route });
  }

  removeMarker(id) { this._markers.delete(id); }

  clear() { this._markers.clear(); }

  /** Call once per frame from the render loop */
  update(path, playerSeg, playerX, playerZ, playerAngle) {
    const ctx = this._ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, 200, 200);

    // ── Border ring ──────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(CX, CY, 78, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.80)';
    ctx.lineWidth   = 3;
    ctx.stroke();

    // ── Clip all interior drawing to the circle ───────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fill();

    // White road path
    const from = Math.max(0, playerSeg - LOOK_BEHIND);
    const to   = Math.min(path.length - 1, playerSeg + LOOK_AHEAD);
    if (to > from) {
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const s = this._w2s(path[i].pos.x, path[i].pos.z, playerX, playerZ, playerAngle);
        i === from ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth   = 3;
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }

    // Yellow route lines for route:true markers
    for (const m of this._markers.values()) {
      if (!m.route) continue;
      const objSeg = this._nearestSeg(m.worldX, m.worldZ, path, playerSeg, LOOK_AHEAD + 10);
      if (objSeg <= playerSeg) continue;
      const routeTo = Math.min(objSeg, to);
      if (routeTo <= from) continue;
      ctx.beginPath();
      for (let i = from; i <= routeTo; i++) {
        const s = this._w2s(path[i].pos.x, path[i].pos.z, playerX, playerZ, playerAngle);
        i === from ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
      }
      ctx.strokeStyle = m.color ?? 'rgba(255,228,77,0.85)';
      ctx.lineWidth   = 4;
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }

    // Marker dots that fall inside the minimap circle
    for (const m of this._markers.values()) {
      const s    = this._w2s(m.worldX, m.worldZ, playerX, playerZ, playerAngle);
      const dist = Math.hypot(s.x - CX, s.y - CY);
      if (dist > R - 8) continue;   // handled as rim arrow below
      const style = MARKER_STYLES[m.type] ?? MARKER_STYLES.objective;
      ctx.beginPath();
      ctx.arc(s.x, s.y, style.dotR, 0, Math.PI * 2);
      ctx.fillStyle = m.color ?? style.dotColor;
      ctx.fill();
    }

    // Player dot + heading tick (always at center)
    ctx.beginPath();
    ctx.arc(CX, CY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(CX, CY - 4);
    ctx.lineTo(CX, CY - 10);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.restore();  // end clip

    // ── Rim arrows — drawn at r=86, outside the white border at r=78 ──
    for (const m of this._markers.values()) {
      const s    = this._w2s(m.worldX, m.worldZ, playerX, playerZ, playerAngle);
      const dist = Math.hypot(s.x - CX, s.y - CY);
      if (dist <= R - 8) continue;   // already drawn as dot
      const style = MARKER_STYLES[m.type] ?? MARKER_STYLES.objective;
      const col   = m.color ?? style.rimColor;
      const sz    = style.arrowSz;
      const a     = Math.atan2(s.y - CY, s.x - CX);
      const ex    = CX + Math.cos(a) * 86;
      const ey    = CY + Math.sin(a) * 86;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.lineTo(sz * 0.6, sz * 0.5);
      ctx.lineTo(-sz * 0.6, sz * 0.5);
      ctx.closePath();
      // Dark outline for contrast
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    }
  }

  /** World XZ → canvas XY  (heading-up: player forward = canvas up) */
  _w2s(wx, wz, px, pz, angle) {
    const dx  = wx - px;
    const dz  = wz - pz;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: CX + (dx * cos + dz * sin) * SCALE,
      y: CY + (-dx * sin + dz * cos) * SCALE,
    };
  }

  /**
   * Find the path segment index nearest to (wx, wz), scanning forward from fromSeg.
   * Returns -1 if path is empty.
   */
  _nearestSeg(wx, wz, path, fromSeg, maxScan) {
    let best = -1, minD2 = Infinity;
    const limit = Math.min(path.length - 1, fromSeg + maxScan);
    for (let i = fromSeg; i <= limit; i++) {
      const p  = path[i].pos;
      const d2 = (p.x - wx) ** 2 + (p.z - wz) ** 2;
      if (d2 < minD2) { minD2 = d2; best = i; }
    }
    return best;
  }
}

export const Minimap = new MinimapImpl();
