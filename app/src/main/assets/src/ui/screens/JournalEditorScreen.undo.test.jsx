// @ts-nocheck — bare-name globals, same reality as the sibling suites
/* JournalEditorScreen — [16] session undo for destructive block actions.
   ═══════════════════════════════════════════════════════════════════════
   A confirmed block delete gets a 6s Undo toast (the tab-close idiom):
   snapshot {block, idx}, splice back on Undo. Pins:
     - delete → toast; Undo restores the block at its index;
     - the pristine-default-paragraph left by deleting the LAST block is
       replaced (not kept alongside) on restore;
     - media cleanup is DEFERRED past the undo window and SKIPPED when
       the user undid;
     - media cleanup still fires (same only-when-unreferenced rules)
       when the user did NOT undo;
     - the toast is body-level and outlives the screen by design, so Undo
       must still restore the block after Done/Home/Search unmounted the
       editor. The silent failure was setBlocks on an unmounted fiber: a
       no-op, while hideToast made the tap look like it had worked and the
       durable entry (written by the unmount flush) stayed block-less. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { JournalEditorScreen } from './JournalEditorScreen.jsx';
import { JournalStore } from '../../stores/journal-store.js';
import { JournalHelpers } from '../../data/journal-helpers.js';
import { createPressDrag } from '../../utils/press-drag.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('../../data/journal-helpers.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalHelpers() { return 'JournalHelpers' in globalThis ? /** @type {any} */ (globalThis).JournalHelpers : real.JournalHelpers; } }; });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });
  globalThis.JournalStore = JournalStore;
  globalThis.JournalHelpers = JournalHelpers;
  globalThis.createPressDrag = createPressDrag;
  globalThis.JournalMediaStore = { compressImage: vi.fn(), put: vi.fn(), delete: vi.fn() };
  // showToast must materialize a real node — the undo wiring queries
  // #vot-toast-undo-journal for its button (production toast does the same).
  globalThis.showToast = vi.fn((opts) => {
    let el = document.getElementById(opts.id);
    if (!el) { el = document.createElement('div'); el.id = opts.id; document.body.appendChild(el); }
    if (opts.html) el.innerHTML = opts.html;
    if (opts.text) el.textContent = opts.text;
  });
  globalThis.hideToast = vi.fn((id) => { const el = document.getElementById(id); if (el) el.remove(); });
  globalThis.StorageHealth = { onWriteFailure: () => {} };
  globalThis.ScreenLayout = ({ navChildren, children }) => React.createElement('div', null, navChildren, children);
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = ({ onConfirm }) =>
    React.createElement('button', { 'data-testid': 'confirm-del', onClick: onConfirm }, 'confirm');
  globalThis.JournalImageBlock = () => null;
  globalThis.JournalAudioBlock = () => null;
  globalThis.JournalBlockView = () => null;
  globalThis.JournalInsertSheet = () => null;
  globalThis.JournalRecordingSheet = () => null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  const t = document.getElementById('vot-toast-undo-journal');
  if (t) t.remove();
});

const flushTimers = (ms) => act(() => { vi.advanceTimersByTime(ms); });

function openEntry(blocks) {
  const entry = JournalStore.add({ title: 't', blocks });
  render(React.createElement(JournalEditorScreen, { entryId: entry.id, onBack: () => {} }));
  return entry;
}

function deleteFirstBlock() {
  fireEvent.click(document.querySelectorAll('.jrn-block-del-btn')[0]);
  fireEvent.click(document.querySelector('[data-testid="confirm-del"]'));
  flushTimers(1); // the macrotask that shows the toast + arms cleanup
}

describe('JournalEditorScreen — [16] Undo survives the screen it was raised on', () => {
  it('restores the block through the store after the editor unmounted', () => {
    const entry = openEntry([
      JournalHelpers.newBlock('p', { text: 'first' }),
      JournalHelpers.newBlock('p', { text: 'second' }),
    ]);
    deleteFirstBlock();

    // Done / Home / Search: the screen unmounts and its cleanup durably
    // writes the block-less entry. The body-level toast stays up, with a
    // live Undo button, over whatever screen came next.
    cleanup();
    expect(JournalStore.get(entry.id).blocks.map((b) => b.text)).toEqual(['second']);

    act(() => { document.querySelector('#vot-toast-undo-journal .vot-undo-btn').click(); });
    expect(JournalStore.get(entry.id).blocks.map((b) => b.text)).toEqual(['first', 'second']);
  });

  it('is a quiet no-op when the entry itself is gone by the time Undo is tapped', () => {
    const entry = openEntry([
      JournalHelpers.newBlock('p', { text: 'first' }),
      JournalHelpers.newBlock('p', { text: 'second' }),
    ]);
    deleteFirstBlock();
    cleanup();
    JournalStore.remove(entry.id);      // deleted from the hub while the toast was up
    globalThis.hideToast.mockClear();

    expect(() => {
      act(() => { document.querySelector('#vot-toast-undo-journal .vot-undo-btn').click(); });
    }).not.toThrow();
    expect(globalThis.hideToast).toHaveBeenCalledWith('vot-toast-undo-journal');
    expect(JournalStore.get(entry.id)).toBeNull();   // not resurrected
  });
});

