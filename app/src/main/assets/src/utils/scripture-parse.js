/* ===================================================================
   Scripture reference parsing — verse range splitting + footnote helpers + echo lookups
   ===================================================================
   Global-scope module. Bundled into bundle-d via _entry-d.js (SC8: was wrongly
   documented as bundle-b — splitIntoVerses & friends are imported by _entry-d).
   Bundled helpers (P5e):
   - firstVerseOfRef
   - parseRefRanges
   - lastVerseOfFirstRange
   - echoVersesForRef
   - getNotesForVerse
   - getEchoesForVerse
   - parseRefRange
   - splitIntoVerses
   =================================================================== */

/**
 * A verse range, optionally with an explicit verse list for comma refs
 * like "7:7, 9, 11" (where the range is [7..11] but verses is [7, 9, 11]).
 *
 * @typedef {{ start: number, end: number, verses?: number[] }} VerseRange
 */

/**
 * Extract the FIRST verse number from a reference string. Strips a leading
 * "N:" chapter prefix if present, then reads the first integer. Used as a
 * lightweight "what verse does this annotation anchor to" lookup.
 *
 * @param {string} refStr  e.g. "12:5-7", "5", "12:5"
 * @returns {number | null}
 */
export function firstVerseOfRef(refStr) {
  const stripped = refStr.replace(/^\d+:\s*/, '').trim();
  const m = stripped.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Parse a reference string into one or more verse ranges. Strips chapter
 * prefix; handles comma-separated ranges like "5, 7-9, 12". Each range
 * has start/end (end === start for single verses).
 *
 * @param {string} refStr
 * @returns {{ start: number, end: number }[]}
 */
export function parseRefRanges(refStr) {
  const stripped = refStr.replace(/^\d+:\s*/, '').trim();
  const parts = stripped.split(/,\s*/);
  const ranges = [];
  for (const p of parts) {
    const m = p.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (m) ranges.push({ start: parseInt(m[1], 10), end: parseInt(m[2] || m[1], 10) });
  }
  return ranges;
}

/**
 * Last verse of the FIRST range in a refStr. For "5-7, 9-11" returns 7;
 * for "5" returns 5. Used by note-attachment logic to decide which verse
 * a footnote sits on.
 *
 * @param {string} refStr
 * @returns {number | null}
 */
export function lastVerseOfFirstRange(refStr) {
  const ranges = parseRefRanges(refStr);
  return ranges.length > 0 ? ranges[0].end : firstVerseOfRef(refStr);
}

/**
 * Echo-verse list: every range END after the first range. For
 * "5-7, 9, 11-12" returns [9, 12] — these are the verses where the
 * footnote should also appear as a small echo marker.
 *
 * @param {string} refStr
 * @returns {number[]}
 */
export function echoVersesForRef(refStr) {
  const ranges = parseRefRanges(refStr);
  if (ranges.length <= 1) return [];
  return ranges.slice(1).map((r) => r.end);
}

/**
 * Notes (scripture refs + Volume of Truth notes) that ANCHOR on a specific
 * verse — i.e. their first range's end === verseNum. Used by the verse
 * gutter to render footnote bubbles.
 *
 * @param {{ scriptures?: any[], votNotes?: any[] }} chapter
 * @param {number} verseNum
 * @returns {{ scriptures: any[], votNotes: any[] }}
 */
export function getNotesForVerse(chapter, verseNum) {
  const scriptures = (chapter.scriptures || []).filter((s) => lastVerseOfFirstRange(s.ref) === verseNum);
  const votNotes = (chapter.votNotes || []).filter((n) => lastVerseOfFirstRange(n.ref) === verseNum);
  return { scriptures, votNotes };
}

/**
 * Notes whose ECHO verses include this verseNum — same shape as
 * getNotesForVerse, but for the secondary attachments.
 *
 * @param {{ scriptures?: any[], votNotes?: any[] }} chapter
 * @param {number} verseNum
 * @returns {{ scriptures: any[], votNotes: any[] }}
 */
export function getEchoesForVerse(chapter, verseNum) {
  const scriptures = (chapter.scriptures || []).filter((s) => echoVersesForRef(s.ref).includes(verseNum));
  const votNotes = (chapter.votNotes || []).filter((n) => echoVersesForRef(n.ref).includes(verseNum));
  return { scriptures, votNotes };
}

/**
 * Parse the verse-range portion of a reference like "Exodus 12:18-20",
 * "Psalm 7:7, 9", or "John 3:16". Returns a VerseRange with explicit
 * `verses` array for comma refs, or just start/end for contiguous.
 * Returns null when the ref has no parsable verse range OR a single
 * verse (the strategy depends on the caller — single verses use
 * firstVerseOfRef).
 *
 * @param {string} ref
 * @returns {VerseRange | null}
 */
export function parseRefRange(ref) {
  // U12: normalize en/em-dash → ASCII hyphen first so a range that slipped the
  // data gate (e.g. "12:18–20") still splits into gold verse numbers instead of
  // rendering white (the renderer only inlays verse-sup when the range parses).
  const clean = ref.replace(/[–—]/g, '-').replace(/\s*\(.*?\)\s*/g, "").trim();
  // Comma-separated verses: "7:7, 9" or "7:7, 9, 11"
  const cm = clean.match(/:(\d+(?:\s*,\s*\d+)+)$/);
  if (cm) {
    const nums = cm[1].split(/\s*,\s*/).map(Number);
    if (nums.length >= 2) return { start: nums[0], end: nums[nums.length - 1], verses: nums };
  }
  const m = clean.match(/:(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  return end > start ? { start, end } : null;
}

/**
 * Split a verse-text block into per-verse segments from its EXPLICIT markers:
 *   - Strategy 0: explicit "N. text" markers (accept the longest valid prefix)
 *   - Strategy 0b: Unicode superscript markers (e.g. "²when ³if")
 * Returns null when the ref has no parsable range OR the range has only one
 * verse. A multi-verse value with NO markers returns a single-element fallback
 * tagged with the start verse — degraded only: all footnote data is required to
 * carry markers (validateFootnoteMarkers in tools/validate-schemas.js gates it),
 * so the old marker-less guessing heuristics (sentence-split / genealogy-comma)
 * are deleted.
 *
 * @param {string} text
 * @param {string} ref
 * @returns {{ vNum: number, text: string }[] | null}
 */
export function splitIntoVerses(text, ref) {
  const range = parseRefRange(ref);
  if (!range) return null;
  // For comma refs like "7:7, 9", use explicit verse list; otherwise contiguous range
  const verseNums = range.verses || Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i);
  const count = verseNums.length;
  if (count < 2) return null;

  // Strategy 0 — explicit "N. text" markers. Lookbehind accepts any
  // whitespace (not just ". "), because verses often end with ";", ",",
  // ":", "?" etc. and the fetcher joins them with a single space. Markers
  // always sit BEFORE any opening quote a verse begins with ("17. “But …"),
  // so whitespace before the marker is sufficient.
  // Accept the LONGEST PREFIX of markers that matches verseNums in order.
  // Partial prefix handles truncated text (e.g. ExpandableVerse's 130-char
  // preview) correctly — we split on what markers we have instead of
  // falling through to Strategy 1, which would treat the leading "13." as
  // verse 13's text.
  const numAlt = verseNums.map(String);
  const markerRx = new RegExp(`(?:^|(?<=\\s))(${numAlt.join('|')})\\.\\s+`, 'g');
  const markers = [];
  let mm;
  while ((mm = markerRx.exec(text)) !== null) {
    markers.push({ vNum: parseInt(mm[1], 10), start: mm.index, markerEnd: mm.index + mm[0].length });
  }
  // SC7 — this consumes only the LONGEST IN-ORDER marker prefix: the first
  // marker whose number doesn't match the expected verse (a missing interior
  // marker, a duplicate "N.", or a first-verse-with-no-marker) ends the run, so
  // any later "N." renders as plain white text instead of a gold verse sup. The
  // validateFootnoteMarkers data gate (pre-commit + CI) is the LOAD-BEARING
  // enforcement layer that keeps shipped corpus data well-formed; this parser
  // degrades gracefully rather than re-deriving markers from guesswork.
  let prefixLen = 0;
  const cap = Math.min(markers.length, count);
  for (let i = 0; i < cap; i++) {
    if (markers[i].vNum !== verseNums[i]) break;
    prefixLen++;
  }
  if (prefixLen > 0) {
    const segments = [];
    for (let i = 0; i < prefixLen; i++) {
      const textStart = markers[i].markerEnd;
      const textEnd = i + 1 < prefixLen ? markers[i + 1].start : text.length;
      const verseText = text.slice(textStart, textEnd).trim();
      segments.push({ vNum: markers[i].vNum, text: verseText });
    }
    return segments;
  }

  // Strategy 0b — Unicode superscript verse numbers (e.g. "text ²when ³if ⁴then").
  // MATTHEW_NKJV entries from bolls.life use these instead of "N. " markers.
  const superMap = { '\u2070': 0, '\u00b9': 1, '\u00b2': 2, '\u00b3': 3, '\u2074': 4, '\u2075': 5, '\u2076': 6, '\u2077': 7, '\u2078': 8, '\u2079': 9 };
  function parseSuperNum(s) {
    let n = 0;
    for (const ch of s) {if (!(ch in superMap)) return -1;n = n * 10 + superMap[ch];}
    return n;
  }
  const superRx = /[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+/g;
  const superMarkers = [];
  let sm;
  while ((sm = superRx.exec(text)) !== null) {
    const vn = parseSuperNum(sm[0]);
    if (verseNums.includes(vn)) {
      superMarkers.push({ vNum: vn, start: sm.index, markerEnd: sm.index + sm[0].length });
    }
  }
  // If first verse has no superscript prefix, add an implicit marker at position 0
  if (superMarkers.length > 0 && superMarkers[0].vNum !== verseNums[0]) {
    superMarkers.unshift({ vNum: verseNums[0], start: 0, markerEnd: 0 });
  }
  if (superMarkers.length === count) {
    let superExact = true;
    for (let i = 0; i < count; i++) {
      if (superMarkers[i].vNum !== verseNums[i]) {superExact = false;break;}
    }
    if (superExact) {
      const segs = [];
      for (let i = 0; i < count; i++) {
        const tStart = superMarkers[i].markerEnd;
        const tEnd = i + 1 < count ? superMarkers[i + 1].start : text.length;
        segs.push({ vNum: superMarkers[i].vNum, text: text.slice(tStart, tEnd).trim() });
      }
      return segs;
    }
  }

  // No explicit markers found. Footnote scripture values are REQUIRED to carry
  // verse markers ("N. " decimals or Unicode superscripts) — enforced by the
  // validateFootnoteMarkers gate in tools/validate-schemas.js, so a marker-less
  // multi-verse value can't ship. If one ever slips through, degrade gracefully
  // by labeling the whole block with its start verse rather than GUESSING at
  // boundaries. (The old sentence-split + genealogy-comma heuristics + their
  // chunk-distribution were deleted — that guessing produced the white /
  // duplicated / mis-numbered footnote renders the data normalization replaced.)
  return [{ vNum: range.start, text }];
}

