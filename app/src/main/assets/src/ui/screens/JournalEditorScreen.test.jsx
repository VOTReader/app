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

beforeEach(() => {
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });

  // Bare-name globals the screen reads (in prod, _entry-* Object.assigns these
  // onto window). Real store + helpers; far-boundary UI chrome stubbed.
  globalThis.JournalStore = JournalStore;
  globalThis.JournalHelpers = JournalHelpers;
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
