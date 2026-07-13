/* useThumbnails — thumbnail theme metadata + theme-change recapture.
   ─────────────────────────────────────────────────────────────────
   Owner-reported: after switching theme, the Tabs overview showed a mixed
   wall of dark and light cards (each thumbnail keeps the theme it was
   captured under; native PixelCopy can only capture what's on screen, so
   background tabs can't be re-shot). The fix records the capture theme on
   every entry ({url, theme}) so the overview can theme-normalize mismatched
   cards at render time, and re-captures the ACTIVE tab when the theme
   changes so filtered cards self-heal to true pixels. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: { takeScreenshot: vi.fn(async () => 'data:image/jpeg;base64,SHOT') },
}));
import { PlatformBridge } from '../utils/platform-bridge.js';
import { useThumbnails } from './use-thumbnails.js';

const g = /** @type {any} */ (globalThis);
const takeScreenshot = /** @type {import('vitest').Mock} */ (PlatformBridge.takeScreenshot);

beforeEach(() => {
  vi.useFakeTimers();
  g.idbReadAll = vi.fn(async () => ({}));
  g.idbPut = vi.fn();
  g.idbDelete = vi.fn();
  g.tabContentKey = (t) => 'key-' + (t.id || 'a');
  g.__scrollEl = null;
  takeScreenshot.mockClear();
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

describe('useThumbnails — theme metadata', () => {
  it('normalizes legacy bare-string IDB rows to {url, theme:null} on load', async () => {
    g.idbReadAll = vi.fn(async () => ({ k1: 'data:legacy', k2: { url: 'data:new', theme: 'light' } }));
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps() });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.tabThumbnails).toEqual({
      k1: { url: 'data:legacy', theme: null },
      k2: { url: 'data:new', theme: 'light' },
    });
  });

  it('a capture stores {url, theme} in state and writes it through to IDB', async () => {
    const { result } = renderHook((p) => useThumbnails(p), { initialProps: hookProps({ theme: 'light' }) });
    await act(async () => { vi.advanceTimersByTime(350); }); // after-nav capture fires
    await act(async () => { await Promise.resolve(); });     // async capture settles
    expect(takeScreenshot).toHaveBeenCalled();
    expect(g.idbPut).toHaveBeenCalledWith('key-a', { url: 'data:image/jpeg;base64,SHOT', theme: 'light' });
    expect(result.current.tabThumbnails['key-a']).toEqual({ url: 'data:image/jpeg;base64,SHOT', theme: 'light' });
  });

  it('a THEME change alone re-captures the active tab (filtered cards self-heal)', async () => {
    const { rerender } = renderHook((p) => useThumbnails(p), { initialProps: hookProps({ theme: 'dark' }) });
    await act(async () => { vi.advanceTimersByTime(350); });
    await act(async () => { await Promise.resolve(); });
    const callsAfterMount = takeScreenshot.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);
    expect(g.idbPut).toHaveBeenLastCalledWith('key-a', expect.objectContaining({ theme: 'dark' }));
    rerender(hookProps({ theme: 'light' }));
    await act(async () => { vi.advanceTimersByTime(350); });
    await act(async () => { await Promise.resolve(); });
    expect(takeScreenshot.mock.calls.length).toBe(callsAfterMount + 1);
    expect(g.idbPut).toHaveBeenLastCalledWith('key-a', expect.objectContaining({ theme: 'light' }));
  });
});
