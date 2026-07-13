/* LetterExcerptPickerScreen — SHEETS-UX 2026-07-12 footer + breadcrumb.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) the breadcrumb; (2) no header ✓; (3) the footer's honest
   stateful label — "Link the whole letter" with nothing selected (the old
   behaviour was hidden behind an empty ✓ tap) and that it still persists the
   whole-letter link. Reads bare globals, so we stub them. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { LetterExcerptPickerScreen } from './LetterExcerptPickerScreen.jsx';

function stubGlobals() {
  window.findEntryContext = () => ({ entry: { title: 'The Wide Path', blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Peoples of the earth, hear the word of the Lord.' }] }] } });
  window.snapRangeToWords = (t, s, e) => ({ start: s, end: e });
  window.buildSourceEndpoint = () => ({ key: 's', label: 'src' });
  window.persistLink = vi.fn(() => ({ id: 'lnk1' }));
}

afterEach(() => {
  cleanup();
  ['findEntryContext', 'snapRangeToWords', 'buildSourceEndpoint', 'persistLink'].forEach(k => delete window[k]);
});

const refineRequest = {
  target: { type: 'letter', letterId: 'the-wide-path', key: 'letter:the-wide-path', collection: 'Volume Two' },
  item: { label: 'The Wide Path', collection: 'Volume Two' },
};
const baseProps = {
  refineRequest,
  sourceKey: 'bible:john:3:16', sourceLabel: 'John 3:16',
  sourceStart: undefined, sourceEnd: undefined, sourceText: '',
  onClose: () => {}, returnTargetInsteadOfLink: false,
};

describe('LetterExcerptPickerScreen breadcrumb + footer', () => {
  it('shows the breadcrumb and no header ✓', () => {
    stubGlobals();
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} />);
    expect(screen.getByText('Linking from John 3:16')).toBeTruthy();
    expect(container.querySelector('.picker-confirm')).toBeNull();
  });

  it('with nothing selected the footer explicitly offers the whole letter', () => {
    stubGlobals();
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} />);
    const btn = /** @type {HTMLButtonElement} */ (container.querySelector('.picker-footer-btn'));
    expect(btn.textContent).toBe('Link the whole letter');
    expect(btn.disabled).toBe(false);
  });

  it('tapping the whole-letter footer persists the link + closes', () => {
    stubGlobals();
    const onClose = vi.fn();
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} onClose={onClose} />);
    fireEvent.click(container.querySelector('.picker-footer-btn'));
    expect(window.persistLink).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith({ id: 'lnk1' });
  });

  it('journal (return-target) mode labels the footer "Insert the whole letter"', () => {
    stubGlobals();
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} returnTargetInsteadOfLink={true} />);
    expect(container.querySelector('.picker-footer-btn').textContent).toBe('Insert the whole letter');
  });

  it('find-in-letter counts matching paragraphs and washes the current hit', () => {
    stubGlobals();
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} />);
    fireEvent.change(container.querySelector('.picker-find-input'), { target: { value: 'earth' } });
    expect(container.querySelector('.picker-find-count').textContent).toBe('1 of 1');
    expect(container.querySelector('.picker-letter-block').className).toContain('picker-find-hit');
    fireEvent.change(container.querySelector('.picker-find-input'), { target: { value: 'zzz-nowhere' } });
    expect(container.querySelector('.picker-find-count').textContent).toBe('0 found');
    expect(container.querySelector('.picker-find-hit')).toBeNull();
  });

  /* Owner-reported: on Android a long-press selection's touchend is delivered
     NON-BUBBLING by the WebView, and selection-HANDLE drags fire no page touch
     events at all — so the touchend fast path never ran and the footer only
     recognized the selection after a later scroll gesture. The document
     'selectionchange' listener must commit the selection with NO touch/mouse
     event ever reaching the picker body. (RED vs the pre-fix component.) */
  it('a selection made with NO touchend (native handles) still enables the excerpt footer', () => {
    vi.useFakeTimers();
    stubGlobals();
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} />);
    const block = container.querySelector('[data-block-key]');
    const textNode = block.firstChild;
    // Selection-like over "of the earth" inside the real rendered block —
    // captureSelectionSync builds its preRange from real jsdom Ranges.
    const getSelectionOrig = window.getSelection;
    window.getSelection = /** @type {any} */ (() => ({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => ({ startContainer: textNode, startOffset: 8, toString: () => 'of the earth' }),
    }));
    try {
      expect(container.querySelector('.picker-footer-btn').textContent).toBe('Link the whole letter');
      // ONLY selectionchange — no mouseup, no touchend.
      act(() => { document.dispatchEvent(new Event('selectionchange')); });
      act(() => { vi.advanceTimersByTime(200); }); // past the 150ms debounce
      expect(container.querySelector('.picker-footer-btn').textContent).toBe('Link this excerpt');
      expect(container.querySelector('.picker-selection-hint').textContent).toContain('of the earth');
    } finally {
      window.getSelection = getSelectionOrig;
      vi.useRealTimers();
    }
  });
});
