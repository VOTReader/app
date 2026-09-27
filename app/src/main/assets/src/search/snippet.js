/* ═══════════════════════════════════════════════════════════════════════
   search/snippet.js — result snippet + highlight-span generation
   ═══════════════════════════════════════════════════════════════════════
   Pure text helpers consumed by the result cards. Both are archaic-aware: a
   "you" query centers/highlights "thee"/"thou"/"ye" in the displayed verse.
   Ported verbatim from the FlexSearch engine.
   ═══════════════════════════════════════════════════════════════════════ */

import { expandArchaicTerms, ARCHAIC_NORMALIZE } from './tokenize.js';
import { wordForms } from './word-forms.js';
import { searchData } from './search-data.js';

/* A short word (two letters or fewer) or a stop word matches only itself, as the
   engine now searches it (search audit 2026-09-27): "ye" marked "Yet", "me" marked
   "men", "the" marked "these" and "them", and each counted as a place. */
/** @param {string} t  lowercase */
function wholeOnly(t) {
  const stop = searchData().STOP_WORDS_TRIMMED;
  return t.length <= 2 || !!(stop && stop.has(t));
}

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
 * Which typed word each term stands for. The list a card highlights is the
 * query's own words FIRST, then what search added for them: synonyms (charity
 * for love), the engine's matched forms (flooding, and weep for a typed wept),
 * archaic twins (thee for you). Counted as separate words they skewed every
 * rule that counts words: a lone "charity" won the snippet as the rarer word,
 * and a place holding love and charity outranked every place holding love
 * (review of 22419b59, 2026-09-26). Two terms are one WORD FAMILY when one
 * extends the other, they are archaic twins, the synonym table pairs them, or
 * one is a word form of the other (word-forms.js); the family is named by its
 * first-listed member, the word the reader typed. A term is PRIMARY when it is
 * that word or extends it ("flooding" for flood): the typed word itself, which
 * wins a tie over its synonyms and back-forms.
 * @param {string[]} terms  in the caller's order, the typed words first
 * @returns {Map<string, { fam: string, primary: boolean }>}
 */
function familiesOf(terms) {
  const SYN = /** @type {Record<string, string[]>} */ (searchData().SYNONYM_MAP || {});
  if (SYN !== cacheSyn) { FAMILY_CACHE.clear(); cacheSyn = SYN; }
  const key = terms.join('\u0001');
  const hit = FAMILY_CACHE.get(key);
  if (hit) return hit;
  /** @type {string[]} */
  const list = [];
  for (const t of terms) {
    const w = String(t || '').toLowerCase().trim();
    if (w && list.indexOf(w) < 0) list.push(w);
  }
  const parent = list.map((_, i) => i);
  const root = (/** @type {number} */ i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const forms = list.map((w) => (/^[a-z]+$/.test(w) ? new Set(wordForms(w)) : new Set()));
  const norm = (/** @type {string} */ w) => ARCHAIC_NORMALIZE[w] || w;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (b.startsWith(a) || a.startsWith(b) || norm(a) === norm(b)
        || (SYN[a] && SYN[a].indexOf(b) >= 0) || (SYN[b] && SYN[b].indexOf(a) >= 0)
        || forms[i].has(b) || forms[j].has(a)) {
        const ra = root(i);
        const rb = root(j);
        // the earlier-listed root names the family: the word the reader typed
        if (ra !== rb) { if (ra < rb) parent[rb] = ra; else parent[ra] = rb; }
      }
    }
  }
  /** @type {Map<string, { fam: string, primary: boolean }>} */
  const out = new Map();
  for (let i = 0; i < list.length; i++) {
    const rep = list[root(i)];
    const w = list[i];
    const primary = w.startsWith(rep) || norm(w) === norm(rep);
    // the archaic twins a scan expands to belong where their word does
    for (const v of expandArchaicTerms([w])) {
      const lv = v.toLowerCase();
      if (!out.has(lv)) out.set(lv, { fam: rep, primary });
    }
  }
  if (FAMILY_CACHE.size > 64) FAMILY_CACHE.clear();
  FAMILY_CACHE.set(key, out);
  return out;
}
/** Families by term list, for the synonym table they were made with. */
/** @type {Map<string, Map<string, { fam: string, primary: boolean }>>} */
const FAMILY_CACHE = new Map();
/** @type {any} */ let cacheSyn = null;

