/* LetterExcerptPickerScreen — SHEETS-UX 2026-07-12 footer + breadcrumb.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) the breadcrumb; (2) no header ✓; (3) the footer's honest
   stateful label — "Link the whole letter" with nothing selected (the old
   behaviour was hidden behind an empty ✓ tap) and that it still persists the
   whole-letter link. Reads bare globals, so we stub them. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
});
