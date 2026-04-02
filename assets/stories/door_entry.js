/**
 * door_entry.js — Story triggered on first yellow door entry in the city
 *
 * Decker finds Jane, a resistance hacker who's been hiding in the building
 * and monitoring the convoy AI systems.
 */

export const DOOR_ENTRY = [
  {
    speaker:  'DECKER',
    portrait: 'assets/sprites/decker.png',
    text: "Hello? Someone in here?",
  },
  {
    speaker:  'JANE',
    portrait: 'assets/sprites/jane.png',
    text: "Over here. Keep your voice down — the patrol drones sweep this block every four minutes.",
  },
  {
    speaker:  'DECKER',
    portrait: 'assets/sprites/decker.png',
    text: "How long have you been holed up in here?",
  },
  {
    speaker:  'JANE',
    portrait: 'assets/sprites/jane.png',
    text: "Since yesterday. I've been inside their network — the convoy AI is running a coordinated intercept pattern. It knows the main arteries are the fastest route.",
  },
  {
    speaker:  'DECKER',
    portrait: 'assets/sprites/decker.png',
    text: "So the highway's a kill zone.",
  },
  {
    speaker:  'JANE',
    portrait: 'assets/sprites/jane.png',
    text: "Everything above ground and moving over 30 MPH is a target. But it has a blind spot — the old service tunnels under the financial district. The AI doesn't model them.",
  },
  {
    speaker:  'DECKER',
    portrait: 'assets/sprites/decker.png',
    text: "Can you get me a route through?",
  },
  {
    speaker:  'JANE',
    portrait: 'assets/sprites/jane.png',
    text: "Already pushed it to your nav. But Decker — if they detect a signal burst from this building, they'll flatten it. I was never here.",
  },
];
