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
   * @param {number} budgetMs  Max wall-clock time to spend this frame (default 3 ms).
   */
  flush(budgetMs = 3) {
    const t0 = performance.now();
    while (this._q.length > 0 && (performance.now() - t0) < budgetMs) {
      this._q.shift()();
    }
  }

  /** Flush everything regardless of budget (use during level init / reset). */
  flushAll() {
    while (this._q.length > 0) this._q.shift()();
  }

  /** Drop all pending work (use on level reset before re-queuing). */
  clear() { this._q.length = 0; }

  /** Number of pending work items. */
  get pending() { return this._q.length; }
}
