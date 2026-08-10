/* ═══════════════════════════════════════════════════════════════════════
   matthew-note-weight — commentary weight per Matthew chapter
   ═══════════════════════════════════════════════════════════════════════
   Bundled into dist/bundle-d.js (imported directly by ChapterIndex and
   screen-routes; it needs no window global).

   BACKLOG [29a], closed by C2-C [C7]. The Matthew Study Bible is two texts
   in one screen: the gospel, and the VOT letter excerpts answering it. Those
   excerpts outweigh the verse text 2.14x across the book and swing from
   NOTHING (chapter 2) to 8.43x (chapter 24) — a reader opening chapter 24
   from the index has no way to know it carries 8,640 words of commentary
   over 1,025 words of verse, and the "~N min" chip cannot tell them.

   THE CONTRACT THAT FORCED A SEPARATE SIGNAL: study panels are excluded from
   countItemWords BY DESIGN (word-count.js, "Matthew study chapters count
   verse text only" — the same call the prophecy cards get, and the DOM read
   detector agrees by never keying them). So the minute chip must not learn
   about notes. This is a SECOND chip, next to it, measuring a different
   thing; nothing here touches the word count.

   MEASURED, NOT COMPUTED. Every value below is
     Σ words in chapter.votNotes[].excerpt  ÷  Σ words in chapter.verses[].text
   over app/src/main/assets/src/data/matthew.js, /\S+/ tokens, the same
   definition countTextWords uses. Reproducing the totals reproduces the
   figures FABLE5-BACKLOG [29a] recorded: 1,071 verses / 23,221 verse words
   vs 627 notes / 49,752 note words = 2.14x, min 0.00x (ch 2), max 8.43x
   (ch 24). It ships as a frozen table rather than a render-time sweep
   because matthew.js is a frozen corpus (CORPUS_VERSION gates any edit) and
   the index paints 28 rows: re-walking ~73k words of corpus on every render
   of a screen whose data cannot change would be pure cost.

   RE-MEASURE IF matthew.js CHANGES — the one-liner that produced it:
     for each chapter: notes = Σ countTextWords(n.excerpt) for n in votNotes
                       verse = Σ countTextWords(v.text)    for v in verses
                       ratio = verse > 0 ? notes / verse : 0
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Chapter number → study-commentary words per word of verse text.
 * Measured 2026-08-10 against matthew.js (corpus c29).
 * @type {Readonly<Record<number, number>>}
 */
export const MATTHEW_NOTE_RATIO = Object.freeze({
  1: 0.49,  2: 0.00,  3: 0.83,  4: 0.35,  5: 1.16,  6: 0.76,  7: 3.58,
  8: 0.61,  9: 0.73, 10: 2.68, 11: 1.18, 12: 0.90, 13: 1.72, 14: 1.15,
  15: 2.32, 16: 3.99, 17: 1.13, 18: 2.63, 19: 4.16, 20: 2.04, 21: 1.94,
  22: 3.35, 23: 4.28, 24: 8.43, 25: 3.90, 26: 1.35, 27: 0.67, 28: 2.11,
});
