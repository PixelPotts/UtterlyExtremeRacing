# UtterlyExtremeRacing — Claude Instructions

## Git
- **Commit every change immediately after making it** — no exceptions
- Remote: https://github.com/PixelPotts/UtterlyExtremeRacing.git
- Push to `origin main` after committing unless told otherwise

## Project
- Single-file browser game: `index.html` + `assets/` modules
- No build system, no bundler — pure ES modules served directly
- Level 1: daylight, trees/city/tunnel/dirt/bridge zones
- Level 2: neon night, `segments_l2.js` handles all L2 zone types

## Code Guidelines
- Keep files ≤500 lines; split into logical modules when exceeded
- New features → new files where reasonable
- No framework, no package manager — vanilla Three.js via importmap
