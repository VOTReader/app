/* VersePickerScreen — SHEETS-UX 2026-07-12 footer + breadcrumb.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) the step breadcrumb ("Linking from …"); (2) the header no longer
   carries the ambiguous ✓ (which silently cancelled when nothing was
   selected — the old dead-end); (3) the footer primary is DISABLED until a
   selection exists, then enables to "Link this selection" and confirms.
   Reads bare globals, so we stub them. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { VersePickerScreen } from './VersePickerScreen.jsx';
import { snapRangeToWords } from '../../renderer/annotation-engine.jsx';

function stubGlobals() {
  window._allBooks = () => ({ genesis: { chapters: [{ num: 1, verses: [{ n: 1, text: 'In the beginning God created the heavens and the earth.' }, { n: 2, text: 'And the earth was without form.' }] }] } });
  window._matthew = () => null;
  window.snapRangeToWords = (t, s, e) => ({ start: s, end: e });
  window.bibleHlKey = (b, c, v) => 'bible:' + b + ':' + c + ':' + v;
  window.buildSourceEndpoint = () => ({ key: 's', label: 'src' });
  window.persistLink = vi.fn(() => ({ id: 'lnk1' }));
}

afterEach(() => {
  cleanup();
  ['_allBooks', '_matthew', 'snapRangeToWords', 'bibleHlKey', 'buildSourceEndpoint', 'persistLink'].forEach(k => delete window[k]);
});

const refineRequest = {
  target: { type: 'bible', bookId: 'genesis', chapter: 1, label: 'Genesis 1', key: 'bible:genesis:1' },
  item: { title: 'Genesis' },
};
const baseProps = {
  refineRequest,
  sourceKey: 'bible:john:3:16', sourceLabel: 'John 3:16',
  sourceStart: undefined, sourceEnd: undefined, sourceText: '',
  onClose: () => {}, returnTargetInsteadOfLink: false,
};

describe('VersePickerScreen breadcrumb + footer', () => {
  it('shows the link-flow breadcrumb', () => {
    stubGlobals();
    render(<VersePickerScreen {...baseProps} />);
    expect(screen.getByText('Linking from John 3:16')).toBeTruthy();
  });

  it('has no ambiguous header ✓ (the old silent-cancel dead-end is gone)', () => {
    stubGlobals();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    expect(container.querySelector('.picker-confirm')).toBeNull();
  });

  it('footer starts DISABLED with an instructional label', () => {
    stubGlobals();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    const btn = /** @type {HTMLButtonElement} */ (container.querySelector('.picker-footer-btn'));
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Select a verse to continue');
  });

  // Sweep low (mw10): the verse number (the hint's 'tap a verse number to grab the whole verse') took
  // no focus and no key, so a keyboard reader had no way to pick a verse.
  it('a verse number is a keyboard control: Enter picks the whole verse', () => {
    stubGlobals();
    const { container } = render(<VersePickerScreen {...baseProps} onClose={vi.fn()} />);
    const num = /** @type {HTMLElement} */ (container.querySelector('.picker-verse-num'));
    expect(num.getAttribute('role')).toBe('button');
    expect(num.tabIndex).toBe(0);
    expect(num.getAttribute('aria-label')).toMatch(/^Select verse \d+$/);
    fireEvent.keyDown(num, { key: 'Enter' });
    const btn = /** @type {HTMLButtonElement} */ (container.querySelector('.picker-footer-btn'));
    expect(btn.disabled).toBe(false);
  });

  it('tapping a verse number enables the footer + confirms the link', () => {
    stubGlobals();
    const onClose = vi.fn();
    const { container } = render(<VersePickerScreen {...baseProps} onClose={onClose} />);
    fireEvent.click(container.querySelector('.picker-verse-num'));
    const btn = /** @type {HTMLButtonElement} */ (container.querySelector('.picker-footer-btn'));
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Link this selection');
    fireEvent.click(btn);
    expect(window.persistLink).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith({ id: 'lnk1' });
  });

  it('journal (return-target) mode labels the footer "Insert this selection"', () => {
    stubGlobals();
    const onClose = vi.fn();
    const { container } = render(<VersePickerScreen {...baseProps} returnTargetInsteadOfLink={true} onClose={onClose} />);
    fireEvent.click(container.querySelector('.picker-verse-num'));
    const btn = container.querySelector('.picker-footer-btn');
    expect(btn.textContent).toBe('Insert this selection');
    fireEvent.click(btn);
    // return-target mode hands the refined target back through onClose, no link persisted
    expect(window.persistLink).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

/* ── SESSION-2 (UX-BATCH-2026-07-12): verse filter + selectionchange ── */

describe('VersePickerScreen find + selectionchange', () => {
  it('the verse filter narrows the list live and clears back to the full chapter', () => {
    stubGlobals();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    expect(container.querySelectorAll('.picker-verse-selectable').length).toBe(2);
    fireEvent.change(container.querySelector('.picker-find-input'), { target: { value: 'without form' } });
    expect(container.querySelectorAll('.picker-verse-selectable').length).toBe(1);
    expect(container.querySelector('.picker-find-count').textContent).toBe('1 of 2');
    fireEvent.change(container.querySelector('.picker-find-input'), { target: { value: '' } });
    expect(container.querySelectorAll('.picker-verse-selectable').length).toBe(2);
  });

  it('a drag-selection with NO touchend (native handles) still enables the footer', () => {
    // Same WebView reality as the excerpt picker: the long-press selection's
    // touchend arrives non-bubbling and handle drags fire no page touch
    // events — document selectionchange must drive the commit.
    vi.useFakeTimers();
    stubGlobals();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    const textNode = container.querySelectorAll('.picker-verse-text')[0].firstChild;
    const getSelectionOrig = window.getSelection;
    window.getSelection = /** @type {any} */ (() => ({
      isCollapsed: false, rangeCount: 1,
      getRangeAt: () => ({
        startContainer: textNode, startOffset: 0,
        endContainer: textNode, endOffset: 16,
        toString: () => 'In the beginning',
      }),
    }));
    try {
      act(() => { document.dispatchEvent(new Event('selectionchange')); });
      act(() => { vi.advanceTimersByTime(200); });
      const btn = /** @type {HTMLButtonElement} */ (container.querySelector('.picker-footer-btn'));
      expect(btn.disabled).toBe(false);
      expect(btn.textContent).toBe('Link this selection');
    } finally {
      window.getSelection = getSelectionOrig;
      vi.useRealTimers();
    }
  });
});

/* Tapping a verse number takes the whole verse and CLEARS the native selection
   ("so the visual is purely the .is-selected ring"), but the rows never got
   the class, and .is-selected was styled only on a legacy .picker-verse row:
   the verse the footer was about to link showed no mark at all. */
describe('VersePickerScreen marks a whole verse taken by its number', () => {
  it('rings the tapped verse, and only it', () => {
    stubGlobals();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    const rows = () => [...container.querySelectorAll('.picker-verse-selectable')];
    expect(rows().some((r) => r.classList.contains('is-selected'))).toBe(false);
    fireEvent.click(container.querySelectorAll('.picker-verse-num')[1]);
    expect(rows().map((r) => r.classList.contains('is-selected'))).toEqual([false, true]);
    fireEvent.click(container.querySelectorAll('.picker-verse-num')[0]);
    expect(rows().map((r) => r.classList.contains('is-selected'))).toEqual([true, false]);
  });

  it('a later drag-selection takes over: its own highlight is the mark, not a whole-verse ring', () => {
    vi.useFakeTimers();
    stubGlobals();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    fireEvent.click(container.querySelectorAll('.picker-verse-num')[0]);
    const textNode = container.querySelectorAll('.picker-verse-text')[1].firstChild;
    const getSelectionOrig = window.getSelection;
    window.getSelection = /** @type {any} */ (() => ({
      isCollapsed: false, rangeCount: 1,
      getRangeAt: () => ({ startContainer: textNode, startOffset: 4, endContainer: textNode, endOffset: 13, toString: () => 'earth was' }),
    }));
    try {
      act(() => { document.dispatchEvent(new Event('selectionchange')); });
      act(() => { vi.advanceTimersByTime(200); });
      expect(container.querySelector('.picker-verse-selectable.is-selected')).toBeNull();
      expect(container.querySelector('.picker-footer-btn').textContent).toBe('Link this selection');
    } finally {
      window.getSelection = getSelectionOrig;
      vi.useRealTimers();
    }
  });
});

/* sweep v6: Chrome's triple-click (and a drag released just past a line end)
   ends the Range at offset 0 of the NEXT <p data-verse>. That boundary names a
   verse the reader took no character of, yet the picker linked it: triple-
   click verse 1, "Link this selection", and the link read "Genesis 1:1-2",
   partial, keyed '…:1-2:0-0'. SelectionToolbar fixed the same shape
   (annotation-selection-8); the picker did not. These run the REAL word
   snapper: it trims a verse's closing '.', which must not make a whole verse
   taken this way read as partial. */
describe('VersePickerScreen: a selection ending at offset 0 of the next verse', () => {
  const V1 = 'In the beginning God created the heavens and the earth.';
  const V2 = 'And the earth was without form.';
  const V3 = 'And God said, Let there be light: and there was light.';

  function stubGlobalsRealSnap() {
    stubGlobals();
    window.snapRangeToWords = snapRangeToWords;
  }

  function selectRange(range) {
    window.getSelection = /** @type {any} */ (() => ({
      isCollapsed: range.collapsed, rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges: () => {},
      toString: () => range.toString(),
    }));
    act(() => { document.dispatchEvent(new Event('selectionchange')); });
    act(() => { vi.advanceTimersByTime(200); });
  }

  /** @param {HTMLElement} container */
  function confirm(container) {
    const btn = /** @type {HTMLButtonElement} */ (container.querySelector('.picker-footer-btn'));
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(window.persistLink).toHaveBeenCalledTimes(1);
    return window.persistLink.mock.calls[0][1];
  }

  const getSelectionOrig = window.getSelection;
  afterEach(() => { window.getSelection = getSelectionOrig; vi.useRealTimers(); });

  it('a triple-clicked verse links that verse alone, whole', () => {
    vi.useFakeTimers();
    stubGlobalsRealSnap();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    const rows = container.querySelectorAll('.picker-verse-selectable');
    const range = document.createRange();
    range.setStart(rows[0].querySelector('.picker-verse-num').firstChild, 0);  // the paragraph's first text node
    range.setEnd(rows[1], 0);                                                  // the NEXT <p data-verse>, offset 0
    selectRange(range);
    const target = confirm(container);
    expect(target.verse).toBe(1);
    expect(target.verseEnd).toBeUndefined();
    expect(target.partial).toBeUndefined();
    expect(target.key).toBe('bible:genesis:1:1');
    expect(target.label).toBe('Genesis 1:1');
  });

  it('a drag from mid-verse released past the line end keeps the end on that verse, at its full length', () => {
    vi.useFakeTimers();
    stubGlobalsRealSnap();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    const rows = container.querySelectorAll('.picker-verse-selectable');
    const range = document.createRange();
    range.setStart(rows[0].querySelector('.picker-verse-text').firstChild, 17);  // "God created …"
    range.setEnd(rows[1], 0);
    selectRange(range);
    const target = confirm(container);
    expect(target.verse).toBe(1);
    expect(target.verseEnd).toBeUndefined();
    expect(target.partial).toBe(true);
    expect([target.charStart, target.charEnd]).toEqual([17, V1.length]);
    expect(target.key).toBe('bible:genesis:1:1:17-' + V1.length);
  });

  it('with the list filtered, the end steps back to the previous verse SHOWN, not verse n-1', () => {
    vi.useFakeTimers();
    stubGlobalsRealSnap();
    window._allBooks = () => ({ genesis: { chapters: [{ num: 1, verses: [{ n: 1, text: V1 }, { n: 2, text: V2 }, { n: 3, text: V3 }] }] } });
    const { container } = render(<VersePickerScreen {...baseProps} />);
    fireEvent.change(container.querySelector('.picker-find-input'), { target: { value: 'god' } });
    const rows = container.querySelectorAll('.picker-verse-selectable');
    expect([...rows].map((r) => r.getAttribute('data-verse'))).toEqual(['1', '3']);
    const range = document.createRange();
    range.setStart(rows[0].querySelector('.picker-verse-num').firstChild, 0);
    range.setEnd(rows[1], 0);   // verse 3's <p>: verse 2 is not on screen
    selectRange(range);
    const target = confirm(container);
    expect(target.verse).toBe(1);
    expect(target.verseEnd).toBeUndefined();
    expect(target.partial).toBeUndefined();
    expect(target.key).toBe('bible:genesis:1:1');
  });

  it('a selection from the very close of a verse to offset 0 of the next takes no word: nothing to link', () => {
    vi.useFakeTimers();
    stubGlobalsRealSnap();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    const rows = container.querySelectorAll('.picker-verse-selectable');
    const range = document.createRange();
    range.setStart(rows[0].querySelector('.picker-verse-text').firstChild, V1.length);
    range.setEnd(rows[1], 0);
    selectRange(range);
    const btn = /** @type {HTMLButtonElement} */ (container.querySelector('.picker-footer-btn'));
    expect(btn.disabled).toBe(true);
  });

  it('a selection that really reaches into the next verse still spans both', () => {
    vi.useFakeTimers();
    stubGlobalsRealSnap();
    const { container } = render(<VersePickerScreen {...baseProps} />);
    const rows = container.querySelectorAll('.picker-verse-selectable');
    const range = document.createRange();
    range.setStart(rows[0].querySelector('.picker-verse-num').firstChild, 0);
    range.setEnd(rows[1].querySelector('.picker-verse-text').firstChild, 9);   // "And the e…" → snaps to "earth"
    selectRange(range);
    const target = confirm(container);
    expect(target.verse).toBe(1);
    expect(target.verseEnd).toBe(2);
    expect(target.partial).toBe(true);
  });
});
