/* ═══════════════════════════════════════════════════════════════════════
   useRestoreGuard — boot-time warning for a restore that never finished
   ═══════════════════════════════════════════════════════════════════════
   SettingsScreen sets RESTORE_INFLIGHT_KEY in localStorage immediately
   before applying an import and removes it only when the apply completes
   (or provably never started, e.g. cross-tab lock contention). A restore
   spans two IndexedDB databases + the LS shim with no distributed
   transaction, so a crash / process kill / power loss mid-apply can leave
   them inconsistent — silently. This hook turns that only-silent failure
   mode into a loud one-shot prompt on the next boot: the fix is always
   "re-import the backup file", which the user still has.

   Deliberately NOT a recovery journal (adjudicated 2026-08-03: a correct
   two-phase journal across two DBs is days of crash-matrix work to close
   a seconds-wide window on a user-initiated foreground operation; the
   loud prompt is the right-sized version).

   PARAMS: none. Reads the `showToast` bare global (typeof-guarded, same
   pattern as useJournalMediaSweep) with SettingsScreen's toast shape.
   ═══════════════════════════════════════════════════════════════════════ */

/** Set before an import applies; removed on completion. Wiped by Clear All
 *  (vot-* prefix) and never part of DEFAULT_DATA_LS_KEYS, so a backup can
 *  neither export nor reseed it. */
export const RESTORE_INFLIGHT_KEY = 'vot-restore-inflight';

/** Mount-only: warn once if the previous session died mid-restore. */
export function useRestoreGuard() {
  React.useEffect(() => {
    let pending = null;
    try { pending = localStorage.getItem(RESTORE_INFLIGHT_KEY); } catch (_e) { /* privacy mode */ }
    if (!pending) return;
    try { localStorage.removeItem(RESTORE_INFLIGHT_KEY); } catch (_e) { /* best-effort */ }
    if (typeof showToast !== 'function') return;
    showToast({
      id: 'vot-restore-guard', className: 'vot-toast',
      text: 'Your last restore may not have finished. If anything looks missing, import your backup file again (Settings → Your Data).',
      durationMs: 0,
    });
  }, []);
}
