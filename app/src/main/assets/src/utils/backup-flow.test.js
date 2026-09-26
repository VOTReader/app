// @vitest-environment jsdom
// @ts-nocheck — installs the bundle-d / bundle-b window globals backup-flow.js reads
/* backup-flow — the Settings backup flows, driven directly (v15-code-health-05).
   ═══════════════════════════════════════════════════════════════════════
   The flows moved out of SettingsScreen unchanged; the screen tests
   (SettingsScreen.verify / .write-freeze / .reloadtimer) still drive them
   through the real rows. This file drives createBackupFlow with a plain ctx,
   so the branches no row reaches cheaply (an aborted build, an oversized
   manifest, a cancelled picker, a failed write, a failed delete, a tab that
   lost the backup lock) each have a witness, and the module carries its own
   coverage floor.

   The data plane (buildV3Manifest, applyV3, applyImportPayload, the store
   round-trip) is proven against the real stores in backup.test.js; here it is
   stubbed at the far boundary, and the real container codec, envelope
   validator and verify formatter are used wherever the flow reads a file. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBackupFlow, _savedBackupToast } from './backup-flow.js';
import { writeContainer, readContainer, isContainerMagic } from './backup-container.js';
import { validateImportEnvelope } from './import-validators.js';
import { summarizeBackupManifest, formatVerifyReport } from './backup-verify.js';

const STORE_NAMES = [
  'AnnotationStore', 'NoteStore', 'BookmarkStore', 'LinkStore', 'NotebookStore', 'JournalStore',
  'JournalNotebookStore', 'JournalIndexStore', 'JournalStatsStore', 'ReadingStreakStore', 'ReadingStatsStore',
  'GardenPosStore', 'RecentNavStore', 'HistoryStore', 'ProphecyCardsStore', 'HomeOrderStore',
  'LibraryOrderStore', 'NoteDefaultStore', 'StateStore',
  'WelcomedFlagStore', 'AboutSeenFlagStore', 'GardenWarningFlagStore', 'AnnHintDismissedFlagStore', 'TourDoneFlagStore',
];

const MANIFEST = {
  app: 'VOTReader', exportVersion: 3, exportDate: '2026-07-01T12:00:00.000Z',
  counts: { _media: 0, 'vot-notes': 1 },
  data: {}, stores: { 'vot-notes': [1], 'vot-bookmarks': [1, 2] }, media: [],
};
const LEGACY = {
  app: 'VOTReader', exportVersion: 2, exportDate: '2026-07-01T12:00:00.000Z',
  data: {}, stores: { 'vot-annotations': { a: 1, b: 2 } }, media: {},
};

const INSTALLED = [];
function put(name, value) { INSTALLED.push(name); globalThis[name] = value; }

let toasts;          // every toast text shown, in order
let bridge;
let ctx;
let reload;

/** A picked File whose bytes are `parts`. */
const fileOf = (parts, name = 'b.votbak') => new File(parts, name);
async function votbakFile(manifest = MANIFEST) {
  const chunks = [];
  await writeContainer(manifest, [], async (c) => { chunks.push(c); });
  return fileOf(chunks);
}
const lastToast = () => toasts[toasts.length - 1];
/** Let the flow's awaits run (the import path awaits a few times before it settles). */
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function makeCtx(overrides) {
  return {
    busyRef: { current: false },
    reloadPendingRef: { current: false },
    reloadTimerRef: { current: 0 },
    setBusy: vi.fn(),
    setVerifyReport: vi.fn(),
    confirmImport: vi.fn(() => Promise.resolve(true)),
    diagnosticLog: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  toasts = [];
  reload = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  localStorage.clear();
  for (const n of STORE_NAMES) put(n, { getState: () => 'loaded' });
  put('IDBAdapter', {});
  put('JournalMediaStore', {});
  put('showToast', (opts) => { toasts.push(opts.text || opts.html); });
  put('hideToast', () => {});
  put('setStoreWriteFence', vi.fn());
  put('withBackupLock', (op) => op());
  put('buildV3Manifest', vi.fn(() => Promise.resolve({ ok: true, manifest: MANIFEST, mediaEntries: [], manifestBytes: 100, problems: [] })));
  put('writeContainer', writeContainer);
  put('readContainer', readContainer);
  put('isContainerMagic', isContainerMagic);
  put('validateImportEnvelope', validateImportEnvelope);
  put('validateStorePayload', () => []);
  put('validateMediaRecord', () => []);
  put('summarizeBackupManifest', summarizeBackupManifest);
  put('formatVerifyReport', formatVerifyReport);
  put('formatImportSpaceWarning', () => '');
  put('applyV3', vi.fn(() => Promise.resolve({ importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] })));
  put('applyImportPayload', vi.fn(() => Promise.resolve({ importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] })));
  put('runV3AndroidExport', vi.fn(() => Promise.resolve()));
  put('classifyV3ImportBegin', (b) => b);
  put('v3AndroidImportEntries', vi.fn(async function* () { /* no media */ }));
  put('__flushPersistState', vi.fn());
  put('__freezePersistState', vi.fn());
  bridge = {
    isAndroid: false,
    openExportSink: vi.fn(),
    pickImportFile: vi.fn(),
    clearGardenCache: vi.fn(),
    v3ExportOpen: vi.fn(() => { window.__onV3ExportReady('ok'); }),
    v3ImportOpen: vi.fn(() => { window.__onV3ImportReady('ok'); }),
    v3ImportBegin: vi.fn(),
    v3ImportClose: vi.fn(),
  };
  put('PlatformBridge', bridge);
  put('indexedDB', {
    deleteDatabase: vi.fn(() => {
      const req = {};
      queueMicrotask(() => req.onsuccess && req.onsuccess());
      return req;
    }),
  });
  ctx = makeCtx();
});

