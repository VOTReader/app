/* createPressDrag — zombie-stream watchdog pins.
   ──────────────────────────────────────────────────────────────────────
   The on-device WebView can kill a drag's pointer stream SILENTLY: no
   pointerup, no pointercancel (the failure family behind "works once,
   then never until an app restart"). The factory force-resets at the
   next start(), but a host like the journal editor only calls start()
   from a grip the user may never touch again — meanwhile the gesture's
   non-passive touchmove suppressor eats EVERY scroll attempt app-wide.

   The watchdog under test: any NEW touchstart while the gesture's stream
   has been silent > 2.5s, with no active touch near the gesture's last
   known position, ends the gesture (drags COMMIT — pointercancel policy)
   and removes the suppressor. A merely-PARKED finger is still present in
   e.touches near its last position, so a healthy paused drag survives.

   Drives the REAL factory over jsdom with fake timers (Date.now is
   faked with the timers). Touch lists are plain expando arrays on a
   bare Event — the handler only reads clientX/clientY. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPressDrag, pickupBuzz } from './press-drag.js';

let ctl;
let onCommit, onAbortDrag, trace;

const firePointer = (type, init) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, isPrimary: true, clientX: 50, clientY: 200, ...init });
  document.dispatchEvent(e);
};

const fireTouchStart = (touches) => {
  const e = new Event('touchstart', { bubbles: true, cancelable: true });
  /** @type {any} */ (e).touches = touches;
  document.dispatchEvent(e);
};

beforeEach(() => {
  vi.useFakeTimers();
  onCommit = vi.fn();
  onAbortDrag = vi.fn();
  trace = vi.fn();
  ctl = createPressDrag({ holdMs: 0, trace, onCommit, onAbortDrag });
});

afterEach(() => {
  ctl.destroy();
  vi.useRealTimers();
});

describe('createPressDrag — zombie watchdog', () => {
  it('a dead stream (silent >2.5s) is healed at the next unrelated touchstart — the drag COMMITS', () => {
    ctl.start(0, 50, 200, 1);
    firePointer('pointermove', { clientX: 50, clientY: 260 });
    expect(ctl.isDragging()).toBe(true);

    // The stream dies silently: no more events for 3s. The user then
    // touches elsewhere to scroll.
    vi.advanceTimersByTime(3000);
    fireTouchStart([{ clientX: 200, clientY: 600 }]);

    expect(ctl.isDragging()).toBe(false);
    expect(onCommit).toHaveBeenCalledTimes(1); // positioned work is kept
    expect(trace).toHaveBeenCalledWith(expect.stringContaining('zombie'));
  });

  it('a PARKED finger is not a zombie — a touch near the last position keeps the drag alive', () => {
    ctl.start(0, 50, 200, 1);
    firePointer('pointermove', { clientX: 50, clientY: 260 });
    vi.advanceTimersByTime(3000); // long pause, finger resting mid-drag

    // e.touches still contains the parked finger near (50, 260).
    fireTouchStart([{ clientX: 55, clientY: 265 }, { clientX: 300, clientY: 600 }]);

    expect(ctl.isDragging()).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onAbortDrag).not.toHaveBeenCalled();
  });

  it('recent stream activity (<2.5s) is never healed — normal multi-touch is untouched', () => {
    ctl.start(0, 50, 200, 1);
    firePointer('pointermove', { clientX: 50, clientY: 260 });
    vi.advanceTimersByTime(1000);
    fireTouchStart([{ clientX: 300, clientY: 600 }]);

    expect(ctl.isDragging()).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a healed gesture releases the touchmove scroll suppressor (scroll works again)', () => {
    ctl.start(0, 50, 200, 1);
    firePointer('pointermove', { clientX: 50, clientY: 260 });

    // While the drag is live, cancelable touchmoves are preventDefault'd.
    const tmLive = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(tmLive);
    expect(tmLive.defaultPrevented).toBe(true);

    vi.advanceTimersByTime(3000);
    fireTouchStart([{ clientX: 200, clientY: 600 }]);

    const tmAfter = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(tmAfter);
    expect(tmAfter.defaultPrevented).toBe(false); // suppressor removed with the gesture
  });

  it('a wedged PRE-drag press (holdMs pending, stream dead) is cleared without a commit', () => {
    const held = createPressDrag({ holdMs: 1380, trace, onCommit, onAbortDrag });
    held.start(0, 50, 200, 1);
    // No engage yet (holdMs pending)… and the stream dies before the hold
    // fires. NOTE: the hold timer itself fires at 1380ms and engages the
    // drag with a dead stream — the watchdog must still clear THAT.
    vi.advanceTimersByTime(3000);
    fireTouchStart([{ clientX: 300, clientY: 600 }]);

    expect(held.isDragging()).toBe(false);
    expect(onCommit).toHaveBeenCalledTimes(1); // engaged at 1380ms → commit policy
    held.destroy();
  });
});

