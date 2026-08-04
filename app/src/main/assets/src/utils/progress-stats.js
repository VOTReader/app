/* ===================================================================
   progress-stats — reading-progress + annotation aggregation shared by
   SettingsScreen (Mark as Read table) and MyProgressScreen (dashboard)
   ===================================================================
   Global-scope module. Bundled into bundle-d via _entry-d.js and
   window-exposed so bundle-e's SettingsScreen reaches it as a free
   global (bundle-e loads after d).

   Bundled helpers:
   - READ_VERSION_ID
   - progressCorporaReady
   - buildProgressGroups
   - countReadFor
   - groupBooks / tallyGroup
   - annotationSourceForKey / mostAnnotatedSources

   Free-variable deps resolved from window at call time (same contract
   as note-source.js): BOOKS + the VOT letter globals (guarded behind
   progressCorporaReady), colLetterArr, COL_BY_KEY, _matthew, _studies,
   findEntryContext.
   =================================================================== */

import { _bookTitle } from './note-source.js';

/** Key-version prefix for mark-as-read records (`v1:<bookId>:<item>`). */
export const READ_VERSION_ID = 'v1';

/**
 * True once BOTH lazy corpora that the progress groups read from are
 * loaded: BOOKS (bundle-a-bible) for the NT/OT sections and the VOT
 * corpus (bundle-a-vot) for the Volumes section.
 *
 * @returns {boolean}
 */
export function progressCorporaReady() {
  const booksReady = typeof BOOKS !== 'undefined' && !!BOOKS;
  const votReady = (typeof window !== 'undefined' && window.__votCorpus) ? !!window.__votCorpus.loaded : false;
  return !!(booksReady && votReady);
}

/**
 * One tracked source (book / volume / study) inside a progress group.
 * @typedef {{ id: string, label: string, total: number }} ProgressBook
 *
 * @typedef {{ label: string, books: ProgressBook[] }} ProgressGenre
 *
 * @typedef {{ id: string, label: string, genres: ProgressGenre[] }} ProgressGroup
 */

/**
 * The canonical mark-as-read group table — every collection the app
 * tracks read progress for, with per-source totals read live from the
 * corpora. Returns [] until progressCorporaReady() (the totals need
 * BOOKS + the VOT letter globals).
 *
 * @returns {ProgressGroup[]}
 */
