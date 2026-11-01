/* useThumbnails — the REOPEN freeze (S22, 10-18).
   ─────────────────────────────────────────────────────────────────
   Reopening the app with a reader tab open froze ~3 s while html2canvas drew
   tab thumbnails. Captures now stay off the startup and restore path:
     - none in the boot window, and none for RESTORE_CAPTURE_FLOOR_MS after a
       restore (page back from hidden, a bfcache pageshow);
     - every non-urgent render starts from an idle callback;
     - one render at a time in the whole page (runCaptureRender);
     - none while document.visibilityState is 'hidden' (re-asked on return);
     - a content key that already holds both variants is reused, not redrawn.
   Fake timers throughout; jsdom has no requestIdleCallback, so onIdle's timer
   fallback is what runs unless a test installs one. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const U = (tag) => 'data:image/jpeg;base64,' + tag + 'x'.repeat(1200);
const DARK = U('dark');
const LIGHT = U('light');

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: {
    isAndroid: false,
    takeScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
    takeThemedScreenshot: vi.fn(async () => 'data:image/jpeg;base64,MOCK'),
  },
  captureTargetEl: () => null,
}));
import { PlatformBridge } from '../utils/platform-bridge.js';
import {
  useThumbnails, noteCaptureInteraction, runCaptureRender,
  BOOT_CAPTURE_FLOOR_MS, RESTORE_CAPTURE_FLOOR_MS, _resetCaptureBootGateForTests,
} from './use-thumbnails.js';

const g = /** @type {any} */ (globalThis);
const takeThemedScreenshot = /** @type {import('vitest').Mock} */ (PlatformBridge.takeThemedScreenshot);

let visibility = 'visible';
const setVisibility = async (v) => {
  visibility = v;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
};

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  g.idbReadAll = vi.fn(async () => ({}));
  g.idbPut = vi.fn();
  g.idbDelete = vi.fn();
  g.tabContentKey = (t) => 'key-' + t.id;
  _resetCaptureBootGateForTests(true);
  takeThemedScreenshot.mockReset();
  takeThemedScreenshot.mockImplementation(async (theme) => (theme === 'light' ? LIGHT : DARK));
  noteCaptureInteraction('touch-up', performance.now() - 60000, 0);
  noteCaptureInteraction('mouse-up', performance.now() - 60000);
});

afterEach(() => {
  vi.useRealTimers();
  _resetCaptureBootGateForTests(true);
  delete (/** @type {any} */ (document)).visibilityState; // back to jsdom's own getter
  delete g.requestIdleCallback;
  delete g.cancelIdleCallback;
  ['idbReadAll', 'idbPut', 'idbDelete', 'tabContentKey'].forEach((k) => delete g[k]);
});

const tabA = { id: 'a', screen: 'letter', letterId: 'x' };
const tabB = { id: 'b', screen: 'letter', letterId: 'y' };
const props = (over) => ({
  tabs: [tabA, tabB], activeTabIdx: 0, activeTab: tabA,
  tabsEnabled: true, tabsOverviewOpen: false, theme: 'dark',
  ...over,
});
const onB = (over) => props({ activeTabIdx: 1, activeTab: tabB, ...over });

const flush = async () => act(async () => { await Promise.resolve(); });
// +1 ms: onIdle's timer fallback, scheduled inside a fake-timer tick, lands a tick later.
const advance = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms + 1); }); await flush(); };

