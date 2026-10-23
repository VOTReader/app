/* ═══════════════════════════════════════════════════════════════════════
   saved-shelf — a recording's star, with word when the full shelf drops one
   ═══════════════════════════════════════════════════════════════════════
   s09.3 (idea sweep 2026-10-22): the saved shelf keeps 100 recordings, and the
   101st pushed the oldest off with no word. The cap stays; a save that pushes
   one off names it in a toast, with Undo (the new one off, the old one back).
   Every recording star goes through toggleSavedRecording. */

import { showToast, hideToast } from './toast.js';

export const SAVED_CAP_TOAST_ID = 'vot-toast-saved-cap';

/**
 * Toggle a recording's star on `library` (AudioLibraryStore).
 * @param {any} library
 * @param {unknown} track
 * @returns {boolean} whether it is saved after the tap
 */
export function toggleSavedRecording(library, track) {
  if (!library || typeof library.toggleSaved !== 'function') return false;
  const pushed = typeof library.wouldEvict === 'function' ? library.wouldEvict(track) : null;
  const saved = !!library.toggleSaved(track);
  if (saved && pushed) {
    // Toasts share one spot, and this one carries an action: any other toast up (the KJV switch line from a Listen
    // a moment before, seen on the S22) steps aside rather than sit under it.
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.vot-toast.show').forEach((el) => { if (el.id && el.id !== SAVED_CAP_TOAST_ID) hideToast(el.id); });
    }
    // The title is corpus text: it goes in as text, and the Undo button is built, never parsed.
    showToast({
      id: SAVED_CAP_TOAST_ID, className: 'vot-toast vot-toast-undo', durationMs: 8000,
      text: 'Saved. Your saved list keeps ' + (library.maxSaved || 100) + ', so “' + (pushed.title || 'the oldest') + '” came off.',
    });
    const el = typeof document !== 'undefined' ? document.getElementById(SAVED_CAP_TOAST_ID) : null;
    if (el) {
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'vot-undo-btn';
      undo.textContent = 'Undo';
      undo.addEventListener('click', () => {
        if (typeof library.undoEviction === 'function') library.undoEviction(track, pushed);
        hideToast(SAVED_CAP_TOAST_ID);
      }, { once: true });
      el.appendChild(undo);
    }
  }
  return saved;
}
