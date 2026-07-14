/* TabsOverview drag-to-reorder — v2 pointer-events state machine.
   ─────────────────────────────────────────────────────────────────
   REDESIGN pins (owner-reported, after two rounds of touch-event patches
   still left device failures):
     1. "first drag works, then none until an app restart" — every gesture is
        ONE object torn down by a single endGesture(); a new pointerdown
        FORCE-resets anything a previous gesture leaked, so a second/third
        drag always works.
     2. "the real card visibly moves again after the ghost lands" — the
        reorder now commits SYNCHRONOUSLY at release (one paint of the final
        order) while the ghost glides above the hidden destination card and
        swaps 1:1 at landing.
     3. pointercancel (the browser claiming the stream — the silent device
        killer) explicitly commits at the current slot and resets.

   Tests drive the REAL component with pointer events; geometry comes from
   per-card getBoundingClientRect stubs (jsdom rects are all zeros otherwise,
   which would collapse every slot onto index 0). jsdom may lack the
   PointerEvent constructor, so the driver falls back to MouseEvent and
   assigns pointerId/isPrimary/pointerType directly. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { TabsOverview } from './TabsOverview.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';

// The tab-label/key helpers resolve through corpus-registry globals (absent in
// jsdom); the drag tests only exercise geometry + lifecycle, so pure fakes
// suffice — each tab keys by its index and labels as "Home".
/** @type {any} */ (globalThis).describeTab = () => ({ title: 'Home', subtitle: '', resolved: true });
/** @type {any} */ (globalThis).tabContentKey = (t) => `k${t.__i}`;
/** @type {any} */ (globalThis).tabHasProgressBar = () => false;
/** @type {any} */ (globalThis).scrollKeyForTab = () => 'home';
/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

// 2-column grid, same shape as the real overview.
const SLOTS = [
  { left: 16, top: 287 }, { left: 375, top: 287 },
  { left: 16, top: 715 }, { left: 375, top: 715 },
];
const W = 345, H = 413;
const center = (i) => ({ x: SLOTS[i].left + W / 2, y: SLOTS[i].top + H / 2 });

function renderOverview(overrides = {}) {
  const tabs = [0, 1, 2, 3].map((i) => ({ screen: 'home', scrollPositions: {}, __i: i }));
  const props = {
    tabs, activeTabIdx: 0,
    onSelect: vi.fn(), onClose: vi.fn(), onNewTab: vi.fn(), onMenu: vi.fn(),
    onReorder: vi.fn(), onClearAll: vi.fn(), onDedupe: vi.fn(),
    MAX_TABS: 999, thumbnails: null,
    ...overrides,
  };
  const utils = render(<TabsOverview {...props} />);
  const cards = Array.from(document.querySelectorAll('.tabs-overview-grid .tab-card:not(.tab-card-new)'));
  cards.forEach((el, i) => {
    el.getBoundingClientRect = () => /** @type {DOMRect} */ ({
      left: SLOTS[i].left, top: SLOTS[i].top, width: W, height: H,
      right: SLOTS[i].left + W, bottom: SLOTS[i].top + H,
      x: SLOTS[i].left, y: SLOTS[i].top, toJSON: () => ({}),
    });
  });
  return { ...utils, props, cards };
}

// Pointer-event driver — jsdom-safe (MouseEvent fallback + direct field assign).
const firePointer = (target, type, init) => {
  const Ctor = /** @type {any} */ (window).PointerEvent || window.MouseEvent;
  const e = new Ctor(type, { bubbles: true, cancelable: true, ...init });
  ['pointerId', 'isPrimary', 'pointerType'].forEach((k) => {
    if (init && k in init && /** @type {any} */ (e)[k] !== init[k]) {
      try { Object.defineProperty(e, k, { value: init[k] }); } catch (_e) { /* ignore */ }
    }
  });
  act(() => { target.dispatchEvent(e); });
  return e;
};

// Long-press card i, entering drag mode (280ms glow buffer + 1100ms hold).
function grab(cards, i, pointerId = 1) {
  const c = center(i);
  firePointer(cards[i], 'pointerdown', { pointerId, isPrimary: true, pointerType: 'touch', clientX: c.x, clientY: c.y });
  act(() => { vi.advanceTimersByTime(1400); });
}
const dragTo = (x, y, pointerId = 1) => firePointer(document, 'pointermove', { pointerId, clientX: x, clientY: y });
const drop = (x, y, pointerId = 1) => firePointer(document, 'pointerup', { pointerId, clientX: x, clientY: y });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  act(() => { vi.runOnlyPendingTimers(); });
  vi.useRealTimers();
  cleanup();
  document.querySelectorAll('.tab-card.drag-flying').forEach((n) => n.remove());
});

