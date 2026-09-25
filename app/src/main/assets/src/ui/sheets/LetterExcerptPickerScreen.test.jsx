/* LetterExcerptPickerScreen — SHEETS-UX 2026-07-12 footer + breadcrumb.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) the breadcrumb; (2) no header ✓; (3) the footer's honest
   stateful label — "Link the whole letter" with nothing selected (the old
   behaviour was hidden behind an empty ✓ tap) and that it still persists the
   whole-letter link. Reads bare globals, so we stub them. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { LetterExcerptPickerScreen } from './LetterExcerptPickerScreen.jsx';
import { snapSelectionRange } from '../../renderer/annotation-engine.jsx';
import { segmentsDomText } from '../../utils/segment-dom-text.js';

function stubGlobals(entry) {
  window.findEntryContext = () => ({ entry: entry || { title: 'The Wide Path', blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Peoples of the earth, hear the word of the Lord.' }] }] } });
  // The reader's own snap (whole words, never across a line), as the app has it.
  window.snapSelectionRange = snapSelectionRange;
  window.buildSourceEndpoint = () => ({ key: 's', label: 'src' });
  window.persistLink = vi.fn(() => ({ id: 'lnk1' }));
}

afterEach(() => {
  cleanup();
  ['findEntryContext', 'snapSelectionRange', 'buildSourceEndpoint', 'persistLink', 'COLLECTIONS'].forEach(k => delete window[k]);
});

/** Stand in a native selection that starts `offset` characters into `textNode`
    and reads `text` (what captureSelectionSync consults). */
function withSelection(textNode, offset, text, fn) {
  const getSelectionOrig = window.getSelection;
  window.getSelection = /** @type {any} */ (() => ({
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({ startContainer: textNode, startOffset: offset, toString: () => text }),
  }));
  try { return fn(); } finally { window.getSelection = getSelectionOrig; }
}

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

/* THE READER'S TEXT (2026-09-25). An excerpt link stores offsets into a reader
   block, and dom-links.js counts them through the READER's DOM to place the
   link's chain icon. The picker used to draw its own text: segments glued with
   '' ("Lord:Many"), letter-links missing, {{ref:…}} raw, footnote numbers
   dropped, poetry lines joined by "\n", WTLB markup and soft breaks half-kept.
   Every one of those moved the stored offsets off the words that were picked. */
