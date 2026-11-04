// @ts-nocheck — test constructs partial JournalEntry / block literals
/* dl5 (2026-11-04) — Import & Overwrite restores an entry, and the editor opens the restored words.
   ─────────────────────────────────────────────────────────────────────────────────────────────
   The journal editor keeps a localStorage draft of the entry being written (JRNL-1) and takes it
   back on open when it is newer than the entry's last save and differs from it. An import put the
   backup's entry in the store under the backup's (older) stamp but left the device's draft in
   localStorage, so the first open of a restored entry showed the device's words, not the
   backup's, and the editor's exit save wrote them over the restore. The import now drops the
   drafts of every store it restores (utils/backup.js DRAFTS_OF_STORE); a backup that does not
   carry the journal leaves the journal's drafts alone. */

import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { JournalEditorScreen } from './JournalEditorScreen.jsx';
import { JournalStore } from '../../stores/journal-store.js';
import { NoteStore } from '../../stores/note-store.js';
import { JournalHelpers } from '../../data/journal-helpers.js';
import { createPressDrag } from '../../utils/press-drag.js';
import { applyImportPayload } from '../../utils/backup.js';
import { validateStorePayload, validateMediaRecord } from '../../utils/import-validators.js';
import { NOTE_DRAFT_KEY } from '../../utils/note-draft.js';

vi.mock('../../data/journal-helpers.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalHelpers() { return 'JournalHelpers' in globalThis ? /** @type {any} */ (globalThis).JournalHelpers : real.JournalHelpers; } }; });
vi.mock('../../stores/journal-stats-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalStatsStore() { return /** @type {any} */ (globalThis).JournalStatsStore; } }; });
vi.mock('../../stores/journal-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalStore() { return 'JournalStore' in globalThis ? /** @type {any} */ (globalThis).JournalStore : real.JournalStore; } }; });
vi.mock('../../utils/storage-health.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get StorageHealth() { return /** @type {any} */ (globalThis).StorageHealth; } }; });

const mediaStore = { allIds: async () => [], put: async () => {}, delete: async () => {} };
const entry = (title, text, updated) => ({ id: 'j1', title, blocks: [{ id: 'b1', type: 'p', text }], mood: null, tags: [], notebookIds: [], pinned: false, created: 1, updated });

beforeEach(() => {
  cleanup();
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });
  NoteStore._resetForTests({ forceLoaded: true });
  globalThis.JournalStore = JournalStore;
  globalThis.JournalHelpers = JournalHelpers;
  globalThis.createPressDrag = createPressDrag;
  globalThis.JournalMediaStore = { compressImage: vi.fn(), put: vi.fn(), delete: vi.fn() };
  globalThis.showToast = () => {};
  globalThis.StorageHealth = { onWriteFailure: () => {}, onWriteSuccess: () => {} };
  globalThis.ScreenLayout = ({ navChildren, children }) => React.createElement('div', null, navChildren, children);
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = () => null;
  globalThis.JournalImageBlock = () => null;
  globalThis.JournalAudioBlock = () => null;
  globalThis.JournalBlockView = () => null;
  globalThis.JournalInsertSheet = () => null;
  globalThis.JournalRecordingSheet = () => null;
});

describe('dl5 — an import restores what the editor then opens', () => {
  it('the restored entry opens with the backup\'s words, not the device\'s draft of it', async () => {
    JournalStore.replaceAll({ list: [entry('Device title', 'device words', 9000)] });
    // the device's own draft of j1, as the editor leaves it on background-hide
    localStorage.setItem('vot-journal-draft', JSON.stringify({ v: 2, drafts: { j1: { title: 'Device title', blocks: [{ id: 'b1', type: 'p', text: 'device words' }], mood: null, ts: 9000, durable: true } } }));
    localStorage.setItem('vot-journal-new-entry-stats', 'j1');

    const backup = { app: 'VOTReader', exportVersion: 2, data: {}, stores: { 'vot-journal': { list: [entry('Backup title', 'backup words', 100)] } }, media: {} };
    const res = await applyImportPayload(backup, {
      storesMap: { 'vot-journal': { store: JournalStore, method: 'replaceAll' } }, flagMap: {},
      mediaStore, validateStorePayload, validateMediaRecord,
    });
    expect(res.skippedStores).toEqual([]);

    render(<JournalEditorScreen entryId="j1" onBack={() => {}} />);
    expect(document.querySelector('.jrn-editor-title').value).toBe('Backup title');
    expect(document.querySelector('.jrn-block-textarea').value).toBe('backup words');
    cleanup();                                                 // the exit save writes nothing over the restore
    expect(JournalStore.get('j1').title).toBe('Backup title');
    expect(localStorage.getItem('vot-journal-new-entry-stats')).toBeNull();
  });

  it('a backup without the journal leaves the journal\'s drafts alone; one with notes drops the note drafts', async () => {
    const draft = JSON.stringify({ v: 2, drafts: { j1: { title: 't', blocks: [], mood: null, ts: 5 } } });
    localStorage.setItem('vot-journal-draft', draft);
    localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify({ v: 1, drafts: { g1: { body: 'device words', ts: 5 } } }));
    const backup = { app: 'VOTReader', exportVersion: 2, data: {}, stores: { 'vot-notes': {} }, media: {} };
    await applyImportPayload(backup, {
      storesMap: { 'vot-journal': { store: JournalStore, method: 'replaceAll' }, 'vot-notes': { store: NoteStore, method: 'replaceAll' } }, flagMap: {},
      mediaStore, validateStorePayload, validateMediaRecord,
    });
    expect(localStorage.getItem('vot-journal-draft')).toBe(draft);
    expect(localStorage.getItem(NOTE_DRAFT_KEY)).toBeNull();
  });

  it('the keys the import drops are the ones the editor writes (source pinned)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const editor = readFileSync(join(here, 'JournalEditorScreen.jsx'), 'utf8');
    const backupSrc = readFileSync(join(here, '..', '..', 'utils', 'backup.js'), 'utf8');
    expect(editor).toContain("var JOURNAL_DRAFT_KEY = 'vot-journal-draft';");
    expect(editor).toContain("var JRN_NEW_ENTRY_STATS_KEY = 'vot-journal-new-entry-stats';");
    expect(backupSrc).toContain("'vot-journal': ['vot-journal-draft', 'vot-journal-new-entry-stats'],");
    expect(backupSrc).toContain("'vot-notes': ['" + NOTE_DRAFT_KEY + "'],");
  });
});
