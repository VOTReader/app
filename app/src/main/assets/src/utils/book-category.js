/* ===================================================================
   bookCategory — classifies a bookId into OT/NT/Other (Matthew study) categories
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - bookCategory
   =================================================================== */


function bookCategory(bookId) {
  var ot = (typeof OT_BOOK_IDS !== 'undefined') ? OT_BOOK_IDS : _OT_BOOKS_INLINE;
  return ot.has(bookId) ? 'Old Testament' : 'New Testament';
}

