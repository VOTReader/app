// @ts-nocheck
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: { isAndroid: false, setImmersiveMode: vi.fn() },
}));
vi.mock('../utils/toast.js', () => ({ showToast: vi.fn() }));

import { PlatformBridge } from '../utils/platform-bridge.js';
import { showToast } from '../utils/toast.js';
import { isFullscreenGestureTarget, useFullscreenGesture } from './use-fullscreen-gesture.js';

function mount(props = {}) {
  return renderHook((current) => useFullscreenGesture(current), {
    initialProps: { enabled: true, hintCount: 0, onHintShown: vi.fn(), ...props },
  });
}

function doubleTap(target, x = 20, y = 20) {
  act(() => {
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
    target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: x, clientY: y, button: 0 }));
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
    target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: x, clientY: y, button: 0 }));
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  PlatformBridge.isAndroid = false;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  document.body.replaceChildren();
});

describe('useFullscreenGesture', () => {
  it('enters fullscreen on an open-area double tap and teaches the shortcut for four seconds', () => {
    const onHintShown = vi.fn();
    mount({ onHintShown });
    const prose = document.body.appendChild(document.createElement('p'));
    doubleTap(prose);

    expect(PlatformBridge.setImmersiveMode).toHaveBeenCalledWith(true);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({
      id: 'vot-toast-fullscreen-hint', durationMs: 4000,
      text: expect.stringContaining('Double-tap or double-click'),
    }));
    expect(onHintShown).toHaveBeenCalledWith(1);
  });

  it('returns web fullscreen to regular view without repeating the teaching toast', () => {
    mount();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
    const prose = document.body.appendChild(document.createElement('p'));
    doubleTap(prose);

    expect(PlatformBridge.setImmersiveMode).toHaveBeenCalledWith(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('keeps Android state across toggles without needing a native readback method', () => {
    PlatformBridge.isAndroid = true;
    mount();
    const prose = document.body.appendChild(document.createElement('p'));
    doubleTap(prose);
    doubleTap(prose);

    expect(PlatformBridge.setImmersiveMode).toHaveBeenNthCalledWith(1, true);
    expect(PlatformBridge.setImmersiveMode).toHaveBeenNthCalledWith(2, false);
  });

  it('ignores controls, modal surfaces, and disabled or GardenView calls', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const prose = document.body.appendChild(document.createElement('p'));
    const { rerender } = mount();
    doubleTap(button);
    expect(PlatformBridge.setImmersiveMode).not.toHaveBeenCalled();

    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    doubleTap(prose);
    expect(PlatformBridge.setImmersiveMode).not.toHaveBeenCalled();
    dialog.remove();

    rerender({ enabled: false, hintCount: 0, onHintShown: vi.fn() });
    doubleTap(prose);
    expect(PlatformBridge.setImmersiveMode).not.toHaveBeenCalled();
  });

  /* App() passes onHintShown as an inline arrow, so a dep on it re-ran this
     effect on EVERY App render — tearing down and re-adding both capture-phase
     document listeners each time. Listener churn on the app root is the shape
     of the input-lag class this app has been bitten by before. */
  it('does not resubscribe its document listeners when the caller re-renders', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { rerender } = mount({ hintCount: 0 });
    const baseline = add.mock.calls.filter(([t]) => t === 'pointerup').length;

    // Exactly what App() does every render: a brand-new arrow identity.
    for (let i = 0; i < 5; i += 1) {
      rerender({ enabled: true, hintCount: 0, onHintShown: () => {} });
    }

    expect(add.mock.calls.filter(([t]) => t === 'pointerup').length).toBe(baseline);
    expect(remove.mock.calls.filter(([t]) => t === 'pointerup').length).toBe(0);
    add.mockRestore();
    remove.mockRestore();
  });

  it('reads the CURRENT hint count and callback despite not depending on them', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = mount({ hintCount: 0, onHintShown: first });
    rerender({ enabled: true, hintCount: 2, onHintShown: second });
    const prose = document.body.appendChild(document.createElement('p'));
    doubleTap(prose);

    expect(second).toHaveBeenCalledWith(3);   // current count, not the mounted 0
    expect(first).not.toHaveBeenCalled();     // stale callback never fires
  });

  /* W46: on desktop a double-click on a word selects it. That second click
     must not also flip the app into fullscreen. Touch keeps its double-tap
     anywhere outside a control. */
  function pointer(type, target, pointerType, x = 20, y = 20) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    target.dispatchEvent(event);
  }
  function verse(text = 'In the beginning was the Word') {
    const el = document.body.appendChild(document.createElement('p'));
    el.setAttribute('data-hl-key', 'bible:John:1:1');
    el.textContent = text;
    return el;
  }

  it('leaves a desktop double-click on reading text to select the word', () => {
    mount();
    const prose = verse();
    act(() => {
      pointer('pointerdown', prose, 'mouse');
      pointer('pointerup', prose, 'mouse');
      pointer('pointerdown', prose, 'mouse');
      pointer('pointerup', prose, 'mouse');
    });
    expect(PlatformBridge.setImmersiveMode).not.toHaveBeenCalled();
  });

  it('leaves a desktop double-click that selected text alone anywhere', () => {
    mount();
    const heading = document.body.appendChild(document.createElement('h2'));
    heading.textContent = 'The Hidden Manna';
    act(() => {
      pointer('pointerdown', heading, 'mouse');
      pointer('pointerup', heading, 'mouse');
      pointer('pointerdown', heading, 'mouse');
      // The browser selects the word on the second press.
      const range = document.createRange();
      range.setStart(heading.firstChild, 4);
      range.setEnd(heading.firstChild, 10);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      pointer('pointerup', heading, 'mouse');
    });
    expect(PlatformBridge.setImmersiveMode).not.toHaveBeenCalled();
    window.getSelection().removeAllRanges();
  });

  it('still toggles on a desktop double-click in an open area, and on a touch double-tap on text', () => {
    mount();
    const margin = document.body.appendChild(document.createElement('div'));
    act(() => {
      pointer('pointerdown', margin, 'mouse');
      pointer('pointerup', margin, 'mouse');
      pointer('pointerdown', margin, 'mouse');
      pointer('pointerup', margin, 'mouse');
    });
    expect(PlatformBridge.setImmersiveMode).toHaveBeenCalledTimes(1);

    const prose = verse();
    act(() => {
      pointer('pointerdown', prose, 'touch', 60, 60);
      pointer('pointerup', prose, 'touch', 60, 60);
      pointer('pointerdown', prose, 'touch', 60, 60);
      pointer('pointerup', prose, 'touch', 60, 60);
    });
    expect(PlatformBridge.setImmersiveMode).toHaveBeenCalledTimes(2);
  });

  it('stops showing the hint after the first few fullscreen entries', () => {
    const onHintShown = vi.fn();
    mount({ hintCount: 3, onHintShown });
    const prose = document.body.appendChild(document.createElement('p'));
    doubleTap(prose);

    expect(PlatformBridge.setImmersiveMode).toHaveBeenCalledWith(true);
    expect(showToast).not.toHaveBeenCalled();
    expect(onHintShown).not.toHaveBeenCalled();
  });
});

describe('isFullscreenGestureTarget', () => {
  it('accepts plain reading content and rejects obvious interactive surfaces', () => {
    const prose = document.body.appendChild(document.createElement('p'));
    const control = document.body.appendChild(document.createElement('div'));
    control.className = 'custom-control';
    document.body.className = 'history-in-nav';
    expect(isFullscreenGestureTarget(prose)).toBe(true);
    expect(isFullscreenGestureTarget(document.body)).toBe(true);
    expect(isFullscreenGestureTarget(control)).toBe(false);
  });
});
