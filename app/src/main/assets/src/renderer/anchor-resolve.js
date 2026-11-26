/* ═══════════════════════════════════════════════════════════════════════
   anchor-resolve — re-anchor a stored annotation onto the text actually
   on screen right now
   ═══════════════════════════════════════════════════════════════════════
   Bundled into dist/bundle-c.js (the renderer cluster).

   THE PROBLEM (measured 2026-08-04, live, in the running app):

   Bible verse annotations are anchored by `bibleHlKey(bookId, chapter,
   verse)` — which says nothing about WHICH RENDERING of that verse the
   reader marked. The text under that key changes with
   settings.translation (10 options, including the NKJV-R / KJV-R restored-
   Name editions), while the annotation is stored as character offsets
   {start, end} into whatever text was on screen at the time. Change the
   translation and those offsets describe different words:

     NKJV  John 3:16, reader highlights "should not perish" → offsets 92-109
     KJV   at 92-109 → "him should not pe"   (shifted 4; cut mid-word)
     YLT   at 92-109 → "who is believing "   (unrelated text entirely)

   The subtlest form is the restored-Name editions, which this app's reader
   has every reason to choose: NKJV-R renders 1 Corinthians 12:3 as "…calls
   YahuShua…" instead of "…calls Jesus…", six characters longer and twice in
   the verse, so every mark after it shifts by six or twelve. (The
   settings.restoredNames TOGGLE is a different thing and is NOT affected —
   it swaps chapter titles and section headings only, never verse text.)

   THE FIX: every annotation already stores `text` — the exact string the
   reader selected (SelectionToolbar's hlDisplayText). That is enough to
   find the passage again. This module resolves stored offsets against the
   CURRENT text, in three tiers:

     1. VERIFY   text.slice(start,end) === ann.text → nothing changed, use
                 the stored offsets. This is the common case (same
                 translation) and costs one string compare.
     2. EXACT    search for ann.text; if it occurs more than once, take the
                 occurrence NEAREST the stored offset so a repeated phrase
                 ("the LORD") stays where the reader put it.
     3. LOOSE    search again ignoring case, punctuation and whitespace
                 runs — this is what absorbs a translation's comma and
                 quote differences — then map back to raw offsets.
     Tiers 2 and 3 accept only an occurrence on word boundaries
     (i18n-text-n1): "the" never lands inside "there".

   No tier matches ⇒ return null: the wording genuinely differs (the YLT
   case) and there is nothing honest to paint. The caller SKIPS that mark
   rather than painting the wrong words. The stored record is never
   touched, so switching back restores the mark exactly.

   WHY RESOLVE AT RENDER AND NEVER WRITE BACK: the stored offsets are
   correct for the translation they were made in. Rewriting them to match
   whatever is on screen would corrupt the original anchor — and the
   reader's own data is the one thing this app must not lose.
   ═══════════════════════════════════════════════════════════════════════ */

import { isLetterOrDigit } from './word-char.js';

/**
 * Fold text for the LOOSE tier: lowercase, drop punctuation that varies
 * between translations, collapse whitespace runs to one space. Returns the
 * folded string plus a map from folded index → raw index, so a match can be
 * mapped back onto the real text.
 *
 * @param {string} src
 * @returns {{ folded: string, map: number[] }}
 */
function fold(src) {
  var out = '';
  /** @type {number[]} */
  var map = [];
  var lastWasSpace = true;   // leading whitespace never emits
  for (var i = 0; i < src.length; i++) {
    var ch = src.charAt(i);
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ' ') {
      if (!lastWasSpace) { out += ' '; map.push(i); lastWasSpace = true; }
      continue;
    }
    // Punctuation and quote marks are exactly what differs between
    // translations of the same sentence ("the world that He" vs "the
    // world, that he"), so the loose tier ignores them.
    if ('.,;:!?"“”‘’\'()[]—–-…'.indexOf(ch) >= 0) continue;
    out += ch.toLowerCase();
    map.push(i);
    lastWasSpace = false;
  }
  return { folded: out, map: map };
}