afterEach(() => {
  while (INSTALLED.length) delete globalThis[INSTALLED.pop()];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('_savedBackupToast', () => {
  it('a clean backup is a short, fading toast', () => {
    expect(_savedBackupToast([], false)).toEqual({ text: 'Backup saved.', sticky: false });
  });
  it('names how many recent changes may be missing, and stays up', () => {
    expect(_savedBackupToast(['a'], false).text).toContain('1 recent change may be missing');
    expect(_savedBackupToast(['a', 'b'], false).text).toContain('2 recent changes may be missing; your device could not finish saving them');
    expect(_savedBackupToast(['a'], false).sticky).toBe(true);
  });
  it('warns when the backup nears the Android import limit', () => {
    const t = _savedBackupToast(undefined, true);
    expect(t.text).toContain('nearing the Android import size limit');
    expect(t.sticky).toBe(true);
  });
});

describe('the busy lock', () => {
  it('a second operation while one runs does nothing', async () => {
    const flow = createBackupFlow(ctx);
    let release;
    const first = flow._runBackupOperation(() => new Promise((r) => { release = r; }));
    const second = vi.fn();
    await flow._runBackupOperation(second);
    expect(second).not.toHaveBeenCalled();
    expect(ctx.setBusy).toHaveBeenCalledWith(true);
    release();
    await first;
    expect(ctx.busyRef.current).toBe(false);
    expect(ctx.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('an operation that scheduled the reload keeps the lock through it', async () => {
    const flow = createBackupFlow(ctx);
    await flow._runBackupOperation(async () => { flow._scheduleBackupReload(600); });
    expect(ctx.busyRef.current).toBe(true);
    expect(ctx.setBusy).not.toHaveBeenCalledWith(false);
    vi.advanceTimersByTime(600);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(ctx.reloadPendingRef.current).toBe(false);
  });

  it('a second schedule replaces the first timer: one reload', () => {
    const flow = createBackupFlow(ctx);
    flow._scheduleBackupReload(5000);
    flow._scheduleBackupReload(600);
    vi.advanceTimersByTime(6000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('another tab holding the backup lock gets its own message', async () => {
    put('withBackupLock', () => Promise.reject(new Error('backup already in progress')));
    const flow = createBackupFlow(ctx);
    await flow._runLockedBackupOperation(async () => {});
    expect(lastToast()).toContain('running in a different tab');
  });

  it('any other lock failure is not swallowed', async () => {
    put('withBackupLock', () => Promise.reject(new Error('boom')));
    const flow = createBackupFlow(ctx);
    await expect(flow._runLockedBackupOperation(async () => {})).rejects.toThrow('boom');
    expect(ctx.busyRef.current).toBe(false);
  });
});

describe('Export (web)', () => {
  it('flushes the pending state, streams the container and says it saved', async () => {
    const written = [];
    bridge.openExportSink.mockResolvedValue({ write: async (c) => { written.push(c); }, close: vi.fn(() => Promise.resolve()) });
    await createBackupFlow(ctx).exportPersonalData();
    expect(globalThis.__flushPersistState).toHaveBeenCalled();
    expect(globalThis.buildV3Manifest.mock.calls[0][0].storesMap['vot-state'].method).toBe('set');
    expect(bridge.openExportSink.mock.calls[0][0]).toMatch(/^votreader-backup-\d{4}-\d\d-\d\d\.votbak$/);
    expect(written.length).toBeGreaterThan(0);
    expect(lastToast()).toBe('Backup saved.');
  });

  it('a store read that threw aborts, naming it', async () => {
    globalThis.buildV3Manifest.mockResolvedValue({ ok: false, problems: ['vot-notes'] });
    await createBackupFlow(ctx).exportPersonalData();
    expect(bridge.openExportSink).not.toHaveBeenCalled();
    expect(lastToast()).toContain('could not read: vot-notes');
  });

  it('a manifest over the 16 MiB restore limit is refused', async () => {
    globalThis.buildV3Manifest.mockResolvedValue({ ok: true, manifest: MANIFEST, mediaEntries: [], manifestBytes: 17 * 1024 * 1024, problems: [] });
    await createBackupFlow(ctx).exportPersonalData();
    expect(bridge.openExportSink).not.toHaveBeenCalled();
    expect(lastToast()).toContain('over the 16 MiB restore limit');
  });

  it('a cancelled save picker stays quiet', async () => {
    bridge.openExportSink.mockResolvedValue(null);
    await createBackupFlow(ctx).exportPersonalData();
    expect(toasts).toEqual(['Preparing export…']);
  });

  it('a slow picker offers the usual way, and the button runs it', async () => {
    const escape = vi.fn();
    bridge.openExportSink.mockImplementation(async (_name, { onSlow }) => {
      const el = document.createElement('div');
      el.id = 'vot-toast-export-escape';
      el.innerHTML = '<button type="button" class="vot-escape-btn">x</button>';
      document.body.appendChild(el);
      onSlow(escape);
      el.querySelector('button').click();
      el.remove();
      return null;
    });
    await createBackupFlow(ctx).exportPersonalData();
    expect(toasts.some((t) => t.includes('Still waiting for the save dialog'))).toBe(true);
    expect(escape).toHaveBeenCalledTimes(1);
  });

  it('a failed write discards the partial file', async () => {
    const abort = vi.fn(() => Promise.resolve());
    bridge.openExportSink.mockResolvedValue({ write: () => Promise.reject(new Error('disk full')), close: vi.fn(), abort });
    await createBackupFlow(ctx).exportPersonalData();
    expect(abort).toHaveBeenCalled();
    expect(lastToast()).toBe('Export failed while writing. Please try again.');
  });

  it('a throw before the picker says so plainly', async () => {
    bridge.openExportSink.mockRejectedValue(new Error('x'));
    await createBackupFlow(ctx).exportPersonalData();
    expect(lastToast()).toBe('Export failed. Please try again.');
  });
});

describe('Export (Android)', () => {
  beforeEach(() => { bridge.isAndroid = true; });

  it('streams through the native bridge', async () => {
    await createBackupFlow(ctx).exportPersonalData();
    expect(bridge.v3ExportOpen).toHaveBeenCalled();
    expect(globalThis.runV3AndroidExport).toHaveBeenCalledWith(expect.objectContaining({ manifestJson: JSON.stringify(MANIFEST) }));
    expect(lastToast()).toBe('Backup saved.');
  });

  it('a dismissed picker writes nothing', async () => {
    bridge.v3ExportOpen.mockImplementation(() => { window.__onV3ExportReady('cancelled'); });
    await createBackupFlow(ctx).exportPersonalData();
    expect(globalThis.runV3AndroidExport).not.toHaveBeenCalled();
  });

  it('a picker error fails loud', async () => {
    bridge.v3ExportOpen.mockImplementation(() => { window.__onV3ExportReady('error'); });
    await createBackupFlow(ctx).exportPersonalData();
    expect(lastToast()).toBe('Export failed while writing. Please try again.');
  });

  it('a build that threw and an oversized manifest abort before the picker', async () => {
    globalThis.buildV3Manifest.mockResolvedValueOnce({ ok: false, problems: ['vot-journal'] });
    await createBackupFlow(ctx).exportPersonalData();
    expect(lastToast()).toContain('could not read: vot-journal');
    globalThis.buildV3Manifest.mockResolvedValueOnce({ ok: true, manifest: MANIFEST, mediaEntries: [], manifestBytes: 17 * 1024 * 1024, problems: [] });
    await createBackupFlow(ctx).exportPersonalData();
    expect(lastToast()).toContain('over the 16 MiB restore limit');
    expect(bridge.v3ExportOpen).not.toHaveBeenCalled();
  });
});

describe('Import (web)', () => {
  it('a legacy backup asks first, then applies, clears the restore marker and reloads', async () => {
    bridge.pickImportFile.mockResolvedValue(fileOf([JSON.stringify(LEGACY)], 'old.json'));
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(ctx.confirmImport).toHaveBeenCalledTimes(1);
    expect(ctx.confirmImport.mock.calls[0][0]).toContain('2 annotated keys');
    expect(globalThis.applyImportPayload).toHaveBeenCalled();
    expect(globalThis.__freezePersistState).toHaveBeenCalledWith(true);
    expect(localStorage.getItem('vot-restore-inflight')).toBeNull();
    expect(lastToast()).toBe('Import complete. Reloading…');
    expect(ctx.reloadPendingRef.current).toBe(true);
    vi.advanceTimersByTime(600);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('declining the sheet touches nothing and lifts the freeze', async () => {
    ctx.confirmImport.mockResolvedValue(false);
    bridge.pickImportFile.mockResolvedValue(await votbakFile());
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(ctx.confirmImport.mock.calls[0][0]).toContain('2 bookmarks');
    expect(globalThis.applyV3).not.toHaveBeenCalled();
    expect(globalThis.__freezePersistState).not.toHaveBeenCalled();
    expect(ctx.reloadPendingRef.current).toBe(false);
  });

  it('a v3 container applies through applyV3', async () => {
    bridge.pickImportFile.mockResolvedValue(await votbakFile());
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(globalThis.applyV3).toHaveBeenCalled();
    expect(lastToast()).toBe('Import complete. Reloading…');
  });

  it('problems get reading time before the reload', async () => {
    globalThis.applyV3.mockResolvedValue({ importFailures: 2, writeFailures: 0, skippedStores: ['vot-links'], countMismatches: ['vot-notes'] });
    bridge.pickImportFile.mockResolvedValue(await votbakFile());
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(lastToast()).toBe("Import completed — 2 errors; 1 section skipped (invalid: vot-links); some records didn't restore (vot-notes). Reloading…");
    vi.advanceTimersByTime(4999);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a write that failed keeps the page up, the marker set and the writers live', async () => {
    globalThis.applyV3.mockResolvedValue({ importFailures: 0, writeFailures: 1, skippedStores: [], countMismatches: [] });
    bridge.pickImportFile.mockResolvedValue(await votbakFile());
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(lastToast()).toContain('Import incomplete — 1 store failed to save');
    expect(localStorage.getItem('vot-restore-inflight')).not.toBeNull();
    expect(ctx.reloadPendingRef.current).toBe(false);
    expect(globalThis.__freezePersistState).toHaveBeenLastCalledWith(false);
  });

  it('a store still loading refuses the import before any write', async () => {
    put('NoteStore', { getState: () => 'pending' });
    bridge.pickImportFile.mockResolvedValue(await votbakFile());
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(lastToast()).toContain('Storage is temporarily unavailable');
    expect(globalThis.applyV3).not.toHaveBeenCalled();
  });

  it('another tab importing: this tab restores the marker it displaced', async () => {
    localStorage.setItem('vot-restore-inflight', 'other-tab');
    globalThis.applyV3.mockRejectedValue(new Error('backup already in progress'));
    bridge.pickImportFile.mockResolvedValue(await votbakFile());
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(localStorage.getItem('vot-restore-inflight')).toBe('other-tab');
    expect(lastToast()).toContain('running in a different tab');
  });

  it('files that are not backups are named as such', async () => {
    const flow = createBackupFlow(ctx);
    bridge.pickImportFile.mockResolvedValue(fileOf(['{"hello":1}'], 'x.json'));
    await flow.importPersonalData(); await settle();
    expect(lastToast()).toBe('This file does not look like a VOTReader backup.');
    bridge.pickImportFile.mockResolvedValue(fileOf(['{not json'], 'x.json'));
    await flow.importPersonalData(); await settle();
    expect(lastToast()).toBe('This backup file is corrupt or incomplete and could not be read.');
    bridge.pickImportFile.mockResolvedValue(await votbakFile({ hello: 1 }));
    await flow.importPersonalData(); await settle();
    expect(lastToast()).toBe('This file does not look like a VOTReader backup.');
    const whole = await votbakFile();
    bridge.pickImportFile.mockResolvedValue(fileOf([whole.slice(0, 12)]));   // the magic, then nothing
    await flow.importPersonalData(); await settle();
    expect(lastToast()).toBe('This backup file is corrupt or incomplete and could not be read.');
    expect(globalThis.applyV3).not.toHaveBeenCalled();
    expect(globalThis.applyImportPayload).not.toHaveBeenCalled();
  });

  it('a legacy pick over 50 MB is refused unread', async () => {
    const big = { size: 51 * 1024 * 1024, slice: () => new Blob(['{']), text: vi.fn() };
    bridge.pickImportFile.mockResolvedValue(big);
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(big.text).not.toHaveBeenCalled();
    expect(lastToast()).toContain('too large to import');
  });

  it('a cancelled picker does nothing', async () => {
    bridge.pickImportFile.mockResolvedValue(null);
    await createBackupFlow(ctx).importPersonalData();
    expect(ctx.confirmImport).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });
});

describe('Import (Android)', () => {
  beforeEach(() => { bridge.isAndroid = true; });

  it('a v3 stream applies, reports a cut file after the frames, and closes the stream', async () => {
    bridge.v3ImportBegin.mockReturnValue({ kind: 'v3', manifestJson: JSON.stringify(MANIFEST) });
    globalThis.v3AndroidImportEntries.mockImplementation(({ onDone }) => { onDone('truncated'); return (async function* () {})(); });
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(globalThis.applyV3).toHaveBeenCalled();
    expect(lastToast()).toContain('the file was cut short');
    expect(bridge.v3ImportClose).toHaveBeenCalled();
  });

  it('a legacy file routes to the v2 applier', async () => {
    bridge.v3ImportBegin.mockReturnValue({ kind: 'legacy', json: JSON.stringify(LEGACY) });
    await createBackupFlow(ctx).importPersonalData();
    await settle();
    expect(globalThis.applyImportPayload).toHaveBeenCalled();
  });

  it('every refusal closes the native stream', async () => {
    const flow = createBackupFlow(ctx);
    const cases = [
      [{ kind: 'error', reason: 'too_large' }, 'too large to import'],
      [{ kind: 'error', reason: 'io' }, 'corrupt or incomplete'],
      [{ kind: 'other' }, 'does not look like a VOTReader backup'],
      [{ kind: 'v3', manifestJson: '{bad' }, 'corrupt or incomplete'],
      [{ kind: 'v3', manifestJson: '{"hello":1}' }, 'does not look like a VOTReader backup'],
    ];
    for (const [begin, msg] of cases) {
      bridge.v3ImportClose.mockClear();
      bridge.v3ImportBegin.mockReturnValue(begin);
      await flow.importPersonalData(); await settle();
      expect(lastToast()).toContain(msg);
      expect(bridge.v3ImportClose).toHaveBeenCalled();
    }
    bridge.v3ImportBegin.mockImplementation(() => { throw new Error('native'); });
    await flow.importPersonalData(); await settle();
    expect(lastToast()).toBe('Import failed: could not read file.');
    bridge.v3ImportOpen.mockImplementation(() => { window.__onV3ImportReady('denied'); });
    await flow.importPersonalData(); await settle();
    expect(lastToast()).toContain('could not open the file');
  });
});

describe('Verify a Backup', () => {
  it('a sound container reports what it holds, applying nothing', async () => {
    bridge.pickImportFile.mockResolvedValue(await votbakFile());
    await createBackupFlow(ctx).verifyBackupFile();
    const report = ctx.setVerifyReport.mock.calls.at(-1)[0];
    expect(report.level).toBe('ok');
    expect(globalThis.applyV3).not.toHaveBeenCalled();
  });

  it('a legacy file and a stranger are told apart', async () => {
    const flow = createBackupFlow(ctx);
    bridge.pickImportFile.mockResolvedValue(fileOf([JSON.stringify(LEGACY)]));
    await flow.verifyBackupFile();
    expect(ctx.setVerifyReport.mock.calls.at(-1)[0].level).toBe('ok');
    bridge.pickImportFile.mockResolvedValue(fileOf(['{"x":1}']));
    await flow.verifyBackupFile();
    expect(ctx.setVerifyReport.mock.calls.at(-1)[0]).toEqual({ message: 'This file does not look like a VOTReader backup.', level: 'warn' });
    bridge.pickImportFile.mockResolvedValue(fileOf(['{bad']));
    await flow.verifyBackupFile();
    expect(ctx.setVerifyReport.mock.calls.at(-1)[0].message).toContain('corrupt or incomplete');
    bridge.pickImportFile.mockResolvedValue({ size: 51 * 1024 * 1024, slice: () => new Blob(['{']) });
    await flow.verifyBackupFile();
    expect(ctx.setVerifyReport.mock.calls.at(-1)[0].message).toContain('over 50 MB');
  });

  it('Android: walks every frame to the trailing check, then closes', async () => {
    bridge.isAndroid = true;
    bridge.v3ImportBegin.mockReturnValue({ kind: 'v3', manifestJson: JSON.stringify(MANIFEST) });
    globalThis.v3AndroidImportEntries.mockImplementation(({ onDone }) => (async function* () { yield* []; onDone('ok'); })());
    await createBackupFlow(ctx).verifyBackupFile();
    expect(ctx.setVerifyReport.mock.calls.at(-1)[0].level).toBe('ok');
    expect(bridge.v3ImportClose).toHaveBeenCalled();
  });

  it('Android: a broken bridge session says so, and never calls the file corrupt', async () => {
    bridge.isAndroid = true;
    bridge.v3ImportBegin.mockReturnValue({ kind: 'v3', manifestJson: JSON.stringify(MANIFEST) });
    globalThis.v3AndroidImportEntries.mockImplementation(() => (async function* () { yield* []; throw new Error('no_session'); })());
    await createBackupFlow(ctx).verifyBackupFile();
    expect(ctx.setVerifyReport.mock.calls.at(-1)[0].message).toContain('could not read the file all the way through');
  });

  it('Android: legacy, refusals and a dismissed picker', async () => {
    bridge.isAndroid = true;
    const flow = createBackupFlow(ctx);
    bridge.v3ImportBegin.mockReturnValue({ kind: 'legacy', json: JSON.stringify(LEGACY) });
    await flow.verifyBackupFile();
    expect(ctx.setVerifyReport.mock.calls.at(-1)[0].level).toBe('ok');
    for (const [begin, msg] of [
      [{ kind: 'error', reason: 'too_large' }, 'over 50 MB'],
      [{ kind: 'error', reason: 'io' }, 'corrupt or incomplete'],
      [{ kind: 'legacy', json: '{bad' }, 'corrupt or incomplete'],
      [{ kind: 'other' }, 'does not look like'],
      [{ kind: 'v3', manifestJson: '{bad' }, 'corrupt or incomplete'],
    ]) {
      bridge.v3ImportBegin.mockReturnValue(begin);
      await flow.verifyBackupFile();
      expect(ctx.setVerifyReport.mock.calls.at(-1)[0].message).toContain(msg);
    }
    ctx.setVerifyReport.mockClear();
    bridge.v3ImportOpen.mockImplementation(() => { window.__onV3ImportReady('cancelled'); });
    await flow.verifyBackupFile();
    expect(ctx.setVerifyReport).not.toHaveBeenCalled();
  });
});

describe('Clear All Personal Data', () => {
  it('stops the player, deletes every database and vot- key, then reloads with the writers still frozen', async () => {
    const stop = vi.fn();
    put('AudioPlayer', { stop });
    localStorage.setItem('vot-state', '{}');
    localStorage.setItem('other', 'kept');
    await createBackupFlow(ctx).clearAllPersonalData();
    expect(stop).toHaveBeenCalled();
    expect(bridge.clearGardenCache).toHaveBeenCalled();
    expect(globalThis.indexedDB.deleteDatabase.mock.calls.map((c) => c[0]))
      .toEqual(['votreader', 'vot-journal-media', 'vot-thumbs', 'vot-search-cache', 'vot-minisearch-cache']);
    expect(localStorage.getItem('vot-state')).toBeNull();
    expect(localStorage.getItem('other')).toBe('kept');
    expect(globalThis.setStoreWriteFence).toHaveBeenCalledWith(true);
    expect(globalThis.setStoreWriteFence).not.toHaveBeenCalledWith(false);
    expect(lastToast()).toBe('All personal data cleared. Reloading…');
    vi.advanceTimersByTime(600);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a user-data database that will not delete fails visibly and lifts the fence', async () => {
    globalThis.indexedDB.deleteDatabase.mockImplementation((name) => {
      const req = {};
      queueMicrotask(() => (name === 'votreader' ? req.onblocked() : req.onsuccess()));
      return req;
    });
    await createBackupFlow(ctx).clearAllPersonalData();
    expect(lastToast()).toBe('Clear did not finish. Please try again.');
    expect(globalThis.setStoreWriteFence).toHaveBeenLastCalledWith(false);
    expect(ctx.reloadPendingRef.current).toBe(false);
  });

  it('a cache that will not delete is logged, and the wipe still finishes', async () => {
    const warn = vi.fn();
    put('DiagnosticLog', { warn });
    globalThis.indexedDB.deleteDatabase.mockImplementation((name) => {
      const req = {};
      queueMicrotask(() => (name === 'vot-thumbs' ? req.onerror() : req.onsuccess()));
      return req;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await createBackupFlow(ctx).clearAllPersonalData();
    expect(warn).toHaveBeenCalledWith('settings', 'Clear All: failed to delete vot-thumbs');
    expect(lastToast()).toBe('All personal data cleared. Reloading…');
  });
});
