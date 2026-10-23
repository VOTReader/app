/* id-datasafe 127: a linked-entry card whose entry was deleted still looked like a link,
   and a tap opened 'Entry Not Found'. It is now inert and says the entry was deleted;
   before the journal store has loaded it stays a link (the entry may only be on its way). */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { JournalBlockView } from './JournalViewerScreen.jsx';

const CARD = { id: 'b1', type: 'journal-card', entryId: 'gone' };

function withStore(ready) {
  /** @type {any} */ (globalThis).JournalStore = { get: () => null, isReady: () => ready };
  /** @type {any} */ (globalThis).JournalHelpers = { previewText: () => '', entryDisplayTitle: (e) => e.title };
}

afterEach(() => {
  cleanup();
  delete (/** @type {any} */ (globalThis).JournalStore);
  delete (/** @type {any} */ (globalThis).JournalHelpers);
});

describe('a linked-entry card for a deleted entry', () => {
  it('is inert and says the entry was deleted', () => {
    withStore(true);
    const onJournalCard = vi.fn();
    const { container, getByText } = render(<JournalBlockView block={CARD} callbacks={{ onJournalCard }} entryId="e1" blockIndex={0} />);
    const card = /** @type {HTMLElement} */ (container.querySelector('.jrn-embed-journal'));
    expect(getByText('This entry was deleted')).toBeTruthy();
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('tabindex')).toBeNull();
    expect(card.querySelector('.jrn-emb-arrow')).toBeNull();
    fireEvent.click(card);
    expect(onJournalCard).not.toHaveBeenCalled();
  });

  it('stays a link while the journal store is still loading', () => {
    withStore(false);
    const onJournalCard = vi.fn();
    const { container } = render(<JournalBlockView block={CARD} callbacks={{ onJournalCard }} entryId="e1" blockIndex={0} />);
    const card = /** @type {HTMLElement} */ (container.querySelector('.jrn-embed-journal'));
    expect(card.textContent).not.toContain('deleted');
    fireEvent.click(card);
    expect(onJournalCard).toHaveBeenCalledWith('gone');
  });
});
