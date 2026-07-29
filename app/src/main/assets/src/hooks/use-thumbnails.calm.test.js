/* useThumbnails — the interaction CALM GATE.
   ─────────────────────────────────────────────────────────────────
   Owner-reported (2026-07-23): taps, scrolls, and the auto-scroll play
   pill all "take a second before recognized". Root cause: every thumbnail
   capture is an html2canvas full-DOM clone render (plus a second one for
   the other theme ~900ms later), and the old cadence placed those renders
   exactly where the next interaction lands — 300ms after a scroll-stop
   (which every auto-scroll pause is) and 350ms after a nav tap. The next
   tap or scroll then queued behind a long main-thread task.

   The fix: non-urgent captures wait until the user is CALM (no finger
   down, nothing touched for CAPTURE_CALM_MS) and defer themselves in
   CALM_RECHECK_MS steps otherwise; the scroll-stop idle grew 300→1200ms;
   the overview-open heal (user is looking at the card) stays urgent.

   Clock note: interaction stamps are performance.now()-domain. These tests
   never rely on whether vitest fakes performance — every "expect it fired"
   step first re-stamps the interaction safely into the past, and every
   "expect it deferred" step stamps recently enough to read busy under
   either clock. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';

const U = (tag) => 'data:image/jpeg;base64,' + tag + 'x'.repeat(1200);
const RENDER_DARK = U('render-dark');
const RENDER_LIGHT = U('render-light');

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    takeScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
    takeThemedScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
  },
  captureTargetEl: () => (typeof document !== 'undefined' ? document.querySelector('.screen-layout') : null),
}));
import { PlatformBridge } from '../utils/platform-bridge.js';
import {
  useThumbnails, noteCaptureInteraction, captureIsCalm,
  CAPTURE_CALM_MS, CALM_RECHECK_MS,
} from './use-thumbnails.js';

const g = /** @type {any} */ (globalThis);
const takeThemedScreenshot = /** @type {import('vitest').Mock} */ (PlatformBridge.takeThemedScreenshot);

// Stamp helpers — offsets are relative to the CURRENT performance.now(),
// whichever clock backs it.
const stampCalm = () => {
  noteCaptureInteraction('touch-up', performance.now() - 60000, 0);
  noteCaptureInteraction('mouse-up', performance.now() - 60000);
};
const stampRecentTouch = () => noteCaptureInteraction('touch-up', performance.now(), 0);

beforeEach(() => {
  vi.useFakeTimers();
  g.idbReadAll = vi.fn(async () => ({}));
  g.idbPut = vi.fn();
  g.idbDelete = vi.fn();
  g.tabContentKey = (t) => 'key-' + (t.id || 'a');
  g.__scrollEl = null;
  takeThemedScreenshot.mockReset();
  takeThemedScreenshot.mockImplementation(async (theme) => (theme === 'light' ? RENDER_LIGHT : RENDER_DARK));
  stampCalm();
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

describe('useThumbnails — interaction calm gate', () => {
  it('captureIsCalm: calm before any interaction, busy right after one, calm again past the window', () => {
    expect(captureIsCalm(performance.now())).toBe(true);
    const t = performance.now();
    noteCaptureInteraction('touch-up', t, 0);
    expect(captureIsCalm(t + CAPTURE_CALM_MS - 1)).toBe(false);
    expect(captureIsCalm(t + CAPTURE_CALM_MS)).toBe(true);
  });

  it('defers the after-nav capture while a touch is recent, fires once calm', async () => {
    stampRecentTouch();
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);                       // after-nav attempt → gate defers
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    stampCalm();                              // user rested
    await advance(CALM_RECHECK_MS);           // deferral re-check fires the capture
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
  });

  it('a held-down finger defers even past the calm window; release then calm fires', async () => {
    noteCaptureInteraction('touch-down', performance.now() - 5000);
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);
    await advance(CALM_RECHECK_MS);           // still down → still deferring
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    noteCaptureInteraction('touch-up', performance.now() - 2000, 0);
    await advance(CALM_RECHECK_MS);
    expect(takeThemedScreenshot).toHaveBeenCalled();
  });

  it('a ZOMBIE down flag (swallowed touchend) self-heals — stale down never disables captures', async () => {
    noteCaptureInteraction('touch-down', performance.now() - 15000); // > DOWN_STALE_MS, no events since
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);
    expect(takeThemedScreenshot).toHaveBeenCalled();
  });

  it('the overview-open heal BYPASSES the gate — the user is looking at the card', async () => {
    stampRecentTouch();                       // the tap that opened the overview
    renderHook((p) => useThumbnails(p), { initialProps: hookProps({ tabsOverviewOpen: true }) });
    await advance(60);
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
  });

  it('scrolling triggers NO capture — the scroll-stop path is retired', async () => {
    // On-device profiling (2026-07-28, Pixel 9 Pro): scroll-stop captures were
    // ~13% of the main thread while reading. after-nav + overview heal cover
    // freshness; a scroll must never schedule a render again.
    const el = document.createElement('div');
    g.__scrollEl = el;
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(400);                       // after-nav primary capture
    await advance(1000);                      // its deferred other-theme render
    takeThemedScreenshot.mockClear();
    stampCalm();
    el.dispatchEvent(new Event('scroll'));
    await advance(5000);                      // any old cadence would have fired by now
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
  });

  it('the deferred other-theme render also waits for calm', async () => {
    renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await advance(350);                       // primary capture (calm)
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
    stampRecentTouch();                       // user touches during the 900ms window
    await advance(900);                       // other-theme timer → gate busy → re-defers
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
    noteCaptureInteraction('touch-up', performance.now() - 2000, 0);
    await advance(CALM_RECHECK_MS);
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(2);
    expect(takeThemedScreenshot).toHaveBeenLastCalledWith('light', 1440, 90);
  });
});
