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

  // Named passages (Bible — Scriptures corpus only)
  if (allowScriptureRefs && D.NAMED_PASSAGE_INDEX[lower]) {
    const np = D.NAMED_PASSAGE_INDEX[lower];
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
    const volLetterM = lower.match(/^v(?:ol(?:ume)?)?\s+(\w+)\s+(?:l(?:tr|etter)?\s*)?(\w+)?$/);
    if (volLetterM) {
      const volTok = volLetterM[1];
      const letterTok = volLetterM[2];
      const vc = D.VOLUME_TOKEN_MAP['v' + volTok] || D.VOLUME_TOKEN_MAP['volume' + volTok] || D.VOLUME_TOKEN_MAP[volTok];
      if (vc && letterTok) {
        if (letterTok === 'preface' || letterTok === 'intro' || letterTok === '0') {
          return { kind: 'ref-letter', volumeId: vc.id, volumeScreen: vc.screen, letterNum: 0, letterId: null, isPreface: true, label: vc.label + ' · Preface' };
        }
        const lnum = parseWordNum(letterTok);
        if (lnum !== null) return { kind: 'ref-letter', volumeId: vc.id, volumeScreen: vc.screen, letterNum: lnum, letterId: null, label: vc.label + ' · Letter ' + lnum };
      }
    }

    // "WTLB 1:45" / "WTLB1:45" / "WTLB Part 1 Section 45"
    const wtlbM = lower.match(/^wtlb\s*(?:part\s*)?([12])\s*(?::|section|sec|\s)\s*(\d+)$/);
    if (wtlbM) {
      const part = wtlbM[1];
      const sec = parseInt(wtlbM[2], 10);
      const vWtlb = part === '1' ? D.VOLUME_TOKEN_MAP.wtlb1 : D.VOLUME_TOKEN_MAP.wtlb2;
      if (vWtlb && !isNaN(sec)) return { kind: 'ref-letter', volumeId: vWtlb.id, volumeScreen: vWtlb.screen, letterNum: sec, letterId: null, label: vWtlb.label + ' ' + sec };
    }

    // "Words To Live By Part 1 45"
    const wtlbLong = lower.match(/^words\s*to\s*live\s*by(?:\s*part)?\s*([12one two]+)\s*(?::|section|sec|\s)?\s*(\d+)$/);
    if (wtlbLong) {
      const p = wtlbLong[1];
      const n2 = parseInt(wtlbLong[2], 10);
      const vW = (p === '1' || p === 'one') ? D.VOLUME_TOKEN_MAP.wtlb1 : D.VOLUME_TOKEN_MAP.wtlb2;
      if (vW && !isNaN(n2)) return { kind: 'ref-letter', volumeId: vW.id, volumeScreen: vW.screen, letterNum: n2, letterId: null, label: vW.label + ' ' + n2 };
    }

    // Shorthand: LfT 5, LLF 3, LR 10, TB 3, HD 5
    const shorthand = [
      { re: /^(?:lft|timothy|letters\s*from\s*timothy|letter\s*from\s*timothy|lt)\s+(\w+)$/, id: 'timothy' },
      { re: /^(?:llf|flock|little\s*flock|letters\s*to\s*(?:the\s*)?(?:lord[''s]*\s*)?little\s*flock|lf)\s+(\w+)$/, id: 'flock' },
      { re: /^(?:lr|rebuke|lord[''s]*\s*rebuke|a\s*testament\s*against\s*the\s*world)\s+(\w+)$/, id: 'rebuke' },
      { re: /^(?:tb|the\s*blessed|blessed)\s+(\w+)$/, id: 'blessed' },
      { re: /^(?:hd|holy\s*days?)\s+(\w+)$/, id: 'holydays' },
    ];
    for (let s = 0; s < shorthand.length; s++) {
      const m = lower.match(shorthand[s].re);
      if (m) {
        let vcS = null;
        for (let vv = 0; vv < D.VOLUME_COLLECTIONS.length; vv++) if (D.VOLUME_COLLECTIONS[vv].id === shorthand[s].id) vcS = D.VOLUME_COLLECTIONS[vv];
        if (vcS) {
          if (m[1] === 'preface' || m[1] === 'intro') return { kind: 'ref-letter', volumeId: vcS.id, volumeScreen: vcS.screen, letterNum: 0, isPreface: true, label: vcS.label + ' · Preface' };
          const snum = parseWordNum(m[1]);
          if (snum !== null) return { kind: 'ref-letter', volumeId: vcS.id, volumeScreen: vcS.screen, letterNum: snum, label: vcS.label + ' ' + snum };
        }
      }
    }

    // "Letter N" — default to V2, fall back to V1
    const letterOnly = lower.match(/^letter\s+(\w+)$/);
    if (letterOnly) {
      const ln2 = parseWordNum(letterOnly[1]);
      if (ln2 !== null) {
        return { kind: 'ref-letter', volumeId: 'v2', volumeScreen: 'vot-letter', letterNum: ln2, label: 'Volume Two · Letter ' + ln2, fallbackVolumeId: 'v1', fallbackVolumeScreen: 'vot-one-letter' };
      }
    }
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
  }

  return parseTextQuery(q);
}
