/* ═══════════════════════════════════════════════════════════════════════
   search/ref-parser.js — structured reference + command parser
   ═══════════════════════════════════════════════════════════════════════
   Classifies a raw query into a structured destination BEFORE any full-text
   search runs. Returns one of:
     { kind:'command', action, label }
     { kind:'ref-bible', bookId, bookTitle, chapter, verseStart?, verseEnd?, chapterEnd? }
     { kind:'ref-letter', volumeId, letterNum?, letterId?, label, ... }
     { kind:'ref-book', bookId, bookTitle }
     { kind:'named-passage', bookId, bookTitle, chapter, ... , label }
     (else) the TextQuery from query-parse.js
   Ported from the FlexSearch engine's parse()/resolveBookToken()/
   fuzzyBookSuggest()/levenshtein()/parseWordNum(). Reads the shared lookup
   tables via searchData() (single source of truth — see search-data.js).
   ═══════════════════════════════════════════════════════════════════════ */

import { searchData } from './search-data.js';
import { parseTextQuery } from './query-parse.js';

/* NAMED PASSAGES AS READERS TYPE THEM (search audit 2026-09-27). A passage was found
   only by a key typed exactly as it is written, so "the lord's prayer", "the ten
   commandments", "10 commandments", "lord’s prayer" with a curly apostrophe and "the
   beatitudes" found no card (the last was "corrected" to platitudes). A key and a
   query now meet in one shape (passageKey). */
const PASSAGE_SKIP = new Set(['the', 'a', 'an', 'of', 'on', 'in', 'to', 'and']);

/**
 * A named-passage key or a query in the shape they are matched in: lower case, the
 * apostrophes gone, the little words (the, a, an, of, on, in, to, and) dropped, a
 * number word as its digits. "The Lord’s Prayer" and "lords prayer" are one key;
 * "the ten commandments" and "10 commandments" another.
 * @param {string} s
 * @returns {string}
 */
