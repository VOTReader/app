/* e2e-tabs-frames — how the tabs walk (e2e-tabs-true.mjs) reads a swipe's screencast, as pure helpers.
   ─────────────────────────────────────────────────────────────────────────────
   Gate rel3 (hub task 2045, 2026-11-16) failed e2e-tabs once per run, a different swipe each time, only under load:
   1. Page.screencastFrame events ARRIVE OUT OF ORDER on a loaded machine (seen: a +275 ms mid-settle frame arriving
      after the +722 ms settled one). The walk took "the release frame" and "the settled frame" by arrival order, so S1
      compared the neighbour against a half-slid page (mad 3.6 / 23.4) and S2 compared frames against a mid-slide
      "final". In time order both swipes were mad 0.00.
   2. A loaded page can handle the finger's lift late (seen: the settle transition set 510 ms after touchEnd was sent).
      The settle runs from when the PAGE handled the lift, so S2's "after the settle" window starts there, not at the
      moment node sent the event; otherwise the slide itself reads as "the picture changed after the settle".
   The walk imports these; e2e-tabs-frames.test.js holds the two cases. */

/**
 * Frames in capture order (their CDP timestamp), whatever order they arrived in.
 * @template {{ t: number }} F @param {F[]} frames @returns {F[]}
 */
export function inTimeOrder(frames) {
  return [...frames].sort((a, b) => a.t - b.t);
}

/**
 * When the settle began: the page's own touchend time when it handled the lift after the walk sent it, else the send.
 * @param {number} tSent  wall seconds when the walk dispatched touchEnd
 * @param {number | null | undefined} tHandled  wall seconds when the page's capture listener saw it (null: not seen)
 * @returns {{ from: number, lagMs: number }}
 */
export function settleStart(tSent, tHandled) {
  const from = typeof tHandled === 'number' && tHandled > tSent ? tHandled : tSent;
  return { from, lagMs: Math.round((from - tSent) * 1000) };
}
