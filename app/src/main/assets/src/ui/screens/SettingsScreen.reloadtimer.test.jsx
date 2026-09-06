// @ts-nocheck — free-var globals via settings-harness (SettingsScreen takes no ES imports)
/* The scheduled reload must not outlive the screen that scheduled it.
   ═══════════════════════════════════════════════════════════════════════
   SettingsScreen schedules `window.location.reload()` on a bare setTimeout in
   TWO places — the import apply (:1342, 600 ms clean / 5000 ms with problems)
   and clear-all-personal-data (:1750, 600 ms) — and nothing cancels either.

   Two consequences, one visible and one not:

     · the reader has up to five seconds to navigate away and is then reloaded
       out of wherever they went;
     · in tests it fires after jsdom has torn down `window`, and vitest reports
       `Errors 1` on a fully green suite — which is how landing 57's CI found it.

   WHY THE FIX IS "FIRE ON UNMOUNT" AND NOT "CANCEL" (Architect, section 12
   follow-up). Both timers fire after storage has been REPLACED (an import
   applied) or WIPED (clear all). The reload exists to reboot into the new data;
   _runBackupOperation deliberately holds the busy lock through the window
   because "re-enabling controls in that 0.6-5s window permits a second
   picker/stream to start against data that is about to be torn down".

   So cancelling would fix the test signal and open a correctness hole: a reader
   who navigates at second two browses a UI backed by stale in-memory state over
   replaced storage, with no reload ever. A loss turned into a silent wrong
   answer. Firing on unmount keeps the invariant and removes the surprise — the
   reload happens AS you navigate, not five seconds after you arrive somewhere
   else.

   UNMOUNT MEANS THE READER NAVIGATED, and that is what makes this safe:
   app.jsx:764 renders `<ErrorBoundary key={screen}>`, so the route subtree
   unmounts exactly when `screen` changes, and 'settings' is a single route
   entry with no peek clone and no keyed remount. An ErrorBoundary catch inside
   Settings also unmounts the subtree, so a crash with a reload pending will
   reload — DELIBERATE, and the behaviour we want after a crash on a screen that
   just replaced storage.

   THE ASSERTION THAT WAS ALMOST WRITTEN THE OTHER WAY. The brief said "unmount
   before the timer fires, assert no reload". That would have pinned the
   stale-state behaviour as correct — a RED enshrining the bug it was written to
   prevent. The assertion here is "exactly once, immediately".
*/
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  counts: { _media: 1, 'vot-notes': 3, 'vot-bookmarks': 2 },
  data: {}, stores: { 'vot-notes': [1, 2, 3], 'vot-bookmarks': [1, 2] },
  media: [{ id: 'm1', type: 'image', size: 4, mime: 'application/octet-stream' }],
};
let votbak;

const btn = (text) => [...document.querySelectorAll('button')]
  .find((b) => (b.textContent || '').trim() === text);

/** Open the type-DELETE dialog and confirm it — the cheapest path that
 *  schedules a reload (clearAllPersonalData, SettingsScreen.jsx:1750). */
