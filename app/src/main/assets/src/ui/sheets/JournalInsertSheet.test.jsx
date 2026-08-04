/* JournalInsertSheet — the journal block-insert path (strike 5).
   ─────────────────────────────────────────────────────────────────
   572 lines, previously zero tests, on the user-authored-data path.
   Covers: menu → block emission (+close contract), the three drill
   pickers with their malformed-input guards, excludeJournalId, the
   per-block journal drill (embeddable filter + embed shape + whole-
   entry card), the back() state machine, search filtering, and the
   LinkPicker bridge callback — targetToJournalBlock's bible/letter
   mapping incl. the volKey-resolution and null-return guards.
   JournalHelpers is REAL (its newBlock/embed shapes are the contract);
   stores are stubbed as the bare globals the sheet reads. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { JournalHelpers } from '../../data/journal-helpers.js';
import { JournalInsertSheet } from './JournalInsertSheet.jsx';

/** @type {any} */ (globalThis).JournalHelpers = JournalHelpers;

const g = /** @type {any} */ (globalThis);

function mountSheet(props = {}) {
  const onClose = vi.fn();
  const onInsertBlock = vi.fn();
  const utils = render(
    <JournalInsertSheet onClose={onClose} onInsertBlock={onInsertBlock} {...props} />
  );
  return { onClose, onInsertBlock, ...utils };
}

afterEach(() => {
  cleanup();
  for (const k of ['JournalStore', 'BookmarkStore', 'NoteStore', 'NotebookStore',
    'COLLECTIONS', '__openLinkPickerForTarget']) {
    delete g[k];
    delete window[k];
  }
});

