/* ═══════════════════════════════════════════════════════════════════════
   backup-flow — the Settings backup flows: Export, Import, Verify a Backup
   and Clear All Personal Data. Cluster E (bundle-e), imported by
   ui/screens/SettingsScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   These ~1,000 lines lived inside the SettingsScreen component, outside every
   coverage floor (the coverage `include` leaves ui/** out), while they are the
   readers' only way to save and restore their own data (v15-code-health-05,
   improvement sweep 2026-09-25). They moved here unchanged: createBackupFlow
   takes the React state the screen owns (the busy lock, the pending-reload
   flag and timer, the Verify row, the Import & Overwrite sheet) and returns
   the handlers the screen's rows call. The screen keeps the effects that must
   run on unmount (the pending reload, the stranded confirm) and the dialogs.

   The data plane stays where it was: utils/backup.js, backup-container.js,
   backup-android.js and backup-verify.js ride bundle-d and are reached here as
   the same window globals the screen used, so bundle-e never carries a second
   copy of withBackupLock's lock or the stores. */

// Set immediately before an import applies; removed only when the apply
// completes (or provably never started). A crash mid-restore leaves it behind,
// and useRestoreGuard turns that into a loud boot prompt. Keep the literal in
// sync with RESTORE_INFLIGHT_KEY in hooks/use-restore-guard.js (classic-script
// seam — no import path from here; the lifecycle tests pin both sides).
const RESTORE_INFLIGHT_KEY = 'vot-restore-inflight';

// Android's native import refuses a v3 manifest over MAX_V3_MANIFEST_SIZE
// (16 MiB, StorageManager.kt). Warn at EXPORT time — while the data still
// lives on this device — once the manifest crosses 75% of that, so an
// unrestorable-on-phone backup is never first discovered on a wiped phone.
// ~12 MiB of typed JSON is implausible for one human; this is a tripwire.
const MANIFEST_WARN_BYTES = 12 * 1024 * 1024;
const MANIFEST_MAX_BYTES = 16 * 1024 * 1024;

/**
 * The toast after a backup is written. `problems` (ok:true, from
 * buildV3Manifest) names the stores whose newest change never reached disk —
 * a failed IDB put, or hydration still 'degraded'. The file itself is real and
 * complete apart from those, so the reader gets a count and a reason instead
 * of a flat "Backup saved." that overstates it or an abort that leaves them
 * with nothing (storage-backup-2 follow-up). The store ids stay in the console
 * warning backup.js already emits; a count is what the reader can act on.
 * Sticky (duration 0) whenever there is anything to read.
 * @param {string[]|undefined} problems
 * @param {boolean} nearLimit
 * @returns {{ text: string, sticky: boolean }}
 */
export function _savedBackupToast(problems, nearLimit) {
  const n = problems ? problems.length : 0;
  const stale = n
    ? ' — ' + n + ' recent change' + (n === 1 ? '' : 's') + ' may be missing; your device could not finish saving '
      + (n === 1 ? 'it' : 'them') + ' before the backup was taken'
    : '';
  const limit = nearLimit
    ? ' Note: this backup is nearing the Android import size limit — it may soon fail to restore on a phone (desktop import is unaffected).'
    : '';
  return { text: 'Backup saved' + stale + '.' + limit, sticky: !!(n || nearLimit) };
}

/**
 * The backup handlers, bound to the screen's state. Build one per render, as
 * the screen's inline closures were: every handler reads ctx at call time.
 *
 * @param {object} ctx
 * @param {{ current: boolean }} ctx.busyRef  Export / Import / Verify / Clear are mutually exclusive
 * @param {{ current: boolean }} ctx.reloadPendingRef  storage was replaced or wiped; a reload is owed
 * @param {{ current: number }} ctx.reloadTimerRef  the scheduled reload's timer id (0 when none)
 * @param {(busy: boolean) => void} ctx.setBusy  disables the backup rows
 * @param {(report: null | { message: string, level: 'ok' | 'warn' }) => void} ctx.setVerifyReport
 * @param {(message: string) => Promise<boolean>} ctx.confirmImport  shows the Import & Overwrite sheet and settles once, from any dismiss path
 * @param {any[]} ctx.diagnosticLog  the crash-log snapshot an export carries
 */