describe('TabsOverview drag v2 — reorder + seamless drop', () => {
  it('drag to another slot commits the reorder SYNCHRONOUSLY at release (no double-move window)', () => {
    const { props, cards } = renderOverview();
    grab(cards, 0);
    expect(cards[0].className).toContain('dragging');
    expect(document.body.querySelector('.drag-flying')).toBeTruthy();
    const c1 = center(1);
    dragTo(c1.x, c1.y);
    drop(c1.x, c1.y);
    // The old machinery deferred this 240ms behind the snap animation — the
    // visible "real card moves after the ghost lands". Now it's immediate.
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
  });

  it('the ghost glides above the HIDDEN destination card, then swaps 1:1 at landing', () => {
    const { cards } = renderOverview();
    grab(cards, 0);
    const c1 = center(1);
    dragTo(c1.x, c1.y);
    drop(c1.x, c1.y);
    // Post-release: ghost still gliding, destination card hidden beneath it.
    const dest = /** @type {HTMLElement} */ (cards[1]);
    expect(document.body.querySelector('.drag-flying')).toBeTruthy();
    expect(dest.style.opacity).toBe('0');
    // Landing: ghost removed + the real card revealed in the same moment.
    act(() => { vi.advanceTimersByTime(260); });
    expect(document.body.querySelector('.drag-flying')).toBeNull();
    expect(dest.style.opacity).toBe('');
  });

  it('a SECOND drag right after a successful one works (the "works once then never" class)', () => {
    const { props, cards } = renderOverview();
    grab(cards, 0);
    const c1 = center(1);
    dragTo(c1.x, c1.y);
    drop(c1.x, c1.y);
    // No settling wait — grab again immediately (mid-landing): the new
    // pointerdown must flush the landing and own a fresh gesture.
    grab(cards, 2, 7);
    expect(document.body.querySelectorAll('.drag-flying').length).toBe(1);
    const c3 = center(3);
    dragTo(c3.x, c3.y, 7);
    drop(c3.x, c3.y, 7);
    expect(props.onReorder).toHaveBeenCalledTimes(2);
    expect(props.onReorder).toHaveBeenLastCalledWith(2, 3);
  });

  it('a NON-BUBBLING pointerup (the WebView device delivery) still ends + commits the drag', () => {
    const { props, cards } = renderOverview();
    grab(cards, 0);
    const c2 = center(2);
    dragTo(c2.x, c2.y);
    // bubbles:false — the faithful analog of the device's non-bubbling
    // delivery; document-capture listeners are first in propagation and
    // still see it.
    const Ctor = /** @type {any} */ (window).PointerEvent || window.MouseEvent;
    const e = new Ctor('pointerup', { bubbles: false, cancelable: true, clientX: c2.x, clientY: c2.y });
    try { Object.defineProperty(e, 'pointerId', { value: 1 }); } catch (_e) { /* ignore */ }
    act(() => { document.dispatchEvent(e); });
    expect(props.onReorder).toHaveBeenCalledWith(0, 2);
  });

  it('pointercancel MID-DRAG commits at the current slot and resets — the next drag works', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { props, cards } = renderOverview();
    grab(cards, 0);
    const c1 = center(1);
    dragTo(c1.x, c1.y);
    firePointer(document, 'pointercancel', { pointerId: 1, clientX: c1.x, clientY: c1.y });
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[tabdrag]'))).toBe(true);
    act(() => { vi.advanceTimersByTime(300); });
    grab(cards, 2, 9);
    expect(document.body.querySelector('.drag-flying')).toBeTruthy();
    drop(center(2).x, center(2).y, 9);
    warn.mockRestore();
  });

  it('other pointers never disturb the owning gesture (multi-touch identity)', () => {
    const { props, cards } = renderOverview();
    grab(cards, 0, 1);
    // A stray second finger moves and lifts — ignored entirely.
    dragTo(center(3).x, center(3).y, 2);
    drop(center(3).x, center(3).y, 2);
    expect(props.onReorder).not.toHaveBeenCalled();
    expect(document.body.querySelector('.drag-flying')).toBeTruthy();
    // The owner finger finishes normally.
    const c1 = center(1);
    dragTo(c1.x, c1.y, 1);
    drop(c1.x, c1.y, 1);
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
  });

  it('a non-primary pointerdown never starts a gesture', () => {
    const { cards } = renderOverview();
    const c0 = center(0);
    firePointer(cards[0], 'pointerdown', { pointerId: 2, isPrimary: false, pointerType: 'touch', clientX: c0.x, clientY: c0.y });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(document.body.querySelector('.drag-flying')).toBeNull();
  });

  it('pre-drag finger drift (>10px) cancels the press — it was a scroll', () => {
    const { props, cards } = renderOverview();
    const c0 = center(0);
    firePointer(cards[0], 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: c0.x, clientY: c0.y });
    act(() => { vi.advanceTimersByTime(300); });
    dragTo(c0.x, c0.y + 40); // drift
    act(() => { vi.advanceTimersByTime(1500); });
    expect(document.body.querySelector('.drag-flying')).toBeNull();
    drop(c0.x, c0.y + 40);
    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it('an exception in onReorder is traced and never wedges the next drag', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onReorder = vi.fn(() => { throw new Error('boom'); });
    const { cards } = renderOverview({ onReorder });
    grab(cards, 0);
    const c1 = center(1);
    dragTo(c1.x, c1.y);
    drop(c1.x, c1.y);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[tabdrag]'))).toBe(true);
    // The machinery is intact: the very next drag runs end-to-end.
    /** @type {any} */ (onReorder).mockImplementation(() => {});
    act(() => { vi.advanceTimersByTime(300); });
    grab(cards, 2, 5);
    const c3 = center(3);
    dragTo(c3.x, c3.y, 5);
    drop(c3.x, c3.y, 5);
    expect(onReorder).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('unmount mid-drag leaks nothing — the ghost dies with the overlay', () => {
    const { unmount, cards } = renderOverview();
    grab(cards, 0);
    expect(document.body.querySelector('.drag-flying')).toBeTruthy();
    unmount();
    expect(document.body.querySelector('.drag-flying')).toBeNull();
  });
});
