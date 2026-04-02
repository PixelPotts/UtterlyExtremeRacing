/**
 * dialog.js — Story/dialog system engine
 *
 * Usage:
 *   import { DialogSystem } from './assets/dialog.js';
 *   await DialogSystem.show(someScript);
 *
 * Script format:
 *   [
 *     { speaker: 'NAME', portraitColor: '#c00', text: 'Line of dialog here.' },
 *     ...
 *   ]
 *
 * The portrait field (optional) can be a URL string pointing to an image.
 * If omitted, a color block with the speaker's initial is rendered instead.
 */

const TYPEWRITER_MS = 28;   // ms per character
const PORTRAIT_W    = 160;  // px

// ── DOM ────────────────────────────────────────────────────────────────────

function buildDOM() {
  const el = document.createElement('div');
  el.id = 'dialog-box';
  el.innerHTML = `
    <div id="dlg-portrait"></div>
    <div id="dlg-right">
      <div id="dlg-speaker"></div>
      <div id="dlg-text"></div>
      <div id="dlg-prompt">&#9654;</div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

// ── DialogSystem singleton ─────────────────────────────────────────────────

let _el        = null;   // root DOM element
let _active    = false;
let _resolve   = null;   // Promise resolver
let _lines     = [];
let _lineIdx   = 0;
let _typeTimer = null;
let _charIdx   = 0;
let _lineComplete = false;

function _getEls() {
  if (!_el) _el = buildDOM();
  return {
    box:      _el,
    portrait: document.getElementById('dlg-portrait'),
    speaker:  document.getElementById('dlg-speaker'),
    text:     document.getElementById('dlg-text'),
    prompt:   document.getElementById('dlg-prompt'),
  };
}

function _stopTypewriter() {
  if (_typeTimer !== null) {
    clearInterval(_typeTimer);
    _typeTimer = null;
  }
}

function _showLine(idx) {
  const line = _lines[idx];
  const { portrait, speaker, text, prompt } = _getEls();

  // Portrait
  portrait.innerHTML = '';
  portrait.style.background = line.portraitColor || '#1a1a2e';
  if (line.portrait) {
    const img = document.createElement('img');
    img.src = line.portrait;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    portrait.appendChild(img);
  } else {
    const init = document.createElement('div');
    init.className = 'dlg-initial';
    init.textContent = (line.speaker || '?')[0].toUpperCase();
    portrait.appendChild(init);
  }

  // Speaker name
  speaker.textContent = line.speaker || '';

  // Start typewriter
  const fullText = line.text;
  text.textContent = '';
  _charIdx = 0;
  _lineComplete = false;
  prompt.style.opacity = '0';

  _stopTypewriter();
  _typeTimer = setInterval(() => {
    _charIdx++;
    text.textContent = fullText.slice(0, _charIdx);
    if (_charIdx >= fullText.length) {
      _stopTypewriter();
      _lineComplete = true;
      prompt.style.opacity = '1';
    }
  }, TYPEWRITER_MS);
}

function _completeLine() {
  // Instantly finish the current line's typewriter
  const line = _lines[_lineIdx];
  const { text, prompt } = _getEls();
  _stopTypewriter();
  text.textContent = line.text;
  _lineComplete = true;
  prompt.style.opacity = '1';
}

function _advance() {
  if (!_active) return;

  if (!_lineComplete) {
    // First action while typing → skip to end of line
    _completeLine();
    return;
  }

  // Already done with line → go to next
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
  const { box } = _getEls();
  box.classList.remove('dlg-visible');
  document.removeEventListener('keydown', _onKey);
  box.removeEventListener('click', _onClick);
  const res = _resolve;
  _resolve = null;
  if (res) res();
}

function _onKey(e) {
  // Ignore modifier-only keys
  if (['Shift','Control','Alt','Meta'].includes(e.key)) return;
  _advance();
}

function _onClick() {
  _advance();
}

// ── Public API ─────────────────────────────────────────────────────────────

export const DialogSystem = {
  /**
   * Show a dialog script.
   * @param {Array<{speaker:string, portraitColor?:string, portrait?:string, text:string}>} script
   * @returns {Promise<void>} resolves when the player finishes all lines
   */
  show(script) {
    if (_active) {
      console.warn('DialogSystem: already active, ignoring show()');
      return Promise.resolve();
    }
    if (!script || script.length === 0) return Promise.resolve();

    _lines   = script;
    _lineIdx = 0;
    _active  = true;

    const { box } = _getEls();
    box.classList.add('dlg-visible');

    document.addEventListener('keydown', _onKey);
    box.addEventListener('click', _onClick);

    _showLine(0);

    return new Promise(res => { _resolve = res; });
  },

  /** True while a dialog is on screen (use to suppress player input) */
  isActive() { return _active; },

  /** Skip/close instantly (e.g. for pause/restart) */
  dismiss() {
    if (_active) _finish();
  },
};