describe('JournalEditorScreen — [16] session undo', () => {
  it('delete shows the Undo toast; Undo restores the block at its index', () => {
    openEntry([
      JournalHelpers.newBlock('p', { text: 'first' }),
      JournalHelpers.newBlock('p', { text: 'second' }),
    ]);
    deleteFirstBlock();
    expect(globalThis.showToast).toHaveBeenCalledWith(expect.objectContaining({ id: 'vot-toast-undo-journal' }));
    expect(Array.from(document.querySelectorAll('.jrn-block-textarea')).map((t) => t.value)).toEqual(['second']);
    act(() => { document.querySelector('#vot-toast-undo-journal .vot-undo-btn').click(); });
    expect(Array.from(document.querySelectorAll('.jrn-block-textarea')).map((t) => t.value)).toEqual(['first', 'second']);
  });

  it('restoring after deleting the LAST block replaces the pristine default paragraph', () => {
    openEntry([JournalHelpers.newBlock('p', { text: 'only' })]);
    deleteFirstBlock();
    // Deletion left the default empty paragraph.
    expect(Array.from(document.querySelectorAll('.jrn-block-textarea')).map((t) => t.value)).toEqual(['']);
    act(() => { document.querySelector('#vot-toast-undo-journal .vot-undo-btn').click(); });
    expect(Array.from(document.querySelectorAll('.jrn-block-textarea')).map((t) => t.value)).toEqual(['only']);
  });

  it('media cleanup is deferred past the window and SKIPPED when undone', () => {
    openEntry([
      { ...JournalHelpers.newBlock('image', {}), mediaId: 'm1' },
      JournalHelpers.newBlock('p', { text: 'keep' }),
    ]);
    deleteFirstBlock();
    expect(globalThis.JournalMediaStore.delete).not.toHaveBeenCalled(); // not yet
    act(() => { document.querySelector('#vot-toast-undo-journal .vot-undo-btn').click(); });
    flushTimers(8000);
    expect(globalThis.JournalMediaStore.delete).not.toHaveBeenCalled(); // undone → never
  });

  it('media cleanup fires after the window when NOT undone', () => {
    openEntry([
      { ...JournalHelpers.newBlock('image', {}), mediaId: 'm2' },
      JournalHelpers.newBlock('p', { text: 'keep' }),
    ]);
    deleteFirstBlock();
    flushTimers(8000);
    expect(globalThis.JournalMediaStore.delete).toHaveBeenCalledWith('m2');
  });
});

/* n4-06 (sweep 2): a deleted block's marks went nowhere - listed in the Library,
   painted nowhere. The confirm now names them, and once the Undo window has
   passed they go with the block; an Undo keeps them. */
