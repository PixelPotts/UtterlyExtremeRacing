/**
 * test_mission.js — "Package Run"
 *
 * Exercises the full new mission system:
 *   - Giver building in world  (accept triggers briefing)
 *   - enter_building objective (spatial spawn in next buildings zone)
 *   - event objective          (notifyEvent 'enemy_hit' × 2)
 *   - Timer fail condition     (180 s; auto-resets on failure)
 *   - Score reward + debrief   (on complete)
 */

import { TEST_BRIEFING } from '../stories/test_briefing.js';
import { TEST_DEBRIEF }  from '../stories/test_debrief.js';

export const TEST_MISSIONS = [
  {
    id:           'package_run',
    name:         'Package Run',
    prerequisite: null,

    giver: {
      spawn: { zone: 'buildings', offset: 8, props: { enterable: true } },
    },

    briefing: TEST_BRIEFING,

    objectives: [
      {
        id:      'reach_contact',
        hudText: 'Reach the contact',
        spawn:   { zone: 'buildings', offset: 10, props: { enterable: true, awningMatIdx: 2 } },
        trigger: { type: 'enter_building' },
      },
      {
        id:      'neutralize',
        hudText: 'Take out 2 pursuers',
        trigger: { type: 'event', event: 'enemy_hit', count: 2 },
      },
    ],

    failConditions: [
      { type: 'timer', seconds: 180 },
    ],

    rewards: [
      { type: 'score', amount: 1000 },
    ],

    debrief: TEST_DEBRIEF,
  },
];
