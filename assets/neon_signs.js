import * as THREE from 'three';

// ── Sign configurations ───────────────────────────────────────────────────────
// style: 'neon' | 'backlit' | 'painted'
// w/h : physical size in metres (clamped to building facade width)
const SIGN_CONFIGS = [
  { text: 'HOTEL',        color: '#FF3366', style: 'neon',    w: 3.0, h: 1.2 },
  { text: 'DINER',        color: '#FFAA00', style: 'neon',    w: 2.4, h: 1.0 },
  { text: 'OPEN 24H',     color: '#00FFCC', style: 'neon',    w: 3.6, h: 1.0 },
  { text: 'MARKET',       color: '#FF6600', style: 'backlit', w: 4.0, h: 1.0 },
  { text: 'BAR',          color: '#FF0088', style: 'neon',    w: 1.8, h: 1.0 },
  { text: 'PHARMACY',     color: '#00FF44', style: 'backlit', w: 4.5, h: 1.0 },
  { text: 'PAWN',         color: '#FFD700', style: 'neon',    w: 2.2, h: 1.0 },
  { text: 'LAUNDRY',      color: '#4488FF', style: 'backlit', w: 4.0, h: 1.0 },
  { text: 'CAFE',         color: '#FF8844', style: 'painted', w: 3.0, h: 1.2 },
  { text: 'AUTO PARTS',   color: '#FF4400', style: 'backlit', w: 4.5, h: 1.0 },
  { text: 'TATTOO',       color: '#CC00FF', style: 'neon',    w: 3.5, h: 1.0 },
  { text: 'PIZZA',        color: '#FF3300', style: 'backlit', w: 3.0, h: 1.0 },
  { text: 'NAILS',        color: '#FF44AA', style: 'neon',    w: 2.5, h: 1.0 },
  { text: 'GAS',          color: '#FFCC00', style: 'neon',    w: 2.0, h: 1.0 },
  { text: 'MOTEL',        color: '#FF6633', style: 'neon',    w: 3.0, h: 1.0 },
  { text: 'LIQUOR',       color: '#8844FF', style: 'neon',    w: 3.5, h: 1.0 },
  { text: 'SMOKE SHOP',   color: '#AAFF00', style: 'backlit', w: 4.5, h: 1.0 },
  { text: 'CHECK\nCASH',  color: '#FFAA22', style: 'neon',    w: 3.5, h: 1.4 },
  { text: 'REPAIR',       color: '#44AAFF', style: 'backlit', w: 3.5, h: 1.0 },
  { text: 'CHINESE',      color: '#FF2222', style: 'painted', w: 4.0, h: 1.2 },
  { text: 'BODEGA',       color: '#FFDD00', style: 'painted', w: 3.5, h: 1.0 },
  { text: '★ OPEN ★',    color: '#FF4400', style: 'neon',    w: 3.0, h: 1.0 },
  { text: 'EAT',          color: '#FFAA00', style: 'neon',    w: 2.0, h: 1.0 },
  { text: 'LOANS',        color: '#FF6622', style: 'neon',    w: 2.5, h: 1.0 },
  { text: 'TACOS',        color: '#FF9900', style: 'painted', w: 3.0, h: 1.0 },
  { text: 'NEON CITY',    color: '#FF00FF', style: 'neon',    w: 4.5, h: 1.2 },
  { text: 'GUNS',         color: '#CCEE00', style: 'backlit', w: 2.5, h: 1.0 },
  { text: 'BAIL BONDS',   color: '#FF8800', style: 'neon',    w: 4.0, h: 1.0 },
  { text: 'DELI',         color: '#44FF88', style: 'painted', w: 2.5, h: 1.0 },
  { text: 'PARKING',      color: '#2288FF', style: 'backlit', w: 4.0, h: 1.0 },
];

