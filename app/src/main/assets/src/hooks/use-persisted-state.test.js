/* usePersistedState — write-coalescing (debounce + flush-on-hide) tests.
   ─────────────────────────────────────────────────────────────────────
   Regression guard for the per-keystroke full-persistence defect:

     SearchScreen onChange → setSearchQuery → tabField('searchQuery') →
     updateActiveTab (new tabs array) → usePersistedState effect →
     StateStore.set → CachedStore._save → full JSON.stringify + IDB put
     + LS shim — PER KEYSTROKE, no debounce anywhere in the chain.

   The fix debounces the sink effect (trailing edge, PERSIST_DEBOUNCE_MS)
   with guaranteed flush on visibilitychange→hidden / pagehide /
   beforeunload / unmount, while keeping boot-script-critical writes
   (theme / settings.fontStyle / settings.fontScale — the only fields the
   lsShim mirrors and index.html:73 reads synchronously) IMMEDIATE so a
   quick reload after a theme change can't reintroduce a wrong-theme FOUC.

   What these tests pin:

     A) N rapid successive unions inside the debounce window produce ONE
        trailing StateStore.set carrying the LATEST union — never N.
     B) visibilitychange→hidden flushes the pending union synchronously
        (no write lost on tab background) and CLEARS the pending timer
        (no duplicate write when the timer would have fired).
     C) pagehide flushes too (tab close / Android WebView destroy path).
     D) Unmount flushes (App teardown never strands a pending write).
     E) theme / fontStyle / fontScale changes bypass the debounce
        (boot-script shim immediacy — FOUC guard).
     F) A boot-critical change while a debounced write is pending writes
        IMMEDIATELY with the latest FULL union (the pending older union
        is superseded, not lost) and the stale timer does not fire a
        second write.

   StateStore.set is spied (not the whole store) so these tests need no
   IDB; hydration/rebase/merge coverage stays in cached-store.test.js /
   cross-tab-merge.test.js, untouched.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedState } from './use-persisted-state.js';
import { StateStore } from '../stores/state-store.js';

/** Build a full 8-value union with overridable fields. */
function makeState(overrides) {
  return {
    tabs: [{ id: 't1', screen: 'home' }],
    activeTabIdx: 0,
    theme: 'dark',
    lastReadChapters: {},
    lastReadLetterMap: {},
    activeReadKey: null,
    settings: { fontStyle: 'modern', fontScale: '1.0' },
    readItems: {},
    ...overrides,
  };
}

/** Union whose tabs carry a searchQuery — the per-keystroke shape. */
function withQuery(q) {
  return makeState({ tabs: [{ id: 't1', screen: 'search', searchQuery: q }] });
}

let setSpy;

beforeEach(() => {
  vi.useFakeTimers();
  setSpy = vi.spyOn(StateStore, 'set').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Restore jsdom's default visibility for the next test file / case.
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

/* ═══════════════════════════════════════════════════════════════════
   A) Rapid successive unions coalesce to ONE trailing write
   ═══════════════════════════════════════════════════════════════════ */

describe('usePersistedState — debounce coalescing', () => {
  it('writes the initial union immediately on mount (unchanged boot semantics)', () => {
    renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0].theme).toBe('dark');
  });

  it('20 rapid tab unions (per-keystroke shape) inside the window produce ONE trailing write', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    expect(setSpy).toHaveBeenCalledTimes(1); // mount write

    for (let i = 1; i <= 20; i++) {
      rerender(withQuery('q'.repeat(i)));
    }
    // Inside the debounce window: still only the mount write.
    expect(setSpy).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(300); });
    // Exactly ONE coalesced trailing write, carrying the LATEST union.
    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy.mock.calls[1][0].tabs[0].searchQuery).toBe('q'.repeat(20));
  });

  it('debounce is trailing-edge: a quiet window longer than the delay flushes on its own', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(withQuery('abc'));
    act(() => { vi.advanceTimersByTime(249); });
    expect(setSpy).toHaveBeenCalledTimes(1); // not yet
    act(() => { vi.advanceTimersByTime(2); });
    expect(setSpy).toHaveBeenCalledTimes(2); // trailing edge fired
  });

  it('each new union resets the window (continuous typing keeps coalescing)', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(withQuery('a'));
    act(() => { vi.advanceTimersByTime(200); });
    rerender(withQuery('ab')); // resets the window
    act(() => { vi.advanceTimersByTime(200); });
    rerender(withQuery('abc')); // resets again
    act(() => { vi.advanceTimersByTime(200); });
    expect(setSpy).toHaveBeenCalledTimes(1); // 400ms elapsed, but no full quiet window yet
    act(() => { vi.advanceTimersByTime(100); });
    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy.mock.calls[1][0].tabs[0].searchQuery).toBe('abc');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   B/C/D) Guaranteed flush — hide, close, unmount (no write ever lost)
   ═══════════════════════════════════════════════════════════════════ */