async function wipeEverything() {
  await act(async () => { btn('Clear All My Data').click(); });
  const input = screen.getByLabelText('Type DELETE to confirm');
  await act(async () => { fireEvent.change(input, { target: { value: 'DELETE' } }); });
  await act(async () => { btn('Delete Everything').click(); });
  // let the async operation settle so the reload is actually scheduled
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('a scheduled reload does not outlive the screen that scheduled it', () => {
  let reload;

  beforeEach(async () => {
    vi.useFakeTimers();
    setupSettingsGlobals();
    // clearAllPersonalData awaits real IndexedDB deletions and THROWS if any
    // fails; jsdom has no indexedDB, so without this the reload is never
    // scheduled and every case below is vacuous. The CONTROL is what caught
    // that — it failed on the first run alongside the two REDs, which is the
    // difference between "the fix is missing" and "the harness cannot reach
    // the code".
    globalThis.indexedDB = {
      deleteDatabase: (name) => {
        const req = { onsuccess: null, onerror: null, onblocked: null, name };
        queueMicrotask(() => { if (req.onsuccess) req.onsuccess(); });
        return req;
      },
      databases: () => Promise.resolve([]),
    };
    if (!votbak) {
      const chunks = [];
      await writeContainer(MANIFEST, [{ blob: new Blob([new Uint8Array([1, 2, 3, 4])]) }],
        (u8) => { chunks.push(u8.slice()); });
      votbak = new Blob(chunks, { type: 'application/octet-stream' });
    }
    reload = vi.fn();
    // jsdom's location is not configurable in the usual way; replace the whole
    // object so the component's `window.location.reload()` reaches the spy.
    delete window.location;
    window.location = { reload, href: 'http://localhost/', origin: 'http://localhost' };
  });

  afterEach(() => {
    cleanup();
    teardownSettingsGlobals();
    vi.useRealTimers();
  });

  it('CONTROL: left alone, the reload still happens — the fix must not delete it', async () => {
    // This passes before and after and says so. Without it, "no reload after
    // unmount" is satisfied by a screen that never reloads at all, which is
    // precisely the stale-state hole the Architect ruled against.
    const { unmount } = renderSettings();
    await wipeEverything();
    expect(reload).not.toHaveBeenCalled();          // still inside the 600 ms window
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('unmounting with a reload pending reloads IMMEDIATELY, not later', async () => {
    const { unmount } = renderSettings();
    await wipeEverything();
    expect(reload).not.toHaveBeenCalled();
    unmount();
    expect(reload).toHaveBeenCalledTimes(1);        // fired BY the unmount
  });

  it('and exactly once — the pending timer does not fire after teardown', async () => {
    // GREEN BEFORE THE FIX TOO, and for a different reason: today the unmount
    // does nothing and the timer fires afterwards, which is also one call. It
    // guards the SHAPE OF THE FIX — firing on unmount while leaving the timer
    // armed would read 2 — so it can only go red once the fix exists. Kept
    // because that double-fire is the obvious way to get this wrong.
    const { unmount } = renderSettings();
    await wipeEverything();
    unmount();
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('the IMPORT caller schedules through it too — behaviourally, not by grep', async () => {
    // THE REPAIR FOR BITE D, and it exists because my first reason for not
    // having it was wrong. I argued the path was unreachable in jsdom; that
    // was an argument about clearAllPersonalData (which awaits real IndexedDB
    // deletions) and I never tested the claim for the IMPORT caller. It IS
    // reachable: PlatformBridge.pickImportFile hands the screen a real .votbak
    // blob, exactly as SettingsScreen.verify.test.jsx already does.
    //
    // The source gate below is the class-level net; this is the measurement.
    setupSettingsGlobals({
      readContainer, isContainerMagic, validateImportEnvelope,
      summarizeBackupManifest, formatVerifyReport,
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink: () => null,
        clearGardenCache: () => {}, getCrashLog: () => '[]',
        pickImportFile: () => Promise.resolve(votbak),
      },
      // The screen destructures the apply's result (:1339). The harness's
      // default stub returns undefined, which throws before the reload is
      // scheduled — a CLEAN apply is the precondition for the assertion below.
      applyV3: () => Promise.resolve({
        importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [],
      }),
    });
    const { unmount } = renderSettings();
    await act(async () => { btn('Import').click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const confirm = btn('Import & Overwrite');
    expect(confirm, 'the import confirm sheet did not open — this case measured nothing').toBeTruthy();
    await act(async () => { confirm.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // PRECONDITION, stated: if the apply did not get far enough to schedule,
    // the assertions below are about a path that never ran.
    expect(reload, 'a reload should not have happened yet').not.toHaveBeenCalled();
    unmount();
    expect(reload, 'the import caller does not schedule through the scheduler').toHaveBeenCalledTimes(1);
  });

  it('every reload in this screen goes through the scheduler — no inline timer survives', () => {
    // A SOURCE-TEXT GATE, and it says so. The cases above drive the clear-all
    // path only; biting the IMPORT caller back to its own inline setTimeout
    // left them all green, so that caller's use of the scheduler was
    // unwitnessed. This is what witnesses it — and it is the gate that would
    // have caught the original defect, since a second inline timer is exactly
    // how the first one was copied.
    //
    // Comments are stripped first: this file's own header quotes the old form,
    // and a matcher that reads prose would fire on the explanation rather than
    // on the code.
    const SCREEN = join(dirname(fileURLToPath(import.meta.url)), 'SettingsScreen.jsx');
    const src = readFileSync(SCREEN, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // The stripper carries its own control: a dead stripper leaves the file
    // whole, which would read as "no inline timers" for the wrong reason.
    expect(src.length, 'stripper removed nothing')
      .toBeLessThan(readFileSync(SCREEN, 'utf8').length);
    const inline = src.match(/setTimeout\([^;]*location\.reload/g) || [];
    expect(inline, 'an inline reload timer bypasses _scheduleBackupReload').toEqual([]);
    // and the scheduler is actually there — otherwise zero inline timers is
    // satisfied by a screen that no longer reloads at all.
    expect(src).toContain('const _scheduleBackupReload');
    expect((src.match(/_scheduleBackupReload\(/g) || []).length,
      'both callers reach the scheduler').toBeGreaterThanOrEqual(2);
  });

  it('a screen that scheduled nothing does not reload when it unmounts', async () => {
    // The other half of "fire on the REF": the unmount effect must fire on the
    // semantic flag that says storage was replaced, never on "this screen is
    // going away". Merely visiting Settings and leaving must reload nothing.
    const { unmount } = renderSettings();
    unmount();
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(reload).not.toHaveBeenCalled();
  });
});
