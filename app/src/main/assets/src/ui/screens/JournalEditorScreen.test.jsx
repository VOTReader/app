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

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('../../data/journal-helpers.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalHelpers() { return 'JournalHelpers' in globalThis ? /** @type {any} */ (globalThis).JournalHelpers : real.JournalHelpers; } }; });
vi.mock('../../stores/journal-stats-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalStatsStore() { return /** @type {any} */ (globalThis).JournalStatsStore; } }; });
vi.mock('../../stores/journal-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalStore() { return 'JournalStore' in globalThis ? /** @type {any} */ (globalThis).JournalStore : real.JournalStore; } }; });
vi.mock('../../utils/storage-health.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get StorageHealth() { return /** @type {any} */ (globalThis).StorageHealth; } }; });

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

    const draft = JSON.parse(localStorage.getItem('vot-journal-draft')).drafts[entry.id];
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

/* sweep mw13 (T3 data loss): JRNL-1 kept ONE draft slot for every entry. The WebView is
   killed while entry A is backgrounded, before A's IDB write lands; after the restart the
   reader opens and backgrounds entry B before going back to A, and B's draft overwrote
   A's: A's last words were gone. Drafts are now kept per entry under the same key. */
describe('JournalEditorScreen — JRNL-1 drafts are kept per entry (sweep mw13)', () => {
  let realWhenSaved;
  beforeEach(() => { realWhenSaved = JournalStore.whenSaved; });
  afterEach(() => { JournalStore.whenSaved = realWhenSaved; });
  const p = (text) => [JournalHelpers.newBlock('p', { text })];
  const seedOld = (entry, title, text) => localStorage.setItem('vot-journal-draft', JSON.stringify({
    entryId: entry.id, title, blocks: p(text), mood: null, ts: (entry.updated || 0) + 5000,
  }));
  const hideEdit = (entry, title) => {
    const r = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: title } });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    r.unmount();
  };

  it("backgrounding entry B before A is reopened keeps A's unrecovered draft", () => {
    const a = JournalStore.add({ title: 'A', blocks: p('a body') });
    const b = JournalStore.add({ title: 'B', blocks: p('b body') });
    seedOld(a, 'A after the kill', 'the words a kill lost'); // a pre-fix single-slot draft
    hideEdit(b, 'B edited');
    render(<JournalEditorScreen entryId={a.id} onBack={() => {}} />);
    expect(document.querySelector('.jrn-editor-title').value).toBe('A after the kill');
    expect(document.querySelector('.jrn-block-textarea').value).toBe('the words a kill lost');
  });

  it("opening an entry consumes only ITS stale draft; another entry's draft stays", () => {
    const a = JournalStore.add({ title: 'A', blocks: p('a body') });
    const b = JournalStore.add({ title: 'B', blocks: p('b body') });
    localStorage.setItem('vot-journal-draft', JSON.stringify({ v: 2, drafts: {
      [a.id]: { title: 'A lost', blocks: p('a lost'), mood: null, ts: (a.updated || 0) + 5000 },
      [b.id]: { title: 'B stale', blocks: p('b stale'), mood: null, ts: (b.updated || 0) - 5000 },
    } }));
    const rb = render(<JournalEditorScreen entryId={b.id} onBack={() => {}} />);
    expect(document.querySelector('.jrn-editor-title').value).toBe('B');
    rb.unmount();
    const left = JSON.parse(localStorage.getItem('vot-journal-draft')).drafts;
    expect(Object.keys(left)).toEqual([a.id]);
    render(<JournalEditorScreen entryId={a.id} onBack={() => {}} />);
    expect(document.querySelector('.jrn-editor-title').value).toBe('A lost');
  });

  // Refuter r1: the store's MEMORY is no proof the words are on disk. JournalStore.update
  // changes it at once while the IDB write is still in flight (or failing), so a draft
  // judged 'already saved' against it could be dropped and then the kill lost both.
  it("B's background draft keeps A's while A's save has not been confirmed on disk", () => {
    JournalStore.whenSaved = () => new Promise(() => {}); // A's IDB write never lands
    const a = JournalStore.add({ title: 'A', blocks: p('a body') });
    const b = JournalStore.add({ title: 'B', blocks: p('b body') });
    hideEdit(a, 'A edited');   // memory now holds 'A edited'; the draft equals it
    hideEdit(b, 'B edited');
    const left = JSON.parse(localStorage.getItem('vot-journal-draft')).drafts;
    expect(left[a.id].title).toBe('A edited');
    expect(left[b.id].title).toBe('B edited');
  });

  it('a draft whose save is confirmed on disk is marked durable, and the next write drops it', async () => {
    JournalStore.whenSaved = () => Promise.resolve(true);
    const a = JournalStore.add({ title: 'A', blocks: p('a body') });
    const b = JournalStore.add({ title: 'B', blocks: p('b body') });
    hideEdit(a, 'A edited');
    await act(async () => { await Promise.resolve(); });
    expect(JSON.parse(localStorage.getItem('vot-journal-draft')).drafts[a.id].durable).toBe(true);
    JournalStore.whenSaved = () => new Promise(() => {});
    hideEdit(b, 'B edited');
    expect(Object.keys(JSON.parse(localStorage.getItem('vot-journal-draft')).drafts)).toEqual([b.id]);
  });

  it('a failed save, a store that is not loaded, or fenced writes never mark a draft durable', async () => {
    const a = JournalStore.add({ title: 'A', blocks: p('a body') });
    const durable = () => !!JSON.parse(localStorage.getItem('vot-journal-draft')).drafts[a.id].durable;
    JournalStore.whenSaved = () => Promise.resolve(false);
    hideEdit(a, 'A one');
    await act(async () => { await Promise.resolve(); });
    expect(durable()).toBe(false);
    JournalStore.whenSaved = () => Promise.resolve(true);
    const ready = JournalStore.isReady;
    JournalStore.isReady = () => false;
    hideEdit(a, 'A two');
    await act(async () => { await Promise.resolve(); });
    expect(durable()).toBe(false);
    JournalStore.isReady = ready;
    globalThis.isStoreWriteFenced = () => true;
    try {
      hideEdit(a, 'A three');
      await act(async () => { await Promise.resolve(); });
      expect(durable()).toBe(false);
    } finally { delete globalThis.isStoreWriteFenced; }
  });

  // Refuter r2: two hides of A in the same millisecond, the first save lands and the second
  // fails: the first confirmation must not mark the SECOND draft (it named drafts by ts).
  it("a confirmation of an older save never marks a newer draft of the same entry", async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1800000000000);
    const confirm = [];
    JournalStore.whenSaved = () => new Promise((res) => { confirm.push(res); });
    try {
      const a = JournalStore.add({ title: 'A', blocks: p('a body') });
      render(<JournalEditorScreen entryId={a.id} onBack={() => {}} />);
      fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: 'A one' } });
      act(() => { window.dispatchEvent(new Event('pagehide')); });
      fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: 'A two' } });
      act(() => { window.dispatchEvent(new Event('pagehide')); });
      await act(async () => { confirm[0](true); confirm[1](false); await Promise.resolve(); });
      const d = JSON.parse(localStorage.getItem('vot-journal-draft')).drafts[a.id];
      expect(d.title).toBe('A two');
      expect(d.durable).toBeFalsy();
    } finally { now.mockRestore(); }
  });

  // Refuter r2: a save the write fence held resolves 'unwritten' yet whenSaved says true, so
  // a fence up at the confirmation leaves the draft unmarked. Refuter r3: a write that started
  // meanwhile is waited for (it writes the whole store), never a reason to give up for good.
  it('a fence up at the confirmation leaves the draft unmarked; a newer write is waited for, then it marks', async () => {
    let fence = false;
    globalThis.isStoreWriteFenced = () => fence;
    const confirm = [];
    JournalStore.whenSaved = () => new Promise((res) => { confirm.push(res); });
    try {
      const a = JournalStore.add({ title: 'A', blocks: p('a body') });
      const other = JournalStore.add({ title: 'O', blocks: p('o') });
      const durable = () => !!JSON.parse(localStorage.getItem('vot-journal-draft')).drafts[a.id].durable;
      const r = render(<JournalEditorScreen entryId={a.id} onBack={() => {}} />);
      fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: 'A fenced' } });
      act(() => { window.dispatchEvent(new Event('pagehide')); });
      fence = true;                                   // another tab's Clear All / Import holds writes
      await act(async () => { confirm.forEach((res) => res(true)); await Promise.resolve(); });
      expect(durable()).toBe(false);
      fence = false;
      confirm.length = 0;
      fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: 'A again' } });
      act(() => { window.dispatchEvent(new Event('pagehide')); });
      // W70: an edit made while A's save still waits for its lock rides on that save (next
      // test); this one comes after A's save has run, so it starts a write of its own.
      await act(async () => { await Promise.resolve(/** @type {any} */ (JournalStore)._lastWrite).catch(() => {}); });
      JournalStore.update(other.id, { title: 'O2' }); // a newer write starts before A's is confirmed
      const pending = confirm.splice(0);
      await act(async () => { pending.forEach((res) => res(true)); await Promise.resolve(); });
      expect(durable()).toBe(false);                  // not yet: the newer write is not confirmed
      expect(confirm).toHaveLength(1);                // ...and it is being waited for
      await act(async () => { confirm[0](true); await Promise.resolve(); });
      expect(durable()).toBe(true);
      r.unmount();
    } finally { delete globalThis.isStoreWriteFenced; }
  });

  // W70: the store folds an edit made while its save waits for the lock into that save, which
  // then writes both. No second write starts, so the draft is marked when that one lands.
  it('an edit folded into the save carrying the draft: marked once that save is confirmed', async () => {
    const confirm = [];
    JournalStore.whenSaved = () => new Promise((res) => { confirm.push(res); });
    const a = JournalStore.add({ title: 'A', blocks: p('a body') });
    const other = JournalStore.add({ title: 'O', blocks: p('o') });
    await act(async () => { await Promise.resolve(/** @type {any} */ (JournalStore)._lastWrite).catch(() => {}); });
    const durable = () => !!JSON.parse(localStorage.getItem('vot-journal-draft')).drafts[a.id].durable;
    const r = render(<JournalEditorScreen entryId={a.id} onBack={() => {}} />);
    fireEvent.change(document.querySelector('.jrn-editor-title'), { target: { value: 'A folded' } });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    const carrier = /** @type {any} */ (JournalStore)._lastWrite;
    JournalStore.update(other.id, { title: 'O2' });  // still queued: folded, no write of its own
    expect(/** @type {any} */ (JournalStore)._lastWrite).toBe(carrier);
    await act(async () => { confirm.splice(0).forEach((res) => res(true)); await Promise.resolve(); });
    expect(durable()).toBe(true);
    r.unmount();
  });

  it('over the quota the oldest other draft gives way first, and the entry on screen is kept', () => {
    JournalStore.whenSaved = () => new Promise(() => {});
    const a = JournalStore.add({ title: 'A', blocks: p('a body') });
    const b = JournalStore.add({ title: 'B', blocks: p('b body') });
    const x = JournalStore.add({ title: 'X', blocks: p('x') });
    localStorage.setItem('vot-journal-draft', JSON.stringify({ v: 2, drafts: {
      [a.id]: { title: 'A lost', blocks: p('a lost'), mood: null, ts: 1000 },
      [b.id]: { title: 'B lost', blocks: p('b lost'), mood: null, ts: 2000 },
    } }));
    const real = Storage.prototype.setItem;
    // Room for two drafts, not three.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (k === 'vot-journal-draft' && Object.keys(JSON.parse(v).drafts).length > 2) throw new Error('QuotaExceededError');
      return real.call(this, k, v);
    });
    try { hideEdit(x, 'X edited'); } finally { spy.mockRestore(); }
    const left = JSON.parse(localStorage.getItem('vot-journal-draft')).drafts;
    expect(Object.keys(left).sort()).toEqual([b.id, x.id].sort());
    expect(left[x.id].title).toBe('X edited');
  });

  it('the prune of a blank entry removes only its own draft', () => {
    const a = JournalStore.add({ title: 'A', blocks: p('a body') });
    const blank = JournalStore.add();
    localStorage.setItem('vot-journal-draft', JSON.stringify({ v: 2, drafts: {
      [a.id]: { title: 'A lost', blocks: p('a lost'), mood: null, ts: (a.updated || 0) + 5000 },
      [blank.id]: { title: '', blocks: p(''), mood: null, ts: (blank.updated || 0) + 5000 },
    } }));
    render(<JournalEditorScreen entryId={blank.id} onBack={() => {}} />).unmount();
    expect(JournalStore.get(blank.id)).toBeNull();
    expect(Object.keys(JSON.parse(localStorage.getItem('vot-journal-draft')).drafts)).toEqual([a.id]);
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

   P1-5  Stats were recorded on the New-Entry tap, before a word was
         written. They now wait for the FIRST NON-EMPTY SAVE,
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

/* v05-05 — opening an old entry must not re-date it. The editor flushes on
   every blur, background (pagehide / visibilitychange:hidden), unmount and
   auto-save tick, and each flush called JournalStore.update unconditionally,
   which stamps `updated` to now. The hub dates and sorts its cards by
   `updated`, so Edit -> Back with no change, or switching apps with the editor
   open, showed a year-old entry with today's date at the top of the list. */
describe('JournalEditorScreen — v05-05: leaving an entry unchanged keeps its date', () => {
  const YEAR_AGO = Date.now() - 365 * 24 * 3600 * 1000;
  const oldEntry = () => JournalStore.add({
    title: 'Old thoughts', created: YEAR_AGO, updated: YEAR_AGO,
    blocks: [JournalHelpers.newBlock('p', { text: 'written last year' })],
  });

  it('Edit -> Back with no change keeps the old date', () => {
    const entry = oldEntry();
    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    unmount();
    expect(JournalStore.get(entry.id).updated).toBe(YEAR_AGO);
  });

  it('switching apps with the editor open keeps the old date', () => {
    const entry = oldEntry();
    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(JournalStore.get(entry.id).updated).toBe(YEAR_AGO);
  });

  it('leaving the title or a paragraph without typing keeps the old date', () => {
    const entry = oldEntry();
    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    fireEvent.blur(document.querySelector('.jrn-editor-title'));
    fireEvent.blur(document.querySelector('.jrn-block-textarea'));
    expect(JournalStore.get(entry.id).updated).toBe(YEAR_AGO);
  });

  it('typing and then undoing it keeps the old date, through the auto-save too', () => {
    vi.useFakeTimers();
    try {
      const entry = oldEntry();
      const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
      const ta = document.querySelector('.jrn-block-textarea');
      fireEvent.change(ta, { target: { value: 'written last year!' } });
      fireEvent.change(ta, { target: { value: 'written last year' } });
      act(() => { vi.advanceTimersByTime(1500); });   // the 1.2 s auto-save runs
      unmount();
      expect(JournalStore.get(entry.id).updated).toBe(YEAR_AGO);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a real edit still saves the words and re-dates the entry', () => {
    const entry = oldEntry();
    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    fireEvent.change(document.querySelector('.jrn-block-textarea'), { target: { value: 'and again today' } });
    unmount();
    const saved = JournalStore.get(entry.id);
    expect(saved.blocks.find((b) => b.type === 'p').text).toBe('and again today');
    expect(saved.updated).toBeGreaterThan(YEAR_AGO);
  });

  it('a recovered background draft is still written on Back (its words never reached the store)', () => {
    const entry = oldEntry();
    localStorage.setItem('vot-journal-draft', JSON.stringify({
      entryId: entry.id, title: 'Old thoughts',
      blocks: [JournalHelpers.newBlock('p', { text: 'the words a kill lost' })], mood: null,
      ts: Date.now(),
    }));
    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    unmount();
    expect(JournalStore.get(entry.id).blocks.find((b) => b.type === 'p').text).toBe('the words a kill lost');
  });
});

describe('JournalEditorScreen — P1-5: stats wait for the first non-empty save', () => {
  afterEach(() => {
    delete globalThis.JournalStatsStore;
  });

  it('records stats on the FIRST non-empty save, exactly once', () => {
    const entry = JournalStore.add();
    localStorage.setItem(JRN_STATS_MARKER_KEY, entry.id); // the createAndEditJournal handoff
    const recordNewEntry = vi.fn();
    globalThis.JournalStatsStore = { recordNewEntry, recordDeletion: vi.fn() };
    render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    // The bug: stats recorded at New-Entry tap time. Here, nothing has been
    // written yet, so nothing may have recorded.
    expect(recordNewEntry).not.toHaveBeenCalled();

    const ta = document.querySelector('.jrn-block-textarea');
    fireEvent.change(ta, { target: { value: 'first words' } });
    // pagehide drives the synchronous commitSave flush (no debounce wait) —
    // the same proven J2 path as the data-safety tests above.
    act(() => { window.dispatchEvent(new Event('pagehide')); });

    expect(recordNewEntry).toHaveBeenCalledTimes(1);
    expect(recordNewEntry).toHaveBeenCalledWith(entry.created);
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

  it('W16 refuter: an entry whose stats were recorded, then emptied and pruned, gives its count back', () => {
    const entry = JournalStore.add();
    localStorage.setItem(JRN_STATS_MARKER_KEY, entry.id);
    const recordNewEntry = vi.fn();
    const recordDeletion = vi.fn();
    globalThis.JournalStatsStore = { recordNewEntry, recordDeletion };
    const { unmount } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    const ta = document.querySelector('.jrn-block-textarea');
    fireEvent.change(ta, { target: { value: 'first words' } });
    act(() => { window.dispatchEvent(new Event('pagehide')); });   // saved: counted
    expect(recordNewEntry).toHaveBeenCalledTimes(1);
    fireEvent.change(document.querySelector('.jrn-block-textarea'), { target: { value: '' } });
    unmount();                                                      // blank again: pruned

    expect(JournalStore.get(entry.id)).toBeNull();
    expect(recordDeletion).toHaveBeenCalledTimes(1);
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

/* a11y (axe page-has-heading-one, 2026-09-27): the editor was the one screen
   in the audit walk with no level-one heading, so a screen reader's heading
   list was empty on it. The heading is visually hidden: nothing on screen moves. */
describe('JournalEditorScreen — the screen has a heading', () => {
  it('carries one visually hidden level-one heading', () => {
    const entry = JournalStore.add({ title: 'orig', blocks: [JournalHelpers.newBlock('p', { text: 'first' })] });
    const { container } = render(<JournalEditorScreen entryId={entry.id} onBack={() => {}} />);
    const h1s = container.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe('Journal entry');
    expect(h1s[0].classList.contains('sr-only')).toBe(true);
  });
});
