/* ═══════════════════════════════════════════════════════════════════════
   your-data-link — one tap from anywhere to Settings → Your Data
   ═══════════════════════════════════════════════════════════════════════
   id-datasafe2 171: the write-failure toast (storage-health.js) opens Your
   Data in one tap. The ask rides a window flag plus an event, not module
   state, because the toast (bundle-b) and the screens that answer it
   (bundle-d) each carry their own copy of this module.
     AppShellOverlays  hears the event and goes to Settings;
     SettingsScreen    opens its Your Data group: on mount when the flag is
                       up, or at the event when it is already on screen. */

export const OPEN_YOUR_DATA_EVENT = 'vot-open-your-data';

/** Ask the app to show Settings with Your Data open. */
export function openYourData() {
  if (typeof window === 'undefined') return;
  /** @type {any} */ (window).__votOpenYourData = true;
  try { window.dispatchEvent(new Event(OPEN_YOUR_DATA_EVENT)); } catch (_e) { /* an old engine without Event(): Settings still reads the flag on mount */ }
}

/** Settings' side: true once per ask, and the ask is spent. @returns {boolean} */
export function takeYourDataAsk() {
  if (typeof window === 'undefined') return false;
  const w = /** @type {any} */ (window);
  if (!w.__votOpenYourData) return false;
  w.__votOpenYourData = false;
  return true;
}
