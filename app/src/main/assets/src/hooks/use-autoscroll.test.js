/* Auto-scroll transport — controller contract.
 *
 * The controller is pure and driven by injected I/O, so every case here runs
 * on a MANUAL clock and a fake scroll element: no rAF, no DOM, no timers. That
 * is deliberate — rAF does not fire in a hidden preview tab, and a transport
 * whose tests depend on real frames cannot pin its own dt/ramp arithmetic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  createAutoScroll, clampEndDwell, clampLpm, computeEndTarget, measureLineHeight, touchLiftEnds,
  useAutoScroll,
} from './use-autoscroll.js';

// The hook hands the page turn to the pager's own commit; the nav itself is
// another module's contract, so the hook tests drive it through a passthrough.
vi.mock('./use-pager-gesture.js', () => ({ commitReadingNav: (fn) => fn() }));

// ── Harness ────────────────────────────────────────────────────────────
function makeEl({ scrollHeight = 5000, clientHeight = 800, endTop = null, lineHeight = 24 } = {}) {
  const el = {
    scrollTop: 0,
    scrollHeight,
    clientHeight,
    getBoundingClientRect: () => ({ top: 0 }),
    /** Serves both probes the controller uses: the end-of-text sentinel and
     *  the body-text element it measures the line height from. */
    querySelector: (sel) => {
      if (sel === '.reading-end') {
        if (endTop == null) return null;
        return { getBoundingClientRect: () => ({ top: endTop - el.scrollTop }), __lh: 0 };
      }
      if (sel === '[data-hl-key]') return { getBoundingClientRect: () => ({ top: 0 }), __lh: lineHeight };
      return null;
    },
  };
  return el;
}

function makeIo(overrides = {}) {
  const state = {
    t: 0,
    frames: [],
    timers: [],
    el: makeEl(),
    restoring: false,
    modal: false,
    selection: false,
    advanced: 0,
    canAdv: true,
    keepScreenOn: [],
    runningClass: [],
    snaps: [],
    traces: [],
    lpm: 40, // 40 lpm × 24px line / 60 = 16 px/s — round numbers for arithmetic
    //         (40 is clampLpm's ceiling, so this is also the fastest real speed)
    autoNext: false,
    endDwell: 1000,
  };
  const io = {
    getScrollEl: () => state.el,
    requestFrame: (cb) => { state.frames.push(cb); return state.frames.length; },
    cancelFrame: (tok) => { if (tok) state.frames[tok - 1] = null; },
    schedule: (fn, ms) => { state.timers.push({ fn, at: state.t + ms }); return state.timers.length; },
    cancelScheduled: (tok) => { if (tok) state.timers[tok - 1] = null; },
    now: () => state.t,
    getSpeedLpm: () => state.lpm,
    autoNext: () => state.autoNext,
    endDwellMs: () => state.endDwell,
    canAdvance: () => state.canAdv,
    advance: () => { state.advanced += 1; },
    isRestoring: () => state.restoring,
    isModalOpen: () => state.modal,
    hasSelection: () => state.selection,
    reducedMotion: () => false,
    setKeepScreenOn: (v) => state.keepScreenOn.push(v),
    setRunningClass: (v) => state.runningClass.push(v),
    onState: (s) => state.snaps.push(s),
    trace: (m) => state.traces.push(m),
    ...overrides,
  };
  return { io, state };
}

// getComputedStyle is what measureLineHeight actually calls; stub it so the
// harness controls the line height without a jsdom layout.
beforeEach(() => {
  globalThis.getComputedStyle = /** @type {any} */ ((node) => ({
    lineHeight: node && node.__lh ? node.__lh + 'px' : '24px',
    fontSize: '16px',
  }));
});

/** Run N frames of dtMs each. */
function runFrames(state, n, dtMs = 16) {
  for (let i = 0; i < n; i += 1) {
    const pending = state.frames.filter(Boolean);
    if (!pending.length) return;
    const cb = pending[pending.length - 1];
    state.frames = [];
    state.t += dtMs;
    cb(state.t);
  }
}
/** Fire any timer whose deadline has passed. */
function runTimers(state, advanceMs = 0) {
  state.t += advanceMs;
  const due = state.timers.filter((x) => x && x.at <= state.t);
  state.timers = state.timers.map((x) => (x && x.at <= state.t ? null : x));
  due.forEach((x) => x.fn());
}

// ── Pure helpers ───────────────────────────────────────────────────────
describe('speed unit', () => {
  it('clamps lines/min into range and survives junk', () => {
    expect(clampLpm(16)).toBe(16);
    expect(clampLpm('20')).toBe(20);
    expect(clampLpm(0)).toBe(4);
    expect(clampLpm(999)).toBe(40);
    expect(clampLpm('abc')).toBe(16);
    expect(clampLpm(undefined)).toBe(16);
  });

  it('is SCALE-INVARIANT: the same lines/min is a different px/s at each text size', () => {
    // The whole reason speed is stored in lines rather than pixels. Doubling
    // the line height must double the pixel velocity for the same setting, so
    // the reader's pace in LINES is unchanged by the text-size slider.
    const small = { __lh: 20 };
    const large = { __lh: 40 };
    globalThis.getComputedStyle = /** @type {any} */ ((n) => ({ lineHeight: n.__lh + 'px', fontSize: '16px' }));
    const mk = (probe) => ({ querySelector: () => probe });
    expect(measureLineHeight(/** @type {any} */ (mk(small)))).toBe(20);
    expect(measureLineHeight(/** @type {any} */ (mk(large)))).toBe(40);
  });

  it('falls back to font-size when line-height computes to "normal"', () => {
    globalThis.getComputedStyle = /** @type {any} */ (() => ({ lineHeight: 'normal', fontSize: '18px' }));
    const el = /** @type {any} */ ({ querySelector: () => ({}) });
    expect(measureLineHeight(el)).toBe(27);
  });
});

describe('end target', () => {
  it('stops at the .reading-end sentinel, NOT at scrollHeight', () => {
    // The sentinel sits before the footnote list / ornament / chain-nav cards.
    // Targeting scrollHeight would grind the reader through all of it.
    const el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 3000 });
    // Rest with the sentinel 2/3 down the viewport: 3000 - (800 * 2/3).
    expect(computeEndTarget(/** @type {any} */ (el))).toBe(2467);
    expect(computeEndTarget(/** @type {any} */ (el))).not.toBe(4200); // scrollHeight - clientHeight
  });

  it('rests the last line in the READING ZONE, not against the bottom edge', () => {
    // People read around the middle of the screen. Stopping with the end of
    // the text at the viewport bottom (the old contentTop - clientHeight)
    // leaves the final lines in the reader's periphery, never travelling
    // through the place they actually read.
    const clientHeight = 900;
    const endTop = 4000;
    const el = makeEl({ scrollHeight: 20000, clientHeight, endTop });
    const target = computeEndTarget(/** @type {any} */ (el));
    const restY = endTop - target;              // where the last line lands
    expect(restY).toBeCloseTo(clientHeight * (2 / 3), 0);
    expect(restY).toBeLessThan(clientHeight);   // strictly above the bottom edge
    expect(restY).toBeGreaterThan(clientHeight / 2); // still in the lower half
    // It asks for a third of a viewport MORE travel than the old behaviour.
    expect(target).toBeGreaterThan(endTop - clientHeight);
  });

  it('bottoms out instead when the page cannot scroll that far', () => {
    // "…or the scroll function is bottomed out": the extra third of a
    // viewport is best-effort, never a demand the page cannot meet.
    const el = makeEl({ scrollHeight: 1000, clientHeight: 800, endTop: 950 });
    const max = 1000 - 800;
    expect(computeEndTarget(/** @type {any} */ (el))).toBe(max);
  });

  it('falls back to the true maximum when no sentinel exists', () => {
    const el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: null });
    expect(computeEndTarget(/** @type {any} */ (el))).toBe(4200);
  });

  it('clamps to zero when the body text is shorter than the viewport', () => {
    const el = makeEl({ scrollHeight: 600, clientHeight: 800, endTop: 400 });
    expect(computeEndTarget(/** @type {any} */ (el))).toBe(0);
  });
});

