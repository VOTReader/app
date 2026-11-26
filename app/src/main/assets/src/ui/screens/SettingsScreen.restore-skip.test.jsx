// @ts-nocheck — the harness installs free-var globals for this screen
/* Review 11-26 (restore sheet): a kind the restore will skip read "Journal entries: skipped" with no sentence, so a
   reader about to overwrite their phone could not tell whether the journal on the phone survives. It does: every
   restore path writes no part it refuses (backup.js _applyStoresAndFlags for v2/v3, the V1 fallback for v1). The
   sheet now says so in one line under the counts, only when a row reads "skipped". */
import { describe, it, expect, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { RestoreSkipNote } from './SettingsScreen.jsx';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings } from './settings-harness.jsx';
import { summarizeBackupManifest, formatVerifyReport, describeBackupKinds } from '../../utils/backup-verify.js';

const LINE = "This app can't read the skipped kinds in this backup, so the restore leaves the ones on this phone as they are.";

afterEach(() => { cleanup(); teardownSettingsGlobals(); vi.restoreAllMocks(); });

describe('RestoreSkipNote', () => {
  const sum = (stores) => summarizeBackupManifest({ exportVersion: 2, data: {}, stores, media: {} });

  it('a skipped kind gets the line, in these words', () => {
    const { container } = render(<RestoreSkipNote s={sum({ 'vot-notes': {}, 'vot-journal': { list: 'oops' } })} here={{ journal: 4 }} />);
    const p = container.querySelector('p.ws3-sheet-text');
    expect(p).not.toBeNull();
    expect(p.textContent).toBe(LINE);
    expect(p.textContent).not.toMatch(/[–—]/);
  });

  it('a skipped kind with a row of its own past the first four (links) gets it too, even with none on this phone', () => {
    const { container } = render(<RestoreSkipNote s={sum({ 'vot-notes': {}, 'vot-links': 'junk' })} here={{ links: 0 }} />);
    expect(container.textContent).toBe(LINE);
  });

  it('nothing when no row reads skipped: a clean file, and a file that only leaves kinds out', () => {
    expect(render(<RestoreSkipNote s={sum({ 'vot-notes': {}, 'vot-bookmarks': [{ id: 'b1' }] })} here={{ journal: 4 }} />).container.innerHTML).toBe('');
    cleanup();
    expect(render(<RestoreSkipNote s={sum({ 'vot-notes': {} })} />).container.innerHTML).toBe('');
  });

  it('nothing for a skipped store that has no row (its words are in Verify, not in the counts)', () => {
    const s = sum({ 'vot-notes': {}, 'vot-garden-pos': 'junk' });
    expect(s.skippedStores).toEqual(['vot-garden-pos']);
    expect(s.skipped).toEqual([]);
    expect(render(<RestoreSkipNote s={s} />).container.innerHTML).toBe('');
  });
});

describe('the restore sheet carries the line under the counts', () => {
  const open = (doc) => {
    const text = JSON.stringify({ app: 'VOTReader', exportVersion: 2, exportDate: '2026-11-01T12:00:00.000Z', data: {}, media: {}, ...doc });
    const file = { size: text.length, slice: () => ({ arrayBuffer: async () => new Uint8Array(8).buffer }), text: async () => text };
    const applySpy = vi.fn(async () => ({ importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] }));
    setupSettingsGlobals({
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {}, openExportSink: () => null,
        pickImportFile: vi.fn(async () => file), clearGardenCache: () => {}, getCrashLog: () => '[]',
      },
      isContainerMagic: () => false,
      validateImportEnvelope: () => [],
      applyImportPayload: applySpy,
      summarizeBackupManifest, formatVerifyReport, describeBackupKinds,
    });
    if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    return applySpy;
  };
  const sheet = async () => (await screen.findByText('Restore this backup?')).closest('[role="dialog"]');

  it('a skipped journal: the line sits between the counts and the overwrite sentence, and nothing is applied', async () => {
    const applySpy = open({ stores: { 'vot-notes': { n1: { groupId: 'n1' } }, 'vot-journal': { list: 'oops' } } });
    const s = await sheet();
    const counts = s.querySelector('.ws3-counts');
    expect(counts.textContent).toContain('skipped');
    const note = [...s.querySelectorAll('p')].find((p) => p.textContent === LINE);
    expect(note).toBeTruthy();
    expect(counts.nextElementSibling).toBe(note);
    expect(note.nextElementSibling.textContent).toMatch(/This cannot be undone\.$/);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('a clean file: no line', async () => {
    open({ stores: { 'vot-notes': { n1: { groupId: 'n1' } }, 'vot-bookmarks': [{ id: 'b1' }] } });
    const s = await sheet();
    expect(s.textContent).toContain('Restoring overwrites');
    expect(s.textContent).not.toContain('skipped');
    expect(s.textContent).not.toContain("can't read the skipped kinds");
  });
});
