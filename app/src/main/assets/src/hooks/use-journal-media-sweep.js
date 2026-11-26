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

   W7 (sweep 2026-10-13): "absent marker = no import live in any tab" broke
   once a tab opened DURING another tab's restore: its restore guard consumed
   the live marker, and four seconds later this sweep emptied the staging the
   other tab was about to commit. Both halves now also look at the backup Web
   Lock (utils/backup-lock.js), which a restoring tab holds until it is done:
   held now = touch nothing yet: the staging sweep waits until the lock has
   been free a while (a restore whose tab died leaves its staging behind;
   one that finished left it empty). And the orphan prune is skipped for this session
   whenever a restore was live at boot (lock or marker): this tab's journal
   was loaded before that restore's entries landed, so "unreferenced" would
   mean "just imported". A browser that cannot query locks keeps the
   marker-only checks.

   PARAMS: none. WINDOW: none. Reads the JournalStore / JournalMediaStore
   bare globals (bundle-b), both typeof-guarded.
   ═══════════════════════════════════════════════════════════════════════ */

import { RESTORE_INFLIGHT_KEY } from './use-restore-guard.js';
import { JournalMediaStore } from '../stores/journal-media-store.js';
import { JournalStore } from '../stores/journal-store.js';
import { backupLockBusy, canQueryBackupLock, whenBackupLockFree, withBackupLockIfFree } from '../utils/backup-lock.js';
import { judgedHealthy, whenJudged } from '../utils/data-safety.js';

/** data-1: unreferenced blobs first seen when (localStorage, `{ id: ms }`); one is deleted only
 *  once it has stayed unreferenced on healthy boots for ORPHAN_HOLD_MS. */
export const ORPHANS_SEEN_KEY = 'vot-media-orphans-seen';
export const ORPHAN_HOLD_MS = 7 * 86400000;

/**
 * data-1 mark-then-sweep: of this sweep's unreferenced ids, the ones unreferenced for a week.
 * Records the new ones and forgets the ones referenced again. No storage: none (keep them all).
 * @param {string[]} ids @param {number} nowMs @returns {string[]}
 */
export function heldLongEnough(ids, nowMs) {
  try {
    /** @type {Record<string, number>} */ let seen = {};
    try { seen = JSON.parse(localStorage.getItem(ORPHANS_SEEN_KEY) || '{}') || {}; } catch (_e) { seen = {}; }
    /** @type {Record<string, number>} */ const next = {};
    /** @type {string[]} */ const ripe = [];
    for (const id of ids) {
      const at = typeof seen[id] === 'number' && seen[id] <= nowMs ? seen[id] : nowMs;
      if (nowMs - at >= ORPHAN_HOLD_MS) ripe.push(id);
      else next[id] = at;
    }
    localStorage.setItem(ORPHANS_SEEN_KEY, JSON.stringify(next));
    return ripe;
  } catch (_e) { return []; }
}

/** Whether a restore marker is set now (any tab). */
function _markerSet() {
  try { return !!localStorage.getItem(RESTORE_INFLIGHT_KEY); } catch (_e) { return false; /* privacy mode */ }
}

/** Mount-only: schedule the hygiene sweep once, 4 s after boot. */
export function useJournalMediaSweep() {
  React.useEffect(() => {
    // W7: was a restore live (in any tab) when this tab booted?
    const markerAtBoot = _markerSet();
    const queryable = canQueryBackupLock();
    const lockAtBoot = queryable ? backupLockBusy() : Promise.resolve(false);
    let live = true;
    /** @type {(() => void) | null} */
    let stopWaiting = null;
    const isLive = () => live;
    const t = setTimeout(() => {
      if (!queryable) { _sweep(markerAtBoot, false, false, isLive); return; }
      void Promise.all([lockAtBoot, backupLockBusy()]).then(([atBoot, now]) => {
        if (live) stopWaiting = _sweep(markerAtBoot || atBoot, now, true, isLive);
      });
    }, 4000);
    return () => { live = false; clearTimeout(t); if (stopWaiting) stopWaiting(); };
  }, []);
}

/**
 * @param {boolean} restoreAtBoot - a restore was live when this tab booted
 * @param {boolean} restoreNow - another tab holds the backup lock right now
 * @param {boolean} queryable - this browser can say who holds the lock
 * @param {() => boolean} isLive - the hook is still mounted
 * @returns {(() => void) | null} stops a staging sweep still waiting on the lock
 */
