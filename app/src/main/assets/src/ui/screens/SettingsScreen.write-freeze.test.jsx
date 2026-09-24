// @ts-nocheck — free-var globals via settings-harness (SettingsScreen takes no ES imports)
/* Import and Clear All freeze the live writers before they touch storage.
   ═══════════════════════════════════════════════════════════════════════
   Improvement sweep 2026-09-22, REPORT #5.

   v04-01: an import REPLACES vot-state, then reloads 0.6-5 s later. The React
   state App persists is the PRE-import state and nothing refreshes it, so a
   scroll, a tap or the reload's own pagehide wrote it back over the restore
   (and the 3-way merge deleted restored readItems). The screen now writes any
   union still in the persist debounce window FIRST, then freezes the sink,
   and only then applies.

   v04-02: Clear All deletes the databases, then reloads 600 ms later. Any
   store write in between recreated 'votreader' with what was still in memory,
   and a playing recording writes every 5 s and again on pagehide. The screen
   now also raises the store write fence and stops the player BEFORE the first
   deleteDatabase.

   Both freezes hold through the reload. A path that does NOT reload (a failed
   write, a failed delete) lifts them, or the session would stop saving.

   The hook and the fence are proven in their own files
   (use-persisted-state.test.js, cached-store.test.js, cross-tab-merge.test.js,
   and backup.test.js against the real stores); this file pins the ORDER in
   which the screen calls them, which is the whole of the fix at this layer. */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import {
  setupSettingsGlobals, teardownSettingsGlobals, renderSettings,
} from './settings-harness.jsx';
import { writeContainer, readContainer, isContainerMagic } from '../../utils/backup-container.js';
import { validateImportEnvelope } from '../../utils/import-validators.js';
import { summarizeBackupManifest, formatVerifyReport } from '../../utils/backup-verify.js';

const MANIFEST = {
  app: 'VOTReader', exportVersion: 3, exportDate: '2026-07-01T12:00:00.000Z',
  counts: { _media: 0, 'vot-notes': 1 },
  data: {}, stores: { 'vot-notes': [1] }, media: [],
};
let votbak;

const btn = (text) => [...document.querySelectorAll('button')]
  .find((b) => (b.textContent || '').trim() === text);
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

/** Every call the freeze touches, in order. */
let log;
let reload;

/** A fake indexedDB whose deletes succeed, or fail for the names given. */
function fakeIndexedDb(failing = []) {
  return {
    deleteDatabase: (name) => {
      log.push('delete:' + name);
      const req = { onsuccess: null, onerror: null, onblocked: null, name };
      queueMicrotask(() => {
        if (failing.includes(name)) { if (req.onerror) req.onerror(); }
        else if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
    databases: () => Promise.resolve([]),
  };
}

function installBridges() {
  window.__flushPersistState = () => { log.push('flush'); };
  window.__freezePersistState = (on) => { log.push('freeze:' + on); };
}

async function importBackup(applyResult) {
  setupSettingsGlobals({
    readContainer, isContainerMagic, validateImportEnvelope,
    summarizeBackupManifest, formatVerifyReport,
    PlatformBridge: {
      isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
      openFilePicker: () => {}, openExportSink: () => null,
      clearGardenCache: () => {}, getCrashLog: () => '[]',
      pickImportFile: () => Promise.resolve(votbak),
    },
    applyV3: () => { log.push('apply'); return Promise.resolve(applyResult); },
  });
  renderSettings();
  await act(async () => { btn('Import').click(); });
  await settle();
  const confirm = btn('Import & Overwrite');
  expect(confirm, 'the import confirm sheet did not open - this case measured nothing').toBeTruthy();
  await act(async () => { confirm.click(); });
  await settle();
}

async function wipeEverything(failing) {
  globalThis.indexedDB = fakeIndexedDb(failing);
  setupSettingsGlobals({
    setStoreWriteFence: (on) => { log.push('fence:' + on); },
    AudioPlayer: { stop: () => { log.push('stop'); }, getState: () => ({ status: 'playing' }) },
  });
  renderSettings();
  await act(async () => { btn('Clear All My Data').click(); });
  const input = screen.getByLabelText('Type DELETE to confirm');
  await act(async () => { fireEvent.change(input, { target: { value: 'DELETE' } }); });
  await act(async () => { btn('Delete Everything').click(); });
  await settle();
  await settle();
}

describe('import and Clear All freeze the live writers first (v04-01 / v04-02)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    log = [];
    installBridges();
    if (!votbak) {
      const chunks = [];
      await writeContainer(MANIFEST, [], (u8) => { chunks.push(u8.slice()); });
      votbak = new Blob(chunks, { type: 'application/octet-stream' });
    }
    reload = vi.fn();
    delete window.location;
    window.location = { reload, href: 'http://localhost/', origin: 'http://localhost' };
  });

  afterEach(() => {
    cleanup();
    teardownSettingsGlobals();
    delete window.__flushPersistState;
    delete window.__freezePersistState;
    vi.useRealTimers();
  });

  it('import: the pending union is flushed, then the sink frozen, BEFORE the apply; still frozen for the reload', async () => {
    await importBackup({ importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] });
    expect(log).toEqual(['flush', 'freeze:true', 'apply']);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(log, 'the freeze must outlive the reload window').not.toContain('freeze:false');
  });

  it('import that does not reload (a store failed to save): the sink is thawed, the session keeps saving', async () => {
    await importBackup({ importFailures: 0, writeFailures: 1, skippedStores: [], countMismatches: [] });
    expect(log).toEqual(['flush', 'freeze:true', 'apply', 'freeze:false']);
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(reload).not.toHaveBeenCalled();
  });

  it('Clear All: sink frozen, stores fenced and the player stopped BEFORE the first database is deleted', async () => {
    await wipeEverything();
    const firstDelete = log.findIndex((e) => e.startsWith('delete:'));
    expect(firstDelete, 'the wipe never reached deleteDatabase - this case measured nothing').toBeGreaterThan(-1);
    const before = log.slice(0, firstDelete);
    expect(before).toEqual(['flush', 'freeze:true', 'fence:true', 'stop']);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(log, 'the fence must hold through the reload').not.toContain('fence:false');
    expect(log).not.toContain('freeze:false');
  });

  it('Clear All whose delete failed (no reload): the fence is lowered and the sink thawed', async () => {
    await wipeEverything(['votreader']);
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(reload).not.toHaveBeenCalled();
    expect(log.slice(-2)).toEqual(['fence:false', 'freeze:false']);
  });
});
