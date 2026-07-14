// @ts-nocheck — test constructs partial JournalEntry / block literals
/* Journal block drag-to-reorder (FABLE5 [6]) — on the SHARED press-drag core.
   ──────────────────────────────────────────────────────────────────────
   A grip handle in each block's left gutter drags the block to a new
   position; siblings FLIP out of the way. The lifecycle is the shared
   createPressDrag factory (utils/press-drag.js — the tabs v2 redesign)
   with holdMs:0 (the grip is the affordance, the grab is instant). The
   commit is SYNCHRONOUS at release: moveBlock + blocksRef land in the same
   task (one paint; a pagehide/unmount flush persists the NEW order with no
   parked window), while the clone glides into its slot and swaps for the
   real block at landing. Integration-style over the REAL JournalStore +
   helpers + the REAL factory; far-boundary UI chrome stubbed. Block
   geometry comes from per-element getBoundingClientRect stubs — jsdom
   rects are all zeros otherwise. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { JournalEditorScreen } from './JournalEditorScreen.jsx';
import { JournalStore } from '../../stores/journal-store.js';
import { JournalHelpers } from '../../data/journal-helpers.js';
import { createPressDrag } from '../../utils/press-drag.js';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });
  globalThis.JournalStore = JournalStore;
  globalThis.JournalHelpers = JournalHelpers;
  globalThis.createPressDrag = createPressDrag; // the REAL shared lifecycle
  globalThis.JournalMediaStore = { compressImage: vi.fn(), put: vi.fn(), delete: vi.fn() };
  globalThis.showToast = () => {};
  globalThis.StorageHealth = { onWriteFailure: () => {} };
  globalThis.ScreenLayout = ({ navChildren, children }) =>
    React.createElement('div', null, navChildren, React.createElement('div', { className: 'screen-scroll' }, children));
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = () => null;
  globalThis.JournalImageBlock = () => null;
  globalThis.JournalAudioBlock = () => null;
  globalThis.JournalBlockView = () => null;
  globalThis.JournalInsertSheet = () => null;
  globalThis.JournalRecordingSheet = () => null;
});

afterEach(() => {
  act(() => { vi.runOnlyPendingTimers(); });
  vi.useRealTimers();
  cleanup();
  document.querySelectorAll('.jrn-block.drag-flying').forEach((n) => n.remove());
});

// Stacked 1D geometry: block i at top 150 + 100*i, height 90 (10px spacing).
const TOP = (i) => 150 + 100 * i;
function stubRects() {
  const blocks = Array.from(document.querySelectorAll('.jrn-block'));
  blocks.forEach((el, i) => {
    el.getBoundingClientRect = () => /** @type {DOMRect} */ ({
      left: 44, top: TOP(i), width: 300, height: 90,
      right: 344, bottom: TOP(i) + 90, x: 44, y: TOP(i), toJSON: () => ({}),
    });
  });
  return blocks;
}

function renderEditor(texts) {
  const entry = JournalStore.add({
    title: 'reorder',
    blocks: texts.map((t) => JournalHelpers.newBlock('p', { text: t })),
  });
  render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
  return entry;
}

const storedTexts = (id) => JournalStore.get(id).blocks.map((b) => b.text);

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

// Grab block i's grip — instant drag (holdMs 0), no timers needed.
function grab(i, pointerId = 1) {
  const grips = document.querySelectorAll('.jrn-block-drag-btn');
  firePointer(grips[i], 'pointerdown', { pointerId, isPrimary: true, pointerType: 'touch', clientX: 20, clientY: TOP(i) + 10 });
}
const dragTo = (y, pointerId = 1) => firePointer(document, 'pointermove', { pointerId, clientX: 20, clientY: y });
const drop = (y, pointerId = 1) => firePointer(document, 'pointerup', { pointerId, clientX: 20, clientY: y });

describe('JournalHelpers.moveBlock', () => {
  const arr = ['a', 'b', 'c', 'd'].map((t) => ({ id: t, type: 'p', text: t }));
  it('moves forward and backward, returning a new array', () => {
    expect(JournalHelpers.moveBlock(arr, 0, 2).map((b) => b.text)).toEqual(['b', 'c', 'a', 'd']);
    expect(JournalHelpers.moveBlock(arr, 3, 0).map((b) => b.text)).toEqual(['d', 'a', 'b', 'c']);
    expect(arr.map((b) => b.text)).toEqual(['a', 'b', 'c', 'd']); // untouched
  });
  it('returns the input array identity for no-op or out-of-range moves', () => {
    expect(JournalHelpers.moveBlock(arr, 1, 1)).toBe(arr);
    expect(JournalHelpers.moveBlock(arr, -1, 2)).toBe(arr);
    expect(JournalHelpers.moveBlock(arr, 0, 4)).toBe(arr);
    expect(JournalHelpers.moveBlock(null, 0, 1)).toBe(null);
  });
});

