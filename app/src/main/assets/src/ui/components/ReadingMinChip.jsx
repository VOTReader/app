/* ═══════════════════════════════════════════════════════════════════════
   ReadingMinChip — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   THE index-card reading chip, in one place. Two states:

     "~7 min"              a cold item, at the reader's own measured pace
     "62% · ~3 min left"   an item the read tracker left a frontier inside

   It shipped twice — ChapterIndex and VolumeLetterIndex each carried a
   private `minChip` that had drifted into byte-identical copies — and
   History now wants the same chip on its chapter rows ([26]'s named
   remainder). Three copies is where a shared helper stops being optional,
   so both originals were replaced by calls to this one: the chip a card
   shows and the chip a history row shows cannot disagree, because there is
   only one of them.

   Cross-bundle reads stay exactly as they were: countItemWords /
   readingMinutes (word-count.js, bundle-d) and ReadingStatsStore (bundle-b)
   are resolved as free globals at CALL time and every one is guarded — a
   missing counter hides the chip rather than rendering a wrong number.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The reader's measured words-per-minute, or null when the store hasn't
 * measured one yet (readingMinutes falls back to its 230-wpm default).
 * Hoisted out of the chip so a screen resolves it ONCE per render instead
 * of once per row.
 *
 * @returns {number | null}
 */
export function readingChipWpm() {
  return (typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.measuredWpm === 'function')
    ? ReadingStatsStore.measuredWpm()
    : null;
}

/**
 * The chip for one item, or null when there is nothing honest to show.
 *
 * @param {any} item        corpus item (chapter / letter / entry) to count
 * @param {string | null} [progressKey]  the tracker's `v1:<bookId>:<cid>` key;
 *                          omit (or pass null) for the cold chip only
 * @param {number | null} [wpm]  from {@link readingChipWpm}
 * @returns {any} a JSX <span> or null
 */
export function readingMinChip(item, progressKey = null, wpm = null) {
  if (typeof countItemWords !== 'function' || typeof readingMinutes !== 'function') return null;
  const words = countItemWords(item);
  if (words <= 0) return null;
  if (progressKey && typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.getProgress === 'function') {
    let p = null;
    try { p = ReadingStatsStore.getProgress(progressKey); } catch (_e) { /* stats optional */ }
    if (p && p.b > 0 && p.c && p.c.length > 0 && p.c.length < p.b) {
      const weighted = p.tw > 0 && p.w >= 0 && p.w < p.tw;
      const fraction = weighted ? p.w / p.tw : p.c.length / p.b;
      const pct = Math.min(99, Math.round(fraction * 100));
      const leftWords = weighted ? p.tw - p.w : Math.round(words * (1 - fraction));
      const left = readingMinutes(leftWords, wpm);
      return <span className="idx-min-chip in-progress">{pct}% · ~{left} min left</span>;
    }
  }
  const m = readingMinutes(words, wpm);
  return m > 0 ? <span className="idx-min-chip">~{m} min</span> : null;
}