describe('useThumbnails — no capture at startup', () => {
  it('a reopen with a reader tab restored renders nothing in the boot window', async () => {
    _resetCaptureBootGateForTests(false);
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(350);
    rerender(onB());                       // the restore's own tab switch
    await advance(BOOT_CAPTURE_FLOOR_MS - 2000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await advance(2000);                   // floor + idle: ONE capture, of the live tab
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });

  it('a reopen whose card is already in IndexedDB draws nothing at all once the window lifts', async () => {
    _resetCaptureBootGateForTests(false);
    g.idbReadAll = vi.fn(async () => ({ 'key-a': { dark: DARK, light: LIGHT } }));
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(BOOT_CAPTURE_FLOOR_MS + 5000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    expect(result.current.tabThumbnails['key-a']).toEqual({ dark: DARK, light: LIGHT });
  });

  it('cache reuse waits for the IDB read: a row still loading is not redrawn', async () => {
    let finishRead;
    g.idbReadAll = vi.fn(() => new Promise((res) => { finishRead = () => res({ 'key-a': { dark: DARK, light: LIGHT } }); }));
    renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(350);                    // after-nav capture: the read is still in flight
    await act(async () => { finishRead(); });
    await advance(2000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
  });

  it('a card holding only one theme is still drawn (both variants are needed)', async () => {
    g.idbReadAll = vi.fn(async () => ({ 'key-a': { dark: DARK } }));
    renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(350);
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
  });

  it('a resize still redraws a cached card (the stored aspect is wrong)', async () => {
    g.idbReadAll = vi.fn(async () => ({ 'key-a': { dark: DARK, light: LIGHT } }));
    renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(2000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    await advance(600);
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
  });
});

describe('useThumbnails — cache reuse is one-shot (first capture after a startup or restore)', () => {
  // Both tabs already have a full card in IndexedDB.
  // Step in slices: a render's promise continuations (which arm the
  // other-theme timer) run between advances, not inside one.
  const settle = async (ms) => { for (let t = 0; t < ms; t += 500) await advance(500); };
  const bothCached = () => vi.fn(async () => ({
    'key-a': { dark: DARK, light: LIGHT },
    'key-b': { dark: DARK, light: LIGHT },
  }));

  it('after the startup reuse, a later capture of a cached page redraws it — no card goes stale', async () => {
    g.idbReadAll = bothCached();
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await settle(4000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();     // the startup capture reused A's card
    rerender(onB());                                          // B is cached too, but the reuse is spent
    await settle(4000);
    expect(takeThemedScreenshot.mock.calls.map((c) => c[0])).toEqual(['dark', 'light']);
    takeThemedScreenshot.mockClear();
    rerender(props());                                        // back to A: its content may have changed since
    await settle(4000);
    expect(takeThemedScreenshot.mock.calls.map((c) => c[0])).toEqual(['dark', 'light']);
  });

  it('a restore re-arms the reuse for its first capture only', async () => {
    g.idbReadAll = bothCached();
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await settle(4000);                                      // startup capture: reused
    rerender(onB());
    await settle(4000);                                      // B redrawn
    takeThemedScreenshot.mockClear();
    await setVisibility('hidden');
    await setVisibility('visible');                           // a restore
    rerender(props());
    await settle(RESTORE_CAPTURE_FLOOR_MS + 2000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();     // first capture after the restore: reused
    rerender(onB());
    await settle(4000);
    expect(takeThemedScreenshot.mock.calls.map((c) => c[0])).toEqual(['dark', 'light']); // the next one redraws
  });

  it('a first capture that cannot reuse (urgent overview heal) still spends the reuse', async () => {
    g.idbReadAll = bothCached();
    const { result, rerender } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await flush();
    await act(async () => { await result.current.captureActiveTabThumbnail({ urgent: true }); });
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);   // urgent: always drawn
    takeThemedScreenshot.mockClear();
    rerender(onB());
    await settle(4000);
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90); // no reuse left for B
  });
});

describe('useThumbnails — no capture right after a restore', () => {
  it('back from hidden: a navigation in the first seconds waits out RESTORE_CAPTURE_FLOOR_MS', async () => {
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(2000);                   // tab A captured (dark + light)
    takeThemedScreenshot.mockClear();
    await setVisibility('hidden');
    await setVisibility('visible');        // the APK reopened from recents
    rerender(onB());
    await advance(RESTORE_CAPTURE_FLOOR_MS - 1000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await advance(1500);              // floor + its idle moment
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
    expect(takeThemedScreenshot).toHaveBeenCalledWith('dark', 1440, 90);
  });

  it('a bfcache pageshow is a restore too', async () => {
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(2000);
    takeThemedScreenshot.mockClear();
    await act(async () => {
      const e = new Event('pageshow');
      Object.defineProperty(e, 'persisted', { value: true });
      window.dispatchEvent(e);
    });
    rerender(onB());
    await advance(RESTORE_CAPTURE_FLOOR_MS - 1000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await advance(1500);              // floor + its idle moment
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });

  it('a restore during the boot window extends it, never shortens it', async () => {
    _resetCaptureBootGateForTests(false);
    renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(BOOT_CAPTURE_FLOOR_MS - 1000);
    await setVisibility('hidden');
    await setVisibility('visible');        // now + RESTORE > the boot floor
    await advance(1500);                   // the boot floor alone would have lifted here
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await advance(RESTORE_CAPTURE_FLOOR_MS);
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });
});

describe('useThumbnails — hidden pages skip captures', () => {
  it('a capture due while hidden does not render; the return asks again, after the restore window', async () => {
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(2000);
    takeThemedScreenshot.mockClear();
    rerender(onB());
    await setVisibility('hidden');
    await advance(5000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await setVisibility('visible');
    await advance(RESTORE_CAPTURE_FLOOR_MS - 1000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    await advance(1500);              // floor + its idle moment
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });

  it('the pending other-theme render is dropped when the page goes hidden', async () => {
    renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(350);                    // primary (dark)
    await setVisibility('hidden');
    await advance(3000);
    expect(takeThemedScreenshot.mock.calls.map((c) => c[0])).toEqual(['dark']);
  });

  it('even an urgent capture skips a hidden page', async () => {
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await setVisibility('hidden');
    await act(async () => { await result.current.captureActiveTabThumbnail({ urgent: true }); });
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
  });
});

describe('useThumbnails — one capture at a time', () => {
  it('a new primary waits for the other-theme render already running', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    /** @type {Array<() => void>} */
    const finishers = [];
    takeThemedScreenshot.mockImplementation((theme) => {
      inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((res) => finishers.push(() => { inFlight -= 1; res(theme === 'light' ? LIGHT : DARK); }));
    });
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(350);                               // A dark starts
    await act(async () => { finishers.shift()(); });
    await flush();
    await advance(900);                               // A light starts — held
    expect(takeThemedScreenshot.mock.calls.map((c) => c[0])).toEqual(['dark', 'light']);
    rerender(onB());
    await advance(2000);                              // B's primary is queued, not started
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(2);
    await act(async () => { finishers.shift()(); });  // A light ends → B dark starts
    await flush();
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(3);
    await act(async () => { finishers.shift()(); });
    await flush();
    expect(maxInFlight).toBe(1);
  });

  it('two hook instances never render at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    /** @type {Array<() => void>} */
    const finishers = [];
    takeThemedScreenshot.mockImplementation(() => {
      inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((res) => finishers.push(() => { inFlight -= 1; res(DARK); }));
    });
    renderHook((p) => useThumbnails(p), { initialProps: props() });
    renderHook((p) => useThumbnails(p), { initialProps: onB() });
    await advance(350);
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
    await act(async () => { finishers.shift()(); });
    await flush();
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(2);
    await act(async () => { finishers.shift()(); });
    await flush();
    expect(maxInFlight).toBe(1);
  });

  it('a Garden shot queued behind a render does not run once the overview opened meanwhile', async () => {
    // Garden's native shot photographs the real screen, overlay included: the
    // overview check has to hold when the queued render STARTS, not only when
    // it was asked for.
    const takeScreenshot = /** @type {import('vitest').Mock} */ (PlatformBridge.takeScreenshot);
    takeScreenshot.mockReset();
    takeScreenshot.mockImplementation(async () => DARK);
    /** @type {Array<() => void>} */
    const finishers = [];
    takeThemedScreenshot.mockImplementation((theme) => new Promise((res) => finishers.push(() => res(theme === 'light' ? LIGHT : DARK))));
    const garden = { id: 'g', screen: 'garden-view', gardenPage: 2 };
    const onGarden = (over) => props({ tabs: [tabA, garden], activeTabIdx: 1, activeTab: garden, ...over });
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: props({ tabs: [tabA, garden] }) });
    await advance(350);                               // A dark starts
    await act(async () => { finishers.shift()(); });
    await flush();
    await advance(900);                               // A light starts — held
    rerender(onGarden());
    await advance(2000);                              // the Garden shot is queued behind it
    expect(takeScreenshot).not.toHaveBeenCalled();
    rerender(onGarden({ tabsOverviewOpen: true }));   // the reader opens the overview
    await flush();
    await act(async () => { finishers.shift()(); });  // A light ends
    await flush();
    expect(takeScreenshot).not.toHaveBeenCalled();
    rerender(onGarden({ tabsOverviewOpen: false }));  // closed again: the shot is taken then
    await advance(2000);
    expect(takeScreenshot).toHaveBeenCalledTimes(1);
  });

  it('runCaptureRender runs tasks strictly in order and survives a throwing task', async () => {
    const order = [];
    const a = runCaptureRender(async () => { order.push('a'); throw new Error('boom'); });
    const b = runCaptureRender(() => { order.push('b'); return 'B'; });
    await expect(a).rejects.toThrow('boom');
    await expect(b).resolves.toBe('B');
    expect(order).toEqual(['a', 'b']);
  });
});

describe('useThumbnails — idle placement', () => {
  it('a non-urgent capture waits for requestIdleCallback where it exists', async () => {
    /** @type {Array<() => void>} */
    const idle = [];
    g.requestIdleCallback = vi.fn((cb) => { idle.push(cb); return idle.length; });
    g.cancelIdleCallback = vi.fn();
    renderHook((p) => useThumbnails(p), { initialProps: props() });
    await advance(5000);
    expect(takeThemedScreenshot).not.toHaveBeenCalled();
    expect(g.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: expect.any(Number) });
    await act(async () => { idle.shift()(); });
    await flush();
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });

  it('an urgent capture (the Tabs overview) does not wait for idle', async () => {
    g.requestIdleCallback = vi.fn(() => 1);
    g.cancelIdleCallback = vi.fn();
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: props() });
    await act(async () => { await result.current.captureActiveTabThumbnail({ urgent: true }); });
    expect(takeThemedScreenshot).toHaveBeenCalledTimes(1);
  });
});
