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

   W7 (sweep 2026-10-13): the marker is shared by every tab of the origin, so
   a tab opened WHILE another tab restores saw a live marker, deleted it and
   warned falsely. A restore still running holds the backup Web Lock
   (utils/backup-lock.js), and the browser drops that lock when its tab dies;
   so this tab warns only once the lock has stayed free for two looks 2 s
   apart and the marker it saw at boot is still set: a restore that died (its
   tab closed before or after this one booted). A browser that cannot query
   locks keeps the old marker-only behaviour.

   PARAMS: none. Reads the `showToast` bare global (typeof-guarded, same
   pattern as useJournalMediaSweep) with SettingsScreen's toast shape.
   ═══════════════════════════════════════════════════════════════════════ */

/** Set before an import applies; removed on completion. Wiped by Clear All
 *  (vot-* prefix) and never part of DEFAULT_DATA_LS_KEYS, so a backup can
 *  neither export nor reseed it. */
import { showToast } from '../utils/toast.js';
import { canQueryBackupLock, whenBackupLockFree } from '../utils/backup-lock.js';

export const RESTORE_INFLIGHT_KEY = 'vot-restore-inflight';

/** Mount-only: warn once if the previous session died mid-restore. */
export function useRestoreGuard() {
  React.useEffect(() => {
    let pending = null;
    try { pending = localStorage.getItem(RESTORE_INFLIGHT_KEY); } catch (_e) { /* privacy mode */ }
    if (!pending) return;
    const warn = () => {
      try { localStorage.removeItem(RESTORE_INFLIGHT_KEY); } catch (_e) { /* best-effort */ }
      if (typeof showToast !== 'function') return;
      showToast({
        id: 'vot-restore-guard', className: 'vot-toast',
        text: 'Your last restore may not have finished. If anything looks missing, import your backup file again (Settings → Your Data).',
        durationMs: 0,
      });
    };
    if (!canQueryBackupLock()) { warn(); return; }
    let live = true;
    // The marker seen at boot is still there once nothing has held the lock for two looks:
    // its restore died. One that finished removed its own marker; a newer restore wrote a
    // different one. Never on one look (Codex refuter, W7 round 2): a restore lets the lock
    // go a moment BEFORE it removes its marker, and one free look can land in that moment.
    const warnIfStill = () => {
      let still = null;
      try { still = localStorage.getItem(RESTORE_INFLIGHT_KEY); } catch (_e) { /* privacy mode */ }
      if (live && still === pending) warn();
    };
    const stopWaiting = whenBackupLockFree(warnIfStill);
    return () => { live = false; stopWaiting(); };
  }, []);
}
