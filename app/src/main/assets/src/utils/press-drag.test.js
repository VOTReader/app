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
import { createPressDrag } from './press-drag.js';

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
