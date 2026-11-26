// @ts-nocheck — imports the same source twice (?copy=) to stand in for the copies bundles b and d each carry
/* bundles-n1 / bundles-n2 (audit 2026-11-23, item 15): bundles b and d each bundle their own copy of a module both
   import. Vite gives a module imported with a different query its own instance, the same split the two bundles make,
   so each test drives one copy and reads the other. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sharedState } from './shared-state.js';

describe('sharedState', () => {
  afterEach(() => { delete window.__votShared; });

  it('makes the state once and hands every later caller the same object', () => {
    const make = vi.fn(() => ({ n: 0 }));
    const a = sharedState('t-once', make);
    const b = sharedState('t-once', make);
    expect(a).toBe(b);
    expect(make).toHaveBeenCalledTimes(1);
    expect(window.__votShared['t-once']).toBe(a);
  });

  it('keeps names apart', () => {
    expect(sharedState('t-a', () => ({ v: 'a' }))).not.toBe(sharedState('t-b', () => ({ v: 'b' })));
  });
});

describe('bundles-n1: the words Search carried to Answers are one value for both bundles', () => {
  it('a value set in one copy (d: Search, AnswersHome) is read by the other (b: use-android-back)', async () => {
    const d = await import('./answers-from-search.js?copy=d');
    const b = await import('./answers-from-search.js?copy=b');
    expect(d).not.toBe(b);
    d.setAnswersFromSearch('  the latter rain ');
    expect(b.answersFromSearch()).toBe('the latter rain');
    b.setAnswersFromSearch(null);
    expect(d.answersFromSearch()).toBeNull();
  });
});

describe('bundles-n2: toasts from both bundles stack and share their timers', () => {
  let b; let d;
  beforeEach(async () => {
    vi.useFakeTimers();
    b = await import('./toast.js?copy=b');
    d = await import('./toast.js?copy=d');
    b._resetToasts();
  });
  afterEach(() => { b._resetToasts(); vi.useRealTimers(); });

  it('a b toast shown while a d toast is up is pushed off it instead of covering it', () => {
    d.showToast({ id: 'vot-toast-hl', className: 'vot-toast', text: 'Highlighted', durationMs: 5000 });
    b.showToast({ id: 'vot-toast-copy', className: 'vot-toast', text: 'Copied', durationMs: 3000 });
    expect(document.getElementById('vot-toast-hl').style.marginBottom).toBe('');
    expect(document.getElementById('vot-toast-copy').style.marginBottom).toBe('8px');
  });

  it('a re-show from one copy cancels the other copy\'s pending hide', () => {
    b.showToast({ id: 'vot-toast-x', className: 'vot-toast', text: 'one', durationMs: 1000 });
    d.showToast({ id: 'vot-toast-x', className: 'vot-toast', text: 'two', durationMs: 0 });
    vi.advanceTimersByTime(1500);
    expect(document.getElementById('vot-toast-x').classList.contains('show')).toBe(true);
  });

  it('the onHide of a showing set by one copy runs when the other copy hides it', () => {
    const onHide = vi.fn();
    d.showToast({ id: 'vot-toast-y', className: 'vot-toast', text: 'y', durationMs: 0, onHide });
    b.hideToast('vot-toast-y');
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
