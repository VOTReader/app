/* useThumbnails (TABS1, 2026-11-11): a card's picture is a snapshot of the tab's page, taken synchronously, kept in
   IndexedDB under the tab's content key, and theme-free (a theme switch needs no new picture). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const snapState = { next: /** @type {any} */ (null), calls: 0 };
vi.mock('../utils/tab-snap.js', () => ({
  snapLiveTab: () => { snapState.calls += 1; return snapState.next; },
  readSnap: (v) => (v && v.v === 1 && typeof v.html === 'string' ? v : null),
}));
vi.mock('../stores/state-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get StateStore() { return /** @type {any} */ (globalThis).StateStore; } }; });
import { useThumbnails, SNAP_AFTER_NAV_MS } from './use-thumbnails.js';

const g = /** @type {any} */ (globalThis);
let store;
const snap = (html) => ({ v: 1, html, w: 412, h: 800, top: 10, st: 300, at: 1 });
beforeEach(() => {
  vi.useFakeTimers();
  store = new Map();
  snapState.next = snap('<div class="screen-layout">page A</div>');
  snapState.calls = 0;
  g.idbReadAll = vi.fn(async (keys) => { const o = {}; for (const k of keys || []) if (store.has(k)) o[k] = store.get(k); return o; });
  g.idbAllKeys = vi.fn(async () => [...store.keys()]);
  g.idbPut = vi.fn((k, v) => { store.set(k, v); });
  g.idbDelete = vi.fn((k) => { store.delete(k); });
  g.tabContentKey = (t) => 'key-' + t.id;
});
afterEach(() => {
  vi.useRealTimers();
  ['idbReadAll', 'idbAllKeys', 'idbPut', 'idbDelete', 'tabContentKey'].forEach((k) => delete g[k]);
});

const tabsOf = (...ids) => ids.map((id) => ({ id, screen: 'letter', letterId: id }));
const props = (tabs, extra = {}) => ({ tabs, activeTabIdx: 0, activeTab: tabs[0], tabsEnabled: true, tabsOverviewOpen: false, theme: 'dark', ...extra });
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('useThumbnails snapshots', () => {
  it('an urgent capture (goTabs) lands in state synchronously, so the Tabs screen first frame has it', async () => {
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props(tabsOf('a', 'b')) });
    await flush();
    act(() => { result.current.captureActiveTabThumbnail({ urgent: true }); });
    expect(result.current.tabThumbnails['key-a'].snap.html).toContain('page A');
  });

  it('writes the snapshot to IndexedDB (at once when the page hides)', async () => {
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props(tabsOf('a')) });
    await flush();
    act(() => { result.current.captureActiveTabThumbnail({ urgent: true }); });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(store.get('key-a')).toEqual({ snap: snapState.next });
  });

  it('a theme switch takes no new picture (the copy follows the theme by itself)', async () => {
    const tabs = tabsOf('a');
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: props(tabs) });
    await flush();
    act(() => { vi.advanceTimersByTime(SNAP_AFTER_NAV_MS + 10); });
    const after = snapState.calls;
    rerender(props(tabs, { theme: 'light' }));
    act(() => { vi.advanceTimersByTime(SNAP_AFTER_NAV_MS + 10); });
    expect(snapState.calls).toBe(after);
  });

  it('the same page again is not rewritten', async () => {
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props(tabsOf('a')) });
    await flush();
    act(() => { result.current.captureActiveTabThumbnail({ urgent: true }); });
    const first = result.current.tabThumbnails['key-a'];
    act(() => { result.current.captureActiveTabThumbnail({ urgent: true }); });
    expect(result.current.tabThumbnails['key-a']).toBe(first);
  });

  it('loads stored snapshots for the open tabs, keeps an old JPEG row only as a fallback, drops junk', async () => {
    store.set('key-a', { snap: snap('<div>stored A</div>') });
    store.set('key-b', { dark: 'data:image/jpeg;base64,' + 'x'.repeat(1200) });
    store.set('key-c', { snap: { v: 99 } });
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props(tabsOf('a', 'b', 'c')) });
    await flush();
    expect(result.current.tabThumbnails['key-a'].snap.html).toContain('stored A');
    expect(result.current.tabThumbnails['key-b'].dark).toBeTruthy();
    expect(result.current.tabThumbnails['key-c']).toBeUndefined();
    expect(store.has('key-c')).toBe(false);
  });

  it('no picture for the Scripture Web (a WebGL canvas) or with tabs off', async () => {
    const tabs = [{ id: 'w', screen: 'scripture-web' }];
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props(tabs) });
    await flush();
    act(() => { result.current.captureActiveTabThumbnail({ urgent: true }); });
    expect(result.current.tabThumbnails['key-w']).toBeUndefined();
    const off = renderHook((p) => useThumbnails(p), { initialProps: props(tabsOf('a'), { tabsEnabled: false }) });
    act(() => { off.result.current.captureActiveTabThumbnail({ urgent: true }); });
    expect(off.result.current.tabThumbnails['key-a']).toBeUndefined();
  });
});
