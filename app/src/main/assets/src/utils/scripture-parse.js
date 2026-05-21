/* ===================================================================
   Scripture reference parsing — verse range splitting + footnote helpers + echo lookups
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
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


export function firstVerseOfRef(refStr) {
  const stripped = refStr.replace(/^\d+:\s*/, '').trim();
  const m = stripped.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

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

export function lastVerseOfFirstRange(refStr) {
  const ranges = parseRefRanges(refStr);
  return ranges.length > 0 ? ranges[0].end : firstVerseOfRef(refStr);
}

export function echoVersesForRef(refStr) {
  const ranges = parseRefRanges(refStr);
  if (ranges.length <= 1) return [];
  return ranges.slice(1).map((r) => r.end);
}

export function getNotesForVerse(chapter, verseNum) {
  const scriptures = (chapter.scriptures || []).filter((s) => lastVerseOfFirstRange(s.ref) === verseNum);
  const votNotes = (chapter.votNotes || []).filter((n) => lastVerseOfFirstRange(n.ref) === verseNum);
  return { scriptures, votNotes };
}

export function getEchoesForVerse(chapter, verseNum) {
  const scriptures = (chapter.scriptures || []).filter((s) => echoVersesForRef(s.ref).includes(verseNum));
  const votNotes = (chapter.votNotes || []).filter((n) => echoVersesForRef(n.ref).includes(verseNum));
  return { scriptures, votNotes };
}

export function parseRefRange(ref) {
  const clean = ref.replace(/\s*\(.*?\)\s*/g, "").trim();
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

export function splitIntoVerses(text, ref) {
  const range = parseRefRange(ref);
  if (!range) return null;
  // For comma refs like "7:7, 9", use explicit verse list; otherwise contiguous range
  const verseNums = range.verses || Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i);
  const count = verseNums.length;
  if (count < 2) return null;

  // Strategy 0 — explicit "N. text" markers. Lookbehind accepts any
  // whitespace (not just ". "), because verses often end with ";", ",",
  // ":", "?" etc. and the fetcher joins them with a single space.
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

  // Strategy 1 — sentence-boundary split (epistles, prophecy, narrative)
  let chunks = text.split(/(?<=[.!?])\s+(?=[A-Z\u201c\u2018])/).filter(Boolean);

  // Strategy 2 — comma-chain genealogy (e.g. Luke 3) — split on ", the "
  if (chunks.length < count) {
    const commaChunks = text.split(/, (?=the )/).filter(Boolean);
    if (commaChunks.length >= count) {
      chunks = commaChunks.map((c, i) => i === 0 ? c : "the " + c);
    }
  }

  // Still not enough — label whole block with start verse only
  if (chunks.length < count) {
    return [{ vNum: range.start, text }];
  }

  const perVerse = Math.floor(chunks.length / count);
  const remainder = chunks.length % count;
  const segments = [];
  let idx = 0;
  for (let v = 0; v < count; v++) {
    const take = perVerse + (v < remainder ? 1 : 0);
    const joined = chunks.slice(idx, idx + take).join(", ");
    segments.push({ vNum: range.start + v, text: joined });
    idx += take;
  }
  return segments;
}

