// @ts-nocheck — test constructs partial JournalEntry / block literals
/* AUDIT-PLAN J1/J2/J4 — JournalEditorScreen data-safety on background-kill.
   ──────────────────────────────────────────────────────────────────────
   The editor auto-saves on a 1.2s debounce and otherwise only flushes on a
   real React unmount. On Android the WebView is OOM-killed while backgrounded
   WITHOUT firing unmount, so the debounced edits — and a freshly-inserted media
   block (whose blob is already durable in IDB) — were silently lost, and the
   orphaned blob was then deleted by the boot sweep. Two fixes are pinned here:

     J2  a pagehide + visibilitychange:hidden listener flushes the LATEST
         title/blocks to JournalStore synchronously (survives the kill).
     J1  inserting a media block persists its entry reference IMMEDIATELY
         (not after the 1.2s debounce), closing the orphan window.

   Integration-style: drives the REAL JournalStore (forceLoaded in-memory cache;
   _save's IDB write is a no-op here and harmless). Only the far-boundary UI
   chrome (ScreenLayout/LibraryNav/sub-blocks/sheets) is stubbed — the recording
   sheet stub exposes onSave so the media-insert path can be exercised. No timers
   are advanced, so any persisted data MUST have come from the synchronous flush
   / immediate-save paths, not the debounce. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { JournalEditorScreen } from './JournalEditorScreen.jsx';
import { JournalStore } from '../../stores/journal-store.js';
import { JournalHelpers } from '../../data/journal-helpers.js';
import { createPressDrag } from '../../utils/press-drag.js';

beforeEach(() => {
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });

  // Bare-name globals the screen reads (in prod, _entry-* Object.assigns these
  // onto window). Real store + helpers; far-boundary UI chrome stubbed.
  globalThis.JournalStore = JournalStore;
  globalThis.JournalHelpers = JournalHelpers;
  globalThis.createPressDrag = createPressDrag; // the shared drag lifecycle

  globalThis.JournalMediaStore = { compressImage: vi.fn(), put: vi.fn(), delete: vi.fn() };
  globalThis.showToast = () => {};
  globalThis.StorageHealth = { onWriteFailure: () => {} };
  globalThis.ScreenLayout = ({ navChildren, children }) => React.createElement('div', null, navChildren, children);
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = () => null;
  globalThis.JournalImageBlock = () => null;
  globalThis.JournalAudioBlock = () => null;
  globalThis.JournalBlockView = () => null;
  // Insert sheet exposes the "record audio" action; recording sheet exposes onSave.
  globalThis.JournalInsertSheet = ({ onRecordAudio }) =>
    React.createElement('button', { 'data-testid': 'open-rec', onClick: onRecordAudio }, 'rec');
  globalThis.JournalRecordingSheet = ({ onSave }) =>
    React.createElement('button', { 'data-testid': 'rec-save', onClick: () => onSave({ mediaId: 'm_test', duration: 3, samples: null }) }, 'save');
});

afterEach(() => {
  cleanup();
  // Tests may flip document.visibilityState; restore it.
  try { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); } catch (_e) { /* jsdom */ }
});

