/* useRailMode — the one switch for the desktop companion rail. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRailMode, RAIL_MIN_WIDTH_PX } from './use-rail-mode.js';

afterEach(() => { vi.unstubAllGlobals(); });

function stubMatchMedia(matches) {
  const listeners = new Set();
  const mql = {
    matches,
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return { mql, fire: () => listeners.forEach((fn) => fn()) };
}

describe('useRailMode', () => {
  it('pins the threshold the app.css @media block must match (1640)', () => {
    expect(RAIL_MIN_WIDTH_PX).toBe(1640);
  });

  it('false without matchMedia (jsdom default) — phones/tests keep bottom sheets', () => {
    const { result } = renderHook(() => useRailMode());
    expect(result.current).toBe(false);
  });

  it('true on a wide viewport; reacts to resize', () => {
    const { mql, fire } = stubMatchMedia(true);
    const { result } = renderHook(() => useRailMode());
    expect(result.current).toBe(true);
    mql.matches = false;
    act(() => fire());
    expect(result.current).toBe(false);
  });
});
