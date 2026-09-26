/* ═══════════════════════════════════════════════════════════════════════
   backup-warn — a backup-path warning that reaches the reader's diagnostic log.
   Imported by utils/backup.js (bundle-d) and utils/backup-flow.js (bundle-e);
   stateless, so each bundle carrying its own copy is harmless.
   ═══════════════════════════════════════════════════════════════════════

   Backup, import and restore warnings went to the console only
   (v15-code-health-11: backup.js 23 console.warn, 0 DiagnosticLog). On a
   phone nobody reads that console, so when a reader's restore came back
   short, the one record of which store failed was gone. Each warning now
   goes to the console exactly as before AND to DiagnosticLog under the tag
   'backup', which the Settings diagnostic export carries.

   What reaches the log is deliberately narrow: the message, any string or
   number detail (store names, record ids, keys) and an error's NAME. Never an
   error's message: V8 folds a fragment of the malformed input into a
   JSON.parse message (SEC2), and a backup file is the reader's own words. */

/**
 * @param {string} message  a fixed description ("store import failed for")
 * @param {...any} details  names, ids, errors, violation lists
 */
export function backupWarn(message, ...details) {
  console.warn(message, ...details);
  try {
    const log = /** @type {any} */ (globalThis).DiagnosticLog;
    if (!log || typeof log.warn !== 'function') return;
    const parts = details.map((d) => {
      if (typeof d === 'string' || typeof d === 'number') return String(d);
      if (Array.isArray(d)) return d.length + ' problem' + (d.length === 1 ? '' : 's');
      if (d && typeof d === 'object' && typeof d.name === 'string') return d.name;
      return '';
    }).filter(Boolean);
    log.warn('backup', [message, ...parts].join(' '));
  } catch (_e) { /* the console line already went out */ }
}