/* n228 (s36.4): the pickup buzz goes through the native haptic bridge on the APK (it honours the system
   touch-feedback setting) and stays navigator.vibrate on the web. Globals restored after each case. */
describe('pickupBuzz', () => {
  const navDesc = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
  afterEach(() => {
    delete /** @type {any} */ (globalThis).PlatformBridge;
    if (navDesc) Object.defineProperty(navigator, 'vibrate', navDesc); else delete navigator.vibrate;
  });

  it('on the APK: the bridge click, and no web vibrate', () => {
    const haptic = vi.fn();
    const vibrate = vi.fn();
    /** @type {any} */ (globalThis).PlatformBridge = { isAndroid: true, haptic };
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
    pickupBuzz(55);
    expect(haptic).toHaveBeenCalledWith(1);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('on the web: navigator.vibrate for the given ms, as before', () => {
    const vibrate = vi.fn();
    /** @type {any} */ (globalThis).PlatformBridge = { isAndroid: false, haptic: vi.fn() };
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
    pickupBuzz(35);
    expect(vibrate).toHaveBeenCalledWith(35);
  });

  it('never throws, with no bridge and no vibrate', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true, writable: true });
    expect(() => pickupBuzz(55)).not.toThrow();
  });

  it('a throwing bridge haptic never throws', () => {
    /** @type {any} */ (globalThis).PlatformBridge = { isAndroid: true, haptic: () => { throw new Error('no'); } };
    expect(() => pickupBuzz(55)).not.toThrow();
  });

  it('a throwing navigator.vibrate never throws', () => {
    Object.defineProperty(navigator, 'vibrate', { value: () => { throw new Error('no'); }, configurable: true, writable: true });
    expect(() => pickupBuzz(55)).not.toThrow();
  });
});

/* Lifecycle pins (votreader-tests-7 item 3): the branches the watchdog
   suite above never reaches — defaults, glow/engage/dragmove/up/cancel,
   pre-drag drift, click suppression, landing, pointer capture, throwing
   host callbacks, and the watchdog's remaining sides. Same harness:
   jsdom + fake timers (Date.now faked with them). */
