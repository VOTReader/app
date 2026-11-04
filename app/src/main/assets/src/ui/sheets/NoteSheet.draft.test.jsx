/* NoteSheet — the words of a note being typed outlive a kill (dl4, 2026-11-04).
   ─────────────────────────────────────────────────────────────────────────────
   The text being typed lived only in React state until Save: Android killing the
   backgrounded app, a closed tab, the reader's own reload or a crash took it all.
   It is now written down synchronously (utils/note-draft.js) and offered back in
   the editor when the note opens again, the journal editor's JRNL-1 rule. */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { NoteSheet } from './NoteSheet.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import {
  NOTE_DRAFT_KEY, NOTE_DRAFT_DELAY_MS, readNoteDraft, writeNoteDraft, clearNoteDraft, noteDraftRecoverable, clearNoteDraftWhenSaved,
} from '../../utils/note-draft.js';

/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

/** @type {any} */ let saved;
/** @type {(ok: boolean) => void} */ let landWrite;

function setupStores({ body = '', updated = 1000 } = {}) {
  saved = { groupId: 'g1', color: 'yellow', body, fullText: 'anchor', keys: ['k'], notebookIds: [], created: 1, updated };
  /** @type {any} */ const w = window;
  w.HL_COLORS = ['yellow', 'green', 'blue'];
  w.NoteStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    get: () => saved,
    update: vi.fn((gid, patch) => {
      saved = { ...saved, ...patch, updated: Date.now() };
      w.NoteStore._lastWrite = new Promise((resolve) => { landWrite = resolve; });
    }),
    remove: vi.fn(),
    isReady: () => true,
    whenSaved() { return this._lastWrite ? this._lastWrite : Promise.resolve(true); },
    _lastWrite: null,
  };
  w.AnnotationStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    getByGroup: () => [{ key: 'k', ann: { id: 'g1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'anchor' } }],
    removeGroup: vi.fn(),
    recolorGroup: vi.fn(),
    convertGroup: vi.fn(),
  };
  w.NotebookStore = { get: () => null };
  w.NoteDefaultStore = { set: vi.fn(), get: () => ({ style: 'highlight', color: 'blank' }) };
  w.relativeDate = () => '1w ago';
}

const textarea = () => /** @type {HTMLTextAreaElement} */ (document.querySelector('.note-sheet-textarea'));
const hidePage = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
};

beforeEach(() => {
  modalRegistry._reset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  modalRegistry._reset();
  /** @type {any} */ const w = window;
  for (const k of ['HL_COLORS', 'NoteStore', 'AnnotationStore', 'NotebookStore', 'NoteDefaultStore', 'relativeDate']) delete w[k];
});

describe('dl4 — a note being typed outlives a kill', () => {
  it('words typed and then the app sent to the background are written down at once', () => {
    setupStores({ body: '' });
    render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    fireEvent.change(textarea(), { target: { value: 'Lord, teach me to number my days' } });
    hidePage();
    expect(readNoteDraft('g1')).toMatchObject({ body: 'Lord, teach me to number my days' });
  });

  it('a page closed or reloaded (pagehide) writes them down too', () => {
    setupStores({ body: 'old words' });
    render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    fireEvent.change(textarea(), { target: { value: 'old words, and new ones' } });
    window.dispatchEvent(new Event('pagehide'));
    expect(readNoteDraft('g1').body).toBe('old words, and new ones');
  });

  it('a beat after typing stops they are written down, with no hide at all', () => {
    vi.useFakeTimers();
    setupStores({ body: '' });
    render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    fireEvent.change(textarea(), { target: { value: 'still typing' } });
    expect(readNoteDraft('g1')).toBeNull();
    act(() => { vi.advanceTimersByTime(NOTE_DRAFT_DELAY_MS + 10); });
    expect(readNoteDraft('g1').body).toBe('still typing');
  });

  it('after the kill, opening the note brings the words back in the editor, unsaved', () => {
    setupStores({ body: '', updated: 1000 });
    localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify({ v: 1, drafts: { g1: { body: 'the words before the kill', ts: 2000 } } }));
    render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    expect(textarea().value).toBe('the words before the kill');
    expect(/** @type {any} */ (window).NoteStore.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Save'));
    expect(/** @type {any} */ (window).NoteStore.update).toHaveBeenCalledWith('g1', { body: 'the words before the kill' });
  });

  it('a crash mid-edit (the sheet unmounted without Save or Cancel) writes them down', () => {
    setupStores({ body: '' });
    const { unmount } = render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    fireEvent.change(textarea(), { target: { value: 'half a thought' } });
    unmount();
    expect(readNoteDraft('g1').body).toBe('half a thought');
  });

  it('Save keeps the draft until its write is on disk, then lets it go', async () => {
    setupStores({ body: 'before' });
    render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    fireEvent.change(textarea(), { target: { value: 'after' } });
    fireEvent.click(screen.getByText('Save'));
    expect(readNoteDraft('g1').body).toBe('after');           // the write has not landed yet
    await act(async () => { landWrite(true); await Promise.resolve(); await Promise.resolve(); });
    expect(readNoteDraft('g1')).toBeNull();
  });

  it('a Save whose write fails keeps the words written down for the next open', async () => {
    setupStores({ body: 'before' });
    render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    fireEvent.change(textarea(), { target: { value: 'after' } });
    fireEvent.click(screen.getByText('Save'));
    await act(async () => { landWrite(false); await Promise.resolve(); await Promise.resolve(); });
    expect(readNoteDraft('g1').body).toBe('after');
  });

  it('Cancel, then discard, lets the words go for good', () => {
    setupStores({ body: 'kept' });
    render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    fireEvent.change(textarea(), { target: { value: 'kept, and a change I do not want' } });
    hidePage();
    expect(readNoteDraft('g1')).not.toBeNull();
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Yes, discard'));
    hidePage();
    expect(readNoteDraft('g1')).toBeNull();
  });

  it('a draft older than the saved note (saved since, here or in another tab) is not offered, and goes once the save is on disk', async () => {
    setupStores({ body: 'saved later', updated: 5000 });
    localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify({ v: 1, drafts: { g1: { body: 'older words', ts: 4000 } } }));
    render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    expect(textarea()).toBeNull();
    expect(screen.getByText('saved later')).toBeTruthy();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(readNoteDraft('g1')).toBeNull();
  });

  it('a note whose Save failed (a full device), reopened in the same session, keeps its draft: the words are in memory only', async () => {
    setupStores({ body: 'before' });
    const first = render(<NoteSheet groupId="g1" startInEditMode={true} onClose={() => {}} />);
    fireEvent.change(textarea(), { target: { value: 'the words that did not fit' } });
    fireEvent.click(screen.getByText('Save'));
    await act(async () => { landWrite(false); await Promise.resolve(); await Promise.resolve(); });
    first.unmount();
    // Reopened: the store's memory holds the words, so the draft is not offered back,
    // but the store's last write failed, so it must not be cleared either.
    render(<NoteSheet groupId="g1" startInEditMode={false} onClose={() => {}} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(readNoteDraft('g1').body).toBe('the words that did not fit');
  });
});

