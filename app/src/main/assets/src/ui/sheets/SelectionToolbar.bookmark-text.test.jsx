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