export function buildProgressGroups() {
  if (!progressCorporaReady()) return [];
  return [
  {
    id: "volumes", label: "The Volumes of Truth",
    genres: [
    { label: "The Seven Volumes", books: [
      { id: "volume-one", label: "Volume One", total: LETTERS_V1.length },
      { id: "volume-two", label: "Volume Two", total: LETTERS.length },
      ...(LETTERS_V3.length > 0 ? [{ id: "volume-three", label: "Volume Three", total: LETTERS_V3.length }] : []),
      ...(LETTERS_V4.length > 0 ? [{ id: "volume-four", label: "Volume Four", total: LETTERS_V4.length }] : []),
      ...(LETTERS_V5.length > 0 ? [{ id: "volume-five", label: "Volume Five", total: LETTERS_V5.length }] : []),
      ...(LETTERS_V6.length > 0 ? [{ id: "volume-six", label: "Volume Six", total: LETTERS_V6.length }] : []),
      ...(LETTERS_V7.length > 0 ? [{ id: "volume-seven", label: "Volume Seven", total: LETTERS_V7.length }] : [])]
    },
    { label: "Books & Collections", books: [
      ...(LETTERS_TIMOTHY.length > 0 ? [{ id: "letters-timothy", label: "Letters from Timothy", total: LETTERS_TIMOTHY.length }] : []),
      ...(LETTERS_FLOCK.length > 0 ? [{ id: "little-flock", label: "Letters to The Little Flock", total: LETTERS_FLOCK.length + (LETTERS_FLOCK_PREFACE ? 1 : 0) }] : []),
      ...(LETTERS_REBUKE.length > 0 ? [{ id: "lords-rebuke", label: "The Lord's Rebuke", total: LETTERS_REBUKE.length + (LETTERS_REBUKE_PREFACE ? 1 : 0) }] : []),
      ...(colLetterArr(COL_BY_KEY.get('wtlb1')).length > 0 ? [{ id: "wtlb-one", label: "Words To Live By: Part One", total: colLetterArr(COL_BY_KEY.get('wtlb1')).length }] : []),
      ...(colLetterArr(COL_BY_KEY.get('wtlb2')).length > 0 ? [{ id: "wtlb-two", label: "Words To Live By: Part Two", total: colLetterArr(COL_BY_KEY.get('wtlb2')).length }] : []),
      ...(colLetterArr(COL_BY_KEY.get('blessed')).length > 0 ? [{ id: "the-blessed", label: "The Blessed", total: colLetterArr(COL_BY_KEY.get('blessed')).length }] : []),
      ...(colLetterArr(COL_BY_KEY.get('holydays')).length > 0 ? [{ id: "holy-days", label: "Regarding The Holy Days", total: colLetterArr(COL_BY_KEY.get('holydays')).length }] : [])]
    }]
  },
  {
    id: "nt", label: "New Testament",
    genres: [
    { label: "Gospels", books: [
      { id: "matthew-plain", label: "Matthew", total: BOOKS["matthew-plain"].chapters.length },
      { id: "mark", label: "Mark", total: BOOKS.mark.chapters.length },
      { id: "luke", label: "Luke", total: BOOKS.luke.chapters.length },
      { id: "john", label: "John", total: BOOKS.john.chapters.length }]
    },
    { label: "Acts", books: [{ id: "acts", label: "Acts", total: BOOKS.acts.chapters.length }] },
    { label: "Paul's Epistles", books: [
      { id: "romans", label: "Romans", total: BOOKS.romans.chapters.length },
      { id: "1corinthians", label: "1 Corinthians", total: BOOKS["1corinthians"].chapters.length },
      { id: "2corinthians", label: "2 Corinthians", total: BOOKS["2corinthians"].chapters.length },
      { id: "galatians", label: "Galatians", total: BOOKS.galatians.chapters.length },
      { id: "ephesians", label: "Ephesians", total: BOOKS.ephesians.chapters.length },
      { id: "philippians", label: "Philippians", total: BOOKS.philippians.chapters.length },
      { id: "colossians", label: "Colossians", total: BOOKS.colossians.chapters.length },
      { id: "1thessalonians", label: "1 Thessalonians", total: BOOKS["1thessalonians"].chapters.length },
      { id: "2thessalonians", label: "2 Thessalonians", total: BOOKS["2thessalonians"].chapters.length },
      { id: "1timothy", label: "1 Timothy", total: BOOKS["1timothy"].chapters.length },
      { id: "2timothy", label: "2 Timothy", total: BOOKS["2timothy"].chapters.length },
      { id: "titus", label: "Titus", total: BOOKS.titus.chapters.length },
      { id: "philemon", label: "Philemon", total: BOOKS.philemon.chapters.length },
      { id: "hebrews", label: "Hebrews", total: BOOKS.hebrews.chapters.length }]
    },
    { label: "General Epistles", books: [
      { id: "james", label: "James", total: BOOKS.james.chapters.length },
      { id: "1peter", label: "1 Peter", total: BOOKS["1peter"].chapters.length },
      { id: "2peter", label: "2 Peter", total: BOOKS["2peter"].chapters.length },
      { id: "1john", label: "1 John", total: BOOKS["1john"].chapters.length },
      { id: "2john", label: "2 John", total: BOOKS["2john"].chapters.length },
      { id: "3john", label: "3 John", total: BOOKS["3john"].chapters.length },
      { id: "jude", label: "Jude", total: BOOKS.jude.chapters.length }]
    },
    { label: "Revelation", books: [{ id: "revelation", label: "Revelation", total: BOOKS.revelation.chapters.length }] }]
  },
  {
    id: "ot", label: "Old Testament",
    genres: [
    { label: "The Law", books: [
      { id: "genesis", label: "Genesis", total: BOOKS.genesis.chapters.length },
      { id: "exodus", label: "Exodus", total: BOOKS.exodus.chapters.length },
      { id: "leviticus", label: "Leviticus", total: BOOKS.leviticus.chapters.length },
      { id: "numbers", label: "Numbers", total: BOOKS.numbers.chapters.length },
      { id: "deuteronomy", label: "Deuteronomy", total: BOOKS.deuteronomy.chapters.length }]
    },
    { label: "History", books: [
      { id: "joshua", label: "Joshua", total: BOOKS.joshua.chapters.length },
      { id: "judges", label: "Judges", total: BOOKS.judges.chapters.length },
      { id: "ruth", label: "Ruth", total: BOOKS.ruth.chapters.length },
      { id: "1samuel", label: "1 Samuel", total: BOOKS["1samuel"].chapters.length },
      { id: "2samuel", label: "2 Samuel", total: BOOKS["2samuel"].chapters.length },
      { id: "1kings", label: "1 Kings", total: BOOKS["1kings"].chapters.length },
      { id: "2kings", label: "2 Kings", total: BOOKS["2kings"].chapters.length },
      { id: "1chronicles", label: "1 Chronicles", total: BOOKS["1chronicles"].chapters.length },
      { id: "2chronicles", label: "2 Chronicles", total: BOOKS["2chronicles"].chapters.length },
      { id: "ezra", label: "Ezra", total: BOOKS.ezra.chapters.length },
      { id: "nehemiah", label: "Nehemiah", total: BOOKS.nehemiah.chapters.length },
      { id: "esther", label: "Esther", total: BOOKS.esther.chapters.length }]
    },
    { label: "Poetry & Wisdom", books: [
      { id: "job", label: "Job", total: BOOKS.job.chapters.length },
      { id: "psalms", label: "Psalms", total: BOOKS.psalms.chapters.length },
      { id: "proverbs", label: "Proverbs", total: BOOKS.proverbs.chapters.length },
      { id: "ecclesiastes", label: "Ecclesiastes", total: BOOKS.ecclesiastes.chapters.length },
      { id: "songofsolomon", label: "Song of Solomon", total: BOOKS.songofsolomon.chapters.length }]
    },
    { label: "Major Prophets", books: [
      { id: "isaiah", label: "Isaiah", total: BOOKS.isaiah.chapters.length },
      { id: "jeremiah", label: "Jeremiah", total: BOOKS.jeremiah.chapters.length },
      { id: "lamentations", label: "Lamentations", total: BOOKS.lamentations.chapters.length },
      { id: "ezekiel", label: "Ezekiel", total: BOOKS.ezekiel.chapters.length },
      { id: "daniel", label: "Daniel", total: BOOKS.daniel.chapters.length }]
    },
    { label: "Minor Prophets", books: [
      { id: "hosea", label: "Hosea", total: BOOKS.hosea.chapters.length },
      { id: "joel", label: "Joel", total: BOOKS.joel.chapters.length },
      { id: "amos", label: "Amos", total: BOOKS.amos.chapters.length },
      { id: "obadiah", label: "Obadiah", total: BOOKS.obadiah.chapters.length },
      { id: "jonah", label: "Jonah", total: BOOKS.jonah.chapters.length },
      { id: "micah", label: "Micah", total: BOOKS.micah.chapters.length },
      { id: "nahum", label: "Nahum", total: BOOKS.nahum.chapters.length },
      { id: "habakkuk", label: "Habakkuk", total: BOOKS.habakkuk.chapters.length },
      { id: "zephaniah", label: "Zephaniah", total: BOOKS.zephaniah.chapters.length },
      { id: "haggai", label: "Haggai", total: BOOKS.haggai.chapters.length },
      { id: "zechariah", label: "Zechariah", total: BOOKS.zechariah.chapters.length },
      { id: "malachi", label: "Malachi", total: BOOKS.malachi.chapters.length }]
    }]
  },
  {
    id: "studies", label: "Studies",
    genres: [
    { label: "VOT Study Bible", books: [
      { id: "matthew", label: "Matthew Study Bible", total: (_matthew()?.chapters?.length || 0) }]
    },
    ...(_studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).length > 0 ? [{
      label: "Bible Letter Studies",
      books: _studies().filter((s) => !s.locked && s.chapters && s.chapters.length > 0).map((s) => ({
        id: `bible-study-${s.slug}`,
        label: s.title,
        total: s.chapters.length
      }))
    }] : [])]
  }];
}