/**
 * The occurrence of `needle` in `hay` nearest `target`, -1 for none: keeps a
 * repeated phrase where the reader put it (a tie keeps the earlier one). One
 * search each way from the target, so a long repeat costs no more than a short
 * one and a far occurrence is never missed (mw14 refuter: a scan capped at 64
 * occurrences missed a later, nearer one).
 * @param {string} hay @param {string} needle @param {number} target
 * @param {(at: number) => boolean} [ok] skip an occurrence this refuses (the word-boundary test)
 * @returns {number}
 */
function nearestIndex(hay, needle, target, ok) {
  if (!needle) return -1;
  var t = Math.max(0, Math.min(target, hay.length));
  var after = hay.indexOf(needle, t);
  while (after >= 0 && ok && !ok(after)) after = hay.indexOf(needle, after + 1);
  var before = t > 0 ? hay.lastIndexOf(needle, t - 1) : -1;
  while (before >= 0 && ok && !ok(before)) before = before > 0 ? hay.lastIndexOf(needle, before - 1) : -1;
  if (before < 0) return after;
  if (after < 0) return before;
  return t - before <= after - t ? before : after;
}

/**
 * i18n-text-n1: a re-anchored mark must sit on whole words, so a stored "the" never paints inside "there" and a cut
 * "l" never paints inside "should". A side is held to the boundary only when the stored text begins (or ends) with a
 * letter or digit there; a mark that starts or ends on punctuation is free on that side.
 * @param {string} text @param {string} stored
 * @returns {(rawStart: number, rawEnd: number) => boolean}
 */
function wordBounded(text, stored) {
  var checkLeft = isLetterOrDigit(stored.charAt(0));
  var checkRight = isLetterOrDigit(stored.charAt(stored.length - 1));
  return function (rawStart, rawEnd) {
    if (checkLeft && rawStart > 0 && isLetterOrDigit(text.charAt(rawStart - 1))) return false;
    if (checkRight && rawEnd < text.length && isLetterOrDigit(text.charAt(rawEnd))) return false;
    return true;
  };
}

/**
 * Resolve one stored annotation onto `text`.
 *
 * @param {string} text  the text rendered RIGHT NOW for this hlKey
 * @param {{ start?: number, end?: number, text?: string }} ann  stored record
 * @returns {{ start: number, end: number, exact: boolean } | null}
 *   null ⇒ this mark cannot be placed in this rendering; do not paint it.
 */
export function resolveAnchor(text, ann) {
  if (typeof text !== 'string' || !text.length || !ann) return null;
  var s = Math.max(0, Math.min(Number(ann.start) || 0, text.length));
  var e = Math.max(0, Math.min(Number(ann.end) || 0, text.length));
  var stored = typeof ann.text === 'string' ? ann.text : '';

  // Tier 1 — the offsets still describe the recorded words.
  if (stored && text.slice(s, e) === stored) return { start: s, end: e, exact: true };

  // A record with no stored text predates the text field (or came from an
  // old backup). Clamped offsets are the only information available; keep
  // the historical behavior rather than dropping the reader's mark.
  if (!stored) return s < e ? { start: s, end: e, exact: false } : null;

  // Tier 2 — exact search.
  var bounded = wordBounded(text, stored);
  var at = nearestIndex(text, stored, s, function (i) { return bounded(i, i + stored.length); });
  if (at >= 0) return { start: at, end: at + stored.length, exact: true };

  // Tier 3 — punctuation/case/whitespace-insensitive search.
  var ft = fold(text);
  var fs = fold(stored);
  if (!fs.folded) return null;
  // Map the stored offset into folded space so "nearest" stays meaningful. A
  // start past the last letter maps to the END of folded space, not to 0 (sweep
  // mw14: that sent the mark to the first occurrence).
  var foldedTarget = ft.map.length;
  for (var m = 0; m < ft.map.length; m++) { if (ft.map[m] >= s) { foldedTarget = m; break; } }
  var fLen = fs.folded.length;
  var f = nearestIndex(ft.folded, fs.folded, foldedTarget, function (i) {
    return i + fLen - 1 < ft.map.length && bounded(ft.map[i], ft.map[i + fLen - 1] + 1);
  });
  if (f < 0) return null;
  var rawStart = ft.map[f];
  var lastIdx = f + fLen - 1;
  if (rawStart == null || lastIdx >= ft.map.length) return null;
  var rawEnd = ft.map[lastIdx] + 1;
  if (!(rawStart < rawEnd)) return null;
  return { start: rawStart, end: rawEnd, exact: false };
}