// ── Rounded rect helper ───────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Canvas texture generation ─────────────────────────────────────────────────
function makeSignTexture(text, color, style) {
  const W = 512, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const lines = text.split('\n');
  const lineH  = H / lines.length;
  const fontSize = Math.min(96, Math.floor(lineH * 0.72));

  if (style === 'neon') {
    // Dark background
    ctx.fillStyle = '#07070f';
    ctx.fillRect(0, 0, W, H);

    // Outer tube border — two strokes for tube thickness
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    roundRect(ctx, 10, 10, W - 20, H - 20, 14); ctx.stroke();
    ctx.shadowBlur = 8;
    roundRect(ctx, 16, 16, W - 32, H - 32, 10); ctx.stroke();

    // Text — layered glow passes
    ctx.font = `bold ${fontSize}px 'Arial Narrow', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const y = (i + 0.5) * lineH;
      ctx.shadowBlur = 42; ctx.shadowColor = color;
      ctx.fillStyle = color; ctx.fillText(line, W / 2, y);
      ctx.shadowBlur = 18; ctx.fillStyle = color; ctx.fillText(line, W / 2, y);
      ctx.shadowBlur = 0;  ctx.fillStyle = '#ffffff'; ctx.fillText(line, W / 2, y);
    });

  } else if (style === 'backlit') {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    // Coloured face
    ctx.fillStyle = color;
    ctx.fillRect(6, 6, W - 12, H - 12);
    // Subtle inner shadow
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   'rgba(255,255,255,0.18)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0)');
    grad.addColorStop(1,   'rgba(0,0,0,0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(6, 6, W - 12, H - 12);

    ctx.font = `bold ${fontSize}px Impact, 'Arial Narrow', Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, i) => ctx.fillText(line, W / 2, (i + 0.5) * lineH));

  } else { // painted
    // Aged painted sign
    ctx.fillStyle = '#e8e2d0';
    ctx.fillRect(0, 0, W, H);
    // Grungy noise patches
    for (let k = 0; k < 45; k++) {
      const a = 0.035 + Math.random() * 0.07;
      ctx.fillStyle = `rgba(${Math.round(Math.random()*60)},${Math.round(Math.random()*50)},${Math.round(Math.random()*40)},${a.toFixed(2)})`;
      ctx.fillRect(Math.random() * W, Math.random() * H,
                   Math.random() * 80 + 10, Math.random() * 50 + 8);
    }
    ctx.lineWidth = 9; ctx.strokeStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 6;
    roundRect(ctx, 8, 8, W - 16, H - 16, 8);   ctx.stroke();
    ctx.lineWidth = 5;
    roundRect(ctx, 16, 16, W - 32, H - 32, 5); ctx.stroke();

    ctx.font = `bold ${fontSize}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur = 5; ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.fillStyle = color;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, (i + 0.5) * lineH));
  }

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

// ── Texture + material cache (shared across all buildings) ────────────────────
// Pre-generated at module load time so makeSignTexture's expensive canvas
// shadow-blur operations never run during gameplay (first buildings segment
// was causing ~1600ms freeze from lazy sign creation).
const _texCache = new Map();
const _matCache = new Map();

function getSignMaterial(cfg) {
  if (_matCache.has(cfg)) return _matCache.get(cfg);
  if (!_texCache.has(cfg)) {
    _texCache.set(cfg, makeSignTexture(cfg.text, cfg.color, cfg.style));
  }
  const tex = _texCache.get(cfg);
  const mat = new THREE.MeshStandardMaterial({
    map:             tex,
    emissiveMap:     tex,
    emissive:        new THREE.Color(cfg.color),
    emissiveIntensity: cfg.style === 'neon' ? 1.4 : 0.45,
    roughness: 0.9, metalness: 0,
  });
  _matCache.set(cfg, mat);
  return mat;
}

// Pre-populate all 30 sign textures+materials now (module load = page init,
// not gameplay), and export them for shader warmup in index.html.
for (const cfg of SIGN_CONFIGS) getSignMaterial(cfg);
export const SIGN_WARMUP_MATS = [..._matCache.values()];

// ── spawnSign ─────────────────────────────────────────────────────────────────
// Adds a sign plane + backing box + glow light to the building group.
//
// Building local coordinate convention (must match Building class):
//   X  — perpendicular to road (depth into block)
//   Y  — vertical (bottom of building = -h/2)
//   Z  — parallel to road (along facade)
//
// Road-facing wall:
//   side=+1 → at X = -w/2   (normal points in -X = toward road)
//   side=-1 → at X = +w/2   (normal points in +X = toward road)
//
export function spawnSign(group, { side, w, h, d, doorType }, groundH) {
  if (doorType === 'garage') return;
  if (Math.random() > 0.30) return;

  const cfg = SIGN_CONFIGS[Math.floor(Math.random() * SIGN_CONFIGS.length)];

  // Clamp sign width to 65% of facade depth (Z dimension)
  const sw = Math.min(cfg.w, d * 0.65);
  const sh = cfg.h;

  // Random Z offset along facade (centred ± available half-range)
  const maxZ = Math.max(0, d * 0.5 - sw * 0.5 - 0.35);
  const zOff = (Math.random() - 0.5) * 2 * maxZ;

  // Y: above ground floor, near the floor-band trim line
  const signY = -h / 2 + groundH + sh * 0.5 + 0.55;

  // Wall X and face X (sign projects slightly outward)
  const wallX = -side * w / 2;
  const faceX = wallX - side * 0.14;

  // Backing box (thin, dark) flush against wall
  const backMat = new THREE.MeshLambertMaterial({ color: 0x080808 });
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, sh + 0.24, sw + 0.28), backMat);
  back.position.set(wallX - side * 0.09, signY, zOff);
  group.add(back);

  // Sign face: PlaneGeometry normal = +Z by default.
  // rotation.y = -side * PI/2 → normal points toward road:
  //   side=+1 → rotation.y = -PI/2 → normal points in -X  ✓
  //   side=-1 → rotation.y = +PI/2 → normal points in +X  ✓
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(sw, sh), getSignMaterial(cfg));
  face.position.set(faceX, signY, zOff);
  face.rotation.y = -side * Math.PI / 2;
  group.add(face);

  // Note: no PointLight — emissive intensity on the face material provides the glow
  // without the per-fragment lighting cost of dynamic lights.
}