describe('journal block drag-to-reorder', () => {
  it('renders a grip per block, but none when the entry has a single block', () => {
    renderEditor(['one', 'two', 'three']);
    expect(document.querySelectorAll('.jrn-block-drag-btn').length).toBe(3);
    cleanup();
    JournalStore._resetForTests({ forceLoaded: true });
    renderEditor(['only']);
    expect(document.querySelectorAll('.jrn-block-drag-btn').length).toBe(0);
  });

  it('dragging a block down by its grip commits the new order SYNCHRONOUSLY at release', () => {
    const entry = renderEditor(['a', 'b', 'c', 'd']);
    stubRects();
    grab(0);
    // grabbing is immediate — clone flying, original ghosted
    expect(document.querySelector('.jrn-block.drag-flying')).toBeTruthy();
    expect(document.querySelectorAll('.jrn-block')[0].className).toContain('dragging');
    // clone center passes block 2's center: y=380 → cy 370+45=415
    dragTo(380);
    drop(380);
    // The reorder is applied in the SAME task as the release (blocksRef is
    // current immediately); only the debounced SAVE still needs its timer.
    act(() => { vi.advanceTimersByTime(1500); });
    expect(storedTexts(entry.id)).toEqual(['b', 'c', 'a', 'd']);
    // The clone glides for ~210ms, then swaps for the real block.
    expect(document.querySelector('.jrn-block.drag-flying')).toBeNull();
  });

  it('a grab DURING the landing glide flushes it and the second drag works end-to-end', () => {
    const entry = renderEditor(['a', 'b', 'c', 'd']);
    stubRects();
    grab(0);
    dragTo(380);
    drop(380); // landing glide starts (~210ms)
    // Re-grab immediately — the new pointerdown must flush the landing and
    // own a fresh gesture (the "works once then never" class).
    grab(3, 7);
    expect(document.querySelectorAll('.jrn-block.drag-flying').length).toBe(1);
    drop(TOP(3) + 10, 7); // no move — commits nothing
    act(() => { vi.advanceTimersByTime(1500); });
    expect(storedTexts(entry.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('only the pointer that grabbed the grip can move or end the drag', () => {
    const entry = renderEditor(['a', 'b', 'c']);
    stubRects();
    grab(0, 1);
    expect(document.querySelector('.jrn-block.drag-flying')).toBeTruthy();
    // a stray second finger lifting must NOT end the drag
    drop(600, 9);
    expect(document.querySelector('.jrn-block.drag-flying')).toBeTruthy();
    // the owning finger moves past block 1's center, then lifts → commit
    dragTo(270, 1);
    // the FLIP shift proves the move was accepted and the target advanced
    expect(document.querySelectorAll('.jrn-block')[1].style.transform).toContain('translateY');
    drop(270, 1);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(storedTexts(entry.id)).toEqual(['b', 'a', 'c']);
  });

  it('a NON-BUBBLING pointerup (WebView delivery) still ends and commits the drag', () => {
    // Android WebView machinery can deliver a claimed gesture's end event
    // non-bubbling — document-BUBBLE listeners starve (the tabs lock-up
    // class). The factory listens at document CAPTURE, first in propagation.
    const entry = renderEditor(['a', 'b', 'c']);
    stubRects();
    grab(0);
    dragTo(270);
    const Ctor = /** @type {any} */ (window).PointerEvent || window.MouseEvent;
    const e = new Ctor('pointerup', { bubbles: false, cancelable: true, clientX: 20, clientY: 270 });
    try { Object.defineProperty(e, 'pointerId', { value: 1 }); } catch (_e) { /* ignore */ }
    act(() => { document.dispatchEvent(e); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(document.querySelector('.jrn-block.drag-flying')).toBeNull();
    expect(storedTexts(entry.id)).toEqual(['b', 'a', 'c']);
  });

  it('pointercancel MID-DRAG commits at the current slot (the browser claimed the stream)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry = renderEditor(['a', 'b', 'c']);
    stubRects();
    grab(0);
    dragTo(270);
    firePointer(document, 'pointercancel', { pointerId: 1, clientX: 20, clientY: 270 });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(storedTexts(entry.id)).toEqual(['b', 'a', 'c']);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[jrndrag]'))).toBe(true);
    warn.mockRestore();
  });

  it('unmounting right after release persists the reorder (synchronous commit, no parked window)', () => {
    const entry = renderEditor(['a', 'b', 'c']);
    stubRects();
    grab(0);
    dragTo(270); // past block 1's center
    drop(270);
    cleanup();   // unmount immediately — nothing is parked anymore
    expect(storedTexts(entry.id)).toEqual(['b', 'a', 'c']);
  });
});
