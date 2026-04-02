/**
 * mission.js — MissionSystem
 *
 * Manages ordered stage sequences for a level. Responsibilities:
 *   - Arms stages when prerequisites are met
 *   - Guarantees required props appear in the right zone type (zone-relative spawning)
 *   - Keeps those segments alive (locked) until the stage is complete
 *   - Fires story dialogs and advances state on trigger
 *   - Gates level-end via allComplete()
 *
 * Stage object schema:
 * {
 *   id:           string                    — unique identifier
 *   prerequisite: string | null             — id of stage that must complete first (null = active from start)
 *   spawn: {                                — optional; omit for non-spatial triggers
 *     zone:   string,                       — zone type where the prop must appear ('buildings', etc.)
 *     offset: number,                       — segments into zone to place prop (< ZONE_MIN_SEGS = 16)
 *     props:  object,                       — merged into the building def (e.g. { awningMatIdx: 2 })
 *   },
 *   trigger: {
 *     type: 'enter_building' | 'event',
 *     event?: string,                       — event name for type:'event'
 *     count?: number,                       — required count for type:'event'
 *   },
 *   story: Array | null,                    — dialog script (see dialog.js)
 * }
 *
 * State machine per stage:
 *   'waiting'  → prerequisite unmet
 *   'armed'    → prerequisite met, waiting for a valid zone / event
 *   'spawned'  → prop exists in world, segment locked
 *   'complete' → trigger fired
 *
 * Non-spatial stages ('event' trigger, no spawn) go: waiting → armed → complete
 */

class MissionSystemImpl {
  constructor() {
    this._stages   = [];
    this._state    = new Map();   // stageId → state string
    this._locked   = new Map();   // segIdx  → stageId
    this._pending  = new Map();   // segIdx  → { stageId, props }
    this._worldPos = new Map();   // stageId → { x, z }
    this._eventCounts = new Map();// stageId → number (for count-based event triggers)
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  load(script) {
    this._stages   = script;
    this._state    = new Map();
    this._locked   = new Map();
    this._pending  = new Map();
    this._worldPos = new Map();
    this._eventCounts = new Map();
    for (const s of script) {
      this._state.set(s.id, s.prerequisite == null ? 'armed' : 'waiting');
    }
  }

  reset() {
    this._stages   = [];
    this._state    = new Map();
    this._locked   = new Map();
    this._pending  = new Map();
    this._worldPos = new Map();
    this._eventCounts = new Map();
  }

  // ── Zone / spawn API ───────────────────────────────────────────────────────

  /**
   * Called by tickZone when the zone type changes.
   * segIdx = segment index where this zone begins.
   */
  onZoneStart(zone, segIdx) {
    for (const s of this._stages) {
      if (this._state.get(s.id) !== 'armed') continue;
      if (!s.spawn || s.spawn.zone !== zone) continue;
      const target = segIdx + (s.spawn.offset ?? 8);
      if (!this._pending.has(target)) {
        this._pending.set(target, { stageId: s.id, props: s.spawn.props ?? {} });
      }
    }
  }

  /**
   * Called by addDecorations(si) before building segments are generated.
   * Returns { stageId, props } if a mission prop should be injected here, else null.
   */
  drainSpawns(si) {
    const spawn = this._pending.get(si);
    if (!spawn) return null;
    this._pending.delete(si);
    return spawn;
  }

  /**
   * Call this if drainSpawns returned a spawn but no viable building was found
   * in the segment (e.g. all buildings were garages). Retries at si+1.
   */
  requeueSpawn(si, spawn) {
    if (!this._pending.has(si + 1)) {
      this._pending.set(si + 1, spawn);
    }
  }

  /**
   * Called from addDecorations after the mission building is confirmed spawned.
   * worldPos: { x, z } in world space (for future HUD arrow).
   */
  registerSpawned(stageId, segIdx, worldPos) {
    this._state.set(stageId, 'spawned');
    this._locked.set(segIdx, stageId);
    if (worldPos) this._worldPos.set(stageId, worldPos);
  }

  // ── Segment lock ────────────────────────────────────────────────────────────

  /**
   * Called by dropDecorations(si).
   * Returns true if this segment contains an incomplete mission stage — do NOT drop.
   */
  isLocked(si) {
    const id = this._locked.get(si);
    return id != null && this._state.get(id) !== 'complete';
  }

  // ── Trigger API ─────────────────────────────────────────────────────────────

  /**
   * Called by enterBuilding(b) with b.group.userData.missionId.
   * Returns { story, isLevelComplete } or null if no matching stage.
   */
  notify(stageId) {
    if (!stageId) return null;
    const s = this._stages.find(s => s.id === stageId);
    if (!s) return null;
    if (this._state.get(stageId) !== 'spawned') return null;
    return this._complete(s);
  }

  /**
   * Called for non-spatial events (ai kills, timers, etc.).
   * Returns { story, isLevelComplete } if a stage completed, else null.
   */
  notifyEvent(eventName) {
    for (const s of this._stages) {
      if (this._state.get(s.id) !== 'armed') continue;
      if (s.trigger?.type !== 'event' || s.trigger?.event !== eventName) continue;

      const needed = s.trigger.count ?? 1;
      const current = (this._eventCounts.get(s.id) ?? 0) + 1;
      this._eventCounts.set(s.id, current);

      if (current >= needed) {
        // Promote to spawned (no building) then complete
        this._state.set(s.id, 'spawned');
        return this._complete(s);
      }
    }
    return null;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  allComplete() {
    return this._stages.length > 0 &&
      this._stages.every(s => this._state.get(s.id) === 'complete');
  }

  /** Stages currently in 'armed' or 'spawned' state (for HUD later). */
  activeStages() {
    return this._stages.filter(s => {
      const st = this._state.get(s.id);
      return st === 'armed' || st === 'spawned';
    });
  }

  /** World position of a spawned mission prop (for HUD arrow, future use). */
  worldPosOf(id) {
    return this._worldPos.get(id) ?? null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _complete(stage) {
    this._state.set(stage.id, 'complete');

    // Release segment lock
    for (const [si, id] of this._locked) {
      if (id === stage.id) { this._locked.delete(si); break; }
    }

    // Arm stages whose prerequisite was this stage
    for (const s of this._stages) {
      if (s.prerequisite === stage.id && this._state.get(s.id) === 'waiting') {
        this._state.set(s.id, 'armed');
      }
    }

    return { story: stage.story ?? null, isLevelComplete: this.allComplete() };
  }
}

export const MissionSystem = new MissionSystemImpl();
