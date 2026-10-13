/* ═══════════════════════════════════════════════════════════════════════
   backup-lock — the cross-tab backup mutex's name, and a read-only look at it
   ═══════════════════════════════════════════════════════════════════════
   W7 (sweep 2026-10-13). backup.js holds this Web Lock across every import,
   export, verify and Clear All. The boot hooks look at it before they touch
   what a restore leaves while it runs: use-restore-guard.js (the in-flight
   marker) and use-journal-media-sweep.js (the import staging and the orphan
   prune). A tab opened while another tab restores used to treat that
   restore's marker as a crash and sweep its staged media away. The lock is
   released by the browser when its tab dies, so a lock nobody holds plus a
   marker still set is a restore that really died. */

export const BACKUP_LOCK = 'votreader-backup-import';

/** Whether this browser can say who holds a Web Lock (Chromium 69+; the test shim cannot). */
export function canQueryBackupLock() {
  const locks = globalThis.navigator && globalThis.navigator.locks;
  return !!locks && typeof locks.query === 'function';
}

/**
 * True while any tab holds or waits for the backup lock. False when none does,
 * or when this browser cannot say (canQueryBackupLock false: the callers keep
 * their marker-only behaviour). A query that throws counts as held, so the
 * caller errs toward leaving data alone. Never rejects.
 * @returns {Promise<boolean>}
 */
export async function backupLockBusy() {
  if (!canQueryBackupLock()) return false;
  try {
    const snap = await globalThis.navigator.locks.query();
    /** @param {any} l */
    const ours = (l) => !!l && l.name === BACKUP_LOCK;
    return ((snap && snap.held) || []).some(ours) || ((snap && snap.pending) || []).some(ours);
  } catch (_e) {
    return true;
  }
}

/** How often a tab waiting on another tab's backup operation looks at the lock again. */
export const LOCK_POLL_MS = 2000;

/**
 * Run `fn` once the backup lock has been free for two looks in a row,
 * LOCK_POLL_MS apart. A restore that ends normally removes its marker moments
 * after it lets the lock go, so a marker still set after that belongs to a
 * restore whose tab died (Codex refuter, W7 round 1: a tab that only looked
 * once at boot never noticed). Polls for as long as the lock stays held.
 * Returns a cancel function.
 * @param {() => void} fn
 * @returns {() => void}
 */
export function whenBackupLockFree(fn) {
  let stopped = false;
  let freeOnce = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  const look = () => {
    timer = null;
    if (stopped) return;
    void backupLockBusy().then((busy) => {
      if (stopped) return;
      if (busy) freeOnce = false;
      else if (freeOnce) {
        stopped = true;
        try { fn(); } catch (_e) { /* the caller's work must not break the poll's caller */ }
        return;
      } else freeOnce = true;
      timer = setTimeout(look, LOCK_POLL_MS);
    });
  };
  timer = setTimeout(look, LOCK_POLL_MS);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
