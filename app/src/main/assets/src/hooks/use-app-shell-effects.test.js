/* P7k — useAppShellEffects tests. Final Phase 1 concern. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppShellEffects } from './use-app-shell-effects.js';
import { WelcomedFlagStore, AboutSeenFlagStore } from '../stores/app-flag-stores.js';

beforeEach(() => {
  localStorage.clear();
  // W2.3b: WelcomedFlagStore + AboutSeenFlagStore are now IDB-backed.
  // Reset their state machine so each test starts with empty cache
  // and 'loaded' state (forceLoaded skips the async hydration path).
  WelcomedFlagStore._resetForTests({ forceLoaded: true });
  AboutSeenFlagStore._resetForTests({ forceLoaded: true });
});

afterEach(() => {
  // U21: drop any per-test navigator.onLine shadow → prototype getter (true).
  try { delete (/** @type {any} */ (navigator)).onLine; } catch (_e) { /* non-own */ }
});

// Shadow navigator.onLine's prototype getter with an own property for the test.
function setOnLine(v) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });
}

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

describe('useAppShellEffects — isOnline (U21: navigator.onLine, zero egress)', () => {
  it('initializes from navigator.onLine (online)', () => {
    setOnLine(true);
    const { result } = renderHook(() => useAppShellEffects(baseProps()));
    expect(result.current.isOnline).toBe(true);
  });

  it('reflects offline', () => {
    setOnLine(false);
    const { result } = renderHook(() => useAppShellEffects(baseProps()));
    expect(result.current.isOnline).toBe(false);
  });

  it('updates live on offline / online events', () => {
    setOnLine(true);
    const { result } = renderHook(() => useAppShellEffects(baseProps()));
    expect(result.current.isOnline).toBe(true);
    act(() => { setOnLine(false); window.dispatchEvent(new window.Event('offline')); });
    expect(result.current.isOnline).toBe(false);
    act(() => { setOnLine(true); window.dispatchEvent(new window.Event('online')); });
    expect(result.current.isOnline).toBe(true);
  });

  it('makes NO network request (no external connectivity ping)', () => {
    const fetchSpy = vi.spyOn(window, 'fetch');
    renderHook(() => useAppShellEffects(baseProps()));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
