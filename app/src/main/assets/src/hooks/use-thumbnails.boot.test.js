/* useThumbnails — the BOOT QUIET WINDOW (web and Android).
   ─────────────────────────────────────────────────────────────────
   Lighthouse mobile (docs/perf/lighthouse-2026-09.md, item 1): the
   capture-after-nav effect fired 350 ms after the first screen, so an
   html2canvas clone render (plus the other-theme render) ran in the middle
   of page load — 4.5 to 8.2 s of main-thread time on the reading pages.

   Non-urgent captures now wait until the page has been up for
   BOOT_CAPTURE_FLOOR_MS AND the main thread has gone idle. Urgent
   captures (the Tabs overview opening, goTabs) still run at once, so the
   cards stay correct. Android too since pf1 (2026-10-22): reopening the APK
   with a reader tab restored froze 2.2 s + 1.2 s in html2canvas on the S22
   and held the search index back to 4-9 s. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';

const U = (tag) => 'data:image/jpeg;base64,' + tag + 'x'.repeat(1200);

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    isAndroid: false,
    takeScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
    takeThemedScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
  },
  captureTargetEl: () => (typeof document !== 'undefined' ? document.querySelector('.screen-layout') : null),
}));
import { PlatformBridge } from '../utils/platform-bridge.js';
import {
  useThumbnails, noteCaptureInteraction,
  BOOT_CAPTURE_FLOOR_MS, _resetCaptureBootGateForTests,
} from './use-thumbnails.js';

const g = /** @type {any} */ (globalThis);
const bridge = /** @type {any} */ (PlatformBridge);
const takeThemedScreenshot = /** @type {import('vitest').Mock} */ (PlatformBridge.takeThemedScreenshot);

beforeEach(() => {
  vi.useFakeTimers();
  g.idbReadAll = vi.fn(async () => ({}));
  g.idbPut = vi.fn();
  g.idbDelete = vi.fn();
  g.tabContentKey = (t) => 'key-' + (t.id || 'a');
  bridge.isAndroid = false;
  _resetCaptureBootGateForTests(false);
  takeThemedScreenshot.mockReset();
  takeThemedScreenshot.mockImplementation(async (theme) => U('render-' + theme));
  noteCaptureInteraction('touch-up', performance.now() - 60000, 0);
  noteCaptureInteraction('mouse-up', performance.now() - 60000);
});

afterEach(() => {
  vi.useRealTimers();
  _resetCaptureBootGateForTests(true);
  bridge.isAndroid = false;
  ['idbReadAll', 'idbPut', 'idbDelete', 'tabContentKey'].forEach((k) => delete g[k]);
});

const tabA = { id: 'a', screen: 'home' };
const tabB = { id: 'b', screen: 'letter', letterId: 'x' };
const hookProps = (over) => ({
  tabs: [tabA], activeTabIdx: 0, activeTab: tabA,
  tabsEnabled: true, tabsOverviewOpen: false, theme: 'dark',
  ...over,
});

const flush = async () => act(async () => { await Promise.resolve(); });
const advance = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); await flush(); };

describe('useThumbnails — boot quiet window', () => {
  it('web: no capture during page load — the first after-nav capture waits past the floor', async () => {
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await advance(BOOT_CAPTURE_FLOOR_MS - 1000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await advance(1000 + 50);                 // floor passed + idle fallback
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
  });

  it('web: navigations during boot collapse into ONE capture of the tab active at the time', async () => {
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);
    rerender(hookProps({ tabs: [tabA, tabB], activeTabIdx: 1, activeTab: tabB }));
    await advance(350);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await advance(BOOT_CAPTURE_FLOOR_MS + 50);
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
    expect(g.idbPut).toHaveBeenCalledWith('key-b', expect.anything());
  });

  it('web: after the boot window, navigation captures on the old 350 ms cadence', async () => {
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(BOOT_CAPTURE_FLOOR_MS + 400);
    await advance(1000);                      // its other-theme render
    takeThemedScreenshot.mockClear();
    rerender(hookProps({ tabs: [tabA, tabB], activeTabIdx: 1, activeTab: tabB }));
    await advance(350);
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });

  it('web: the overview-open heal is URGENT and captures during boot', async () => {
    renderHook((p) => useThumbnails(p), { initialProps: hookProps({ tabsOverviewOpen: true }) });
    await advance(60);
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
  });

  it('web: an explicit urgent capture (goTabs) runs during boot', async () => {
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await act(async () => { await result.current.captureActiveTabThumbnail({ urgent: true }); });
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });

  it('web: unmounting during the wait cancels the deferred capture', async () => {
    const { unmount } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);
    unmount();
    await advance(BOOT_CAPTURE_FLOOR_MS * 2);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
  });

  it('web: turning tabs off during the wait cancels the deferred capture', async () => {
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);
    rerender(hookProps({ tabsEnabled: false }));
    await advance(BOOT_CAPTURE_FLOOR_MS * 2);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
  });

  it('Android: the same window — no capture during page load, one after the floor', async () => {
    bridge.isAndroid = true;
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await advance(BOOT_CAPTURE_FLOOR_MS + 50);
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });

  it('Android: the overview-open heal still captures during boot', async () => {
    bridge.isAndroid = true;
    renderHook((p) => useThumbnails(p), { initialProps: hookProps({ tabsOverviewOpen: true }) });
    await advance(60);
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
  });
});

/* sw1 B5 (audit-web 10-05): on the Scripture Web the content capture found no .screen-layout, fell back to a
   zero-height #root and failed "degenerate canvas" - three retries a visit, each cloning the page and stalling
   on a WebGL readPixels, for a card that stayed blank anyway. The web's tab is not captured at all. */
describe('useThumbnails — the Scripture Web is never captured', () => {
  const webTab = { id: 'w', screen: 'scripture-web' };
  it.each([[false], [true]])('Android %s: no capture and no retries on the web, and a later tab still captures', async (android) => {
    bridge.isAndroid = android;
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps({ tabs: [webTab], activeTab: webTab }) });
    await advance(BOOT_CAPTURE_FLOOR_MS * 3);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    rerender(hookProps({ tabs: [webTab, tabB], activeTabIdx: 1, activeTab: tabB }));
    await advance(BOOT_CAPTURE_FLOOR_MS * 2);
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });
});
