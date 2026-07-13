/* useThumbnails — dual-theme thumbnail variants.
   ─────────────────────────────────────────────────────────────────
   Owner-reported: after switching theme the Tabs overview showed a mixed
   wall of dark and light cards, and the flip-filter approximation left
   color artifacts (blue hero hues). Native capture can only photograph the
   on-screen theme, so the fix captures BOTH: the current theme through the
   normal pipeline, and the OTHER theme ~900ms later via html2canvas
   rendering a DOM clone with the opposite theme class forced
   (PlatformBridge.takeThemedScreenshot). Entries become variant maps
   { dark?, light?, unknown? }; a theme switch is then an instant lookup.
   Legacy shapes migrate in place (bare string / {url,theme}). */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    takeScreenshot: vi.fn(async () => 'data:primary'),
    takeThemedScreenshot: vi.fn(async () => 'data:themed'),
  },
}));
import { PlatformBridge } from '../utils/platform-bridge.js';
import { useThumbnails } from './use-thumbnails.js';

const g = /** @type {any} */ (globalThis);
const takeScreenshot = /** @type {import('vitest').Mock} */ (PlatformBridge.takeScreenshot);
const takeThemedScreenshot = /** @type {import('vitest').Mock} */ (PlatformBridge.takeThemedScreenshot);

beforeEach(() => {
  vi.useFakeTimers();
  g.idbReadAll = vi.fn(async () => ({}));
  g.idbPut = vi.fn();
  g.idbDelete = vi.fn();
  g.tabContentKey = (t) => 'key-' + (t.id || 'a');
  g.__scrollEl = null;
  takeScreenshot.mockClear();
  takeThemedScreenshot.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  ['idbReadAll', 'idbPut', 'idbDelete', 'tabContentKey', '__scrollEl'].forEach((k) => delete g[k]);
});

const tab = { id: 'a', screen: 'home' };
const hookProps = (over) => ({
  tabs: [tab], activeTabIdx: 0, activeTab: tab,
  tabsEnabled: true, tabsOverviewOpen: false, theme: 'dark',
  ...over,
});

const flush = async () => act(async () => { await Promise.resolve(); });
const advance = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); await flush(); };

describe('useThumbnails — dual-theme variants', () => {
  it('migrates every legacy row shape to the variant map on load', async () => {
    g.idbReadAll = vi.fn(async () => ({
      k1: 'data:legacy-string',
      k2: { url: 'data:interim', theme: 'light' },
      k3: { url: 'data:interim-null', theme: null },
      k4: { dark: 'data:already-v3' },
    }));
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await flush();
    expect(result.current.tabThumbnails).toEqual({
      k1: { unknown: 'data:legacy-string' },          // awaiting the luminance probe
      k2: { light: 'data:interim' },                  // interim rows upgrade instantly
      k3: { unknown: 'data:interim-null' },
      k4: { dark: 'data:already-v3' },                // v3 passes through untouched
    });
    // The instant interim upgrade is written back so the migration is one-time.
    expect(g.idbPut).toHaveBeenCalledWith('k2', { light: 'data:interim' });
  });

  it('captures the CURRENT theme, then renders the OTHER theme from a clone ~900ms later', async () => {
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps({ theme: 'light' }) });
    await advance(350); // after-nav primary capture
    expect(takeScreenshot).toHaveBeenCalledTimes(1);
    expect(result.current.tabThumbnails['key-a']).toEqual({ light: 'data:primary' });
    await advance(900); // deferred other-theme render
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
    expect(result.current.tabThumbnails['key-a']).toEqual({ light: 'data:primary', dark: 'data:themed' });
    expect(g.idbPut).toHaveBeenLastCalledWith('key-a', { light: 'data:primary', dark: 'data:themed' });
  });

  it('a theme flip recaptures TRUE pixels into the same entry (replacing the rendered approximation)', async () => {
    const { result, rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps({ theme: 'dark' }) });
    await advance(350);
    await advance(900);
    expect(result.current.tabThumbnails['key-a']).toEqual({ dark: 'data:primary', light: 'data:themed' });
    // Flip the theme → the active tab re-photographs; the light slot upgrades
    // from the html2canvas render to genuine pixels.
    takeScreenshot.mockResolvedValueOnce('data:primary-light');
    rerender(hookProps({ theme: 'light' }));
    await advance(350);
    expect(result.current.tabThumbnails['key-a'].light).toBe('data:primary-light');
    expect(result.current.tabThumbnails['key-a'].dark).toBe('data:primary');
  });

  it('garden tabs fill BOTH slots from one capture and never run the themed render', async () => {
    const garden = { id: 'a', screen: 'garden-view' };
    renderHook((p) => useThumbnails(p), {
      initialProps: hookProps({ tabs: [garden], activeTab: garden }),
    });
    await advance(350);
    expect(g.idbPut).toHaveBeenLastCalledWith('key-a', { dark: 'data:primary', light: 'data:primary' });
    await advance(1500);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
  });

  it('a superseding capture drops the stale other-theme render (seq guard)', async () => {
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps({ theme: 'dark' }) });
    await advance(350); // primary #1 lands, other-theme timer armed
    // Before the 900ms themed render fires, a nav-like change triggers a NEW
    // primary (its schedule replaces the old one).
    const tab2 = { id: 'a', screen: 'home', bookId: 'john' };
    rerender(hookProps({ theme: 'dark', tabs: [tab2], activeTab: tab2 }));
    await advance(350); // primary #2
    await advance(900); // only the NEW schedule may fire
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });
});
