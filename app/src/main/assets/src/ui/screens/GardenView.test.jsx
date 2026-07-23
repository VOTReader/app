// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* GardenView tests — UX4 swipe decision + the durable page memory.
   ──────────────────────────────────────
   The swipe DECISION is pinned directly (threshold + direction). The
   GardenPosStore heal/record wiring is pinned at the component level
   with the ~8 free globals stubbed — that's the behavior that closes
   the owner's "lost my place overnight" report, so it gets real
   render coverage, not just a unit.
*/

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import { computeAccessibleName } from 'dom-accessibility-api';
import { gardenSwipeDir, GardenView } from './GardenView.jsx';

const GLOBALS = [
  'PlatformBridge', 'gardenTierLimits', 'gardenIsCached', 'gardenPreload',
  'gardenCrawled', 'gardenCacheKey', 'gardenUrl', 'GARDEN_TOTAL', 'GardenPosStore',
  'gardenImageCache',
];

function setupGardenGlobals(posStore) {
  globalThis.PlatformBridge = { setImmersiveMode: () => {}, getNetworkInfo: () => ({ metered: false, slow: false }) };
  globalThis.gardenTierLimits = () => ({ ahead: 0, lru: 5 });
  globalThis.gardenIsCached = () => true;
  globalThis.gardenPreload = () => {};
  globalThis.gardenCrawled = new Set();
  globalThis.gardenImageCache = {};
  globalThis.gardenCacheKey = (p, t) => `${t}:${p}`;
  globalThis.gardenUrl = (p) => `https://example.test/${p}.jpg`;
  globalThis.GARDEN_TOTAL = 209;
  globalThis.GardenPosStore = posStore;
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const mkPos = (over = {}) => ({
  getState: () => 'loaded',
  get: () => 0,
  set: vi.fn(),
  subscribe: () => () => {},
  ...over,
});

const renderGarden = (props = {}) => render(
  <GardenView page={1} onPageChange={() => {}} onBack={() => {}} theme="dark" onThemeChange={() => {}} tier="std" {...props} />,
);

describe('gardenSwipeDir — UX4 horizontal swipe', () => {
  it('flips forward (+1) on a clear leftward drag', () => {
    expect(gardenSwipeDir(-80, 5)).toBe(1);
  });
  it('flips back (-1) on a clear rightward drag', () => {
    expect(gardenSwipeDir(80, -5)).toBe(-1);
  });
  it('ignores a tap (no movement)', () => {
    expect(gardenSwipeDir(0, 0)).toBe(0);
  });
  it('ignores a short horizontal nudge below the threshold', () => {
    expect(gardenSwipeDir(40, 0)).toBe(0);
  });
  it('ignores a mostly-vertical drag (scroll, not a page flip)', () => {
    expect(gardenSwipeDir(-80, 70)).toBe(0);
  });
  it('honors the boundary: 60px exactly is not enough (strict >)', () => {
    expect(gardenSwipeDir(-60, 0)).toBe(0);
    expect(gardenSwipeDir(-61, 0)).toBe(1);
  });
  it('honors the dy ceiling: 45px exactly is too much (strict <)', () => {
    expect(gardenSwipeDir(80, 45)).toBe(0);
    expect(gardenSwipeDir(80, 44)).toBe(-1);
  });
});

describe('GardenView — durable page memory (GardenPosStore)', () => {
  it('heals a default page-1 mount to the remembered page once the store is loaded', () => {
    const pos = mkPos({ get: () => 57 });
    setupGardenGlobals(pos);
    const onPageChange = vi.fn();
    renderGarden({ page: 1, onPageChange });
    expect(onPageChange).toHaveBeenCalledWith(57);
  });

  it('does NOT heal when the tab restored a real page (page !== 1)', () => {
    const pos = mkPos({ get: () => 120 });
    setupGardenGlobals(pos);
    const onPageChange = vi.fn();
    renderGarden({ page: 57, onPageChange });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('does NOT heal when nothing was ever remembered (lastPage <= 1)', () => {
    const pos = mkPos({ get: () => 0 });
    setupGardenGlobals(pos);
    const onPageChange = vi.fn();
    renderGarden({ page: 1, onPageChange });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('waits for hydration: a pending store heals when it transitions to loaded', () => {
    let state = 'pending';
    let notify = null;
    const pos = mkPos({
      getState: () => state,
      get: () => 88,
      subscribe: (cb) => { notify = cb; return () => { notify = null; }; },
    });
    setupGardenGlobals(pos);
    const onPageChange = vi.fn();
    renderGarden({ page: 1, onPageChange });
    expect(onPageChange).not.toHaveBeenCalled();
    act(() => { state = 'loaded'; if (notify) notify(); });
    expect(onPageChange).toHaveBeenCalledWith(88);
  });

  it('records page CHANGES write-through, but never the mount value', () => {
    const pos = mkPos({ get: () => 0 });
    setupGardenGlobals(pos);
    const { rerender } = renderGarden({ page: 1 });
    expect(pos.set).not.toHaveBeenCalled(); // mount value not recorded
    rerender(
      <GardenView page={2} onPageChange={() => {}} onBack={() => {}} theme="dark" onThemeChange={() => {}} tier="std" />,
    );
    expect(pos.set).toHaveBeenCalledWith(2);
  });

  it('survives a missing GardenPosStore global (bare hosts)', () => {
    setupGardenGlobals(undefined);
    delete globalThis.GardenPosStore;
    expect(() => renderGarden({ page: 1 })).not.toThrow();
  });
});

describe('GardenView — image failure retry (Wave 0)', () => {
  // The Garden is the app's ONE network feature: a failed page used to
  // dead-end on "Failed to load" with no way back short of leaving the
  // screen. The error surface must offer a retry, mirroring the StudiesHome
  // "Try again" pill convention.
  const failCurrentPage = () => fireEvent.error(document.querySelector('.garden-page-img'));

  it('a failed page surfaces "Try again" instead of dead-ending', () => {
    setupGardenGlobals(mkPos());
    renderGarden({ page: 5 });
    failCurrentPage();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('Try again evicts the stale failed preload and re-requests the image', () => {
    setupGardenGlobals(mkPos());
    // A stale FAILED preload entry: gardenPreload no-ops while it lingers,
    // so retry must drop it for the crawl/preload path to ever re-fetch.
    globalThis.gardenImageCache['std:5'] = { complete: false, naturalWidth: 0 };
    renderGarden({ page: 5 });
    failCurrentPage();
    const before = document.querySelector('.garden-page-img');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(globalThis.gardenImageCache['std:5']).toBeUndefined();
    const after = document.querySelector('.garden-page-img');
    expect(after).not.toBe(before); // remounted via key → fresh request for the same URL
    expect(screen.queryByText(/Failed to load/)).toBeNull();
    expect(screen.getByText('Loading page 5...')).toBeTruthy();
  });

  it('a failure AFTER a retry re-surfaces the retry affordance (no one-shot)', () => {
    setupGardenGlobals(mkPos());
    renderGarden({ page: 5 });
    failCurrentPage();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    failCurrentPage();
    expect(screen.getByText(/Failed to load/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('GardenView — accessible names (Wave 0)', () => {
  it('every icon-only button has an accessible name', () => {
    setupGardenGlobals(mkPos());
    renderGarden({ page: 5 });
    // The three svg-only buttons, pinned by their exact names…
    screen.getByRole('button', { name: 'Back' });
    screen.getByRole('button', { name: 'Previous page' });
    screen.getByRole('button', { name: 'Next page' });
    // …and the sweep: NO nameless button anywhere on the screen.
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(computeAccessibleName(btn).trim()).not.toBe('');
    }
  });

  it('the jump-to-page number input is labeled', () => {
    setupGardenGlobals(mkPos());
    renderGarden({ page: 5 });
    fireEvent.click(screen.getByRole('button', { name: '5 / 209' }));
    expect(screen.getByRole('spinbutton', { name: 'Jump to page' })).toBeTruthy();
  });
});
