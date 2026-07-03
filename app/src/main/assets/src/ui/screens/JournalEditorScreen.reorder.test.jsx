// @ts-nocheck — test constructs partial JournalEntry / block literals
/* Journal block drag-to-reorder (FABLE5 [6]).
   ──────────────────────────────────────────────────────────────────────
   A grip handle in each block's left gutter drags the block to a new
   position; siblings FLIP out of the way and the drop commits via
   JournalHelpers.moveBlock + the editor's normal save path. The drag
   lifecycle carries the TabsOverview hardening: a grab during the
   post-drop snap window flushes the parked commit (never swallowed),
   moves/lifts are matched to the owning pointer, and the commit body is
   try/finally. Integration-style over the REAL JournalStore + helpers;
   far-boundary UI chrome stubbed (same harness as the J1/J2 suite).
   Block geometry comes from per-element getBoundingClientRect stubs —
   jsdom rects are all zeros otherwise, which would collapse every slot
   onto index 0. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { JournalEditorScreen } from './JournalEditorScreen.jsx';
import { JournalStore } from '../../stores/journal-store.js';
import { JournalHelpers } from '../../data/journal-helpers.js';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });
  globalThis.JournalStore = JournalStore;
  globalThis.JournalHelpers = JournalHelpers;
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

// Drag block `i`'s grip with the mouse from its grip to absolute y `toY`.
function mouseGrab(i) {
  const grips = document.querySelectorAll('.jrn-block-drag-btn');
  fireEvent.mouseDown(grips[i], { button: 0, clientX: 20, clientY: TOP(i) + 10 });
}
const dragTo = (y) => fireEvent.mouseMove(document, { clientX: 20, clientY: y });
const drop = (y) => fireEvent.mouseUp(document, { clientX: 20, clientY: y });

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

  it('dragging a block down by its grip commits the new order to the store', () => {
    const entry = renderEditor(['a', 'b', 'c', 'd']);
    stubRects();
    mouseGrab(0);
    // grabbing is immediate — clone flying, original ghosted
    expect(document.querySelector('.jrn-block.drag-flying')).toBeTruthy();
    expect(document.querySelectorAll('.jrn-block')[0].className).toContain('dragging');
    // clone center passes block 2's center (395): y=380 → cy 370+45=415
    dragTo(380);
    drop(380);
    act(() => { vi.advanceTimersByTime(300); });   // snap window → commit
    expect(document.querySelector('.jrn-block.drag-flying')).toBeNull();
    act(() => { vi.advanceTimersByTime(1500); });  // auto-save debounce
    expect(storedTexts(entry.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('a grab inside the snap window flushes the pending commit and starts a new tracked drag', () => {
    const entry = renderEditor(['a', 'b', 'c', 'd']);
    stubRects();
    mouseGrab(0);
    dragTo(380);
    drop(380);
    act(() => { vi.advanceTimersByTime(50); });    // still inside the 220ms window
    // re-grab another block — the parked commit must flush synchronously…
    mouseGrab(3);
    expect(document.querySelector('.jrn-block.drag-flying')).toBeTruthy();
    // …and the first reorder is already applied once the debounce runs
    drop(TOP(3) + 10);
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(storedTexts(entry.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('only the pointer that grabbed the grip can move or end the drag', () => {
    const entry = renderEditor(['a', 'b', 'c']);
    stubRects();
    const grips = document.querySelectorAll('.jrn-block-drag-btn');
    const touch = (id, y) => ({ identifier: id, clientX: 20, clientY: y });
    fireEvent.touchStart(grips[0], { touches: [touch(1, TOP(0) + 10)], changedTouches: [touch(1, TOP(0) + 10)] });
    expect(document.querySelector('.jrn-block.drag-flying')).toBeTruthy();
    // a stray second finger lifting must NOT end the drag
    fireEvent.touchEnd(document, { touches: [touch(1, TOP(0) + 10)], changedTouches: [touch(9, 600, 600)] });
    expect(document.querySelector('.jrn-block.drag-flying')).toBeTruthy();
    // the owning finger moves past block 1's center, then lifts → commit
    fireEvent.touchMove(document, { touches: [touch(1, 270)], changedTouches: [touch(1, 270)] });
    // the FLIP shift proves the move was accepted and the target advanced
    expect(document.querySelectorAll('.jrn-block')[1].style.transform).toContain('translateY');
    fireEvent.touchEnd(document, { touches: [], changedTouches: [touch(1, 270)] });
    // two advances: the snap-window commit renders first (its effect
    // schedules the debounced save), then the debounce fires
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(storedTexts(entry.id)).toEqual(['b', 'a', 'c']);
  });

  it('unmounting mid-snap-window still persists the reorder (flush + commitSave)', () => {
    const entry = renderEditor(['a', 'b', 'c']);
    stubRects();
    mouseGrab(0);
    dragTo(270); // past block 1's center
    drop(270);
    cleanup();   // unmount before the 220ms commit timer fires
    expect(storedTexts(entry.id)).toEqual(['b', 'a', 'c']);
  });
});