function _sweep(restoreAtBoot, restoreNow, queryable, isLive) {
  const inflight = _markerSet();
  /** @type {(() => void) | null} */
  let stopWaiting = null;
  // storage-backup-5: stale import-staging left by a restore that never
  // reached its commit. Independent of the orphan sweep below (a
  // different object store) — runs even if JournalStore isn't ready yet.
  try {
    if (typeof JournalMediaStore !== 'undefined') {
      // Under the backup lock (W7 round 3): a restore that starts meanwhile cannot have its staging cleared.
      const abortStaging = () => {
        withBackupLockIfFree(() => JournalMediaStore.abortImportReplace())
          .catch((e) => console.warn('Stale import-staging sweep failed', e));
      };
      if (!inflight && !restoreNow) abortStaging();
      // W7: a restore is live (or its marker is): sweep once the lock has stayed free.
      else if (queryable) stopWaiting = whenBackupLockFree(abortStaging);
    }
  } catch (e) { console.warn('Stale import-staging sweep threw', e); }

  try {
    if (typeof JournalStore === 'undefined' || typeof JournalMediaStore === 'undefined') return stopWaiting;
    // W7: media a restore brought in is unreferenced in a journal loaded before it landed.
    if (restoreAtBoot || restoreNow || inflight) {
      console.info('Journal media orphan sweep skipped — a restore was in progress');
      return stopWaiting;
    }
    // U1: only sweep when the journal store is fully hydrated. If it is
    // still pending/degraded (slow IDB, or a fresh import that hasn't
    // rebased yet), collectAllMediaIds() under-reports referenced blobs and
    // the prune would irreversibly delete real (or just-imported) media.
    // Skipping is safe: an orphan blob is harmless leftover space, swept on
    // a later boot once the store loads in time.
    if (!JournalStore.isReady()) {
      console.info('Journal media orphan sweep skipped — store not ready (' + JournalStore.getState() + ')');
      return stopWaiting;
    }
    // data-1: a journal record that loaded short still counts as ready, so "unreferenced" is
    // only believed once this boot's health pass has judged the library whole (HydrationGate
    // runs it ~5 s after the gate opens, after this timer) and no loss banner is up. A damaged,
    // unread or failed verdict leaves every blob for Restore to find.
    whenJudged().then((verdict) => {
      if (!isLive()) return;
      if (!judgedHealthy(verdict)) {
        console.info('Journal media orphan sweep skipped — library not judged healthy (' + verdict + ')');
        return;
      }
      if (_markerSet()) { console.info('Journal media orphan sweep skipped — a restore was in progress'); return; }
      _prune();
    }).catch((e) => console.warn('Journal media orphan sweep threw', e));
  } catch (e) { console.warn('Journal media orphan sweep threw', e); }
  return stopWaiting;
}

/** The orphan prune itself, once the library is judged healthy (data-1). */
function _prune() {
  if (!JournalStore.isReady()) return;
  // STORE-2: stamp the snapshot moment and pass it as the prune cutoff so a
  // blob captured AFTER this snapshot (but read by prune's async IDB pass)
  // is never reclaimed — it's too new to be a real orphan.
  const sweepStart = Date.now();
  const referenced = JournalStore.collectAllMediaIds();
  // data-1 mark-then-sweep: an unreferenced blob goes only after a week of healthy boots
  // that all found it unreferenced (a short journal that no check caught gets that week).
  const ripe = (/** @type {string[]} */ ids) => heldLongEnough(ids, sweepStart);
  // Another PWA tab may have linked media since this tab loaded the journal: what the stored journal names is
  // kept too, read after the scan with the journal's save lock held, so a save already under way lands first and
  // none lands between that read and the deletes (review 11-26).
  const prune = typeof JournalStore.mediaIdsOnDisk === 'function'
    ? () => JournalStore.withSavesHeld(() => JournalMediaStore.pruneOrphans(referenced, sweepStart, () => JournalStore.mediaIdsOnDisk(), ripe))
    : () => JournalMediaStore.pruneOrphans(referenced, sweepStart, undefined, ripe);
  prune().then((/** @type {number} */ n) => {
    if (n) console.info('Journal media orphan sweep removed', n, 'blob(s)');
  }).catch((/** @type {any} */ e) => console.warn('Journal media orphan sweep failed', e));
}
