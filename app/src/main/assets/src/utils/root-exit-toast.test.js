/* W1.5(d) — root-exit-toast tests.
   ──────────────────────────────────
   Module-level singleton (single armed state, single toast element). Tests
   exercise the arm/disarm/isArmed contract and the toast DOM lifecycle.

   What this catches:
     - arm() failing to set isArmed() = true (would skip the toast UX
       entirely; first-back-at-root would silently exit on second back)
     - disarm() not clearing the timer (would let a stale fire blow away
       a fresh arm called shortly after)
     - Repeat arm() calls leaking timers (would fire spurious disarms
       at the wrong moment)
     - Toast element not removed/hidden on disarm (visible junk persists)
     - Race: arm + disarm in quick succession leaving _armed in a wrong
       state
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { arm, disarm, isArmed, _reset } from './root-exit-toast.js';

beforeEach(() => {
  vi.useFakeTimers();
  _reset();
});

afterEach(() => {
  vi.useRealTimers();
  _reset();
});

describe('root-exit-toast — basic arm/disarm/isArmed', () => {
  it('starts disarmed', () => {
    expect(isArmed()).toBe(false);
  });

  it('arm() makes isArmed() return true', () => {
    arm();
    expect(isArmed()).toBe(true);
  });

  it('disarm() flips isArmed() back to false', () => {
    arm();
    disarm();
    expect(isArmed()).toBe(false);
  });

  it('disarm() is idempotent when already disarmed', () => {
    expect(() => disarm()).not.toThrow();
    expect(isArmed()).toBe(false);
    disarm();
    disarm();
    expect(isArmed()).toBe(false);
  });

  it('timer auto-disarms after the duration', () => {
    arm(2000);
    expect(isArmed()).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(isArmed()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isArmed()).toBe(false);
  });

  it('disarm() before timer fires cancels it (no late disarm)', () => {
    arm(2000);
    vi.advanceTimersByTime(500);
    disarm();
    expect(isArmed()).toBe(false);
    // Even after a long wait, no spurious effects from the cancelled timer.
    vi.advanceTimersByTime(5000);
    expect(isArmed()).toBe(false);
  });

  it('repeat arm() resets the timer (no premature disarm from earlier arm)', () => {
    arm(2000);
    vi.advanceTimersByTime(1500);
    expect(isArmed()).toBe(true);
    // Re-arm — the previous timer's 500ms remaining should NOT fire.
    arm(2000);
    vi.advanceTimersByTime(1500);
    // 500ms past the OLD timer's would-fire time, but we re-armed; should still be armed.
    expect(isArmed()).toBe(true);
    vi.advanceTimersByTime(500);
    // 2000ms after the SECOND arm → now disarmed.
    expect(isArmed()).toBe(false);
  });
});

describe('root-exit-toast — DOM lifecycle', () => {
  it('arm() appends the toast element to document.body', () => {
    expect(document.getElementById('vot-root-exit-toast')).toBe(null);
    arm();
    const el = document.getElementById('vot-root-exit-toast');
    expect(el).toBeTruthy();
    expect(el?.parentNode).toBe(document.body);
  });

  it('toast shows the expected "Press back again to exit" text', () => {
    arm();
    const el = document.getElementById('vot-root-exit-toast');
    expect(el?.textContent).toBe('Press back again to exit');
  });

  it('toast has role="status" for screen-reader accessibility', () => {
    arm();
    const el = document.getElementById('vot-root-exit-toast');
    expect(el?.getAttribute('role')).toBe('status');
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });

  it('disarm() hides the toast (opacity:0) without removing the element', () => {
    arm();
    const el = document.getElementById('vot-root-exit-toast');
    expect(el?.style.opacity).toBe('1');
    disarm();
    expect(el?.style.opacity).toBe('0');
    // Element stays in the DOM for the fade-out transition; production
    // behavior. _reset removes it for test isolation.
    expect(document.getElementById('vot-root-exit-toast')).toBeTruthy();
  });

  it('repeated arm() reuses the same element (no duplicate toasts)', () => {
    arm();
    const first = document.getElementById('vot-root-exit-toast');
    disarm();
    arm();
    const second = document.getElementById('vot-root-exit-toast');
    expect(second).toBe(first);
    // Only ONE element in the body — even with multiple cycles.
    expect(document.querySelectorAll('#vot-root-exit-toast').length).toBe(1);
  });

  it('_reset removes the element + clears the timer (test isolation)', () => {
    arm(2000);
    expect(document.getElementById('vot-root-exit-toast')).toBeTruthy();
    expect(isArmed()).toBe(true);
    _reset();
    expect(document.getElementById('vot-root-exit-toast')).toBe(null);
    expect(isArmed()).toBe(false);
    // The previously-armed timer must not auto-disarm anything created
    // after the reset.
    arm(2000);
    vi.advanceTimersByTime(5000);
    // The fresh arm's timer fires normally; if the old timer leaked,
    // _armed could go negative or some other weirdness — this asserts
    // a clean state.
    expect(isArmed()).toBe(false);
  });
});

describe('root-exit-toast — arm/disarm interaction with TIMER-CLEAR-ON-FORWARD-NAV', () => {
  it('useHistorySync-style disarm sequence: arm → forward-nav (disarm) → back at root → fresh arm', () => {
    // Simulates the [[root-of-history-pwa]] invariant:
    //   user back-at-root → arm()
    //   user taps a tile → useHistorySync calls disarm()
    //   user navigates back to root → popstate handler should see
    //     isArmed() === false (NOT the lingering arm from earlier).
    arm(2000);
    expect(isArmed()).toBe(true);

    // Forward nav happens (e.g. via tile tap).
    disarm();
    expect(isArmed()).toBe(false);

    // Time passes (user navigates around in the app).
    vi.advanceTimersByTime(10000);

    // User returns to root and presses back. popstate runs at root.
    // isArmed() must be false → handler arms fresh + pushes replacement.
    expect(isArmed()).toBe(false);
    arm(2000);
    expect(isArmed()).toBe(true);
    // Second back within 2s exits — verify the fresh timer is in play.
    vi.advanceTimersByTime(1999);
    expect(isArmed()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isArmed()).toBe(false);
  });
});
