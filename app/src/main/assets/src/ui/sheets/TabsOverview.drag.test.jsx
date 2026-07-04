/* TabsOverview drag-to-reorder — lifecycle hardening.
   ─────────────────────────────────────────────────────────────────
   Owner-reported on device: after dropping a dragged tab, grabbing another
   immediately left the press untracked (the finger only scrolled the grid and
   nothing could be dropped), and a stray second finger lifting mid-drag
   committed the drag early at the wrong slot. Root causes: (1) startPress
   refused any grab while the drop-commit sat in a 240ms setTimeout, with no
   way to flush it; (2) the document touchend/touchcancel handlers ended the
   press for ANY finger, not the one that owns it; (3) an exception in the
   commit left dragIdxRef poisoned forever.

   These tests drive the REAL component: the mouse path (jsdom-native) for the
   lifecycle, fabricated touch lists for the multi-finger identity cases.
   Geometry comes from per-card getBoundingClientRect stubs (jsdom rects are
   all zeros otherwise, which would collapse every slot onto index 0). */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
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

// Long-press card i with the mouse, entering drag mode.
function mouseGrab(cards, i) {
  const c = center(i);
  fireEvent.mouseDown(cards[i], { button: 0, clientX: c.x, clientY: c.y });
  act(() => { vi.advanceTimersByTime(1400); });
}

const dragMove = (x, y) => fireEvent.mouseMove(document, { clientX: x, clientY: y });
const drop = (x, y) => fireEvent.mouseUp(document, { clientX: x, clientY: y });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  act(() => { vi.runOnlyPendingTimers(); });
  vi.useRealTimers();
  cleanup();
  document.querySelectorAll('.tab-card.drag-flying').forEach((n) => n.remove());
});

describe('TabsOverview drag lifecycle', () => {
  it('a full drag commits the reorder and cleans up the clone', () => {
    const { props, cards } = renderOverview();
    mouseGrab(cards, 0);
    expect(cards[0].className).toContain('dragging');
    expect(document.querySelector('.tab-card.drag-flying')).toBeTruthy();
    const c1 = center(1);
    dragMove(c1.x, c1.y);
    drop(c1.x, c1.y);
    act(() => { vi.advanceTimersByTime(300); });
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
    expect(document.querySelector('.tab-card.drag-flying')).toBeNull();
  });

  it('a grab inside the 240ms commit window flushes the pending commit and starts a NEW press (the owner-reported swallow)', () => {
    const { props, cards } = renderOverview();
    mouseGrab(cards, 0);
    const c1 = center(1);
    dragMove(c1.x, c1.y);
    drop(c1.x, c1.y);
    // Only 50ms into the snap window: the commit is still parked.
    act(() => { vi.advanceTimersByTime(50); });
    expect(props.onReorder).not.toHaveBeenCalled();
    // Re-grab another card — the pending commit must flush synchronously…
    const c2 = center(2);
    fireEvent.mouseDown(cards[2], { button: 0, clientX: c2.x, clientY: c2.y });
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
    expect(document.querySelector('.tab-card.drag-flying')).toBeNull();
    // …and the new press must be TRACKED: holding enters drag mode again.
    act(() => { vi.advanceTimersByTime(1400); });
    expect(cards[2].className).toContain('dragging');
    const c3 = center(3);
    dragMove(c3.x, c3.y);
    drop(c3.x, c3.y);
    act(() => { vi.advanceTimersByTime(300); });
    expect(props.onReorder).toHaveBeenCalledWith(2, 3);
  });

  it('the commit does not double-fire when the timer runs after a flush', () => {
    const { props, cards } = renderOverview();
    mouseGrab(cards, 0);
    const c1 = center(1);
    dragMove(c1.x, c1.y);
    drop(c1.x, c1.y);
    const c2 = center(2);
    fireEvent.mouseDown(cards[2], { button: 0, clientX: c2.x, clientY: c2.y }); // flush
    drop(c2.x, c2.y);                                                           // abandon the new press
    act(() => { vi.advanceTimersByTime(1000); });                               // old timer fires into the guard
    expect(props.onReorder).toHaveBeenCalledTimes(1);
  });

  it('an onReorder exception cannot poison the state machine — the next drag still works', () => {
    const onReorder = vi.fn(() => { if (onReorder.mock.calls.length === 1) throw new Error('boom'); });
    const { cards } = renderOverview({ onReorder });
    mouseGrab(cards, 0);
    const c1 = center(1);
    dragMove(c1.x, c1.y);
    drop(c1.x, c1.y);
    expect(() => { act(() => { vi.advanceTimersByTime(300); }); }).toThrow('boom');
    // The refs reset in the finally — a fresh drag must still engage and commit.
    mouseGrab(cards, 2);
    expect(cards[2].className).toContain('dragging');
    const c3 = center(3);
    dragMove(c3.x, c3.y);
    drop(c3.x, c3.y);
    act(() => { vi.advanceTimersByTime(300); });
    expect(onReorder).toHaveBeenCalledWith(2, 3);
  });
});

