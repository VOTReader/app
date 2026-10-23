// @ts-nocheck — document.fullscreenElement / visibilityState and the React global are stubbed per test
// The browser's fullscreen exit is the way out of the web (the hub's seam walk F4, 2026-10-22):
// Chrome on a phone spends the first Back on leaving fullscreen, and the web stayed up in a
// cramped strip under the browser's bars.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as React from 'react';
import { useForcedLandscape, EXIT_SETTLE_MS } from './use-forced-landscape.js';

let full = null;
let shown = 'visible';
const set = (el) => { full = el; document.dispatchEvent(new Event('fullscreenchange')); };

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.React = React;
  full = null; shown = 'visible';
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => full });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => shown });
});
afterEach(() => {
  vi.useRealTimers();
  delete document.fullscreenElement;
  delete document.visibilityState;
});

const mount = () => {
  const onLeave = vi.fn();
  const hook = renderHook(() => useForcedLandscape(() => {}, onLeave));
  return { onLeave, ...hook };
};

describe('useForcedLandscape: the browser leaving fullscreen leaves the web', () => {
  it('an exit after the web went fullscreen leaves, once the page is seen still shown', () => {
    const { onLeave } = mount();
    set(document.documentElement);
    set(null);
    expect(onLeave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(EXIT_SETTLE_MS);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('leaving the app (the page hidden) is not leaving the web', () => {
    const { onLeave } = mount();
    set(document.documentElement);
    set(null);
    shown = 'hidden';
    vi.advanceTimersByTime(EXIT_SETTLE_MS);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('a change that is not an exit (fullscreen refused, or only entered) does nothing', () => {
    const { onLeave } = mount();
    set(null);
    vi.advanceTimersByTime(EXIT_SETTLE_MS);
    set(document.documentElement);
    vi.advanceTimersByTime(EXIT_SETTLE_MS);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('the web going away first (its own Back ends fullscreen on unmount) fires nothing', () => {
    const { onLeave, unmount } = mount();
    set(document.documentElement);
    unmount();
    set(null);
    vi.advanceTimersByTime(EXIT_SETTLE_MS);
    expect(onLeave).not.toHaveBeenCalled();
  });
});