describe('JournalEditorScreen - a deleted block takes its marks (n4-06)', () => {
  it('the confirm names the block\'s marks', () => {
    globalThis.ConfirmStrip = ({ onConfirm, question }) =>
      React.createElement('button', { 'data-testid': 'confirm-del', 'data-q': question, onClick: onConfirm }, 'confirm');
    const sum = vi.spyOn(JournalStore, 'associatedDataSummary').mockReturnValue('2 highlights and 1 note');
    const first = JournalHelpers.newBlock('p', { text: 'first' });
    const entry = openEntry([first, JournalHelpers.newBlock('p', { text: 'second' })]);
    fireEvent.click(document.querySelectorAll('.jrn-block-del-btn')[0]);
    expect(sum).toHaveBeenCalledWith(entry.id, first.id);
    expect(document.querySelector('[data-testid="confirm-del"]').getAttribute('data-q')).toBe('Delete this block and its 2 highlights and 1 note?');
  });

  it('purges them after the Undo window, against the editor\'s live blocks', () => {
    const purge = vi.spyOn(JournalStore, 'purgeBlockMarks').mockReturnValue(3);
    const first = JournalHelpers.newBlock('p', { text: 'first' });
    const entry = openEntry([first, JournalHelpers.newBlock('p', { text: 'second' })]);
    deleteFirstBlock();
    flushTimers(6000);
    expect(purge).not.toHaveBeenCalled();
    flushTimers(600);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(purge.mock.calls[0][0]).toBe(entry.id);
    expect(purge.mock.calls[0][1]).toBe(first.id);
    expect(purge.mock.calls[0][2].map((b) => b.text)).toEqual(['second']);
  });

  it('refuter F1: past the window the faded Undo is dead - a late tap never restores a block whose marks went', () => {
    // The real hideToast only drops .show: the node, and its button, stay in the page.
    globalThis.hideToast = vi.fn((id) => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
    vi.spyOn(JournalStore, 'purgeBlockMarks').mockReturnValue(2);
    const entry = openEntry([JournalHelpers.newBlock('p', { text: 'first' }), JournalHelpers.newBlock('p', { text: 'second' })]);
    deleteFirstBlock();
    flushTimers(7000);
    expect(document.querySelectorAll('.jrn-block-del-btn')).toHaveLength(1);
    act(() => { document.querySelector('#vot-toast-undo-journal .vot-undo-btn').click(); });
    flushTimers(1000);
    expect(document.querySelectorAll('.jrn-block-del-btn'), 'the editor still holds one block').toHaveLength(1);
    expect(JournalStore.get(entry.id).blocks.map((b) => b.text)).toEqual(['second']);
  });
  it('an Undo keeps them', () => {
    const purge = vi.spyOn(JournalStore, 'purgeBlockMarks').mockReturnValue(0);
    openEntry([JournalHelpers.newBlock('p', { text: 'first' }), JournalHelpers.newBlock('p', { text: 'second' })]);
    deleteFirstBlock();
    act(() => { document.querySelector('#vot-toast-undo-journal .vot-undo-btn').click(); });
    flushTimers(7000);
    expect(purge).not.toHaveBeenCalled();
  });
});

/* W16 (sweep 10-13): an untitled entry whose only block was just deleted is blank,
   so Done prunes it on exit (P1-7) while the Undo toast is still up. Undo then found
   no entry and did nothing, and because it counted as an undo the deferred media
   cleanup was skipped: the blob was orphaned. Now the prune keeps what Undo needs,
   Undo re-adds the entry with its block, and past the window it goes for good. */
describe('JournalEditorScreen - W16 Undo after Done on an entry the exit prune removed', () => {
  function openUntitled(blocks) {
    const entry = JournalStore.add({ title: '', blocks });
    render(React.createElement(JournalEditorScreen, { entryId: entry.id, onBack: () => {} }));
    return entry;
  }
  const tapUndo = () => act(() => { document.querySelector('#vot-toast-undo-journal .vot-undo-btn').click(); });

  it('Undo brings the pruned entry back with its block, and the block\'s media stays', () => {
    const entry = openUntitled([{ ...JournalHelpers.newBlock('image', {}), mediaId: 'm9' }]);
    deleteFirstBlock();
    cleanup();                                        // Done: the now-blank entry is pruned
    expect(JournalStore.get(entry.id)).toBeNull();
    tapUndo();
    const back = JournalStore.get(entry.id);
    expect(back && back.blocks.map((b) => b.mediaId)).toEqual(['m9']);
    expect(back.created).toBe(entry.created);
    flushTimers(8000);
    expect(globalThis.JournalMediaStore.delete).not.toHaveBeenCalled();
    expect(JournalStore.get(entry.id)).not.toBeNull();
  });

  it('without Undo the entry stays gone and the media goes after the window', () => {
    const entry = openUntitled([{ ...JournalHelpers.newBlock('image', {}), mediaId: 'm7' }]);
    deleteFirstBlock();
    cleanup();
    flushTimers(8000);
    expect(JournalStore.get(entry.id)).toBeNull();
    expect(globalThis.JournalMediaStore.delete).toHaveBeenCalledWith('m7');
  });

  it('an Undo that finds the entry deleted from the hub restores nothing, and the media still goes', () => {
    const entry = openEntry([
      { ...JournalHelpers.newBlock('image', {}), mediaId: 'm8' },
      JournalHelpers.newBlock('p', { text: 'keep' }),
    ]);
    deleteFirstBlock();
    cleanup();
    JournalStore.remove(entry.id);                    // deleted from the hub while the toast was up
    tapUndo();
    flushTimers(8000);
    expect(JournalStore.get(entry.id)).toBeNull();
    expect(globalThis.JournalMediaStore.delete).toHaveBeenCalledWith('m8');
  });

  it('the entry\'s marks wait for the window: kept on Undo, purged after it when the entry stays gone', () => {
    const purge = vi.spyOn(JournalStore, '_purgeAssociated');
    const entry = openUntitled([{ ...JournalHelpers.newBlock('image', {}), mediaId: 'm6' }]);
    deleteFirstBlock();
    cleanup();
    expect(purge).not.toHaveBeenCalled();             // the prune kept them
    flushTimers(8000);
    expect(purge.mock.calls.filter((c) => c[0] === entry.id && c[1] == null)).toHaveLength(1);
  });

  it('an Undo keeps the entry\'s marks past the window', () => {
    const purge = vi.spyOn(JournalStore, '_purgeAssociated');
    openUntitled([{ ...JournalHelpers.newBlock('image', {}), mediaId: 'm5' }]);
    deleteFirstBlock();
    cleanup();
    tapUndo();
    flushTimers(8000);
    expect(purge).not.toHaveBeenCalled();
  });

  it('with no Undo window open the exit prune still purges at once (P1-7 unchanged)', () => {
    const purge = vi.spyOn(JournalStore, '_purgeAssociated');
    const entry = openUntitled([JournalHelpers.newBlock('p', { text: '' })]);
    cleanup();
    expect(JournalStore.get(entry.id)).toBeNull();
    expect(purge).toHaveBeenCalledWith(entry.id);
  });

  it('refuter: a counted entry pruned in the window gives its count back only when the window closes without Undo', () => {
    globalThis.JournalStatsStore = { recordNewEntry: vi.fn(), recordDeletion: vi.fn() };
    try {
      const entry = openUntitled([{ ...JournalHelpers.newBlock('image', {}), mediaId: 'm3' }]);   // no marker: counted
      deleteFirstBlock();
      cleanup();
      expect(JournalStore.get(entry.id)).toBeNull();
      expect(globalThis.JournalStatsStore.recordDeletion).not.toHaveBeenCalled();   // Undo may still bring it back
      flushTimers(8000);
      expect(globalThis.JournalStatsStore.recordDeletion).toHaveBeenCalledTimes(1);
    } finally {
      delete globalThis.JournalStatsStore;
    }
  });

  it('refuter: Undo keeps a counted entry counted', () => {
    globalThis.JournalStatsStore = { recordNewEntry: vi.fn(), recordDeletion: vi.fn() };
    try {
      openUntitled([{ ...JournalHelpers.newBlock('image', {}), mediaId: 'm2' }]);
      deleteFirstBlock();
      cleanup();
      tapUndo();
      flushTimers(8000);
      expect(globalThis.JournalStatsStore.recordDeletion).not.toHaveBeenCalled();
      expect(globalThis.JournalStatsStore.recordNewEntry).not.toHaveBeenCalled();
    } finally {
      delete globalThis.JournalStatsStore;
    }
  });

  it('a brand-new entry brought back by Undo records its New-Entry stats once', () => {
    globalThis.JournalStatsStore = { recordNewEntry: vi.fn(), recordDeletion: vi.fn() };
    try {
      const entry = JournalStore.add({ title: '', blocks: [{ ...JournalHelpers.newBlock('image', {}), mediaId: 'm4' }] });
      localStorage.setItem('vot-journal-new-entry-stats', entry.id);   // set by the New-Entry flow
      render(React.createElement(JournalEditorScreen, { entryId: entry.id, onBack: () => {} }));
      deleteFirstBlock();
      cleanup();
      expect(globalThis.JournalStatsStore.recordNewEntry).not.toHaveBeenCalled();
      tapUndo();
      flushTimers(8000);
      expect(globalThis.JournalStatsStore.recordNewEntry).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('vot-journal-new-entry-stats')).toBeNull();
    } finally {
      delete globalThis.JournalStatsStore;
    }
  });
});

