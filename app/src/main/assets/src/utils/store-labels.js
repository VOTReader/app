// @ts-check
/* store-labels — a store's name in the reader's words (data-3: the backup toast and the
   storage banner name a store this device could not read). Stateless; any bundle. */

/** data-3: a store's name in the reader's words (the store id when it has none). */
const STORE_LABELS = /** @type {Record<string, string>} */ ({
  'vot-history': 'reading history', 'vot-journal': 'journal', 'vot-annotations': 'highlights', 'vot-notes': 'notes',
  'vot-links': 'links', 'vot-bookmarks': 'bookmarks', 'vot-notebooks': 'notebooks', 'vot-journal-notebooks': 'journal notebooks',
  'vot-state': 'settings and reading place', 'vot-reading-plans': 'reading plans', 'vot-audio-library': 'audio library',
});
/** @param {string} name */
export const storeLabel = (name) => STORE_LABELS[name] || name;
