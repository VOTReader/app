// @ts-nocheck
/* W48 — a new bookmark records the words it was made on.
   ─────────────────────────────────────────────────────────────────────
   applyDOMBookmarks re-finds a bookmark's words when text in front of it was
   edited, the way highlights are re-found, so the bookmark has to carry them:
   `text`, in hlDisplayText's form (footnote digits and icon glyphs left out),
   which is the form chromeAwareView searches. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar.jsx';

beforeEach(() => {
  globalThis.HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
  globalThis.HighlightStore = { get: () => [] };
  globalThis.AnnotationStore = { get: () => [], add: vi.fn(), removeGroup: vi.fn() };
  globalThis.NoteStore = { get: () => null };
  globalThis.BookmarkStore = { add: vi.fn() };
  globalThis.snapSelectionRange = (_container, _text, start, end) => ({ start, end });
  globalThis.snapRangeToWords = (_text, start, end) => ({ start, end });
  window.__showAnnChip = vi.fn();
  window.__openNote = vi.fn();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  delete globalThis.HL_COLORS;
  delete globalThis.HighlightStore;
  delete globalThis.AnnotationStore;
  delete globalThis.NoteStore;
  delete globalThis.BookmarkStore;
  delete globalThis.snapSelectionRange;
  delete globalThis.snapRangeToWords;
  delete window.__showAnnChip;
  delete window.__openNote;
  delete window.__bookmarkCreate;
  delete window.getSelection;
});

/** Selects "Lord<fn>1</fn> is my" in "The Lord1 is my shepherd" and taps Bookmark. */
function bookmarkLordIsMy() {
  const container = document.createElement('p');
  container.dataset.hlKey = 'bible:psalms:23:1';
  container.innerHTML = 'The Lord<sup class="fn-ref">1</sup> is my shepherd';
  document.body.appendChild(container);
  const range = document.createRange();
  range.setStart(container.firstChild, 4);
  range.setEnd(container.lastChild, 6);
  range.getBoundingClientRect = () => ({ left: 10, top: 100, right: 200, bottom: 120, width: 190, height: 20 });
  window.getSelection = () => ({
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => range,
    removeAllRanges: vi.fn(),
    toString: () => range.toString(),
  });
  render(<SelectionToolbar />);
  fireEvent.contextMenu(container, { clientX: 20, clientY: 100 });
  fireEvent.click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Bookmark'));
}

describe('a new bookmark records its words (W48)', () => {
  it('hands the create sheet the selected words without the footnote digit', () => {
    window.__bookmarkCreate = vi.fn();
    bookmarkLordIsMy();
    expect(window.__bookmarkCreate).toHaveBeenCalledWith(expect.objectContaining({
      hlKey: 'bible:psalms:23:1:4-15',
      text: 'Lord is my',
    }));
  });

  it('stores them on the direct-save fallback too', () => {
    // No App bridge: vitest.setup.js stubs __bookmarkCreate, so this test must not lean on the test above deleting it.
    delete window.__bookmarkCreate;
    bookmarkLordIsMy();
    expect(globalThis.BookmarkStore.add).toHaveBeenCalledWith(expect.objectContaining({
      hlKey: 'bible:psalms:23:1:4-15',
      text: 'Lord is my',
    }));
  });
});

/* Sweep v080: the default label and the sheet's excerpt sliced the container's
   raw textContent, which carries the gold footnote bubble's digit, so they read
   "Lord1 is my" while the stored `text` beside them (hlDisplayText) was clean. */
describe('a new bookmark labels and previews the words the reader sees (sweep v080)', () => {
  it('leaves the footnote digit out of the default label and the excerpt', () => {
    window.__bookmarkCreate = vi.fn();
    bookmarkLordIsMy();
    expect(window.__bookmarkCreate).toHaveBeenCalledWith(expect.objectContaining({
      // A06.9: three words widen to the sentence they sit in, still without the digit.
      defaultLabel: 'The Lord is my shepherd',
      excerpt: 'Lord is my',
    }));
  });

  it('leaves it out of the label the direct-save fallback stores', () => {
    delete window.__bookmarkCreate;
    bookmarkLordIsMy();
    expect(globalThis.BookmarkStore.add).toHaveBeenCalledWith(expect.objectContaining({ label: 'The Lord is my shepherd' }));
  });

  it('a selection across two poem lines labels with a space where the line breaks, not run together', () => {
    window.__bookmarkCreate = vi.fn();
    const container = document.createElement('div');
    container.dataset.hlKey = 'bible:psalms:23:1';
    container.innerHTML = '<div>The Lord is my shepherd;</div><div>I shall not want.</div>';
    document.body.appendChild(container);
    const range = document.createRange();
    range.setStart(container.firstChild.firstChild, 9);
    range.setEnd(container.lastChild.firstChild, 7);
    range.getBoundingClientRect = () => ({ left: 10, top: 100, right: 200, bottom: 120, width: 190, height: 20 });
    window.getSelection = () => ({
      isCollapsed: false, rangeCount: 1, getRangeAt: () => range,
      removeAllRanges: vi.fn(), toString: () => range.toString(),
    });
    render(<SelectionToolbar />);
    fireEvent.contextMenu(container, { clientX: 20, clientY: 100 });
    fireEvent.click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Bookmark'));
    const arg = window.__bookmarkCreate.mock.calls[0][0];
    expect(arg.hlKey).toBe('bible:psalms:23:1:9-31');
    expect(arg.defaultLabel).toBe('is my shepherd; I shall');
    expect(arg.excerpt).toBe('is my shepherd;\nI shall');
  });
});
