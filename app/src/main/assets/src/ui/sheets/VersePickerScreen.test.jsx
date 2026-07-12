/* VersePickerScreen — SHEETS-UX 2026-07-12 footer + breadcrumb.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) the step breadcrumb ("Linking from …"); (2) the header no longer
   carries the ambiguous ✓ (which silently cancelled when nothing was
   selected — the old dead-end); (3) the footer primary is DISABLED until a
   selection exists, then enables to "Link this selection" and confirms.
   Reads bare globals, so we stub them. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VersePickerScreen } from './VersePickerScreen.jsx';

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