/**
 * How many items (chapters/letters) of one source the user has marked
 * read — the count of readItems keys under `v1:<bookId>:`.
 *
 * @param {Record<string, any> | null | undefined} readItems
 * @param {string} bookId
 * @returns {number}
 */
export function countReadFor(readItems, bookId) {
  if (!readItems) return 0;
  return Object.keys(readItems).filter((k) => k.startsWith(`${READ_VERSION_ID}:${bookId}:`)).length;
}

/**
 * Flatten a group's genres into one book list.
 *
 * @param {ProgressGroup} group
 * @returns {ProgressBook[]}
 */
export function groupBooks(group) {
  return group.genres.flatMap((gr) => gr.books);
}

/**
 * Read/total rollup for one progress group.
 *
 * @param {Record<string, any> | null | undefined} readItems
 * @param {ProgressGroup} group
 * @returns {{ read: number, total: number }}
 */
export function tallyGroup(readItems, group) {
  const books = groupBooks(group);
  return {
    read: books.reduce((s, b) => s + countReadFor(readItems, b.id), 0),
    total: books.reduce((s, b) => s + b.total, 0),
  };
}

/* ── Words-based progress (2026-08-03, brainstorm reconciliation) ─────
   Item-count progress lies by omission: a 16-word WTLB verse and a
   5,034-word letter both score 1. These helpers weigh the same groups by
   WORDS via countItemWords (word-count.js — the app's single counting
   definition). The item lists mirror buildProgressGroups' sources and the
   readItems key space (`v1:<bookId>:<letter.id | chapter.num>`). Cost:
   the first full pass tokenizes the whole library (memoized WeakMap
   thereafter) — callers MUST run it off the interaction path
   (requestIdleCallback; see MyProgressScreen). */

