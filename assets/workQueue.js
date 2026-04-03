// ── WorkQueue ─────────────────────────────────────────────────────────────────
// Frame-budget work queue.  Decoration building (addDecorations) is pushed here
// instead of running inline so that heavy segments (buildings, tunnels) are
// spread across multiple frames rather than spiking a single one.
//
// Usage:
//   const q = new WorkQueue();
//
//   // Instead of calling addDecorations(si) directly:
//   q.push(() => addDecorations(si));
//
//   // In the game tick (call every frame):
//   q.flush(3);  // spend up to 3 ms per frame on decoration work

export class WorkQueue {
  constructor() {
    this._q = [];
  }

  /** Enqueue a zero-argument function. */
  push(fn) { this._q.push(fn); }

  /**
   * Drain the queue up to budgetMs milliseconds.
   * Remaining work carries into the next frame.
   *
   * Supports two item types:
   *   - Plain function: executed once; if it returns a generator iterator, the
   *     generator is pushed to the front of the queue for step-by-step execution.
   *   - Generator iterator: advanced one step per flush call; removed when done.
   *
   * This lets expensive work (e.g. 2 building spawns per segment) yield between
   * steps so the budget check runs between each yield, keeping spikes under budgetMs.
   *
   * @param {number} budgetMs  Max wall-clock time to spend this frame (default 3 ms).
   */
  flush(budgetMs = 3) {
    const t0 = performance.now();
    while (this._q.length > 0 && (performance.now() - t0) < budgetMs) {
      const item = this._q[0];
      if (typeof item.next === 'function') {
        // Generator iterator — advance one step, remove when exhausted
        if (item.next().done) this._q.shift();
      } else {
        // Plain function — run it; if it returns a generator, re-queue at front
        const result = this._q.shift()();
        if (result != null && typeof result.next === 'function') this._q.unshift(result);
      }
    }
  }

  /** Flush everything regardless of budget (use during level init / reset). */
  flushAll() {
    while (this._q.length > 0) {
      const item = this._q[0];
      if (typeof item.next === 'function') {
        if (item.next().done) this._q.shift();
      } else {
        const result = this._q.shift()();
        if (result != null && typeof result.next === 'function') this._q.unshift(result);
      }
    }
  }

  /** Drop all pending work (use on level reset before re-queuing). */
  clear() { this._q.length = 0; }

  /** Number of pending work items. */
  get pending() { return this._q.length; }
}