// ── Transport ──────────────────────────────────────────────────────────
describe('transport', () => {
  it('accumulates FRACTIONALLY — sub-pixel steps are not lost to rounding', () => {
    // At slow reading speeds a frame advances well under 1px. An integer
    // transport silently never moves; this is the case that proves it does.
    const { io, state } = makeIo();
    state.lpm = 5; // 5 × 24 / 60 = 2 px/s → 0.032px per 16ms frame
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 60); // ~1s
    expect(state.el.scrollTop).toBeGreaterThan(0);
    expect(state.el.scrollTop).toBeLessThan(3);
    ctrl.destroy();
  });

  it('CLAMPS dt — a multi-second stall loses motion instead of banking it', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 30, 16); // ramp in
    const before = state.el.scrollTop;
    runFrames(state, 1, 4000); // a 4-second GC pause / backgrounded tab
    const jumped = state.el.scrollTop - before;
    // 16px/s × the 50ms clamp = 0.8px, NOT 16px/s × 4s = 64px.
    expect(jumped).toBeLessThan(2);
    ctrl.destroy();
  });

  it('ABSORBS an external scroll write without pausing (scroll anchoring)', () => {
    // Chrome rewrites scrollTop when content above the viewport reflows. That
    // is not user intent; treating it as a pause would fire spuriously on the
    // screens carrying the most annotations.
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 20);
    state.el.scrollTop = 1234; // reflow / anchoring moved us
    runFrames(state, 5);
    expect(ctrl.getState().state).toBe('running');
    expect(state.el.scrollTop).toBeGreaterThan(1234); // resumed FROM the new spot
    ctrl.destroy();
  });

  it('YIELDS THE LEASE while use-scroll-memory is restoring', () => {
    // startRestore writes scrollTop every frame for up to 90 frames. Two
    // writers = the documented fight-the-finger failure class.
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 20);
    const at = state.el.scrollTop;
    state.restoring = true;
    state.el.scrollTop = 999; // the restore owns the property now
    runFrames(state, 10);
    expect(state.el.scrollTop).toBe(999); // we wrote NOTHING
    state.restoring = false;
    runFrames(state, 5);
    expect(state.el.scrollTop).toBeGreaterThan(999); // resumed from where it landed
    expect(at).toBeGreaterThan(0);
    ctrl.destroy();
  });
});

// ── Pause model ────────────────────────────────────────────────────────
describe('pause model', () => {
  it('yields INSTANTLY on pointer down — no ramp, no residual motion', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 30);
    ctrl.pointerDown();
    const at = state.el.scrollTop;
    runFrames(state, 10);
    expect(ctrl.getState().state).toBe('paused');
    expect(state.el.scrollTop).toBe(at);
    ctrl.destroy();
  });

  it('auto-resumes after stillness following a touch pause', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 30);
    ctrl.pointerDown();
    ctrl.pointerUp();
    expect(ctrl.getState().state).toBe('paused');
    runTimers(state, 1300);
    expect(ctrl.getState().state).toBe('running');
    ctrl.destroy();
  });

  it('refuses the auto-resume while a selection is live', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 30);
    ctrl.pointerDown();
    state.selection = true; // long-press produced a selection
    ctrl.pointerUp();
    runTimers(state, 1300);
    expect(ctrl.getState().state).toBe('paused');
    expect(ctrl.getState().pauseReason).toBe('blocked');
    ctrl.destroy();
  });

  it('a modal opening stops motion even with no pointer involved', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 10);
    state.modal = true;
    runFrames(state, 2);
    expect(ctrl.getState().state).toBe('paused');
    expect(ctrl.getState().pauseReason).toBe('modal');
    ctrl.destroy();
  });

  it('a navigation the reader drove is a HARD stop — never auto-resumes', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 20);
    ctrl.externalNav();
    expect(ctrl.getState().state).toBe('paused');
    runTimers(state, 5000);
    runFrames(state, 20);
    expect(ctrl.getState().state).toBe('paused');
    ctrl.destroy();
  });

  it('hiding the tab pauses and STAYS paused', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 20);
    ctrl.hidden();
    runTimers(state, 5000);
    expect(ctrl.getState().state).toBe('paused');
    expect(ctrl.getState().pauseReason).toBe('hidden');
    ctrl.destroy();
  });
});

