// @ts-nocheck — bare-name globals, same reality as the sibling suites
/* JournalEditorScreen — id-datasafe2 161: Bold / Italic / Scripture buttons.
   A text block holding a selection shows a slim B / I / Scripture row; it
   marks the selection in the markup the viewer renders (**, _, {{ref:}}),
   takes the marks off a second press, and asks for a reference when the
   selected words are not one. No selection, no row. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { JournalEditorScreen } from './JournalEditorScreen.jsx';
import { JournalStore } from '../../stores/journal-store.js';
import { JournalHelpers } from '../../data/journal-helpers.js';
import { createPressDrag } from '../../utils/press-drag.js';
import { parseRefStr } from '../../data/scripture-resolution.js';

vi.mock('../../data/journal-helpers.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalHelpers() { return 'JournalHelpers' in globalThis ? /** @type {any} */ (globalThis).JournalHelpers : real.JournalHelpers; } }; });

const OWN = ['parseRefStr'];
let saved;
beforeEach(() => {
  saved = OWN.map((n) => Object.getOwnPropertyDescriptor(globalThis, n));
  vi.useFakeTimers();
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });
  globalThis.JournalStore = JournalStore;
  globalThis.JournalHelpers = JournalHelpers;
  globalThis.createPressDrag = createPressDrag;
  globalThis.parseRefStr = parseRefStr;
  globalThis.JournalMediaStore = { compressImage: vi.fn(), put: vi.fn(), delete: vi.fn() };
  globalThis.showToast = vi.fn();
  globalThis.hideToast = vi.fn();
  globalThis.StorageHealth = { onWriteFailure: () => {} };
  globalThis.ScreenLayout = ({ navChildren, children }) => React.createElement('div', null, navChildren, children);
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = () => null;
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
  OWN.forEach((n, i) => { if (saved[i]) Object.defineProperty(globalThis, n, saved[i]); else delete globalThis[n]; });
});

function openEntry(text) {
  const entry = JournalStore.add({ title: 't', blocks: [{ id: 'b1', type: 'p', text }] });
  render(React.createElement(JournalEditorScreen, { entryId: entry.id, onBack: () => {} }));
  return document.querySelector('[data-block-id="b1"] textarea');
}

function select(ta, start, end) {
  act(() => { ta.focus(); ta.setSelectionRange(start, end); fireEvent.select(ta); });
}

const row = () => document.querySelector('.jrn-fmt-row');
const press = (cls) => act(() => { fireEvent.click(document.querySelector('.jrn-fmt-row .' + cls)); });

describe('JournalEditorScreen — B / I / Scripture row (id-datasafe2 161)', () => {
  it('shows only while the block holds a selection', () => {
    const ta = openEntry('a word here');
    expect(row()).toBeNull();
    select(ta, 2, 6);
    expect(row()).not.toBeNull();
    expect(row().getAttribute('role')).toBe('toolbar');
    select(ta, 4, 4);
    expect(row()).toBeNull();
  });

  it('Bold marks the selection, keeps it on the words, and a second press takes the marks off', () => {
    const ta = openEntry('a word here');
    select(ta, 2, 6);
    press('jrn-fmt-bold');
    expect(ta.value).toBe('a **word** here');
    expect([ta.selectionStart, ta.selectionEnd]).toEqual([4, 8]);
    press('jrn-fmt-bold');
    expect(ta.value).toBe('a word here');
  });

  it('Italic marks the selection', () => {
    const ta = openEntry('a word here');
    select(ta, 2, 6);
    press('jrn-fmt-italic');
    expect(ta.value).toBe('a _word_ here');
  });

  it('Scripture marks a reference', () => {
    const ta = openEntry('see John 3:16 now');
    select(ta, 4, 13);
    press('jrn-fmt-ref');
    expect(ta.value).toBe('see {{ref:John 3:16}} now');
  });

  it('Scripture asks for a reference when the words are not one', () => {
    const tb = openEntry('just some words');
    select(tb, 0, 4);
    press('jrn-fmt-ref');
    expect(tb.value).toBe('just some words');
    expect(globalThis.showToast).toHaveBeenCalledWith(expect.objectContaining({ id: 'vot-toast-journal-fmt' }));
  });

  it('the row goes when focus leaves for anything but the row', () => {
    const ta = openEntry('a word here');
    select(ta, 2, 6);
    act(() => { fireEvent.blur(ta, { relatedTarget: row().querySelector('button') }); });
    expect(row()).not.toBeNull();
    act(() => { fireEvent.blur(ta, { relatedTarget: document.body }); });
    expect(row()).toBeNull();
  });
});
