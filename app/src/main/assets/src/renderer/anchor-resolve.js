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

   No tier matches ⇒ return null: the wording genuinely differs (the YLT
   case) and there is nothing honest to paint. The caller SKIPS that mark
   rather than painting the wrong words. The stored record is never
   touched, so switching back restores the mark exactly.

   WHY RESOLVE AT RENDER AND NEVER WRITE BACK: the stored offsets are
   correct for the translation they were made in. Rewriting them to match
   whatever is on screen would corrupt the original anchor — and the
   reader's own data is the one thing this app must not lose.
   ═══════════════════════════════════════════════════════════════════════ */

/** Cap on scanned occurrences — a pathological repeat can't spin the paint path. */
var MAX_OCCURRENCES = 64;

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

/** All indices of `needle` in `hay`, bounded. @returns {number[]} */
function allIndices(hay, needle) {
  /** @type {number[]} */
  var hits = [];
  if (!needle) return hits;
  var i = hay.indexOf(needle);
  while (i !== -1 && hits.length < MAX_OCCURRENCES) {
    hits.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return hits;
}

/** The hit nearest `target` — keeps a repeated phrase where the reader put it. */
function nearest(hits, target) {
  var best = hits[0];
  for (var i = 1; i < hits.length; i++) {
    if (Math.abs(hits[i] - target) < Math.abs(best - target)) best = hits[i];
  }
  return best;
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
  var hits = allIndices(text, stored);
  if (hits.length) {
    var at = nearest(hits, s);
    return { start: at, end: at + stored.length, exact: true };
  }

  // Tier 3 — punctuation/case/whitespace-insensitive search.
  var ft = fold(text);
  var fs = fold(stored);
  if (!fs.folded) return null;
  var fhits = allIndices(ft.folded, fs.folded);
  if (!fhits.length) return null;
  // Map the stored offset into folded space so "nearest" stays meaningful.
  var foldedTarget = 0;
  for (var m = 0; m < ft.map.length; m++) { if (ft.map[m] >= s) { foldedTarget = m; break; } }
  var f = nearest(fhits, foldedTarget);
  var rawStart = ft.map[f];
  var lastIdx = f + fs.folded.length - 1;
  if (rawStart == null || lastIdx >= ft.map.length) return null;
  var rawEnd = ft.map[lastIdx] + 1;
  if (!(rawStart < rawEnd)) return null;
  return { start: rawStart, end: rawEnd, exact: false };
}
