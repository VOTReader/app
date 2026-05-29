/* W4.2 — useDesktopKeyboard tests. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDesktopKeyboard } from './use-desktop-keyboard.js';
import { PlatformBridge } from '../utils/platform-bridge.js';

/** @param {string} key @param {any} [opts] */
function press(key, opts = {}) {
  const target = opts.target || document;
  const init = { key, bubbles: true, cancelable: true, ...opts };
  delete init.target;
  target.dispatchEvent(new KeyboardEvent('keydown', init));
}

let _hook, _origGoSearch, _origIsAndroid;

// Explicitly unmount after each test — the hook attaches a document-level
// keydown listener, and auto-cleanup isn't unmounting it here, so without
// this the listeners accumulate across tests.
function mount() { _hook = renderHook(() => useDesktopKeyboard()); }

beforeEach(() => {
  _origGoSearch = window.__goSearch;
  _origIsAndroid = PlatformBridge.isAndroid;
  PlatformBridge.isAndroid = false;
  window.__goSearch = vi.fn();
  document.body.innerHTML = '';
});

afterEach(() => {
  if (_hook) { _hook.unmount(); _hook = null; }
  window.__goSearch = _origGoSearch;
  PlatformBridge.isAndroid = _origIsAndroid;
  document.body.innerHTML = '';
});

describe('useDesktopKeyboard — search', () => {
  it('opens search on "/"', () => {
    mount();
    press('/');
    expect(window.__goSearch).toHaveBeenCalledTimes(1);
  });

  it('opens search on Ctrl+F', () => {
    mount();
    press('f', { ctrlKey: true });
    expect(window.__goSearch).toHaveBeenCalledTimes(1);
  });

  it('does not hijack "/" while typing in an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    mount();
    press('/', { target: input });
    expect(window.__goSearch).not.toHaveBeenCalled();
  });
});

describe('useDesktopKeyboard — chapter arrows', () => {
  function mountStickyNav() {
    const nav = document.createElement('div');
    nav.className = 'chapter-nav-sticky';
    const prev = document.createElement('button');
    const next = document.createElement('button');
    prev.className = next.className = 'chapter-nav-sticky-arrow';
    prev.click = vi.fn();
    next.click = vi.fn();
    nav.append(prev, next);
    document.body.appendChild(nav);
    return { prev, next };
  }

  it('ArrowRight clicks the next arrow', () => {
    const { prev, next } = mountStickyNav();
    mount();
    press('ArrowRight');
    expect(next.click).toHaveBeenCalledTimes(1);
    expect(prev.click).not.toHaveBeenCalled();
  });

  it('ArrowLeft clicks the prev arrow', () => {
    const { prev, next } = mountStickyNav();
    mount();
    press('ArrowLeft');
    expect(prev.click).toHaveBeenCalledTimes(1);
    expect(next.click).not.toHaveBeenCalled();
  });

  it('does not click a disabled arrow', () => {
    const { next } = mountStickyNav();
    next.disabled = true;
    mount();
    press('ArrowRight');
    expect(next.click).not.toHaveBeenCalled();
  });

  it('no-ops when there is no chapter nav on screen', () => {
    mount();
    expect(() => press('ArrowRight')).not.toThrow();
  });
});

describe('useDesktopKeyboard — Android gate', () => {
  it('registers no keydown listener on Android', () => {
    PlatformBridge.isAndroid = true;
    const addSpy = vi.spyOn(document, 'addEventListener');
    mount();
    const keydownAdded = addSpy.mock.calls.some((c) => c[0] === 'keydown');
    expect(keydownAdded).toBe(false);
    addSpy.mockRestore();
  });
});
