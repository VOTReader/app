/* StateStore — lsShim + set/get + version contract tests.
   ─────────────────────────────────────────────────────────
   StateStore is the only store with a dual-write path: full state goes
   to IDB, reduced {theme, settings.fontStyle} shim goes to localStorage
   for the synchronous boot-script read at index.html:73. The shim is
   the critical surface — if it breaks, the user sees a wrong-theme
   flash (FOUC) on every page load.
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateStore } from './state-store.js';

beforeEach(() => {
  localStorage.clear();
  StateStore._resetForTests({ forceLoaded: true });
});

/* ═══════════════════════════════════════════════════════════════════
   get() — read contract
   ═══════════════════════════════════════════════════════════════════ */

describe('StateStore — get()', () => {
  it('returns {} on empty (default value)', () => {
    const state = StateStore.get();
    expect(state).toEqual({});
  });

  it('returns full state after set()', () => {
    const full = { theme: 'dark', tabs: [1, 2], settings: { fontStyle: 'modern' } };
    StateStore.set(full);
    expect(StateStore.get()).toBe(full);
  });

  it('returns the live cache reference (mutations visible)', () => {
    const full = { theme: 'dark' };
    StateStore.set(full);
    const ref = StateStore.get();
    ref.theme = 'light';
    expect(StateStore.get().theme).toBe('light');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   set() — mutation + version
   ═══════════════════════════════════════════════════════════════════ */

describe('StateStore — set()', () => {
  it('replaces full state in cache', () => {
    StateStore.set({ theme: 'dark' });
    expect(StateStore.get().theme).toBe('dark');
    StateStore.set({ theme: 'light', tabs: [] });
    expect(StateStore.get().theme).toBe('light');
    expect(StateStore.get().tabs).toEqual([]);
  });

  it('bumps version on each set()', () => {
    const v0 = StateStore.getVersion();
    StateStore.set({ theme: 'dark' });
    expect(StateStore.getVersion()).toBe(v0 + 1);
    StateStore.set({ theme: 'light' });
    expect(StateStore.getVersion()).toBe(v0 + 2);
  });

  it('notifies subscribers', () => {
    const spy = vi.fn();
    StateStore.subscribe(spy);
    StateStore.set({ theme: 'dark' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   lsShim — the boot-script shim path
   ═══════════════════════════════════════════════════════════════════ */

describe('StateStore — lsShim', () => {
  it('writes reduced {theme, settings.fontStyle} to localStorage', () => {
    StateStore.set({ theme: 'light', tabs: [1], settings: { fontStyle: 'modern', showSurpriseButton: true } });
    const raw = localStorage.getItem('vot-state');
    expect(raw).not.toBeNull();
    const shim = JSON.parse(raw);
    expect(shim.theme).toBe('light');
    expect(shim.settings.fontStyle).toBe('modern');
    // Full-state fields are NOT in the shim.
    expect(shim.tabs).toBeUndefined();
    expect(shim.settings.showSurpriseButton).toBeUndefined();
  });

  it('drops undefined theme from shim (JSON.stringify strips undefined)', () => {
    StateStore.set({ tabs: [1, 2, 3] });
    const shim = JSON.parse(localStorage.getItem('vot-state'));
    // JSON.stringify strips keys whose values are undefined, so `theme`
    // is absent after the round-trip. The boot script reads
    // `s.theme === "light"` — absent property reads as undefined, so
    // the comparison returns false (dark theme). Correct behavior.
    expect(shim.theme).toBeUndefined();
    expect(shim.settings).toBeDefined();
  });

  it('drops undefined fontStyle from shim', () => {
    StateStore.set({ theme: 'dark' });
    const shim = JSON.parse(localStorage.getItem('vot-state'));
    expect(shim.theme).toBe('dark');
    // fontStyle is undefined → stripped by JSON.stringify → absent after parse.
    expect(shim.settings.fontStyle).toBeUndefined();
  });

  it('null state writes null values to shim (not undefined)', () => {
    StateStore.set(null);
    const shim = JSON.parse(localStorage.getItem('vot-state'));
    // _bootScriptShim(null): `null && null.theme` short-circuits to null.
    // JSON.stringify preserves null (unlike undefined). Boot script:
    // `null === "light"` → false → dark theme. Correct.
    expect(shim.theme).toBeNull();
    expect(shim.settings.fontStyle).toBeNull();
  });

  it('classic fontStyle round-trips correctly', () => {
    StateStore.set({ theme: 'dark', settings: { fontStyle: 'classic' } });
    const shim = JSON.parse(localStorage.getItem('vot-state'));
    expect(shim.settings.fontStyle).toBe('classic');
  });

  it('LS shim is overwritten on every set()', () => {
    StateStore.set({ theme: 'dark' });
    expect(JSON.parse(localStorage.getItem('vot-state')).theme).toBe('dark');
    StateStore.set({ theme: 'light' });
    expect(JSON.parse(localStorage.getItem('vot-state')).theme).toBe('light');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Deferred-write (pending state)
   ═══════════════════════════════════════════════════════════════════ */

describe('StateStore — deferred writes', () => {
  it('set() defers during pending state', () => {
    StateStore._resetForTests(); // back to pending
    const v0 = StateStore.getVersion();
    StateStore.set({ theme: 'dark' });
    // During pending, _shouldDefer returns true → no direct cache write,
    // but _pendingCache overlay receives the op and _bump fires.
    expect(StateStore.getState()).toBe('pending');
    // The version bumps even during pending (via _applyToPendingCache).
    expect(StateStore.getVersion()).toBe(v0 + 1);
  });
});