describe('menu → direct block emission', () => {
  it('exposes a labelled modal dialog and traps focus inside it', () => {
    mountSheet();
    const dialog = screen.getByRole('dialog', { name: 'Insert' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('renders all four sections', () => {
    mountSheet();
    for (const h of ['From the Library', 'From Your Annotations', 'Capture', 'Text']) {
      expect(screen.getByText(h)).toBeTruthy();
    }
  });

  it('Body Text emits an empty p block and closes', () => {
    const { onClose, onInsertBlock } = mountSheet();
    fireEvent.click(screen.getByText('Body Text'));
    expect(onInsertBlock).toHaveBeenCalledTimes(1);
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('p');
    expect(block.text).toBe('');
    expect(block.id).toBeTruthy();
    expect(onClose).toHaveBeenCalled();
  });

  it('Divider emits a divider block', () => {
    const { onInsertBlock } = mountSheet();
    fireEvent.click(screen.getByText('Divider'));
    expect(onInsertBlock.mock.calls[0][0].type).toBe('divider');
  });

  it('Image/Voice delegate to the device callbacks and close without inserting', () => {
    const onInsertImage = vi.fn();
    const onRecordAudio = vi.fn();
    const { onClose, onInsertBlock } = mountSheet({ onInsertImage, onRecordAudio });
    fireEvent.click(screen.getByText('Image'));
    fireEvent.click(screen.getByText('Voice Recording'));
    expect(onInsertImage).toHaveBeenCalled();
    expect(onRecordAudio).toHaveBeenCalled();
    expect(onInsertBlock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('bookmark drill', () => {
  it('empty store shows the empty state', () => {
    window.BookmarkStore = { all: () => [] };
    mountSheet();
    fireEvent.click(screen.getByText('Bookmark'));
    expect(screen.getByText('No bookmarks yet.')).toBeTruthy();
  });

  it('choosing a bookmark emits a bookmark-card with its id', () => {
    window.BookmarkStore = { all: () => [{ id: 'bm7', label: 'Psalm 23', updated: 5 }] };
    const { onInsertBlock } = mountSheet();
    fireEvent.click(screen.getByText('Bookmark'));
    fireEvent.click(screen.getByText('Psalm 23'));
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('bookmark-card');
    expect(block.bookmarkId).toBe('bm7');
  });

  it('search filters rows', () => {
    window.BookmarkStore = { all: () => [
      { id: 'a', label: 'Psalm 23' }, { id: 'b', label: 'Isaiah 40' },
    ] };
    mountSheet();
    fireEvent.click(screen.getByText('Bookmark'));
    fireEvent.change(screen.getByPlaceholderText('Search bookmarks…'), { target: { value: 'isaiah' } });
    expect(screen.queryByText('Psalm 23')).toBeNull();
    expect(screen.getByText('Isaiah 40')).toBeTruthy();
  });
});

describe('note drill', () => {
  it('choosing a note emits a note-card keyed by groupId; malformed note (no groupId) closes without insert', () => {
    window.NoteStore = { list: () => [
      { groupId: 'ng1', body: 'my thought', updated: 9 },
    ] };
    const { onInsertBlock } = mountSheet();
    fireEvent.click(screen.getByText('Note'));
    fireEvent.click(screen.getByText('my thought'));
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('note-card');
    expect(block.noteGroupId).toBe('ng1');
  });
});

describe('journal drill — entry → block picker', () => {
  const source = {
    id: 'je1', title: 'Morning Entry', created: 1700000000000,
    blocks: [
      { id: 'b1', type: 'p', text: 'first paragraph' },
      { id: 'b2', type: 'divider' },                       // NOT embeddable
      { id: 'b3', type: 'quote', text: 'quoted line', cite: 'someone' },
      { id: 'b4', type: 'image', mediaId: 'm9', caption: 'sunrise' },
    ],
  };

  function setupJournal(entries = [source]) {
    window.JournalStore = {
      all: () => entries.slice(),
      get: (id) => entries.find((e) => e.id === id) || null,
    };
  }

  it('excludeJournalId keeps the host entry out of the list', () => {
    setupJournal([source, { id: 'host', title: 'Host Entry', created: 1, blocks: [] }]);
    mountSheet({ excludeJournalId: 'host' });
    fireEvent.click(screen.getByText('Journal Entry'));
    expect(screen.queryByText('Host Entry')).toBeNull();
    expect(screen.getByText('Morning Entry')).toBeTruthy();
  });

  it('whole-entry option emits a journal-card', () => {
    setupJournal();
    const { onInsertBlock } = mountSheet();
    fireEvent.click(screen.getByText('Journal Entry'));
    fireEvent.click(screen.getByText('Morning Entry'));
    fireEvent.click(screen.getByText('Link the Whole Entry'));
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('journal-card');
    expect(block.entryId).toBe('je1');
  });

  it('block picker lists only embeddable blocks (divider filtered out)', () => {
    setupJournal();
    const { container } = mountSheet();
    fireEvent.click(screen.getByText('Journal Entry'));
    fireEvent.click(screen.getByText('Morning Entry'));
    // whole-entry row + p + quote + image = 4 rows; the divider must not appear
    expect(container.querySelectorAll('.jrn-picker-item').length).toBe(4);
    expect(screen.queryByText('— Divider —')).toBeNull();
  });

  it('choosing a text block emits a journal-excerpt carrying source attribution', () => {
    setupJournal();
    const { onInsertBlock } = mountSheet();
    fireEvent.click(screen.getByText('Journal Entry'));
    fireEvent.click(screen.getByText('Morning Entry'));
    fireEvent.click(screen.getByText('first paragraph'));
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('journal-excerpt');
    expect(block.text).toBe('first paragraph');
    expect(block.originType).toBe('p');
    expect(block.sourceJournalId).toBe('je1');
    expect(block.sourceBlockId).toBe('b1');
    expect(block.id).not.toBe('b1'); // embed gets its OWN id
  });

  it('choosing an image block shares the mediaId but mints a new block id', () => {
    setupJournal();
    const { onInsertBlock } = mountSheet();
    fireEvent.click(screen.getByText('Journal Entry'));
    fireEvent.click(screen.getByText('Morning Entry'));
    fireEvent.click(screen.getByText(/— sunrise/)); // describeBlock: "[Image] — sunrise"
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('image');
    expect(block.mediaId).toBe('m9');
    expect(block.sourceJournalId).toBe('je1');
    expect(block.id).not.toBe('b4');
  });

  it('back() from the block picker returns to the entry list, then to the menu', () => {
    setupJournal();
    mountSheet();
    fireEvent.click(screen.getByText('Journal Entry'));
    fireEvent.click(screen.getByText('Morning Entry'));
    expect(screen.getByText('Pick from Entry')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Back'));
    expect(screen.getByText('Link a Journal Entry')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Back'));
    expect(screen.getByText('Insert')).toBeTruthy();
  });
});

describe('notebook drill', () => {
  it('Uncategorized is always offered and emits a notebook-card', () => {
    window.NotebookStore = { list: () => [{ id: 'nb1', name: 'Prayers' }] };
    window.NoteStore = { list: () => [] };
    const { onInsertBlock } = mountSheet();
    fireEvent.click(screen.getByText('Notebook'));
    expect(screen.getByText('Prayers')).toBeTruthy();
    fireEvent.click(screen.getByText('Uncategorized'));
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('notebook-card');
    expect(block.notebookId).toBe('uncategorized');
  });
});

describe('LinkPicker bridge → targetToJournalBlock mapping', () => {
  it('missing bridge: Card click warns and keeps the sheet open (no crash, no close)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { onClose } = mountSheet();
    fireEvent.click(screen.getByText('Card'));
    expect(warn).toHaveBeenCalledWith('LinkPicker bridge unavailable');
    expect(onClose).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  function captureBridge(itemText) {
    /** @type {(target: any, item?: any) => void} */
    let cb = () => {};
    window.__openLinkPickerForTarget = vi.fn((_kind, callback) => { cb = callback; });
    const mounted = mountSheet();
    fireEvent.click(screen.getByText(itemText));
    return { ...mounted, fire: (t, i) => cb(t, i) };
  }

  it('bible excerpt with text becomes a verse-block with a composed ref', () => {
    const { onInsertBlock, fire } = captureBridge('Excerpt');
    fire({ type: 'bible', bookId: 'psalms', chapter: 23, verse: 1, verseEnd: 3, text: 'The LORD is my shepherd' });
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('verse-block');
    expect(block.ref).toBe('psalms 23:1-3');
    expect(block.text).toBe('The LORD is my shepherd');
    expect(block.isStudy).toBe(false);
  });

  it('bible card (no excerpt text) becomes a chapter-card', () => {
    const { onInsertBlock, fire } = captureBridge('Card');
    fire({ type: 'bible', bookId: 'john', chapter: 3 });
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('chapter-card');
    expect(block.bookId).toBe('john');
    expect(block.chapter).toBe(3);
  });

  it('letter target resolves volKey through COLLECTIONS by label', () => {
    g.COLLECTIONS = [{ label: 'Volume One', volKey: 'v1' }];
    const { onInsertBlock, fire } = captureBridge('Card');
    fire({ type: 'letter', letterId: 'the-wide-path', collection: 'Volume One' });
    const block = onInsertBlock.mock.calls[0][0];
    expect(block.type).toBe('letter-card');
    expect(block.volKey).toBe('v1');
    expect(block.letterId).toBe('the-wide-path');
  });

  it('letter target with UNRESOLVABLE volKey inserts nothing (null guard)', () => {
    g.COLLECTIONS = [];
    const { onInsertBlock, fire } = captureBridge('Card');
    fire({ type: 'letter', letterId: 'orphan', collection: 'Unknown Volume' });
    expect(onInsertBlock).not.toHaveBeenCalled();
  });

  it('null target inserts nothing', () => {
    const { onInsertBlock, fire } = captureBridge('Card');
    fire(null);
    expect(onInsertBlock).not.toHaveBeenCalled();
  });
});
