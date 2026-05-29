/* P11 — useKeyboardInset tests. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardInset } from './use-keyboard-inset.js';

let _origVV;

function setVV(value) {
  Object.defineProperty(window, 'visualViewport', { value, configurable: true });
}

function mockVV(height) {
  const listeners = {};
  const vv = {
    height,
    addEventListener: (ev, cb) => { (listeners[ev] = listeners[ev] || []).push(cb); },
    removeEventListener: (ev, cb) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== cb); },
    _fire: (ev) => (listeners[ev] || []).forEach((f) => f()),
    _listeners: listeners,
  };
  setVV(vv);
  return vv;
}

const kh = () => document.documentElement.style.getPropertyValue('--keyboard-height');

beforeEach(() => {
  _origVV = window.visualViewport;
  window.innerHeight = 800;
  document.documentElement.style.removeProperty('--keyboard-height');
});

afterEach(() => {
  setVV(_origVV);
  document.documentElement.style.removeProperty('--keyboard-height');
});

describe('useKeyboardInset', () => {
  it('no-ops (no throw, no var) when visualViewport is unavailable', () => {
    setVV(undefined);
    renderHook(() => useKeyboardInset());
    expect(kh()).toBe('');
  });

  it('sets --keyboard-height to 0px when the keyboard is closed', () => {
    mockVV(800); // no diff
    renderHook(() => useKeyboardInset());
    expect(kh()).toBe('0px');
  });

  it('reflects keyboard height on a resize that exceeds the 80px clamp', () => {
    const vv = mockVV(800);
    renderHook(() => useKeyboardInset());
    vv.height = 500; // keyboard opened → diff 300
    vv._fire('resize');
    expect(kh()).toBe('300px');
  });

  it('clamps a sub-80px residual diff to 0', () => {
    mockVV(770); // diff 30 < 80
    renderHook(() => useKeyboardInset());
    expect(kh()).toBe('0px');
  });

  it('removes listeners and resets the var on unmount', () => {
    const vv = mockVV(500); // diff 300
    const { unmount } = renderHook(() => useKeyboardInset());
    expect(kh()).toBe('300px');
    unmount();
    expect(kh()).toBe('0px');
    expect(vv._listeners.resize.length).toBe(0);
    expect(vv._listeners.scroll.length).toBe(0);
  });
});