/**
 * The corpus items behind one ProgressBook id, paired with the id each
 * item uses inside readItems keys. Empty for unknown/unloaded ids.
 * @param {string} bookId
 * @returns {Array<{ item: any, key: string | number }>}
 */
export function bookItemsFor(bookId) {
  const L = (arr) => (arr || []).map((it) => ({ item: it, key: it.id }));
  if (bookId === 'matthew') {
    const matthew = (typeof _matthew === 'function') ? _matthew() : null;
    return matthew && Array.isArray(matthew.chapters)
      ? matthew.chapters.map((ch) => ({ item: ch, key: ch.num }))
      : [];
  }
  if (bookId.indexOf('bible-study-') === 0) {
    const slug = bookId.slice('bible-study-'.length);
    const study = (typeof _studies === 'function')
      ? _studies().find((s) => s && s.slug === slug)
      : null;
    return study && Array.isArray(study.chapters) ? L(study.chapters) : [];
  }
  switch (bookId) {
    case 'volume-one':   return L(typeof LETTERS_V1 !== 'undefined' ? LETTERS_V1 : null);
    case 'volume-two':   return L(typeof LETTERS !== 'undefined' ? LETTERS : null);
    case 'volume-three': return L(typeof LETTERS_V3 !== 'undefined' ? LETTERS_V3 : null);
    case 'volume-four':  return L(typeof LETTERS_V4 !== 'undefined' ? LETTERS_V4 : null);
    case 'volume-five':  return L(typeof LETTERS_V5 !== 'undefined' ? LETTERS_V5 : null);
    case 'volume-six':   return L(typeof LETTERS_V6 !== 'undefined' ? LETTERS_V6 : null);
    case 'volume-seven': return L(typeof LETTERS_V7 !== 'undefined' ? LETTERS_V7 : null);
    case 'letters-timothy': return L(typeof LETTERS_TIMOTHY !== 'undefined' ? LETTERS_TIMOTHY : null);
    case 'little-flock': {
      const arr = L(typeof LETTERS_FLOCK !== 'undefined' ? LETTERS_FLOCK : null);
      if (typeof LETTERS_FLOCK_PREFACE !== 'undefined' && LETTERS_FLOCK_PREFACE) arr.push({ item: LETTERS_FLOCK_PREFACE, key: LETTERS_FLOCK_PREFACE.id });
      return arr;
    }
    case 'lords-rebuke': {
      const arr = L(typeof LETTERS_REBUKE !== 'undefined' ? LETTERS_REBUKE : null);
      if (typeof LETTERS_REBUKE_PREFACE !== 'undefined' && LETTERS_REBUKE_PREFACE) arr.push({ item: LETTERS_REBUKE_PREFACE, key: LETTERS_REBUKE_PREFACE.id });
      return arr;
    }
    case 'wtlb-one':  return L(typeof COL_BY_KEY !== 'undefined' ? colLetterArr(COL_BY_KEY.get('wtlb1')) : null);
    case 'wtlb-two':  return L(typeof COL_BY_KEY !== 'undefined' ? colLetterArr(COL_BY_KEY.get('wtlb2')) : null);
    case 'the-blessed': return L(typeof COL_BY_KEY !== 'undefined' ? colLetterArr(COL_BY_KEY.get('blessed')) : null);
    case 'holy-days': return L(typeof COL_BY_KEY !== 'undefined' ? colLetterArr(COL_BY_KEY.get('holydays')) : null);
    default: {
      // Bible-book ids (incl. matthew-plain): chapters keyed by num.
      const book = (typeof BOOKS !== 'undefined' && BOOKS) ? BOOKS[bookId] : null;
      if (book && Array.isArray(book.chapters)) return book.chapters.map((ch) => ({ item: ch, key: ch.num }));
      return [];
    }
  }
}