describe('JournalEditorScreen — background-kill data safety', () => {
  it('J2 — flushes the latest title + body text to JournalStore on pagehide (no timer advance)', () => {
    const entry = JournalStore.add({ title: 'orig', blocks: [JournalHelpers.newBlock('p', { text: 'first' })] });

    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);

    fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: 'edited title' } });
    fireEvent.change(document.querySelector('.jrn-block-textarea'), { target: { value: 'edited body' } });

    // The 1.2s debounce has NOT fired. Simulate the app being backgrounded.
    act(() => { window.dispatchEvent(new Event('pagehide')); });

    const saved = JournalStore.get(entry.id);
    expect(saved.title).toBe('edited title');
    expect(saved.blocks.find((b) => b.type === 'p').text).toBe('edited body');
  });

  it('J2 — flushes on visibilitychange when the document becomes hidden', () => {
    const entry = JournalStore.add({ title: 'orig', blocks: [JournalHelpers.newBlock('p', { text: 'x' })] });

    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: 'hidden-save' } });

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(JournalStore.get(entry.id).title).toBe('hidden-save');
  });

  it('J2 — a still-VISIBLE visibilitychange does NOT flush (only hidden does)', () => {
    const entry = JournalStore.add({ title: 'orig', blocks: [JournalHelpers.newBlock('p', { text: 'x' })] });

    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: 'should-not-persist-yet' } });

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    // Visible → no flush; the debounce hasn't fired either, so IDB still has 'orig'.
    expect(JournalStore.get(entry.id).title).toBe('orig');
  });

  it('J1 — persists a newly inserted audio block IMMEDIATELY, without the 1.2s debounce', () => {
    const entry = JournalStore.add({ title: 't', blocks: [JournalHelpers.newBlock('p', { text: '' })] });

    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);

    fireEvent.click(document.querySelector('.jrn-fab-plus'));            // openInsertSheet
    fireEvent.click(document.querySelector('[data-testid="open-rec"]')); // handleInsertAudio → showRec
    fireEvent.click(document.querySelector('[data-testid="rec-save"]')); // onRecordingSaved → insert + immediate save

    // No timer advance: the block must already be durable via the immediate-save path.
    const saved = JournalStore.get(entry.id);
    expect(saved.blocks.some((b) => b.type === 'audio' && b.mediaId === 'm_test')).toBe(true);
  });

  // JRNL-1 — the in-memory cache flush (J2) is NOT durable: JournalStore.update -> _save
  // is fire-and-forget, so a background-kill before the IDB write lands still loses the
  // edits. A synchronous localStorage draft survives the kill and is recovered on re-open.
  it('JRNL-1 — writes a synchronous localStorage draft of the latest edits on background-hide', () => {
    const entry = JournalStore.add({ title: 'orig', blocks: [JournalHelpers.newBlock('p', { text: 'first' })] });
    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: 'edited title' } });
    fireEvent.change(document.querySelector('.jrn-block-textarea'), { target: { value: 'edited body' } });
    act(() => { window.dispatchEvent(new Event('pagehide')); });

    const draft = JSON.parse(localStorage.getItem('vot-journal-draft'));
    expect(draft.entryId).toBe(entry.id);
    expect(draft.title).toBe('edited title');
    expect(draft.blocks.find((b) => b.type === 'p').text).toBe('edited body');
  });

  it('JRNL-1 — on open, recovers a draft whose NEWER edits never reached the store (the kill case)', () => {
    const entry = JournalStore.add({ title: 'orig', blocks: [JournalHelpers.newBlock('p', { text: 'old body' })] });
    // A draft a prior backgrounded session wrote, that a kill prevented from persisting:
    // NEWER than the entry's last durable save, DIFFERENT content.
    localStorage.setItem('vot-journal-draft', JSON.stringify({
      entryId: entry.id,
      title: 'recovered title',
      blocks: [JournalHelpers.newBlock('p', { text: 'recovered body' })],
      mood: null,
      ts: (entry.updated || 0) + 5000,
    }));

    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);

    expect(document.querySelector('.jrn-editor-title').value).toBe('recovered title');
    expect(document.querySelector('.jrn-block-textarea').value).toBe('recovered body');
  });

  it('JRNL-1 — discards a STALE draft (older than the last save) and keeps the stored content', () => {
    const entry = JournalStore.add({ title: 'current title', blocks: [JournalHelpers.newBlock('p', { text: 'current body' })] });
    // OLDER than the entry's last durable save → the store was saved more recently; ignore + consume.
    localStorage.setItem('vot-journal-draft', JSON.stringify({
      entryId: entry.id, title: 'stale', blocks: [JournalHelpers.newBlock('p', { text: 'stale body' })], mood: null,
      ts: (entry.updated || 0) - 5000,
    }));

    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);

    expect(document.querySelector('.jrn-editor-title').value).toBe('current title');
    expect(localStorage.getItem('vot-journal-draft')).toBeNull();
  });
});

