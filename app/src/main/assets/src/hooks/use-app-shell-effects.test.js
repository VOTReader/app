/* P7k — useAppShellEffects tests. */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppShellEffects } from './use-app-shell-effects.js';

afterEach(() => {
  // U21: drop any per-test navigator.onLine shadow → prototype getter (true).
  try { delete (/** @type {any} */ (navigator)).onLine; } catch (_e) { /* non-own */ }
});

function setOnLine(v) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });
}

describe('useAppShellEffects — isOnline (U21: navigator.onLine, zero egress)', () => {
  it('initializes from navigator.onLine (online)', () => {
    setOnLine(true);
    const { result } = renderHook(() => useAppShellEffects());
    expect(result.current.isOnline).toBe(true);
  });

  it('reflects offline', () => {
    setOnLine(false);
    const { result } = renderHook(() => useAppShellEffects());
    expect(result.current.isOnline).toBe(false);
  });

  it('updates live on offline / online events', () => {
    setOnLine(true);
    const { result } = renderHook(() => useAppShellEffects());
    expect(result.current.isOnline).toBe(true);
    act(() => { setOnLine(false); window.dispatchEvent(new window.Event('offline')); });
    expect(result.current.isOnline).toBe(false);
    act(() => { setOnLine(true); window.dispatchEvent(new window.Event('online')); });
    expect(result.current.isOnline).toBe(true);
  });

  it('makes NO network request (no external connectivity ping)', () => {
    const fetchSpy = vi.spyOn(window, 'fetch');
    renderHook(() => useAppShellEffects());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
