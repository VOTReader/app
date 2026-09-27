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
 *
 * The cap is PER TERM (400 each): shorter terms are scanned first, and one cap for
 * all of them let a common word ("lord", 400 times in a long Answers topic) use it
 * up before the word that told the unit apart ("shepherd") was scanned at all.
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
    let n = 0;
    while (idx >= 0 && n < 400) {
      // longer terms come later, so the last write at a position is the longest
      if (startsWord(lower, idx)) { at.set(idx, { idx, len: t.length, term: family[t] }); n++; }
      idx = lower.indexOf(t, idx + t.length);
    }
  }
  return [...at.values()].sort((a, b) => a.idx - b.idx);
}

/** How often each word family occurs: the rarer a query word is in THIS text, the
 *  more a passage holding it tells the unit apart. */
function familyCounts(occ) {
  const n = Object.create(null);
  for (let i = 0; i < occ.length; i++) n[occ[i].term] = (n[occ[i].term] || 0) + 1;
  return n;
}

/**
 * The ~maxLen-wide window covering the MOST DISTINCT query terms — the passage
 * where the query words actually cluster (the remembered phrase), not the
 * first stray hit of one common word. Among windows holding as many, the one
 * whose words are RAREST in this text wins (each distinct word weighs 1 / its
 * count): "the lord is my shepherd" in a topic that says Lord 24 times and
 * shepherd once shows the shepherd, not the first Lord. Then the earliest.
 * Archaic-aware (a "you" query finds "thee"/"thou"/"ye"). Null when no term
 * occurs in the text.
 * @param {string} text
 * @param {string[]} terms
 * @param {number} maxLen
 * @returns {{ start: number, span: number, count: number } | null}  count: the distinct
 *   query words (word families) the window holds
 */
export function bestMatch(text, terms, maxLen) {
  return bestIn(occurrences(text, terms), maxLen);
}

/** bestMatch over an occurrence list already made. */
function bestIn(occ, maxLen) {
  if (!occ.length) return null;
  const freq = familyCounts(occ);
  let bestStart = occ[0].idx;
  let bestCount = 0;
  let bestWeight = 0;
  let bestSpan = occ[0].len;
  for (let s = 0; s < occ.length; s++) {
    const winStart = occ[s].idx;
    const seen = Object.create(null);
    let count = 0;
    let weight = 0;
    let spanEnd = winStart + occ[s].len;
    for (let e = s; e < occ.length && (occ[e].idx + occ[e].len) <= winStart + maxLen; e++) {
      if (!seen[occ[e].term]) { seen[occ[e].term] = true; count++; weight += 1 / freq[occ[e].term]; }
      spanEnd = occ[e].idx + occ[e].len;
    }
    if (count > bestCount || (count === bestCount && weight > bestWeight + 1e-9)) {
      bestCount = count; bestWeight = weight; bestStart = winStart; bestSpan = spanEnd - winStart;
    }
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

/**
 * Gather occurrences into places, one per `maxLen`-wide run of hits in reading
 * order, and keep the ones worth a reader's tap:
 *  - with two or more query words, the places holding as many of them as the best
 *    window of the whole text does (`most`); a stray single word is not the passage
 *    a reader remembers;
 *  - when no window holds two (the words never meet in this text), the places of the
 *    RAREST word, the one that tells the unit apart ("shepherd", not the Lord the
 *    topic names 24 times);
 *  - one query word: every place.
 * @param {Array<{ idx: number, len: number, term: string }>} occ  the hits to gather
 * @param {number} maxLen
 * @param {Record<string, number>} freq  family counts over the WHOLE text
 * @param {number} bestCount  the best window's word count over the whole text
 * @returns {Array<{ start: number, span: number, hits: Array<{ idx: number, len: number }> }>}
 */
function gather(occ, maxLen, freq, bestCount) {
  const places = [];
  for (let i = 0; i < occ.length;) {
    const start = occ[i].idx;
    const fams = Object.create(null);
    let count = 0;
    let end = start + occ[i].len;
    const hits = [];
    let j = i;
    do {
      if (!fams[occ[j].term]) { fams[occ[j].term] = true; count++; }
      end = Math.max(end, occ[j].idx + occ[j].len);
      hits.push({ idx: occ[j].idx, len: occ[j].len });
      j++;
    } while (j < occ.length && occ[j].idx + occ[j].len <= start + maxLen);
    places.push({ start, span: end - start, count, fams, hits });
    i = j;
  }
  let most = bestCount;
  for (const p of places) if (p.count > most) most = p.count;
  let keep;
  if (most >= 2) keep = (p) => p.count === most;
  else {
    const names = Object.keys(freq);
    if (names.length <= 1) keep = () => true;
    else {
      let min = Infinity;
      for (const f of names) if (freq[f] < min) min = freq[f];
      keep = (p) => names.some((f) => freq[f] === min && p.fams[f]);
    }
  }
  return places.filter(keep).map((p) => ({ start: p.start, span: p.span, hits: p.hits }));
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
 * the best window's first hit, SHOWN_BEFORE / SHOWN_FROM); the rest gather into
 * places the way gather() keeps them, in the order the text reads.
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
  const best = bestIn(occ, 180);
  const shownFrom = best ? best.start - SHOWN_BEFORE : -1;
  const shownTo = best ? best.start + SHOWN_FROM : -1;
  const rest = occ.filter((o) => o.idx < shownFrom || o.idx + o.len > shownTo);
  return gather(rest, maxLen, familyCounts(occ), best ? best.count : 0)
    .map((p) => ({ start: p.start, clip: clipAround(text, p, maxLen) }));
}

/**
 * EVERY place a unit's text matches, the snippet's own included, each with its
 * hits: what the reader's find bar steps through ("2 of 3") and marks, over the
 * text the reading screen renders. Same places as a result card lists.
 * @param {string} text
 * @param {string[]} terms
 * @param {number} [maxLen=120]
 * @returns {Array<{ start: number, span: number, hits: Array<{ idx: number, len: number }> }>}
 */
export function findPlaces(text, terms, maxLen) {
  maxLen = maxLen || 120;
  const occ = occurrences(text, terms);
  if (!occ.length) return [];
  const best = bestIn(occ, 180);
  return gather(occ, maxLen, familyCounts(occ), best ? best.count : 0);
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
