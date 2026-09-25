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
import { usePersistedState, RESUME_STATE_KEY, RESUME_STATE_MAX_AGE_MS, takeResumeState } from './use-persisted-state.js';
import { useSavedState } from './use-saved-state.js';
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
  delete /** @type {any} */ (StateStore)._lastWrite;   // n4-05 tests stand in a write promise
  // Restore jsdom's default visibility for the next test file / case.
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  // The export flush bridge is hook-owned; never leak a registration.
  delete /** @type {any} */ (window).__flushPersistState;
  delete /** @type {any} */ (window).__freezePersistState;
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

/* ═══════════════════════════════════════════════════════════════════
   G) window.__flushPersistState — the Export-tap race closer
   ───────────────────────────────────────────────────────────────────
   buildV3Manifest / buildExportPayload read vot-state STRAIGHT FROM IDB
   (the durable truth) after a whenSaved() barrier. A union still inside
   the 250ms debounce window has NOT initiated a StateStore.set, so no
   write is in flight and whenSaved() cannot cover it — a change made
   within 250ms of tapping Export would be missing from the ONLY backup.
   The hook therefore publishes its flush on window.__flushPersistState
   (module-scope state can't cross the bundle-b/bundle-d IIFE boundary —
   the same reason navHandoff is window-backed); SettingsScreen calls it
   synchronously before building the manifest. These tests pin the
   bridge contract: registered on mount, unregistered on unmount,
   synchronous flush, no-op when idle, no duplicate write, boot-critical
   path untouched.
   ═══════════════════════════════════════════════════════════════════ */

describe('usePersistedState — export flush bridge (window.__flushPersistState)', () => {
  it('registers the bridge on mount and unregisters on unmount', () => {
    const { unmount } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    expect(typeof /** @type {any} */ (window).__flushPersistState).toBe('function');
    unmount();
    expect(/** @type {any} */ (window).__flushPersistState).toBe(null);
  });

  it('synchronously flushes a pending debounced union (the Export-tap race), with no duplicate trailing write', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(withQuery('typed-just-before-export'));
    expect(setSpy).toHaveBeenCalledTimes(1); // pending inside the debounce window

    // What SettingsScreen does before buildV3Manifest — no timer advance.
    act(() => { /** @type {any} */ (window).__flushPersistState(); });

    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy.mock.calls[1][0].tabs[0].searchQuery).toBe('typed-just-before-export');

    // The pending timer was cleared — no duplicate trailing write.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when nothing is pending (safe for the export path to call unconditionally)', () => {
    renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    expect(setSpy).toHaveBeenCalledTimes(1); // mount write only
    act(() => { /** @type {any} */ (window).__flushPersistState(); });
    expect(setSpy).toHaveBeenCalledTimes(1); // no spurious write
  });

  it('does not alter the boot-critical immediate path (theme stays immediate; bridge flush afterwards is a no-op)', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    rerender(makeState({ theme: 'light' }));
    expect(setSpy).toHaveBeenCalledTimes(2); // still synchronous, no debounce wait
    act(() => { /** @type {any} */ (window).__flushPersistState(); });
    expect(setSpy).toHaveBeenCalledTimes(2); // immediate write left nothing pending
  });
});

/* ── the update reload: a synchronous, patched write (2026-09-10) ──
   sw-register owns the reload, so the record can be written right before it. The
   debounce serves crashes and tab kills and stays; this is the one caller that may
   not wait 250 ms, and it needs to fold the live scroll position in without a render
   in between (a document does not re-render after pagehide, and the takeover's
   reload() is one call away). */
describe('usePersistedState — window.__flushPersistState(patch)', () => {
  it('writes the LATEST union through the patch at once, even with nothing pending', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    setSpy.mockClear();
    act(() => { rerender(withQuery('abc')); });
    act(() => { vi.advanceTimersByTime(300); });     // the debounced write has happened; nothing pending
    expect(setSpy).toHaveBeenCalledTimes(1);
    const flush = /** @type {any} */ (window).__flushPersistState;
    act(() => { flush((u) => ({ ...u, tabs: [{ ...u.tabs[0], scrollPositions: { k: { y: 900 } } }] })); });
    expect(setSpy, 'a patched flush is a write, pending or not').toHaveBeenCalledTimes(2);
    const written = setSpy.mock.calls[1][0];
    expect(written.tabs[0].searchQuery, 'patched on top of the latest union, not a stale one').toBe('abc');
    expect(written.tabs[0].scrollPositions).toEqual({ k: { y: 900 } });
  });

  it('a patched flush supersedes a pending debounced union rather than racing it', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    setSpy.mockClear();
    act(() => { rerender(withQuery('typing')); });    // pending inside the 250 ms window
    const flush = /** @type {any} */ (window).__flushPersistState;
    act(() => { flush((u) => ({ ...u, activeReadKey: 'patched' })); });
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0].tabs[0].searchQuery).toBe('typing');
    expect(setSpy.mock.calls[0][0].activeReadKey).toBe('patched');
    act(() => { vi.advanceTimersByTime(300); });
    expect(setSpy, 'the pending union was consumed by the patched write; the timer writes nothing more').toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a bare flush with nothing pending is still a no-op (unchanged contract)', () => {
    renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    setSpy.mockClear();
    act(() => { /** @type {any} */ (window).__flushPersistState(); });
    expect(setSpy).not.toHaveBeenCalled();
  });
});

