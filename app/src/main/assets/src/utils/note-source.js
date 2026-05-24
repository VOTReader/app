/* ===================================================================
   Note source-label + source-nav resolution for the Notes index — converts an annotation hlKey into a human label and a navigation endpoint
   ===================================================================
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Bundled helpers (P5e):
   - _bookTitle
   - _verseRangeLabel
   - noteSourceLabel
   - noteSourceNav
   =================================================================== */

/**
 * A multi-key note record from NoteStore. Only the fields these helpers
 * touch are described here; the full shape includes color/body/created/
 * updated/notebookIds and lives in note-store.js (typed in Q4.3).
 *
 * @typedef {{ keys?: string[] }} NoteShape
 */

/**
 * Display title for a Bible book id (e.g. 'genesis' → 'Genesis'). Reads
 * the BIBLE_BOOK_LIST module-global when present; falls back to a
 * naive title-casing of the id (handles hyphens like '1-corinthians').
 *
 * @param {string} bookId
 * @returns {string}
 */
export function _bookTitle(bookId) {
  if (typeof BIBLE_BOOK_LIST !== 'undefined') {
    const b = BIBLE_BOOK_LIST.find(x => x.id === bookId);
    if (b) return b.title;
  }
  // Fallback: title-case the id
  return bookId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

/**
 * Compact verse-range label — collapses contiguous runs ([1,2,3,5] → "1-3, 5").
 * Dedups via Set + sorts numerically.
 *
 * @param {number[]} nums
 * @returns {string}
 */
export function _verseRangeLabel(nums) {
  if (!nums.length) return '';
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts = [];
  let s = sorted[0], p = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === p + 1) { p = sorted[i]; continue; }
    parts.push(s === p ? String(s) : (s + '-' + p));
    s = p = sorted[i];
  }
  parts.push(s === p ? String(s) : (s + '-' + p));
  return parts.join(', ');
}

/**
 * Human-readable label for a note's source — e.g. "Genesis 1:1-3, 5" for a
 * Bible annotation, "The Wide Path" for a Letter, "Journal · Title" for a
 * journal-block annotation. Multi-key notes spanning multiple chapters
 * join with " · ". Falls through to the bare first key on unknown kinds.
 *
 * @param {NoteShape} note
 * @returns {string}
 */
export function noteSourceLabel(note) {
  const keys = note.keys || [];
  if (!keys.length) return 'Note';
  // Group by (kind, primary id, chapter where applicable)
  const first = keys[0];
  const parts0 = first.split(':');
  const kind = parts0[0];
  if (kind === 'bible' || kind === 'study') {
    // Key shapes differ:
    //   bible:bookId:chapter:verse   (4 parts)
    //   study:bookId-chapter:verse   (3 parts — chapter is fused into p[1])
    const byChap = new Map();
    keys.forEach(k => {
      const p = k.split(':');
      let book, chap, verse;
      if (kind === 'study') {
        // p[1] = "matthew-22" (book + chap fused); p[2] = verse
        book = p[1];
        chap = (p[1].match(/-(\d+)$/) || [])[1] || '';
        verse = parseInt(p[2] || '0', 10);
      } else {
        book = p[1];
        chap = p[2];
        verse = parseInt(p[3] || '0', 10);
      }
      const ck = book + ':' + chap;
      if (!byChap.has(ck)) byChap.set(ck, []);
      byChap.get(ck).push(verse);
    });
    const segs = [];
    byChap.forEach((verses, ck) => {
      const [book, chap] = ck.split(':');
      const title = kind === 'bible' ? _bookTitle(book) :
        // study key shape e.g. "matthew-22"; strip off the chapter half
        (function() {
          const m = book.match(/^(.+)-(\d+)$/);
          return m ? (m[1].charAt(0).toUpperCase() + m[1].slice(1)) : book;
        })();
      segs.push(title + ' ' + chap + ':' + _verseRangeLabel(verses.filter(Boolean)));
    });
    return segs.join(' · ');
  }
  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    // The same letter spans multiple block indices — title is enough
    const id = parts0[1];
    if (typeof findEntryContext === 'function') {
      const ctx = findEntryContext(id, kind);
      if (ctx && ctx.title) return ctx.title;
    }
    return id;
  }
  if (kind === 'journal') {
    // journal:<entryId>:<blockIdx>
    const eid = parts0[1];
    const je = (typeof JournalStore !== 'undefined') ? JournalStore.get(eid) : null;
    if (je) {
      const title = (typeof JournalHelpers !== 'undefined' && JournalHelpers.entryDisplayTitle)
        ? (JournalHelpers.entryDisplayTitle(je) || 'Untitled')
        : (je.title || 'Untitled');
      return 'Journal · ' + title;
    }
    return 'Journal Entry';
  }
  return first;
}

/**
 * Resolve a note's first key into a nav endpoint object that the router
 * can consume. Shape varies by kind (`type` discriminator). Returns null
 * when the note has no keys or the kind is unrecognized.
 *
 * @param {NoteShape} note
 * @returns {{
 *   type: 'bible' | 'study' | 'letter' | 'wtlb' | 'blessed' | 'holy-days' | 'journal',
 *   key: string,
 *   bookId?: string,
 *   chapter?: number,
 *   verse?: number,
 *   letterId?: string,
 *   entryId?: string,
 *   screen?: string | null
 * } | null}
 */
export function noteSourceNav(note) {
  const keys = note.keys || [];
  if (!keys.length) return null;
  const k = keys[0];
  const p = k.split(':');
  const kind = p[0];
  if (kind === 'bible') {
    return { type: 'bible', key: k, bookId: p[1], chapter: parseInt(p[2], 10), verse: parseInt(p[3], 10) };
  }
  if (kind === 'study') {
    const m = (p[1] || '').match(/^(.+)-(\d+)$/);
    if (m) return { type: 'study', key: k, bookId: m[1], chapter: parseInt(m[2], 10), verse: parseInt(p[2] || '0', 10) };
  }
  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    // findEntryContext locates the right collection/screen for the entry id.
    const ctx = (typeof findEntryContext === 'function') ? findEntryContext(p[1], kind) : null;
    return {
      type: kind, key: k,
      letterId: p[1], entryId: p[1],
      screen: ctx ? ctx.screen : null
    };
  }
  if (kind === 'journal') {
    return {
      type: 'journal', key: k,
      entryId: p[1],
      screen: 'journal-viewer'
    };
  }
  return null;
}

