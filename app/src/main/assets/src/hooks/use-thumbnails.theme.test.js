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
   Legacy shapes migrate in place (bare string / {url,theme}).

   Second owner report (PC): blank tab cards. A zero-sized-canvas capture
   returns "data:," — truthy, so it used to be STORED and painted the card
   blank forever (background tabs never recapture). mergeVariant now rejects
   degenerate URLs (length floor) and the load scrubs any stored ones. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Realistic-length data URLs — mergeVariant + the load scrub floor at 1000
// chars (a real viewport JPEG is tens of KB; "data:," is 5).
const U = (tag) => 'data:image/jpeg;base64,' + tag + 'x'.repeat(1200);
const PRIMARY = U('primary');            // takeScreenshot (Garden true pixels)
const RENDER_DARK = U('render-dark');    // takeThemedScreenshot('dark')
const RENDER_LIGHT = U('render-light');  // takeThemedScreenshot('light')

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    takeScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
    takeThemedScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
  },
  // Simple stand-in for the robust live-column selector — these tests build
  // at most one .screen-layout and never mount the overview overlay.
  captureTargetEl: () => (typeof document !== 'undefined' ? document.querySelector('.screen-layout') : null),
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
  takeScreenshot.mockReset();
  takeScreenshot.mockResolvedValue(PRIMARY);
  takeThemedScreenshot.mockReset();
  // Content-tab captures are clone renders for BOTH the primary (current
  // theme) and the deferred other-theme pass — tag the result by theme.
  takeThemedScreenshot.mockImplementation(async (theme) => (theme === 'light' ? RENDER_LIGHT : RENDER_DARK));
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
    const LEGACY = U('legacy');
    const INTERIM = U('interim');
    const INTERIM_NULL = U('interim-null');
    const V3 = U('v3');
    g.idbReadAll = vi.fn(async () => ({
      k1: LEGACY,
      k2: { url: INTERIM, theme: 'light' },
      k3: { url: INTERIM_NULL, theme: null },
      k4: { dark: V3 },
    }));
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await flush();
    expect(result.current.tabThumbnails).toEqual({
      k1: { unknown: LEGACY },            // awaiting the luminance probe
      k2: { light: INTERIM },             // interim rows upgrade instantly
      k3: { unknown: INTERIM_NULL },
      k4: { dark: V3 },                   // v3 passes through untouched
    });
    // The instant interim upgrade is written back so the migration is one-time.
    expect(g.idbPut).toHaveBeenCalledWith('k2', { light: INTERIM });
  });

  it('SCRUBS degenerate blank variants on load ("data:," rows painted blank cards)', async () => {
    const GOOD = U('good');
    g.idbReadAll = vi.fn(async () => ({
      k1: { dark: 'data:,', light: GOOD },  // blank dark variant — dropped
      k2: { dark: 'data:,' },               // nothing left — row deleted
      k3: 'data:,',                         // blank legacy string — deleted
    }));
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await flush();
    expect(result.current.tabThumbnails).toEqual({ k1: { light: GOOD } });
    expect(g.idbPut).toHaveBeenCalledWith('k1', { light: GOOD });
    expect(g.idbDelete).toHaveBeenCalledWith('k2');
    expect(g.idbDelete).toHaveBeenCalledWith('k3');
  });

  it('renders the CURRENT theme from a clone, then the OTHER theme ~900ms later — native never photographs a content tab', async () => {
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps({ theme: 'light' }) });
    await advance(350); // after-nav primary capture
    expect(takeThemedScreenshot).toHaveBeenCalledWith('light', 1440, 90);
    expect(takeScreenshot).not.toHaveBeenCalled(); // the anti-blink guarantee on Android
    expect(result.current.tabThumbnails['key-a']).toEqual({ light: RENDER_LIGHT });
    await advance(900); // deferred other-theme render
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
    expect(result.current.tabThumbnails['key-a']).toEqual({ light: RENDER_LIGHT, dark: RENDER_DARK });
    expect(g.idbPut).toHaveBeenLastCalledWith('key-a', { light: RENDER_LIGHT, dark: RENDER_DARK });
  });

  it('a degenerate capture ("data:,") is REJECTED — nothing stored, card keeps its placeholder', async () => {
    takeThemedScreenshot.mockImplementation(async () => 'data:,');
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);
    expect(takeThemedScreenshot).toHaveBeenCalled();
    expect(result.current.tabThumbnails['key-a']).toBeUndefined();
    expect(g.idbPut).not.toHaveBeenCalled();
  });

  it('a theme flip re-renders the active tab into the new current-theme slot', async () => {
    const { result, rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps({ theme: 'dark' }) });
    await advance(350);
    await advance(900);
    expect(result.current.tabThumbnails['key-a']).toEqual({ dark: RENDER_DARK, light: RENDER_LIGHT });
    // Flip the theme → the active tab re-captures; the light slot refreshes
    // with a NEW render of the now-current theme.
    const FRESH_LIGHT = U('fresh-light');
    takeThemedScreenshot.mockImplementationOnce(async () => FRESH_LIGHT);
    rerender(hookProps({ theme: 'light' }));
    await advance(350);
    expect(result.current.tabThumbnails['key-a'].light).toBe(FRESH_LIGHT);
    expect(result.current.tabThumbnails['key-a'].dark).toBe(RENDER_DARK);
  });

  it('garden tabs keep the TRUE-PIXEL shot, fill BOTH slots from it, and never run the clone render', async () => {
    const garden = { id: 'a', screen: 'garden-view' };
    renderHook((p) => useThumbnails(p), {
      initialProps: hookProps({ tabs: [garden], activeTab: garden }),
    });
    await advance(350);
    expect(takeScreenshot).toHaveBeenCalledTimes(1); // native PixelCopy on Android
    expect(g.idbPut).toHaveBeenLastCalledWith('key-a', { dark: PRIMARY, light: PRIMARY });
    await advance(1500);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
  });

  it('sets --card-ar from the APP COLUMN width (.screen-layout), not the raw window', async () => {
    const col = document.createElement('div');
    col.className = 'screen-layout';
    col.getBoundingClientRect = () => /** @type {any} */ ({ width: 760 });
    document.body.appendChild(col);
    try {
      renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
      await flush();
      expect(document.documentElement.style.getPropertyValue('--card-ar'))
        .toBe('760 / ' + (window.innerHeight || 1));
    } finally {
      col.remove();
      document.documentElement.style.removeProperty('--card-ar');
    }
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
    // Two primaries rendered ('dark'), but the OTHER-theme render ('light')
    // fired exactly once — the stale schedule was superseded.
    expect(takeThemedScreenshot.mock.calls.filter((c) => c[0] === 'light').length).toBe(1);
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(3);
  });

  it('OVERVIEW-OPEN HEAL: opening the overview captures the active content tab', async () => {
    // A tab whose captures all failed while it was live stayed a blank ✦
    // forever — the overview suppressed ALL captures while open, and no
    // scroll/nav can fire under the overlay. Clone renders exclude the
    // overlay (SCREENSHOT_IGNORE_CLASSES), so the open itself now heals
    // the active card.
    const { result, rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await flush();
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    rerender(hookProps({ tabsOverviewOpen: true }));
    await advance(60);
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
    expect(result.current.tabThumbnails['key-a'].dark).toBe(RENDER_DARK);
  });

  it('OVERVIEW-OPEN: garden tabs stay suppressed (native shot would photograph the overlay)', async () => {
    const garden = { id: 'a', screen: 'garden-view' };
    renderHook((p) => useThumbnails(p), {
      initialProps: hookProps({ tabs: [garden], activeTab: garden, tabsOverviewOpen: true }),
    });
    await advance(1500);
    expect(takeScreenshot).not.toHaveBeenCalled();
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
  });

  it('BOUNDED RETRY: a failed capture retries after 2.5s and heals on success', async () => {
    takeThemedScreenshot
      .mockImplementationOnce(async () => '')      // primary fails
      .mockImplementationOnce(async () => RENDER_DARK); // retry succeeds
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);
    expect(result.current.tabThumbnails['key-a']).toBeUndefined(); // failed, nothing stored
    await advance(2500);
    expect(result.current.tabThumbnails['key-a'].dark).toBe(RENDER_DARK); // healed
  });

  it('BOUNDED RETRY: a permanently-failing environment stops after 3 retries', async () => {
    takeThemedScreenshot.mockImplementation(async () => '');
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);                       // attempt 1 (after-nav)
    await advance(2500);                      // retry 1
    await advance(2500);                      // retry 2
    await advance(2500);                      // retry 3 — budget exhausted
    await advance(10000);                     // nothing further
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(4);
  });

  it('RESIZE: a settled window resize recaptures the active tab at the new geometry', async () => {
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350); // after-nav primary
    await advance(900); // other-theme render
    const before = takeThemedScreenshot.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    await advance(600); // debounce settles → recapture
    expect(takeThemedScreenshot.mock.calls.length).toBeGreaterThan(before);
  });

  it('NEVER touches the live page — no capturing-thumb body class during either pass', async () => {
    // Owner-reported Android glitch: the old engine visibility-hid the
    // floating chrome (dice FAB, reading dot, sticky arrows, back pill) on
    // the REAL body for the duration of both the primary capture and the
    // ~900ms deferred themed render — a split-second blink on every
    // scroll-stop/nav. Chrome exclusion is clone-side only now
    // (SCREENSHOT_IGNORE_CLASSES); the live body class must never return.
    const classDuring = [];
    takeScreenshot.mockImplementation(async () => {
      classDuring.push(document.body.classList.contains('capturing-thumb'));
      return PRIMARY;
    });
    takeThemedScreenshot.mockImplementation(async (theme) => {
      classDuring.push(document.body.classList.contains('capturing-thumb'));
      return theme === 'light' ? RENDER_LIGHT : RENDER_DARK;
    });
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350); // primary (current-theme clone render)
    await advance(900); // deferred other-theme render
    expect(classDuring).toEqual([false, false]); // both passes ran, neither hid chrome
    expect(takeScreenshot).not.toHaveBeenCalled(); // content tabs never photograph the real screen
    expect(document.body.classList.contains('capturing-thumb')).toBe(false);
  });
});

/* boot-performance-5 — the mount-time IDB load had no tabsEnabled gate and
   no restriction to live keys: idbReadAll() cursored the ENTIRE vot-thumbs
   store into React state on every boot, tabs on or off. */
describe('useThumbnails — mount-read is gated + scoped (boot-performance-5)', () => {
  it('a tabs-off session reads nothing from IDB on mount', async () => {
    renderHook((p) => useThumbnails(p), { initialProps: hookProps({ tabsEnabled: false }) });
    await flush();
    expect(g.idbReadAll).not.toHaveBeenCalled();
  });

  it('the mount read is scoped to the live tabs, not the whole store', async () => {
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() }); // tabs: [{id:'a'}] → key-a
    await flush();
    expect(g.idbReadAll).toHaveBeenCalledWith(['key-a']);
  });

  it('flipping tabsEnabled true later runs the read it skipped at mount', async () => {
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps({ tabsEnabled: false }) });
    await flush();
    expect(g.idbReadAll).not.toHaveBeenCalled();
    rerender(hookProps({ tabsEnabled: true }));
    await flush();
    expect(g.idbReadAll).toHaveBeenCalledWith(['key-a']);
  });
});
