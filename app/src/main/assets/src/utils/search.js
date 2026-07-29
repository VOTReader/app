/* ===================================================================
   Search helpers — srchGroupKey (result bucketing) + the FABLE5 [8]
   result-filter chips / canonical-sort pure halves
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - srchGroupKey
   - SRCH_FILTER_CATS / srchFilterCategories / srchApplyFilter
   - srchSortCanonical
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

/* ── FABLE5 [8] — result filter chips + canonical verse sort ─────────
   These are CLIENT-SIDE views over the already-fetched result set (the
   engine's corpus/scope options narrow what is SEARCHED; these chips
   narrow what is RENDERED — instant, no re-query). */

/** Category → group-key map for the filter chips. Order = chip order.
 *  ('hidden-manna' is deliberately absent — never indexed, per policy.) */
export const SRCH_FILTER_CATS = [
  { id: 'scriptures', label: 'Scriptures', keys: ['bible', 'matthew'] },
  { id: 'volumes',    label: 'Volumes',    keys: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'timothy', 'flock', 'rebuke', 'letters', 'holydays'] },
  { id: 'wtlb',       label: 'WTLB',       keys: ['wtlb1', 'wtlb2', 'blessed'] },
  { id: 'studies',    label: 'Studies',    keys: ['bible-studies', 'matthew-study'] },
];

/**
 * Which filter categories are PRESENT in a grouped result set, with match
 * counts. Returns [] when 0 or 1 category is present — chips that can't
 * change anything are noise, so the caller renders nothing.
 *
 * @param {Array<{key: string, items: any[]}>} groups
 * @returns {Array<{id: string, label: string, count: number}>}
 */
export function srchFilterCategories(groups) {
  const out = [];
  for (const cat of SRCH_FILTER_CATS) {
    let count = 0;
    for (const g of groups) if (cat.keys.indexOf(g.key) !== -1) count += g.items.length;
    if (count > 0) out.push({ id: cat.id, label: cat.label, count });
  }
  return out.length > 1 ? out : [];
}

/**
 * Filter grouped results to one category ('all' passes everything through,
 * including 'other'-keyed groups no category claims).
 *
 * @param {Array<{key: string, items: any[]}>} groups
 * @param {string} catId - 'all' or a SRCH_FILTER_CATS id
 * @returns {Array<{key: string, items: any[]}>}
 */
export function srchApplyFilter(groups, catId) {
  if (!catId || catId === 'all') return groups;
  const cat = SRCH_FILTER_CATS.find((c) => c.id === catId);
  if (!cat) return groups;
  return groups.filter((g) => cat.keys.indexOf(g.key) !== -1);
}

/** Canonical Bible order as a CONSTANT — the canon doesn't change, so the
 *  sort must never depend on the lazy bible corpus being loaded (it usually
 *  ISN'T on the Search screen, which silently no-opped the first cut of
 *  this sort — owner-caught 2026-07-28). 'matthew' (the Study Bible) shares
 *  Matthew's slot with 'matthew-plain'. */
export const SRCH_CANONICAL_BOOK_IDS = [
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy',
  'joshua', 'judges', 'ruth', '1samuel', '2samuel', '1kings', '2kings',
  '1chronicles', '2chronicles', 'ezra', 'nehemiah', 'esther',
  'job', 'psalms', 'proverbs', 'ecclesiastes', 'songofsolomon',
  'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel',
  'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum',
  'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi',
  'matthew-plain', 'matthew', 'mark', 'luke', 'john', 'acts',
  'romans', '1corinthians', '2corinthians', 'galatians',
  'ephesians', 'philippians', 'colossians', '1thessalonians', '2thessalonians',
  '1timothy', '2timothy', 'titus', 'philemon', 'hebrews',
  'james', '1peter', '2peter', '1john', '2john', '3john', 'jude', 'revelation',
];

/** bookId → canonical position, built once from the constant above.
 *  matthew-plain and matthew share a rank (same book, two editions). */
export const SRCH_CANONICAL_BOOK_INDEX = (() => {
  const m = new Map();
  let rank = 0;
  for (const id of SRCH_CANONICAL_BOOK_IDS) {
    if (id === 'matthew') { m.set(id, m.get('matthew-plain') ?? rank); continue; }
    m.set(id, rank++);
  }
  return m;
})();

/**
 * Sort verse-family result items into canonical book order (book, chapter,
 * verse) instead of relevance. Non-verse docs (or verses whose book isn't
 * in the index map) sink to the end, keeping their relative order — the
 * sort is stable.
 *
 * @param {Array<{doc?: {kind?: string, bookId?: string, chapterNum?: number, verseNum?: number}}>} items
 * @param {Map<string, number>} bookIndex - bookId → canonical position
 * @returns {Array<{doc?: {kind?: string, bookId?: string, chapterNum?: number, verseNum?: number}}>} a NEW array (input untouched)
 */
export function srchSortCanonical(items, bookIndex) {
  const rank = (e) => {
    const d = e && e.doc;
    if (!d || !d.bookId || !bookIndex.has(d.bookId)) return null;
    return [bookIndex.get(d.bookId), d.chapterNum || 0, d.verseNum || 0];
  };
  return items
    .map((e, i) => ({ e, i, r: rank(e) }))
    .sort((a, b) => {
      if (a.r === null && b.r === null) return a.i - b.i;
      if (a.r === null) return 1;
      if (b.r === null) return -1;
      return (a.r[0] - b.r[0]) || (a.r[1] - b.r[1]) || (a.r[2] - b.r[2]) || (a.i - b.i);
    })
    .map((x) => x.e);
}