/* ── the reload record (2026-09-11): the union survives the update's reload in
   sessionStorage. StateStore.set is asynchronous by construction (a Web Lock, an IDB
   read, the 3-way merge, then the put) and a document one call from location.reload()
   is not owed its completion — a self-initiated reload may abort the transaction, and a
   restore that depends on the browser finishing it during unload is a manufactured
   survivor (Orchestrator's ruling, 2026-09-11). So the reload's flush ALSO writes the union to
   sessionStorage, synchronously, and the next boot takes that record first
   (useSavedState → takeResumeState), applies it, and clears it. IDB stays the durable
   path for every other write; the record is a same-tab, two-minute bridge. */
describe('usePersistedState — the reload record (sessionStorage)', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('flush(patch, { reload: true }) writes the patched union to sessionStorage the moment it returns, and still to the store', () => {
    renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    setSpy.mockClear();
    const flush = /** @type {any} */ (window).__flushPersistState;
    act(() => { flush((u) => ({ ...u, tabs: [{ ...u.tabs[0], scrollPositions: { k: { y: 900 } } }] }), { reload: true }); });
    const raw = sessionStorage.getItem(RESUME_STATE_KEY);
    expect(raw, 'no await, no timer: the record is there when flush returns').toBeTruthy();
    const rec = JSON.parse(/** @type {string} */ (raw));
    expect(typeof rec.at).toBe('number');
    expect(rec.state.tabs[0].scrollPositions).toEqual({ k: { y: 900 } });
    expect(rec.state.theme).toBe('dark');
    expect(setSpy, 'IDB is still written — the record is a bridge, not a replacement').toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0].tabs[0].scrollPositions).toEqual({ k: { y: 900 } });
  });

  /* n4-05: the record carries the union this tab last saw LAND as its base, so the
     next boot merges 3-way and a read mark another tab cleared stays cleared. */
  it('the record carries the last union that landed as its base, not the one still in flight', async () => {
    setSpy.mockImplementation(() => { /** @type {any} */ (StateStore)._lastWrite = Promise.resolve(); });
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState({ readItems: { a: 1 } }) });
    await act(async () => {});                                   // the mount write lands (whenSaved true)
    rerender(makeState({ readItems: { a: 1, b: 1 } }));          // debounced, not yet written
    act(() => { /** @type {any} */ (window).__flushPersistState(undefined, { reload: true }); });
    const rec = JSON.parse(/** @type {string} */ (sessionStorage.getItem(RESUME_STATE_KEY)));
    expect(rec.state.readItems).toEqual({ a: 1, b: 1 });
    expect(rec.base.readItems).toEqual({ a: 1 });
    expect(Object.keys(rec.base).sort(), 'only the maps a base decides: the record stays small').toEqual(['lastReadChapters', 'lastReadLetterMap', 'readItems']);
  });

  it('a write that never lands is never a base (null: the boot unions as before)', async () => {
    setSpy.mockImplementation(() => { /** @type {any} */ (StateStore)._lastWrite = Promise.resolve(); });
    const saved = vi.spyOn(StateStore, 'whenSaved').mockImplementation(() => Promise.resolve(false));
    renderHook((p) => usePersistedState(p), { initialProps: makeState({ readItems: { a: 1 } }) });
    await act(async () => {});
    act(() => { /** @type {any} */ (window).__flushPersistState(undefined, { reload: true }); });
    expect(JSON.parse(/** @type {string} */ (sessionStorage.getItem(RESUME_STATE_KEY))).base).toBe(null);
    saved.mockRestore();
  });

  it('a set that started no write of its own (queued while loading, fenced) is never a base', async () => {
    /** @type {any} */ (StateStore)._lastWrite = Promise.resolve();   // an earlier write, already on disk
    setSpy.mockImplementation(() => {});                               // this set queues: no new write
    renderHook((p) => usePersistedState(p), { initialProps: makeState({ readItems: { a: 1 } }) });
    await act(async () => {});
    act(() => { /** @type {any} */ (window).__flushPersistState(undefined, { reload: true }); });
    expect(JSON.parse(/** @type {string} */ (sessionStorage.getItem(RESUME_STATE_KEY))).base).toBe(null);
  });

  it('CONTROL: a patched flush WITHOUT the reload option writes no record', () => {
    renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    act(() => { /** @type {any} */ (window).__flushPersistState((u) => ({ ...u, activeReadKey: 'x' })); });
    expect(sessionStorage.getItem(RESUME_STATE_KEY)).toBeNull();
  });

  it('takeResumeState() hands the state back once and clears the record', () => {
    sessionStorage.setItem(RESUME_STATE_KEY, JSON.stringify({ at: Date.now(), state: { tabs: [{ id: 'z' }], activeTabIdx: 0 } }));
    const s = takeResumeState();
    expect(s && s.tabs[0].id).toBe('z');
    expect(sessionStorage.getItem(RESUME_STATE_KEY), 'consumed: a second boot never replays it').toBeNull();
    expect(takeResumeState()).toBeNull();
  });

  it('a record older than the max age is dropped, not applied', () => {
    sessionStorage.setItem(RESUME_STATE_KEY, JSON.stringify({ at: Date.now() - RESUME_STATE_MAX_AGE_MS - 1, state: { tabs: [] } }));
    expect(takeResumeState()).toBeNull();
    expect(sessionStorage.getItem(RESUME_STATE_KEY)).toBeNull();
  });

  it('a malformed record, or one whose state is not an object, is dropped — null never impersonates a state', () => {
    sessionStorage.setItem(RESUME_STATE_KEY, '{not json');
    expect(takeResumeState()).toBeNull();
    expect(sessionStorage.getItem(RESUME_STATE_KEY)).toBeNull();
    sessionStorage.setItem(RESUME_STATE_KEY, JSON.stringify({ at: Date.now(), state: null }));
    expect(takeResumeState()).toBeNull();
    sessionStorage.setItem(RESUME_STATE_KEY, JSON.stringify({ at: Date.now(), state: 'tabs' }));
    expect(takeResumeState()).toBeNull();
    sessionStorage.setItem(RESUME_STATE_KEY, JSON.stringify({ state: { tabs: [] } }));   // no timestamp: age unknown → not applied
    expect(takeResumeState()).toBeNull();
    expect(takeResumeState(), 'nothing stored → null (JSON.parse(null) is null too; the guard is explicit, not incidental)').toBeNull();
  });

  /* Contract 8 (2026-09-24): a reader who changed screens and reloaded inside the
     debounce window came back to the PREVIOUS screen — pagehide flushed into an
     asynchronous store write the unload aborted. Every leave now also writes the
     synchronous record. setSpy mocks StateStore.set, which is exactly an aborted put:
     nothing reaches the store. */
  const record = () => {
    const raw = sessionStorage.getItem(RESUME_STATE_KEY);
    return raw ? JSON.parse(raw).state : null;
  };
  const answers = () => makeState({ tabs: [{ id: 't1', screen: 'answers-home' }] });

  it('pagehide inside the debounce window leaves the record with the screen just opened', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    act(() => { rerender(answers()); });                 // pending: the 250 ms window
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(record() && record().tabs[0].screen, 'the reload must reopen the screen the reader was on').toBe('answers-home');
    expect(setSpy.mock.calls[setSpy.mock.calls.length - 1][0].tabs[0].screen, 'and the store is still written').toBe('answers-home');
  });

  it('beforeunload leaves the record too', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    act(() => { rerender(answers()); });
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    expect(record() && record().tabs[0].screen).toBe('answers-home');
  });

  it('pagehide with nothing pending still leaves the LATEST union (a write handed to the store may still be in flight), and writes the store no second time', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    act(() => { rerender(answers()); });
    act(() => { vi.advanceTimersByTime(300); });        // the debounced write fired ...
    const writes = setSpy.mock.calls.length;
    act(() => { window.dispatchEvent(new Event('pagehide')); });   // ... and the reload may abort it
    expect(record() && record().tabs[0].screen).toBe('answers-home');
    expect(setSpy.mock.calls.length, 'no redundant store write').toBe(writes);
  });

  it('CONTROL: hidden is not leaving — the store is written, no record is left', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    act(() => { rerender(answers()); });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(setSpy.mock.calls[setSpy.mock.calls.length - 1][0].tabs[0].screen).toBe('answers-home');
    expect(sessionStorage.getItem(RESUME_STATE_KEY)).toBeNull();
  });

  it('back from the back-forward cache, the record its pagehide left is cleared; an ordinary pageshow keeps it', () => {
    renderHook((p) => usePersistedState(p), { initialProps: answers() });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    const show = (persisted) => { const e = new Event('pageshow'); Object.defineProperty(e, 'persisted', { value: persisted }); return e; };
    act(() => { window.dispatchEvent(show(false)); });
    expect(record(), 'not a restore: nothing to clear').not.toBeNull();
    act(() => { window.dispatchEvent(show(true)); });
    expect(sessionStorage.getItem(RESUME_STATE_KEY), 'the document lives on and will leave its own').toBeNull();
  });

  it('the import freeze clears a record an earlier pagehide left, so the boot after the import reads the restore', () => {
    renderHook((p) => usePersistedState(p), { initialProps: answers() });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(record()).not.toBeNull();
    act(() => { /** @type {any} */ (window).__freezePersistState(true); });
    expect(sessionStorage.getItem(RESUME_STATE_KEY)).toBeNull();
  });

  it('round trip: a screen change, a reload inside the window whose store write never lands, and the next boot opens that screen', () => {
    StateStore._resetForTests({ forceLoaded: true });
    StateStore._cache = /** @type {any} */ (makeState());               // the store still says Home
    localStorage.setItem('vot-scrollheal-1', '1');
    const { rerender, unmount } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    act(() => { rerender(answers()); });
    act(() => { window.dispatchEvent(new Event('pagehide')); });        // StateStore.set is mocked: aborted
    unmount();
    const { result } = renderHook(() => useSavedState());
    expect(result.current.tabs[0].screen).toBe('answers-home');
  });

  it('a sessionStorage that throws does not stop the store write — the reload must still happen', () => {
    renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    setSpy.mockClear();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    try {
      act(() => { /** @type {any} */ (window).__flushPersistState((u) => u, { reload: true }); });
    } finally { spy.mockRestore(); }
    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});

