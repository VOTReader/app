/* P7k — useAppShellEffects tests. Final Phase 1 concern. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppShellEffects } from './use-app-shell-effects.js';

let _prevFetch;

beforeEach(() => {
  localStorage.clear();
  delete window.__bumpHlTick;
  _prevFetch = window.fetch;
  // Default: online (favicon fetch resolves). Cast through `any` —
  // the production code uses `mode: 'no-cors'` so the response is
  // opaque; a stub doesn't need real Response shape.
  window.fetch = /** @type {any} */ (vi.fn(() => Promise.resolve({})));
});

afterEach(() => {
  window.fetch = _prevFetch;
  delete window.__bumpHlTick;
});

const baseProps = () => ({
  setHlTick: vi.fn(),
  setNavOrigin: vi.fn(),
  setScreen: vi.fn(),
});

describe('useAppShellEffects — __bumpHlTick bridge', () => {
  it('binds window.__bumpHlTick to a setHlTick incrementer', () => {
    const props = baseProps();
    renderHook(() => useAppShellEffects(props));
    expect(typeof window.__bumpHlTick).toBe('function');
    window.__bumpHlTick();
    expect(props.setHlTick).toHaveBeenCalledTimes(1);
    const updater = props.setHlTick.mock.calls[0][0];
    expect(updater(7)).toBe(8);
  });
});

describe('useAppShellEffects — showWelcome init', () => {
  it('defaults true when vot-welcomed is absent', () => {
    const { result } = renderHook(() => useAppShellEffects(baseProps()));
    expect(result.current.showWelcome).toBe(true);
  });

  it('initializes false when vot-welcomed is set', () => {
    localStorage.setItem('vot-welcomed', '1');
    const { result } = renderHook(() => useAppShellEffects(baseProps()));
    expect(result.current.showWelcome).toBe(false);
  });
});

describe('useAppShellEffects — dismissWelcome', () => {
  it('writes vot-welcomed + clears showWelcome', () => {
    const { result } = renderHook(() => useAppShellEffects(baseProps()));
    act(() => { result.current.dismissWelcome(); });
    expect(localStorage.getItem('vot-welcomed')).toBe('1');
    expect(result.current.showWelcome).toBe(false);
  });

  it('first-run: redirects to About when vot-about-seen is absent', () => {
    const props = baseProps();
    const { result } = renderHook(() => useAppShellEffects(props));
    act(() => { result.current.dismissWelcome(); });
    expect(props.setNavOrigin).toHaveBeenCalledWith(expect.objectContaining({ screen: 'home' }));
    expect(props.setScreen).toHaveBeenCalledWith('about');
  });

  it('subsequent run: skips About redirect when vot-about-seen is set', () => {
    localStorage.setItem('vot-about-seen', '1');
    const props = baseProps();
    const { result } = renderHook(() => useAppShellEffects(props));
    act(() => { result.current.dismissWelcome(); });
    expect(props.setNavOrigin).not.toHaveBeenCalled();
    expect(props.setScreen).not.toHaveBeenCalled();
  });
});