/**
 * Words read / words total for one progress group. Heavy on FIRST call
 * (full-library tokenization) — run via requestIdleCallback.
 *
 * @param {Record<string, any> | null | undefined} readItems
 * @param {ProgressGroup} group
 * @returns {{ wordsRead: number, wordsTotal: number }}
 */
export function groupWordStats(readItems, group) {
  if (typeof countItemWords !== 'function') return { wordsRead: 0, wordsTotal: 0 };
  let wordsRead = 0, wordsTotal = 0;
  for (const b of groupBooks(group)) {
    for (const { item, key } of bookItemsFor(b.id)) {
      const w = countItemWords(item);
      wordsTotal += w;
      if (readItems && readItems[`${READ_VERSION_ID}:${b.id}:${key}`]) wordsRead += w;
    }
  }
  return { wordsRead, wordsTotal };
}

/**
 * True when the id belongs to Hidden Manna — the one collection that
 * must never surface in a public list (owner policy). Registry-driven:
 * membership in COL_BY_KEY.get('hm')'s letter array, not a label match.
 *
 * @param {string} id
 * @returns {boolean}
 */
function _isHiddenMannaId(id) {
  if (typeof COL_BY_KEY === 'undefined' || !COL_BY_KEY.get) return false;
  const hm = COL_BY_KEY.get('hm');
  if (!hm) return false;
  const arr = (typeof colLetterArr === 'function') ? colLetterArr(hm) : [];
  return arr.some((e) => e && e.id === id);
}

/**
 * Resolve one AnnotationStore hlKey to the source DOCUMENT it marks —
 * the grouping unit for the "Most Annotated" list. Titles resolve the
 * same way noteSourceLabel does (via _bookTitle / findEntryContext).
 * Returns null for keys that must stay out of the list: journal blocks,
 * Hidden Manna, and letter/entry ids the loaded corpora can't resolve.
 *
 * @param {string} hlKey
 * @returns {{ key: string, label: string, collection: string } | null}
 */
export function annotationSourceForKey(hlKey) {
  const p = String(hlKey || '').split(':');
  const kind = p[0];
  if (kind === 'bible') {
    if (!p[1]) return null;
    return { key: 'bible:' + p[1], label: _bookTitle(p[1]), collection: 'Scripture' };
  }
  if (kind === 'study') {
    // study:<bookId>-<chapter>:<verse> — the Matthew Study Bible reader.
    const m = (p[1] || '').match(/^(.+)-(\d+)$/);
    if (!m) return null;
    const book = m[1];
    return { key: 'study:' + book, label: book.charAt(0).toUpperCase() + book.slice(1), collection: 'Study Bible' };
  }
  if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
    const id = p[1];
    if (!id || _isHiddenMannaId(id)) return null;
    const ctx = (typeof findEntryContext === 'function') ? findEntryContext(id, kind) : null;
    if (!ctx || !ctx.title) return null;
    return { key: kind + ':' + id, label: ctx.title, collection: ctx.collection || '' };
  }
  // journal:<entryId>:<blockIdx> + unknown kinds — not a book/letter.
  return null;
}

/**
 * The user's most-annotated books/letters: AnnotationStore's map grouped
 * by source document, counting DISTINCT annotation groups (a multi-verse
 * highlight spanning several keys counts once), sorted by count desc
 * (title asc on ties), capped at `limit`.
 *
 * @param {Record<string, { id: string, groupId?: string }[]> | null | undefined} annData
 * @param {number} [limit]
 * @returns {{ key: string, label: string, collection: string, count: number }[]}
 */
export function mostAnnotatedSources(annData, limit = 5) {
  if (!annData || typeof annData !== 'object') return [];
  /** @type {Map<string, { label: string, collection: string, ids: Set<string> }>} */
  const groups = new Map();
  Object.keys(annData).forEach((hlKey) => {
    const segs = annData[hlKey];
    if (!Array.isArray(segs) || segs.length === 0) return;
    const src = annotationSourceForKey(hlKey);
    if (!src) return;
    let g = groups.get(src.key);
    if (!g) {
      g = { label: src.label, collection: src.collection, ids: new Set() };
      groups.set(src.key, g);
    }
    segs.forEach((a) => { if (a) g.ids.add(a.groupId || a.id); });
  });
  return [...groups.entries()]
    .map(([key, g]) => ({ key, label: g.label, collection: g.collection, count: g.ids.size }))
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label))
    .slice(0, limit);
}