describe('TabsOverview device event-delivery hardening', () => {
  // Android WebView's native text-selection machinery, when it claims a
  // long-press, delivers the release touchend NON-BUBBLING (the documented
  // tap->chip bug, MainActivity.kt) - and ScreenLayout's tap-suppressor can
  // stopPropagation a >300ms lift. Both starve document-BUBBLE listeners.
  // The drag listeners are registered in the CAPTURE phase, which no
  // intermediate consumer can block; these tests deliver events the hostile
  // way (non-bubbling, targeted at the card) and expect the drag to survive.
  const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
  const rawTouchEvent = (type, target, id, x, y, bubbles) => {
    const e = new Event(type, { bubbles, cancelable: true });
    Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [touch(id, x, y)], configurable: true });
    Object.defineProperty(e, 'changedTouches', { value: [touch(id, x, y)], configurable: true });
    target.dispatchEvent(e);
  };

  it('a NON-BUBBLING touchend (WebView selection machinery) still ends and commits the drag', () => {
    const { props, cards } = renderOverview();
    const c0 = center(0);
    fireEvent.touchStart(cards[0], { touches: [touch(1, c0.x, c0.y)], changedTouches: [touch(1, c0.x, c0.y)] });
    act(() => { vi.advanceTimersByTime(1400); });
    expect(cards[0].className).toContain('dragging');
    const c1 = center(1);
    rawTouchEvent('touchmove', cards[0], 1, c1.x, c1.y, false);   // non-bubbling move too
    rawTouchEvent('touchend', cards[0], 1, c1.x, c1.y, false);    // the zombie-maker pre-fix
    act(() => { vi.advanceTimersByTime(300); });
    expect(document.querySelector('.tab-card.drag-flying')).toBeNull();
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
  });

  it('a zombied drag (end event fully lost) self-heals on the next grab instead of refusing forever', () => {
    const { props, cards } = renderOverview();
    const c0 = center(0);
    fireEvent.touchStart(cards[0], { touches: [touch(1, c0.x, c0.y)], changedTouches: [touch(1, c0.x, c0.y)] });
    act(() => { vi.advanceTimersByTime(1400); });
    expect(document.querySelector('.tab-card.drag-flying')).toBeTruthy();
    // the end event NEVER arrives (worst case); 3s later the user grabs again
    act(() => { vi.advanceTimersByTime(3000); });
    const c2 = center(2);
    fireEvent.touchStart(cards[2], { touches: [touch(4, c2.x, c2.y)], changedTouches: [touch(4, c2.x, c2.y)] });
    // the stale drag was aborted (uncommitted) and the new press is live
    expect(document.querySelector('.tab-card.drag-flying')).toBeNull();
    expect(props.onReorder).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1400); });
    expect(cards[2].className).toContain('dragging');
    const c3 = center(3);
    fireEvent.touchMove(document, { touches: [touch(4, c3.x, c3.y)], changedTouches: [touch(4, c3.x, c3.y)] });
    fireEvent.touchEnd(document, { touches: [], changedTouches: [touch(4, c3.x, c3.y)] });
    act(() => { vi.advanceTimersByTime(300); });
    expect(props.onReorder).toHaveBeenCalledWith(2, 3);
  });
});

describe('TabsOverview multi-touch identity', () => {
  const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });

  it('a second finger lifting mid-drag does not end the drag; only the owning finger commits', () => {
    const { props, cards } = renderOverview();
    const c0 = center(0);
    fireEvent.touchStart(cards[0], { touches: [touch(1, c0.x, c0.y)], changedTouches: [touch(1, c0.x, c0.y)] });
    act(() => { vi.advanceTimersByTime(1400); });
    expect(cards[0].className).toContain('dragging');
    const c1 = center(1);
    fireEvent.touchMove(document, { touches: [touch(1, c1.x, c1.y)], changedTouches: [touch(1, c1.x, c1.y)] });
    // Finger 9 (a stray touch elsewhere) lifts — must be ignored.
    fireEvent.touchEnd(document, { touches: [touch(1, c1.x, c1.y)], changedTouches: [touch(9, 600, 1000)] });
    expect(cards[0].className).toContain('dragging');
    expect(props.onReorder).not.toHaveBeenCalled();
    // The owning finger lifts — now it commits.
    fireEvent.touchEnd(document, { touches: [], changedTouches: [touch(1, c1.x, c1.y)] });
    act(() => { vi.advanceTimersByTime(300); });
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
  });

  it('moves from a non-owning finger neither drag the clone nor cancel the press', () => {
    const { cards } = renderOverview();
    const c0 = center(0);
    fireEvent.touchStart(cards[0], { touches: [touch(1, c0.x, c0.y)], changedTouches: [touch(1, c0.x, c0.y)] });
    // Pre-drag: a big move from finger 9 must NOT drift-cancel the press.
    fireEvent.touchMove(document, { touches: [touch(1, c0.x, c0.y), touch(9, 700, 50)], changedTouches: [touch(9, 700, 50)] });
    act(() => { vi.advanceTimersByTime(1400); });
    expect(cards[0].className).toContain('dragging');
    fireEvent.touchEnd(document, { touches: [], changedTouches: [touch(1, c0.x, c0.y)] });
    act(() => { vi.advanceTimersByTime(300); });
  });
});