describe('dl4 — utils/note-draft.js', () => {
  it('one draft per note; a full localStorage gives up other notes\' drafts, oldest first', () => {
    writeNoteDraft('a', 'A');
    writeNoteDraft('b', 'B');
    const real = Storage.prototype.setItem;
    let calls = 0;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      calls += 1;
      if (calls === 1) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
      return real.call(this, k, v);
    });
    expect(writeNoteDraft('c', 'C')).toBe(true);
    spy.mockRestore();
    expect(readNoteDraft('a')).toBeNull();
    expect(readNoteDraft('b').body).toBe('B');
    expect(readNoteDraft('c').body).toBe('C');
  });

  it('when nothing fits, says so (false) and keeps what was there', () => {
    writeNoteDraft('a', 'A');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; });
    expect(writeNoteDraft('a', 'longer A')).toBe(false);
    spy.mockRestore();
    expect(readNoteDraft('a').body).toBe('A');
  });

  it('clearNoteDraft with words drops the draft only while it holds those words', () => {
    writeNoteDraft('a', 'first');
    clearNoteDraft('a', 'other');
    expect(readNoteDraft('a').body).toBe('first');
    clearNoteDraft('a', 'first');
    expect(readNoteDraft('a')).toBeNull();
    expect(localStorage.getItem(NOTE_DRAFT_KEY)).toBeNull();
  });

  it('recoverable: other words than the note, not older than its last save', () => {
    expect(noteDraftRecoverable({ body: 'x', ts: 5 }, { body: 'y', updated: 5 })).toBe(true);
    expect(noteDraftRecoverable({ body: 'x', ts: 5 }, { body: 'x', updated: 1 })).toBe(false);
    expect(noteDraftRecoverable({ body: 'x', ts: 4 }, { body: 'y', updated: 5 })).toBe(false);
    expect(noteDraftRecoverable(null, { body: 'y' })).toBe(false);
    expect(noteDraftRecoverable({ body: 'x', ts: 4 }, null)).toBe(false);
  });

  it('an unreadable key reads as no drafts, and is replaced by the next write', () => {
    localStorage.setItem(NOTE_DRAFT_KEY, '{not json');
    expect(readNoteDraft('a')).toBeNull();
    expect(writeNoteDraft('a', 'A')).toBe(true);
    expect(readNoteDraft('a').body).toBe('A');
  });

  it('clearNoteDraftWhenSaved waits for a newer write that started meanwhile, and keeps the draft while the store is not loaded', async () => {
    writeNoteDraft('g', 'words');
    /** @type {(v: boolean) => void} */ let first = () => {};
    /** @type {(v: boolean) => void} */ let second = () => {};
    const store = { isReady: () => true, _lastWrite: /** @type {any} */ (new Promise((r) => { first = r; })), whenSaved() { return this._lastWrite; } };
    clearNoteDraftWhenSaved(store, 'g', 'words');
    store._lastWrite = new Promise((r) => { second = r; });
    first(true);
    await Promise.resolve(); await Promise.resolve();
    expect(readNoteDraft('g')).not.toBeNull();
    second(true);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(readNoteDraft('g')).toBeNull();
    writeNoteDraft('h', 'kept');
    clearNoteDraftWhenSaved({ isReady: () => false, whenSaved: () => Promise.resolve(true) }, 'h', 'kept');
    await Promise.resolve(); await Promise.resolve();
    expect(readNoteDraft('h').body).toBe('kept');
  });
});
