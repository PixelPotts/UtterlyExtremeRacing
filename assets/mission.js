/**
 * mission.js — MissionSystem (GTA-style)
 *
 * Missions are named containers with a giver NPC and sequential objectives.
 * The player approaches the giver to accept; objectives then run in order.
 *
 * ── Mission schema ──────────────────────────────────────────────────────────
 * {
 *   id:           string
 *   name:         string                  — HUD display name
 *   prerequisite: string | null           — id of mission that must complete first
 *   giver: {
 *     spawn: { zone, offset, props }      — where the '!' accept marker spawns
 *   }
 *   briefing:      Array | null           — dialog shown on accept
 *   objectives: [
 *     {
 *       id:      string
 *       hudText: string                   — shown in objective HUD while active
 *       spawn?:  { zone, offset, props }  — for enter_building; omit for event
 *       trigger: {
 *         type:   'enter_building' | 'event'
 *         event?: string                  — event name for type:'event'
 *         count?: number                  — required count (default 1)
 *       }
 *     }
 *   ]
 *   failConditions?: [
 *     { type: 'timer', seconds: N }
 *   ]
 *   rewards?: [
 *     { type: 'score', amount: N }
 *   ]
 *   debrief:       Array | null           — dialog shown on complete
 * }
 *
 * ── Mission states ───────────────────────────────────────────────────────────
 *   'waiting'   — prerequisite unmet
 *   'available' — giver can spawn; awaiting player accept
 *   'accepted'  — player accepted, objectives running
 *   'complete'  — all objectives done
 *   'failed'    — fail condition triggered; auto-resets to 'available'
 *
 * ── SpawnRef shape (used in _pending / _locked) ─────────────────────────────
 *   { missionId, role: 'giver'|'objective', objId: string|null, props: {}, _key: string }
 *   _key format: `${missionId}:giver` or `${missionId}:${objId}`
 */

