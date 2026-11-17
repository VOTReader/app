/* utils/history-undo.js - remove one History row, with Undo (0610).
   HistoryStore is the window global bundle-b publishes, read at call time. Importing stores/history-store.js from
   here would build a second, never-hydrated vot-history store into bundle-d: Remove then found nothing to remove
   (e2e-undo-deletes, 11-17). tools/bundle-membership.test.js pins that bundle-d builds no store. */
import { showUndoToast } from './toast.js';

const _history = () => { const h = /** @type {any} */ (globalThis).HistoryStore; return h && typeof h.removeVisits === 'function' ? h : null; };

/**
 * Remove one History row: its place's visits on the row's calendar day (the screen folds a day's repeats into one
 * row), then offer "Removed from history · Undo", which puts each visit back at its old place.
 * @param {{ key: string, ts: number }} entry the row's (newest) visit
 * @returns {void}
 */
export function removeHistoryRow(entry) {
  const store = _history();
  if (!store || !entry || !entry.key || typeof entry.ts !== 'number') return;
  const d = new Date(entry.ts);
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const gone = store.removeVisits(entry.key, from, to);
  if (gone.length) showUndoToast('vot-toast-history-removed', 'Removed from history', () => store.restoreVisits(gone));
}
