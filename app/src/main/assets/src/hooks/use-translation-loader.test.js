/* useTranslationLoader — the active edition's lazy load, and the sweep of the ones left behind.
   ─────────────────────────────────────────────────────────────────────────
   RED 2026-09-11 (settings-builder, w-evict-hook). boot-performance-4-evict inlined this effect
   into App() and app.jsx read 809/800 on check:app-size. Extracted into a hook, the CALLER becomes
   drivable — the branch's own text gate on app.jsx existed because "mounting App in jsdom is not
   on offer"; a hook needs no App. The two helpers are bundle-d globals (published by _entry-d.js)
   and are read by bare name here, so the test installs spies on globalThis for them. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTranslationLoader } from './use-translation-loader.js';

let resolveLoad;
beforeEach(() => {
  /** @type {any} */ (globalThis).loadTranslation = vi.fn(() => new Promise((r) => { resolveLoad = r; }));
  /** @type {any} */ (globalThis).releaseTranslationsExcept = vi.fn();
});
afterEach(() => {
  delete /** @type {any} */ (globalThis).loadTranslation;
  delete /** @type {any} */ (globalThis).releaseTranslationsExcept;
});

const g = () => /** @type {any} */ (globalThis);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('useTranslationLoader', () => {
  it('nkjv: sweeps every other edition at once and loads nothing (the arm that used to return early)', () => {
    const tick = vi.fn();
    renderHook(() => useTranslationLoader('nkjv', tick));
    expect(g().releaseTranslationsExcept).toHaveBeenCalledWith('nkjv');
    expect(g().loadTranslation).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
  });

  it('an absent translation means nkjv', () => {
    renderHook(() => useTranslationLoader(undefined, vi.fn()));
    expect(g().releaseTranslationsExcept).toHaveBeenCalledWith('nkjv');
    expect(g().loadTranslation).not.toHaveBeenCalled();
  });

  it('an alt edition: loads it, and sweeps the others only AFTER the load resolves, then re-renders', async () => {
    const tick = vi.fn();
    renderHook(() => useTranslationLoader('kjv', tick));
    expect(g().loadTranslation).toHaveBeenCalledWith('kjv');
    // Before the load resolves: nothing swept — a reader switching between two alt editions must
    // not be left on NKJV for the length of the download.
    expect(g().releaseTranslationsExcept).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
    resolveLoad();
    await flush();
    expect(g().releaseTranslationsExcept).toHaveBeenCalledWith('kjv');
    expect(tick).toHaveBeenCalledTimes(1);
    expect(typeof tick.mock.calls[0][0]).toBe('function');
    expect(tick.mock.calls[0][0](3)).toBe(4);      // the functional increment App() relies on
  });

  it('runs on the translation, not on every render', async () => {
    const tick = vi.fn();
    const { rerender } = renderHook(({ t }) => useTranslationLoader(t, tick), { initialProps: { t: 'kjv' } });
    rerender({ t: 'kjv' });
    expect(g().loadTranslation).toHaveBeenCalledTimes(1);
    rerender({ t: 'web' });
    expect(g().loadTranslation).toHaveBeenCalledTimes(2);
    expect(g().loadTranslation).toHaveBeenLastCalledWith('web');
  });
});

/* W25 (sweep 10-13): the load's callback had no liveness flag and swept against the
   edition IT loaded. Picking ASV, then WEB, with WEB landing first: ASV's late
   callback ran releaseTranslationsExcept('asv') and freed BIBLE_WEB, so the reader
   saw NKJV under WEB's label until they reselected. A callback now sweeps against
   the CURRENT selection, and only the live one re-renders. */
describe('useTranslationLoader — a late load never frees the edition picked after it (W25)', () => {
  function deferredLoads() {
    const pending = {};
    g().loadTranslation = vi.fn((code) => new Promise((r) => { pending[code] = r; }));
    return pending;
  }

  it('ASV then WEB, WEB lands first: ASV landing late sweeps against WEB, not ASV', async () => {
    const pending = deferredLoads();
    const tick = vi.fn();
    const { rerender } = renderHook(({ t }) => useTranslationLoader(t, tick), { initialProps: { t: 'asv' } });
    rerender({ t: 'web' });
    pending.web(); await flush();
    pending.asv(); await flush();
    const swept = g().releaseTranslationsExcept.mock.calls.map((c) => c[0]);
    expect(swept).not.toContain('asv');
    expect(swept[swept.length - 1]).toBe('web');
    expect(tick).toHaveBeenCalledTimes(1);                 // only the live load re-renders
  });

  it('a load that lands after a switch back to NKJV is swept, not kept', async () => {
    const pending = deferredLoads();
    const { rerender } = renderHook(({ t }) => useTranslationLoader(t, vi.fn()), { initialProps: { t: 'asv' } });
    rerender({ t: 'nkjv' });
    pending.asv(); await flush();
    const swept = g().releaseTranslationsExcept.mock.calls.map((c) => c[0]);
    expect(swept).toEqual(['nkjv', 'nkjv']);                // the late ASV is freed against NKJV
  });

  it('after unmount a late load still sweeps against the last selection and re-renders nothing', async () => {
    const pending = deferredLoads();
    const tick = vi.fn();
    const { unmount } = renderHook(() => useTranslationLoader('asv', tick));
    unmount();
    pending.asv(); await flush();
    expect(tick).not.toHaveBeenCalled();
  });
});