/**
 * EVERY whole-word occurrence of every matchable term (archaic-aware), in text
 * order, one per position, capped for long bodies. `term` is the hit's word
 * family (familiesOf), which is what a window's "distinct words" count, and
 * `primary` says the hit is the typed word itself (or extends it). Two terms
 * matching at one position ("flood", "flooding" at "flooding") are one hit, the
 * longer.
 *
 * The cap is PER TERM (400 each): shorter terms are scanned first, and one cap for
 * all of them let a common word ("lord", 400 times in a long Answers topic) use it
 * up before the word that told the unit apart ("shepherd") was scanned at all.
 * @param {string} text
 * @param {string[]} terms
 * @returns {Array<{ idx: number, len: number, term: string, primary: boolean }>}
 */
function occurrences(text, terms) {
  if (!text || !terms || !terms.length) return [];
  const fams = familiesOf(terms);
  const expanded = [...fams.keys()]
    .filter((t) => t.length >= 2)
    .sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  const lower = text.toLowerCase();
  const at = new Map();
  for (let i = 0; i < expanded.length; i++) {
    const t = expanded[i];
    const f = /** @type {{ fam: string, primary: boolean }} */ (fams.get(t));
    let idx = lower.indexOf(t);
    let n = 0;
    while (idx >= 0 && n < 400) {
      // longer terms come later, so the last write at a position is the longest
      if (startsWord(lower, idx) && !(wholeOnly(t) && WORD_CHAR.test(lower[idx + t.length] || ''))) { at.set(idx, { idx, len: t.length, term: f.fam, primary: f.primary }); n++; }
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
 * shepherd once shows the shepherd, not the first Lord. Then a window holding
 * the typed word itself over one holding only its synonyms or back-forms, then
 * the earliest.
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

/**
 * Every window: the hits from each one to maxLen past its start, scored.
 * @param {Array<{ idx: number, len: number, term: string, primary: boolean }>} occ
 * @param {number} maxLen
 * @param {Record<string, number>} freq
 */
function windows(occ, maxLen, freq) {
  const out = [];
  for (let s = 0; s < occ.length; s++) {
    const winStart = occ[s].idx;
    const seen = Object.create(null);
    let count = 0;
    let weight = 0;
    let primary = false;
    let spanEnd = winStart + occ[s].len;
    for (let e = s; e < occ.length && (occ[e].idx + occ[e].len) <= winStart + maxLen; e++) {
      if (!seen[occ[e].term]) { seen[occ[e].term] = true; count++; weight += 1 / freq[occ[e].term]; }
      if (occ[e].primary) primary = true;
      spanEnd = occ[e].idx + occ[e].len;
    }
    out.push({ s, start: winStart, span: spanEnd - winStart, count, weight, primary });
  }
  return out;
}

/** Better window first: more typed words, rarer ones, the typed word itself, earlier. */
function better(a, b) {
  return (b.count - a.count) || (b.weight - a.weight) || ((b.primary ? 1 : 0) - (a.primary ? 1 : 0)) || (a.start - b.start);
}

/** bestMatch over an occurrence list already made. */
function bestIn(occ, maxLen) {
  if (!occ.length) return null;
  const wins = windows(occ, maxLen, familyCounts(occ));
  let best = wins[0];
  for (let i = 1; i < wins.length; i++) if (better(wins[i], best) < 0) best = wins[i];
  return { start: best.start, span: best.span, count: best.count };
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
 * Gather occurrences into places, BEST CLUSTERS FIRST: every hit's window is
 * scored the way the snippet's is (typed words, rarity, the typed word itself,
 * position) and taken best-first, each place running from its hit to maxLen on
 * over the hits no better place has claimed. Cutting runs from the first hit
 * instead split a pair that straddled a cut ("lord" at 0 and 100, "shepherd" at
 * 130), so no place held both and a count taken from another window size left
 * none to show (review of 22419b59). Returned in reading order.
 * @param {Array<{ idx: number, len: number, term: string, primary: boolean }>} occ
 * @param {number} maxLen
 * @param {Record<string, number>} freq  family counts over the WHOLE text
 * @returns {Array<{ start: number, span: number, count: number, fams: Record<string, boolean>, hits: Array<{ idx: number, len: number }> }>}
 */
function cluster(occ, maxLen, freq) {
  const wins = windows(occ, maxLen, freq).sort(better);
  const taken = new Array(occ.length).fill(false);
  const places = [];
  for (const w of wins) {
    if (taken[w.s]) continue;
    const start = occ[w.s].idx;
    const fams = Object.create(null);
    let count = 0;
    let end = start + occ[w.s].len;
    const hits = [];
    for (let e = w.s; e < occ.length && !taken[e] && occ[e].idx + occ[e].len <= start + maxLen; e++) {
      taken[e] = true;
      if (!fams[occ[e].term]) { fams[occ[e].term] = true; count++; }
      end = Math.max(end, occ[e].idx + occ[e].len);
      hits.push({ idx: occ[e].idx, len: occ[e].len });
    }
    places.push({ start, span: end - start, count, fams, hits });
  }
  return places.sort((a, b) => a.start - b.start);
}

/**
 * The places worth a reader's tap:
 *  - with two or more typed words, the places holding as many of them as the best
 *    place of the whole text does (`most`); a stray single word is not the passage
 *    a reader remembers;
 *  - when no place holds two (the words never meet in this text), the places of
 *    the RAREST word, the one that tells the unit apart ("shepherd", not the Lord
 *    the topic names 24 times);
 *  - one typed word (its synonyms and forms with it): every place.
 * @template {{ count: number, fams: Record<string, boolean> }} P
 * @param {P[]} places
 * @param {Record<string, number>} freq
 * @param {number} most
 * @returns {P[]}
 */
function keep(places, freq, most) {
  if (most >= 2) return places.filter((p) => p.count === most);
  const names = Object.keys(freq);
  if (names.length <= 1) return places;
  let min = Infinity;
  for (const f of names) if (freq[f] < min) min = freq[f];
  return places.filter((p) => names.some((f) => freq[f] === min && p.fams[f]));
}

/** The most typed words any place holds. */
function mostOf(places) {
  let most = 0;
  for (const p of places) if (p.count > most) most = p.count;
  return most;
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
 * the best window's first hit, SHOWN_BEFORE / SHOWN_FROM); the rest cluster into
 * places and are kept the way keep() keeps them, in the order the text reads.
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
  const freq = familyCounts(occ);
  const best = bestIn(occ, 180);
  const shownFrom = best ? best.start - SHOWN_BEFORE : -1;
  const shownTo = best ? best.start + SHOWN_FROM : -1;
  const rest = occ.filter((o) => o.idx < shownFrom || o.idx + o.len > shownTo);
  // the bar is the whole text's best place, the snippet's own included: when only
  // the snippet holds every word, the one-word leftovers are not places
  const most = mostOf(cluster(occ, maxLen, freq));
  return keep(cluster(rest, maxLen, freq), freq, most)
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
  const freq = familyCounts(occ);
  const places = cluster(occ, maxLen, freq);
  return keep(places, freq, mostOf(places)).map((p) => ({ start: p.start, span: p.span, hits: p.hits }));
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
  const escape = (/** @type {string} */ t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const longerFirst = (/** @type {string} */ a, /** @type {string} */ b) => b.length - a.length;
  // a hit starts a word and runs to its end: "love" marks "loves" whole, never "Be-love-d";
  // a short word or a stop word marks only itself ("ye", never "Yet")
  const reach = tokens.filter((t) => !wholeOnly(t)).map(escape).sort(longerFirst);
  const whole = tokens.filter(wholeOnly).map(escape).sort(longerFirst);
  const alts = [];
  if (reach.length) alts.push('(?:' + reach.join('|') + ')[\\p{L}\\p{N}]*');
  if (whole.length) alts.push('(?:' + whole.join('|') + ')(?![\\p{L}\\p{N}])');
  let re;
  try { re = new RegExp('(?<![\\p{L}\\p{N}])(?:' + alts.join('|') + ')', 'giu'); } catch { return [{ text, hit: false }]; }
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