// ── End of page + advance ──────────────────────────────────────────────
describe('end of page', () => {
  it('stops at the sentinel and does not advance when auto-next is off', () => {
    const { io, state } = makeIo();
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    state.lpm = 40;
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 900, 50); // the rest point is now 1/3 viewport further
    expect(ctrl.getState().state).toBe('ended');
    expect(state.el.scrollTop).toBe(367); // 900 - (800 * 2/3)
    expect(state.advanced).toBe(0);
    ctrl.destroy();
  });

  it('advances after the dwell when auto-next is on', () => {
    const { io, state } = makeIo();
    state.autoNext = true;
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    state.lpm = 40;
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 900, 50); // the rest point is now 1/3 viewport further
    expect(ctrl.getState().state).toBe('enddwell');
    runTimers(state, 6000);
    expect(state.advanced).toBe(1);
    ctrl.destroy();
  });

  it('stops at a dead end: there is no next page to turn to', () => {
    // A book or volume edge is NOT a dead end: the wrapper's canAdvance says yes
    // to a boundary card the way a swipe commits one (AutoScrollControl.test.jsx).
    const { io, state } = makeIo();
    state.autoNext = true;
    state.canAdv = false; // peek('next') returned null: the end of the reading chain
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    state.lpm = 40;
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 900, 50); // the rest point is now 1/3 viewport further
    expect(ctrl.getState().state).toBe('ended');
    expect(ctrl.getState().pauseReason).toBe('boundary');
    expect(state.advanced).toBe(0);
    ctrl.destroy();
  });

  // as1 (Corbin 2026-09-24): auto-scroll carries on into the next book or volume. When that page is another
  // screen, its controller is a new one; the run is handed over and picked up there.
  it('an advance tells the wrapper its chain count, and reports when this controller carried on itself', () => {
    const got = [];
    let carriedOn = 0;
    const { io, state } = makeIo({ advance: (n) => { got.push(n); }, onAdvanced: () => { carriedOn += 1; } });
    state.autoNext = true;
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 900, 50);
    runTimers(state, 6000);
    expect(got).toEqual([1]);
    expect(carriedOn).toBe(0);   // still waiting out the restore
    runFrames(state, 1);
    expect(carriedOn).toBe(1);   // the page reconciled in place and this controller runs on
    ctrl.destroy();
  });

  it("a run handed over from the screen before resumes once this screen's restore settles, chain and all", () => {
    const { io, state } = makeIo();
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    state.restoring = true;
    const ctrl = createAutoScroll(io);
    ctrl.resumeAdvance(3);
    expect(ctrl.getState().state).toBe('advancing');
    expect(state.runningClass[state.runningClass.length - 1]).toBe(true);
    runFrames(state, 5);
    expect(ctrl.getState().state).toBe('advancing');   // the scroll restore still owns scrollTop
    state.restoring = false;
    runFrames(state, 2);
    expect(ctrl.getState().state).toBe('running');
    expect(ctrl._internals().chain).toBe(3);             // the runaway cap still counts the pages before
    ctrl.destroy();
  });

  it('an UNSCROLLABLE page cannot chain-advance at timer speed', () => {
    // A run of short WTLB entries reaches "the end" instantly. Without the
    // minimum time-on-page floor this walks the collection in milliseconds.
    const { io, state } = makeIo();
    state.autoNext = true;
    state.endDwell = 0;
    state.el = makeEl({ scrollHeight: 400, clientHeight: 800, endTop: 200 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 5);
    expect(ctrl.getState().state).toBe('enddwell');
    runTimers(state, 1000); // well past the configured 0ms dwell
    expect(state.advanced).toBe(0); // floored by MIN_PAGE_MS
    runTimers(state, 3500);
    expect(state.advanced).toBe(1);
    ctrl.destroy();
  });

  it('re-arms a RUNNING countdown when the reader changes the dwell', () => {
    // The pill's dwell stepper is only worth having if it moves the countdown
    // the reader is looking at. reachedEnd bakes the value into a timer, so a
    // re-arm has to recompute against the moment the dwell STARTED — not now,
    // or the seconds already sat would be charged twice.
    const { io, state } = makeIo();
    state.autoNext = true;
    state.endDwell = 10000;
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    state.lpm = 40;
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 900, 50);
    expect(ctrl.getState().state).toBe('enddwell');
    const startedAt = state.t;
    expect(ctrl.getState().advanceAt).toBe(startedAt + 10000);

    // Three seconds in, the reader shortens it to 5s.
    runTimers(state, 3000);
    state.endDwell = 5000;
    ctrl.rearmDwell();
    expect(ctrl.getState().advanceAt).toBe(startedAt + 5000); // NOT now + 5000
    expect(state.advanced).toBe(0);
    runTimers(state, 2100);
    expect(state.advanced).toBe(1);
    ctrl.destroy();
  });

  it('a re-arm still cannot undercut the minimum time-on-page', () => {
    // Dropping the dwell to zero mid-countdown must not let a short entry
    // flick past — the 4s floor is the whole reason it exists.
    const { io, state } = makeIo();
    state.autoNext = true;
    state.endDwell = 10000;
    state.el = makeEl({ scrollHeight: 400, clientHeight: 800, endTop: 200 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 5);
    expect(ctrl.getState().state).toBe('enddwell');
    const pageStart = 0; // start() ran at t=0
    state.endDwell = 0;
    ctrl.rearmDwell();
    expect(ctrl.getState().advanceAt).toBe(pageStart + 4000); // MIN_PAGE_MS
    ctrl.destroy();
  });

  it('applies the minimum time-on-page to the FIRST page too (clock not at zero)', () => {
    /* start() runs through beginRunning(), which used to leave pageStartedAt
       at its 0 initializer while resetForPage() stamped it for every
       auto-advanced page. armDwell() then measured the floor's remainder from
       epoch zero — hugely negative — so page ONE skipped MIN_PAGE_MS entirely
       and a short/unscrollable first page chained onward instantly at dwell 0.
       Every other test starts the fake clock at 0, which hides it. */
    const { io, state } = makeIo();
    state.t = 5000;                 // a real session's clock is never at zero
    state.autoNext = true;
    state.endDwell = 0;             // no dwell — only the 4s floor can hold it
    state.el = makeEl({ scrollHeight: 400, clientHeight: 800, endTop: 200 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 5);
    expect(ctrl.getState().state).toBe('enddwell');
    expect(ctrl.getState().advanceAt).toBe(5000 + 4000);
    ctrl.destroy();
  });

  it('ignores a dwell change when no countdown is armed', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 3);
    expect(ctrl.getState().state).toBe('running');
    const before = state.snaps.length;
    ctrl.rearmDwell();
    expect(ctrl.getState().state).toBe('running');
    expect(state.snaps.length).toBe(before); // no snapshot, no timer churn
    ctrl.destroy();
  });

  it('waits out a post-advance scroll restore before resuming motion', () => {
    const { io, state } = makeIo();
    state.autoNext = true;
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    state.lpm = 40;
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 900, 50); // the rest point is now 1/3 viewport further
    state.restoring = true;
    runTimers(state, 6000);
    expect(state.advanced).toBe(1);
    expect(ctrl.getState().state).toBe('advancing');
    runFrames(state, 3);
    expect(ctrl.getState().state).toBe('advancing'); // still restoring
    // The advance swapped in a new page; the app's scroll memory restored it
    // to the reader's saved offset rather than to the top.
    state.el = makeEl({ scrollHeight: 9000, clientHeight: 800, endTop: 6000 });
    state.el.scrollTop = 250;
    state.restoring = false;
    runFrames(state, 3);
    expect(ctrl.getState().state).toBe('running');
    // Resumed FROM the restored offset — no skipRestore plumbing needed.
    expect(state.el.scrollTop).toBeGreaterThanOrEqual(250);
    ctrl.destroy();
  });

  // Sweep v011: a finger landing while the new page's restore settles must win the lease. pointerDown ignored
  // 'advancing', so the settle loop went on to beginRunning and wrote scrollTop every frame under the finger.
  it('a finger down during the post-advance settle yields, and the soft resume takes over', () => {
    const { io, state } = makeIo();
    state.autoNext = true;
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 900, 50);
    state.restoring = true;
    runTimers(state, 6000);
    expect(ctrl.getState().state).toBe('advancing');
    runFrames(state, 3);
    ctrl.pointerDown();
    expect(ctrl.getState().state).toBe('paused');
    expect(ctrl.getState().pauseReason).toBe('touch');
    expect(state.keepScreenOn[state.keepScreenOn.length - 1]).toBe(false);
    // The restore finishes with the finger still down: nothing may start moving.
    state.el = makeEl({ scrollHeight: 9000, clientHeight: 800, endTop: 6000 });
    state.el.scrollTop = 250;
    state.restoring = false;
    runFrames(state, 30);
    expect(ctrl.getState().state).toBe('paused');
    expect(state.el.scrollTop).toBe(250);
    // Lift: the ordinary touch resume picks the run back up from where the page sits.
    ctrl.pointerUp();
    runTimers(state, 1300);
    expect(ctrl.getState().state).toBe('running');
    runFrames(state, 30);
    expect(state.el.scrollTop).toBeGreaterThan(250);
    ctrl.destroy();
  });

  it('a finger down while a handed-over run waits for its restore yields too', () => {
    const { io, state } = makeIo();
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    state.restoring = true;
    const ctrl = createAutoScroll(io);
    ctrl.resumeAdvance(3);
    runFrames(state, 2);
    ctrl.pointerDown();
    state.restoring = false;
    runFrames(state, 10);
    expect(ctrl.getState().state).toBe('paused');
    expect(ctrl.getState().pauseReason).toBe('touch');
    expect(state.el.scrollTop).toBe(0);
    ctrl.destroy();
  });
});

// ── Side effects ───────────────────────────────────────────────────────
describe('side effects', () => {
  it('holds the wake lock only while actually moving, and releases on destroy', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    expect(state.keepScreenOn[state.keepScreenOn.length - 1]).toBe(true);
    ctrl.pointerDown();
    expect(state.keepScreenOn[state.keepScreenOn.length - 1]).toBe(false);
    ctrl.start();
    expect(state.keepScreenOn[state.keepScreenOn.length - 1]).toBe(true);
    ctrl.destroy();
    expect(state.keepScreenOn[state.keepScreenOn.length - 1]).toBe(false);
  });

  it('marks the running class so thumbnail capture can stand down', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    expect(state.runningClass[state.runningClass.length - 1]).toBe(true);
    ctrl.stop();
    ctrl.destroy();
    expect(state.runningClass[state.runningClass.length - 1]).toBe(false);
  });

  it('a missing container ends cleanly instead of throwing', () => {
    const { io, state } = makeIo({ getScrollEl: () => null });
    const ctrl = createAutoScroll(io);
    expect(() => ctrl.start()).not.toThrow();
    expect(ctrl.getState().state).toBe('ended');
    expect(state.traces.length).toBe(0);
    ctrl.destroy();
  });

  it('an advance that throws is reported and does not wedge the controller', () => {
    const { io, state } = makeIo({ advance: () => { throw new Error('nav blew up'); } });
    state.autoNext = true;
    state.el = makeEl({ scrollHeight: 400, clientHeight: 800, endTop: 200 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 5);
    runTimers(state, 6000);
    expect(ctrl.getState().state).toBe('ended');
    expect(state.traces.join(' ')).toMatch(/advance threw/);
    ctrl.destroy();
  });

  it('destroy() is idempotent and kills every pending frame + timer', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 10);
    ctrl.destroy();
    ctrl.destroy();
    const before = state.el.scrollTop;
    runFrames(state, 20);
    expect(state.el.scrollTop).toBe(before);
  });
});

describe('ramp watchdog', () => {
  it('a deliberate stop still commits when frames stop arriving mid-ramp', () => {
    // stop() decelerates, which needs frames. If they stop (tab hidden, rAF
    // throttled) the pending stop would never commit and we would hold the
    // wake lock + the capture-suppressing body class forever. Timers fire
    // when frames do not, so they are the backstop.
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 30);
    ctrl.stop();
    expect(ctrl.getState().state).toBe('running'); // still ramping out
    state.frames = []; // frames stop arriving
    runTimers(state, 2000);
    expect(ctrl.getState().state).toBe('paused');
    expect(state.keepScreenOn[state.keepScreenOn.length - 1]).toBe(false);
    expect(state.runningClass[state.runningClass.length - 1]).toBe(false);
    expect(state.traces.join(' ')).toMatch(/ramp-out did not complete/);
    ctrl.destroy();
  });

  it('the watchdog does not fire when the ramp completes normally', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 30);
    ctrl.stop();
    runFrames(state, 40); // let the ramp finish on frames
    expect(ctrl.getState().state).toBe('paused');
    runTimers(state, 3000);
    expect(state.traces.join(' ')).not.toMatch(/ramp-out did not complete/);
    ctrl.destroy();
  });
});

