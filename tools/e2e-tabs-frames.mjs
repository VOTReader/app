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

/**
 * Where S2's "after the settle" window starts. The clock says lift + settleMs; but on a loaded machine the compositor
 * can stall mid-slide (ans9, rel26: no frame for 254 ms with the slide 5 px short), so the slide the page ran ends at
 * its own transitionend, later. Judge from whichever is later: a pop after the slide really ended still fails.
 * @param {{from: number, settleMs: number, slideEnd?: number | null}} o  seconds, ms, seconds
 * @returns {{fromSec: number, by: 'clock' | 'transitionend', lateMs: number}}
 */
export function settleWindow({ from, settleMs, slideEnd }) {
  const clock = Math.round((from * 1000 + settleMs)) / 1000;
  if (typeof slideEnd === 'number' && slideEnd > clock) {
    return { fromSec: slideEnd, by: 'transitionend', lateMs: Math.round((slideEnd - clock) * 1000) };
  }
  return { fromSec: clock, by: 'clock', lateMs: 0 };
}

/* What to change for each finding the walk prints (hub 11-20: a failure names its fix). Two cases where the walk
   cannot tell them apart; the kept frames dir it prints holds what tells. */
const TABS_FIXES = [
  [/^S0 /, 'the walk\'s camera missed a frame (not the app): rerun the walk alone; if S0 repeats alone, the screencast restart in e2e-tabs-true.mjs needs a longer wait'],
  [/^S1 /, 'the neighbour drawn during the drag is not the page that lands: compare the _release and last PNG in the kept frames dir; the peek must draw what the page draws (same props, same scroll place)'],
  [/^S2 /, 'if it passes alone, the machine stalled the slide: rerun alone; if not, a part popped in after the slide ended: mutations.json in the kept frames dir names it, so draw it before the settle ends'],
  [/^S3 /, 'the neighbour was blank or half built while the finger dragged it: render the peek with its content before the drag starts (pager peek in use-pager-gesture)'],
  [/^S4 /, 'the peek\'s markup differs from the page it becomes (the diff above names the element): give the peek the same props and parts as the page'],
  [/^C1 /, 'a tab card does not match its tab: compare a-tab.png and b-card.png in the kept fail-card dir; the card must be the tab\'s own drawing at its scroll place'],
  [/^C2 /, 'a card had no picture in the Tabs screen\'s first frame: the card must draw from its stored snapshot before the screen paints, not after a capture lands'],
  [/^C3 /, 'a card kept the old theme after a theme switch: cards must redraw in the new theme without visiting the tabs'],
  [/^C[45] /, 'the stored tab pictures are wrong (C4 bytes or closed rows, C5 after a restart): read the numbers above against LIMITS in e2e-tabs-true.mjs and the tab snapshot store'],
  [/^T1 /, 'the top bar changed after the finger lifted: the bar must show the landing page\'s title and line from the release frame on'],
  [/^A1 /, 'the mini player or tab bar moved during a swipe: they sit outside the pager and must not re-render with the page'],
  [/^A2 /, 'the playing recording paused, restarted or lost its read-along line across a swipe: the swipe must not touch the player'],
  [/^U\d /, 'the upgrade case (tools/e2e-tabs-upgrade.mjs) failed: old JPEG tab rows must be dropped and the cards redrawn by themselves'],
];

/** @param {string} finding @returns {string | null} */
export function tabsFix(finding) {
  for (const [re, fix] of TABS_FIXES) if (re.test(finding)) return fix;
  return null;
}
