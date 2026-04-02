/**
 * dialog.js — Story/dialog system engine
 *
 * Usage:
 *   import { DialogSystem } from './assets/dialog.js';
 *   await DialogSystem.show(someScript);
 *
 * Script format:
 *   [{ speaker, portrait, portraitColor?, text }]
 *
 * portrait: URL string for an image, or omit for a solid-color fallback.
 */

const TYPEWRITER_MS          = 28;
const PORTRAIT_PX            = 150;   // canvas render size

const GLITCH_INTERVAL_MIN    = 3000;
const GLITCH_INTERVAL_RAND   = 4000;
const GLITCH_DURATION_MIN    = 160;
const GLITCH_DURATION_RAND   = 380;

const STATIC_INTERVAL_MIN    = 45000;
const STATIC_INTERVAL_RAND   = 30000;
const STATIC_DURATION_MIN    = 3200;
const STATIC_DURATION_RAND   = 1800;

const W = PORTRAIT_PX, H = PORTRAIT_PX;

// ── DOM ────────────────────────────────────────────────────────────────────

function buildDOM() {
  const el = document.createElement('div');
  el.id = 'dialog-box';
  el.innerHTML = `
    <span class="dlg-corner dlg-tl"></span>
    <span class="dlg-corner dlg-tr"></span>
    <span class="dlg-corner dlg-bl"></span>
    <span class="dlg-corner dlg-br"></span>
    <div id="dlg-portrait-wrap">
      <canvas id="dlg-portrait-canvas" width="${W}" height="${H}"></canvas>
    </div>
    <div id="dlg-right">
      <div id="dlg-speaker"></div>
      <div id="dlg-text"></div>
      <div id="dlg-prompt">&#9654;&nbsp;CONTINUE</div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

// ── Portrait FX ────────────────────────────────────────────────────────────

let _pCanvas    = null;   // <canvas>
let _pCtx       = null;   // CanvasRenderingContext2D
let _pImg       = null;   // current HTMLImageElement
let _pColor     = '#0a0a12';
let _glitchRaf  = null;
let _glitchState = 'idle';  // 'idle' | 'normal' | 'glitch' | 'static'
let _glitchEnd  = 0;
let _tmrGlitch  = null;
let _tmrStatic  = null;

function _scanlines(ctx, alpha) {
  for (let y = 0; y < H; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, y, W, 1);
  }
}

function _vignette(ctx) {
  const g = ctx.createRadialGradient(W * .5, H * .5, H * .2, W * .5, H * .5, H * .75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function _drawNormal() {
  const ctx = _pCtx;
  ctx.clearRect(0, 0, W, H);
  if (_pImg) {
    ctx.drawImage(_pImg, 0, 0, W, H);
  } else {
    ctx.fillStyle = _pColor;
    ctx.fillRect(0, 0, W, H);
  }
  // Subtle cyan cast
  ctx.fillStyle = 'rgba(0,220,180,0.07)';
  ctx.fillRect(0, 0, W, H);
  _scanlines(ctx, 0.50);
  _vignette(ctx);
}

function _drawGlitch() {
  const ctx = _pCtx;
  ctx.clearRect(0, 0, W, H);

  if (_pImg) {
    // Horizontal slice tears
    let y = 0;
    while (y < H) {
      const sh = 2 + (Math.random() * 24 | 0);
      const clamp = Math.min(sh, H - y);
      const dx = Math.random() < 0.45 ? (Math.random() * 32 - 16) | 0 : 0;
      ctx.drawImage(_pImg, 0, y, W, clamp, dx, y, W, clamp);
      y += sh;
    }

    // RGB chromatic aberration via blend
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.20;
    ctx.filter = 'saturate(500%) hue-rotate(0deg)';
    ctx.drawImage(_pImg, -6, 0, W, H);
    ctx.filter = 'saturate(500%) hue-rotate(195deg)';
    ctx.drawImage(_pImg,  6, 2, W, H);
    ctx.filter = 'none';
    ctx.restore();
  } else {
    ctx.fillStyle = _pColor;
    ctx.fillRect(0, 0, W, H);
  }

  // Bright horizontal streaks
  for (let i = 0; i < 6; i++) {
    if (Math.random() < 0.55) {
      ctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.6).toFixed(2)})`;
      ctx.fillRect(0, (Math.random() * H) | 0, W, 1 + (Math.random() * 3 | 0));
    }
  }

  // Stronger cyan cast during glitch
  ctx.fillStyle = `rgba(0,255,180,${(0.08 + Math.random() * 0.14).toFixed(2)})`;
  ctx.fillRect(0, 0, W, H);

  _scanlines(ctx, 0.55);
}

function _drawStatic() {
  const ctx = _pCtx;
  const id = ctx.createImageData(W, H);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255 | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 230;
  }
  ctx.putImageData(id, 0, 0);

  // Ghost image flicker
  if (_pImg && Math.random() < 0.12) {
    ctx.save();
    ctx.globalAlpha = 0.09 + Math.random() * 0.08;
    ctx.drawImage(_pImg, (Math.random() * 10 - 5) | 0, (Math.random() * 6 - 3) | 0, W, H);
    ctx.restore();
  }

  // Dark distortion bars
  for (let i = 0; i < 4; i++) {
    if (Math.random() < 0.45) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, (Math.random() * H) | 0, W, 2 + (Math.random() * 10 | 0));
    }
  }
}

function _glitchFrame() {
  const now = Date.now();
  if (_glitchState === 'glitch') {
    if (now >= _glitchEnd) {
      _glitchState = 'normal';
      _drawNormal();
      _scheduleGlitch();
      _glitchRaf = null;
      return;
    }
    _drawGlitch();
  } else if (_glitchState === 'static') {
    if (now >= _glitchEnd) {
      _glitchState = 'normal';
      _drawNormal();
      _scheduleGlitch();
      _scheduleStatic();
      _glitchRaf = null;
      return;
    }
    _drawStatic();
  } else {
    _glitchRaf = null;
    return;
  }
  _glitchRaf = requestAnimationFrame(_glitchFrame);
}

