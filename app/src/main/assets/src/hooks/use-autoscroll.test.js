/* Auto-scroll transport — controller contract.
 *
 * The controller is pure and driven by injected I/O, so every case here runs
 * on a MANUAL clock and a fake scroll element: no rAF, no DOM, no timers. That
 * is deliberate — rAF does not fire in a hidden preview tab, and a transport
 * whose tests depend on real frames cannot pin its own dt/ramp arithmetic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAutoScroll, clampLpm, computeEndTarget, measureLineHeight,
} from './use-autoscroll.js';

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

  it('will NOT cross a collection boundary', () => {
    const { io, state } = makeIo();
    state.autoNext = true;
    state.canAdv = false; // peek('next') returned a boundary card, or null
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