/* ── contract 7 (v04-01 / v04-02, improvement sweep 2026-09-22): the restore / wipe freeze.
   An import REPLACES vot-state and Clear All deletes it; the page reloads 0.6-5 s later.
   The React state this sink writes is still the PRE-import state, and a scroll, a tap or
   the reload's own pagehide used to write it over the restore (the 3-way merge then
   deleted restored readItems). Frozen, the sink writes nothing until the reload; the path
   that does not reload thaws it and re-arms what was rendered meanwhile. */
describe('usePersistedState — window.__freezePersistState (the restore / wipe freeze)', () => {
  const freezeBridge = () => /** @type {any} */ (window).__freezePersistState;

  it('is published for the life of App() and cleared on unmount', () => {
    const { unmount } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    expect(typeof freezeBridge()).toBe('function');
    unmount();
    expect(freezeBridge()).toBe(null);
  });

  it('frozen, a pending union is dropped and nothing rendered afterwards is written — boot-critical fields included', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    setSpy.mockClear();
    act(() => { rerender(withQuery('scrolled-before-the-import')); });   // pending in the 250 ms window
    act(() => { freezeBridge()(true); });
    act(() => { rerender(withQuery('scrolled-after-the-import')); });
    act(() => { rerender(makeState({ theme: 'light' })); });          // would bypass the debounce
    act(() => { vi.advanceTimersByTime(1000); });
    expect(setSpy, 'no stale union may land over the restore').not.toHaveBeenCalled();
  });

  it('frozen, every flush is a no-op: hidden, pagehide, beforeunload, the bridge (patched, reload) and unmount', () => {
    sessionStorage.clear();
    const { rerender, unmount } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    setSpy.mockClear();
    act(() => { freezeBridge()(true); });
    act(() => { rerender(withQuery('stale')); });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    act(() => { /** @type {any} */ (window).__flushPersistState(); });
    act(() => { /** @type {any} */ (window).__flushPersistState((u) => ({ ...u, activeReadKey: 'x' }), { reload: true }); });
    expect(sessionStorage.getItem(RESUME_STATE_KEY), 'no resume record either: the next boot must read the restore').toBeNull();
    unmount();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('thawed (the import did not reload), the union rendered while frozen is re-armed on the debounce, not lost', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    setSpy.mockClear();
    act(() => { freezeBridge()(true); });
    act(() => { rerender(withQuery('typed-while-frozen')); });
    act(() => { freezeBridge()(false); });
    expect(setSpy).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0].tabs[0].searchQuery).toBe('typed-while-frozen');
  });

  it('CONTROL: thawed with nothing rendered meanwhile writes nothing, and writes resume as before', () => {
    const { rerender } = renderHook((p) => usePersistedState(p), { initialProps: makeState() });
    setSpy.mockClear();
    act(() => { freezeBridge()(true); });
    act(() => { freezeBridge()(false); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(setSpy).not.toHaveBeenCalled();
    act(() => { rerender(withQuery('after')); });
    act(() => { vi.advanceTimersByTime(300); });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});