describe('runaway guard', () => {
  it('stops after a long unattended chain', () => {
    const { io, state } = makeIo();
    state.autoNext = true;
    state.endDwell = 0;
    state.el = makeEl({ scrollHeight: 400, clientHeight: 800, endTop: 200 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    for (let i = 0; i < 40; i += 1) {
      runFrames(state, 4);
      runTimers(state, 5000);
    }
    expect(state.advanced).toBeLessThanOrEqual(20);
    expect(ctrl.getState().state).toBe('ended');
    expect(state.traces.join(' ')).toMatch(/chain cap/);
    ctrl.destroy();
  });

  it('any reader interaction resets the chain', () => {
    const { io, state } = makeIo();
    state.autoNext = true;
    state.el = makeEl({ scrollHeight: 400, clientHeight: 800, endTop: 200 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 4);
    runTimers(state, 6000);
    expect(state.advanced).toBe(1);
    ctrl.pointerDown(); // reader is present
    expect(ctrl._internals().chain).toBe(0);
    ctrl.destroy();
  });
});

describe('reduced motion', () => {
  it('drops the ramp but keeps the scroll', () => {
    const { io, state } = makeIo({ reducedMotion: () => true });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2, 100);
    // Full velocity on the first real frame — no ramp-in eating the start.
    // 16px/s × the 50ms dt clamp = 0.8px; a ramped start would be ~0.
    expect(state.el.scrollTop).toBeCloseTo(0.8, 2);
    ctrl.destroy();
  });
});

describe('vi sanity', () => {
  it('has no leaked fake timers', () => { expect(vi.isFakeTimers()).toBe(false); });
});

// W45 (sweep 2026-10-13): auto-scroll pulled the reader back up from the footnotes
// (a start or resume below the end-of-text point clamped to it, then ended or turned
// the page), turned the page behind a sheet or menu opened during the end dwell, and
// resumed when one of two fingers lifted.
describe('W45: footnotes, an open menu, a second finger', () => {
  it('a start below the end of the text runs on to the real bottom, never back up', () => {
    const { io, state } = makeIo();
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 }); // text end rests at 367; bottom 4200
    state.el.scrollTop = 2000;                                                // reading the footnotes
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 20, 50);
    expect(state.el.scrollTop).toBeGreaterThanOrEqual(2000);
    runFrames(state, 6000, 50);
    expect(state.el.scrollTop).toBe(4200);
    expect(ctrl.getState().state).toBe('ended');
    ctrl.destroy();
  });

  it('a touch resume below the end of the text keeps going down too', () => {
    const { io, state } = makeIo();
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 5, 50);
    ctrl.pointerDown();
    state.el.scrollTop = 1500;                                                // the reader drags into the footnotes
    ctrl.pointerUp();
    runTimers(state, 5000);
    expect(ctrl.getState().state).toBe('running');
    runFrames(state, 20, 50);
    expect(state.el.scrollTop).toBeGreaterThanOrEqual(1500);
    ctrl.destroy();
  });

  it('a run that starts above the end still stops at the end of the text', () => {
    const { io, state } = makeIo();
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    state.el.scrollTop = 100;
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 900, 50);
    expect(state.el.scrollTop).toBe(367);
    ctrl.destroy();
  });

  it.each([['an open sheet or menu', 'modal'], ['a live selection', 'selection']])('the end dwell does not turn the page behind %s', (_label, key) => {
    const { io, state } = makeIo();
    state.autoNext = true;
    state.el = makeEl({ scrollHeight: 5000, clientHeight: 800, endTop: 900 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 900, 50);
    expect(ctrl.getState().state).toBe('enddwell');
    state[key] = true;                                                        // opened during the countdown
    runTimers(state, 6000);
    expect(state.advanced).toBe(0);
    expect(ctrl.getState().state).toBe('paused');
    ctrl.destroy();
  });

  it('a finger lifting while another is still down is not the end of the touch', () => {
    expect(touchLiftEnds({ touches: [{}] })).toBe(false);
    expect(touchLiftEnds({ touches: [] })).toBe(true);
    expect(touchLiftEnds({})).toBe(true);                                     // mouseup
  });
});

// ── tests-6 item 13a: controller + helper branches ────────────────────────
// The draft's 75.43% was the tests-5 FULL-SUITE figure: other suites exercise
// this file incidentally. This file alone measures 58.29% (204/350), so 13a
// raises the controller + pure helpers through this file's own harness; 13b
// (next tick) takes the React hook useAutoScroll + peekNext (762-921), which
// needs renderHook. The item target stays >=82% on this file's Check.
describe('tests-6 item 13a: helper branches', () => {
  it('clampEndDwell clamps into range and survives junk', () => {
    expect(clampEndDwell('junk')).toBe(2500);
    expect(clampEndDwell(-5)).toBe(0);
    expect(clampEndDwell(99999)).toBe(15000);
    expect(clampEndDwell(4000)).toBe(4000);
  });

  it('measureLineHeight returns null without a container or a probe', () => {
    expect(measureLineHeight(null)).toBeNull();
    expect(measureLineHeight({})).toBeNull();
    expect(measureLineHeight({ querySelector: () => null })).toBeNull();
  });

  it('lineHeightOf survives a hostile getComputedStyle', () => {
    const keep = globalThis.getComputedStyle;
    try {
      globalThis.getComputedStyle = () => { throw new Error('boom'); };
      expect(measureLineHeight(makeEl())).toBeNull();
      globalThis.getComputedStyle = /** @type {any} */ (() => null);
      expect(measureLineHeight(makeEl())).toBeNull();
      globalThis.getComputedStyle = /** @type {any} */ (() => ({ lineHeight: 'normal', fontSize: '16px' }));
      expect(measureLineHeight(makeEl())).toBe(24);
      globalThis.getComputedStyle = /** @type {any} */ (() => ({ lineHeight: 'normal', fontSize: 'bogus' }));
      expect(measureLineHeight(makeEl())).toBeNull();
      delete globalThis.getComputedStyle;
      expect(measureLineHeight(makeEl())).toBeNull();
    } finally {
      globalThis.getComputedStyle = keep;
    }
  });

  it('computeEndTarget falls back on null, missing probes and falsy dims', () => {
    expect(computeEndTarget(null)).toBe(0);
    expect(computeEndTarget({ scrollHeight: 5000, clientHeight: 800 })).toBe(4200);
    expect(computeEndTarget({ scrollHeight: 0, clientHeight: 800, querySelector: () => null })).toBe(0);
    expect(computeEndTarget({ scrollHeight: 5000, clientHeight: 0, querySelector: () => null })).toBe(5000);
  });
});