export function passageKey(s) {
  const D = searchData();
  const words = String(s || '').toLowerCase().replace(/['\u2018\u2019]/g, '').split(/[^a-z0-9]+/);
  const out = [];
  for (const w of words) {
    if (!w || PASSAGE_SKIP.has(w)) continue;
    out.push(D.WORD_NUMS && Object.prototype.hasOwnProperty.call(D.WORD_NUMS, w) ? String(D.WORD_NUMS[w]) : w);
  }
  return out.join(' ');
}

/** @type {WeakMap<object, Map<string, any>>} each passage list's keys, in passageKey's shape */
const PASSAGE_BY_KEY = new WeakMap();

/**
 * The named passage a query names, typed any of the ways passageKey folds; null when none.
 * @param {string} q
 * @returns {any}
 */
function namedPassageFor(q) {
  const D = searchData();
  const exact = D.NAMED_PASSAGE_INDEX && D.NAMED_PASSAGE_INDEX[q.toLowerCase()];
  if (exact) return exact;
  const list = D.NAMED_PASSAGES;
  if (!list || !list.length) return null;
  let byKey = PASSAGE_BY_KEY.get(list);
  if (!byKey) {
    byKey = new Map();
    for (const np of list) for (const k of np.keys || []) {
      const pk = passageKey(k);
      if (pk && !byKey.has(pk)) byKey.set(pk, np);
    }
    PASSAGE_BY_KEY.set(list, byKey);
  }
  const key = passageKey(q);
  return (key && byKey.get(key)) || null;
}

/** The books of one chapter: a lone number after one of them names a verse (v07-01). */
const ONE_CHAPTER_BOOKS = new Set(['obadiah', 'philemon', '2john', '3john', 'jude']);

/**
 * Resolve a word/roman/arabic numeral token to a number.
 * @param {string} s
 * @returns {number|null}
 */
export function parseWordNum(s) {
  if (!s) return null;
  s = s.trim().toLowerCase();
  const n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  const D = searchData();
  if (Object.prototype.hasOwnProperty.call(D.WORD_NUMS, s)) return D.WORD_NUMS[s];
  if (Object.prototype.hasOwnProperty.call(D.ROMAN_NUMS, s)) return D.ROMAN_NUMS[s];
  return null;
}

/**
 * Resolve a book-name token (with space/number-prefix tolerances) to a book id.
 * @param {string} raw
 * @returns {string|null}
 */
export function resolveBookToken(raw) {
  if (!raw) return null;
  const D = searchData();
  const t = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (D.BOOK_ABBREVS[t]) return D.BOOK_ABBREVS[t];
  const collapsed = t.replace(/\s+/g, '');
  if (D.BOOK_ABBREVS[collapsed]) return D.BOOK_ABBREVS[collapsed];
  const spaced = t.replace(/^([123])([a-z])/, '$1 $2');
  if (D.BOOK_ABBREVS[spaced]) return D.BOOK_ABBREVS[spaced];
  return null;
}

/**
 * Bounded Levenshtein edit distance; returns cap+1 once it provably exceeds cap.
 * @param {string} a
 * @param {string} b
 * @param {number} [cap=3]
 * @returns {number}
 */
export function levenshtein(a, b, cap) {
  cap = cap || 3;
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j2 = 1; j2 <= b.length; j2++) {
      const c = a[i - 1] === b[j2 - 1] ? 0 : 1;
      const v = Math.min(prev[j2] + 1, cur[j2 - 1] + 1, prev[j2 - 1] + c);
      cur[j2] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Suggest the closest book id for a likely-mistyped book name (≤2 edits).
 * @param {string} raw
 * @returns {string|null}
 */
export function fuzzyBookSuggest(raw) {
  if (!raw || raw.length < 2) return null;
  const D = searchData();
  const t = raw.toLowerCase();
  let bestId = null;
  let bestScore = Infinity;
  const keys = Object.keys(D.BOOK_ABBREVS);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k.length < 2) continue;
    const d = levenshtein(t, k, 2);
    if (d < bestScore) { bestScore = d; bestId = D.BOOK_ABBREVS[k]; }
    if (bestScore === 0) break;
  }
  return bestScore <= 2 ? bestId : null;
}

/* A LETTER AS READERS NAME IT (search audit 2026-09-27). "Volume Seven, Letter 55",
   "Vol. 7 Letter 55", "v7 55", "v7:55", "letter 55 volume 7", "volume 7 #55", "Volume
   Three Letter Twenty Two", "v7 preface", "Timothy letter 3", "Lord's Little Flock 2",
   "The Lord's Rebuke 1" and "WTLB 95" each found nothing; "words to live by 95" opened
   Part Two (a character class, [12one two], read the space as the part); and a curly
   apostrophe ("Lord’s Rebuke 1") missed. */
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

/**
 * A letter reference in the shape the letter patterns read: apostrophes straight,
 * "twenty two" as 22, "55th" as 55, punctuation and "no." / "number" / "#" as space.
 * @param {string} lower
 * @returns {string}
 */
export function letterShape(lower) {
  return String(lower)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g,
      (m, t, o) => String(TENS[/** @type {keyof typeof TENS} */ (t)] + ONES[/** @type {keyof typeof ONES} */ (o)]))
    .replace(/(\d)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/[.,;:#()!?]+/g, ' ')
    .replace(/\b(?:no|number)\s+(?=\d)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A volume named by a number or a number word ("7", "seven") as its collection. */
function volumeOf(/** @type {string} */ tok) {
  const D = searchData();
  const n = parseWordNum(tok);
  if (n !== null) return D.VOLUME_TOKEN_MAP['v' + n] || null;
  return D.VOLUME_TOKEN_MAP[tok] || null;
}

/** The reference to letter `tok` (a number, a number word, "preface") of `vc`, or null. */
function letterIn(/** @type {any} */ vc, /** @type {string} */ tok, /** @type {string} */ sep) {
  if (/^(?:preface|intro|introduction|0)$/.test(tok)) {
    return { kind: 'ref-letter', volumeId: vc.id, volumeScreen: vc.screen, letterNum: 0, letterId: null, isPreface: true, label: vc.label + ' · Preface' };
  }
  const n = parseWordNum(tok);
  if (n === null) return null;
  return { kind: 'ref-letter', volumeId: vc.id, volumeScreen: vc.screen, letterNum: n, letterId: null, label: vc.label + sep + n };
}

/** The collections named in words, and the words that name them (after letterShape). */
const COLLECTION_REFS = [
  { re: /^(?:the )?(?:lft|lt|timothy|letters? (?:from|of) timothy) (?:(?:letter|ltr|l) ?)?([a-z]+|\d+)$/, id: 'timothy' },
  { re: /^(?:the )?(?:llf|lf|flock|(?:letters? to )?(?:the )?(?:lord'?s )?little flock) (?:(?:letter|ltr|l) ?)?([a-z]+|\d+)$/, id: 'flock' },
  { re: /^(?:the )?(?:lr|rebuke|lord'?s rebuke|a testament against the world(?: the lord'?s rebuke)?) (?:(?:letter|ltr|l) ?)?([a-z]+|\d+)$/, id: 'rebuke' },
  { re: /^(?:tb|the blessed|blessed) (?:(?:letter|ltr|l|entry) ?)?([a-z]+|\d+)$/, id: 'blessed' },
  { re: /^(?:hd|holy ?days?) (?:(?:letter|ltr|l|entry|day) ?)?([a-z]+|\d+)$/, id: 'holydays' },
];

/**
 * A letter reference in letterShape's form, or null: a volume and a letter either
 * way round ("volume 7 letter 55", "v7 55", "letter 55 volume 7", "v7 preface"), a
 * collection named in words ("timothy letter 3", "the lord's rebuke 1"), Words To Live
 * By with or without its part ("wtlb 1 45", "wtlb part one 95"; "wtlb 95" is Part
 * One's), or a letter alone ("letter 55": every collection holding it, SearchScreen).
 * @param {string} lv
 * @returns {Object|null}
 */
export function parseLetterRef(lv) {
  const D = searchData();
  let m = lv.match(/^(?:volume|vol|v) ?([a-z]+|\d+) (?:(?:letter|ltr|l) ?)?([a-z]+|\d+)$/);
  if (m) {
    const vc = volumeOf(m[1]);
    const r = vc && letterIn(vc, m[2], ' · Letter ');
    if (r) return r;
  }
  m = lv.match(/^(?:(?:letter|ltr|l) ?([a-z]+|\d+)|(preface|introduction|intro)) (?:(?:of|in|from|to) )?(?:the )?(?:volume|vol|v) ?([a-z]+|\d+)$/);
  if (m) {
    const vc = volumeOf(m[3]);
    const r = vc && letterIn(vc, m[1] || m[2], ' · Letter ');
    if (r) return r;
  }
  for (const c of COLLECTION_REFS) {
    const cm = lv.match(c.re);
    if (!cm) continue;
    const vc = D.VOLUME_COLLECTIONS.find((v) => v.id === c.id);
    const r = vc && letterIn(vc, cm[1], ' ');
    if (r) return r;
  }
  m = lv.match(/^(?:wtlb|words to live by) ?(?:part ?)?(1|2|one|two|i|ii) (?:(?:section|sec|entry) ?)?(\d+)$/)
    || lv.match(/^(?:wtlb|words to live by) (?:(?:section|sec|entry) ?)?()(\d+)$/);
  if (m) {
    const partTwo = m[1] === '2' || m[1] === 'two' || m[1] === 'ii';
    const vW = partTwo ? D.VOLUME_TOKEN_MAP.wtlb2 : D.VOLUME_TOKEN_MAP.wtlb1;
    const n = parseInt(m[2], 10);
    if (vW) return { kind: 'ref-letter', volumeId: vW.id, volumeScreen: vW.screen, letterNum: n, letterId: null, label: vW.label + ' ' + n };
  }
  // "Letter N" alone: every collection that holds a letter N (SearchScreen offers each);
  // Volume Two is the card until the collections' letters are loaded.
  m = lv.match(/^(?:letter|ltr) ([a-z]+|\d+)$/);
  if (m) {
    const n = parseWordNum(m[1]);
    if (n !== null) return { kind: 'ref-letter', anyVolume: true, volumeId: 'v2', volumeScreen: 'vot-letter', letterNum: n, letterId: null, label: 'Letter ' + n };
  }
  return null;
}

/**
 * Parse a raw query into a structured reference / command, or fall through to a
 * free-text query (query-parse.js). `parseOpts.corpus` gates which reference
 * families are eligible ('all' | 'scriptures' | 'volumes').
 * @param {string} query
 * @param {{corpus?: string}} [parseOpts]
 * @returns {Object|null}
 */
export function parseReference(query, parseOpts) {
  if (!query) return null;
  const q = query.trim();
  if (!q) return null;
  const D = searchData();
  const lower = q.toLowerCase();
  const pCorpus = (parseOpts && parseOpts.corpus) || 'all';
  const allowScriptureRefs = (pCorpus === 'all' || pCorpus === 'scriptures');
  const allowVolumeRefs = (pCorpus === 'all' || pCorpus === 'volumes');

  // Command palette
  if (D.COMMAND_MAP[lower]) {
    const cmd = D.COMMAND_MAP[lower];
    return { kind: 'command', action: cmd.action, label: cmd.label };
  }

  // ═══ Volume / Letter refs — VOLUMES corpus only ═══
  if (allowVolumeRefs) {
    // Compact: V2L5, V10L3, Vol2L5
    const compactVol = lower.match(/^v(?:ol(?:ume)?)?\s*(\d+)\s*l(?:tr|etter)?\s*(\d+)$/);
    if (compactVol) {
      const cvn = parseInt(compactVol[1], 10);
      const cln = parseInt(compactVol[2], 10);
      const cvc = D.VOLUME_TOKEN_MAP['v' + cvn] || D.VOLUME_TOKEN_MAP['volume' + cvn];
      if (cvc && !isNaN(cln)) return { kind: 'ref-letter', volumeId: cvc.id, volumeScreen: cvc.screen, letterNum: cln, letterId: null, label: cvc.label + ' · Letter ' + cln };
    }
    // Slash: 1/5 vol
    const slashVol = lower.match(/^(\d+)\/(\d+)\s*vol?$/);
    if (slashVol) {
      const svn = parseInt(slashVol[1], 10);
      const sln = parseInt(slashVol[2], 10);
      const svc = D.VOLUME_TOKEN_MAP['v' + svn];
      if (svc && !isNaN(sln)) return { kind: 'ref-letter', volumeId: svc.id, volumeScreen: svc.screen, letterNum: sln, letterId: null, label: svc.label + ' · Letter ' + sln };
    }
    // Dot: V2.5
    const dotVol = lower.match(/^v(?:ol(?:ume)?)?\s*(\d+)\.(\d+)$/);
    if (dotVol) {
      const dvn = parseInt(dotVol[1], 10);
      const dln = parseInt(dotVol[2], 10);
      const dvc = D.VOLUME_TOKEN_MAP['v' + dvn];
      if (dvc && !isNaN(dln)) return { kind: 'ref-letter', volumeId: dvc.id, volumeScreen: dvc.screen, letterNum: dln, letterId: null, label: dvc.label + ' · Letter ' + dln };
    }
    const letterRef = parseLetterRef(letterShape(lower));
    if (letterRef) return letterRef;
  } // end allowVolumeRefs

  if (!allowScriptureRefs) {
    return parseTextQuery(q); // Volumes corpus — skip bible-ref parsing
  }

  // Bible ref — "Rom 8:28", "Romans 8", "John 14:1-16:33", "Gen 1-3", "Rom8:28", …
  const qNorm = q.replace(/[.,\s]+/g, ' ').replace(/\s*:\s*/g, ':').replace(/\s*-\s*/g, '-').trim();
  const qExp = qNorm.replace(/^([0-3]?[a-z]+)(\d)/i, '$1 $2');
  const toks = qExp.split(/\s+/);
  for (let tk = Math.min(toks.length, 4); tk >= 1; tk--) {
    const attempt = toks.slice(0, tk).join(' ').toLowerCase();
    const bookId = resolveBookToken(attempt);
    if (!bookId) continue;
    const rest = toks.slice(tk).join(' ').trim();
    const bookTitle = D.BOOK_DISPLAY[bookId] || bookId;
    if (!rest) return { kind: 'ref-book', bookId, bookTitle };
    const rangeM = rest.match(/^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
    if (rangeM) {
      const ch = parseInt(rangeM[1], 10);
      const vs = rangeM[2] ? parseInt(rangeM[2], 10) : null;
      const ch2v = rangeM[3] ? parseInt(rangeM[3], 10) : null;
      const vs2 = rangeM[4] ? parseInt(rangeM[4], 10) : null;
      // A one-chapter book: "Jude 3" / "Jude 3-5" name VERSES of its one chapter,
      // as readers cite them. Read as a chapter it opened a blank screen (v07-01).
      if (vs === null && vs2 === null && ONE_CHAPTER_BOOKS.has(bookId)) {
        return ch2v !== null
          ? { kind: 'ref-bible', bookId, bookTitle, chapter: 1, verseStart: ch, verseEnd: ch2v }
          : { kind: 'ref-bible', bookId, bookTitle, chapter: 1, verseStart: ch };
      }
      if (vs === null && ch2v !== null && vs2 === null) {
        return { kind: 'ref-bible', bookId, bookTitle, chapter: ch, chapterEnd: ch2v };
      }
      if (vs !== null && ch2v !== null && vs2 === null) {
        return { kind: 'ref-bible', bookId, bookTitle, chapter: ch, verseStart: vs, verseEnd: ch2v };
      }
      if (vs !== null && ch2v !== null && vs2 !== null) {
        return { kind: 'ref-bible', bookId, bookTitle, chapter: ch, verseStart: vs, chapterEnd: ch2v, verseEndChapter: vs2 };
      }
      if (vs !== null && ch2v === null) {
        return { kind: 'ref-bible', bookId, bookTitle, chapter: ch, verseStart: vs };
      }
      return { kind: 'ref-bible', bookId, bookTitle, chapter: ch };
    }
    // Chapter and verse without the colon: "John 3 16", "John 3.16" (qNorm made the
    // '.' a space), "john 3v16", "John 3 16-18". These fell through to a text
    // search of the digits (v07-05).
    const cvM = rest.match(/^(\d+)(?: |v)(\d+)(?:-(\d+))?$/i);
    if (cvM) {
      const ch = parseInt(cvM[1], 10);
      const vs = parseInt(cvM[2], 10);
      const ve = cvM[3] ? parseInt(cvM[3], 10) : null;
      return ve !== null
        ? { kind: 'ref-bible', bookId, bookTitle, chapter: ch, verseStart: vs, verseEnd: ve }
        : { kind: 'ref-bible', bookId, bookTitle, chapter: ch, verseStart: vs };
    }
  }

  // Named passages (Bible — Scriptures corpus only), after the references: "Psalm 23"
  // and "Isaiah 7" are the chapters typed (the key "isaiah 7" opened verse 14 instead).
  const np = namedPassageFor(q);
  if (np) {
    return {
      kind: 'named-passage',
      bookId: np.bookId,
      bookTitle: D.BOOK_DISPLAY[np.bookId] || np.bookId,
      chapter: np.chapter,
      chapterEnd: np.chapterEnd || null,
      verseStart: np.verseStart || null,
      verseEnd: np.verseEnd || null,
      label: q,
    };
  }

  return parseTextQuery(q);
}
