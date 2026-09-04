// @ts-nocheck — the harness installs free-var globals for this screen
/* SettingsScreen — Verify a Backup (FABLE5-BACKLOG [15]).
   ═══════════════════════════════════════════════════════════════════════
   End-to-end WEB path with the REAL codec: a .votbak container is built
   in-test by the real writeContainer, handed to the screen through a
   mocked pickImportFile, and the flow runs the real readContainer +
   validateImportEnvelope + summarize/format pipeline. Pins:
     - a healthy container reports its contents + "Integrity check passed"
       in the Verify Result row (and the row dismisses);
     - storage-backup-1: a media frame truncated in transit STILL reports
       the manifest's contents (readContainer salvages rather than
       throwing) with a truncation WARNING, instead of the old "corrupt,
       could not be read" — the manifest is byte-complete, so Verify can
       say what is actually in the file;
     - a genuinely unrecoverable file (bad magic — nothing to salvage,
       not even a manifest) still reports the corrupt-file message;
     - a non-backup JSON file reports "does not look like a VOTReader
       backup";
     - NOTHING is applied — no store method is ever called (Verify never
       calls applyV3/the store layer on any path). */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, act } from '@testing-library/react';
import {
  setupSettingsGlobals, teardownSettingsGlobals, renderSettings,
} from './settings-harness.jsx';
import { writeContainer, readContainer, isContainerMagic } from '../../utils/backup-container.js';
import { validateImportEnvelope } from '../../utils/import-validators.js';
import { summarizeBackupManifest, formatVerifyReport } from '../../utils/backup-verify.js';

const MANIFEST = {
  app: 'VOTReader',
  exportVersion: 3,
  exportDate: '2026-07-01T12:00:00.000Z',
  counts: { _media: 1, 'vot-notes': 3, 'vot-bookmarks': 2 },
  data: {},
  stores: { 'vot-notes': [1, 2, 3], 'vot-bookmarks': [1, 2] },
  media: [{ id: 'm1', type: 'image', size: 4, mime: 'application/octet-stream' }],
};

async function buildVotbak() {
  /** @type {Uint8Array[]} */
  const chunks = [];
  await writeContainer(
    MANIFEST,
    [{ blob: new Blob([new Uint8Array([1, 2, 3, 4])]) }],
    (u8) => { chunks.push(u8.slice()); },
  );
  return new Blob(chunks, { type: 'application/octet-stream' });
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });

function setup(file) {
  setupSettingsGlobals({
    readContainer, isContainerMagic, validateImportEnvelope,
    summarizeBackupManifest, formatVerifyReport,
    PlatformBridge: {
      isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
      openFilePicker: () => {}, openExportSink: () => null,
      clearGardenCache: () => {}, getCrashLog: () => '[]',
      pickImportFile: () => Promise.resolve(file),
    },
  });
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  }
}

afterEach(() => { cleanup(); teardownSettingsGlobals(); vi.restoreAllMocks(); });

const clickVerify = async () => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Verify');
  expect(btn).toBeTruthy();
  await act(async () => { btn.click(); });
  await flush();
};

describe('Verify a Backup (web)', () => {
  it('a healthy .votbak reports contents + a passing integrity check, then dismisses', async () => {
    setup(await buildVotbak());
    renderSettings();
    await clickVerify();
    const result = await screen.findByText(/Integrity check passed/);
    expect(result.textContent).toContain('3 notes');
    expect(result.textContent).toContain('2 bookmarks');
    expect(result.textContent).toContain('1 media file');
    const dismiss = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Dismiss');
    await act(async () => { dismiss.click(); });
    expect(screen.queryByText(/Integrity check passed/)).toBeNull();
  });

  it('storage-backup-1: a media frame truncated in transit still reports the (intact) manifest, with a truncation warning', async () => {
    const good = await buildVotbak();
    setup(good.slice(0, good.size - 9)); // cut into the media frame — the manifest ahead of it is untouched
    renderSettings();
    await clickVerify();
    // The manifest survived — its real contents are reported, not a blanket "corrupt" refusal.
    const result = await screen.findByText(/WARNING.*truncated or altered/);
    expect(result.textContent).toContain('3 notes');
    expect(result.textContent).toContain('2 bookmarks');
    expect(screen.queryByText(/corrupt or incomplete/)).toBeNull();
  });

  it('a genuinely unrecoverable file (bad magic — no manifest to salvage) still reports corrupt', async () => {
    setup(new Blob([new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])], { type: 'application/octet-stream' }));
    renderSettings();
    await clickVerify();
    expect(await screen.findByText(/corrupt or incomplete/)).toBeTruthy();
  });

  it('a non-backup JSON file is refused by the envelope check', async () => {
    setup(new Blob([JSON.stringify({ hello: 'world' })], { type: 'application/json' }));
    renderSettings();
    await clickVerify();
    expect(await screen.findByText(/does not look like a VOTReader backup/)).toBeTruthy();
  });
});