function _startGlitch() {
  if (_glitchState !== 'normal') { _scheduleGlitch(); return; }
  _glitchState = 'glitch';
  _glitchEnd = Date.now() + GLITCH_DURATION_MIN + (Math.random() * GLITCH_DURATION_RAND | 0);
  if (_glitchRaf) cancelAnimationFrame(_glitchRaf);
  _glitchRaf = requestAnimationFrame(_glitchFrame);
}

function _startStatic() {
  if (_glitchState !== 'normal') { _scheduleStatic(); return; }
  if (_tmrGlitch) { clearTimeout(_tmrGlitch); _tmrGlitch = null; }
  _glitchState = 'static';
  _glitchEnd = Date.now() + STATIC_DURATION_MIN + (Math.random() * STATIC_DURATION_RAND | 0);
  if (_glitchRaf) cancelAnimationFrame(_glitchRaf);
  _glitchRaf = requestAnimationFrame(_glitchFrame);
}

function _scheduleGlitch() {
  _tmrGlitch = setTimeout(_startGlitch, GLITCH_INTERVAL_MIN + Math.random() * GLITCH_INTERVAL_RAND);
}

function _scheduleStatic() {
  _tmrStatic = setTimeout(_startStatic, STATIC_INTERVAL_MIN + Math.random() * STATIC_INTERVAL_RAND);
}

function _startPortraitFX() {
  _glitchState = 'normal';
  _scheduleGlitch();
  _scheduleStatic();
}

function _stopPortraitFX() {
  if (_glitchRaf)  { cancelAnimationFrame(_glitchRaf); _glitchRaf = null; }
  if (_tmrGlitch)  { clearTimeout(_tmrGlitch);  _tmrGlitch = null; }
  if (_tmrStatic)  { clearTimeout(_tmrStatic);  _tmrStatic = null; }
  _glitchState = 'idle';
}

function _loadPortrait(src, color) {
  _pColor = color || '#0a0a12';
  if (!src) {
    _pImg = null;
    if (_glitchState === 'normal') _drawNormal();
    return;
  }
  const img = new Image();
  img.onload = () => {
    _pImg = img;
    if (_glitchState === 'normal') _drawNormal();
  };
  img.src = src;
}

// ── Dialog state ───────────────────────────────────────────────────────────

let _el           = null;
let _active       = false;
let _resolve      = null;
let _lines        = [];
let _lineIdx      = 0;
let _typeTimer    = null;
let _charIdx      = 0;
let _lineComplete = false;

function _getEls() {
  if (!_el) {
    _el = buildDOM();
    _pCanvas = document.getElementById('dlg-portrait-canvas');
    _pCtx    = _pCanvas.getContext('2d');
  }
  return {
    box:     _el,
    speaker: document.getElementById('dlg-speaker'),
    text:    document.getElementById('dlg-text'),
    prompt:  document.getElementById('dlg-prompt'),
  };
}

function _stopTypewriter() {
  if (_typeTimer !== null) { clearInterval(_typeTimer); _typeTimer = null; }
}

function _showLine(idx) {
  const line    = _lines[idx];
  const prev    = _lines[idx - 1];
  const { speaker, text, prompt } = _getEls();

  if (!prev || line.portrait !== prev.portrait) {
    _loadPortrait(line.portrait || null, line.portraitColor);
  }

  speaker.textContent = line.speaker || '';
  text.textContent = '';
  _charIdx = 0;
  _lineComplete = false;
  prompt.classList.remove('dlg-prompt-show');

  _stopTypewriter();
  const full = line.text;
  _typeTimer = setInterval(() => {
    _charIdx++;
    text.textContent = full.slice(0, _charIdx);
    if (_charIdx >= full.length) {
      _stopTypewriter();
      _lineComplete = true;
      prompt.classList.add('dlg-prompt-show');
    }
  }, TYPEWRITER_MS);
}

function _completeLine() {
  const { text, prompt } = _getEls();
  _stopTypewriter();
  text.textContent = _lines[_lineIdx].text;
  _lineComplete = true;
  prompt.classList.add('dlg-prompt-show');
}

function _advance() {
  if (!_active) return;
  if (!_lineComplete) { _completeLine(); return; }
  _lineIdx++;
  if (_lineIdx >= _lines.length) {
    _finish();
  } else {
    _showLine(_lineIdx);
  }
}

function _finish() {
  _active = false;
  _stopTypewriter();
  _stopPortraitFX();
  const { box } = _getEls();
  box.classList.remove('dlg-visible');
  document.removeEventListener('keydown', _onKey);
  box.removeEventListener('click', _onClick);
  const res = _resolve;
  _resolve = null;
  if (res) res();
}

function _onKey(e) {
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
  _advance();
}
function _onClick() { _advance(); }

// ── Public API ─────────────────────────────────────────────────────────────

export const DialogSystem = {
  show(script) {
    if (_active) { console.warn('DialogSystem: already active'); return Promise.resolve(); }
    if (!script || !script.length) return Promise.resolve();

    _lines   = script;
    _lineIdx = 0;
    _active  = true;

    const { box } = _getEls();
    box.classList.add('dlg-visible');

    document.addEventListener('keydown', _onKey);
    box.addEventListener('click', _onClick);

    _startPortraitFX();
    _showLine(0);

    return new Promise(res => { _resolve = res; });
  },

  isActive() { return _active; },

  dismiss() { if (_active) _finish(); },
};