describe('LetterExcerptPickerScreen draws the reader\'s own text', () => {
  const PARA = [
    { t: 'bold-italic', v: 'Thus says The Lord:' },
    { t: 'text', v: 'Behold, by their fruits you shall know them.' },
    { t: 'fn', v: '2' },
    { t: 'text', v: 'And was I speaking only of the false? (' },
    { t: 'letter-link', label: '"Grafted In"' },
    { t: 'text', v: ')' },
    { t: 'italic', v: '({{ref:1 John 1:9}})' },
  ];
  const letter = (blocks) => ({ title: 'The Wide Path', blocks });

  it('a prose block holds exactly the textContent the reader renders, its footnote a superscript', () => {
    stubGlobals(letter([{ type: 'para', segments: PARA }]));
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} />);
    const block = container.querySelector('[data-block-key="0"]');
    expect(block.textContent).toBe(segmentsDomText(PARA));
    expect(block.textContent).toContain('Thus says The Lord: Behold');
    expect(block.textContent).toContain('("Grafted In") (1 John 1:9)');
    expect(block.textContent).not.toContain('{{ref:');
    expect(block.querySelector('sup.picker-fn').textContent).toBe('2');
  });

  it('a selection across a footnote stores the reader\'s offsets and quotes the words without the number', () => {
    vi.useFakeTimers();
    stubGlobals(letter([{ type: 'heading', text: 'A heading' }, { type: 'para', segments: PARA }]));
    const onClose = vi.fn();
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} onClose={onClose} />);
    const block = container.querySelector('[data-block-key="1"]');
    const node = [...block.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.includes('know them'));
    const reader = segmentsDomText(PARA);
    try {
      // A drag from "know" that overshoots into the next word's first letters:
      // the snap takes the whole word, as the reader's toolbar does.
      withSelection(node, node.nodeValue.indexOf('know'), 'know them.2 And was I spea', () => {
        act(() => { document.dispatchEvent(new Event('selectionchange')); });
        act(() => { vi.advanceTimersByTime(200); });
      });
      expect(container.querySelector('.picker-selection-hint').textContent).toBe('"know them. And was I speaking"');
      fireEvent.click(container.querySelector('.picker-footer-btn'));
    } finally {
      vi.useRealTimers();
    }
    const target = window.persistLink.mock.calls[0][1];
    const [, s, e] = /:(\d+)-(\d+)$/.exec(target.key);
    expect(target.key).toBe('letter:the-wide-path:1:' + s + '-' + e);
    // The offsets address the picked words IN THE READER's text, where
    // dom-links.js will count them.
    expect(reader.slice(Number(s), Number(e))).toBe('know them.2 And was I speaking');
    expect(target.text).toBe('know them. And was I speaking');
  });

  it('draws poetry lines on their own lines without adding a character, and finds across the break', () => {
    const poem = { type: 'poetry', lines: [[{ t: 'text', v: 'Come unto Me,' }], [{ t: 'italic', v: 'all ye that labour.' }]] };
    stubGlobals(letter([poem]));
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} />);
    const block = container.querySelector('[data-block-key="0"]');
    expect(block.textContent).toBe('Come unto Me,all ye that labour.');   // the reader's lines abut the same way
    expect(block.querySelectorAll('br')).toHaveLength(1);
    fireEvent.change(container.querySelector('.picker-find-input'), { target: { value: 'me, all' } });
    expect(container.querySelector('.picker-find-count').textContent).toBe('1 of 1');
  });

  it('a WTLB paragraph reads as WtlbEntryView renders it: no markup, the reference as a cite, breaks as lines', () => {
    stubGlobals({ title: 'Words To Live By 12', paragraphs: [{ text: 'For it is written:\n\n_Man shall not live by bread alone_ {{ref:Matthew 4:4}}' }] });
    window.COLLECTIONS = [{ volKey: 'wtlb1', label: 'Words To Live By - Part One' }];
    const refine = { target: { type: 'wtlb', entryId: 'w12', key: 'wtlb:w12:0', collection: 'Words To Live By - Part One' }, item: { label: 'Words To Live By 12' } };
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} refineRequest={refine} />);
    const block = container.querySelector('[data-block-key="0"]');
    expect(block.textContent).toBe('For it is written:Man shall not live by bread alone (Matthew 4:4)');
    expect(block.querySelectorAll('br')).toHaveLength(2);
    expect(block.querySelector('sup')).toBeNull();
  });

  it('an Answers or Holy Days paragraph shows its reference as the footnote number its route renders', () => {
    stubGlobals({ title: 'Faith', paragraphs: [{ text: 'Walk by faith {{ref:2 Corinthians 5:7}} and not by sight.' }] });
    window.COLLECTIONS = [{ volKey: 'answers', label: 'Answers Only God Can Give' }];
    const refine = { target: { type: 'letter', letterId: 'faith', key: 'letter:faith:0', collection: 'Answers Only God Can Give' }, item: { label: 'Faith' } };
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} refineRequest={refine} />);
    const block = container.querySelector('[data-block-key="0"]');
    expect(block.textContent).toBe('Walk by faith 1 and not by sight.');
    expect(block.querySelector('sup.picker-fn').textContent).toBe('1');
  });

  it('keeps the find row out of the scrolling body, so ‹ › stay in reach once a hit scrolls the letter', () => {
    stubGlobals();
    const { container } = render(<LetterExcerptPickerScreen {...baseProps} />);
    const find = container.querySelector('.picker-find');
    expect(find).toBeTruthy();
    expect(container.querySelector('.picker-body').contains(find)).toBe(false);
  });
});
