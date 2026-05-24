/* ===================================================================
   bookCategory — classifies a bookId into OT/NT/Other (Matthew study) categories
   ===================================================================
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Bundled helpers (P5e):
   - bookCategory
   =================================================================== */

/**
 * Classify a Bible book by canon. Reads from the module-global `OT_BOOK_IDS`
 * Set (declared in data/), with `_OT_BOOKS_INLINE` as a defensive fallback
 * for the (theoretical) case where this file is loaded before the OT
 * registry. Unknown bookIds fall through to "New Testament".
 *
 * @param {string} bookId  e.g. 'genesis', 'matthew', 'revelation'
 * @returns {'Old Testament' | 'New Testament'}
 */
export function bookCategory(bookId) {
  var ot = (typeof OT_BOOK_IDS !== 'undefined') ? OT_BOOK_IDS : _OT_BOOKS_INLINE;
  return ot.has(bookId) ? 'Old Testament' : 'New Testament';
}