class MissionSystemImpl {
  constructor() {
    this._missions    = [];
    this._mState      = new Map();  // missionId      → state string
    this._objState    = new Map();  // `${mId}:${oId}` → 'pending'|'active'|'complete'
    this._pending     = new Map();  // segIdx          → SpawnRef
    this._locked      = new Map();  // segIdx          → SpawnRef
    this._worldPos    = new Map();  // _key            → { x, z }
    this._timers      = new Map();  // missionId       → elapsed seconds
    this._eventCounts = new Map();  // `${mId}:${oId}` → count
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  load(missions) {
    this.reset();
    this._missions = missions;
    for (const m of missions) {
      this._mState.set(m.id, m.prerequisite == null ? 'available' : 'waiting');
      for (const o of m.objectives ?? []) {
        this._objState.set(`${m.id}:${o.id}`, 'pending');
      }
    }
  }

  reset() {
    this._missions    = [];
    this._mState      = new Map();
    this._objState    = new Map();
    this._pending     = new Map();
    this._locked      = new Map();
    this._worldPos    = new Map();
    this._timers      = new Map();
    this._eventCounts = new Map();
  }

  // ── Zone / spawn API ───────────────────────────────────────────────────────

  /**
   * Called by tickZone() when zone type changes.
   * Queues giver and active-objective spawns that match this zone.
   */
  onZoneStart(zone, segIdx) {
    for (const m of this._missions) {
      const ms = this._mState.get(m.id);

      // Queue giver when mission is available and not already in world/pending
      if (ms === 'available' && m.giver?.spawn?.zone === zone) {
        const key = `${m.id}:giver`;
        if (!this._keyInPending(key) && !this._keyInLocked(key)) {
          const target = segIdx + (m.giver.spawn.offset ?? 8);
          if (!this._pending.has(target))
            this._pending.set(target, { missionId: m.id, role: 'giver', objId: null, props: m.giver.spawn.props ?? {}, _key: key });
        }
      }

      // Queue current objective spawn when mission is accepted
      if (ms === 'accepted') {
        const obj = this._currentObjective(m);
        if (obj?.spawn?.zone === zone && obj.trigger?.type === 'enter_building') {
          const key = `${m.id}:${obj.id}`;
          if (!this._keyInPending(key) && !this._keyInLocked(key)) {
            const target = segIdx + (obj.spawn.offset ?? 8);
            if (!this._pending.has(target))
              this._pending.set(target, { missionId: m.id, role: 'objective', objId: obj.id, props: obj.spawn.props ?? {}, _key: key });
          }
        }
      }
    }
  }

  /** Returns { missionId, role, objId, props, _key } pending for this segment, or null. */
  drainSpawns(si) {
    const spawn = this._pending.get(si);
    if (!spawn) return null;
    this._pending.delete(si);
    return spawn;
  }

  /** If no viable building was found in si, retry at si+1. */
  requeueSpawn(si, spawn) {
    if (!this._pending.has(si + 1)) this._pending.set(si + 1, spawn);
  }

  /** Called after mission building confirmed spawned. Locks segment, records world pos. */
  registerSpawned(spawn, segIdx, worldPos) {
    this._locked.set(segIdx, spawn);
    if (worldPos) this._worldPos.set(spawn._key, worldPos);
  }

  /** Returns true if this segment holds a live mission building that must not despawn. */
  isLocked(si) {
    const lock = this._locked.get(si);
    if (!lock) return false;
    if (lock.role === 'giver')
      return this._mState.get(lock.missionId) === 'available';
    return this._objState.get(`${lock.missionId}:${lock.objId}`) === 'active';
  }

  /**
   * Player drove past a locked segment. Releases lock so the spawn re-queues naturally
   * on the next onZoneStart. Returns the _key for the caller to remove markers, or null.
   */
  requeueMissedSpawn(si) {
    const lock = this._locked.get(si);
    if (!lock) return null;
    // Only requeue if still in a re-triggerable state
    const shouldRequeue =
      (lock.role === 'giver'     && this._mState.get(lock.missionId) === 'available') ||
      (lock.role === 'objective' && this._objState.get(`${lock.missionId}:${lock.objId}`) === 'active');
    if (!shouldRequeue) return null;
    this._locked.delete(si);
    this._worldPos.delete(lock._key);
    return lock._key;
  }

  // ── Trigger API ─────────────────────────────────────────────────────────────

  /**
   * Called when player enters a giver building.
   * Returns { briefing } or null.
   */
  acceptMission(missionId) {
    const m = this._missions.find(m => m.id === missionId);
    if (!m || this._mState.get(missionId) !== 'available') return null;

    this._mState.set(missionId, 'accepted');
    this._timers.set(missionId, 0);

    // Release giver lock
    for (const [si, lock] of this._locked) {
      if (lock._key === `${missionId}:giver`) { this._locked.delete(si); break; }
    }

    // Arm first objective
    const first = (m.objectives ?? [])[0];
    if (first) this._objState.set(`${missionId}:${first.id}`, 'active');

    return { briefing: m.briefing ?? null };
  }

  /**
   * Called when player enters an objective building.
   * Returns { rewards, debrief, isLevelComplete } if mission completed, else null.
   */
  completeObjective(missionId, objId) {
    const m   = this._missions.find(m => m.id === missionId);
    const key = `${missionId}:${objId}`;
    if (!m || this._mState.get(missionId) !== 'accepted') return null;
    if (this._objState.get(key) !== 'active') return null;
    return this._advanceObjective(m, objId);
  }

  /**
   * Called for non-spatial events (AI hit, grenade kill, etc.).
   * Returns { rewards, debrief, isLevelComplete } if mission completed, else null.
   */
  notifyEvent(eventName) {
    for (const m of this._missions) {
      if (this._mState.get(m.id) !== 'accepted') continue;
      const obj = this._currentObjective(m);
      if (!obj || obj.trigger?.type !== 'event' || obj.trigger?.event !== eventName) continue;

      const key     = `${m.id}:${obj.id}`;
      const needed  = obj.trigger.count ?? 1;
      const current = (this._eventCounts.get(key) ?? 0) + 1;
      this._eventCounts.set(key, current);

      if (current >= needed) return this._advanceObjective(m, obj.id);
    }
    return null;
  }

  /**
   * Tick fail conditions each frame (dt in seconds).
   * Returns { missionId, staleKeys } if a mission just failed, else null.
   * staleKeys: _keys of objective buildings that were locked and need marker cleanup.
   */
  tick(dt) {
    for (const m of this._missions) {
      if (this._mState.get(m.id) !== 'accepted') continue;
      for (const fc of m.failConditions ?? []) {
        if (fc.type === 'timer') {
          const elapsed = (this._timers.get(m.id) ?? 0) + dt;
          this._timers.set(m.id, elapsed);
          if (elapsed >= fc.seconds) {
            const staleKeys = this._failMission(m);
            return { missionId: m.id, staleKeys };
          }
        }
      }
    }
    return null;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  allComplete() {
    return this._missions.length > 0 &&
      this._missions.every(m => this._mState.get(m.id) === 'complete');
  }

  /** Name of the currently accepted mission, or null. */
  activeMissionName() {
    return this._missions.find(m => this._mState.get(m.id) === 'accepted')?.name ?? null;
  }

  /** HUD text for the current active objective, with count progress if applicable. */
  activeObjectiveText() {
    const m = this._missions.find(m => this._mState.get(m.id) === 'accepted');
    if (!m) return null;
    const obj = this._currentObjective(m);
    if (!obj) return null;
    const key    = `${m.id}:${obj.id}`;
    const count  = this._eventCounts.get(key) ?? 0;
    const needed = obj.trigger?.count;
    return needed && needed > 1 ? `${obj.hudText}  ${count}/${needed}` : obj.hudText;
  }

  /** MM:SS countdown string for active timer fail condition, or null. */
  activeTimerText() {
    const m = this._missions.find(m => this._mState.get(m.id) === 'accepted');
    if (!m) return null;
    const timer = m.failConditions?.find(fc => fc.type === 'timer');
    if (!timer) return null;
    const left = Math.max(0, timer.seconds - (this._timers.get(m.id) ?? 0));
    const mm   = String(Math.floor(left / 60)).padStart(2, '0');
    const ss   = String(Math.floor(left % 60)).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  worldPosOf(key) { return this._worldPos.get(key) ?? null; }

  // ── Private ────────────────────────────────────────────────────────────────

  _currentObjective(m) {
    for (const o of m.objectives ?? []) {
      if (this._objState.get(`${m.id}:${o.id}`) === 'active') return o;
    }
    return null;
  }

  _advanceObjective(m, completedObjId) {
    const key = `${m.id}:${completedObjId}`;
    this._objState.set(key, 'complete');

    // Release segment lock for this objective building
    for (const [si, lock] of this._locked) {
      if (lock._key === key) { this._locked.delete(si); break; }
    }

    // Activate next objective, if any
    const objs = m.objectives ?? [];
    const idx  = objs.findIndex(o => o.id === completedObjId);
    const next = objs[idx + 1];
    if (next) {
      this._objState.set(`${m.id}:${next.id}`, 'active');
      return null; // More to go — no result yet
    }

    // All objectives done
    this._mState.set(m.id, 'complete');
    this._timers.delete(m.id);

    // Unlock missions gated on this one
    for (const other of this._missions) {
      if (other.prerequisite === m.id && this._mState.get(other.id) === 'waiting')
        this._mState.set(other.id, 'available');
    }

    return { rewards: m.rewards ?? [], debrief: m.debrief ?? null, isLevelComplete: this.allComplete() };
  }

  _failMission(m) {
    const staleKeys = [];
    this._mState.set(m.id, 'available'); // re-arm for retry
    this._timers.delete(m.id);

    for (const o of m.objectives ?? []) {
      this._objState.set(`${m.id}:${o.id}`, 'pending');
      this._eventCounts.delete(`${m.id}:${o.id}`);
    }

    // Flush any pending objective spawns
    for (const [si, spawn] of this._pending) {
      if (spawn.missionId === m.id && spawn.role === 'objective') this._pending.delete(si);
    }

    // Collect and release locked objective buildings
    for (const [si, lock] of this._locked) {
      if (lock.missionId === m.id && lock.role === 'objective') {
        staleKeys.push(lock._key);
        this._locked.delete(si);
      }
    }

    return staleKeys;
  }

  _keyInPending(key) {
    for (const s of this._pending.values()) if (s._key === key) return true;
    return false;
  }

  _keyInLocked(key) {
    for (const s of this._locked.values()) if (s._key === key) return true;
    return false;
  }
}

export const MissionSystem = new MissionSystemImpl();
