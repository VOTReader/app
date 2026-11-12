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

  it('loads stored snapshots for the open tabs and drops junk', async () => {
    store.set('key-a', { snap: snap('<div>stored A</div>') });
    store.set('key-c', { snap: { v: 99 } });
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props(tabsOf('a', 'c')) });
    await flush();
    expect(result.current.tabThumbnails['key-a'].snap.html).toContain('stored A');
    expect(result.current.tabThumbnails['key-c']).toBeUndefined();
    expect(store.has('key-c')).toBe(false);
  });

  // TABS6: the rows an older build (main, before the overview pass) left on the phone: a JPEG per theme
  // ({ dark, light }), one theme only, the `unknown` kind (no theme known), the interim { url, theme } and a bare data
  // URL. None of them is ever shown again (the strip between bars, the inverted blue page); each is deleted when read.
  it('an older build\'s JPEG rows are never shown and are deleted from the picture store', async () => {
    const jpeg = (c) => 'data:image/jpeg;base64,/9j/' + c.repeat(1500);
    store.set('key-both', { dark: jpeg('D'), light: jpeg('L') });
    store.set('key-dark', { dark: jpeg('D') });
    store.set('key-light', { light: jpeg('L') });
    store.set('key-unk', { unknown: jpeg('U') });
    store.set('key-url', { url: jpeg('I'), theme: 'dark' });
    store.set('key-str', jpeg('S'));
    store.set('key-new', { snap: snap('<div>kept</div>') });
    const ids = ['both', 'dark', 'light', 'unk', 'url', 'str', 'new'];
    for (const theme of ['dark', 'light']) {
      const { result, unmount } = renderHook((p) => useThumbnails(p), { initialProps: props(tabsOf(...ids), { theme }) });
      await flush();
      for (const id of ids.slice(0, 6)) expect(result.current.tabThumbnails['key-' + id]).toBeUndefined();
      expect(Object.keys(result.current.tabThumbnails)).toEqual(['key-new']);
      unmount();
    }
    expect([...store.keys()]).toEqual(['key-new']);
    expect(g.idbDelete).not.toHaveBeenCalledWith('key-new');
  });

  it('a picture drawn off screen (TabSnapDrawer) is shown and stored like a live one', async () => {
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props(tabsOf('a', 'b')) });
    await flush();
    const drawn = snap('<div>drawn B</div>');
    act(() => { result.current.storeTabSnap('key-b', drawn); });
    expect(result.current.tabThumbnails['key-b']).toEqual({ snap: drawn });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(store.get('key-b')).toEqual({ snap: drawn });
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