describe('createPressDrag — lifecycle', () => {
  const made = [];
  const make = (cfg) => {
    const c = createPressDrag(cfg);
    made.push(c);
    return c;
  };
  afterEach(() => {
    while (made.length) made.pop().destroy();
  });

  it('config defaults: hold 1380ms engages; a trace-less forceReset of a live drag is a quiet abort', () => {
    const c = make({});
    c.start(0, 50, 200, 1);
    vi.advanceTimersByTime(1379);
    expect(c.isDragging()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(c.isDragging()).toBe(true);
    expect(() => c.forceReset('bye')).not.toThrow();
    expect(c.isDragging()).toBe(false);
  });

  it('explicit glowMs/driftPx: glow fires at glowMs; drift past driftPx ends the press', () => {
    const onGlow = vi.fn();
    const onGlowClear = vi.fn();
    const c = make({ holdMs: 500, glowMs: 100, driftPx: 5, onGlow, onGlowClear });
    c.start(3, 50, 200, 1);
    vi.advanceTimersByTime(100);
    expect(onGlow).toHaveBeenCalledWith(3);
    firePointer('pointermove', { clientX: 56, clientY: 200 }); // 6px > driftPx 5
    expect(onGlowClear).toHaveBeenCalled();
    expect(c.isDragging()).toBe(false);
  });

  it('full drag: engage → dragmove → pointerup commits; suppressed while dragging and 300ms after', () => {
    const onGlow = vi.fn();
    const onGlowClear = vi.fn();
    const onEngage = vi.fn();
    const onDragMove = vi.fn();
    const onCommit = vi.fn();
    const onAbortDrag = vi.fn();
    const c = make({ holdMs: 300, glowMs: 100, onGlow, onGlowClear, onEngage, onDragMove, onCommit, onAbortDrag, trace });
    c.start(2, 50, 200, 1);
    vi.advanceTimersByTime(100);
    expect(onGlow).toHaveBeenCalledWith(2);
    vi.advanceTimersByTime(200);
    expect(onEngage).toHaveBeenCalledTimes(1);
    expect(onGlowClear).toHaveBeenCalled();
    expect(c.isDragging()).toBe(true);
    expect(c.suppressed()).toBe(true);
    firePointer('pointermove', { clientX: 60, clientY: 240 });
    expect(onDragMove).toHaveBeenCalledWith(expect.anything(), 60, 240);
    firePointer('pointerup');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onAbortDrag).not.toHaveBeenCalled();
    expect(c.isDragging()).toBe(false);
    expect(c.suppressed()).toBe(true); // 300ms post-drag window
    vi.advanceTimersByTime(301);
    expect(c.suppressed()).toBe(false);
  });

  it('a short tap (≤400ms, never dragged) does not suppress the click', () => {
    const c = make({ holdMs: 1380, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    vi.advanceTimersByTime(200);
    firePointer('pointerup');
    expect(onCommit).not.toHaveBeenCalled();
    expect(onAbortDrag).not.toHaveBeenCalled();
    expect(c.suppressed()).toBe(false);
  });

  it('a long undragged press (>400ms) suppresses the trailing click', () => {
    const c = make({ holdMs: 5000, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    vi.advanceTimersByTime(500);
    firePointer('pointerup');
    expect(onCommit).not.toHaveBeenCalled();
    expect(c.suppressed()).toBe(true);
  });

  it('pre-drag drift in Y ends the press too (it was a scroll)', () => {
    const onGlowClear = vi.fn();
    const c = make({ holdMs: 1380, driftPx: 10, onGlowClear, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    firePointer('pointermove', { clientX: 50, clientY: 215 });
    expect(onGlowClear).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onAbortDrag).not.toHaveBeenCalled();
  });

  it('events for another pointerId are ignored (move/up/cancel)', () => {
    const onDragMove = vi.fn();
    const c = make({ holdMs: 0, onDragMove, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    firePointer('pointermove', { pointerId: 2, clientX: 90, clientY: 300 });
    expect(onDragMove).not.toHaveBeenCalled();
    firePointer('pointerup', { pointerId: 2 });
    expect(c.isDragging()).toBe(true);
    firePointer('pointercancel', { pointerId: 2 });
    expect(c.isDragging()).toBe(true);
    firePointer('pointerup');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('pointercancel mid-drag commits at the current slot and traces', () => {
    const c = make({ holdMs: 0, trace, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    firePointer('pointermove', { clientX: 50, clientY: 260 });
    firePointer('pointercancel');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onAbortDrag).not.toHaveBeenCalled();
    expect(trace).toHaveBeenCalledWith(expect.stringContaining('pointercancel'));
    expect(c.isDragging()).toBe(false);
  });

  it('pointercancel pre-drag is a plain scroll takeover: no commit, no trace', () => {
    const c = make({ holdMs: 1380, trace, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    firePointer('pointercancel');
    expect(onCommit).not.toHaveBeenCalled();
    expect(onAbortDrag).not.toHaveBeenCalled();
    expect(trace).not.toHaveBeenCalled();
    expect(c.isDragging()).toBe(false);
  });

  it('start() over a live gesture force-resets it (abort + trace) and the new grab drags', () => {
    const c = make({ holdMs: 0, trace, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    expect(c.isDragging()).toBe(true);
    c.start(1, 60, 210, 1);
    expect(onAbortDrag).toHaveBeenCalledTimes(1);
    expect(trace).toHaveBeenCalledWith(expect.stringContaining('force-reset'));
    expect(c.isDragging()).toBe(true);
  });

  it('forceReset of a pre-drag press clears it without commit/abort/trace', () => {
    const c = make({ holdMs: 1380, trace, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    c.forceReset('ignored pre-drag');
    expect(onCommit).not.toHaveBeenCalled();
    expect(onAbortDrag).not.toHaveBeenCalled();
    expect(trace).not.toHaveBeenCalled();
    expect(() => c.forceReset()).not.toThrow(); // no gesture: quiet no-op
  });

  it('land/flushLanding: ghost removed and reveal restored, by timer, by hand, and with no ghost', () => {
    const c = make({ holdMs: 0 });
    const ghost = document.createElement('div');
    const reveal = document.createElement('div');
    reveal.style.opacity = '0';
    document.body.appendChild(ghost);
    c.land(ghost, reveal, 100);
    vi.advanceTimersByTime(100);
    expect(ghost.parentNode).toBe(null);
    expect(reveal.style.opacity).toBe('');

    const ghost2 = document.createElement('div');
    const reveal2 = document.createElement('div');
    reveal2.style.opacity = '0';
    document.body.appendChild(ghost2);
    c.land(ghost2, reveal2); // default 230ms
    vi.advanceTimersByTime(229);
    expect(ghost2.parentNode).toBe(document.body);
    vi.advanceTimersByTime(1);
    expect(ghost2.parentNode).toBe(null);
    expect(reveal2.style.opacity).toBe('');

    const reveal3 = document.createElement('div');
    reveal3.style.opacity = '0';
    c.land(null, reveal3);
    expect(reveal3.style.opacity).toBe('');

    const detached = document.createElement('div'); // no parentNode
    c.land(detached, null, 50);
    expect(() => c.flushLanding()).not.toThrow();
    expect(() => c.flushLanding()).not.toThrow(); // idempotent
  });

  it('pointer capture is best-effort: called when offered, ignored when missing or throwing', () => {
    const c = make({ holdMs: 0 });
    const cap = { setPointerCapture: vi.fn() };
    c.start(0, 50, 200, 7, cap);
    expect(cap.setPointerCapture).toHaveBeenCalledWith(7);
    c.forceReset();
    const throwing = { setPointerCapture: () => { throw new Error('inactive'); } };
    expect(() => c.start(0, 50, 200, 7, throwing)).not.toThrow();
    c.forceReset();
    expect(() => c.start(0, 50, 200, 7, {})).not.toThrow();
  });

  it('a throwing host callback is traced and never wedges the machine', () => {
    const c = make({ holdMs: 0, trace, onEngage: () => { throw new Error('boom'); } });
    c.start(0, 50, 200, 1);
    expect(trace).toHaveBeenCalledWith(expect.stringContaining('host callback threw'));
    expect(c.isDragging()).toBe(true);
  });

  it('a throwing trace callback is swallowed', () => {
    const c = make({ holdMs: 0, trace: () => { throw new Error('t'); }, onAbortDrag });
    c.start(0, 50, 200, 1);
    expect(() => c.forceReset('x')).not.toThrow();
    expect(onAbortDrag).toHaveBeenCalledTimes(1);
  });

  it('touchmove is only suppressed while dragging and only when cancelable', () => {
    const pre = make({ holdMs: 1380 });
    pre.start(0, 50, 200, 1);
    const tmPre = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(tmPre);
    expect(tmPre.defaultPrevented).toBe(false);
    pre.destroy();

    const c = make({ holdMs: 0 });
    c.start(0, 50, 200, 1);
    const tmNo = new Event('touchmove', { bubbles: true, cancelable: false });
    document.dispatchEvent(tmNo);
    expect(tmNo.defaultPrevented).toBe(false);
  });

  it('zombie heal of a PRE-drag press (hold never fired): cleared, no commit/abort/trace', () => {
    const onGlowClear = vi.fn();
    const c = make({ holdMs: 10000, trace, onGlowClear, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    vi.advanceTimersByTime(3000);
    fireTouchStart([{ clientX: 300, clientY: 600 }]);
    expect(onGlowClear).toHaveBeenCalledTimes(1); // endGesture ran
    expect(onCommit).not.toHaveBeenCalled();
    expect(onAbortDrag).not.toHaveBeenCalled();
    expect(trace).not.toHaveBeenCalled();
  });

  it('zombie heal with no touches list at all (e.touches undefined)', () => {
    const c = make({ holdMs: 0, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    firePointer('pointermove', { clientX: 50, clientY: 260 });
    vi.advanceTimersByTime(3000);
    document.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(c.isDragging()).toBe(false);
  });

  it('a touch near in X but far in Y is not the parked finger — the zombie still heals', () => {
    const c = make({ holdMs: 0, onCommit, onAbortDrag });
    c.start(0, 50, 200, 1);
    firePointer('pointermove', { clientX: 50, clientY: 260 });
    vi.advanceTimersByTime(3000);
    fireTouchStart([{ clientX: 55, clientY: 600 }]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(c.isDragging()).toBe(false);
  });

  it('glow timer firing after engage is skipped (holdMs < glowMs)', () => {
    const onGlow = vi.fn();
    const c = make({ holdMs: 100, glowMs: 280, onGlow });
    c.start(0, 50, 200, 1);
    vi.advanceTimersByTime(300);
    expect(c.isDragging()).toBe(true);
    expect(onGlow).not.toHaveBeenCalled();
  });
});

