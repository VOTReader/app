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
       when the user did NOT undo. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { JournalEditorScreen } from './JournalEditorScreen.jsx';
import { JournalStore } from '../../stores/journal-store.js';
import { JournalHelpers } from '../../data/journal-helpers.js';
import { createPressDrag } from '../../utils/press-drag.js';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });
  globalThis.JournalStore = JournalStore;
  globalThis.JournalHelpers = JournalHelpers;
  globalThis.createPressDrag = createPressDrag;
  globalThis.JournalMediaStore = { compressImage: vi.fn(), put: vi.fn(), delete: vi.fn() };
  // showToast must materialize a real node — the undo wiring queries
  // #vot-toast-undo for its button (production toast does the same).
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
  const t = document.getElementById('vot-toast-undo');
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

describe('JournalEditorScreen — [16] session undo', () => {
  it('delete shows the Undo toast; Undo restores the block at its index', () => {
    openEntry([
      JournalHelpers.newBlock('p', { text: 'first' }),
      JournalHelpers.newBlock('p', { text: 'second' }),
    ]);
    deleteFirstBlock();
    expect(globalThis.showToast).toHaveBeenCalledWith(expect.objectContaining({ id: 'vot-toast-undo' }));
    expect(Array.from(document.querySelectorAll('.jrn-block-textarea')).map((t) => t.value)).toEqual(['second']);
    act(() => { document.querySelector('#vot-toast-undo .vot-undo-btn').click(); });
    expect(Array.from(document.querySelectorAll('.jrn-block-textarea')).map((t) => t.value)).toEqual(['first', 'second']);
  });

  it('restoring after deleting the LAST block replaces the pristine default paragraph', () => {
    openEntry([JournalHelpers.newBlock('p', { text: 'only' })]);
    deleteFirstBlock();
    // Deletion left the default empty paragraph.
    expect(Array.from(document.querySelectorAll('.jrn-block-textarea')).map((t) => t.value)).toEqual(['']);
    act(() => { document.querySelector('#vot-toast-undo .vot-undo-btn').click(); });
    expect(Array.from(document.querySelectorAll('.jrn-block-textarea')).map((t) => t.value)).toEqual(['only']);
  });

  it('media cleanup is deferred past the window and SKIPPED when undone', () => {
    openEntry([
      { ...JournalHelpers.newBlock('image', {}), mediaId: 'm1' },
      JournalHelpers.newBlock('p', { text: 'keep' }),
    ]);
    deleteFirstBlock();
    expect(globalThis.JournalMediaStore.delete).not.toHaveBeenCalled(); // not yet
    act(() => { document.querySelector('#vot-toast-undo .vot-undo-btn').click(); });
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
