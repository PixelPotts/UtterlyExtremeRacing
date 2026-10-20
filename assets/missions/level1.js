/**
 * level1.js — Mission chain for Level 1
 *
 * Each story stop is a mission whose giver is the building; entering it plays
 * the story as the briefing and completes the mission (no objectives). The
 * next stop's giver then spawns in the next city zone. The package run closes
 * the level; finishing it starts Level 2.
 */

import { DOOR_ENTRY }    from '../stories/door_entry.js';
import { GREEN_AWNING }  from '../stories/green_awning.js';
import { SHOP_RESCUE }   from '../stories/shop_rescue.js';
import { TEST_MISSIONS } from './test_mission.js';

export const LEVEL1_MISSIONS = [
  // ── Stop 1: Yellow door — Decker meets Jane ──────────────────────────────
  {
    id:           'door_entry',
    name:         'Safe House',
    prerequisite: null,
    giver:        { spawn: { zone: 'buildings', offset: 8, props: { enterable: true } } },
    briefing:     DOOR_ENTRY,
  },

  // ── Stop 2: Green awning — Decker meets Termo ────────────────────────────
  {
    id:           'green_awning',
    name:         'The Dealer',
    prerequisite: 'door_entry',
    giver:        { spawn: { zone: 'buildings', offset: 8, props: { enterable: true, awningMatIdx: 2 } } },  // 2 = green
    briefing:     GREEN_AWNING,
  },

  // ── Stop 3: Distressed shop — Mila's patrol-gap intel ────────────────────
  // awningMatIdx:7 = white/green stripes; isShop:true = open interior + NPC
  {
    id:           'shop_rescue',
    name:         'Lockdown',
    prerequisite: 'green_awning',
    giver:        { spawn: { zone: 'buildings', offset: 8, props: { enterable: true, awningMatIdx: 7, isShop: true } } },
    briefing:     SHOP_RESCUE,
  },

  // ── Finale: Package Run — contact, then two pursuers ─────────────────────
  { ...TEST_MISSIONS[0], prerequisite: 'shop_rescue' },
];
