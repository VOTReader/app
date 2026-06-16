/* ===================================================================
   Search helpers — currently just srchGroupKey (used by SearchScreen to bucket results by volume/collection)
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - srchGroupKey
   =================================================================== */


/**
 * Bucket a search-index doc by its source collection. SearchScreen groups
 * results by the returned key so users see "Volume Three (12)", "Matthew (3)",
 * etc. The `doc` shape comes from FlexSearch's index and varies by `kind`;
 * fields read here are `kind` (always), `bookId` (verse kinds),
 * `volumeId` (letter/wtlb kinds).
 *
 * @param {{kind?: string, bookId?: string, volumeId?: string} | null | undefined} doc
 * @returns {string}  the group key (e.g. 'matthew', 'bible', 'volume-three',
 *                    'wtlb', 'blessed', 'holydays', 'bible-studies', 'other').
 */
export function srchGroupKey(doc) {
  if (!doc) return 'other';
  const k = doc.kind;
  if (k === 'verse' || k === 'chapter-title' || k === 'heading') return doc.bookId === 'matthew' ? 'matthew' : 'bible';
  if (k === 'letter' || k === 'letter-title') return doc.volumeId || 'letters';
  if (k === 'wtlb' || k === 'wtlb-title') return doc.volumeId || 'wtlb';
  if (k === 'blessed' || k === 'blessed-title') return 'blessed';
  if (k === 'holy-day' || k === 'holy-day-title') return 'holydays';
  if (k === 'bible-study') return 'bible-studies';
  return 'other';
}

