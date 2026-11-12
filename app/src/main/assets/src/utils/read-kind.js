/* What the read marks are, so a count can say it in the mock's plain words ("1 letter read") without
   saying something untrue: every mark a letter-like collection's -> 'letter', every mark a chapter ->
   'chapter', a mix (or nothing) -> null. A read key is `${VERSION_ID}:${bid}:${cid}` (useMarkAsRead), and a
   collection's marks use its readKey as the bid; the Bible's use a book id, which no readKey equals. */
/* The read marks a count shows. Settings > Reading progress counts only the books in its table and leaves out
   Answers topics and Hidden Manna items (v1:answers:*, v1:hidden-manna:*; SettingsScreen, sweep v075). The Library's
   Progress line and the Progress screen count the same marks, so one number is said everywhere. */
const UNCOUNTED_READ_BIDS = ['answers', 'hidden-manna'];
/** @param {Record<string, any> | null | undefined} readItems @returns {Record<string, any>} */
export function countedReads(readItems) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of Object.keys(readItems || {})) {
    if (UNCOUNTED_READ_BIDS.indexOf(k.split(':')[1]) === -1) out[k] = /** @type {any} */ (readItems)[k];
  }
  return out;
}

/** @param {Record<string, any> | null | undefined} readItems @returns {'letter' | 'chapter' | null} */
export function readKind(readItems) {
  const keys = Object.keys(readItems || {});
  if (!keys.length) return null;
  const byRead = (typeof COL_BY_READ_KEY !== 'undefined') ? COL_BY_READ_KEY : null;
  if (!byRead) return null;
  let letters = 0;
  for (const k of keys) { if (k.split(':').some((s) => byRead.has(s))) letters++; }
  return letters === keys.length ? 'letter' : letters === 0 ? 'chapter' : null;
}

/** The words after the count: "letter read" / "chapters read", or the mixed form given. */
/** @param {number} n @param {'letter' | 'chapter' | null} kind @param {string} mixedOne @param {string} mixedMany */
export function readWords(n, kind, mixedOne, mixedMany) {
  if (kind) return kind + (n === 1 ? '' : 's') + ' read';
  return n === 1 ? mixedOne : mixedMany;
}
