/* ═══════════════════════════════════════════════════════════════════════
   useBackupReminder — boot-time "your backup is stale" nudge
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Export (Settings → Your Data) is the app's ONLY backup mechanism
   (android:allowBackup="false"), and it is entirely manual — nothing ever
   told the user their last backup was months old. This hook closes that
   gap with a boot-check ONLY: no scheduling APIs, no notifications, no
   egress. Once per boot, after a short settle, it measures the user's own
   data (measureUserData — the same bytes Export writes) and, when the
   backup story is stale, shows the app's standard toast with an
   "Export from Settings" deep-link button.

   DECISION (shouldRemindBackup — pure, exported, unit-tested):
     remind ⇔ reminders enabled (settings.backupReminder !== false)
           AND the user has non-trivial data (> 50 KB — a fresh profile
               never nags)
           AND the last export is > 30 days old or has never happened
               (settings.lastExportAt — stamped by SettingsScreen's
               exportPersonalData on BOTH platforms' success paths)
           AND we haven't already reminded in the last 7 days
               (settings.lastBackupRemindedAt — stamped when the toast
               shows, so it can't nag every boot).

   All three persisted values live in `settings` (they ride the vot-state
   blob usePersistedState already writes) — a bare top-level StateStore
   key would be clobbered by the 8-value full-replacement set(), and a new
   IDB store would widen the export/import/user-data-size surface for
   three scalars. Riding settings means they also restore from a backup,
   which is correct: an imported profile inherits its real export history.

   PARAMS: { settings, updateSetting } from useSettings; goSettings from
     useNav. Read through a render-refreshed ref so the boot effect can
     keep its empty dep array (it must fire exactly once per mount).
   RETURNS: nothing.
   ═══════════════════════════════════════════════════════════════════════ */

import { measureUserData } from '../utils/user-data-size.js';
import { showToast, hideToast } from '../utils/toast.js';

/** Last export older than this (or absent) counts as stale. */
export const BACKUP_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** After showing the reminder once, stay quiet this long. */
export const BACKUP_REMIND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** "Non-trivial data" floor — below this the reminder never fires. */
export const BACKUP_MIN_DATA_BYTES = 50 * 1024; // 50 KB

/** Boot settle before checking — keeps the check off the boot critical path. */
const SETTLE_MS = 3500;
const TOAST_ID = 'vot-toast-backup';
const TOAST_MS = 12000;

/**
 * Pure decision: should the backup-freshness reminder show right now?
 * Timestamps are epoch ms; absent/0 lastExportAt means "never exported"
 * (which is stale by definition). A future-dated stamp (device clock
 * rolled back) reads as fresh — no nag on clock skew.
 *
 * @param {{
 *   lastExportAt?: number | null,
 *   lastRemindedAt?: number | null,
 *   dataBytes?: number | null,
 *   enabled?: boolean,
 *   now?: number
 * }} args
 * @returns {boolean}
 */
export function shouldRemindBackup({ lastExportAt, lastRemindedAt, dataBytes, enabled, now }) {
  if (enabled === false) return false;
  if (!(typeof dataBytes === 'number' && dataBytes > BACKUP_MIN_DATA_BYTES)) return false;
  const t = typeof now === 'number' ? now : Date.now();
  if (typeof lastExportAt === 'number' && lastExportAt > 0 && t - lastExportAt < BACKUP_STALE_MS) return false;
  if (typeof lastRemindedAt === 'number' && lastRemindedAt > 0 && t - lastRemindedAt < BACKUP_REMIND_COOLDOWN_MS) return false;
  return true;
}

/**
 * Boot-check hook. Runs the decision once per mount (after a settle) and
 * shows the reminder toast when it says so. The toast's button deep-links
 * to Settings; showing at all stamps settings.lastBackupRemindedAt so the
 * next 7 days of boots stay quiet.
 *
 * @param {{
 *   settings: Record<string, any>,
 *   updateSetting: (key: string, val: any) => void,
 *   goSettings: () => void
 * }} args
 * @returns {void}
 */
export function useBackupReminder({ settings, updateSetting, goSettings }) {
  const argsRef = React.useRef({ settings, updateSetting, goSettings });
  argsRef.current = { settings, updateSetting, goSettings };

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const pre = argsRef.current.settings;
      // Cheap pre-check before touching IDB: disabled = no measurement at all.
      if (!pre || pre.backupReminder === false) return;
      measureUserData().then((measured) => {
        if (cancelled) return;
        const { settings: s, updateSetting: set } = argsRef.current;
        const remind = shouldRemindBackup({
          lastExportAt: s.lastExportAt,
          lastRemindedAt: s.lastBackupRemindedAt,
          dataBytes: measured.total,
          enabled: s.backupReminder !== false,
          now: Date.now(),
        });
        if (!remind) return;
        set('lastBackupRemindedAt', Date.now());
        showToast({
          id: TOAST_ID,
          className: 'vot-toast vot-toast-backup',
          // TRUSTED STATIC MARKUP ONLY (SEC-2) — no dynamic strings here.
          html: 'It has been a while since your last backup. <button type="button" class="vot-backup-btn">Export from Settings</button>',
          durationMs: TOAST_MS,
        });
        const el = document.getElementById(TOAST_ID);
        const btn = el && el.querySelector('.vot-backup-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            hideToast(TOAST_ID);
            // Read goSettings at CLICK time (not capture time): useNav rebuilds
            // it every render around the live nav state, and the toast lives
            // long enough for the user to navigate before tapping.
            const go = argsRef.current.goSettings;
            if (typeof go === 'function') go();
          }, { once: true });
        }
      }).catch(() => { /* best-effort — a failed measurement never nags or throws */ });
    }, SETTLE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
}
