/**
 * level1.js — Mission script for Level 1
 *
 * Ordered stage array. The MissionSystem processes these in dependency order
 * (prerequisite chain), not necessarily array order.
 *
 * Stages run across the full level — the level does not end until all complete.
 * Each spawnable stage is injected into the next valid zone of the required type
 * and re-queued into every subsequent valid zone until the player completes it.
 */

import { DOOR_ENTRY }   from '../stories/door_entry.js';
import { GREEN_AWNING } from '../stories/green_awning.js';

export const LEVEL1_MISSION = [
  // ── Stage 0: Yellow door ───────────────────────────────────────────────────
  // First enterable building in any city zone. Decker meets Jane.
  {
    id:           'door_entry',
    prerequisite: null,             // active from level start
    spawn: {
      zone:   'buildings',
      offset: 8,
      props:  { enterable: true },
    },
    trigger: { type: 'enter_building' },
    story:   DOOR_ENTRY,
  },

  // ── Stage 1: Green awning ──────────────────────────────────────────────────
  // Next city zone after door_entry completes. Decker meets Termo.
  {
    id:           'green_awning',
    prerequisite: 'door_entry',
    spawn: {
      zone:   'buildings',
      offset: 8,
      props:  { enterable: true, awningMatIdx: 2 },  // index 2 = green in AWNING_MATS
    },
    trigger: { type: 'enter_building' },
    story:   GREEN_AWNING,
  },
];