describe('JournalEditorScreen — insert never splits (UX-BATCH session 3, item 9)', () => {
  // Pre-fix, inserting with the caret mid-paragraph SPLIT the paragraph at
  // the caret (head/tail slices). The contract now: the new block always
  // lands BELOW the caret's block and the paragraph stays whole.
  it('inserting with the caret mid-paragraph lands the block BELOW — the paragraph stays whole', () => {
    const entry = JournalStore.add({ title: 't', blocks: [JournalHelpers.newBlock('p', { text: 'hello world' })] });
    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);

    const ta = document.querySelector('.jrn-block-textarea');
    ta.setSelectionRange(5, 5);            // caret between "hello" and " world"
    fireEvent.focus(ta);                   // focusTextarea tracks { idx, caret }

    fireEvent.click(document.querySelector('.jrn-fab-plus'));
    fireEvent.click(document.querySelector('[data-testid="open-rec"]'));
    fireEvent.click(document.querySelector('[data-testid="rec-save"]'));

    const saved = JournalStore.get(entry.id);
    expect(saved.blocks.map((b) => b.type)).toEqual(['p', 'audio', 'p']); // trailing p keeps writing flowing
    expect(saved.blocks[0].text).toBe('hello world');                     // NOT split into 'hello' / ' world'
    expect(saved.blocks[1].mediaId).toBe('m_test');
  });

  it('inserting between two paragraphs adds NO extra blank paragraph', () => {
    const entry = JournalStore.add({
      title: 't',
      blocks: [JournalHelpers.newBlock('p', { text: 'first' }), JournalHelpers.newBlock('p', { text: 'second' })],
    });
    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);

    const ta = document.querySelectorAll('.jrn-block-textarea')[0];
    ta.setSelectionRange(2, 2);
    fireEvent.focus(ta);

    fireEvent.click(document.querySelector('.jrn-fab-plus'));
    fireEvent.click(document.querySelector('[data-testid="open-rec"]'));
    fireEvent.click(document.querySelector('[data-testid="rec-save"]'));

    const saved = JournalStore.get(entry.id);
    expect(saved.blocks.map((b) => b.type)).toEqual(['p', 'audio', 'p']);
    expect(saved.blocks[0].text).toBe('first');
    expect(saved.blocks[2].text).toBe('second'); // the NEXT paragraph is the pre-existing one, untouched
  });

  it('no caret context: appends before a trailing blank paragraph (exactly one, reused)', () => {
    const entry = JournalStore.add({
      title: 't',
      blocks: [JournalHelpers.newBlock('p', { text: 'body' }), JournalHelpers.newBlock('p', { text: '' })],
    });
    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    // No focus event — activeTextareaRef is empty (picker-style insert).
    fireEvent.click(document.querySelector('.jrn-fab-plus'));
    fireEvent.click(document.querySelector('[data-testid="open-rec"]'));
    fireEvent.click(document.querySelector('[data-testid="rec-save"]'));

    const saved = JournalStore.get(entry.id);
    expect(saved.blocks.map((b) => b.type)).toEqual(['p', 'audio', 'p']); // reused the blank p — no litter
  });
});

/* ────────────────────────────────────────────────────────────────────────
   Wave 0 journal UX fixes (P1-5 / P1-6 / P1-7).

   P1-6  The editor used to register a BARE setShowRec(false) as the modal-
         registry dismiss for the recording sheet — hardware back mid-take
         destroyed the recording without the discard confirm. The sheet now
         registers itself (JournalRecordingSheet), so the editor must not
         register anything for it.

   P1-7  JournalStore.add() fires on the New-Entry tap, so backing out of a
         blank entry left an empty "Untitled" card. The unmount flush now
         PRUNES: blank title + no block content → remove (skipStats), and
         the first-save stats marker + JRNL-1 draft for that entry die too.

   P1-5  The milestone toast fired on the New-Entry tap, before a word was
         written. Stats + toasts now wait for the FIRST NON-EMPTY SAVE,
         handed off via the 'vot-journal-new-entry-stats' localStorage
         marker that createAndEditJournal leaves.
   ──────────────────────────────────────────────────────────────────────── */

var JRN_STATS_MARKER_KEY = 'vot-journal-new-entry-stats'; // mirrors JournalEditorScreen.jsx / use-journal-mutations.js

describe('JournalEditorScreen — P1-6: no bare registry dismiss for the recording sheet', () => {
  beforeEach(() => { modalRegistry._reset(); });
  afterEach(() => { modalRegistry._reset(); });

  it('opening the recording sheet registers NOTHING from the editor (the sheet self-registers)', () => {
    const entry = JournalStore.add({ title: 't', blocks: [JournalHelpers.newBlock('p', { text: 'x' })] });
    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);

    fireEvent.click(document.querySelector('.jrn-fab-plus'));            // openInsertSheet
    fireEvent.click(document.querySelector('[data-testid="open-rec"]')); // handleInsertAudio → showRec

    // The stubbed JournalRecordingSheet doesn't register itself, so anything
    // here would be the EDITOR's old bare setShowRec(false) — the P1-6 bug.
    expect(modalRegistry.openIds()).not.toContain('journal-recording-sheet');
  });
});