/* ds5 s20.2 (idea sweep 2026-10-22): deleteBlock spliced the list but kept the caret's old block
   index, so a FAB insert after deleting a block ABOVE the caret landed one block off. */
describe('JournalEditorScreen — the caret index follows a block delete (ds5 s20.2)', () => {
  beforeEach(() => {
    globalThis.JournalInsertSheet = ({ onRecordAudio }) =>
      React.createElement('button', { 'data-testid': 'open-rec', onClick: onRecordAudio }, 'rec');
    globalThis.JournalRecordingSheet = ({ onSave }) =>
      React.createElement('button', { 'data-testid': 'rec-save', onClick: () => onSave({ mediaId: 'm_test', duration: 3, samples: null }) }, 'save');
  });

  it('an insert after deleting a block above the caret lands below the caret block', () => {
    const entry = openEntry([
      JournalHelpers.newBlock('p', { text: 'first' }),
      JournalHelpers.newBlock('p', { text: 'second' }),
      JournalHelpers.newBlock('p', { text: 'third' }),
    ]);
    const ta = document.querySelectorAll('.jrn-block-textarea')[1];   // caret in 'second'
    ta.setSelectionRange(2, 2);
    fireEvent.focus(ta);
    deleteFirstBlock();
    fireEvent.click(document.querySelector('.jrn-fab-plus'));
    fireEvent.click(document.querySelector('[data-testid="open-rec"]'));
    fireEvent.click(document.querySelector('[data-testid="rec-save"]'));
    const saved = JournalStore.get(entry.id).blocks;
    expect(saved.map((b) => b.type === 'audio' ? 'audio' : b.text)).toEqual(['second', 'audio', 'third']);
  });
});
