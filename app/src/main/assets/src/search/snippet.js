/* ═══════════════════════════════════════════════════════════════════════
   search/snippet.js — result snippet + highlight-span generation
   ═══════════════════════════════════════════════════════════════════════
   Pure text helpers consumed by the result cards. Both are archaic-aware: a
   "you" query centers/highlights "thee"/"thou"/"ye" in the displayed verse.
   Ported verbatim from the FlexSearch engine.
   ═══════════════════════════════════════════════════════════════════════ */

import { expandArchaicTerms } from './tokenize.js';

/* Whole words only (2026-09-22). The engine tokenises on word boundaries, so a term
   found INSIDE another word ("one" in "everyone", "love" in "Beloved") is never what
   it matched on. A hit starts where a word starts and is marked to the word's end
   ("loves", "lovest" whole); a snippet opens and closes between words. */
const WORD_CHAR = /[\p{L}\p{N}]/u;
/** @param {string} text @param {number} i */
function startsWord(text, i) { return i === 0 || !WORD_CHAR.test(text[i - 1]); }
/** @param {string} text @param {number} i */
function insideWord(text, i) { return i > 0 && i < text.length && WORD_CHAR.test(text[i - 1]) && WORD_CHAR.test(text[i]); }

/**
 * The ~maxLen-wide window covering the MOST DISTINCT query terms — the passage
 * where the query words actually cluster (the remembered phrase), not the
 * first stray hit of one common word. Ties resolve to the earliest window.
 * Archaic-aware (a "you" query finds "thee"/"thou"/"ye"). Null when no term
 * occurs in the text.
 * @param {string} text
 * @param {string[]} terms
 * @param {number} maxLen
 * @returns {{ start: number, span: number } | null}
 */
export function bestMatch(text, terms, maxLen) {
  if (!text || !terms || !terms.length) return null;
  const expanded = expandArchaicTerms(terms);
  const lower = text.toLowerCase();
  // Collect EVERY occurrence of every matchable term (capped for long bodies).
  const occ = [];
  for (let i = 0; i < expanded.length; i++) {
    const t = expanded[i].toLowerCase();
    if (t.length < 2) continue;
    let idx = lower.indexOf(t);
    while (idx >= 0 && occ.length < 400) {
      if (startsWord(lower, idx)) occ.push({ idx, len: t.length, term: t });
      idx = lower.indexOf(t, idx + t.length);
    }
  }
  if (!occ.length) return null;
  occ.sort((a, b) => a.idx - b.idx);
  let bestStart = occ[0].idx;
  let bestCount = 0;
  let bestSpan = occ[0].len;
  for (let s = 0; s < occ.length; s++) {
    const winStart = occ[s].idx;
    const seen = Object.create(null);
    let count = 0;
    let spanEnd = winStart + occ[s].len;
    for (let e = s; e < occ.length && (occ[e].idx + occ[e].len) <= winStart + maxLen; e++) {
      if (!seen[occ[e].term]) { seen[occ[e].term] = true; count++; }
      spanEnd = occ[e].idx + occ[e].len;
    }
    if (count > bestCount) { bestCount = count; bestStart = winStart; bestSpan = spanEnd - winStart; }
  }
  return { start: bestStart, span: bestSpan };
}

/**
 * Extract a ~maxLen-char excerpt centered on the best-matching passage.
 * @param {string} text
 * @param {string[]} terms
 * @param {number} [maxLen=180]
 * @returns {string}
 */
export function snippet(text, terms, maxLen) {
  maxLen = maxLen || 180;
  if (!text) return '';
  const m = bestMatch(text, terms, maxLen);
  if (!m) {
    if (text.length <= maxLen) return text;
    return text.slice(0, closeBetweenWords(text, 0, maxLen, 0)) + '…';
  }
  // Center the matched span within maxLen.
  const pad = Math.max(0, Math.floor((maxLen - m.span) / 2));
  let start = Math.max(0, m.start - pad);
  let end = Math.min(text.length, start + maxLen);
  if (end - start < maxLen) start = Math.max(0, end - maxLen);
  // the last hit is a whole word too ("love" found in "loved" keeps the "d")
  let matchEnd = m.start + m.span;
  while (insideWord(text, matchEnd)) matchEnd++;
  start = openBetweenWords(text, start, m.start);
  end = closeBetweenWords(text, start, Math.max(end, matchEnd), matchEnd);
  let clip = text.slice(start, end).trim();
  if (start > 0) clip = '…' + clip;
  if (end < text.length) clip = clip + '…';
  return clip;
}

/** Move a window's start forward to the first letter of a whole word (past a cut word's
 *  tail and the punctuation it leaves, "….. Understand"), never past `limit` (the match). */
function openBetweenWords(text, start, limit) {
  if (start === 0) return 0;
  let i = start;
  while (i < limit && !(WORD_CHAR.test(text[i]) && startsWord(text, i))) i++;
  return Math.min(i, limit);
}
/** Move a window's end back out of a half word, never before `floor` (the match's end). */
function closeBetweenWords(text, start, end, floor) {
  if (!insideWord(text, end)) return end;
  let i = end;
  while (i > Math.max(start, floor) && insideWord(text, i)) i--;
  // a single word longer than the window (no boundary to retreat to) keeps the hard cut
  return i > start && !insideWord(text, i) ? i : end;
}

/**
 * Where a hit LANDS: the text starting AT the first matched term of the best
 * window, `len` chars long, uncentred and unadorned. The reading screens match
 * its head against each block's text (LetterView / WtlbEntryView excerpt
 * anchor), so the block that holds the matched word holds this string's head.
 * '' when no term occurs — the letter then opens at the top, as before.
 * @param {string} text
 * @param {string[]} terms
 * @param {number} [len=48]
 * @returns {string}
 */
export function matchExcerpt(text, terms, len) {
  len = len || 48;
  const m = bestMatch(text, terms, len);
  return m ? text.slice(m.start, m.start + len) : '';
}

/**
 * Split text into {text, hit} spans for rendering — hit spans get <mark>.
 * @param {string} text
 * @param {string[]} terms
 * @returns {Array<{text:string, hit:boolean}>}
 */
export function highlightSpans(text, terms) {
  if (!text) return [{ text: '', hit: false }];
  if (!terms || !terms.length) return [{ text, hit: false }];
  const expanded = expandArchaicTerms(terms);
  const tokens = [];
  for (let i = 0; i < expanded.length; i++) {
    const t = (expanded[i] || '').trim().toLowerCase();
    if (t && t.length >= 2) tokens.push(t);
  }
  if (!tokens.length) return [{ text, hit: false }];
  const esc = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  esc.sort((a, b) => b.length - a.length); // longer first
  let re;
  // a hit starts a word and runs to its end: "love" marks "loves" whole, never "Be-love-d"
  try { re = new RegExp('(?<![\\p{L}\\p{N}])(?:' + esc.join('|') + ')[\\p{L}\\p{N}]*', 'giu'); } catch { return [{ text, hit: false }]; }
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
}