describe('JournalEditorScreen — P1-7: blank entries prune on exit', () => {
  it('backing out of a blank new entry REMOVES it (no empty Untitled card)', () => {
    const entry = JournalStore.add(); // exactly what the New-Entry flow creates
    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);

    unmount(); // Done/back without writing a word

    expect(JournalStore.get(entry.id)).toBeNull();
  });

  it('an entry with body text survives the unmount flush', () => {
    const entry = JournalStore.add({ title: '', blocks: [JournalHelpers.newBlock('p', { text: 'real words' })] });
    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    unmount();
    expect(JournalStore.get(entry.id)).not.toBeNull();
  });

  it('a TITLE alone is content — the entry is kept', () => {
    const entry = JournalStore.add({ title: 't', blocks: [JournalHelpers.newBlock('p', { text: '' })] });
    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    unmount();
    expect(JournalStore.get(entry.id)).not.toBeNull();
  });

  it('an entry that is ONLY a voice memo (no text) is content — kept', () => {
    const entry = JournalStore.add({ title: '', blocks: [JournalHelpers.newBlock('audio', { mediaId: 'm_1', duration: 3 })] });
    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    unmount();
    expect(JournalStore.get(entry.id)).not.toBeNull();
  });

  it('the prune clears a stale JRNL-1 draft for the removed entry', () => {
    const entry = JournalStore.add();
    // A background draft for this entry that a kill prevented from saving.
    localStorage.setItem('vot-journal-draft', JSON.stringify({
      entryId: entry.id, title: '', blocks: [JournalHelpers.newBlock('p', { text: '' })], mood: null,
      ts: (entry.updated || 0) + 5000,
    }));
    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    unmount();
    expect(JournalStore.get(entry.id)).toBeNull();
    expect(localStorage.getItem('vot-journal-draft')).toBeNull(); // no orphan draft for a dead entry
  });
});

describe('JournalEditorScreen — P1-5: milestone/stats wait for the first non-empty save', () => {
  afterEach(() => {
    delete globalThis.JournalStatsStore;
    delete globalThis.jrnShowMilestoneToast;
  });

  it('records stats + fires the milestone toast on the FIRST non-empty save, exactly once', () => {
    const entry = JournalStore.add();
    localStorage.setItem(JRN_STATS_MARKER_KEY, entry.id); // the createAndEditJournal handoff
    const recordNewEntry = vi.fn(() => [{ key: 'first', label: 'First entry' }]);
    globalThis.JournalStatsStore = { recordNewEntry, recordDeletion: vi.fn() };
    globalThis.jrnShowMilestoneToast = vi.fn();

    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    // The bug: the toast fired at New-Entry tap time. Here, nothing has been
    // written yet, so nothing may have recorded.
    expect(recordNewEntry).not.toHaveBeenCalled();

    const ta = document.querySelector('.jrn-block-textarea');
    fireEvent.change(ta, { target: { value: 'first words' } });
    // pagehide drives the synchronous commitSave flush (no debounce wait) —
    // the same proven J2 path as the data-safety tests above.
    act(() => { window.dispatchEvent(new Event('pagehide')); });

    expect(recordNewEntry).toHaveBeenCalledTimes(1);
    expect(recordNewEntry).toHaveBeenCalledWith(entry.created);
    expect(globalThis.jrnShowMilestoneToast).toHaveBeenCalledTimes(1);
    expect(globalThis.jrnShowMilestoneToast).toHaveBeenCalledWith({ key: 'first', label: 'First entry' });
    expect(localStorage.getItem(JRN_STATS_MARKER_KEY)).toBeNull(); // marker consumed

    // A later save (the unmount flush) does NOT re-record.
    cleanup();
    expect(recordNewEntry).toHaveBeenCalledTimes(1);
  });

  it('a blank entry records NO stats — and the prune neither decrements stats nor leaves the marker', () => {
    const entry = JournalStore.add();
    localStorage.setItem(JRN_STATS_MARKER_KEY, entry.id);
    const recordNewEntry = vi.fn(() => []);
    const recordDeletion = vi.fn();
    globalThis.JournalStatsStore = { recordNewEntry, recordDeletion };

    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    unmount(); // back out without writing

    expect(JournalStore.get(entry.id)).toBeNull();
    expect(recordNewEntry).not.toHaveBeenCalled();  // never counted in the first place
    expect(recordDeletion).not.toHaveBeenCalled();  // skipStats — no phantom decrement
    expect(localStorage.getItem(JRN_STATS_MARKER_KEY)).toBeNull();
  });

  it('a marker naming a DIFFERENT entry never triggers recording here', () => {
    const entry = JournalStore.add({ title: 'old entry', blocks: [JournalHelpers.newBlock('p', { text: 'body' })] });
    localStorage.setItem(JRN_STATS_MARKER_KEY, 'j_someone_else_999');
    const recordNewEntry = vi.fn(() => []);
    globalThis.JournalStatsStore = { recordNewEntry, recordDeletion: vi.fn() };

    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    const ta = document.querySelector('.jrn-block-textarea');
    fireEvent.change(ta, { target: { value: 'edited body' } });
    act(() => { window.dispatchEvent(new Event('pagehide')); }); // synchronous commitSave

    expect(recordNewEntry).not.toHaveBeenCalled();
    expect(localStorage.getItem(JRN_STATS_MARKER_KEY)).toBe('j_someone_else_999'); // not consumed by us
    localStorage.removeItem(JRN_STATS_MARKER_KEY);
  });
});