describe('tests-6 item 13a: controller branches', () => {
  /** A page whose end is 100px away, so the run reaches the end in ~150 frames. */
  function shortPage(overrides = {}) {
    const { io, state } = makeIo(overrides);
    state.el = makeEl({ scrollHeight: 900, clientHeight: 800 });
    state.autoNext = true;
    return { io, state, ctrl: createAutoScroll(io) };
  }
  /** Drive a short page to the end dwell. */
  function toEndDwell() {
    const s = shortPage();
    s.ctrl.start();
    runFrames(s.state, 300, 50);
    expect(s.ctrl.getState().state).toBe('enddwell');
    return s;
  }

  it('start() is a no-op when already running or destroyed, and blocked by a modal', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    const snaps = state.snaps.length;
    ctrl.start();                                        // already running
    expect(state.snaps.length).toBe(snaps);
    state.modal = true;
    ctrl.stop();                                         // ramp-out, then paused
    runFrames(state, 30, 50);
    expect(ctrl.getState().state).toBe('paused');
    const snaps2 = state.snaps.length;
    ctrl.start();                                        // modal blocks the restart
    expect(ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'blocked' });
    ctrl.start();                                        // same state + reason: setState early-returns
    expect(state.snaps.length).toBe(snaps2 + 1);
    ctrl.destroy();
    ctrl.start();                                        // destroyed: nothing happens
    expect(state.snaps.length).toBe(snaps2 + 1);
  });

  it('stop() when idle pauses, and toggle() flips both ways', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.stop();
    expect(ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'user' });
    ctrl.toggle();                                       // idle-ish -> start
    expect(ctrl.getState().state).toBe('running');
    ctrl.toggle();                                       // running -> stop (ramp)
    runFrames(state, 30, 50);
    expect(ctrl.getState().state).toBe('paused');
    ctrl.destroy();
  });

  it('toggle() during the end dwell stops instead of restarting', () => {
    const s = toEndDwell();
    s.ctrl.toggle();
    expect(s.ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'user' });
    s.ctrl.destroy();
  });

  it('toggle() during an advance stops too', () => {
    const s = toEndDwell();
    runTimers(s.state, 6000);                            // dwell fires -> advancing
    expect(s.ctrl.getState().state).toBe('advancing');
    s.ctrl.toggle();
    expect(s.ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'user' });
    s.ctrl.destroy();
  });

  it('pointerDown/Up, hidden, stop and setSpeed are no-ops when destroyed', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.pointerUp();                                    // idle: nothing to resume
    expect(ctrl.getState().state).toBe('idle');
    ctrl.hidden();                                       // idle: stays idle
    expect(ctrl.getState().state).toBe('idle');
    ctrl.destroy();
    ctrl.pointerDown();
    ctrl.pointerUp();
    ctrl.hidden();
    ctrl.stop();
    ctrl.setSpeed();
    expect(ctrl.getState().state).toBe('idle');
    expect(state.snaps.length).toBe(0);
  });

  it('pointerUp after a blocked pause does not resume', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    state.modal = true;
    ctrl.start();                                        // blocked before it ever ran
    expect(ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'blocked' });
    ctrl.pointerUp();                                    // reason is not 'touch'
    runTimers(state, 5000);
    expect(ctrl.getState().state).toBe('paused');
    ctrl.destroy();
  });

  it('a second pointerUp cancels the first soft-resume timer', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    ctrl.pointerDown();                                  // touch pause
    ctrl.pointerUp();                                    // resume armed
    ctrl.pointerUp();                                    // re-arms: first token cancelled
    expect(state.timers.filter(Boolean).length).toBe(1);
    runTimers(state, 5000);
    expect(ctrl.getState().state).toBe('running');
    ctrl.destroy();
  });

  it('a finger down during the soft-resume wait cancels the resume', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    ctrl.pointerDown();
    ctrl.pointerUp();                                    // resume armed
    expect(state.timers.filter(Boolean).length).toBe(1);
    ctrl.pointerDown();                                  // cancels the resume, stays paused
    expect(state.timers.filter(Boolean).length).toBe(0);
    expect(ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'touch' });
    ctrl.destroy();
  });

  it('a resume timer fired after a navigation returns without resuming', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    ctrl.pointerDown();
    ctrl.pointerUp();                                    // resume armed
    const resumeFn = state.timers.find(Boolean).fn;      // pin the defensive guard:
    ctrl.externalNav();                                  // cancels the timer, reason 'nav'
    resumeFn();                                          // fired late: must not resume
    expect(ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'nav' });
    ctrl.destroy();
  });

  it('a navigation during the soft-resume wait clears the pending timer', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    ctrl.pointerDown();
    ctrl.pointerUp();                                    // resume armed
    expect(state.timers.filter(Boolean).length).toBe(1);
    ctrl.externalNav();                                  // clearTimers cancels it
    expect(state.timers.filter(Boolean).length).toBe(0);
    expect(ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'nav' });
    ctrl.destroy();
  });

  it('externalNav on an idle controller changes nothing', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.externalNav();
    expect(state.snaps.length).toBe(0);
    expect(ctrl.getState().state).toBe('idle');
    ctrl.destroy();
    ctrl.externalNav();                                  // destroyed: no-op
    expect(state.snaps.length).toBe(0);
  });

  it('setSpeed refreshes metrics live and getProgress reports the remainder', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    const snaps = state.snaps.length;
    ctrl.setSpeed();                                     // live edit: re-measures + emits
    expect(state.snaps.length).toBe(snaps + 1);
    const p = ctrl.getProgress();
    expect(p.atEnd).toBe(false);
    expect(p.remainingMs).toBeGreaterThan(0);
    ctrl.destroy();
    ctrl.setSpeed();                                     // destroyed: no-op
    expect(state.snaps.length).toBe(snaps + 1);
  });

  it('getProgress without a container reports zero and at-end', () => {
    let gone = false;
    const { io, state } = makeIo({ getScrollEl: () => (gone ? null : state.el) });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    expect(ctrl.getProgress().atEnd).toBe(false);
    gone = true;
    ctrl.setSpeed();                                     // no container: skips the refresh
    expect(ctrl.getProgress()).toEqual({ remainingMs: 0, atEnd: true });
    ctrl.destroy();
  });

  it('a run starting below the end with falsy dims still resolves the target', () => {
    const { io, state } = makeIo();
    state.el = makeEl({ scrollHeight: 0, clientHeight: 0, endTop: 100 });
    state.el.scrollTop = 50;                             // below the (zero) end
    const ctrl = createAutoScroll(io);
    ctrl.start();
    expect(ctrl._internals().endTarget).toBe(0);
    ctrl.destroy();
  });

  it('a missing line-height probe falls back to 24px and still scrolls', () => {
    const { io, state } = makeIo();
    state.el.querySelector = (sel) => (sel === '.reading-end' ? null : null);
    const ctrl = createAutoScroll(io);
    ctrl.start();
    expect(ctrl._internals().lineHeight).toBe(0);
    runFrames(state, 10);
    expect(state.el.scrollTop).toBeGreaterThan(0);
    ctrl.destroy();
  });

  it('a second stop during the ramp-out re-arms the watchdog instead of wedging', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 5);
    ctrl.stop();                                         // ramp-out + watchdog armed
    ctrl.stop();                                         // still running: re-arms (cancels the first)
    expect(state.timers.filter(Boolean).length).toBe(1);
    runTimers(state, 1000);
    expect(ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'user' });
    ctrl.destroy();
  });

  it('a watchdog fired after the ramp already committed is a silent no-op', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 5);
    ctrl.stop();                                         // ramp-out + watchdog armed
    const watchdog = state.timers.find(Boolean).fn;      // pin the defensive guard
    runFrames(state, 30, 50);                           // ramp completes normally
    expect(ctrl.getState().state).toBe('paused');
    watchdog();                                          // fired late: pendingState is gone
    expect(ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'user' });
    ctrl.destroy();
  });

  it('a dwell timer fired after destroy or after a pause never advances', () => {
    const s = toEndDwell();
    const dwellFn = s.state.timers.find(Boolean).fn;     // pin the defensive guard
    s.ctrl.destroy();
    dwellFn();
    expect(s.state.advanced).toBe(0);
    expect(s.ctrl.getState().state).toBe('enddwell');

    const s2 = toEndDwell();
    const dwellFn2 = s2.state.timers.find(Boolean).fn;
    s2.ctrl.pointerDown();                               // enddwell -> touch pause, timer cancelled
    dwellFn2();
    expect(s2.state.advanced).toBe(0);
    expect(s2.ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'touch' });
    s2.ctrl.destroy();
  });

  it('a settle step fired after the run was paused returns without resuming', () => {
    const s = toEndDwell();
    runTimers(s.state, 6000);                            // dwell fires -> advancing
    expect(s.ctrl.getState().state).toBe('advancing');
    const step = s.state.frames.find(Boolean);           // pin the defensive guard
    s.ctrl.pointerDown();                                // advancing -> touch pause
    step();
    expect(s.ctrl.getState()).toMatchObject({ state: 'paused', pauseReason: 'touch' });
    s.ctrl.destroy();
  });

  it('a restoring page that never settles resumes once the deadline passes', () => {
    const s = toEndDwell();
    runTimers(s.state, 6000);                            // advancing, settle loop running
    s.state.restoring = true;
    runFrames(s.state, 130, 50);                         // 6.5s > 2s settle deadline
    expect(s.ctrl.getState().state).toBe('running');
    s.ctrl.destroy();
  });

  it('a vanished container during the settle ends the run at the deadline', () => {
    let gone = false;
    const { io, state } = makeIo({ getScrollEl: () => (gone ? null : state.el) });
    state.el = makeEl({ scrollHeight: 900, clientHeight: 800 });
    state.autoNext = true;
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 300, 50);
    expect(ctrl.getState().state).toBe('enddwell');
    runTimers(state, 6000);                              // advancing
    gone = true;
    runFrames(state, 130, 50);                           // past the 2s settle deadline
    expect(ctrl.getState()).toMatchObject({ state: 'ended', pauseReason: 'no-container' });
    ctrl.destroy();
  });

  it('a frame fired after destroy is a silent no-op', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    const frame = state.frames.find(Boolean);            // pin the defensive guard
    ctrl.destroy();
    frame(state.t);
    expect(ctrl.getState().state).toBe('running');       // destroy keeps the last state; the frame changed nothing
    expect(state.snaps.length).toBe(1);                  // only the start snapshot
  });

  it('a vanished container mid-run ends the run instead of throwing', () => {
    let gone = false;
    const { io, state } = makeIo({ getScrollEl: () => (gone ? null : state.el) });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    gone = true;
    runFrames(state, 1);
    expect(ctrl.getState()).toMatchObject({ state: 'ended', pauseReason: 'no-container' });
    ctrl.destroy();
  });

  it('a frame without a timestamp falls back to the clock', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    const frame = state.frames.find(Boolean);
    frame(undefined);                                    // no ts: uses io.now()
    expect(ctrl.getState().state).toBe('running');
    ctrl.destroy();
  });

  it('a restore in progress holds the position instead of writing', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    state.restoring = true;
    state.el.scrollTop = 0;                              // the restore owns scrollTop now
    runFrames(state, 2);
    expect(ctrl._internals().pos).toBe(0);
    expect(ctrl.getState().state).toBe('running');
    ctrl.destroy();
  });

  it('an external scroll write is absorbed, not fought', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    state.el.scrollTop = 300;                            // the reader dragged ahead
    runFrames(state, 1);
    expect(ctrl._internals().pos).toBeGreaterThanOrEqual(300);
    ctrl.destroy();
  });

  it('a negative scrollTop is clamped, never carried', () => {
    const { io, state } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 2);
    state.el.scrollTop = -10;
    runFrames(state, 1);
    expect(ctrl._internals().pos).toBeGreaterThanOrEqual(0);
    expect(state.el.scrollTop).toBe(0);
    ctrl.destroy();
  });

  it('resumeAdvance ignores a running controller and takes a zero chain', () => {
    const { io } = makeIo();
    const ctrl = createAutoScroll(io);
    ctrl.start();
    ctrl.resumeAdvance(3);                               // already running: no-op
    expect(ctrl._internals().chain).toBe(0);
    ctrl.destroy();
    const ctrl2 = createAutoScroll(io);
    ctrl2.resumeAdvance(0);                              // chain 0: a fresh run, no carry
    expect(ctrl2._internals().chain).toBe(0);
    expect(ctrl2.getState().state).toBe('advancing');
    ctrl2.destroy();
  });

  it('a throwing advance is reported even with no trace or state sink', () => {
    const { io, state } = makeIo({
      advance: () => { throw new Error('boom'); },
      trace: undefined,
      onState: undefined,
    });
    state.autoNext = true;
    state.el = makeEl({ scrollHeight: 900, clientHeight: 800 });
    const ctrl = createAutoScroll(io);
    ctrl.start();
    runFrames(state, 300, 50);
    expect(ctrl.getState().state).toBe('enddwell');
    runTimers(state, 6000);                              // dwell fires, advance throws
    expect(ctrl.getState()).toMatchObject({ state: 'ended', pauseReason: 'advance-failed' });
    ctrl.destroy();
  });
});

