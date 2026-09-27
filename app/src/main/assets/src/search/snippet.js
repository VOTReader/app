/* ═══════════════════════════════════════════════════════════════════════
   search/snippet.js — result snippet + highlight-span generation
   ═══════════════════════════════════════════════════════════════════════
   Pure text helpers consumed by the result cards. Both are archaic-aware: a
   "you" query centers/highlights "thee"/"thou"/"ye" in the displayed verse.
   Ported verbatim from the FlexSearch engine.
   ═══════════════════════════════════════════════════════════════════════ */

import { expandArchaicTerms, ARCHAIC_NORMALIZE } from './tokenize.js';

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
 * EVERY whole-word occurrence of every matchable term (archaic-aware), in text
 * order, one per position, capped for long bodies.
 *
 * `term` is the hit's WORD FAMILY, which is what a window's "distinct terms" count:
 * the list a card highlights carries the forms the engine matched ("flood" and
 * "flooding" for a search of flood) and the archaic twins ("thee" for you), and
 * counted as separate words they made "flooding" worth two of "flood". A term
 * joins the family of a shorter term it starts with, and an archaic form joins
 * its modern word's. Two terms matching at one position ("flood", "flooding" at
 * "flooding") are one hit, the longer.
 * @param {string} text
 * @param {string[]} terms
 * @returns {Array<{ idx: number, len: number, term: string }>}
 */
function occurrences(text, terms) {
  if (!text || !terms || !terms.length) return [];
  const expanded = expandArchaicTerms(terms)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2)
    .sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  const family = Object.create(null);
  for (let i = 0; i < expanded.length; i++) {
    const t = expanded[i];
    let fam = ARCHAIC_NORMALIZE[t] || t;
    for (let j = 0; j < i; j++) {
      if (t.startsWith(expanded[j])) { fam = family[expanded[j]]; break; }
    }
    family[t] = fam;
  }
  const lower = text.toLowerCase();
  const at = new Map();
  for (let i = 0; i < expanded.length; i++) {
    const t = expanded[i];
    let idx = lower.indexOf(t);
    while (idx >= 0 && at.size < 400) {
      // longer terms come later, so the last write at a position is the longest
      if (startsWord(lower, idx)) at.set(idx, { idx, len: t.length, term: family[t] });
      idx = lower.indexOf(t, idx + t.length);
    }
  }
  return [...at.values()].sort((a, b) => a.idx - b.idx);
}

/**
 * The ~maxLen-wide window covering the MOST DISTINCT query terms — the passage
 * where the query words actually cluster (the remembered phrase), not the
 * first stray hit of one common word. Ties resolve to the earliest window.
 * Archaic-aware (a "you" query finds "thee"/"thou"/"ye"). Null when no term
 * occurs in the text.
 * @param {string} text
 * @param {string[]} terms
 * @param {number} maxLen
 * @returns {{ start: number, span: number, count: number } | null}  count: the distinct
 *   query words (word families) the window holds
 */
export function bestMatch(text, terms, maxLen) {
  const occ = occurrences(text, terms);
  if (!occ.length) return null;
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
  return { start: bestStart, span: bestSpan, count: bestCount };
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
  return clipAround(text, m, maxLen);
}

/**
 * The ~maxLen-char excerpt centred on a matched span, opened and closed between
 * words, with an ellipsis on each cut side.
 * @param {string} text
 * @param {{ start: number, span: number }} m
 * @param {number} maxLen
 * @returns {string}
 */
function clipAround(text, m, maxLen) {
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

/* How much of the text around its first hit a result card's snippet surely shows:
   the snippet is cut 180 chars wide, but its box holds three lines centred on
   the first <mark> (SrchSnippet), about 50 chars before the hit and 60 from it
   on the narrowest phone. A hit in that stretch is on screen already. */
const SHOWN_BEFORE = 50;
const SHOWN_FROM = 60;

/**
 * Every OTHER place a unit's text matches: the passages a result card lists
 * under its snippet, so a letter that says the word four times offers all four
 * (Brianna, 2026-09-26: "flood" showed "a flooding rain" and never the "flood of
 * judgment" further down the same letter, the passage she was after).
 *
 * The hits the card's snippet already shows are left out (the stretch around
 * the best window's first hit, SHOWN_BEFORE / SHOWN_FROM); the rest are gathered
 * into places, one per `maxLen`-wide run of hits, in the order the text reads.
 * With two or more query words, only the places that hold as many of them as the
 * best window does are kept: a stray single word is not the passage a reader
 * remembers.
 *
 * Each place carries `start` (its first hit, a word start: the landing reads
 * text.slice(start, start + 48), as matchExcerpt does) and `clip`, the
 * between-words excerpt centred on it.
 * @param {string} text
 * @param {string[]} terms
 * @param {number} [maxLen=120]
 * @returns {Array<{ start: number, clip: string }>}
 */
export function morePlaces(text, terms, maxLen) {
  maxLen = maxLen || 120;
  const occ = occurrences(text, terms);
  if (!occ.length) return [];
  const best = bestMatch(text, terms, 180);
  const shownFrom = best ? best.start - SHOWN_BEFORE : -1;
  const shownTo = best ? best.start + SHOWN_FROM : -1;
  const rest = occ.filter((o) => o.idx < shownFrom || o.idx + o.len > shownTo);
  const places = [];
  for (let i = 0; i < rest.length;) {
    const start = rest[i].idx;
    const seen = Object.create(null);
    let count = 0;
    let end = start + rest[i].len;
    let j = i;
    do {
      if (!seen[rest[j].term]) { seen[rest[j].term] = true; count++; }
      end = Math.max(end, rest[j].idx + rest[j].len);
      j++;
    } while (j < rest.length && rest[j].idx + rest[j].len <= start + maxLen);
    places.push({ start, span: end - start, count });
    i = j;
  }
  // The bar is the best window's, the snippet's own included: when the snippet
  // holds the only passage with every word, the one-word leftovers are not places.
  let most = best ? best.count : 0;
  for (const p of places) if (p.count > most) most = p.count;
  return places
    .filter((p) => most < 2 || p.count === most)
    .map((p) => ({ start: p.start, clip: clipAround(text, p, maxLen) }));
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