describe('usePersistedState — flush-on-hide / close / unmount', () => {
  it('visibilitychange→hidden flushes the pending union and clears the timer', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(withQuery('hide-me'));
    expect(setSpy).toHaveBeenCalledTimes(1); // pending, not yet written

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy.mock.calls[1][0].tabs[0].searchQuery).toBe('hide-me');

    // The pending timer was cleared — no duplicate trailing write.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('visibilitychange→visible does NOT flush early (debounce still in force)', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(withQuery('still-visible'));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); }); // state is 'visible'
    expect(setSpy).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(300); });
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('pagehide flushes the pending union (tab close / WebView destroy)', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(withQuery('close-me'));
    expect(setSpy).toHaveBeenCalledTimes(1);

    act(() => { window.dispatchEvent(new Event('pagehide')); });

    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy.mock.calls[1][0].tabs[0].searchQuery).toBe('close-me');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(setSpy).toHaveBeenCalledTimes(2); // no duplicate
  });

  it('beforeunload flushes the pending union', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(withQuery('unload-me'));
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy.mock.calls[1][0].tabs[0].searchQuery).toBe('unload-me');
  });

  it('unmount flushes the pending union (App teardown strands nothing)', () => {
    const { rerender, unmount } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(withQuery('unmount-me'));
    expect(setSpy).toHaveBeenCalledTimes(1);

    unmount();

    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy.mock.calls[1][0].tabs[0].searchQuery).toBe('unmount-me');
  });

  it('flush with nothing pending is a no-op (no spurious writes)', () => {
    const { unmount } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    expect(setSpy).toHaveBeenCalledTimes(1); // mount only
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    unmount();
    expect(setSpy).toHaveBeenCalledTimes(1); // nothing pending → nothing written
  });
});

/* ═══════════════════════════════════════════════════════════════════
   E/F) Boot-script-critical fields bypass the debounce (FOUC guard)
   ═══════════════════════════════════════════════════════════════════ */

describe('usePersistedState — boot-critical immediacy (lsShim / index.html:73)', () => {
  it('theme change writes IMMEDIATELY, no debounce wait', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(makeState({ theme: 'light' }));
    expect(setSpy).toHaveBeenCalledTimes(2); // synchronous, before any timer advance
    expect(setSpy.mock.calls[1][0].theme).toBe('light');
  });

  it('settings.fontStyle change writes IMMEDIATELY', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(makeState({ settings: { fontStyle: 'classic', fontScale: '1.0' } }));
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('settings.fontScale change writes IMMEDIATELY (WL1 text-size, read pre-mount)', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(makeState({ settings: { fontStyle: 'modern', fontScale: '1.5' } }));
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('a boot-critical change supersedes a pending debounced union (latest FULL union wins, stale timer cleared)', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(withQuery('typed-but-unwritten'));      // debounced, pending
    expect(setSpy).toHaveBeenCalledTimes(1);
    rerender(makeState({                             // boot-critical → immediate
      theme: 'light',
      tabs: [{ id: 't1', screen: 'search', searchQuery: 'typed-but-unwritten' }],
    }));
    expect(setSpy).toHaveBeenCalledTimes(2);
    // The immediate write carries the FULL latest union — the pending
    // keystroke state is included, not dropped.
    expect(setSpy.mock.calls[1][0].tabs[0].searchQuery).toBe('typed-but-unwritten');
    expect(setSpy.mock.calls[1][0].theme).toBe('light');
    // The superseded union's timer was cleared — no stale second write.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('non-boot fields alone still debounce after a boot-critical write', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(makeState({ theme: 'light' }));         // immediate
    expect(setSpy).toHaveBeenCalledTimes(2);
    // tabs-only change (theme STAYS 'light') → debounced again
    rerender(makeState({ theme: 'light', tabs: [{ id: 't1', screen: 'search', searchQuery: 'back-to-typing' }] }));
    expect(setSpy).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(300); });
    expect(setSpy).toHaveBeenCalledTimes(3);
  });
});