// ── React hook useAutoScroll + peekNext (13b) ───────────────────────────
// The controller tests above drive createAutoScroll directly; these drive
// the React wrapper — its effects, its DOM listeners, and the I/O closures
// it builds from opts — through renderHook with fake timers and a real
// jsdom element. The page is short (scrollHeight == clientHeight), so the
// end is reached on the first frames and the dwell/advance path is quick.

describe('useAutoScroll hook', () => {
  let els = [];

  function makeScrollEl({ scrollHeight = 800, clientHeight = 800, endTop = 800 } = {}) {
    const el = document.createElement('div');
    el.className = 'screen-scroll';
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
    const end = document.createElement('div');
    end.className = 'reading-end';
    end.getBoundingClientRect = () => ({
      top: endTop - el.scrollTop, left: 0, right: 0, bottom: 0, width: 0, height: 0,
      x: 0, y: endTop - el.scrollTop, toJSON: () => ({}),
    });
    el.appendChild(end);
    const hl = document.createElement('p');
    hl.setAttribute('data-hl-key', 'x');
    hl.textContent = 'The quick brown fox jumps over the lazy dog.';
    el.appendChild(hl);
    el.getBoundingClientRect = () => ({
      top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
      x: 0, y: 0, toJSON: () => ({}),
    });
    document.body.appendChild(el);
    els.push(el);
    return el;
  }

  function makePager({ kind = 'screen', onNext = vi.fn() } = {}) {
    return { peek: vi.fn(() => ({ kind })), onNext };
  }

  function baseOpts(overrides = {}) {
    return {
      enabled: true, speedLpm: 40, autoNext: false, endDwellMs: 0,
      keepScreenOnPref: false, placeKey: 'p1', pager: null, ...overrides,
    };
  }

  function mountHook(el, opts) {
    const ref = { current: el };
    const hook = renderHook(({ r, o }) => useAutoScroll(r, o), {
      initialProps: { r: ref, o: opts },
    });
    return { hook, ref };
  }

  function timers(ms) {
    act(() => { vi.advanceTimersByTime(ms); });
  }

  function driveToDwell(hook) {
    act(() => { hook.result.current.start(); });
    expect(hook.result.current.state).toBe('running');
    timers(100);
    expect(hook.result.current.state).toBe('enddwell');
    expect(hook.result.current.advanceAt).toBeGreaterThan(0);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    // Deterministic frame source: the setTimeout fallback, never jsdom's rAF.
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    const sel = window.getSelection && window.getSelection();
    if (sel) sel.removeAllRanges();
    document.body.classList.remove('scroll-restoring', 'autoscroll-running');
    delete /** @type {any} */ (document).visibilityState;
    els.forEach((el) => el.remove());
    els = [];
    vi.useRealTimers();
  });

  it('mounts idle and exposes the control surface', () => {
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts());
    expect(hook.result.current.state).toBe('idle');
    expect(hook.result.current.running).toBe(false);
    expect(hook.result.current.advanceAt).toBe(0);
    expect(hook.result.current.pauseReason).toBeNull();
    expect(typeof hook.result.current.toggle).toBe('function');
    expect(typeof hook.result.current.start).toBe('function');
    expect(typeof hook.result.current.stop).toBe('function');
    expect(hook.result.current.getProgress()).toEqual({ remainingMs: 0, atEnd: true });
    hook.unmount();
  });

  it('does nothing without an element, and nothing while disabled', () => {
    const { hook } = mountHook(null, baseOpts());
    act(() => { hook.result.current.start(); });
    act(() => { hook.result.current.toggle(); });
    act(() => { hook.result.current.stop(); });
    expect(hook.result.current.state).toBe('idle');
    expect(hook.result.current.getProgress()).toEqual({ remainingMs: 0, atEnd: true });
    hook.unmount();

    const el = makeScrollEl();
    const second = mountHook(el, baseOpts({ enabled: false }));
    act(() => { second.hook.result.current.start(); });
    expect(second.hook.result.current.state).toBe('idle');
    // A placeKey / speed / dwell rerender with no controller is a no-op.
    act(() => {
      second.hook.rerender({
        r: second.ref,
        o: baseOpts({ enabled: false, placeKey: 'p2', speedLpm: 20, endDwellMs: 500 }),
      });
    });
    expect(second.hook.result.current.state).toBe('idle');
    // Enabling later mounts the controller.
    act(() => {
      second.hook.rerender({ r: second.ref, o: baseOpts({ placeKey: 'p2' }) });
    });
    act(() => { second.hook.result.current.start(); });
    expect(second.hook.result.current.state).toBe('running');
    second.hook.unmount();
  });

  it('starts motion, shows the running class, and stops on demand', () => {
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts());
    act(() => { hook.result.current.start(); });
    expect(hook.result.current.state).toBe('running');
    expect(hook.result.current.running).toBe(true);
    expect(document.body.classList.contains('autoscroll-running')).toBe(true);
    act(() => { hook.result.current.stop(); });
    timers(1000);
    expect(hook.result.current.state).toBe('paused');
    expect(hook.result.current.pauseReason).toBe('user');
    expect(document.body.classList.contains('autoscroll-running')).toBe(false);
    hook.unmount();
    expect(document.body.classList.contains('autoscroll-running')).toBe(false);
  });

  it('toggle stops a run and starts a paused one', () => {
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts());
    act(() => { hook.result.current.toggle(); });
    expect(hook.result.current.state).toBe('running');
    act(() => { hook.result.current.toggle(); });
    timers(1000);
    expect(hook.result.current.state).toBe('paused');
    act(() => { hook.result.current.toggle(); });
    expect(hook.result.current.state).toBe('running');
    hook.unmount();
  });

  it('a finger down pauses instantly; a lift with a finger still down does not resume', () => {
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts());
    act(() => { hook.result.current.start(); });
    act(() => { el.dispatchEvent(new Event('touchstart')); });
    expect(hook.result.current.state).toBe('paused');
    expect(hook.result.current.pauseReason).toBe('touch');
    const stillDown = new Event('touchend');
    Object.defineProperty(stillDown, 'touches', { value: [{}] });
    act(() => { document.dispatchEvent(stillDown); });
    expect(hook.result.current.state).toBe('paused');
    act(() => { document.dispatchEvent(new Event('touchend')); });
    timers(1200);
    expect(hook.result.current.state).toBe('running');
    // A mouse down is the same yield, and mouseup lifts it.
    act(() => { el.dispatchEvent(new Event('mousedown')); });
    expect(hook.result.current.state).toBe('paused');
    act(() => { document.dispatchEvent(new Event('mouseup')); });
    timers(1200);
    expect(hook.result.current.state).toBe('running');
    hook.unmount();
  });

  it('a wheel event yields and then resumes', () => {
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts());
    act(() => { hook.result.current.start(); });
    act(() => { el.dispatchEvent(new Event('wheel')); });
    expect(hook.result.current.state).toBe('paused');
    expect(hook.result.current.pauseReason).toBe('touch');
    timers(1200);
    expect(hook.result.current.state).toBe('running');
    hook.unmount();
  });

  it('hiding the tab pauses and never resumes unwatched', () => {
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts());
    act(() => { hook.result.current.start(); });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.result.current.state).toBe('paused');
    expect(hook.result.current.pauseReason).toBe('hidden');
    timers(5000);
    expect(hook.result.current.state).toBe('paused');
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.result.current.state).toBe('paused');
    hook.unmount();
  });

  it('a navigation the reader drove is a hard stop', () => {
    const el = makeScrollEl();
    const { hook, ref } = mountHook(el, baseOpts());
    act(() => { hook.result.current.start(); });
    expect(hook.result.current.state).toBe('running');
    act(() => {
      hook.rerender({ r: ref, o: baseOpts({ placeKey: 'p2' }) });
    });
    expect(hook.result.current.state).toBe('paused');
    expect(hook.result.current.pauseReason).toBe('nav');
    hook.unmount();
  });

  it('live speed and dwell edits reach the running controller', () => {
    const el = makeScrollEl();
    const { hook, ref } = mountHook(el, baseOpts());
    act(() => { hook.result.current.start(); });
    act(() => {
      hook.rerender({ r: ref, o: baseOpts({ speedLpm: 20 }) });
    });
    expect(hook.result.current.state).toBe('running');
    act(() => {
      hook.rerender({ r: ref, o: baseOpts({ speedLpm: 20, endDwellMs: 5000 }) });
    });
    expect(hook.result.current.state).toBe('running');
    hook.unmount();
  });

  it('an open modal blocks start; a missing or throwing registry does not', () => {
    const el = makeScrollEl();
    vi.stubGlobal('modalRegistry', { isAnyOpen: () => true });
    const blocked = mountHook(el, baseOpts());
    act(() => { blocked.hook.result.current.start(); });
    expect(blocked.hook.result.current.state).toBe('paused');
    expect(blocked.hook.result.current.pauseReason).toBe('blocked');
    blocked.hook.unmount();

    vi.stubGlobal('modalRegistry', undefined);
    const missing = mountHook(el, baseOpts());
    act(() => { missing.hook.result.current.start(); });
    expect(missing.hook.result.current.state).toBe('running');
    missing.hook.unmount();

    vi.stubGlobal('modalRegistry', { isAnyOpen: () => { throw new Error('registry down'); } });
    const throwing = mountHook(el, baseOpts());
    act(() => { throwing.hook.result.current.start(); });
    expect(throwing.hook.result.current.state).toBe('running');
    throwing.hook.unmount();
  });

  it('a live selection blocks start; a missing or throwing getSelection does not', () => {
    const el = makeScrollEl();
    const sel = window.getSelection();
    sel.selectAllChildren(el);
    expect(String(window.getSelection())).not.toBe('');
    const blocked = mountHook(el, baseOpts());
    act(() => { blocked.hook.result.current.start(); });
    expect(blocked.hook.result.current.state).toBe('paused');
    expect(blocked.hook.result.current.pauseReason).toBe('blocked');
    blocked.hook.unmount();
    sel.removeAllRanges();

    vi.stubGlobal('getSelection', undefined);
    const missing = mountHook(el, baseOpts());
    act(() => { missing.hook.result.current.start(); });
    expect(missing.hook.result.current.state).toBe('running');
    missing.hook.unmount();

    vi.stubGlobal('getSelection', () => { throw new Error('selection down'); });
    const throwing = mountHook(el, baseOpts());
    act(() => { throwing.hook.result.current.start(); });
    expect(throwing.hook.result.current.state).toBe('running');
    throwing.hook.unmount();
  });

  it('a scroll restore in progress holds the position instead of writing', () => {
    const el = makeScrollEl();
    document.body.classList.add('scroll-restoring');
    const { hook } = mountHook(el, baseOpts());
    act(() => { hook.result.current.start(); });
    timers(100);
    expect(hook.result.current.state).toBe('running');
    expect(el.scrollTop).toBe(0);
    document.body.classList.remove('scroll-restoring');
    timers(100);
    expect(hook.result.current.state).toBe('ended');
    hook.unmount();
  });

  it('reduced motion still starts, and a missing matchMedia is no preference', () => {
    const el = makeScrollEl();
    vi.stubGlobal('matchMedia', () => ({
      matches: true, addEventListener: () => {}, removeEventListener: () => {},
    }));
    const reduced = mountHook(el, baseOpts());
    act(() => { reduced.hook.result.current.start(); });
    expect(reduced.hook.result.current.state).toBe('running');
    reduced.hook.unmount();

    vi.stubGlobal('matchMedia', undefined);
    const missing = mountHook(el, baseOpts());
    act(() => { missing.hook.result.current.start(); });
    expect(missing.hook.result.current.state).toBe('running');
    missing.hook.unmount();
  });

  it('keep-screen-on follows the run and re-asserts the saved preference on release', () => {
    const setKeepScreenOn = vi.fn();
    vi.stubGlobal('PlatformBridge', { setKeepScreenOn });
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts({ keepScreenOnPref: true }));
    act(() => { hook.result.current.start(); });
    expect(setKeepScreenOn).toHaveBeenCalledWith(true);
    act(() => { hook.result.current.stop(); });
    timers(1000);
    expect(hook.result.current.state).toBe('paused');
    expect(setKeepScreenOn).toHaveBeenLastCalledWith(true);
    hook.unmount();

    setKeepScreenOn.mockClear();
    const off = mountHook(el, baseOpts({ keepScreenOnPref: false }));
    act(() => { off.hook.result.current.start(); });
    expect(setKeepScreenOn).toHaveBeenCalledWith(true);
    act(() => { off.hook.result.current.stop(); });
    timers(1000);
    expect(setKeepScreenOn).toHaveBeenLastCalledWith(false);
    off.hook.unmount();

    // A throwing bridge never wedges the run.
    vi.stubGlobal('PlatformBridge', { setKeepScreenOn: () => { throw new Error('bridge down'); } });
    const throwing = mountHook(el, baseOpts());
    act(() => { throwing.hook.result.current.start(); });
    expect(throwing.hook.result.current.state).toBe('running');
    throwing.hook.unmount();
  });

  it('uses requestAnimationFrame when the platform provides it', () => {
    const raf = vi.fn((cb) => setTimeout(() => cb(Date.now()), 16));
    const cancel = vi.fn((tok) => clearTimeout(tok));
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts());
    act(() => { hook.result.current.start(); });
    expect(raf).toHaveBeenCalled();
    hook.unmount();
    expect(cancel).toHaveBeenCalled();
  });

  it('unmount removes listeners and destroys the controller', () => {
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts());
    act(() => { hook.result.current.start(); });
    expect(document.body.classList.contains('autoscroll-running')).toBe(true);
    hook.unmount();
    expect(document.body.classList.contains('autoscroll-running')).toBe(false);
    // Listeners are gone: touches after unmount throw nothing and move nothing.
    act(() => { el.dispatchEvent(new Event('touchstart')); });
    act(() => { document.dispatchEvent(new Event('touchend')); });
    timers(2000);
  });

  it('ends the page when auto-advance is off', () => {
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts({ autoNext: false }));
    act(() => { hook.result.current.start(); });
    timers(100);
    expect(hook.result.current.state).toBe('ended');
    expect(hook.result.current.pauseReason).toBe('end-of-page');
    hook.unmount();
  });

  it.each([
    ['no pager', null],
    ['a pager with no peek', {}],
    ['a peek that throws', { peek: () => { throw new Error('nope'); }, onNext: vi.fn() }],
    ['a peek with no next page', { peek: () => null, onNext: vi.fn() }],
  ])('ends at a boundary when there is %s', (_label, pager) => {
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts({ autoNext: true, pager }));
    act(() => { hook.result.current.start(); });
    timers(100);
    expect(hook.result.current.state).toBe('ended');
    expect(hook.result.current.pauseReason).toBe('boundary');
    hook.unmount();
  });

  it('advances at the end of the page, and a dwell edit mid-countdown re-arms', () => {
    const onNext = vi.fn();
    const pager = makePager({ kind: 'screen', onNext });
    const el = makeScrollEl();
    const { hook, ref } = mountHook(el, baseOpts({ autoNext: true, pager }));
    driveToDwell(hook);
    const firstAdvanceAt = hook.result.current.advanceAt;
    act(() => {
      hook.rerender({ r: ref, o: baseOpts({ autoNext: true, pager, endDwellMs: 9000 }) });
    });
    expect(hook.result.current.advanceAt).toBeGreaterThan(firstAdvanceAt);
    timers(5000);
    expect(onNext).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe('enddwell');
    timers(4100);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).not.toBe('ended');
    hook.unmount();
  });

  it('carries a boundary run to the next screen, and only while fresh', () => {
    const onNext = vi.fn();
    const pager = makePager({ kind: 'boundary', onNext });
    const el = makeScrollEl();
    const first = mountHook(el, baseOpts({ autoNext: true, pager }));
    driveToDwell(first.hook);
    // Stop just past the dwell: the advance fired, but the settle step (16ms
    // later) has not — in the app the page turns here and this controller
    // unmounts, so `carried` survives for the next screen.
    timers(3900);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(first.hook.result.current.state).toBe('advancing');
    first.hook.unmount();
    // Fresh hand-over (well inside CARRY_MS): the new screen resumes unprompted.
    const second = mountHook(el, baseOpts({ autoNext: true, pager }));
    timers(20);
    expect(second.hook.result.current.state).toBe('running');
    second.hook.unmount();
    // Re-drive the first screen so `carried` is set again, then let it age.
    const third = mountHook(el, baseOpts({ autoNext: true, pager }));
    driveToDwell(third.hook);
    timers(3900);
    expect(onNext).toHaveBeenCalledTimes(2);
    expect(third.hook.result.current.state).toBe('advancing');
    third.hook.unmount();
    timers(3100);
    const fourth = mountHook(el, baseOpts({ autoNext: true, pager }));
    timers(100);
    expect(fourth.hook.result.current.state).toBe('idle');
    fourth.hook.unmount();
  });

  it('an advance with no pager at fire time turns nothing', () => {
    const onNext = vi.fn();
    const pager = makePager({ kind: 'screen', onNext });
    const el = makeScrollEl();
    const { hook, ref } = mountHook(el, baseOpts({ autoNext: true, pager }));
    driveToDwell(hook);
    act(() => {
      hook.rerender({ r: ref, o: baseOpts({ autoNext: true, pager: null }) });
    });
    timers(4100);
    expect(onNext).not.toHaveBeenCalled();
    // The no-op advance still settles and runs again — and with the pager
    // gone the second end is a boundary, not another dwell.
    expect(hook.result.current.state).toBe('ended');
    expect(hook.result.current.pauseReason).toBe('boundary');
    hook.unmount();
  });

  it('an advance whose pager lost onNext at fire time turns nothing', () => {
    const pager = makePager({ kind: 'screen', onNext: vi.fn() });
    const el = makeScrollEl();
    const { hook, ref } = mountHook(el, baseOpts({ autoNext: true, pager }));
    driveToDwell(hook);
    const noNext = { peek: pager.peek };
    act(() => {
      hook.rerender({ r: ref, o: baseOpts({ autoNext: true, pager: noNext }) });
    });
    timers(4100);
    expect(pager.onNext).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe('enddwell');
    hook.unmount();
  });

  it('an advance whose peek went dead at fire time still turns the page but carries nothing', () => {
    const onNext = vi.fn();
    const pager = { peek: vi.fn(() => ({ kind: 'boundary' })), onNext };
    const el = makeScrollEl();
    const { hook, ref } = mountHook(el, baseOpts({ autoNext: true, pager }));
    driveToDwell(hook);
    const deadPeek = { peek: vi.fn(() => null), onNext };
    act(() => {
      hook.rerender({ r: ref, o: baseOpts({ autoNext: true, pager: deadPeek }) });
    });
    timers(4100);
    expect(onNext).toHaveBeenCalledTimes(1);
    hook.unmount();
    // Nothing was carried: the next screen does not resume.
    const next = mountHook(el, baseOpts({ autoNext: true, pager }));
    timers(100);
    expect(next.hook.result.current.state).toBe('idle');
    next.hook.unmount();
  });

  it('a throwing advance is traced, and a missing log sink never wedges it', () => {
    const error = vi.fn();
    vi.stubGlobal('DiagnosticLog', { error });
    const onNext = vi.fn(() => { throw new Error('boom'); });
    const pager = makePager({ kind: 'screen', onNext });
    const el = makeScrollEl();
    const { hook } = mountHook(el, baseOpts({ autoNext: true, pager }));
    driveToDwell(hook);
    timers(4100);
    expect(hook.result.current.state).toBe('ended');
    expect(hook.result.current.pauseReason).toBe('advance-failed');
    expect(error).toHaveBeenCalledWith('autoscroll', expect.stringContaining('advance threw'));
    hook.unmount();

    // No error sink at all: the same failure still lands cleanly.
    vi.stubGlobal('DiagnosticLog', {});
    const second = mountHook(el, baseOpts({ autoNext: true, pager }));
    driveToDwell(second.hook);
    timers(4100);
    expect(second.hook.result.current.state).toBe('ended');
    expect(second.hook.result.current.pauseReason).toBe('advance-failed');
    second.hook.unmount();

    // A throwing sink is swallowed too.
    vi.stubGlobal('DiagnosticLog', { error: () => { throw new Error('log boom'); } });
    const third = mountHook(el, baseOpts({ autoNext: true, pager }));
    driveToDwell(third.hook);
    timers(4100);
    expect(third.hook.result.current.state).toBe('ended');
    expect(third.hook.result.current.pauseReason).toBe('advance-failed');
    third.hook.unmount();
  });
});
