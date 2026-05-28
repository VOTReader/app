/* ═══════════════════════════════════════════════════════════════════════
   format-bytes — human-readable byte size formatter
   ═══════════════════════════════════════════════════════════════════════
   Pure helper. Used by W2.5's storage display in Settings → Your Data
   and by the W2.5 export payload's storageQuota / storageUsed diagnostic
   fields (which are kept as raw bytes — formatting is a presentation
   concern, not a wire-format one).

   Rules:
     bytes < 1 KB         → "X B"
     bytes < 1 MB         → "X KB" (one decimal place)
     bytes < 1 GB         → "X MB" (one decimal place)
     bytes < 1 TB         → "X GB" (one decimal place)
     bytes >= 1 TB        → "X TB" (one decimal place)
     null / undefined / negative / NaN → "?"

   Uses 1024 (binary KB/MB/GB) — matches the Chrome dev-tools storage
   panel + every Android device-storage UI. Some browsers/specs use
   1000 (SI); we pick binary for consistency with what users see in
   their OS settings.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Format a byte count as a human-readable string with one decimal
 * place for KB and above. Always one space between the number and
 * the unit (e.g. "45.3 MB", not "45.3MB"). Returns "?" for null /
 * undefined / negative / NaN inputs so the caller doesn't have to
 * special-case missing values.
 *
 * @param {number | null | undefined} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes == null || typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '?';
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  const mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  const gb = mb / 1024;
  if (gb < 1024) return gb.toFixed(1) + ' GB';
  const tb = gb / 1024;
  return tb.toFixed(1) + ' TB';
}
