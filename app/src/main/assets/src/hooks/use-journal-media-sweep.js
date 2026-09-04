/* ═══════════════════════════════════════════════════════════════════════
   useJournalMediaSweep — one-time journal media hygiene sweep (boot, +4 s)
   ═══════════════════════════════════════════════════════════════════════
   Extracted verbatim from App() 2026-08-02 (composition-root headroom —
   the one App() effect with ZERO closure dependencies).

   JournalStore.remove() deliberately does NOT delete media blobs (an embed
   in another entry may still reference the source's image/audio —
   shared-media protection). The trade-off is that the owning entry's
   deletion orphans its blobs in IndexedDB. collectAllMediaIds() walks
   EVERY entry (source + embeds), so a blob survives as long as any entry
   still references it; only truly unreferenced blobs are pruned. Deferred
   4 s so it never competes with the first paint.

   storage-backup-5 (added 2026-09-04): the SAME deferred slot also sweeps
   JournalMediaStore's import-staging store. A v3 restore killed mid-stream
   (process kill, crash, power loss) durably stages blobs there and then
   never runs commitImportReplace/commitImportMerge — the only things that
   ever clear it — so the duplicate sits forever: invisible to Your Data (a
   separate IDB object store from live media, not counted or listed
   anywhere) and reclaimed only by chance, if the owner happens to import
   again later. Safe to clear here because RESTORE_INFLIGHT_KEY is written
   BEFORE the first staging write and removed only once a restore completes
   or provably never started (SettingsScreen.jsx's _applyConfirmedImport;
   see use-restore-guard.js) — its absence at boot means no import is live
   in this tab OR a sibling tab (localStorage is shared same-origin), so
   whatever is still in staging belongs to a session that's already gone.
   abortImportReplace() is a plain clearStore() — a no-op when staging is
   already empty, which is the common case on every ordinary boot.

   PARAMS: none. WINDOW: none. Reads the JournalStore / JournalMediaStore
   bare globals (bundle-b), both typeof-guarded.
   ═══════════════════════════════════════════════════════════════════════ */

import { RESTORE_INFLIGHT_KEY } from './use-restore-guard.js';

/** Mount-only: schedule the hygiene sweep once, 4 s after boot. */
export function useJournalMediaSweep() {
  React.useEffect(() => {
    const t = setTimeout(() => {
      // storage-backup-5: stale import-staging left by a restore that never
      // reached its commit. Independent of the orphan sweep below (a
      // different object store) — runs even if JournalStore isn't ready yet.
      try {
        if (typeof JournalMediaStore !== 'undefined') {
          let inflight = null;
          try { inflight = localStorage.getItem(RESTORE_INFLIGHT_KEY); } catch (_e) { /* privacy mode */ }
          if (!inflight) {
            JournalMediaStore.abortImportReplace()
              .catch((e) => console.warn('Stale import-staging sweep failed', e));
          }
        }
      } catch (e) { console.warn('Stale import-staging sweep threw', e); }

      try {
        if (typeof JournalStore === 'undefined' || typeof JournalMediaStore === 'undefined') return;
        // U1: only sweep when the journal store is fully hydrated. If it is
        // still pending/degraded (slow IDB, or a fresh import that hasn't
        // rebased yet), collectAllMediaIds() under-reports referenced blobs and
        // the prune would irreversibly delete real (or just-imported) media.
        // Skipping is safe: an orphan blob is harmless leftover space, swept on
        // a later boot once the store loads in time.
        if (!JournalStore.isReady()) {
          console.info('Journal media orphan sweep skipped — store not ready (' + JournalStore.getState() + ')');
          return;
        }
        // STORE-2: stamp the snapshot moment and pass it as the prune cutoff so a
        // blob captured AFTER this snapshot (but read by prune's async IDB pass)
        // is never reclaimed — it's too new to be a real orphan.
        const sweepStart = Date.now();
        const referenced = JournalStore.collectAllMediaIds();
        JournalMediaStore.pruneOrphans(referenced, sweepStart).then((n) => {
          if (n) console.info('Journal media orphan sweep removed', n, 'blob(s)');
        }).catch((e) => console.warn('Journal media orphan sweep failed', e));
      } catch (e) { console.warn('Journal media orphan sweep threw', e); }
    }, 4000);
    return () => clearTimeout(t);
  }, []);
}
