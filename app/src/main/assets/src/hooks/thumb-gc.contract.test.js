/* VERIFIER RED — boot-performance-5 follow-up (1faba717).
   The follow-up made idbReadAll(liveKeys) a pure READ filter (correct: the
   inline delete could wipe every thumbnail on a degraded boot). The claim
   attached to it is that deleting dead rows "goes back to the debounced GC
   effect, which depends on [tabs, tabThumbnails]".

   That claim is false for the rows that matter. The GC effect computes
   deadKeys from Object.keys(tabThumbnails) — React state — and tabThumbnails
   is now populated ONLY from live keys. A row whose tab was already closed
   before mount is skipped by the read, never enters state, and therefore
   never appears in deadKeys. Nothing else deletes it.

   Before boot-performance-5 the mount read was a full dump, so every row
   entered state and the GC saw it. bp-5 v1 deleted dead rows inline. v2
   does neither. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    takeScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
    takeThemedScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
  },
  captureTargetEl: () => (typeof document !== 'undefined' ? document.querySelector('.screen-layout') : null),
}));
import { useThumbnails } from './use-thumbnails.js';

const g = /** @type {any} */ (globalThis);
const U = (tag) => 'data:image/jpeg;base64,' + tag + 'x'.repeat(1200);

/** A fake IDB thumbs store that honours the real idbReadAll(liveKeys) contract
    as the follow-up defines it: filter on read, delete nothing. */
let store;
beforeEach(() => {
  vi.useFakeTimers();
  store = new Map();
  g.idbReadAll = vi.fn(async (liveKeys) => {
    const keep = liveKeys ? new Set(liveKeys) : null;
    const out = {};
    for (const [k, v] of store) if (!keep || keep.has(k)) out[k] = v;
    return out;
  });
  // Harness only, added by the Web Builder: the fix gave the GC a keys-only
  // store read (idbAllKeys) so it can see rows that never reached React state.
  // No assertion in this file was touched.
  g.idbAllKeys = vi.fn(async () => [...store.keys()]);
  g.idbPut = vi.fn((k, v) => { store.set(k, v); });
  g.idbDelete = vi.fn((k) => { store.delete(k); });
  g.tabContentKey = (t) => 'key-' + t.id;
  g.__scrollEl = null;
});
afterEach(() => {
  vi.useRealTimers();
  ['idbReadAll', 'idbAllKeys', 'idbPut', 'idbDelete', 'tabContentKey', '__scrollEl'].forEach((k) => delete g[k]);
});

const mk = (id) => ({ id, screen: 'home' });
const props = (tabs) => ({
  tabs, activeTabIdx: 0, activeTab: tabs[0],
  tabsEnabled: true, tabsOverviewOpen: false, theme: 'dark',
});
const flush = async () => act(async () => { await Promise.resolve(); });
const advance = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); await flush(); };

describe('VERIFIER — dead thumbnail rows are still collected (boot-performance-5 follow-up)', () => {
  it('a row for a tab closed in a PREVIOUS session is eventually deleted', async () => {
    // One open tab, plus two rows left behind by tabs closed before this boot.
    store.set('key-a', { dark: U('a') });
    store.set('key-ghost1', { dark: U('g1') });
    store.set('key-ghost2', { dark: U('g2') });

    renderHook((p) => useThumbnails(p), { initialProps: props([mk('a')]) });
    await flush();
    await advance(3000); // past the 2000 ms GC debounce

    expect([...store.keys()].sort()).toEqual(['key-a']);
  });

  it('the degraded-boot shape recovers its thumbnails once the real tabs hydrate', async () => {
    // vot-state hydration timed out → one synthetic tab renders (storage-backup-3).
    store.set('key-a', { dark: U('a') });
    store.set('key-b', { dark: U('b') });

    const { result, rerender } = renderHook((p) => useThumbnails(p), {
      initialProps: props([mk('default-tab')]),
    });
    await flush();
    // The real tabs arrive a moment later.
    rerender(props([mk('a'), mk('b')]));
    await flush();
    await advance(3000);

    expect(Object.keys(result.current.tabThumbnails).sort()).toEqual(['key-a', 'key-b']);
    expect([...store.keys()].sort()).toEqual(['key-a', 'key-b']);
  });
});
