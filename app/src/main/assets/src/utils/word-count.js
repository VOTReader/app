/* ═══════════════════════════════════════════════════════════════════════
   word-count — corpus word counting for display + estimates
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-d.js via _entry-d.js.

   ONE definition of "how many words is this item" for every consumer:
   index-card minute estimates, My Progress words-based collection
   progress, autoscroll time-remaining, and the corpus word-count
   baseline gate in tools/validate-schemas.js (which imports this file
   directly so the gate and the app can never disagree).

   COUNTING CONTRACT (deterministic, body-text-only):
     - A "word" is one /\S+/ token. Format-B inline markup counts its
       raw tokens ("_italic_" = 1, "{{ref:Matthew 4:4}}" = 2) — within
       ±1% of the rendered token count, and exactly reproducible, which
       the baseline gate needs more than typographic perfection.
     - Body text ONLY: blocks / paragraphs / verses (+ section headings,
       which are read in-flow). Titles, dates, footnote scripture
       dictionaries, nkjv cite values, URLs, and nav metadata are NOT
       reading-flow text and are excluded.
     - Bible chapters count the BASE (NKJV) text. Translations differ by
       at most ~9.5% total (YLT vs BSB, measured 2026-08-03); minute
       estimates absorb that error rather than paying per-translation
       recomputation on every index render.
     - Matthew study chapters count verse text only (the study panels
       are optional-expansion content, not the reading flow).

   The DOM-side read detector (use-read-tracker.js) deliberately does
   NOT use this module — it weighs segments by rendered textContent so
   it is self-consistent with what is actually on screen.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Count /\S+/ tokens in a string. Null/undefined-safe.
 * @param {*} s
 * @returns {number}
 */
export function countTextWords(s) {
  if (!s) return 0;
  const m = String(s).match(/\S+/g);
  return m ? m.length : 0;
}

/** @param {any} seg  Format-A inline segment */
function segWords(seg) {
  if (!seg || typeof seg !== 'object') return 0;
  // fn markers render as a circled number, stanza-breaks as whitespace —
  // neither is a word the reader reads.
  if (seg.t === 'fn' || seg.t === 'stanza-break') return 0;
  return countTextWords(seg.v);
}

/**
 * @param {any} block  Format-A block
 *
 * Does NOT descend into `prophecy-group` blocks — prophecy cards are
 * supplemental reference, not canonical reading content (~129k words across
 * 132 collapsible groups). The read detector agrees by never keying them;
 * see the contract note atop ui/components/ProphecyCard.jsx. The two sides
 * must be changed together or not at all.
 */
function blockWords(block) {
  if (!block || typeof block !== 'object') return 0;
  let n = 0;
  if (Array.isArray(block.segments)) for (const s of block.segments) n += segWords(s);
  if (Array.isArray(block.lines)) {
    for (const line of block.lines) {
      if (Array.isArray(line)) for (const s of line) n += segWords(s);
    }
  }
  n += countTextWords(block.text);
  return n;
}

/**
 * Words in ONE readable unit — a Format-A letter, a Format-B entry, or
 * a bible chapter (Format C nested or Matthew-study shape). Unknown
 * shapes count 0 (never guess — a wrong estimate is worse than none).
 *
 * @param {any} item
 * @returns {number}
 */
function _countItemWords(item) {
  if (!item || typeof item !== 'object') return 0;

  // Format A letter: { blocks: [...] } (+ optional sectionIntro prose)
  if (Array.isArray(item.blocks)) {
    let n = 0;
    for (const b of item.blocks) n += blockWords(b);
    // sectionIntro is an ARRAY of blocks in every case the corpus actually
    // has (volume-seven "Recompense" + 14 bible-studies chapters); the bare
    // string form is only a legacy/simple shape. String-coercing the array
    // counted the two words of "[object Object]" per block instead of the
    // prose, so ~2.4k words of rendered intro never reached the minute
    // chips, the word-weighted progress bars, or the corpus baseline.
    if (Array.isArray(item.sectionIntro)) for (const b of item.sectionIntro) n += blockWords(b);
    else n += countTextWords(item.sectionIntro);
    return n;
  }

  // Format B entry: { paragraphs: [{ text }] }
  if (Array.isArray(item.paragraphs)) {
    let n = 0;
    for (const p of item.paragraphs) n += countTextWords(p && p.text);
    return n;
  }

  // Bible chapter (books.js nested): { sections: [{ heading, verses: [{ text }] }] }
  // Section headings are CHROME, not reading content (2026-08-04): they are
  // editorial labels the reader can switch off (settings.showSectionHeadings)
  // and tap to hide, and they carry no data-hl-key, so the read detector never
  // measures them. Counting them here made this data-derived total disagree
  // with the DOM-derived one — and unfixably so, since the data cannot know
  // whether the reader has headings on. 2,732 headings / 11,638 words ≈ 1% of
  // the corpus; consistency is worth more than the 1%.
  if (Array.isArray(item.sections)) {
    let n = 0;
    for (const s of item.sections) {
      if (!s || typeof s !== 'object') continue;
      if (Array.isArray(s.verses)) for (const v of s.verses) n += countTextWords(v && v.text);
    }
    return n;
  }

  // Matthew chapter (matthew.js / matthew-plain.js): { verses: [{ text }] }
  if (Array.isArray(item.verses)) {
    let n = 0;
    for (const v of item.verses) n += countTextWords(v && (v.text || v.t));
    return n;
  }

  return 0;
}

// Memo on object identity — corpus items are module-level singletons that
// never mutate, so a WeakMap never goes stale and never leaks (entries die
// with the corpus objects themselves, e.g. on a lazy-corpus unload).
/** @type {WeakMap<object, number>} */
const _memo = new WeakMap();

/**
 * Memoized {@link _countItemWords}. THE public counting entry point.
 * @param {any} item
 * @returns {number}
 */
export function countItemWords(item) {
  if (!item || typeof item !== 'object') return 0;
  const hit = _memo.get(item);
  if (hit !== undefined) return hit;
  const n = _countItemWords(item);
  _memo.set(item, n);
  return n;
}

/**
 * Reading-time estimate in whole minutes, floored at 1. Default pace is
 * 230 wpm (adult prose average); pass the user's measured pace when
 * ReadingStatsStore has one.
 *
 * @param {number} words
 * @param {number} [wpm]
 * @returns {number}
 */
export function readingMinutes(words, wpm) {
  const pace = wpm && wpm > 0 ? wpm : 230;
  if (!words || words <= 0) return 0;
  return Math.max(1, Math.round(words / pace));
}
