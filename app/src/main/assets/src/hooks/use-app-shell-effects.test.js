/* P7k — useAppShellEffects tests. Final Phase 1 concern. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppShellEffects } from './use-app-shell-effects.js';
import { WelcomedFlagStore, AboutSeenFlagStore } from '../stores/app-flag-stores.js';

let _prevFetch;

beforeEach(() => {
  localStorage.clear();
  // W2.3b: WelcomedFlagStore + AboutSeenFlagStore are now IDB-backed.
  // Reset their state machine so each test starts with empty cache
  // and 'loaded' state (forceLoaded skips the async hydration path).
  WelcomedFlagStore._resetForTests({ forceLoaded: true });
  AboutSeenFlagStore._resetForTests({ forceLoaded: true });
  _prevFetch = window.fetch;
  // Default: online (favicon fetch resolves). Cast through `any` —
  // the production code uses `mode: 'no-cors'` so the response is
  // opaque; a stub doesn't need real Response shape.
  window.fetch = /** @type {any} */ (vi.fn(() => Promise.resolve({})));
});

afterEach(() => {
  window.fetch = _prevFetch;
});

const baseProps = () => ({
  setNavOrigin: vi.fn(),
  setScreen: vi.fn(),
});

describe('useAppShellEffects — showWelcome init', () => {
  it('defaults true when vot-welcomed is absent', () => {
    const { result } = renderHook(() => useAppShellEffects(baseProps()));
    expect(result.current.showWelcome).toBe(true);
  });

  it('initializes false when WelcomedFlagStore.is() is true', () => {
    WelcomedFlagStore._cache = /** @type {any} */ (true);
    const { result } = renderHook(() => useAppShellEffects(baseProps()));
    expect(result.current.showWelcome).toBe(false);
  });
});

describe('useAppShellEffects — dismissWelcome', () => {
  it('records welcomed flag + clears showWelcome', () => {
    const { result } = renderHook(() => useAppShellEffects(baseProps()));
    act(() => { result.current.dismissWelcome(); });
    expect(WelcomedFlagStore.is()).toBe(true);
    expect(result.current.showWelcome).toBe(false);
  });

  it('first-run: redirects to About when vot-about-seen is absent', () => {
    const props = baseProps();
    const { result } = renderHook(() => useAppShellEffects(props));
    act(() => { result.current.dismissWelcome(); });
    expect(props.setNavOrigin).toHaveBeenCalledWith(expect.objectContaining({ screen: 'home' }));
    expect(props.setScreen).toHaveBeenCalledWith('about');
  });

  it('subsequent run: skips About redirect when AboutSeenFlagStore.is() is true', () => {
    AboutSeenFlagStore._cache = /** @type {any} */ (true);
    const props = baseProps();
    const { result } = renderHook(() => useAppShellEffects(props));
    act(() => { result.current.dismissWelcome(); });
    expect(props.setNavOrigin).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });
});