export function createBackupFlow(ctx) {
  const {
    busyRef: backupBusyRef, reloadPendingRef: backupReloadPendingRef, reloadTimerRef: backupReloadTimerRef,
    setBusy: setBackupBusy, setVerifyReport, confirmImport, diagnosticLog,
  } = ctx;
  /**
   * Reboot into the data that was just written, after `ms` of reading time.
   *
   * ONE SCHEDULER, TWO CALLERS — the import apply and clear-all-personal-data.
   * Both used to inline the same bare setTimeout, and a fix applied to only the
   * one someone had looked at would have left the other to be rediscovered.
   */
  const _scheduleBackupReload = (ms) => {
    backupReloadPendingRef.current = true;
    if (backupReloadTimerRef.current) window.clearTimeout(backupReloadTimerRef.current);
    backupReloadTimerRef.current = window.setTimeout(() => {
      backupReloadTimerRef.current = 0;
      backupReloadPendingRef.current = false;
      window.location.reload();
    }, ms);
  };
  /**
   * Freeze the live writers from BEFORE storage is replaced (an import) or wiped
   * (Clear All) until the reload that reboots into it (v04-01 / v04-02,
   * improvement sweep 2026-09-22).
   *
   * The React state App persists is the PRE-import state, and nothing refreshes
   * it before the reload: a scroll, a tap or the reload's own pagehide used to
   * write it over the restored vot-state, and the 3-way merge then deleted the
   * restored readItems. So a union still inside the persist debounce window is
   * written FIRST (it lands before the import, which replaces it), then the sink
   * freezes. A wipe also raises the store write fence: any write after
   * deleteDatabase() recreates the database with what was still in memory.
   *
   * Lifted only when `operation` ends WITHOUT scheduling the reload (refused,
   * failed, cancelled) — the pending-reload ref is the same flag the unmount
   * effect above fires on — so a session that stays up keeps saving.
   *
   * @param {() => Promise<any>} operation
   * @param {{ fenceStores?: boolean }} [opts]
   */
  const _withLiveWritersFrozen = async (operation, opts) => {
    const fenceStores = !!(opts && opts.fenceStores);
    const w = /** @type {any} */ (window);
    if (typeof w.__flushPersistState === 'function') w.__flushPersistState();
    if (typeof w.__freezePersistState === 'function') w.__freezePersistState(true);
    if (fenceStores && typeof setStoreWriteFence === 'function') setStoreWriteFence(true);
    try {
      return await operation();
    } finally {
      if (!backupReloadPendingRef.current) {
        if (fenceStores && typeof setStoreWriteFence === 'function') setStoreWriteFence(false);
        if (typeof w.__freezePersistState === 'function') w.__freezePersistState(false);
      }
    }
  };
  const _runBackupOperation = async (operation) => {
    if (backupBusyRef.current) return;
    backupBusyRef.current = true;
    backupReloadPendingRef.current = false;
    setBackupBusy(true);
    try { await operation(); }
    finally {
      // A completed import deliberately keeps the lock until its scheduled
      // reload. Re-enabling controls in that 0.6-5s window permits a second
      // picker/stream to start against data that is about to be torn down.
      if (!backupReloadPendingRef.current) {
        backupBusyRef.current = false;
        setBackupBusy(false);
      }
    }
  };
  // Export / Verify / Clear additionally hold the CROSS-TAB Web Lock the apply
  // paths take internally, so a second PWA tab can't export/verify/wipe against
  // a half-imported state. Import must NOT go through this wrapper — Web Locks
  // are not reentrant, and applyV3/applyImportPayload acquire the lock themselves.
  const _runLockedBackupOperation = (operation) => _runBackupOperation(async () => {
    try { await withBackupLock(operation); }
    catch (e) {
      if (/already in progress/.test(String(e && e.message))) {
        _showToast('Another backup operation is running in a different tab. Please wait for it to finish.');
        return;
      }
      throw e;
    }
  });

  // ===== Personal-data export / import / clear =====
  const _collectVotKeys = () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('vot-') === 0) keys.push(k);
    }
    return keys;
  };
  // ════════════════════════════════════════════════════════════════
  // EXPORT v2 / IMPORT v1+v2 (W2.6)
  // ════════════════════════════════════════════════════════════════
  // Payload schema:
  //   {
  //     app: 'VOTReader',
  //     exportVersion: 2,                  (v1 backups have 1 or absent)
  //     exportDate: ISO,
  //     diagnosticLog: [...],
  //     data: {                            (v1+v2: LS boot-shim ONLY in v2;
  //                                         v1 had FULL state here)
  //       'vot-state': '<reduced JSON>',
  //     },
  //     stores: { ... },                   (v2 ONLY: IDB-backed stores)
  //     media: { id: { type, mime, ..., data: base64 } }  (v2 ONLY)
  //   }
  //
  // V1 client reading v2: walks `data` only — restores theme +
  // fontStyle, ignores unknown top-level keys (stores, media) per
  // its existing filter loop. User keeps boot-shim settings;
  // everything else lost. Documented limitation.
  //
  // V2 client reading v1: detects exportVersion !== 2, falls back to
  // parsing `data` values as JSON strings (the pre-W2 format) and
  // calling replaceAll on each store inline. Full restore.
  //
  // V2 client reading v3+ (future): walks `data` + `stores` + `media`
  // it knows about; ignores unknown top-level keys (forward compat).
  //
  // 4 user-facing toast sites replace the pre-W2.6 alert() calls
  // per [[consolidate-dont-duplicate]] via the showToast utility.

  const _TOAST_ID = 'vot-toast-info';
  // Its own id, not _TOAST_ID: the escape offer and the status toast can be
  // on screen at the same moment, and reusing one element would make the
  // offer overwrite whatever the export was telling the reader.
  const _ESCAPE_TOAST_ID = 'vot-toast-export-escape';
  // SEC1: route through textContent (opts.text), NOT innerHTML. Every caller here
  // passes a runtime-built status string (e.g. 'Import failed: ' + err.message,
  // 'could not read: ' + built.problems.join(', ')). None is trusted static markup,
  // so the innerHTML path was a latent stored-XSS shape (harmless today, but the
  // day a filename / journal title / file fragment is appended it becomes live).
  const _showToast = (msg, durationMs) => showToast({
    id: _TOAST_ID, className: 'vot-toast', text: msg, durationMs: durationMs == null ? 3500 : durationMs,
  });

  // The base64 codecs + the export-payload build + the import-apply data
  // plane live in utils/backup.js (extracted U14) so the export → wipe →
  // import → reload round-trip is testable end-to-end against the real
  // stores. This module owns the orchestration around them; SettingsScreen
  // owns only the rows, the dialogs and the React state it hands in.

  /**
   * Map from IDB store name to its store object + the method used to
   * apply replacement. `setAll` for stores with whole-collection
   * primitives, `set` for single-value stores (StateStore, etc.),
   * `replaceAll` otherwise.
   */
  const _exportableStores = () => {
    /** @type {Record<string, { store: any, method: string }>} */
    const stores = {
    'vot-annotations':         { store: AnnotationStore,      method: 'replaceAll' },
    'vot-notes':               { store: NoteStore,            method: 'replaceAll' },
    'vot-bookmarks':           { store: BookmarkStore,        method: 'replaceAll' },
    'vot-links':               { store: LinkStore,            method: 'replaceAll' },
    'vot-notebooks':           { store: NotebookStore,        method: 'replaceAll' },
    'vot-journal':             { store: JournalStore,         method: 'replaceAll' },
    'vot-journal-notebooks':   { store: JournalNotebookStore, method: 'replaceAll' },
    'vot-journal-index':       { store: JournalIndexStore,    method: 'replaceAll' },
    'vot-journal-stats':       { store: JournalStatsStore,    method: 'replaceAll' },
    'vot-reading-streak':      { store: ReadingStreakStore,   method: 'replaceAll' },
    'vot-reading-stats':       { store: ReadingStatsStore,    method: 'replaceAll' },
    'vot-garden-pos':          { store: GardenPosStore,       method: 'replaceAll' },
    'vot-recent-nav':          { store: RecentNavStore,       method: 'replaceAll' },
    'vot-history':             { store: HistoryStore,         method: 'setAll' },
    'vot-prophecy-cards':      { store: ProphecyCardsStore,   method: 'setAll' },
    'vot-home-order':          { store: HomeOrderStore,       method: 'set' },
    'vot-library-order':       { store: LibraryOrderStore,    method: 'set' },
    'vot-note-default':        { store: NoteDefaultStore,     method: 'replaceAll' },
    'vot-state':               { store: StateStore,           method: 'set' },
    };

    // AudioLibraryStore belongs to bundle-b. Resolve its runtime bridge only
    // when that bundle is present, so isolated UI/admin harnesses remain safe.
    const audioLibraryStore = /** @type {any} */ (globalThis).AudioLibraryStore;
    // Its record also carries songKept, the ids of the songs kept on this phone. The songs' BYTES (the
    // offline-songs store) are never exported: they can run to gigabytes and come back from the song sites,
    // so a restore offers "Download your N songs again" instead (user-data-parity.test.js pins the exemption).
    if (audioLibraryStore) {
      stores['vot-audio-library'] = { store: audioLibraryStore, method: 'replaceAll' };
    }
    // Same bundle, same guard — where the reader is inside each recording.
    const audioPositionsStore = /** @type {any} */ (globalThis).AudioPositionsStore;
    if (audioPositionsStore) {
      stores['vot-audio-positions'] = { store: audioPositionsStore, method: 'replaceAll' };
    }
    return stores;
  };
  /**
   * Boolean flag stores keyed by IDB store name. Imported via set()
   * when value is truthy; clear() otherwise.
   */
  const _flagStores = () => ({
    'vot-welcomed':              WelcomedFlagStore,
    'vot-about-seen':            AboutSeenFlagStore,
    'vot-garden-warning-acked':  GardenWarningFlagStore,
    // [D2]: the fourth flag has always existed (IDB v7) and was the only one
    // the backup skipped, so a restore re-pitched the annotation coach-mark
    // at a reader who had dismissed it.
    'vot-ann-hint-dismissed':    AnnHintDismissedFlagStore,
    // review-tutorial: "Show me around" done/skipped/never — carried so a restore does not re-pitch the strip.
    'vot-tour-done':             TourDoneFlagStore,
  });

  // Web export uses the v3 STREAMING container (GB-scale — never holds the whole
  // payload in memory; one blob at a time). Android keeps the proven v2 path
  // until its native streaming lands (P3), so the only-backup mechanism is never
  // broken mid-port. BACKUP-STREAMING-PLAN.txt.
  const _exportV3Web = async () => {
    try {
      _showToast('Preparing export…', 0);
      // U1 + persist-debounce race closer: a vot-state union still inside
      // usePersistedState's 250ms debounce window has NOT initiated a
      // StateStore.set, so the whenSaved() barrier inside buildV3Manifest
      // cannot cover it — it would be missing from the ONLY backup. Flush it
      // synchronously FIRST (no-op when nothing is pending; bridge owned by
      // usePersistedState, contract 5); the barrier then awaits the flushed
      // write before the manifest reads vot-state from IDB.
      if (typeof window.__flushPersistState === 'function') window.__flushPersistState();
      const built = await buildV3Manifest({
        storesMap: _exportableStores(),
        flagMap: _flagStores(),
        idbAdapter: IDBAdapter,
        mediaStore: JournalMediaStore,
        diagnosticLog: diagnosticLog,
      });
      if (!built.ok) {
        hideToast(_TOAST_ID);
        // buildV3Manifest fails LOUD (U6) only on a store or media read that
        // THREW — those bytes really are absent, so abort rather than write a
        // misleading, incomplete backup. A store that merely could not save its
        // newest change still exports and comes back on built.problems below;
        // refusing there would strand the reader in the one state the app tells
        // them to export. (No media-limit case: v3 streams, so no size cap.)
        _showToast('Export aborted — could not read: ' + built.problems.join(', ') + '. Nothing was saved. Please try again; if this repeats, your device storage may be failing.');
        return;
      }
      if (built.manifestBytes > MANIFEST_MAX_BYTES) {
        hideToast(_TOAST_ID);
        _showToast('Export aborted — the backup index is over the 16 MiB restore limit. Nothing was saved. Clear unneeded personal data, then export again.', 0);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `votreader-backup-${stamp}.votbak`;
      // The destination picker takes over the screen; drop the "Preparing…" toast.
      hideToast(_TOAST_ID);
      // A save picker that NEVER settles leaves the reader with nothing on
      // screen and no way forward — measured at 30 s and still going, on a
      // fresh headless-Chromium profile, under a real trusted click. The
      // bridge offers an escape once the picker has gone unanswered for
      // PICKER_SLOW_MS; this puts that offer on screen.
      //
      // "NOTHING ON SCREEN" IS LITERAL, AND IT IS WHY THIS TOAST IS NOT
      // DECORATION. Measured on a real Chromium during a stuck export: the
      // "Preparing export…" toast is at `opacity: 0` — hideToast() fires on
      // the line above and leaves the faded node in the DOM — so the reader
      // has no status, no spinner, no error and no progress. THIS TOAST IS
      // THE ENTIRE UI OF THAT STATE. Do not later "simplify" the offer into a
      // spinner or a status line: there is no other pixel to fall back on,
      // and a spinner would replace the only thing the reader can act on with
      // something they can only watch.
      //
      // The wording is deliberately NOT error recovery. WebKit has never
      // shipped the File System Access API, so a download IS how every iOS
      // reader saves their backup, every time — "the usual way" is the plain
      // truth for a large part of the flock, and framing it as a failure would
      // make the ordinary path read as a broken one. It says "the file"
      // because the reader is being offered a thing they recognise, not a
      // mechanism (owner's wording; never "fallback"). It also does not claim
      // the dialog failed to open: from here nobody can know whether it opened
      // and the reader is still reading it, so it says only what is true in
      // both cases.
      const sink = await PlatformBridge.openExportSink(filename, {
        onSlow: (saveTheUsualWay) => {
          showToast({
            id: _ESCAPE_TOAST_ID,
            className: 'vot-toast vot-toast-action',
            // SEC-2: TRUSTED STATIC markup, no interpolation — the same shape
            // as the tab-close undo toast (hooks/use-tab-actions.js).
            html: 'Still waiting for the save dialog. <button type="button" class="vot-escape-btn">Save the file the usual way</button>',
            durationMs: 0,
          });
          const el = typeof document !== 'undefined' ? document.getElementById(_ESCAPE_TOAST_ID) : null;
          const btn = el && el.querySelector('.vot-escape-btn');
          if (btn) btn.addEventListener('click', saveTheUsualWay, { once: true });
        },
      });
      // Whichever path claimed the export, the offer is stale the moment the
      // sink resolves — including on cancel, where leaving it up would invite a
      // tap that the bridge would (correctly) ignore.
      hideToast(_ESCAPE_TOAST_ID);
      if (!sink) return; // user cancelled the picker — stay quiet
      _showToast('Saving backup…', 0);
      try {
        // Stream the container to the sink: only one media blob is in memory at
        // any moment, so this scales to whatever the device can store.
        await writeContainer(built.manifest, built.mediaEntries, sink.write);
        await sink.close();
        hideToast(_TOAST_ID);
        const saved = _savedBackupToast(built.problems, built.manifestBytes > MANIFEST_WARN_BYTES);
        if (saved.sticky) _showToast(saved.text, 0); else _showToast(saved.text);
        return true;
      } catch (e) {
        hideToast(_TOAST_ID);
        console.warn('export write failed', e);
        // BAK5: discard the partial write so no truncated .votbak is left behind.
        try { await sink.abort?.(); } catch (_e) { /* best-effort cleanup */ }
        _showToast('Export failed while writing. Please try again.');
      }
    } catch (e) {
      console.warn('export failed', e);
      hideToast(_TOAST_ID);
      // The escape offer survives a throw out of the await above; nothing else
      // takes it down on that path.
      hideToast(_ESCAPE_TOAST_ID);
      // Wave-0: dropped the "See console for details." dev-speak — the detail
      // is in console.warn above; the user gets the actionable version.
      _showToast('Export failed. Please try again.');
    }
  };

  // Android export uses the v3 STREAMING container via the native chunked bridge
  // (Android streams natively rather than via the web codec — see backup-container.js /
  // StorageManager.kt; native owns the framing). buildV3Manifest is SHARED with
  // the web path; only the container WRITE differs. Peak memory is one 512 KB
  // bridge slice, so this scales to whatever the device can store. The streaming
  // loop itself lives in utils/backup-android.js (runV3AndroidExport — TEST-1).
  // BACKUP-STREAMING-PLAN P3.
  const _exportV3Android = async () => {
    try {
      _showToast('Preparing export…', 0);
      // Same U1 + persist-debounce race closer as _exportV3Web: flush any
      // vot-state union still inside usePersistedState's 250ms debounce
      // window BEFORE buildV3Manifest's whenSaved() barrier + IDB read
      // (no-op when nothing is pending; bridge owned by usePersistedState).
      if (typeof window.__flushPersistState === 'function') window.__flushPersistState();
      const built = await buildV3Manifest({
        storesMap: _exportableStores(),
        flagMap: _flagStores(),
        idbAdapter: IDBAdapter,
        mediaStore: JournalMediaStore,
        diagnosticLog: diagnosticLog,
      });
      if (!built.ok) {
        hideToast(_TOAST_ID);
        // Same contract as _exportV3Web: a read that THREW aborts; a store that
        // could not save its newest change still exports and is named on
        // built.problems below.
        _showToast('Export aborted — could not read: ' + built.problems.join(', ') + '. Nothing was saved. Please try again; if this repeats, your device storage may be failing.');
        return;
      }
      if (built.manifestBytes > MANIFEST_MAX_BYTES) {
        hideToast(_TOAST_ID);
        _showToast('Export aborted — the backup index is over the 16 MiB restore limit. Nothing was saved. Clear unneeded personal data, then export again.', 0);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `votreader-backup-${stamp}.votbak`;
      // The destination picker takes over the screen; drop the "Preparing…" toast.
      hideToast(_TOAST_ID);
      // 1. SAF destination picker (async). Install the ready callback BEFORE launch.
      const ready = await new Promise((resolve) => {
        window.__onV3ExportReady = (status) => { window.__onV3ExportReady = null; resolve(status); };
        PlatformBridge.v3ExportOpen(filename);
      });
      if (ready === 'cancelled') return;                 // user dismissed the picker
      if (ready !== 'ok') throw new Error('picker: ' + ready);
      _showToast('Saving backup…', 0);
      // Stream the v3 container through the native bridge: the manifest frame,
      // then each media blob in <=512 KB base64 slices, then commit. On any
      // failure the driver aborts the open sink (v3ExportFinish(false)) so no
      // truncated, misleading backup survives (utils/backup-android.js — TEST-1).
      await runV3AndroidExport({
        bridge: PlatformBridge,
        manifestJson: JSON.stringify(built.manifest),
        mediaEntries: built.mediaEntries,
      });
      hideToast(_TOAST_ID);
      const saved = _savedBackupToast(built.problems, built.manifestBytes > MANIFEST_WARN_BYTES);
      if (saved.sticky) _showToast(saved.text, 0); else _showToast(saved.text);
      return true;
    } catch (e) {
      console.warn('android v3 export failed', e);
      hideToast(_TOAST_ID);
      _showToast('Export failed while writing. Please try again.');
    }
  };

  const exportPersonalData = async () => {
    // Both platforms now write the v3 STREAMING container (.votbak). Web streams
    // via openExportSink + writeContainer; Android via the native chunked bridge.
    // (The v2 buildExportPayload remains exported for rollback + the P5 fold.)
    if (PlatformBridge.isAndroid) await _exportV3Android();
    else await _exportV3Web();
  };

  const importPersonalData = async () => {
    // Shared import tail: confirm dialog + degraded-store guard + apply + result
    // toast + reload. `parsed` is the v2 JSON payload OR the v3 manifest (same
    // envelope shape); applyFn(storesMap, flagMap) → { importFailures,
    // writeFailures, skippedStores }. ONE source of truth for both formats.
    const _confirmDegradeApplyReload = async (parsed, applyFn, getIntegrity) => {
      const dateLabel = parsed.exportDate ? new Date(parsed.exportDate).toLocaleString() : 'unknown date';
      // Summarize what's about to land for the confirm dialog.
      const summaryParts = [];
      if (parsed.stores && typeof parsed.stores === 'object') {
        const annData = parsed.stores['vot-annotations'];
        const annKeys = annData && typeof annData === 'object' ? Object.keys(annData).length : 0;
        const bkms = Array.isArray(parsed.stores['vot-bookmarks']) ? parsed.stores['vot-bookmarks'].length : 0;
        const jrn = parsed.stores['vot-journal'] && Array.isArray(parsed.stores['vot-journal'].list)
          ? parsed.stores['vot-journal'].list.length : 0;
        if (annKeys) summaryParts.push(`${annKeys} annotated keys`);
        if (bkms) summaryParts.push(`${bkms} bookmarks`);
        if (jrn) summaryParts.push(`${jrn} journal entries`);
      }
      // media is an object (v2) or an array of metadata (v3) — count either.
      const mediaCount = Array.isArray(parsed.media) ? parsed.media.length
        : (parsed.media && typeof parsed.media === 'object' ? Object.keys(parsed.media).length : 0);
      if (mediaCount) summaryParts.push(`${mediaCount} media items`);
      const summary = summaryParts.length ? ` This backup contains ${summaryParts.join(', ')}.` : '';

      // Soft, advisory free-space heads-up (P4). v3 streaming is uncapped, so a huge
      // backup is no longer refused; instead warn (don't block) if its media likely
      // won't fit in the device's remaining IDB budget. Best-effort: navigator.storage
      // .estimate is Chromium-61+; a v3 manifest carries each
      // blob's `size`, so the total is exact. ADVISORY — a real write failure is still
      // caught (S3). Absent on a v2 legacy payload (media is base64, no size array).
      let spaceNote = '';
      try {
        const mediaTotal = Array.isArray(parsed.media)
          ? parsed.media.reduce((s, m) => s + (m && typeof m.size === 'number' ? m.size : 0), 0) : 0;
        if (mediaTotal > 0 && navigator.storage && typeof navigator.storage.estimate === 'function') {
          spaceNote = formatImportSpaceWarning(mediaTotal, await navigator.storage.estimate());
        }
      } catch (_e) { /* advisory only — never blocks the import */ }

      // Wave-0: this was the app's last native window.confirm — a blocking
      // dialog with no styling, no registry registration (Back navigated
      // underneath it), and browser chrome. Replaced with the same in-app
      // sheet pattern as the type-DELETE wipe dialog. The destructive
      // semantics are KEPT, not weakened: nothing is applied until the user
      // explicitly taps "Import & Overwrite"; Cancel / Back / Escape all
      // dismiss without touching data.
      // Show the sheet and AWAIT the user's decision. Resolving happens via
      // _settleImportConfirm from every dismiss path — so this async function
      // (and therefore the caller's finally, which closes the native import
      // stream on Android) does not complete until the import truly settles.
      const confirmed = await confirmImport(
        `Importing the backup from ${dateLabel} will OVERWRITE the data types contained in this backup; any data type not included is left unchanged.${summary}${spaceNote} This cannot be undone.`,
      );
      if (!confirmed) return;                       // Cancel / backdrop / Back / Escape
      // v04-01: the stale pre-import state must not be written over the restore.
      await _withLiveWritersFrozen(() => _applyConfirmedImport(parsed, applyFn, getIntegrity));
    };

    // The post-confirm tail of an import: progress toast → degraded-store
    // guard → apply → result toast → reload. Runs ONLY from the confirm
    // sheet's "Import & Overwrite" button. `getIntegrity` (optional) is read
    // AFTER applyFn resolves — the Android v3 trailing CRC is only known once
    // every frame is consumed — and anything other than ok/absent joins the
    // completion problems.
    const _applyConfirmedImport = async (parsed, applyFn, getIntegrity) => {
      _showToast('Importing… please wait.', 0);

      const storesMap = _exportableStores();
      const flagMap = _flagStores();

      // Pending and degraded stores queue mutations in memory instead of
      // durably saving them. Import only after every store is loaded.
      const hasUnavailableStore = Object.values(storesMap).some(({ store }) => store.getState() !== 'loaded')
        || Object.values(flagMap).some((s) => s.getState() !== 'loaded');
      if (hasUnavailableStore) {
        hideToast(_TOAST_ID);
        _showToast('Storage is temporarily unavailable. Please try again in a moment.');
        return;
      }

      // Restore-inflight marker: set BEFORE the first mutation, removed only on
      // completion. If the process dies anywhere inside applyFn (crash, kill,
      // power loss) the marker survives and useRestoreGuard warns on next boot.
      // A handled failure below leaves it SET on purpose — writeFailures means
      // data did not durably land, and an unknown throw may have part-applied.
      let restoreMarker = null;
      try {
        restoreMarker = {
          previous: localStorage.getItem(RESTORE_INFLIGHT_KEY),
          token: String(Date.now()) + ':' + String(Math.random()),
        };
        localStorage.setItem(RESTORE_INFLIGHT_KEY, restoreMarker.token);
      } catch (_e) { restoreMarker = null; /* privacy mode */ }

      // Apply + WAIT for every write to durably land before reloading (U1
      // barrier). applyFn SKIPS any section that fails shape validation so a
      // corrupt section can't overwrite good data.
      let applied;
      try { applied = await applyFn(storesMap, flagMap); }
      catch (e) {
        // The apply paths hold a cross-tab Web Lock; contention gets its own
        // message instead of the generic corrupt-file one downstream. Nothing
        // ran in this tab, so restore whichever marker was present beforehand.
        if (/already in progress/.test(String(e && e.message))) {
          // This tab never mutated anything. Restore the marker it displaced
          // instead of deleting a concurrent import's crash warning.
          try {
            if (restoreMarker && localStorage.getItem(RESTORE_INFLIGHT_KEY) === restoreMarker.token) {
              if (restoreMarker.previous == null) localStorage.removeItem(RESTORE_INFLIGHT_KEY);
              else localStorage.setItem(RESTORE_INFLIGHT_KEY, restoreMarker.previous);
            }
          } catch (_e) { /* best-effort */ }
          hideToast(_TOAST_ID);
          _showToast('Another backup operation is running in a different tab. Please wait for it to finish.');
          return;
        }
        throw e;
      }
      const { importFailures, writeFailures, skippedStores, countMismatches } = applied;

      hideToast(_TOAST_ID);

      // S3: a write FAILING is not a validation skip — the imported data is in
      // the caches but did NOT durably land, so a reload would mix it with OLD
      // IDB data. Do NOT reload; keep the page up and ask the user to retry.
      if (writeFailures > 0) {
        _showToast(`Import incomplete — ${writeFailures} store${writeFailures > 1 ? 's' : ''} failed to save. Please retry the import and don't close the app.`);
        return;
      }

      const problems = [];
      if (importFailures > 0) problems.push(`${importFailures} error${importFailures > 1 ? 's' : ''}`);
      if (skippedStores.length > 0) {
        problems.push(`${skippedStores.length} section${skippedStores.length > 1 ? 's' : ''} skipped (invalid: ${skippedStores.join(', ')})`);
      }
      // BAK3: the manifest's `counts` block vs what actually landed. A clean import
      // always reconciles; a mismatch means a truncated/edited backup or a partial
      // media import — the user should know their only backup didn't fully restore.
      if (countMismatches && countMismatches.length > 0) {
        problems.push(`some records didn't restore (${countMismatches.join(', ')})`);
      }
      // BAK-INTEGRITY: every verify outcome other than ok/absent ('mismatch',
      // 'malformed', 'trailing', 'truncated') is a corruption warning — never a
      // block (the data already imported); warn + record durably.
      const integ = getIntegrity ? getIntegrity() : null;
      if (integ && integ !== 'ok' && integ !== 'absent') {
        console.warn('[import] v3 backup integrity check failed (' + integ + ')');
        try { if (window.DiagnosticLog) window.DiagnosticLog.warn('import', 'v3 backup integrity ' + integ + ' (android)'); } catch (_e) { /* best-effort */ }
        // 'truncated' says the file is CUT, not that a checksum disagreed, and
        // backup-android-1 is what makes it reachable here. Same distinction
        // formatVerifyReport already draws: telling someone their backup failed
        // an integrity check when it was simply cut short sends them looking for
        // the wrong problem.
        problems.push(integ === 'truncated'
          ? 'the file was cut short — the media past that point could not be read'
          : 'the file failed its integrity check — some data may be corrupted');
      }
      if (problems.length) {
        // Wave-0: dropped "(check console)." dev-speak — details are in console.warn.
        _showToast(`Import completed — ${problems.join('; ')}. Reloading…`, 0);
      } else {
        _showToast('Import complete. Reloading…', 0);
      }
      // The apply is durable (writeFailures gate above) — the restore finished.
      try {
        if (!restoreMarker || localStorage.getItem(RESTORE_INFLIGHT_KEY) === restoreMarker.token) {
          localStorage.removeItem(RESTORE_INFLIGHT_KEY);
        }
      } catch (_e) { /* best-effort */ }
      // A clean import reloads fast; problems get reading time first — a 600ms
      // reload used to wipe the warning toast before anyone could read it.
      _scheduleBackupReload(problems.length ? 5000 : 600);
    };

    // BAK-INTEGRITY: a v3 backup carries a trailing CRC-32 of its manifest (all the
    // structured store data). A mismatch means it may be corrupted — but we NEVER
    // block the restore (the data still imports); we warn the user + record durably.
    const _warnBackupIntegrity = (platform, integrity) => {
      console.warn('[import] v3 backup integrity check failed (' + integrity + ')');
      try { if (window.DiagnosticLog) window.DiagnosticLog.warn('import', 'v3 backup integrity ' + integrity + ' (' + platform + ')'); } catch (_e) { /* best-effort */ }
      // 'truncated' is not a failed checksum — readContainer has produced it
      // since storage-backup-1, and this line has been calling a cut file a
      // corrupt one ever since. Say which one it is.
      _showToast(integrity === 'truncated'
        ? 'Warning: this backup was cut short — the media past that point could not be read. Everything else can still be imported.'
        : 'Warning: this backup failed its integrity check — some data may be corrupted. It can still be imported.', 5000);
    };

    // v3 streaming container import (web): read the file, validate, apply via applyV3.
    const _importV3Container = async (file) => {
      let read;
      try { read = await readContainer(file); }
      catch (e) {
        console.warn('v3 container read failed', e);
        _showToast('This backup file is corrupt or incomplete and could not be read.');
        return;
      }
      const { manifest, entries } = read;
      // Every readContainer outcome other than ok/absent ('mismatch',
      // 'trailing') is a corruption warning — same classification as the
      // Verify-a-Backup report. Shown BEFORE the confirm sheet so the user
      // can still cancel.
      if (read.integrity !== 'ok' && read.integrity !== 'absent') _warnBackupIntegrity('web', read.integrity);
      const envelopeErrors = validateImportEnvelope(manifest);
      if (envelopeErrors.length) {
        console.warn('import envelope invalid:', envelopeErrors);
        _showToast('This file does not look like a VOTReader backup.');
        return;
      }
      await _confirmDegradeApplyReload(manifest, (storesMap, flagMap) => applyV3(manifest, entries, {
        storesMap: storesMap,
        flagMap: flagMap,
        mediaStore: JournalMediaStore,
        validateStorePayload: validateStorePayload,
      }));
    };

    const _doImport = async (jsonText) => {
      try {
        const parsed = JSON.parse(jsonText);
        const envelopeErrors = validateImportEnvelope(parsed);
        if (envelopeErrors.length) {
          console.warn('import envelope invalid:', envelopeErrors);
          _showToast('This file does not look like a VOTReader backup.');
          return;
        }
        await _confirmDegradeApplyReload(parsed, (storesMap, flagMap) => applyImportPayload(parsed, {
          storesMap: storesMap,
          flagMap: flagMap,
          mediaStore: JournalMediaStore,
          validateStorePayload: validateStorePayload,
          validateMediaRecord: validateMediaRecord,
        }));
      } catch (err) {
        // SEC2: never surface the raw JSON.parse/exception text — V8 folds a
        // fragment of the malformed input into err.message. Log it for diagnostics;
        // show the same generic message the other corrupt-file paths use.
        console.warn('import failed', err);
        hideToast(_TOAST_ID);
        _showToast('This backup file is corrupt or incomplete and could not be read.');
      }
    };
    // Android v3 streaming import via the native chunked bridge. Native sniffs
    // the magic and returns "v3:<manifest>" (stream the blobs) or "legacy:<json>"
    // (a whole v1/v2 backup → reuse _doImport). For v3, the blobs feed applyV3
    // through an async-generator of {id, meta, blob} entries — the SAME applier
    // the web path uses — so only the SOURCE of the entries differs per platform.
    // BACKUP-STREAMING-PLAN P3.
    const _importV3Android = async () => {
      // 1. SAF source picker (async). Install the ready callback BEFORE launch.
      const ready = await new Promise((resolve) => {
        window.__onV3ImportReady = (status) => { window.__onV3ImportReady = null; resolve(status); };
        PlatformBridge.v3ImportOpen();
      });
      if (ready === 'cancelled') return;                  // user dismissed the picker
      // SEC2: log the raw native reason; show a generic, actionable message.
      if (ready !== 'ok') { console.warn('v3 import open failed:', ready); _showToast('Import failed — could not open the file. Please try again.'); return; }
      // 2. Open + sniff (native reads the magic, then the manifest OR the whole
      //    legacy file). Close the native stream on every non-v3 / error exit.
      let begin;
      try { begin = PlatformBridge.v3ImportBegin(); }
      catch (e) {
        console.warn('v3 import begin failed', e);
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        _showToast('Import failed: could not read file.');
        return;
      }
      const sniff = classifyV3ImportBegin(begin);
      if (sniff.kind === 'error') {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        if (sniff.reason === 'too_large') {
          _showToast('That file is too large to import (over 50 MB). VOTReader backups are normally well under that — is it the right file?');
        } else {
          _showToast('This backup file is corrupt or incomplete and could not be read.');
        }
        return;
      }
      if (sniff.kind === 'legacy') {
        // Legacy v1/v2 JSON — already fully read by native; route to the v2 applier.
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        await _doImport(sniff.json);
        return;
      }
      if (sniff.kind !== 'v3') {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        _showToast('This file does not look like a VOTReader backup.');
        return;
      }
      // 3. Parse + validate the v3 manifest.
      let manifest;
      try { manifest = JSON.parse(sniff.manifestJson); }
      catch (e) {
        console.warn('v3 import manifest parse failed', e);
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        _showToast('This backup file is corrupt or incomplete and could not be read.');
        return;
      }
      const envelopeErrors = validateImportEnvelope(manifest);
      if (envelopeErrors.length) {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        console.warn('import envelope invalid:', envelopeErrors);
        _showToast('This file does not look like a VOTReader backup.');
        return;
      }
      // 4. Stream the media frames as an async-gen of {id, meta, blob}; applyV3
      //    consumes it, reassembling each blob bounded (one frame at a time) from
      //    <=512 KB base64 chunks. A size mismatch or truncation throws — applyV3's
      //    fail-safe ordering keeps existing media (utils/backup-android.js — TEST-1).
      // BAK-INTEGRITY: onDone fires (with the trailing manifest-CRC verify result)
      // ONLY once every frame is consumed — so cancelling the confirm below never
      // triggers a spurious warning (the generator never reaches onDone).
      let integrityResult = 'absent';
      const entries = v3AndroidImportEntries({
        bridge: PlatformBridge,
        media: Array.isArray(manifest.media) ? manifest.media : [],
        onDone: (v) => { integrityResult = v; },
      });
      // 5. Confirm + degraded-guard + apply + reload (shared helper). Close the
      //    native stream no matter what (success, cancel at the confirm, or error).
      try {
        await _confirmDegradeApplyReload(manifest, (storesMap, flagMap) => applyV3(manifest, entries, {
          storesMap: storesMap,
          flagMap: flagMap,
          mediaStore: JournalMediaStore,
          validateStorePayload: validateStorePayload,
        }), () => integrityResult);
      } catch (e) {
        console.warn('android v3 import failed', e);
        hideToast(_TOAST_ID);
        _showToast('Import failed — the file may be corrupt or incomplete. Please try again.');
      } finally {
        try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
      }
    };

    // Android: v3 streaming import (native sniffs v3 vs legacy v1/v2).
    if (PlatformBridge.isAndroid) {
      await _importV3Android();
      return;
    }

    // Web: pick a File, sniff the first bytes, route a v3 container vs a legacy
    // v1/v2 JSON backup. pickImportFile() opens the picker synchronously in this
    // user gesture (the async IIFE runs sync up to the first await).
    await (async () => {
      try {
        const file = await PlatformBridge.pickImportFile();
        if (!file) return; // user cancelled
        const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (isContainerMagic(head)) {
          await _importV3Container(file);
        } else {
          // Legacy JSON whole-file text read. BAK4: cap at 50 MB to match Android
          // (StorageManager.MAX_IMPORT_SIZE) + the other web path
          // (WEB_MAX_IMPORT_BYTES) — v3 is the GB-scale streaming path, a legacy
          // v1/v2 backup is always well under this, so a larger pick is a
          // pathological non-backup that a 300 MB .text() read would OOM on a
          // budget device.
          if (file.size > 50 * 1024 * 1024) {
            _showToast('That file is too large to import (over 50 MB). VOTReader backups are normally well under that — is it the right file?');
            return;
          }
          await _doImport(await file.text());
        }
      } catch (e) {
        // SEC2: log for diagnostics; show a generic message, never the raw
        // exception text (may embed a fragment of the malformed file).
        console.warn('import failed', e);
        hideToast(_TOAST_ID);
        _showToast('This backup file is corrupt or incomplete and could not be read.');
      }
    })();
  };

  // ── Verify a Backup (FABLE5-BACKLOG [15]) ────────────────────────────────
  // Read-only .votbak inspection: run the ENTIRE import read path — magic,
  // manifest parse, envelope validation, per-frame size checks, trailing
  // CRC — and report what the file contains WITHOUT applying anything.
  // Catches a corrupt only-backup BEFORE the day it's needed. The result
  // renders as a row under the button (setVerifyReport); hard read failures
  // land there too, so the outcome is always visible in place.
  const _verifyFail = (msg) => {
    hideToast(_TOAST_ID);
    setVerifyReport({ message: msg, level: 'warn' });
  };
  const verifyBackupFile = () => {
    // `salvaged` is only meaningful for integrity 'truncated'. Both readers
    // produce it now — readContainer on the web (storage-backup-1) and the
    // Android frame walk (backup-android-1) — and only the reader can know how
    // many media frames actually came back, so the count travels from there
    // rather than being re-derived from the manifest's claim.
    const _report = (manifest, integrity, kind, salvaged) => {
      hideToast(_TOAST_ID);
      setVerifyReport(formatVerifyReport(summarizeBackupManifest(manifest), integrity, kind, salvaged));
    };
    // Both platforms: envelope-validate the parsed manifest/payload first so a
    // random JSON file reports "not a backup", not a zero-count summary.
    const _checkEnvelope = (parsed) => {
      const errs = validateImportEnvelope(parsed);
      if (errs.length) {
        console.warn('verify: envelope invalid', errs);
        _verifyFail('This file does not look like a VOTReader backup.');
        return false;
      }
      return true;
    };

    if (PlatformBridge.isAndroid) {
      return (async () => {
        const ready = await new Promise((resolve) => {
          window.__onV3ImportReady = (status) => { window.__onV3ImportReady = null; resolve(status); };
          PlatformBridge.v3ImportOpen();
        });
        if (ready === 'cancelled') return;
        if (ready !== 'ok') { console.warn('verify open failed:', ready); _verifyFail('Could not open the file. Please try again.'); return; }
        let begin;
        try { begin = PlatformBridge.v3ImportBegin(); }
        catch (e) { console.warn('verify begin failed', e); try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ } _verifyFail('Could not read the file.'); return; }
        const sniff = classifyV3ImportBegin(begin);
        try {
          if (sniff.kind === 'error') {
            _verifyFail(sniff.reason === 'too_large'
              ? 'That file is too large to be a VOTReader backup (over 50 MB).'
              : 'This backup file is corrupt or incomplete and could not be read.');
            return;
          }
          if (sniff.kind === 'legacy') {
            let parsed;
            try { parsed = JSON.parse(sniff.json); }
            catch (e) { console.warn('verify legacy parse failed', e); _verifyFail('This backup file is corrupt or incomplete and could not be read.'); return; }
            if (!_checkEnvelope(parsed)) return;
            _report(parsed, 'absent', 'legacy');
            return;
          }
          if (sniff.kind !== 'v3') { _verifyFail('This file does not look like a VOTReader backup.'); return; }
          let manifest;
          try { manifest = JSON.parse(sniff.manifestJson); }
          catch (e) { console.warn('verify manifest parse failed', e); _verifyFail('This backup file is corrupt or incomplete and could not be read.'); return; }
          if (!_checkEnvelope(manifest)) return;
          // Drain every media frame (discarding the bytes) so the stream reaches
          // the trailing CRC — the generator runs the native verify via onDone.
          // A damaged frame no longer throws (backup-android-1): the walk stops
          // there and onDone reports 'truncated' with the frames that survived,
          // so this branch reports "N of M still readable" like the web one
          // instead of calling a 99%-restorable backup corrupt. What still
          // throws is a broken bridge session, which says nothing about the file.
          _showToast('Checking backup…', 0);
          let integrity = 'absent';
          let salvaged = null;
          try {
            const entries = v3AndroidImportEntries({
              bridge: PlatformBridge,
              media: Array.isArray(manifest.media) ? manifest.media : [],
              onDone: (v, sv) => { integrity = v; salvaged = sv || null; },
            });
            for await (const _entry of entries) { /* verify-only: bytes discarded */ }
          } catch (e) {
            console.warn('verify frame walk failed', e);
            _verifyFail('This backup could not be checked — the app could not read the file all the way through. Please try again.');
            return;
          }
          _report(manifest, integrity, 'v3', salvaged);
        } finally {
          try { PlatformBridge.v3ImportClose(); } catch (_e) { /* best-effort */ }
        }
      })();
    }

    // Web: same routing as importPersonalData's picker path, minus the apply.
    return (async () => {
      try {
        const file = await PlatformBridge.pickImportFile();
        if (!file) return;
        const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (isContainerMagic(head)) {
          _showToast('Checking backup…', 0);
          let read;
          // Magic, manifest length/JSON, then the full media-frame walk. A
          // frame problem no longer throws (storage-backup-1) — it comes back
          // as integrity 'truncated' with the frames that DID read, which is
          // the honest input to the report below.
          try { read = await readContainer(file); }
          catch (e) { console.warn('verify container read failed', e); _verifyFail('This backup file is corrupt or incomplete and could not be read.'); return; }
          if (!_checkEnvelope(read.manifest)) return;
          _report(read.manifest, read.integrity, 'v3', {
            count: read.entries.length,
            bytes: read.entries.reduce((n, e) => n + ((e.meta && e.meta.size) || 0), 0),
          });
        } else {
          if (file.size > 50 * 1024 * 1024) { _verifyFail('That file is too large to be a VOTReader backup (over 50 MB).'); return; }
          let parsed;
          try { parsed = JSON.parse(await file.text()); }
          catch (e) { console.warn('verify legacy parse failed', e); _verifyFail('This backup file is corrupt or incomplete and could not be read.'); return; }
          if (!_checkEnvelope(parsed)) return;
          _report(parsed, 'absent', 'legacy');
        }
      } catch (e) {
        console.warn('verify failed', e);
        _verifyFail('This backup file is corrupt or incomplete and could not be read.');
      }
    })();
  };

  /**
   * Wrap `indexedDB.deleteDatabase(name)` in a Promise that resolves
   * with whether deletion actually succeeded. Critical deletes get a
   * longer timeout because hanging on those is worse than hanging
   * on a cache database.
   *
   * @param {string} name
   * @param {boolean} critical
   * @returns {Promise<boolean>} true only when deletion completed
   */
  const _deleteIdbDatabase = (name, critical) => new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => finish(true);
      req.onerror = () => finish(false);
      req.onblocked = () => finish(false); // open connections should close on
                                           // versionchange; otherwise fail visibly.
      // Timeout fallback so a stuck deletion doesn't block the UI
      // forever. 3s for user-data DBs, 1s for caches.
      setTimeout(() => finish(false), critical ? 3000 : 1000);
    } catch (_e) { finish(false); }
  });

  // The wipe itself. clearAllPersonalData (below) runs it with every live writer frozen.
  const _wipeAllPersonalData = async () => {
    try {
      // v04-02: a PLAYING recording is a live writer — its position every 5 s and
      // again on the reload's pagehide, into the database being deleted. stop()
      // idles it (its last position write meets the fence; its snapshot is
      // cleared), so neither the timer nor the pagehide writes again.
      try {
        const player = /** @type {any} */ (globalThis).AudioPlayer;
        if (player && typeof player.stop === 'function') player.stop();
      } catch (_e) { /* best-effort: the store write fence still holds */ }
      // NTV3: wipe the native Garden image disk cache too (Android: cacheDir/garden,
      // capped at 800 MB — it survived "Clear All" before because the JS wipe only
      // touched IDB + localStorage). Best-effort + a no-op on web; never block the
      // data wipe on it.
      try { PlatformBridge.clearGardenCache(); } catch (_e) { /* best-effort native cache wipe */ }
      // W2.4 + W2.4-hotfix: Clear ALL user-data IDB databases. The
      // pre-hotfix version fired deleteDatabase() then reloaded
      // immediately — the deletion is async and the reload raced
      // ahead. If the new page's IDBAdapter.open() beat the
      // deletion, the database survived and "Clear All" silently
      // failed.
      //
      // Fix: await the critical deletions (votreader = 19 stores of
      // user data; vot-journal-media = audio + images) before
      // reload. Each delete has a 3s timeout fallback so a stuck
      // onblocked never hangs the UI; vot-thumbs + the two search-index
      // caches (Classic + MiniSearch) are regenerable caches and get a
      // 1s timeout each.
      const NONCRITICAL_DB_NAMES = ['vot-thumbs', 'vot-search-cache', 'vot-minisearch-cache'];
      const deleteResults = await Promise.all([
        _deleteIdbDatabase('votreader', true),
        _deleteIdbDatabase('vot-journal-media', true),
        ...NONCRITICAL_DB_NAMES.map((name) => _deleteIdbDatabase(name, false)),
      ]);
      if (!deleteResults[0] || !deleteResults[1]) {
        throw new Error('A personal-data database could not be deleted');
      }
      // storage-backup-4: indexes 2+ (the regenerable caches) used to be
      // discarded outright — a silently-surviving database (e.g. an open
      // connection blocking the delete with no onversionchange to close it,
      // per thumb-store.js) looked byte-identical to a clean wipe. The wipe
      // still succeeds either way (these three are caches, not user data —
      // "Clear All" must not fail loud over a database that will just
      // regenerate on next use), but a failure is now at least visible in a
      // diagnostic export instead of invisible.
      const failedCaches = NONCRITICAL_DB_NAMES.filter((_name, i) => !deleteResults[2 + i]);
      if (failedCaches.length) {
        console.warn('clear all: non-critical database(s) failed to delete:', failedCaches.join(', '));
        try { if (window.DiagnosticLog) window.DiagnosticLog.warn('settings', 'Clear All: failed to delete ' + failedCaches.join(', ')); } catch (_e) { /* best-effort */ }
      }
      _collectVotKeys().forEach((k) => { try { localStorage.removeItem(k); } catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ } });
      // Wave-0: was alert('All personal data cleared…') — a native blocking
      // dialog. Same toast-then-reload pattern the import path uses: the
      // persistent toast renders first, the 600ms delay lets it paint.
      _showToast('All personal data cleared. Reloading…', 0);
      // Keep the backup controls disabled through the reload window — a new
      // import starting against the just-wiped state would race the teardown.
      _scheduleBackupReload(600);
    } catch (e) {
      console.warn('clear all personal data failed', e);
      // Wave-0: was alert('Clear failed. See console for details.') — native
      // dialog + dev-speak. The diagnostics still go to console.warn above;
      // the user gets an actionable message, not a pointer to tooling.
      _showToast('Clear did not finish. Please try again.');
    }
  };
  // Runs via _runLockedBackupOperation (mutex + cross-tab lock live there).
  // v04-02: the persist sink AND every store write stay frozen from before the
  // deletes until the reload, so nothing still in memory can recreate the data.
  const clearAllPersonalData = () => _withLiveWritersFrozen(_wipeAllPersonalData, { fenceStores: true });

  return {
    _scheduleBackupReload,
    _runBackupOperation,
    _runLockedBackupOperation,
    exportPersonalData,
    importPersonalData,
    verifyBackupFile,
    clearAllPersonalData,
  };
}
