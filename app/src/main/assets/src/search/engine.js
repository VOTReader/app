/* ═══════════════════════════════════════════════════════════════════════
   search/engine.js — MiniSearch engine facade (window.VotSearchMini)
   ═══════════════════════════════════════════════════════════════════════
   The public surface, method-compatible with the Classic engine so the UI can
   call either one (see SearchScreen / SrchSnippet engine selection). A single
   in-memory MiniSearch index over the narrow doc set (index-builder.js); NO
   IndexedDB cache (the device is fast + single-user — rebuild fresh per session,
   reuse in-memory for every search that session).

   Search pipeline (faithful to the audited multi-signal ranking, with BM25 as
   the per-unit scorer + native fuzzy/prefix):
     1. parse → command / reference / named-passage short-circuit to a nav card
     2. stop-word filter + synonym expansion + word forms → search "units"
     3. one MiniSearch BM25 search per unit (literal = fuzzy+prefix; synonym =
        exact-only), accumulating per-doc score + a term-coverage bitmask
     4. re-rank: KIND_BOOST · coverage multiplier · phrase-proximity boost ·
        synonym-only demotion
     5. filter (corpus / scope / quoted-phrase / +must / -mustNot) + dedup + cap
     6. emit { score, doc, terms } — doc carries the routing/display contract
        fields; terms carries the doc-side matched words (fuzzy/prefix-
        corrected) for snippet highlighting. Classic results have no terms.

   Switches:
     - The alignment of a quote remembered with its slips (search200 B4, align.js)
       is ON by default. Its emergency off switch is setAlign(false), for the
       session: window.VotSearchMini.setAlign(false) in the app (setAlign(true)
       puts it back), and SEARCH_ALIGN=off for the benchmarks
       (tools/search-bench/corpus.mjs). Off, the ranking is B5's exactly.
   ═══════════════════════════════════════════════════════════════════════ */

import MiniSearch from './vendor/minisearch.js';
import { searchData } from './search-data.js';
import { buildMiniSearchOptions, MS_STORE_FIELDS, MS_SEARCH_DEFAULTS } from './search-config.js';
import { buildDocs } from './index-builder.js';
import { parseReference, fuzzyBookSuggest, levenshtein } from './ref-parser.js';
import { edgeReading, readReference, restWords } from './ref-edge.js';
import { scopeWord, collectionNamed } from './scope-word.js';
import { parseTextQuery, applyCorrections } from './query-parse.js';
import { expandQueryTerms } from './synonyms.js';
import { wordForms } from './word-forms.js';
import { numberReading } from './numbers.js';
import { kjvEncode, kjvEncodeAt, negationOf, PRONOUN_BARE, PRONOUN_PIECE } from './tokenize.js';
import { snippet, snippetAt, highlightSpans, matchExcerpt, morePlaces, findPlaces } from './snippet.js';
import {
  KIND_BOOST, coverageMultiplier, popcount, PHRASE_BOOST, SYNONYM_DEMOTION,
  BM25_PARAMS, KEYWORD_BM25, KEYWORD_CONTENT_WORDS, KEYWORD_WORDS, joinApostropheS, SYNONYM_WEIGHT, FORM_WEIGHT, NEAR_PHRASE_MIN, ORIGINAL_BOOST, REPRINT_KINDS, nearPhrase, titleMatch, TITLE_EXACT_BOOST,
  titleLevel, TITLE_LEVEL_LEAD, TITLE_LEAD,
} from './ranking.js';
import { loadCached, saveCached, clearCached, dataSignature } from './cache.js';
import { onIdle } from '../utils/on-idle.js';
import { lemma, bestWindow } from './passage.js';
import { startSemantic, semanticDocs, semanticStatus, semanticReady, docUnitKey } from './semantic.js';
import { kjvTwin, twinView, kjvReading, twinTokens, twinSentences, twinOnly, twinHolders, loadKjvTwin, kjvTwinReady, kjvTwinStatus, onKjvTwin, setKjvTwin, setKjvTwinSource } from './kjv-twin.js';
import { searchWorker } from './worker-client.js';
import { indexAssembler } from './index-transfer.js';
import { buildTitles, scoreTitles, admitTitles, swapTitles, stripCollections, titleWords, titleShare, nearWords } from './titles.js';
import { alignClasses, alignWeights, alignScore, alignMet } from './align.js';
import { parseLexicon } from './lexicon.js';
import { buildNoteDocs, notesSearcherAsync } from './notes-index.js';

/**
 * The parse kinds a direct-nav card answers ALONE.
 *
 * A POSITIVE LIST, not `kind !== 'text'` (search-2). These three are addresses
 * and actions — an explicit chapter or verse, a volume/letter ref, a command —
 * and text hits beneath them would be noise. Everything else falls through to
 * the text pipeline, so a kind added later is VISIBLE rather than inheriting
 * silence from a catch-all `else`.
 */
const NAV_ONLY_KINDS = new Set(['ref-bible', 'ref-letter', 'command']);

/**
 * How many text hits ride under a nav card. Five, the same count the search
 * screen's own preview slice uses — a bare `Psalms` matches thousands of verses,
 * and an uncapped wall of them reads as though the card had been buried.
 */
const NAV_TEXT_LIMIT = 5;

/* A TEXT DESCRIBED, NOT QUOTED (search200 sealed2, 2026-10-22). A reader describing a text opens with what it is and how it
   speaks ("letter saying now is the time for servants watchmen and trumpet", the panel's unsealed t498; "the part where
   your own measure comes back to you"), and those words are none of the text's: "letter" and "saying" weighed as
   subject words, and texts holding them led the one holding what the letter says. A query opening with a text's kind
   (letter, passage, part, entry, verse, section) and a telling word (saying, says, that says, explaining, describing,
   telling, where, about) is searched as what follows, two words or more. A kind typed alone ("the letter sent") is a
   word of a title, and stays. */
const DESCRIBED = /^\s*(?:the\s+|a\s+)?(?:letter|passage|part|entry|verse|section)\s+(?:saying|says|that\s+says|explaining|explains|describing|telling|where|about)\s+(?=\S+\s+\S)/i;
/* ...but what follows may tell what the text is about, not what it says: "the letter where the lord speaks about
   tithing" asks for the letter titled Tithing, and "the lord speaks about tithing", searched as the text's own words,
   led a text where the Lord speaks and tithing is named in passing (the sealed2 red team, rt3-30..33). A speaking word
   and "about" (of, on, concerning, regarding), up to three words in, tell a subject: the query is searched as typed. */
const SUBJECT_TOLD = /^(?:\S+\s+){0,3}?(?:speaks?|spoke|speaking|talks?|talked|talking|teach(?:es)?|taught|writes?|wrote|tells?|told|explains?|explained|warns?|warned|discuss(?:es)?|discussed)\s+(?:about|of|on|concerning|regarding)\s+\S/i;
/* A QUESTION OR A DESCRIPTION IS NO QUOTE (search200 sweep). originalsFirst gives a reprint's place (an Answers topic,
   a Words To Live By entry) to its original, which serves a reader remembering a line. A reader's question ("what
   happens if we ...", "why does god ...": a wh-word and an auxiliary, or an auxiliary first, in a reader's voice) or a
   description ("the short one about ...") typed no line: the words the two texts share are the subject's (James 4:14
   took Regarding Forgiveness's #1 on "happen"; sw-questions-09), or the reprint is the one asked for (the short WTLB
   entry, not its letter; sw-gist-27). Such a query keeps the order the words and the meaning gave, unless the reprint
   holds the typed words as a quote. Any question opening was too broad (par-15, par-35, t239, t282 lost). */
const ASKED_OPEN = /^\s*(?:(?:whats|hows|whys|whos)\s+\S|(?:what|how|why|who|whom|whose|when|where|which)\s+(?:\S+\s+)?(?:is|isnt|are|arent|was|were|do|does|doesnt|did|didnt|dont|can|cant|could|should|shouldnt|would|will|wont|shall|may|must|am|happens?|happened|to)\s+\S|(?:is|isnt|are|arent|was|were|do|does|doesnt|did|didnt|dont|can|cant|could|should|shouldnt|would|will|wont|shall|may|must|am)\s+\S)/i;
const READER_VOICE = /\b(?:i|im|ive|id|we|us|our|ourselves|god|gods|lord|lords|jesus|christ)\b/i;
const DESCRIBED_ONE = /^\s*(?:the|that|this)\s+(?:\S+\s+){0,2}?one\s+(?:about|where|with|that|which|saying|says|on|when|of)\s+\S/i;
/** A reader's question or a "the … one about …" description (no quote typed; see the block above). */
const askedNotQuoted = (/** @type {string} */ q) => (ASKED_OPEN.test(q) && READER_VOICE.test(q.replace(/['’]/g, ''))) || DESCRIBED_ONE.test(q);
/** A query with its describing opening left off (DESCRIBED), unless what follows tells a subject (SUBJECT_TOLD). */
const undescribed = (/** @type {string} */ q) => {
  const rest = q.replace(DESCRIBED, '');
  return rest !== q && SUBJECT_TOLD.test(rest) ? q : rest;
};

/* Typo tolerance is a FALLBACK (2026-09-22). MiniSearch rounds fuzzy 0.2 to ONE edit
   on a three-letter word, so a correctly spelled "one" also matched "owe" and "gone",
   "son" matched "sun", "peace" matched "place": verses the reader never asked for, with
   the near-miss highlighted as if it were the hit. A literal unit now searches exact +
   prefix first and retries with FUZZY only when that finds nothing, which is exactly the
   typo ("shephard" -> shepherd). search/fuzzy-fallback.test.js pins both halves.

   The retry corrects to ONE word (ux4, 2026-09-24): taking every word in reach at once
   let "shephard" (8 letters, 2 edits) bring Chephar and Mount Shepher, place names in
   one verse each that outrank a common word on BM25. searchCorrected() below. */
const FUZZY = 0.2;

/**
 * The most of the typed words (counted as typed, a word typed twice twice) any stretch of `width` tokens holds.
 * @param {string[]} toks @param {string[]} typed @param {number} width
 */
function typedHeld(toks, typed, width) {
  /** @type {Map<string, number>} */ const want = new Map();
  for (const t of typed) want.set(t, (want.get(t) || 0) + 1);
  /** @type {Map<string, number>} */ const have = new Map();
  let n = 0;
  let best = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const w = want.get(t) || 0;
    if (w) { const h = have.get(t) || 0; if (h < w) n++; have.set(t, h + 1); }
    if (i >= width) {
      const o = toks[i - width];
      const wo = want.get(o) || 0;
      if (wo) { const h = /** @type {number} */ (have.get(o)) - 1; have.set(o, h); if (h < wo) n--; }
    }
    if (n > best) best = n;
  }
  return best;
}
/** Where `run` first occurs in `toks` as consecutive tokens, as a token index; -1 when it does not (an empty run is at 0). */
function tokenRunAt(toks, run) {
  if (!run.length) return 0;
  for (let i = 0; i + run.length <= toks.length; i++) {
    let j = 0;
    while (j < run.length && toks[i + j] === run[j]) j++;
    if (j === run.length) return i;
  }
  return -1;
}
/** True when `toks` holds every token of `run` in order within a stretch of at most `width` tokens. */
function runWithin(/** @type {string[]} */ toks, /** @type {string[]} */ run, /** @type {number} */ width) {
  if (!run.length) return true;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] !== run[0]) continue;
    let j = 1;
    for (let k = i + 1, end = Math.min(toks.length, i + width); k < end && j < run.length; k++) if (toks[k] === run[j]) j++;
    if (j === run.length) return true;
  }
  return false;
}
/** Words a reprint may have cut from its original's line that the original still holds the typed run with (asWell). */
const RUN_CUT = 2;
/** A sentence's end, where the words a reprint cut (RUN_CUT) never reach across. */
const SENTENCE_END = /[.!?]+/;
/** True when `run` occurs in `toks` as consecutive tokens (an empty run always does). */
const hasTokenRun = (/** @type {string[]} */ toks, /** @type {string[]} */ run) => tokenRunAt(toks, run) >= 0;

/* SHORT WORDS, APOSTROPHES (search audit 2026-09-27). A literal word was also
   searched as a prefix, so every one- and two-letter word ("a", "i", the "s" an
   apostrophe leaves of "Lord's") and every stop word ("the" reaching these, them,
   their) matched thousands of words, and the longest texts, holding all of them,
   won: "a virgin shall conceive" ranked Isaiah 7:14 45th ("virgin shall conceive":
   1st), "The Lord's Table" #8, "lord's supper" put four topics highlighting
   "skillful" and "smoke" above 1 Cor 11:20. Only a word of three letters or more
   that is not a stop word reaches forward now; the rest match whole words. A number
   is whole too (search200 B2): "100" is not "1000", "144" not "144000". A stop word of the full list is a stop
   word here too (search200 fix1): "who", "can" and "all", kept in a search for their meaning, reached "whole",
   "canaan" and "altar"; the snippet already marked them whole only. */
/** @param {string} term */
function prefixable(term) {
  const D = searchData();
  const stop = (/** @type {Set<string>|undefined} */ s) => !!s && s.has(term);
  return term.length >= 3 && !stop(D.STOP_WORDS_TRIMMED) && !stop(D.STOP_WORDS) && !/\d/.test(term);
}
/** A typed term whose words are all stop words ("the", "me." with its period). */
function isStopTerm(term) {
  const toks = kjvEncode(term);
  const STOP = searchData().STOP_WORDS_TRIMMED;
  return !!STOP && toks.length > 0 && toks.every((t) => STOP.has(t));
}
/** "Lord's" searches Lord: a possessive's "s" is not a word the reader meant. */
function withoutPossessive(term) {
  const toks = kjvEncode(term);
  return toks.length >= 2 && toks[toks.length - 1] === 's' ? toks.slice(0, -1).join(' ') : term;
}
/* A QUESTION'S FRAME IS NOT ITS SUBJECT (search200 sweep, 2026-10-22). A reader asks "is halloween evil", "how do i
   repent", "why should we fast": the opening words say it is a question, the rest says what about. Counted as subject
   words, the frame closed the gates that turn the meaning model off: a subject of a word or two made a keyword search
   ("is" aside, "halloween evil"), and a first result holding the frame with the subject in a row ("why should we ...")
   was a quote found. The model, which reads a question well, had no vote. A short query (FRAME_MAX_WORDS or fewer)
   that opens with a question word or an auxiliary is read by position: its lead words while they are frame words
   (FRAME_WORDS: the question words, auxiliaries, subject pronouns and the "is it wrong to", "what happens when"
   idioms) are its frame, the words after them its subject. The gates read the subject; the words are scored as typed
   and the model reads the question whole. */
/** A question's frame is read in this many typed words or fewer. */
const FRAME_MAX_WORDS = 8;
/** The words a question opens with. */
const FRAME_OPENERS = new Set(['what', 'who', 'whom', 'whose', 'which', 'when', 'where', 'why', 'how', 'is', 'are', 'was',
  'were', 'am', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must', 'has',
  'have', 'had']);
/** The words its lead may go on with. */
const FRAME_WORDS = new Set([...FRAME_OPENERS, 'i', 'we', 'you', 'it', 'they', 'there', 'be', 'to', 'if',
  'happen', 'happens', 'happened', 'wrong', 'okay', 'ok']);
/**
 * A question's frame and the words searched for it, or null for a query that is no question so read.
 * @param {string} q  the query as typed, its contractions spelled out
 * @returns {{frame: string, rest: string}|null}
 */
function questionFrame(q) {
  const words = String(q).trim().split(/\s+/);
  if (words.length < 2 || words.length > FRAME_MAX_WORDS) return null;
  const bare = (/** @type {string} */ w) => w.toLowerCase().replace(/['’]s$/, '').replace(/[^a-z]/g, '');
  if (!FRAME_OPENERS.has(bare(words[0]))) return null;
  let k = 1;
  while (k < words.length && FRAME_WORDS.has(bare(words[k]))) k++;
  if (k >= words.length) return null;
  const rest = words.slice(k).join(' ');
  if (isStopTerm(rest)) return null;
  return { frame: words.slice(0, k).join(' '), rest };
}
/** The query without its -words, each +word as its word: what the reader wants found. @param {string} q */
function wantedQuery(q) {
  return String(q).split(/\s+/).filter((t) => !(t.length > 1 && t[0] === '-')).map((t) => (t.length > 1 && t[0] === '+' ? t.slice(1) : t)).join(' ');
}
/* A negative contraction is its two words, as the text mostly spells them: "don't
   look back" found its letter at #119, "do not look back" at #1. Typed without its
   apostrophe ("dont") it is no typo: the corrector read "cant" as "chant", "wasnt" as
   "want", "shouldnt" as "should", "arent" as "parent" (sr11 t216). kjvEncode reads it as
   the same two words (search200 B2, tokenize.js), and a text's own "don't" as "do not",
   so it is heard and never corrected; the query keeps it as typed (spelled out here, a
   sealed paraphrase lost its verse, as in sr11). */
/** The words of a contraction's base, its case kept where the base is the word ("Don't" is "Do not"). @param {string} base */
const notWords = (base) => {
  const b = base.toLowerCase();
  return negationOf(b) === b + ' not' ? base + ' not' : negationOf(b);
};
/* A pronoun contraction, bare or written, is spelled out as the reader means it ("youre", "you're" -> "you
   are"; "im", "I'm" -> "i am"; search200 fix1): typed bare it stayed one typed word, which no text holds
   whole, so a search for its words counted it once and the typo fixer still had it. kjvEncode reads a text's
   own the same way (PRONOUN_BARE, PRONOUN_PIECE). A negative one typed bare stays as typed (above). */
const PRONOUN_WRITTEN = Object.keys(PRONOUN_PIECE).map((piece) => /** @type {[RegExp, string]} */ ([
  new RegExp('\\b(' + PRONOUN_PIECE[piece][0].join('|') + ")['\\u2019]" + piece + '\\b', 'gi'), ' ' + PRONOUN_PIECE[piece][1]]));
const PRONOUN_TYPED_BARE = new RegExp('\\b(' + Object.keys(PRONOUN_BARE).join('|') + ')\\b', 'gi');
/** @param {string} q */
export function expandContractions(q) {
  let s = String(q).replace(/\b([a-z]+)n['\u2019]t\b/gi, (m, base) => notWords(base));
  for (const [re, word] of PRONOUN_WRITTEN) s = s.replace(re, (m, p) => p + word);
  return s.replace(PRONOUN_TYPED_BARE, (m) => PRONOUN_BARE[m.toLowerCase()]);
}

const VERSE_WINDOW = 3;
/** TWO WORDS OF ONE STORY (search200 sweep, meaning-fusion). A keyword search of two or more words that no one text
   holds all of often names a person and a thing of their story ("<name> tree"): the story tells the name in one verse
   and the thing in the next, and a text whose title says the common word outranked every verse of it. When no text
   holds every typed word, a verse counts as held the typed words its chapter's verses within VERSE_WINDOW of it hold.
 * @param {string[]} ids
 * @param {Record<string, any>} lookup
 * @param {Record<string, number>} mask  the typed words each text holds (termMask)
 * @param {number} wanted  the typed words that count (requiredMask)
 * @param {Record<string, number>} score
 */
function storyWindow(ids, lookup, mask, wanted, score) {
  /** @type {Map<string, Array<[number, string]>>} */
  const chapters = new Map();
  for (const id of ids) {
    const d = lookup[id];
    if (!d || d.kind !== 'verse') continue;
    const k = d.corpus + '|' + d.bookId + '|' + d.chapterNum;
    let list = chapters.get(k);
    if (!list) chapters.set(k, (list = []));
    list.push([d.verseNum, id]);
  }
  for (const list of chapters.values()) {
    if (list.length < 2) continue;
    for (const [v, id] of list) {
      const own = (mask[id] || 0) & wanted;
      let near = own;
      for (const [u, other] of list) if (other !== id && Math.abs(u - v) <= VERSE_WINDOW) near |= (mask[other] || 0) & wanted;
      const a = popcount(own), b = popcount(near);
      if (b > a) score[id] *= coverageMultiplier(b) / coverageMultiplier(Math.max(1, a));
    }
  }
}

/**
 * One unit's BM25 search, the body and the title scored apart and summed per text:
 * BM25 as published (BM25_PARAMS), or with MiniSearch's floor for a keyword search
 * (KEYWORD_BM25, where the reason is). A unit of several words (a quoted phrase)
 * matches when the body holds them all, or the title does.
 * @param {string} term
 * @param {Object} opts
 * @param {boolean} [keyword]
 * @returns {any[]}
 */
function searchUnit(term, opts, keyword) {
  const bm25 = keyword ? KEYWORD_BM25 : BM25_PARAMS;
  const body = msIndex.search(term, { ...opts, fields: ['text'], bm25 }) || [];
  // a verse's KJV wording, read on its own beside its edition's (kjv-twin.js; the search keeps the better reading)
  const V = twinNow();
  if (V) kjvReading(V, body, term, opts, bm25, (id) => msIndex.getStoredFields(id));
  const title = msIndex.search(term, { ...opts, fields: ['title'], bm25 }) || [];
  if (!title.length) return body;
  const byId = new Map();
  for (let i = 0; i < body.length; i++) byId.set(body[i].id, body[i]);
  for (let i = 0; i < title.length; i++) {
    const t = title[i];
    const b = byId.get(t.id);
    if (!b) { body.push(t); continue; }
    b.score += t.score;
    for (let w = 0; w < t.terms.length; w++) if (b.terms.indexOf(t.terms[w]) < 0) b.terms.push(t.terms[w]);
  }
  return body;
}

/* EVERY VERSE IN ITS KJV WORDING TOO (search200 fix1 "ed", 2026-10-19). The index holds the reader's edition, and a
   verse remembered in the KJV's words ("the earth was without form, and void", "whereof", "begat") lost to texts
   holding its NKJV words: kjv-alias.js reached the KJV a word at a time, and only a word no text held at all. Every
   verse now carries its KJV wording (kjv-twin.js, search-kjv-twin.json), read wherever its own is read, each wording
   alone, and scored the better of the two, never their sum: BM25 (searchUnit), the token store (withKjv: the KJV
   tokens after the verse's own, TWIN_GAP between), the passage lemmas, the originals' sentence keys, the alignment
   (wordingsOf) and the windows (eachWording). A KJV reader's index holds the KJV itself: it reads no second wording
   (twinView).
   THE READER'S EDITION FIRST (search200 fix2). The card shows a verse in the reader's edition, and the KJV wording is
   a second reading of it: a word a verse holds in its KJV wording alone counts as a form of the typed word does
   (FORM_WEIGHT; "pollution": Ezekiel 22:10 says it in the KJV alone, and led the Answers topic on it); a pool read on
   the best-scored few takes the reader's edition's best first (search(): pool); a text holding the typed run in the
   words it shows leads a verse holding it in its KJV wording alone (THE RUN SHOWN FIRST); and a title saying a verse's
   own words is not capped by that verse found in its KJV words (A TITLE THAT IS A VERSE IN THE READER'S EDITION). */
/** @type {import('./kjv-twin.js').KjvTwin|null} the KJV wording the caches were read with (adoptTwin) */ let TWIN_READ = null;
/** @type {{ms: any, data: any, view: import('./kjv-twin.js').KjvView|null}|null} */ let TWIN_VIEW = null;
/** A token no query holds, between a verse's two wordings. */
const TWIN_SEP = '|';
/** Between a verse's two wordings: no typed run reaches across it, and a window or an alignment reads each alone
    (eachWording, wordingsOf). */
const TWIN_GAP = new Array(12).fill(TWIN_SEP);
/** The index's verses with their KJV wording; null with none (no file, a KJV reader's index). */
function twinNow() {
  if (!msIndex || !TWIN_READ) return null;
  if (!TWIN_VIEW || TWIN_VIEW.ms !== msIndex || TWIN_VIEW.data !== TWIN_READ) TWIN_VIEW = { ms: msIndex, data: TWIN_READ, view: twinView(TWIN_READ, msIndex) };
  return TWIN_VIEW.view;
}
/** A text's tokens with its KJV wording after them (a verse worded otherwise in the KJV); `own` as it is else. */
function withKjv(/** @type {any} */ ms, /** @type {number|undefined} */ sid, /** @type {string[]} */ own) {
  const V = sid === undefined ? null : twinNow();
  const kjv = V && V.ms === ms ? twinTokens(V, sid) : null;
  if (!kjv) return own;
  if (kjv.length === own.length) {
    let i = 0;
    while (i < own.length && own[i] === kjv[i]) i++;
    if (i === own.length) return own;
  }
  return own.concat(TWIN_GAP, kjv);
}
/** The best of `read` over a text's wordings, each read alone: a verse's tokens or lemmas hold its KJV wording after
    its own, TWIN_GAP between, and a window wider than the gap (a long quote's) would read the two as one text. */
function eachWording(/** @type {string[]} */ toks, /** @type {(t: string[]) => number} */ read) {
  if (toks.indexOf(TWIN_SEP) < 0) return read(toks);
  let best = 0;
  let a = 0;
  for (let i = 0; i <= toks.length; i++) {
    if (i === toks.length || toks[i] === TWIN_SEP) { if (i > a) best = Math.max(best, read(toks.slice(a, i))); a = i + 1; }
  }
  return best;
}
/** A store span's wordings: the runs between TWIN_GAP (the span itself for a text of one). */
function wordingsOf(/** @type {Uint32Array} */ t, /** @type {number|undefined} */ sep) {
  if (sep === undefined || t.indexOf(sep) < 0) return [t];
  const out = [];
  let a = 0;
  for (let i = 0; i <= t.length; i++) {
    if (i === t.length || t[i] === sep) { if (i > a) out.push(t.subarray(a, i)); a = i + 1; }
  }
  return out.length ? out : [t];
}

/** @type {Map<string, string>|null} 'bookId:c:v' -> the verse's doc id in this index */ let VERSE_IDS = null;
/** Every verse of this index by 'bookId:c:v', read once per index. @returns {Map<string, string>} */
function verseIds() {
  if (!VERSE_IDS) {
    VERSE_IDS = new Map();
    const ids = msIndex._documentIds;
    for (const [shortId, f] of msIndex._storedFields) {
      if (!f || f.kind !== 'verse') continue;
      // Matthew's plain chapter, not the Study Bible's restored text (both index it)
      const key = (f.bookId === 'matthew-plain' ? 'matthew' : f.bookId) + ':' + f.chapterNum + ':' + f.verseNum;
      if (f.bookId !== 'matthew' || !VERSE_IDS.has(key)) VERSE_IDS.set(key, ids.get(shortId));
    }
  }
  return VERSE_IDS;
}

/* WHAT A REFERENCE TYPED WITH WORDS IS CHECKED AGAINST (search200 fix1, ref-edge.js): the verses this index
   holds, and whether a word is the Bible's (a verse of the Bible holds it; the Study Bible's restored Matthew is
   the Volumes' text) or only the other texts', and a verse's words. Each word and verse is read once per index, from
   the index's own postings and stored text. */
/** @type {{ms: any, bible: Map<string, boolean>, words: Map<string, string[]>}|null} */ let REF_FACTS = null;
/** @returns {import('./ref-edge.js').RefFacts} */
function refFacts() {
  if (!REF_FACTS || REF_FACTS.ms !== msIndex) REF_FACTS = { ms: msIndex, bible: new Map(), words: new Map() };
  const { bible, words } = REF_FACTS;
  const verses = verseIds();
  const inVerses = (/** @type {string} */ w) => {
    const data = msIndex._index && msIndex._index.get(w);
    if (!data) return false;
    for (const docs of data.values()) {
      for (const sid of docs.keys()) {
        const f = msIndex._storedFields.get(sid);
        if (f && f.kind === 'verse' && f.volumeId === 'bible') return true;
      }
    }
    return false;
  };
  // the KJV's form of a word the Bible holds is the Bible's ("believeth" believes, "whosoever" whoever): a KJV
  // paste beside its reference ("... whosoever believeth in him ... john 3 16 kjv") is the verse's own words
  const kjvForm = (/** @type {string} */ w) => modernForm(w) || (/^(?:wh[a-z]*|how)soever$/.test(w) ? w.replace('soever', 'ever') : null);
  /** A verse's words, by its doc id. @param {string} id */
  const wordsOf = (id) => {
    let t = words.get(id);
    if (!t) { const f = msIndex.getStoredFields(id); t = kjvEncode(String((f && f.text) || '')); words.set(id, t); }
    return t;
  };
  return {
    hasVerse: (book, c, v) => verses.has(book + ':' + c + ':' + v),
    textsHold: termExists,
    bibleHolds: (w) => {
      let held = bible.get(w);
      if (held === undefined) { const f = kjvForm(w); held = inVerses(w) || (!!f && inVerses(f)); bible.set(w, held); }
      return held;
    },
    verseWords: (book, c, v) => {
      const id = verses.get(book + ':' + c + ':' + v);
      return id ? wordsOf(id) : null;
    },
    // only the verses holding the run's rarest word can hold the run
    bibleHoldsRun: (run) => {
      const idx = msIndex._index;
      if (!run.length || !idx) return false;
      let fewest = null;
      let least = Infinity;
      for (const w of run) {
        const data = idx.get(w);
        if (!data) return false;
        let n = 0;
        for (const docs of data.values()) n += docs.size;
        if (n < least) { least = n; fewest = data; }
      }
      const ids = msIndex._documentIds;
      for (const docs of fewest.values()) {
        for (const sid of docs.keys()) {
          const f = msIndex._storedFields.get(sid);
          if (f && f.kind === 'verse' && f.volumeId === 'bible' && hasTokenRun(wordsOf(ids.get(sid)), run)) return true;
        }
      }
      return false;
    },
    // a unit's or a study chapter's whole title, not a part of one nor a heading inside a text (titles.js)
    namesTitle: (query) => {
      const ix = titlesNow();
      const at = ix && ix.byNorm.get(titleWords(query).join(' '));
      return !!at && at.some((/** @type {number} */ i) => ix.entries[i].kind === 'unit' || ix.entries[i].kind === 'chapter');
    },
  };
}
/* A NEW WORDING IS TAKEN UP AT A WARM (warmOriginals): the file loaded late, or set (setKjvTwin). The caches read with
   the old one go (as at an index's swap), and a search under way starts over at its next turn (search(): pause). */
function adoptTwin() {
  const t = kjvTwin();
  if (t === TWIN_READ) return;
  TWIN_READ = t;
  TWIN_VIEW = null;
  STORE = null;
  ORIGINALS = null;
  ORIGINALS_BUILD = null;
  ORIGINAL_DOCS = null;
  SHINGLES = null;
  CITED = null;
  LEMMA_CACHE.clear();
}
// a file loaded after the first searches is read in at the page's next idle moment
onKjvTwin(() => {
  if (typeof document !== 'undefined' && msIndex) onIdle(() => { warmOriginals().catch(() => {}); }, { timeout: 2000, fallbackDelay: 300 });
});
/** @type {Map<string, string>|null} unitKey -> doc id in this index: how a meaning hit (semantic.js) names its document */ let UNIT_IDS = null;

/** A KJV verb's modern form the index holds: seeth -> sees, cometh -> comes, seest -> see, knowest -> know. */
function modernForm(/** @type {string} */ t) {
  const m = /^(.{2,})(eth|est)$/.exec(t);
  if (!m) return null;
  const cands = m[2] === 'eth' ? [m[1] + 'es', m[1] + 's'] : [m[1], m[1] + 'e'];
  for (const c of cands) if (c !== t && termExists(c)) return c;
  return null;
}

/** Is `term` a word of the index? (The index's own term map; a search where it lacks one.) */
function termExists(term) {
  const idx = msIndex && msIndex._index;
  if (idx && typeof idx.has === 'function') return idx.has(term);
  return !!(msIndex && msIndex.search(term, { prefix: false, fuzzy: false }).length);
}

/**
 * The slip that turns `word` into `cand`, as a rank (search audit 2026-09-27): a
 * swapped pair (0: beleive, recieve, wrold), a letter left out (1: fxed, rightousness),
 * a letter too many (2: sond), a wrong letter (3: babilon), anything further (4). A
 * swapped pair is two edits to Levenshtein, so a word of seven letters or fewer never
 * reached its word ("wrold" and "beleive" found nothing, "recieve" became "relieve");
 * and ranking the neighbours by how many texts hold them alone chose "wrath" for
 * "erath" and "earth" for "warth".
 */
function slipRank(word, cand) {
  const a = word.length;
  const b = cand.length;
  if (a === b) {
    const diff = [];
    for (let i = 0; i < a; i++) if (word[i] !== cand[i]) diff.push(i);
    if (diff.length === 2 && diff[1] === diff[0] + 1 && word[diff[0]] === cand[diff[1]] && word[diff[1]] === cand[diff[0]]) return 0;
    if (diff.length === 1) return 3;
    return 4;
  }
  const inside = (/** @type {string} */ s, /** @type {string} */ l) => { let i = 0; for (let j = 0; j < l.length && i < s.length; j++) if (s[i] === l[j]) i++; return i === s.length; };
  if (b === a + 1 && inside(word, cand)) return 1;
  if (a === b + 1 && inside(cand, word)) return 2;
  return 4;
}

/**
 * A word written as a compound the text spells in parts: "abednego" (Abed-Nego),
 * "mahershalalhashbaz", "immanuel" (Immanu El). The split into two to four indexed
 * words, each of two letters or more, fewest parts first; null when none.
 * @param {string} word
 * @returns {string[]|null}
 */
function splitCompound(word) {
  if (word.length < 6) return null;
  /** @type {Map<number, string[]|null>} */
  const memo = new Map();
  const from = (/** @type {number} */ i, /** @type {number} */ partsLeft) => {
    if (i === word.length) return [];
    if (partsLeft === 0) return null;
    const key = i * 8 + partsLeft;
    if (memo.has(key)) return /** @type {string[]|null} */ (memo.get(key));
    let best = null;
    for (let j = word.length; j >= i + 2; j--) {
      const part = word.slice(i, j);
      if (j - i === word.length) continue;   // the whole word is not a split
      if (!termExists(part)) continue;
      const rest = from(j, partsLeft - 1);
      if (rest && (!best || rest.length + 1 < best.length)) best = [part].concat(rest);
    }
    memo.set(key, best);
    return best;
  };
  return from(0, 4);
}

/**
 * The typo fallback for one literal unit that found nothing as typed.
 *
 * First a compound the text spells in parts (splitCompound), searched as those words
 * in a row. Then the nearest indexed word by the slip that makes it (slipRank: a
 * swapped pair, a letter left out, one too many, a wrong one), and among words at the
 * same slip the one in the most documents (ties alphabetical). The edit budget is
 * MiniSearch's own, round(0.2 x length) capped at maxFuzzy, counted the Damerau way
 * (a swapped pair is one slip). That word is then searched as if typed, exact + prefix.
 * A multi-word unit (a quoted phrase) keeps the plain fuzzy retry.
 * `to` names what was searched in the typed word's place, so the screen can say so
 * ("Showing results for shepherd"); null for a phrase's fuzzy retry.
 * @param {string} term
 * @param {Object} opts  the unit's exact + prefix options
 * @param {boolean} [keyword]  searchUnit's
 * @param {(w: string) => boolean} [accept]  only the nearest word it accepts (no split): a word only its forms found
 * @returns {{ res: any[], to: string | null }}
 */
function searchCorrected(term, opts, keyword, accept) {
  const tokens = kjvEncode(term);
  if (tokens.length !== 1) return { res: searchUnit(term, { ...opts, fuzzy: FUZZY }, keyword), to: null };
  const word = tokens[0];
  const parts = splitCompound(word);
  // A split into a little word is a guess, not a name typed whole: "isreal" is Israel a letter
  // swapped, not "is real" (search benchmark, 2026-10-05). The nearest word goes first then.
  const stop = searchData().STOP_WORDS_TRIMMED;
  const weakSplit = !!parts && parts.some((w) => w.length <= 2 || (stop && stop.has(w)));
  const split = () => {
    if (!parts) return null;
    const res = searchUnit(parts.join(' '), { ...opts, prefix: false, combineWith: 'AND' }, keyword)
      .filter((h) => hasTokenRun(kjvEncode((h.text || '') + ' ' + (h.title || '')), parts));
    return res.length ? { res, to: parts.join(' ') } : null;
  };
  if (!weakSplit && !accept) { const s = split(); if (s) return s; }
  /* A name the text splits, typed whole AND a letter off: "abednigo" (Abed-Nego) is a split
     plus a slip, beyond either alone (search benchmark, 2026-10-05). Two parts, one of them an
     indexed word and the other one slip from one, both of three letters or more. */
  if (word.length >= 7 && !accept) {
    for (let i = 3; i <= word.length - 3; i++) {
      const a = word.slice(0, i);
      const b = word.slice(i);
      /** The word itself when indexed, else its one-slip neighbours (nigo: nigh, nego, ...). */
      const near = (/** @type {string} */ w) => {
        if (termExists(w)) return [w];
        const out = [];
        for (const h of msIndex.search(w, { prefix: false, fuzzy: 1, combineWith: 'OR' }) || []) {
          for (const t of h.terms || []) if (t !== w && out.indexOf(t) < 0 && slipRank(w, t) < 4) out.push(t);
          if (out.length >= 8) break;
        }
        return out;
      };
      if (!termExists(a) && !termExists(b)) continue;
      for (const pa of near(a)) for (const pb of near(b)) {
        const run = [pa, pb];
        const res = searchUnit(run.join(' '), { ...opts, prefix: false, combineWith: 'AND' }, keyword)
          .filter((h) => hasTokenRun(kjvEncode((h.text || '') + ' ' + (h.title || '')), run));
        if (res.length) return { res, to: run.join(' ') };
      }
    }
  }
  const budget = Math.max(1, Math.min(MS_SEARCH_DEFAULTS.maxFuzzy, Math.round(word.length * FUZZY)));
  // Levenshtein reach one wider than the budget, so a swapped pair (two Levenshtein
  // edits, one slip) is in reach; slipRank then keeps what is within the budget.
  const near = msIndex.search(word, { ...opts, prefix: false, fuzzy: Math.min(budget + 1, MS_SEARCH_DEFAULTS.maxFuzzy) }) || [];
  const docs = Object.create(null);
  for (let r = 0; r < near.length; r++) {
    const ts = near[r].terms || [];
    for (let t = 0; t < ts.length; t++) docs[ts[t]] = (docs[ts[t]] || 0) + 1;
  }
  let best = null;
  let bestRank = 9;
  for (const w in docs) {
    if (w === word || (accept && !accept(w))) continue;
    const rank = slipRank(word, w);
    // beyond one slip for a word of seven letters or fewer, unless it is the same word by ear
    if (rank === 4 && budget < 2 && !(word[0] === w[0] && skeleton(word) === skeleton(w))) continue;
    if (best === null || rank < bestRank || (rank === bestRank && (docs[w] > docs[best] || (docs[w] === docs[best] && w < best)))) {
      best = w;
      bestRank = rank;
    }
  }
  if (best) return { res: searchUnit(best, opts, keyword), to: best };
  return (weakSplit && !accept && split()) || { res: [], to: null };
}

/** Whether a typed word that only its forms found is `to` misspelt: one word each, `to` no form of the typed word
    (those were searched already) and of its family (their forms meet). */
function formMisspelt(/** @type {string[]} */ typed, /** @type {string|null} */ to) {
  if (!to || typed.length !== 1 || /\s/.test(to) || typed[0] === to) return false;
  const stop = (/** @type {string} */ w) => !!(searchData().STOP_WORDS_TRIMMED && searchData().STOP_WORDS_TRIMMED.has(w));
  const mine = wordForms(typed[0], stop);
  if (mine.indexOf(to) >= 0) return false;
  const fam = new Set(mine.concat(typed[0]));
  return wordForms(to, stop).some((f) => fam.has(f));
}

/** A word's consonants as heard: vowels and h dropped, doubles single ("shepard" and "shepherd": sprd). */
function skeleton(/** @type {string} */ w) {
  return w.replace(/[aeiouyh]/g, '').replace(/(.)\1+/g, '$1');
}

/** @type {any} */ let msIndex = null;

/* EVERY TEXT'S TOKENS, AS NUMBERS (search200 B3, 2026-10-18). The phrase ranking read the typed words in a row
   in a text's tokens (kjvEncode with a possessive's "s" joined, text and title), kept in a cache of the texts it
   read: the 500 best-scored, so a run of common words in a long letter that 600 short texts outscored on its one
   content word was never read. The store holds every text's tokens, each as its word's number, in one Uint32Array
   with each text's span (by its MiniSearch short id), read with the originals at idle a slice at a time; a run is
   then looked for in every text holding its rarest word (runHolders). A word with a possessive's "s" joined
   ("god's") is a number of its own, its word "gods" and its stem kept (STORE.base), so a quoted phrase reads it as
   the two words it was ("the name of the lord" holds in "the name of the Lord's house"). */
/**
 * @typedef {{ms: any, words: string[], ids: Map<string, number>, base: Int32Array, toks: Uint32Array, from: Uint32Array, to: Uint32Array, sId: number}} TokenStore
 */
/** @type {TokenStore|null} */ let STORE = null;
/** A store being filled: `add` one stored doc, `done` the store. */
function storeBuilder(/** @type {any} */ ms) {
  /** @type {Map<string, number>} */ const ids = new Map();
  /** @type {string[]} */ const words = [];
  /** @type {string[]} */ const keys = [];
  /** @type {number[]} */ const base = [];
  /** @type {number[]} */ const from = [];
  /** @type {number[]} */ const to = [];
  let toks = new Uint32Array(1 << 20);
  let n = 0;
  const idOf = (/** @type {string} */ key, /** @type {string} */ word, /** @type {number} */ b) => {
    let id = ids.get(key);
    if (id === undefined) { id = words.length; ids.set(key, id); words.push(word); keys.push(key); base.push(b); }
    return id;
  };
  const sId = idOf('s', 's', -1);
  return {
    add(/** @type {number} */ shortId, /** @type {any} */ f) {
      if (!f) return;
      const raw = withKjv(ms, shortId, kjvEncode((f.text || '') + ' ' + (f.title || '')));
      if (n + raw.length > toks.length) {
        const t = new Uint32Array(Math.max(Math.ceil(toks.length * 1.5), n + raw.length));
        t.set(toks.subarray(0, n));
        toks = t;
      }
      const a = n;
      for (let i = 0; i < raw.length; i++) {
        const w = raw[i];
        if (w === 's' && n > a) {
          // joinApostropheS: the "s" joins the word before it
          const prev = toks[n - 1];
          toks[n - 1] = idOf(keys[prev] + "'s", words[prev] + 's', prev);
        } else {
          toks[n++] = idOf(w, w, -1);
        }
      }
      from[shortId] = a;
      to[shortId] = n;
    },
    /** @returns {TokenStore} */
    done() {
      return {
        ms, words, ids, sId,
        base: Int32Array.from(base),
        toks: n < toks.length * 0.9 ? toks.slice(0, n) : toks,
        from: Uint32Array.from(from, (x) => x || 0),
        to: Uint32Array.from(to, (x) => x || 0),
      };
    },
  };
}
/** The store of the index in use, when it is read; null while it is being read (a search reads the old way then). */
function storeNow() {
  return STORE && STORE.ms === msIndex ? STORE : null;
}
/** The store of the index in use, read in one pass if it is not read yet (node; a search that raced a swap). */
function tokenStore() {
  if (!msIndex) return null;
  const S = storeNow();
  if (S) return S;
  const b = storeBuilder(msIndex);
  for (const [shortId, f] of msIndex._storedFields) b.add(shortId, f);
  STORE = b.done();
  return STORE;
}
/** A text's span in the store, by its doc id; null when the store or the text is not there. */
function storeSpan(/** @type {TokenStore|null} */ S, /** @type {string|undefined} */ id) {
  if (!S || id === undefined) return null;
  const sid = S.ms._idToShortId.get(id);
  return sid === undefined || sid >= S.from.length ? null : sid;
}
/* A text's tokens for the phrase ranking: kjvEncode's, a possessive's "s" joined (text and title), read from the
   store; kjvEncode'd anew only for a text the store does not hold yet. */
/** @param {string} id @param {{ text?: string, title?: string }} doc */
function docTokens(id, doc) {
  const S = storeNow();
  const sid = storeSpan(S, id);
  if (S && sid !== null) {
    const a = S.from[sid];
    const out = new Array(S.to[sid] - a);
    for (let k = 0; k < out.length; k++) out[k] = S.words[S.toks[a + k]];
    return out;
  }
  return joinApostropheS(withKjv(msIndex, msIndex && msIndex._idToShortId.get(id), kjvEncode((doc.text || '') + ' ' + (doc.title || ''))));
}
/**
 * The numbers each typed token may be, in a row: the word, and the word joined from a possessive ("lords" from
 * "lord's"), as the phrase ranking reads them alike. null when a word is in no text (none holds the run).
 * @param {TokenStore} S @param {string[]} run  joined tokens (joinApostropheS)
 * @returns {Array<[number, number]>|null}
 */
function runIds(S, run) {
  /** @type {Array<[number, number]>} */ const acc = [];
  for (const t of run) {
    const lit = S.ids.get(t);
    const jn = t.length > 1 && t[t.length - 1] === 's' ? S.ids.get(t.slice(0, -1) + "'s") : undefined;
    if (lit === undefined && jn === undefined) return null;
    acc.push([lit === undefined ? -1 : lit, jn === undefined ? -1 : jn]);
  }
  return acc;
}
/** Where the run (runIds) first starts in a text's tokens, as an index into them; -1 when it does not. */
function storeRunAt(/** @type {TokenStore} */ S, /** @type {number} */ sid, /** @type {Array<[number, number]>} */ acc) {
  const T = S.toks;
  const a = S.from[sid];
  const n = acc.length;
  if (!n) return 0;
  const [f0, f1] = acc[0];
  for (let i = a; i + n <= S.to[sid]; i++) {
    const t = T[i];
    if (t !== f0 && t !== f1) continue;
    let j = 1;
    while (j < n && (T[i + j] === acc[j][0] || T[i + j] === acc[j][1])) j++;
    if (j === n) return i - a;
  }
  return -1;
}
/**
 * Where a run of words as kjvEncode reads them (a possessive's "s" a word of its own) first starts in a text's
 * tokens, the store's joined words read as their two ("god's" as god, s); -1 when it does not. The quoted
 * phrase's and the +/- words' test, as holdsWords read them on kjvEncode's own tokens.
 * @param {TokenStore} S @param {number} sid @param {number[]} r  the run's numbers (-1: a word in no text)
 */
function storeWordsAt(S, sid, r) {
  const n = r.length;
  if (!n) return 0;
  const T = S.toks;
  const B = S.base;
  const b = S.to[sid];
  for (let i = S.from[sid]; i < b; i++) {
    // a run may start on a joined word's "s" (o = 1) as well as on its word
    for (let o = 0; o < (B[T[i]] >= 0 ? 2 : 1); o++) {
      let k = i;
      let ko = o;
      let j = 0;
      while (j < n && k < b) {
        const t = T[k];
        const bt = B[t];
        if ((bt < 0 ? t : ko === 0 ? bt : S.sId) !== r[j]) break;
        j++;
        if (bt >= 0 && ko === 0) ko = 1;
        else { k++; ko = 0; }
      }
      if (j === n) return i - S.from[sid];
    }
  }
  return -1;
}
/** How many texts the index finds the run's anchor in at most, for the store to read the run in all of them. */
const RUN_HOLDERS = 5000;
/** A run of this many typed tokens or more is looked for in every text holding it (runHolders), and landed on. */
const RUN_MIN = 3;
/**
 * The texts holding the typed run in a row, wherever they rank: id -> the token index where it starts. Read in
 * every text the index finds the run's rarest word in, when no more than RUN_HOLDERS hold it; null when more do
 * (the phrase ranking's 500 best are read then), or with no store yet.
 * @param {string[]} run  joined tokens
 * @returns {Map<string, number>|null}
 */
function runHolders(run) {
  const S = storeNow();
  if (!S || run.length < RUN_MIN) return null;
  const acc = runIds(S, run);
  /** @type {Map<string, number>} */ const out = new Map();
  if (!acc) return out;
  // the anchor: the word fewest texts hold (a joined word's texts: those holding its stem, and those holding it as
  // written), in either wording of a verse. The bound is the index's own count: the KJV wording widens the texts a
  // run is read in, never turns a run away (a run of common words, "and when you ... to me", stays read).
  const V = twinNow();
  const count = (/** @type {number} */ j, /** @type {boolean} */ kjv) => {
    const t = run[j];
    const one = (/** @type {string} */ x) => docFreq(x) + (kjv && V ? twinOnly(V, x) : 0);
    return (acc[j][0] >= 0 ? one(t) : 0) + (acc[j][1] >= 0 ? one(t.slice(0, -1)) : 0);
  };
  let best = -1;
  let bestN = Infinity;
  let ownN = Infinity;
  for (let j = 0; j < run.length; j++) {
    const own = count(j, false);
    if (own && own < ownN) ownN = own;
    const n = V ? count(j, true) : own;
    if (n && n < bestN) { bestN = n; best = j; }
  }
  if (best < 0 || Math.min(ownN, bestN) > RUN_HOLDERS) return null;
  /** @type {Set<number>} */ const sids = new Set();
  const holding = (/** @type {string} */ term) => {
    const data = msIndex._index.get(term);
    if (data) for (const docs of data.values()) for (const sid of docs.keys()) sids.add(sid);
    if (V) twinHolders(V, term, (sid) => sids.add(sid));
  };
  if (acc[best][0] >= 0) holding(run[best]);
  if (acc[best][1] >= 0) holding(run[best].slice(0, -1));
  for (const sid of sids) {
    if (sid >= S.from.length) continue;
    const at = storeRunAt(S, sid, acc);
    if (at >= 0) out.set(S.ms._documentIds.get(sid), at);
  }
  return out;
}
/**
 * Whether some text holds every one of `words`, each as typed or as a form of it (wordForms, and the index's words
 * it opens that share its lemma), within `width` tokens of each other and in the order given: read in the store, in
 * every text the index finds the rarest of them in, the texts in `mine` (doc ids) aside. null with no store yet
 * (search200 last2). The words in another order are another sentence, not the typed one with a word dropped ("made
 * to endure was spun" is no quote of "spun to endure"; search200 fix1).
 * @param {string[]} words  distinct content words (joined tokens), in the typed order
 * @param {number} width
 * @param {Set<string>} mine
 * @returns {boolean|null}
 */
function holdsTogether(words, width, mine) {
  const S = storeNow();
  const n = words.length;
  if (!S || !n || n > 30) return null;
  const stop = searchData().STOP_WORDS_TRIMMED;
  const isStop = (/** @type {string} */ w) => !!stop && stop.has(w);
  const tree = msIndex._index;
  /** @type {Uint32Array} each store word's typed words, a bit each */
  const flag = new Uint32Array(S.words.length);
  let anchor = 0;
  let anchorN = Infinity;
  /** @type {string[]} */ let anchorForms = [];
  for (let j = 0; j < n; j++) {
    const w = words[j];
    const forms = new Set([w]);
    for (const f of wordForms(w, isStop)) forms.add(f);
    if (typeof tree.atPrefix === 'function' && w.length >= 3) {
      const l = lemma(w);
      for (const k of tree.atPrefix(w).keys()) if (lemma(k) === l) forms.add(k);
    }
    let df = 0;
    for (const f of forms) {
      for (const key of [f, f + "'s", f.length > 1 && f[f.length - 1] === 's' ? f.slice(0, -1) + "'s" : '']) {
        const id = key ? S.ids.get(key) : undefined;
        if (id !== undefined) flag[id] |= 1 << j;
      }
      df += docFreq(f);
    }
    if (!df) return false;
    if (df < anchorN) { anchorN = df; anchor = j; anchorForms = [...forms]; }
  }
  const all = (1 << n) - 1;
  const bit = 1 << anchor;
  /** @type {Set<number>} */ const sids = new Set();
  for (const f of anchorForms) {
    const data = tree.get(f);
    if (data) for (const docs of data.values()) for (const sid of docs.keys()) sids.add(sid);
  }
  const T = S.toks;
  for (const sid of sids) {
    if (sid >= S.from.length || mine.has(S.ms._documentIds.get(sid))) continue;
    const a = S.from[sid];
    const b = S.to[sid];
    for (let i = a; i < b; i++) {
      if (!(flag[T[i]] & bit)) continue;
      // the stretches of `width` holding this anchor word
      const lo = Math.max(a, i - width + 1);
      const hi = Math.min(b, i + width);
      let m = 0;
      for (let k = lo; k < hi; k++) m |= flag[T[k]];
      if (m !== all) continue;
      // ...and in one of them, the words in the order typed
      for (let s = lo; s <= i; s++) {
        let q = 0;
        for (let k = s; k < Math.min(hi, s + width) && q < n; k++) if (flag[T[k]] & (1 << q)) q++;
        if (q === n) return true;
      }
    }
  }
  return false;
}
/** Typed tokens from which a text holding them all in a row leads every text that does not. */
const RUN_LEAD_MIN = 3;
/** A part of a title typed lifts its text to this share of the first text holding the typed run, at most. */
const PART_UNDER_RUN = 0.99;
/** The first texts that open on the typed run they hold (their placeStart). */
const RUN_LAND_REACH = 10;
/**
 * Where in `text` its joined token `at` starts (kjvEncodeAt, a possessive's "s" joined as the store joins it);
 * -1 past the text's own tokens (the title's).
 */
function tokenPlace(/** @type {string} */ text, /** @type {number} */ at) {
  const { tokens, starts } = kjvEncodeAt(text);
  let k = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 's' && k >= 0) continue;
    if (++k === at) return starts[i];
  }
  return -1;
}
/* A TITLE'S WORDS, READ ONCE (search200 B1, 2026-10-18). The title pass read every candidate's title through
   kjvEncode on every query. A study chapter is titled "Study — Chapter" (index-builder.js), and a reader types the
   chapter's title alone ("The Unleavened Loaves"): that part is a title of its own, typed whole. Keyed by the
   title (a study's apart), so a text needs no id here; emptied with the index. */
/** @type {Map<string, {all: string[], own: string[]|null}>} */
const TITLE_TOKS = new Map();
/** @param {{title?: string, kind?: string}} d */
function titleToks(d) {
  const title = d.title || '';
  const study = d.kind === 'bible-study';
  const key = study ? 'study|' + title : title;
  let t = TITLE_TOKS.get(key);
  if (!t) {
    const cut = study ? title.lastIndexOf(' — ') : -1;
    const own = cut >= 0 ? kjvEncode(title.slice(cut + 3)) : null;
    t = { all: kjvEncode(title), own: own && own.length ? own : null };
    TITLE_TOKS.set(key, t);
  }
  return t;
}
/* EVERY TITLE AND ANSWERS HEADING, SCORED ON ITS OWN (search200 B5, 2026-10-18): titles.js, built once per index from
   its stored fields (and the Answers entries' headings, read in ANSWERS), 25 ms on a desktop; emptied with the index. */
/** @type {{ms: any, answers: any, ix: any}|null} */ let TITLES = null;
/** Titles scored per query: a name's reprints and a numbered series are admitted together. */
const TITLE_HITS = 12;
/** The title index of the index in use, built if it is not (null where it cannot be). */
function titlesNow() {
  if (!msIndex) return null;
  const A = /** @type {any} */ (globalThis).ANSWERS;
  const answers = Array.isArray(A) ? A : null;
  if (TITLES && TITLES.ms === msIndex && TITLES.answers === answers) return TITLES.ix;
  const ids = msIndex._documentIds;
  const docs = [];
  for (const [sid, f] of msIndex._storedFields) {
    if (!f || f.kind === 'verse' || !f.title) continue;
    docs.push({ id: ids.get(sid), kind: f.kind, title: f.title, volumeId: f.volumeId, letterId: f.letterId, studyChapterId: f.studyChapterId, text: f.text || '' });
  }
  let ix = null;
  try { ix = buildTitles(docs, { answers: answers || [] }); } catch { ix = null; }
  TITLES = { ms: msIndex, answers, ix };
  return ix;
}
/** Kinds an Answers heading's original may be: the prose it labels (a verse is no heading's text). */
const HEADING_ORIGINALS = new Set(['letter', 'wtlb', 'blessed', 'holy-day', 'bible-study']);
/** The phrase ranking reads at most this many of the best-scored texts. */
const PHRASE_CANDIDATES = 500;
/** A close match holds this share of the query's content words in one passage, rare words weighing most (sr13). */
const CLOSE_SHARE = 0.75;

/* THE BEST PASSAGE (search benchmark, 2026-10-05). A remembered sentence in the reader's own words
   shares only a few words with the text, and a long topic holds those few somewhere, far apart: it
   came first and the passage meant sat 2nd to 20th (paraphrase 12 of 75). The first PASSAGE_REACH
   results are re-ordered by their best passage (passage.js bestWindow), the engine's own order
   breaking near-ties, unless the first already holds the query together, the search is a keyword
   or a quote, or a result's title is what the query names (it keeps the top). An Answers topic
   reprints the verses and letters, so its best passage ties theirs: it yields to an original
   holding as much (REPRINT_COST), and does not keep its place for holding the query together. */
const PASSAGE_REACH = 30;
/** The first result holding this share of the query in one passage keeps its place. */
const PASSAGE_HELD = 0.9;
/** How much a place lower in the engine's order costs, against the passage share (0..1). */
const PASSAGE_RANK_COST = 0.01;
/** How much more of the query a passage must hold to take the engine's first place. */
const PASSAGE_MARGIN = 0.15;
/** How much less of the query an original's passage may hold and still come before an Answers topic. */
const REPRINT_COST = 0.05;
/** @type {Map<string, string[]>} doc id -> its tokens' lemmas, a few hundred texts, oldest out first */
const LEMMA_CACHE = new Map();
/** How many texts hold `term` (the index's own term data). */
function docFreq(term) {
  const data = msIndex && msIndex._index && msIndex._index.get(term);
  if (!data) return 0;
  let n = 0;
  for (const docs of data.values()) if (docs.size > n) n = docs.size;
  return n;
}

/* WHERE IT LANDS, BY MEANING (path to 500, 2026-10-05). A text the words found opens where the
   typed words sit thickest (use-search matchExcerpt). For a reader who described the passage,
   those words can sit in the wrong place: "everyone struggling and burdened come to me for rest"
   cut its excerpt at a "come" two paragraphs from the passage. The first results open on the
   passage the model matched instead, when it means the query clearly more nearly than the
   passage holding the excerpt (LAND_MARGIN). A passage is three sentences and the reader's words
   point at one of them (search sr10, 2026-10-14): a text opened on a passage opens on the sentence
   of it holding most of the typed words, not on its first ("every preacher speaks blasphemy and
   every church altar is corrupted" opened a sentence above "blasphemy is heard from every pulpit"). */
const LAND_REACH = 3;
const LAND_MARGIN = 0.06;
/** The sentences of a matched passage read for the one the typed words point at. */
const LAND_SENTENCES = 3;
/**
 * The start of the sentence, among a passage's first LAND_SENTENCES, holding most of the typed words
 * (the first of equals); the passage's own start when none holds one.
 * @param {string} text
 * @param {number} start  the passage's start
 * @param {Set<string>} words  the typed content words, as lemmas
 */
function sentenceAt(text, start, words) {
  let best = start;
  let most = 0;
  for (const sp of sentenceSpans(text.slice(start, start + MEANING_SPAN)).slice(0, LAND_SENTENCES)) {
    const held = new Set(kjvEncode(sp.text).map(lemma).filter((l) => words.has(l))).size;
    if (held > most) { most = held; best = start + sp.start + (sp.text.length - sp.text.trimStart().length); }
  }
  return best;
}
/**
 * @param {Array<{doc:any, placeStart?:number, terms?:string[]}>} out
 * @param {Map<any, string>} idOf
 * @param {Array<{id:string, start:number, passages: () => Array<[number, number]>}>} sem
 * @param {string[]} terms
 * @param {Set<any>} [byTitle]  the entries a title named opens where it says: their landing stands
 */
function meaningLanding(out, idOf, sem, terms, byTitle) {
  const byId = new Map(sem.map((s) => [s.id, s]));
  for (const e of out.slice(0, LAND_REACH)) {
    if (e.doc.kind === 'verse' || typeof e.placeStart === 'number' || !e.doc.text) continue;
    const s = byId.get(idOf.get(e) || '');
    if (!s || s.start < 0) continue;
    const ex = terms.length ? matchExcerpt(e.doc.text, terms, undefined, e.terms) : '';
    const at = ex ? e.doc.text.indexOf(ex) : -1;
    if (at < 0) continue;
    const ps = s.passages();
    let lex = null;
    for (const pp of ps) if (pp[0] <= at) lex = pp;
    const bestScore = Math.max(...ps.map((pp) => pp[1]));
    if (lex && bestScore - lex[1] > LAND_MARGIN && s.start !== lex[0]) e.placeStart = s.start;
  }
  // Every text opened on a matched passage (here, or meaningFirst's own finds): on its sentence the words point at.
  /* ...but not one a title named (search200 R1, the S22 look, 2026-10-18): a title typed with its collection's name
     ("...Words To Live By Part Two") opened its entry at the top, and was moved to the first sentence saying "one" or
     "two", a few lines down; the card quoted that sentence. A text found by its title, or a heading, opens on it. */
  const words = new Set(terms.flatMap((t) => kjvEncode(t)).filter((w) => !isStopTerm(w)).map(lemma));
  if (!words.size) return;
  for (const e of out) {
    if (byTitle && byTitle.has(e)) continue;
    if (typeof e.placeStart === 'number' && e.placeStart >= 0 && e.doc.text) e.placeStart = sentenceAt(e.doc.text, e.placeStart, words);
  }
}

/** unitKey -> this index's doc id: how a meaning hit (semantic.js) names its document. */
function unitId(/** @type {string} */ key) {
  if (!UNIT_IDS) {
    UNIT_IDS = new Map();
    const ids = msIndex._documentIds;
    for (const [shortId, f] of msIndex._storedFields) {
      const k = docUnitKey(f);
      if (k && !UNIT_IDS.has(k)) UNIT_IDS.set(k, ids.get(shortId));
    }
  }
  return UNIT_IDS.get(key);
}

/* MEANING FIRST (path to 500, step 1, 2026-10-05). The on-device model (semantic.js)
   ranks every passage by what it means; the words engine ranks by what it says. Their
   two orders are fused over the words engine's top MEANING_REACH (reciprocal rank,
   k = MEANING_K), and the model's own best MEANING_ADD documents join them even when
   no typed word reaches them ("god says he lives among israel and his people will
   never be ashamed" -> Joel 2:27). The meaning weighs more the less of the query the
   words found together in one passage (a quote typed nearly right stays the words'
   find); a title the query names keeps the lead. A document only the meaning found
   opens on the passage the model matched (entry.placeStart, which use-search lands
   on); one the words found too lands where they do. Measured on the benchmark
   (lanes/search/out/p5): 413 -> 424/500.
   SURE AND UNSURE (search sr10, 2026-10-14). The model's score says how sure it is. Its clear
   first (MEANING_SURE ahead of the next text it ranks) leads, unless a named title does or the
   words hold the whole query in one passage: on the benchmark its right picks led by 0.05-0.09
   (Joel 2:27 for the query above came 3rd, behind letters holding its words) and its wrong ones
   by 0-0.02. Two texts it ranks within MEANING_TIE it cannot tell apart: the original kind goes
   first (ORIGINAL_TIER), as a reprint gives way to its original. 440 -> 445/500, none lost. */
const MEANING_REACH = 30;
const MEANING_ADD = 10;
/** How many of the model's best documents a search kept to a collection or scope reads (else semanticDocs' 60). */
const MEANING_FILTERED = 300;
const MEANING_K = 10;
/** How much text from a matched passage's start names its original (a unit is three sentences). */
const MEANING_SPAN = 400;
/** Runs it must share with an original to be its reprint: more than the typed-words rule's 2, since no typed word
    vouches for the passage (2 and 3 moved a stray letter up; 4 only true copies, on the benchmark). */
const MEANING_VOTES = 4;
/** The meaning's weight when no passage holds any of the query; it falls as the words hold more (1 - held). */
const MEANING_WEIGHT = 2;
/** How far (cosine) the model's first must lead the next text it ranks to lead the results: 0.025-0.05 gained the same on the benchmark. */
const MEANING_SURE = 0.04;
/** What a clear first adds to its key: past any order the two ranks give (at most 0.1 + 0.2), short of a named title's 1. */
const MEANING_SURE_LEAD = 0.5;
/** Texts the model ranks this near (cosine) it cannot tell apart: 0.006-0.014 gained, none lost, on the benchmark. */
const MEANING_TIE = 0.012;
/** Two copies of one passage score alike to the float: a reprint is no next text. */
const MEANING_SAME = 1e-4;
/* THE LEAD AGREES WITH THE RARE WORDS (search200 sweep, meaning-fusion, 2026-10-22). The clear first's lead was read
   from the cosine alone. A typed word few texts say is the strongest sign the words have of the text meant, so the
   lead reads it too: a first holding a rare typed word leads by MEANING_SURE_HELD; and a first lacking the rare word
   the words' own first holds does not lead, when the model rates that text within MEANING_AGREE of its first too (the
   two nearly agree on it, and the rare word tells them apart). "timothy sad because his family rejects the letters": the
   letter about loved ones rejecting the Word led the model by 0.032 and holds "rejects"; "the letter where the little
   flock gets disbanded": an Answers topic led the model by 0.043 without "disbanded", which one letter says. */
/** A typed word at most this many texts say (its forms with it) is rare. */
const MEANING_RARE_DF = 30;
/** How far (cosine) the model's first holding a rare typed word must lead the next text it ranks. */
const MEANING_SURE_HELD = 0.025;
/** How near (cosine) the model rates the words' first to its own for the two to nearly agree on it. */
const MEANING_AGREE = 0.06;
/**
 * @param {Array<{score:number, doc:any, terms?:string[], placeStart?:number, meaningStart?:number}>} out
 * @param {Map<any, string>} idOf
 * @param {Array<{id:string, score:number, start:number}>} sem  best first
 * @param {(doc:any) => boolean} named
 * @param {number} held  the most of the query one passage of the words engine's top holds (bestPassageFirst)
 * @param {(doc:any) => boolean} admit  marks a document the meaning adds shown: false for a text already shown
 * @param {(id:string) => number} rare  the rare typed words a document holds (a mask; 0 for none)
 */
function meaningFirst(out, idOf, sem, named, held, admit, rare) {
  const w = MEANING_WEIGHT * Math.max(0, 1 - held);
  // Its order, with texts it cannot tell apart taken original first.
  const tierOf = (/** @type {string} */ id) => { const f = msIndex.getStoredFields(id); return (f && ORIGINAL_TIER[f.kind]) ?? 5; };
  const order = sem.map((s) => ({ s, t: tierOf(s.id) }));
  for (let j = 1; j < order.length; j++) {
    for (let r = j; r > 0 && order[r - 1].s.score - order[r].s.score <= MEANING_TIE && order[r].t < order[r - 1].t; r--) {
      const x = order[r]; order[r] = order[r - 1]; order[r - 1] = x;
    }
  }
  const semRank = new Map(order.map((o, i) => [o.s.id, i]));
  // The model's clear first: far enough ahead of the next text it ranks (its own copies aside), the less so holding a
  // rare typed word, and not when it lacks the rare word of the words' first that the model rates nearly as high.
  let sure = '';
  if (w > 0 && sem.length) {
    const next = sem.find((s) => sem[0].score - s.score > MEANING_SAME);
    const by = next ? sem[0].score - next.score : Infinity;
    const mine = rare(sem[0].id);
    const wordsFirst = out.length ? idOf.get(out[0]) : undefined;
    const theirs = wordsFirst && wordsFirst !== sem[0].id ? sem.find((s) => s.id === wordsFirst) : undefined;
    const lacks = !!theirs && sem[0].score - theirs.score <= MEANING_AGREE && (rare(theirs.id) & ~mine) !== 0;
    if (!lacks && (by >= MEANING_SURE || (mine && by >= MEANING_SURE_HELD))) sure = sem[0].id;
  }
  const semStart = new Map(sem.map((s) => [s.id, s.start]));
  const top = out.slice(0, MEANING_REACH);
  const rest = out.slice(MEANING_REACH);
  const inTop = new Set(top.map((e) => idOf.get(e)));
  const added = new Set();
  for (const s of sem.slice(0, MEANING_ADD)) {
    if (inTop.has(s.id)) continue;
    const j = rest.findIndex((e) => idOf.get(e) === s.id);
    let e = j >= 0 ? rest.splice(j, 1)[0] : null;
    if (!e) {
      const f = msIndex.getStoredFields(s.id);
      if (!f || !admit(f)) continue;
      e = { score: 0, doc: reshapeDoc(f), terms: [] };
      idOf.set(e, s.id);
    }
    top.push(e);
    inTop.add(s.id);
    added.add(e);
  }
  const key = (/** @type {any} */ e, /** @type {number} */ i) => (named(e.doc) ? 1 : 0) + 1 / (MEANING_K + Math.min(i, MEANING_REACH)) +
    w / (MEANING_K + (semRank.get(idOf.get(e)) ?? 1e6)) + (idOf.get(e) === sure ? MEANING_SURE_LEAD : 0);
  const keyed = top.map((e, i) => ({ e, i, k: key(e, i) }));
  keyed.sort((a, b) => b.k - a.k);
  for (const e of top) {
    const st = semStart.get(idOf.get(e));
    if (st == null || st < 0 || e.doc.kind === 'verse') continue;
    e.meaningStart = st; // where the model matched it: originalsFirst reads a reprint's original there
    if (added.has(e)) e.placeStart = st;
  }
  out.length = 0;
  for (const k of keyed) out.push(k.e);
  for (const e of rest) out.push(e);
}
/**
 * @param {Array<{score:number, doc:any, terms?:string[]}>} out
 * @param {Map<any, string>} idOf
 * @param {Array<{term:string, origin:number, literal?:boolean}>} units  the search's units: each typed
 *   word (literal) with its synonyms, names and forms (same origin)
 * @param {(term:string) => boolean} stop
 * @param {(doc:any) => boolean} named
 */
function bestPassageFirst(out, idOf, units, stop, named) {
  const n = msIndex.documentCount || 1;
  const seen = new Set();
  const query = [];
  let typed = 0;
  for (const u of units) {
    if (!u.literal || stop(u.term)) continue;
    for (const w of kjvEncode(u.term)) {
      typed++;
      const lem = lemma(w);
      if (seen.has(lem)) continue;
      seen.add(lem);
      const df = docFreq(w);
      const syn = new Set();
      for (const v of units) if (v.origin === u.origin && v !== u) for (const x of kjvEncode(v.term)) syn.add(lemma(x));
      query.push({ lem, weight: Math.log(1 + (n - df + 0.5) / (df + 0.5)), syn });
    }
  }
  if (query.length < 3) return 0;
  const span = Math.max(12, Math.round(typed * 1.6));
  const top = out.slice(0, PASSAGE_REACH).map((e, i) => {
    const id = idOf.get(e) || String(i);
    const lem = docLemmas(id, e.doc.text || '');
    const share = named(e.doc) ? 2 : eachWording(lem, (t) => bestWindow(query, t, span));
    return { e, i, share, key: share - PASSAGE_RANK_COST * i - (e.doc.kind === 'answers' && share < 2 ? REPRINT_COST : 0) };
  });
  if (!top.length) return 0;
  const held = Math.max(...top.map((t) => (t.share < 2 ? t.share : 0)));
  const first = top[0];
  const reprint = first.e.doc.kind === 'answers' && first.share < 2;
  if (first.share >= PASSAGE_HELD && !reprint) return held;
  top.sort((a, b) => b.key - a.key);
  // The engine's first is overtaken only by a passage holding clearly more of the query; an
  // Answers topic, by an original holding as much (it reprints them).
  if (top[0] !== first && top[0].share < first.share + (reprint ? -REPRINT_COST : PASSAGE_MARGIN)) { top.splice(top.indexOf(first), 1); top.unshift(first); }
  for (let i = 0; i < top.length; i++) out[i] = top[i].e;
  return held;
}

/* THE ORIGINAL BEFORE ITS REPRINT (search benchmark, 2026-10-05). Answers, Holy Days and
   the studies reprint letters, Words To Live By and verses word for word, and a long Answers
   topic holds every word of most queries: a remembered letter sentence came back with the
   topic that quotes it first and the letter below it (74 of the benchmark's 187 open
   misses, 9 of them exact quotes). Every sentence of an original text (a verse, a letter,
   Words To Live By, The Blessed) is keyed by its words; a reprint near the top whose matched
   sentence is one of them gives its place to that original (ORIGINAL_TIER: who reprints whom). */
/** Reprints read for an original: the first this many results. */
const ORIGINAL_REACH = 10;
/** How far below an Answers topic a study or Holy Days text that holds the query as well is looked for. */
const STUDY_REACH = 3;
/** Named titles read for one the query names more nearly than the first's, and by how much more. */
const TITLE_REACH = 5;
const TITLE_NEARER = 0.2;
/** A text the query names guards against a title typed with one word wrong when its title holds this share of the
    typed content words' weight (titles.js titleShare): an opening and small words shared name nothing (search200 fix1). */
const SWAP_NAMED_SHARE = 0.6;
/** How far down a title typed whole (titleLevel) is looked for, to lead (search200 B1). */
const TITLE_ORDER_REACH = 30;
/** A verse first that holds this many typed words in a row keeps its place over a title typed whole. */
const VERSE_RUN_HELD = 4;
/** Typed words, at least, for a stretch holding all of them but one to be read as a quote over a title remembered loosely. */
const QUOTE_NEAR_MIN = 5;
/** Typed words, at least, for a title's every word typed in another order to be the title typed whole (search200 R3). */
const TITLE_REORDER_MIN = 3;
/* A QUOTE REMEMBERED WITH ITS SLIPS (search200 B4, 2026-10-18): align.js's knobs, read in search() below. */
/** On by default (2026-10-18: tri open 577 -> 586 of 600, the 500's floor held); setAlign(false) is the off switch (header). */
let ALIGN_ON = true;
/** @param {boolean} on */
function setAlign(on) { ALIGN_ON = !!on; }
/* THE SUBSTITUTION LEXICON (search200 B7, 2026-10-18). Word pairs a reader trades when quoting from memory
   (creator for maker, tread for walk), each a share of a typed word's weight align.js gives the text that says
   its partner in its place: a credit inside the alignment, never a query term, so a query some text holds as
   typed is ranked as it was (the alignment does not run for it). The app's is WordNet's, kept to the corpus
   (search-lexicon.json at the assets root, tools/build-wordnet-lex.mjs; tri open 591 -> 593 of 600, the 500's
   floor held). It is fetched beside the index, on the first build: setAlignLexiconSource names the file
   (ui/_entry-d.js), the service worker keeps it offline and verifies it (CORE_ASSETS, ASSET_INTEGRITY), the APK
   packages it (tools/check-apk-assets.js). A text search waits for it at most LEXICON_WAIT_MS, once; a file that
   does not load (offline and never cached, a 404, a redirect, bad JSON) leaves the alignment as it is without
   one, and the next build tries again. setAlignLexicon (the benchmark, tests) sets one directly. */
/** @type {Array<import('./lexicon.js').Lexicon>|null} the lexicons align.js credits; null, none */
let ALIGN_LEXICON = null;
/** @type {string|null} where the lexicon file is fetched from; null, nowhere */
let LEXICON_SOURCE = null;
/** @type {{url: string, done: Promise<void>, settled: boolean, failed: boolean, wait?: Promise<void>, waited?: boolean}|null} the file's load */
let LEXICON_LOAD = null;
/** The longest a text search waits for the lexicon file (the first search after a cold start; it loads with the index). */
const LEXICON_WAIT_MS = 2000;
/**
 * Set the lexicons directly (null: none). The file named by setAlignLexiconSource is no longer read.
 * @param {Array<import('./lexicon.js').Lexicon>|import('./lexicon.js').Lexicon|null} lex
 */
function setAlignLexicon(lex) {
  ALIGN_LEXICON = !lex ? null : Array.isArray(lex) ? lex : [lex];
  LEXICON_SOURCE = null;
  LEXICON_LOAD = null;
}
/**
 * Name the lexicon file (relative to the page), fetched on the next build or text search; null: none.
 * @param {string|null} url
 */
function setAlignLexiconSource(url) {
  LEXICON_SOURCE = url || null;
  LEXICON_LOAD = null;
  ALIGN_LEXICON = null;
}
/**
 * Start (or join) the lexicon file's load. `again`: a load that failed is tried once more (a build).
 * @param {boolean} again
 * @returns {{done: Promise<void>, settled: boolean, wait?: Promise<void>, waited?: boolean}|null}  null when there is no file to load
 */
function loadAlignLexicon(again) {
  const url = LEXICON_SOURCE;
  if (!url || typeof fetch !== 'function') return null;
  if (LEXICON_LOAD && LEXICON_LOAD.url === url && !(again && LEXICON_LOAD.failed)) return LEXICON_LOAD;
  /** @type {{url: string, done: Promise<void>, settled: boolean, failed: boolean, wait?: Promise<void>, waited?: boolean}} */
  const load = { url, done: Promise.resolve(), settled: false, failed: false };
  LEXICON_LOAD = load;
  load.done = fetch(url)
    .then((r) => {
      // a redirected answer is a captive portal or a proxy, not the file
      if (!r.ok || r.redirected) throw new Error('search lexicon: ' + url + ' ' + (r.redirected ? 'redirected' : r.status));
      return r.json();
    })
    .then((j) => {
      if (!j || typeof j.lexicon !== 'string' || !j.lexicon) throw new Error('search lexicon: ' + url + ' holds no lexicon');
      const lex = parseLexicon(j.lexicon);
      if (LEXICON_LOAD === load) ALIGN_LEXICON = [lex];
    })
    .catch(() => { load.failed = true; })
    .finally(() => { load.settled = true; });
  return load;
}
/**
 * Resolves when the lexicon file has loaded or failed, or LEXICON_WAIT_MS has passed; at once when it is settled.
 * The wait is one per load, shared by the searches that join it: once it has run out, a search no longer waits for
 * a file still on its way (S22 B7 look: a held file cost every search 2 s, not the first alone).
 */
function alignLexiconReady() {
  const load = loadAlignLexicon(false);
  if (!load || load.settled || load.waited) return Promise.resolve();
  if (!load.wait) {
    /** @type {any} */ let timer = 0;
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, LEXICON_WAIT_MS); });
    load.wait = Promise.race([load.done, timeout]).finally(() => { clearTimeout(timer); load.waited = true; });
  }
  return load.wait;
}
/** Typed tokens, at least, for the typed words to be aligned as a quote. */
const ALIGN_MIN = 5;
/** The share of the typed words' weight (BM25 idf) a text holds anywhere, as typed or in a form or synonym, to be aligned
    (a typed word no text holding that share holds is left out of the weight: search() below). */
const ALIGN_MASS = 0.5;
/** Texts aligned at most: the best-scored of those holding that share. */
const ALIGN_CANDIDATES = 300;
/** How much of the quote (align.js cov) a text holds, slips allowed for, to lead every text holding less (tier B). */
const ALIGN_HELD = 0.75;
/** How much of the quote a text holds to be held with no text holding ALIGN_HELD, when it holds it far better than the rest (search() below). */
const ALIGN_CLEAR = 0.6;
/** Texts at most holding a clear best alike (a text and its copy) for it to be held so. */
const CLEAR_COPIES = 2;
/** Two covs this near, and a small word's share of the quote (search() below), hold the quote alike: the words' order stands. */
const ALIGN_TIE = 0.02;
/** Typed words, one of them a content word, that read as a quote when held in a row. */
const SMALL_RUN_MIN = 4;
/** Who reprints whom: a text yields only to an original of a LOWER tier (Words To Live By excerpts the letters). */
const ORIGINAL_TIER = { verse: 0, letter: 0, wtlb: 1, blessed: 1, 'holy-day': 2, 'bible-study': 3, answers: 4 };
const ORIGINAL_KINDS = new Set(['verse', 'letter', 'wtlb', 'blessed']);
/** @type {Map<string, string[]>|null} sentence key -> original doc ids */ let ORIGINALS = null;
/** @type {Map<string, any>|null} original doc id -> its stored fields */ let ORIGINAL_DOCS = null;
/** The sentences of a text, as character spans (a sentence ends at . ! ? ; or a line's end). */
function sentenceSpans(text) {
  const out = [];
  const re = /[^.!?;\n]+[.!?;]*/g;
  let m;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  return out;
}
/* HIS NAME AS THE EDITIONS PRINT IT (sr11, 2026-10-15). The studies and the Matthew Study Bible restore His name
   in the verses they quote ("When YahuShua heard these things, He marveled at him"), and the edition the index
   holds prints "Jesus" (Luke 7:9): the study's sentence never met its verse's key, and the study led the verse. */
const RESTORED_NAME = /^(?:yahushua|yeshua|yahshua|yahusha|yeshu)$/;
const nameAsPrinted = (/** @type {string} */ t) => (RESTORED_NAME.test(t) ? 'jesus' : t);
/* ...and the Father's, in a verse (search200 fix1): the editions print "The LORD is my shepherd", so a reader's
   "yahuwah is my shepherd" held no verse's run, and the phrase pass reads a verse with the typed names printed. */
const RESTORED_FATHER = /^(?:yahuwah|yahweh|yhwh|jehovah|yahuah)$/;
/* ...and the Anointed's (search200 fix2): "the love of mashiach" is "the love of Christ" in a verse. */
const RESTORED_ANOINTED = /^(?:hamashiach|mashiach)$/;
const namesAsVersePrints = (/** @type {string} */ t) => {
  const n = restoredNameOf(t);
  return RESTORED_FATHER.test(n) ? 'lord' : RESTORED_ANOINTED.test(n) ? 'christ' : nameAsPrinted(n);
};
/* HIS NAMES, RESTORED OR PRINTED, ARE ONE NAME (search200 fix2). The editions print "Jesus", "Christ", "LORD"
   and "God"; the Volumes print "YahuShua", "HaMashiach" and "YAHUWAH". A typed name met only the texts printing
   it as typed (the synonym groups reach the others at half weight and demote a text found only so), so "for the
   love of mashiach constraineth us" led a letter holding "Mashiach" and "love" over 2 Corinthians 5:14 ("the
   love of Christ"), and "jesus christ is king" led Hebrews 13:8 over the letter "YahuShua HaMashiach Is King".
   A typed name is searched as each of its other forms too, at full weight under its own word, as a name typed in
   parts is. "lord" and "god" typed reach no restored form: they are in nearly every text, and the Volumes print
   them as well. */
const NAME_FORMS = Object.assign(Object.create(null), {
  yahushua: ['jesus'], yeshua: ['yahushua', 'jesus'], yahshua: ['yahushua', 'jesus'], yahusha: ['yahushua', 'jesus'],
  jesus: ['yahushua'],
  hamashiach: ['christ', 'mashiach'], mashiach: ['hamashiach', 'christ'], christ: ['hamashiach', 'mashiach'],
  yahuwah: ['lord', 'god'], yahweh: ['yahuwah', 'lord', 'god'], yhwh: ['yahuwah', 'lord', 'god'],
  jehovah: ['yahuwah', 'lord', 'god'], yahuah: ['yahuwah', 'lord', 'god'],
});
/** One form for each of His names, restored or printed ("jesus" and "yeshua" are yahushua, "christ" hamashiach,
    "jehovah" yahuwah; "lord" and "god" stay), for a title read against the typed words. */
function oneName(/** @type {string} */ t) {
  const n = restoredNameOf(t);
  const f = NAME_FORMS[n];
  if (!f) return t;
  return RESTORED_FATHER.test(n) ? 'yahuwah' : n === 'christ' || RESTORED_ANOINTED.test(n) ? 'hamashiach' : 'yahushua';
}
/** A restored name typed as a possessive without its apostrophe ("yahuwahs", "yahushuas") → the name; else the word. */
function restoredNameOf(/** @type {string} */ t) {
  if (t.length > 4 && t.endsWith('s') && !NAME_FORMS[t]) {
    const n = t.slice(0, -1);
    if (n !== 'jesus' && n !== 'christ' && NAME_FORMS[n]) return n;
  }
  return t;
}
/** A sentence's key: its words as the index reads them, His name as printed; null under five words (too common to mean one text). */
function sentenceKey(s) {
  return tokensKey(kjvEncode(s));
}
/** The key of a sentence read as tokens (a verse's KJV wording, kjv-twin.js). */
function tokensKey(/** @type {string[]} */ toks) {
  return toks.length >= 5 ? toks.map(nameAsPrinted).join(' ') : null;
}
/* Words To Live By cuts its excerpts mid-sentence and the Answers reprints re-punctuate, so a
   whole-sentence key misses them: a letter, Words To Live By or Blessed text is also keyed by
   runs of SHINGLE words, a content-chosen quarter of them (hash % 4 === 0), which both sides
   pick alike wherever the run falls. Verses are short: their sentence keys suffice. */
const SHINGLE = 8;
/** @type {Map<number, string[]>|null} shingle hash -> original doc ids */ let SHINGLES = null;
/** FNV-1a over a run of tokens. */
function runHash(toks, from) {
  let h = 0x811c9dc5;
  for (let i = from; i < from + SHINGLE; i++) {
    const t = toks[i];
    for (let c = 0; c < t.length; c++) h = Math.imul(h ^ t.charCodeAt(c), 16777619);
    h = Math.imul(h ^ 32, 16777619);
  }
  return h >>> 0;
}
/** @param {string[]} toks @param {(h:number) => void} each */
function eachShingle(toks, each) {
  for (let i = 0; i + SHINGLE <= toks.length; i++) { const h = runHash(toks, i); if (h % 4 === 0) each(h); }
}
const addTo = (/** @type {Map<any, string[]>} */ m, /** @type {any} */ k, /** @type {string} */ id) => {
  const list = m.get(k);
  if (!list) m.set(k, [id]);
  else if (list[list.length - 1] !== id) list.push(id);
};
/* A LETTER'S HEADING IS NO ONE'S WORDS (sr11, 2026-10-15). Every Answers excerpt opens with the heading of the letter
   it comes from ("1/29/05 From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy For The Lord's
   Little Flock, and For All Those Who Have Ears to Hear"), and a letter with an addendum or a second word holds one in
   its text (Volume One's "Christmas", Volume Four's "Obey God"). Keyed, that heading's runs named "Obey God" the
   original of any Answers passage the model matched next to a heading, and it led searches about other things
   (benchmark t320 "keep watch", t401 "come out of the churches"). A heading is never keyed. */
const HEADING = /(?:\d{1,2}\/\d{1,2}\/\d{2,4}\s+)?(?:From [^.!?\n]{0,80}?Savior\s+)?[^.!?\n]{0,40}?(?:to|from) Timothy\s+For [^.!?\n]{0,120}?Ears to Hear/gi;
/** Key one stored doc if it is an original: its sentences (a verse's in its KJV wording too, `V`) and, past a verse,
    its runs of words. */
function addOriginal(/** @type {Map<string, string[]>} */ O, /** @type {Map<number, string[]>} */ S, /** @type {Map<string, any>} */ D, /** @type {string} */ id, /** @type {any} */ f,
  /** @type {import('./kjv-twin.js').KjvView|null} */ V, /** @type {number} */ sid) {
  if (!f || !ORIGINAL_KINDS.has(f.kind) || !f.text) return;
  D.set(id, f);
  const text = f.kind !== 'verse' && /ears to hear/i.test(f.text) ? f.text.replace(HEADING, '\n') : f.text;
  for (const sp of sentenceSpans(text)) {
    const k = sentenceKey(sp.text);
    if (k) addTo(O, k, id);
  }
  if (f.kind !== 'verse') eachShingle(kjvEncode(text), (h) => addTo(S, h, id));
  else if (V) for (const toks of twinSentences(V, sid)) { const k = tokensKey(toks); if (k) addTo(O, k, id); }
}
/** The originals, read in one pass if they are not read yet (node; a search that raced a swap). */
function originals() {
  if (ORIGINALS) return ORIGINALS;
  const O = new Map();
  const S = new Map();
  const D = new Map();
  const ids = msIndex._documentIds;
  const V = twinNow();
  for (const [shortId, f] of msIndex._storedFields) addOriginal(O, S, D, ids.get(shortId), f, V, shortId);
  ORIGINAL_DOCS = D;
  SHINGLES = S;
  ORIGINALS = O;
  return O;
}
/* THE ORIGINALS ARE READ A SLICE AT A TIME (sweep W68, 2026-10-14). Reading them is one pass over
   every verse and letter, 440-500 ms on a desktop and seconds on a phone, and the first search after
   each build made it in one block: the page froze under the reader's typing. In a browser they are
   read from an idle moment after the index swaps in, SLICE_MS at a time with the page
   running between slices, and a search that comes first waits for that read before it ranks (the
   Answers coverage reads them as well as originalsFirst). They take effect whole, at the end: CITED
   is built once from ORIGINAL_DOCS and must not be built from a half. Node (the bench, the tools)
   reads them in one pass, as before. */
/** How long a sliced read or ranking holds the page before it gives it a turn (W68, sr7). */
const SLICE_MS = 8;
/** @type {{ms: any, done: Promise<void>}|null} the read under way and the index it reads */ let ORIGINALS_BUILD = null;
/** Give the page a turn: scheduler.yield where the browser has it, else a timer. */
function yieldToPage() {
  const s = /** @type {any} */ (globalThis).scheduler;
  return s && typeof s.yield === 'function' ? s.yield() : new Promise((r) => setTimeout(r, 0));
}
/** Read the originals of `ms` in slices; dropped when another index or KJV wording comes in, or a one-pass read finished first. */
async function readOriginals(/** @type {any} */ ms) {
  if (msIndex !== ms) return;
  const O = new Map();
  const S = new Map();
  const D = new Map();
  const ids = ms._documentIds;
  const twin = TWIN_READ;
  const V = twinNow();
  const stale = () => msIndex !== ms || TWIN_READ !== twin || !!ORIGINALS;
  const it = ms._storedFields[Symbol.iterator]();
  let step = it.next();
  while (!step.done) {
    const end = now() + SLICE_MS;
    for (; !step.done && now() < end; step = it.next()) addOriginal(O, S, D, ids.get(step.value[0]), step.value[1], V, step.value[0]);
    if (step.done) break;
    await yieldToPage();
    if (stale()) return;
  }
  if (stale()) return;
  ORIGINAL_DOCS = D;
  SHINGLES = S;
  ORIGINALS = O;
}
/** Read the token store of `ms` in slices, after the originals; dropped when another index or KJV wording comes in, or a one-pass read finished first. */
async function readStore(/** @type {any} */ ms) {
  const twin = TWIN_READ;
  const stale = () => msIndex !== ms || TWIN_READ !== twin || !!(STORE && STORE.ms === ms);
  if (stale()) return;
  const b = storeBuilder(ms);
  const it = ms._storedFields[Symbol.iterator]();
  let step = it.next();
  while (!step.done) {
    const end = now() + SLICE_MS;
    for (; !step.done && now() < end; step = it.next()) b.add(step.value[0], step.value[1]);
    if (step.done) break;
    await yieldToPage();
    if (stale()) return;
  }
  if (stale()) return;
  STORE = b.done();
}
/* THE ANSWERS EXCERPTS ARE READ AT IDLE TOO (sr7, 2026-10-14). A first search split every Answers topic
   it touched into its excerpts (excerptCover reads a topic one excerpt at a time): 64-140 ms of a first
   search's ranking on a desktop, 1-3 ms of a later one's. After the originals they are read the same way,
   a slice at a time from the idle read; a search that comes first reads those it needs in its own slices.
   The first search filled this cache anyway: a session holds no more than it did. */
/** @type {any} the index whose Answers excerpts are read, or being read */ let EXCERPTS_FOR = null;
async function warmExcerpts(/** @type {any} */ ms) {
  if (EXCERPTS_FOR === ms || msIndex !== ms) return;
  EXCERPTS_FOR = ms;
  const ids = ms._documentIds;
  let end = now() + SLICE_MS;
  for (const [shortId, f] of ms._storedFields) {
    if (!f || f.kind !== 'answers' || !f.text) continue;
    if (now() >= end) {
      await yieldToPage();
      if (msIndex !== ms) return;
      end = now() + SLICE_MS;
    }
    excerpts(ids.get(shortId), f.text);
  }
}
/** Resolves once the index in use has its originals and its token store read (or has been replaced), with the KJV
    wording if its file loads in time (kjvTwinReady); never rejects. */
function warmOriginals() {
  return kjvTwinReady().then(() => { adoptTwin(); return warmRead(); });
}
function warmRead() {
  if (!msIndex || (ORIGINALS && storeNow() && TITLES && TITLES.ms === msIndex)) return Promise.resolve();
  if (typeof document === 'undefined') {
    try { originals(); } catch { /* read again, and caught, where they are used */ }
    try { tokenStore(); } catch { /* the phrase ranking reads each text's tokens anew */ }
    titlesNow();
    return Promise.resolve();
  }
  if (ORIGINALS_BUILD && ORIGINALS_BUILD.ms === msIndex) return ORIGINALS_BUILD.done;
  const ms = msIndex;
  // the titles last, in one task of their own (a search that comes first builds them itself)
  const done = readOriginals(ms).then(() => readStore(ms)).then(() => yieldToPage()).then(() => { if (msIndex === ms) titlesNow(); })
    .catch(() => { if (ORIGINALS_BUILD && ORIGINALS_BUILD.done === done) ORIGINALS_BUILD = null; });
  ORIGINALS_BUILD = { ms, done };
  return done;
}
/* AN ANSWERS EXCERPT NAMES ITS LETTER (search benchmark, 2026-10-05). An Answers topic is a
   chain of letter excerpts, each closed by its source: "~ [From “The Alarm of War” ~ Volume 7]"
   (1,421 of its 1,434 excerpts name a letter, Words To Live By or Blessed text by title). A
   sentence the reader put in other words matches no sentence or run of the letter word for word,
   so the excerpt holding most of the query names the original instead (47 of the 108 open misses
   had an Answers topic first). */
const CITE = /\[\s*From\s+[“"](.+)[”"]\s*~\s*([^\]]*)\]/;
/** A citation's collection, as the corpus names it. */
const CITE_VOLUME = {
  "the lord's rebuke": 'rebuke', "letters to the lord's little flock": 'flock', 'letters from timothy': 'timothy',
  'words to live by: part one': 'wtlb1', 'words to live by: part two': 'wtlb2', 'the blessed': 'blessed',
};
/** How much less of the query the cited letter may hold than its excerpt (an edge word cut). */
const CITE_SLACK = 0.05;
const citeKey =(/** @type {string} */ s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();
/** @type {Map<string, string[]>|null} an original's title (citeKey) -> its doc ids */ let CITED = null;
/** @type {Map<string, Array<{toks: Set<string>, lem: string[], src: string|null}>>} Answers doc id -> its excerpts */
const EXCERPT_CACHE = new Map();
/** An Answers topic's excerpts (each with its words and the original it cites), read once a session. */
function excerpts(/** @type {string} */ id, /** @type {string} */ text) {
  let pieces = EXCERPT_CACHE.get(id);
  if (!pieces) {
    try { originals(); } catch { /* no citations: coverage still reads the excerpts */ }
    pieces = text.split('✦').map((p) => {
      const t = kjvEncode(p);
      return { toks: new Set(t), lem: t.map(lemma), src: ORIGINAL_DOCS ? citedId(p) : null };
    });
    EXCERPT_CACHE.set(id, pieces);
  }
  return pieces;
}
/** The original an excerpt's citation names, or null. */
function citedId(/** @type {string} */ piece) {
  const m = piece.match(CITE);
  if (!m) return null;
  if (!CITED) {
    CITED = new Map();
    for (const [id, f] of /** @type {Map<string, any>} */ (ORIGINAL_DOCS)) if (f.kind !== 'verse' && f.title) addTo(CITED, citeKey(f.title), id);
  }
  const ids = CITED.get(citeKey(m[1].replace(/[”"]\s*$/, '')));
  if (!ids) return null;
  const vol = m[2].trim().toLowerCase().replace(/[’‘]/g, "'");
  const v = /^volume (\d+)$/.exec(vol);
  const want = v ? 'v' + v[1] : CITE_VOLUME[vol];
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  return ids.find((x) => D.get(x).volumeId === want) || (ids.length === 1 ? ids[0] : null);
}
/* AN ANSWERS TOPIC COVERS A QUERY ONE EXCERPT AT A TIME (search benchmark, 2026-10-05). A
   topic of up to 127,000 characters holds nearly any query's every word somewhere, and coverage
   (ranking.js coverageMultiplier, 15x for eight words) paid it as if it held them together: an
   Answers topic came first in 47 of the 108 open misses, over the verse or letter meant. Its
   coverage counts the query words its best single excerpt holds. */
/**
 * @param {string} id  the Answers doc's id
 * @param {string} text
 * @param {Array<[number, string[]]>} hits  each matched word list with the query words (bits) it counts for
 * @returns {number}
 */
function excerptCover(id, text, hits) {
  let best = 0;
  for (const p of excerpts(id, text)) {
    let mask = 0;
    for (const [bits, terms] of hits) if (terms.some((t) => p.toks.has(t))) mask |= bits;
    const c = popcount(mask);
    if (c > best) best = c;
  }
  return best;
}
/** The query's content words as bestWindow reads them, rare words weighing more, and the window's reach;
    `asTyped`: the words themselves, to read a text's tokens (docTokens) rather than its lemmas. */
function passageQuery(/** @type {string[]} */ words, asTyped = false) {
  const n = msIndex.documentCount || 1;
  const seen = new Set();
  const query = [];
  for (const w of words) {
    const lem = asTyped ? w : lemma(w);
    if (seen.has(lem)) continue;
    seen.add(lem);
    const df = docFreq(w);
    query.push({ lem, weight: Math.log(1 + (n - df + 0.5) / (df + 0.5)), syn: new Set() });
  }
  return { query, span: Math.max(12, Math.round(words.length * 1.6)) };
}
/** A text's tokens, lemmatized (LEMMA_CACHE); a verse's KJV wording after its own. */
function docLemmas(/** @type {string} */ id, /** @type {string} */ text) {
  let lem = LEMMA_CACHE.get(id);
  if (!lem) {
    lem = withKjv(msIndex, msIndex._idToShortId.get(id), kjvEncode(text)).map(lemma);
    LEMMA_CACHE.set(id, lem);
    if (LEMMA_CACHE.size > 400) LEMMA_CACHE.delete(/** @type {string} */ (LEMMA_CACHE.keys().next().value));
  }
  return lem;
}
/** A study or Holy Days text below an Answers topic holds what the topic does of the query: STUDY_HELD of the rarity
    (log(1+N/df)) of the typed words the topic holds, its title included (search200 fix1). */
const STUDY_HELD = 0.75;
function holdsTopic(/** @type {string} */ id, /** @type {any} */ d, /** @type {string} */ fid, /** @type {any} */ f, /** @type {string[]} */ words) {
  const tl = new Set(docLemmas(id, d.text || ''));
  for (const x of titleToks(d).all) tl.add(lemma(x));
  const cl = new Set(docLemmas(fid, f.text || ''));
  const n = (msIndex && msIndex.documentCount) || 1;
  let need = 0;
  let got = 0;
  for (const w of new Set(words)) {
    const l = lemma(w);
    if (!tl.has(l)) continue;
    const wt = Math.log(1 + n / Math.max(1, docFreq(w)));
    need += wt;
    if (cl.has(l)) got += wt;
  }
  return !need || got >= STUDY_HELD * need;
}
/** The original `src` holds the query as well as its reprint's passage does (`share`): a reprint words some passages its own way. */
function holdsAsWell(/** @type {string} */ src, /** @type {ReturnType<typeof passageQuery>} */ pq, /** @type {number} */ share) {
  const f = /** @type {Map<string, any>} */ (ORIGINAL_DOCS).get(src);
  return !!f && eachWording(docLemmas(src, f.text), (t) => bestWindow(pq.query, t, pq.span)) >= share - CITE_SLACK;
}
/**
 * The original cited by the Answers excerpt that holds most of the query, or null when none holds half.
 * @param {string} id  the Answers doc's id
 * @param {string} text
 * @param {string[]} words  the query's words, encoded
 */
function citedOriginal(id, text, words) {
  const pq = passageQuery(words);
  let best = 0.5;
  let src = null;
  for (const p of excerpts(id, text)) {
    if (!p.src) continue;
    const s = bestWindow(pq.query, p.lem, pq.span);
    if (s > best) { best = s; src = p.src; }
  }
  return src && holdsAsWell(src, pq, best) ? src : null;
}
/* A WORDS TO LIVE BY ENTRY IS A LETTER CONDENSED (search benchmark, 2026-10-05). Its lines are
   cut from one letter and joined by "...", re-broken and re-capitalized, so no sentence of it is
   the letter's word for word and the matched place alone carries too few of the letter's runs
   (10 open misses: the entry first, its letter below). The whole entry's runs vote once for its
   letter.
   AN ENTRY CUT FROM TWO LETTERS (search200 sealed2, 2026-10-22). Some entries join lines of two letters about evenly
   (Words To Live By Part Two's "A Prophet": 18 of its runs are a Rebuke letter's, 10 a Little Flock letter's). The
   letter had to lead the vote by twice the next one's, so that entry had no letter, and it led its original for a
   line typed whole. A letter giving it CONDENSED_RUNS runs and more than half the leading letter's is one it is cut
   from (the leader alone when it has twice the next one's, as before), most runs first; the first of them holding
   the query as well as the entry does (originalsFirst) is its original there. */
/** Runs an entry shares with a letter for that letter to be one it is cut from. */
const CONDENSED_RUNS = 3;
/** @type {Map<string, string[]>} entry id -> the letters it is cut from, most runs first (none: []) */
const SOURCE_CACHE = new Map();
function condensedFrom(/** @type {string} */ id, /** @type {string} */ text, /** @type {number} */ tier) {
  const known = SOURCE_CACHE.get(id);
  if (known) return known;
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  /** @type {Map<string, number>} */ const votes = new Map();
  eachShingle(kjvEncode(text), (h) => {
    for (const x of /** @type {Map<number, string[]>} */ (SHINGLES).get(h) || []) if (x !== id && ORIGINAL_TIER[D.get(x).kind] < tier) votes.set(x, (votes.get(x) || 0) + 1);
  });
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  const src = ranked.filter((r) => r[1] >= CONDENSED_RUNS && 2 * r[1] > ranked[0][1]).map((r) => r[0]);
  SOURCE_CACHE.set(id, src);
  return src;
}
/* A QUOTE THAT NAMES ITS VERSE (sr11, 2026-10-15). A study quotes Scripture as the KJV words it (“All have sinned,
   and come short of the glory of God.” – Romans 3:23) and the edition the index holds words it otherwise ("fall
   short"), so no key of the verse meets the study's sentence: the reference the study writes after it does. */
const CITED_AFTER = /^[\s"'“”‘’)]*[–—-]\s*((?:[1-3]\s?)?[A-Z][A-Za-z]+(?: of [A-Z][a-z]+| [A-Z][a-z]+)?\.? \d{1,3}:\d{1,3}(?:\s?[-–]\s?\d{1,3})?)/;
/** How many verses of a cited range are read for the one the sentence quotes. */
const CITED_RANGE = 12;
/**
 * The verse a sentence's citation names, when it holds `need` of the query's words; else null.
 * @param {string} after  the text just after the sentence
 * @param {string[]} words  the query's words, encoded
 * @param {number} need
 */
function citedVerse(after, words, need) {
  const m = CITED_AFTER.exec(after);
  if (!m) return null;
  let p;
  try { p = parseReference(m[1]); } catch { return null; }
  if (!p || p.kind !== 'ref-bible' || !p.bookId || !p.chapter || !p.verseStart) return null;
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  const books = p.bookId === 'matthew' || p.bookId === 'matthew-plain' ? ['matthew-study/matthew', 'bible/matthew-plain'] : ['bible/' + p.bookId];
  let best = null;
  let most = need - 1;
  const last = Math.min(p.verseEnd || p.verseStart, p.verseStart + CITED_RANGE - 1);
  for (let v = p.verseStart; v <= last; v++) {
    for (const b of books) {
      const id = unitId(b + ':' + p.chapter + ':' + v);
      const f = id && D.get(id);
      if (!f || f.kind !== 'verse') continue;
      const toks = new Set(kjvEncode(f.text).map(nameAsPrinted));
      const held = words.filter((w) => toks.has(w)).length;
      if (held > most) { most = held; best = id; }
    }
  }
  return best;
}
/**
 * The originals of the sentence(s) an excerpt falls in: the sentence's key, or the verse it cites.
 * @param {string} text
 * @param {string} ex  the excerpt
 * @param {number} at  where it starts
 * @param {Map<string, string[]>} O
 * @param {(ids: string[]|undefined) => string[]} lower  the ids of a lower tier than the reprint's
 * @param {string[]} keyWords  the query's words as a key reads them
 * @param {number} need
 * @param {boolean} cite  the reader typed the quote's words in a row: the verse it cites is its original
 * @param {((has: (x: string) => boolean) => boolean) | null} [rare]  do the typed words a sentence holds (`has`, a typed
 *   word or one of its alts) weigh enough (originalsFirst)
 * @returns {string[]|null}
 */
function sentenceOriginal(text, ex, at, O, lower, keyWords, need, cite, rare = null) {
  if (at < 0) return null;
  for (const sp of sentenceSpans(text)) {
    if (sp.end < at || sp.start > at + ex.length) continue;
    const k = sentenceKey(sp.text);
    if (!k) continue;
    if (keyWords.filter((w) => (' ' + k + ' ').indexOf(' ' + w + ' ') >= 0).length < need ||
      (rare && !rare((x) => (' ' + k + ' ').indexOf(' ' + nameAsPrinted(x) + ' ') >= 0))) continue;
    const l = lower(O.get(k));
    if (l.length) return l;
    if (!cite) continue;
    const v = citedVerse(text.slice(sp.end, sp.end + 48), keyWords, need);
    if (v && lower([v]).length) return [v];
  }
  return null;
}
/**
 * The sentence of the passage the model matched (MEANING_SPAN from `start`) holding the most of the query's words,
 * when it holds more of them than the sentences the excerpt falls in; else null. Its edge characters are left off,
 * so it touches no neighbouring sentence (sentenceOriginal reads every sentence an excerpt touches).
 * @param {string} text
 * @param {number} start  where the model's passage starts
 * @param {string} ex  the excerpt
 * @param {number} at  where it starts
 * @param {string[]} words  the query's words, encoded
 * @returns {{text: string, start: number}|null}
 */
function meantSentence(text, start, ex, at, words) {
  const spans = sentenceSpans(text);
  const held = (/** @type {string} */ s) => { const t = new Set(kjvEncode(s)); return words.filter((w) => t.has(w)).length; };
  let most = held(spans.filter((sp) => sp.end >= at && sp.start <= at + ex.length).map((sp) => sp.text).join(' '));
  let best = null;
  for (const sp of spans) {
    if (sp.end <= start) continue;
    if (sp.start >= start + MEANING_SPAN) break;
    const h = held(sp.text);
    if (h > most) { most = h; best = sp; }
  }
  return best && best.text.length > 2 ? { text: best.text.slice(1, -1), start: best.start + 1 } : null;
}
/** Each typed word's synonyms and forms as the search read them (its units not as typed), and the near-synonyms a
    title meets it by (titles.js nearWords: "holy" for "sacred", the title "Regarding The Holy Days of God"), encoded. */
function typedAlts(/** @type {Array<{term:string, origin:number, literal?:boolean, joined?:boolean}>} */ units, /** @type {string[]} */ filtered) {
  /** @type {Map<string, string[]>} */ const m = new Map();
  const add = (/** @type {string} */ w, /** @type {string[]} */ alt) => m.set(w, (m.get(w) || []).concat(alt));
  for (const u of units) {
    if (u.literal || u.joined || filtered[u.origin] === undefined) continue;
    const alt = kjvEncode(u.term);
    for (const w of kjvEncode(filtered[u.origin])) add(w, alt);
  }
  for (const t of filtered) for (const w of kjvEncode(t)) add(w, nearWords(w).flatMap((x) => kjvEncode(x)));
  return m;
}
/**
 * Move each original ahead of a reprint of it near the top (in place).
 * @param {Array<{score:number, doc:any, terms?:string[], meaningStart?:number}>} out  ranked, best first (meaningStart: meaningFirst's matched passage)
 * @param {Map<any, string>} idOf  each entry's doc id
 * @param {string[]} terms  the words a landing marks (the query's own)
 * @param {(doc:any) => boolean} allowed  the search's corpus and scope filters
 * @param {(doc:any) => boolean} named  the query names this text's title so: it keeps its place
 * @param {(id:string, doc:any) => number} near  how nearly a text holds the typed words in a row (0..1)
 * @param {string[]} [typed]  every typed word, the small ones too: a quote's excerpt is cut by them
 * @param {{has: (id:string) => boolean, cov: (id:string) => number, bar: number}|null} [aligned]  B4's texts holding the
 *   quote with its slips (has), and how much of it a text holds (cov, align.js): a reprint held so gives way only to an
 *   original holding the quote as well as the held do (bar: ALIGN_HELD, or a clear best's cov)
 * @param {Map<string, string[]>|null} [alts]  each typed word's synonyms, forms and title near-synonyms (typedAlts, encoded)
 * @param {boolean} [asked]  the query is a reader's question or a description (askedNotQuoted): a reprint not holding
 *   the typed words as a quote keeps its place
 */
function originalsFirst(out, idOf, terms, allowed, named, near, typed = [], aligned = null, alts = null, asked = false) {
  if (!terms.length) return;
  let O;
  try { O = originals(); } catch { return; }
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  // The matched sentence must hold a fair share of the query's words, not one word of a title.
  const words = [...new Set(terms.flatMap((t) => kjvEncode(t)))];
  const keyWords = words.map(nameAsPrinted);
  const need = Math.min(3, Math.ceil(words.length / 2));
  /* ONE COMMON WORD IS NO SENTENCE OF THE QUERY (search200 fix1, 2026-10-19). Where one typed word is enough for
     `need` (a query of one or two words), the commoner word decided: an Answers topic its title names by the rare
     word reprints a letter's line holding the common one ("people"), and the letter led the topic (hunt topical M4).
     There the matched sentence (or window) holds half the typed words' rarity (log(1+N/df)) as well; a word the
     index lacks weighs as the rarest (df 1), not nothing: "144" of "144 thousand" (the index holds 144000 whole).
     A typed word counts held where a synonym or form the search read for it is, or a near-synonym a title meets it by
     ("holy days" for "the sacred days"). */
  let rare = null;
  if (need <= 1) {
    const n = (msIndex && msIndex.documentCount) || 1;
    const wt = words.map((w) => Math.log(1 + n / Math.max(1, docFreq(w))));
    const all = wt.reduce((a, x) => a + x, 0);
    rare = (/** @type {(x: string) => boolean} */ has) => {
      let h = 0;
      words.forEach((w, i) => { if (has(w) || (alts && (alts.get(w) || []).some(has))) h += wt[i]; });
      return h >= 0.5 * all;
    };
  }
  /* AN ORIGINAL HOLDING THE RUN UP TO A WORD'S FORM (search200 R1, 2026-10-18). A reprint holding the typed run whole
     gives way only to an original holding it as well (B3, below), and "as well" read the words as typed: an Answers
     topic printing a letter's line with one word in another form ("My prophets" where the letter says "My prophet")
     held the run, the letter did not, and the topic led its original. An original holding every typed word in a row,
     each as typed or in another form of it (passage.js lemma), holds it as well.
     ...OR WITH THE WORDS ITS REPRINT CUT (search200 sealed2, 2026-10-22). A Words To Live By entry prints a letter's line
     with a small word or two cut ("I have written it on tablets of stone", where the letter says "For I have indeed
     written it, even on tablets of stone"): the reader typing the entry's words held its run whole, the letter did not,
     and the entry led its original. An original holding every typed word in order, so, within RUN_CUT words more than
     were typed, holds it as well...
     ...WITHIN ONE SENTENCE (sealed2 red team, rt3-08). The words a reprint cut sit inside its line: "the harlot has
     deceived you" was read held by a letter's "the harlot! She has deceived you", two sentences, and the letter led
     the Answers topic holding the line whole. The words between are counted within a sentence of the original (its
     KJV wording read whole, as it has no sentence marks). */
  const typedLemmas = typed.map(lemma);
  /** Does text `x` hold the typed words as nearly as a reprint holding `own` of them in a row (near, 0..1)? */
  const asWell = (/** @type {string} */ x, /** @type {any} */ d, /** @type {number} */ own) => {
    if (near(x, d) >= own - 0.1) return true;
    if (!(own >= 1 && typedLemmas.length >= RUN_MIN && !!d && !!d.text)) return false;
    const mine = kjvEncode(d.text);
    const both = withKjv(msIndex, msIndex._idToShortId.get(x), mine);
    if (tokenRunAt(joinApostropheS(both).map(lemma), typedLemmas) >= 0) return true;
    const w = typedLemmas.length + RUN_CUT;
    const within = (/** @type {string[]} */ toks) => runWithin(joinApostropheS(toks).map(lemma), typedLemmas, w);
    return d.text.split(SENTENCE_END).some((s) => within(kjvEncode(s))) || (both !== mine && within(both.slice(mine.length)));
  };
  for (let i = 0; i < Math.min(out.length, ORIGINAL_REACH); i++) {
    const e = out[i];
    const tier = ORIGINAL_TIER[e.doc.kind];
    if (!tier || !e.doc.text || named(e.doc)) continue;
    // The typed words alone here, not their engine-matched forms the landing reads too: a form tipped one
    // reprint's tie onto a sentence of another letter and the original lost first place (sr11, t158).
    let ex = matchExcerpt(e.doc.text, terms);
    let at = ex ? e.doc.text.indexOf(ex) : -1;
    const lower = (/** @type {string[]|undefined} */ ids) => (ids || []).filter((x) => D.has(x) && ORIGINAL_TIER[D.get(x).kind] < tier);
    // A study's citation names the original of a quote of it, not of a passage described in other words
    // ("passover study about the lamb when god struck the egyptians" asks for the study, not Exodus 12:27).
    const quoted = near(idOf.get(e) || '', e.doc) >= NEAR_PHRASE_MIN;
    // A reprint holding the typed run whole (RUN_MIN words or more) gives way only to an original holding it as
    // well (search200 B3, the tri bench: exact quotes led by a text holding part of them). The letter a sentence's
    // key, its shingles or a cited verse names often words the typed stretch otherwise: the run crosses into a
    // sentence the letter has not, or the reprint changed a word. A run both hold keeps the original first, and
    // with none kept the topic is read as a topic (a letter just below holding the run comes up). A study's verse
    // stays its original: a study quotes Scripture word for word, in the KJV or with His name restored, where the
    // index prints the NKJV (a study quoting Acts 20:16 as the KJV words it).
    const whole = typed.length >= RUN_MIN ? near(idOf.get(e) || '', e.doc) : 0;
    /* A reprint holding the quote with its slips (search200 B4) gives way only to an original holding it as well: the
       letter or verse a sentence's key, its shingles, a cite or the model's passage names may hold another of its lines
       (a study's sentence beside the quote, or the verse a study quotes in another translation's words). */
    const holds = aligned && aligned.has(idOf.get(e) || '') ? aligned : null;
    if (asked && !holds && whole < NEAR_PHRASE_MIN) continue;   // a question or a description is no quote (above)
    // ...a study held as a clear best (under ALIGN_HELD) gives way to the verse it quotes, its original, as keep() has it
    // below: the study prints the verse's reference beside the quote ("John 3:16 For God so loved the world"), and the
    // reference's numbers typed with the quote held the study clear of the verse (search200 sealed2, hunt rt1-shapes-27)
    const quotes = holds && holds.bar < ALIGN_HELD && e.doc.kind === 'bible-study';
    const fit = (/** @type {string[]|null} */ f) => {
      if (!f || !holds) return f;
      const k = f.filter((x) => holds.cov(x) >= holds.bar || (quotes && D.get(x).kind === 'verse'));
      return k.length ? k : null;
    };
    const keep = (/** @type {string[]|null} */ f) => {
      f = fit(f);
      if (!f || whole < 1) return f;
      const k = f.filter((x) => (e.doc.kind === 'bible-study' && D.get(x).kind === 'verse') || asWell(x, D.get(x), whole));
      return k.length ? k : null;
    };
    let found = keep(sentenceOriginal(e.doc.text, ex, at, O, lower, keyWords, need, quoted, rare));
    // A reprint the model found is read where it matched, when that sentence holds more of the query than the
    // excerpt's does and names an original of its own (sr11 t324): the excerpt is the stretch thickest with typed
    // words, and in an Answers topic that was a line of another letter it quotes, which then led the search.
    if (typeof e.meaningStart === 'number' && e.meaningStart >= 0 && at >= 0) {
      const m = meantSentence(e.doc.text, e.meaningStart, ex, at, words);
      const f = m && keep(sentenceOriginal(e.doc.text, m.text, m.start, O, lower, keyWords, need, quoted, rare));
      if (m && f) { found = f; ex = m.text; at = m.start; }
    }
    // A quote held nearly word for word sits where its small words are too ("blessed be the name of our lord":
    // the content words sit thickest in "Blessed are those who Bless the name of The Lord", a line above it).
    if (!found && typed.length > terms.length && quoted) {
      const ex2 = matchExcerpt(e.doc.text, typed);
      const at2 = ex2 ? e.doc.text.indexOf(ex2) : -1;
      if (at2 >= 0 && at2 !== at) {
        found = keep(sentenceOriginal(e.doc.text, ex2, at2, O, lower, keyWords, need, true, rare));
        if (found) { ex = ex2; at = at2; }
      }
    }
    if (!found && at >= 0) {
      // The matched place, a little either side (its edge words may be cut), by its shingles.
      const win = kjvEncode(e.doc.text.slice(Math.max(0, at - 40), at + ex.length + 40)).slice(1, -1);
      if (words.filter((w) => win.indexOf(w) >= 0).length >= need && (!rare || rare((x) => win.indexOf(x) >= 0))) {
        /** @type {Map<string, number>} */ const votes = new Map();
        eachShingle(win, (h) => { for (const x of lower(/** @type {Map<number, string[]>} */ (SHINGLES).get(h))) votes.set(x, (votes.get(x) || 0) + 1); });
        for (const [x, n] of votes) if (n < 2) votes.delete(x);   // two runs shared, not one stray run at the window's edge
        if (votes.size) found = keep([...votes.keys()].sort((a, b) => /** @type {number} */ (votes.get(b)) - /** @type {number} */ (votes.get(a))));
      }
    }
    // A reprint the meaning brought up (meaningFirst noted the passage it matched): that passage's
    // own runs name its original, with no typed word in it to cut an excerpt by.
    if (!found && typeof e.meaningStart === 'number' && e.meaningStart >= 0) {
      /** @type {Map<string, number>} */ const votes = new Map();
      eachShingle(kjvEncode(e.doc.text.slice(e.meaningStart, e.meaningStart + MEANING_SPAN)), (h) => { for (const x of lower(/** @type {Map<number, string[]>} */ (SHINGLES).get(h))) votes.set(x, (votes.get(x) || 0) + 1); });
      for (const [x, n] of votes) if (n < MEANING_VOTES) votes.delete(x);
      if (votes.size) found = keep([...votes.keys()].sort((a, b) => /** @type {number} */ (votes.get(b)) - /** @type {number} */ (votes.get(a))));
    }
    if (!found && e.doc.kind === 'answers') {
      const id = idOf.get(e) || '';
      const src = citedOriginal(id, e.doc.text, words);
      // A quote of the Answers' own wording stays with it, when the letter words it otherwise.
      const own = src ? near(id, e.doc) : 0;
      if (src && (own < NEAR_PHRASE_MIN || asWell(src, D.get(src), own))) found = fit(lower([src]));
    }
    if (!found && (e.doc.kind === 'wtlb' || e.doc.kind === 'blessed')) {
      const id = idOf.get(e) || '';
      const srcs = condensedFrom(id, e.doc.text, tier);
      const pq = passageQuery(words);
      const share = srcs.length ? eachWording(docLemmas(id, e.doc.text), (t) => bestWindow(pq.query, t, pq.span)) : 0;
      const own = srcs.length ? near(id, e.doc) : 0;
      // The entry is cut from its letter: whatever of the query it holds, a letter holding as much comes first
      // (sr11, 2026-10-15: a bar of half the query kept "history has an end and christ is coming" on the entry at
      // 0.46 with its letter holding the same 0.46; Corbin, DECISIONS 10-14: the original first, the reprint second).
      // Cut from two letters: the first of them holding it so (sealed2).
      const src = share > 0 ? srcs.find((x) => holdsAsWell(x, pq, share) && (own < NEAR_PHRASE_MIN || asWell(x, D.get(x), own))) : undefined;
      if (src) found = fit([src]);
    }
    if (!found && e.doc.kind === 'answers') {
      // A study or Holy Days text just below that holds the query as well, in one passage and in a row: it is what Answers reprints.
      // A topic holding none of it (the model found it) is no measure: any text below held "as much" (sr11, 2026-10-15).
      // A topic its title names by a typed word gives way to a study or Holy Days text only, holding what the topic holds
      // of the rarer typed words (search200 fix1): a verse or letter below holding one or two typed words, or a study
      // holding the common ones, took the place of "Regarding Demons" for "what about demons". A topic its title does not
      // name still gives way to any original below holding the query as well: the letter or verse a quote is from.
      // So does a topic its title names, when the reader typed a run of its words (RUN_MIN or more, NEAR_PHRASE_MIN
      // held in a row): a quote's opening words find the letter it is from first ("for the great and terrible day of the").
      const id = idOf.get(e) || '';
      const pq = passageQuery(words);
      const share = eachWording(docLemmas(id, e.doc.text || ''), (t) => bestWindow(pq.query, t, pq.span));
      const own = near(id, e.doc);
      const titled = !(typed.length >= RUN_MIN && own >= NEAR_PHRASE_MIN) && titleToks(e.doc).all.some((x) => words.some((w) => lemma(w) === lemma(x)));
      for (let r = i + 1; r < Math.min(out.length, i + 1 + STUDY_REACH); r++) {
        const f = out[r];
        const t = ORIGINAL_TIER[f.doc.kind];
        if (t === undefined || t >= tier || (titled && t < ORIGINAL_TIER['holy-day']) || !f.doc.text) continue;
        const fid = idOf.get(f) || '';
        if (share > 0 && eachWording(docLemmas(fid, f.doc.text), (t) => bestWindow(pq.query, t, pq.span)) >= share - REPRINT_COST && asWell(fid, f.doc, own) &&
          (!holds || holds.cov(fid) >= holds.bar) && (!titled || holdsTopic(id, e.doc, fid, f.doc, words))) {
          out.splice(r, 1);
          out.splice(i, 0, f);
          i++;
          break;
        }
      }
      continue;
    }
    if (!found || !found.length) continue;
    // The first original of all: a letter before the Words To Live By entry that condenses it.
    const top = Math.min(...found.map((x) => ORIGINAL_TIER[D.get(x).kind]));
    found = found.filter((x) => ORIGINAL_TIER[D.get(x).kind] === top);
    // The original already ranked highest, else the first that the filters allow.
    let j = -1;
    for (let r = 0; r < out.length; r++) if (found.indexOf(idOf.get(out[r]) || '') >= 0) { j = r; break; }
    if (j >= 0 && j < i) continue;
    let entry;
    if (j > i) entry = out.splice(j, 1)[0];
    else {
      const id = found.find((x) => D.has(x) && allowed(D.get(x)));
      if (!id) continue;
      entry = { score: e.score, doc: reshapeDoc(D.get(id)), terms: e.terms || [] };
      idOf.set(entry, id);
    }
    /* THE VERSE IT QUOTES STAYS ABOVE IT (search200 fix1, the hunt bench). A verse holding the quote as well as the
       reprint is the original's own original, so the lift does not put the original over it ("what is truth": John
       18:38 sat between an Answers topic and John 18:37, the verse the topic's sentence names, and 18:37 was lifted
       over it). The verses ranked between the reprint and the original, or within ORIGINAL_REACH of an original
       brought in from outside, that hold the quote the way the original had to (B4's fit, else near and asWell)
       and at least as nearly as the original does, by each measure, move up with it and stay above it, in their own
       order. A verse holding less of it is no original of it: a query of small words ("the presence of the lord is
       an", "he is risen the from the") finds many verses holding most of it, and they stay below. */
    const end = j > i ? j : Math.min(out.length, ORIGINAL_REACH);
    const oid = idOf.get(entry) || '';
    const oNear = near(oid, entry.doc);
    const oCov = holds ? holds.cov(oid) : 0;
    const verses = [];
    for (let r = i + 1; r < end; r++) {
      const v = out[r];
      if (v.doc.kind !== 'verse') continue;
      const vid = idOf.get(v) || '';
      const vNear = near(vid, v.doc);
      if (vNear < oNear) continue;
      if (holds ? holds.has(vid) && holds.cov(vid) >= Math.max(holds.bar, oCov) : vNear >= NEAR_PHRASE_MIN && asWell(vid, v.doc, whole)) verses.push(v);
    }
    for (const v of verses) out.splice(out.indexOf(v), 1);
    out.splice(i, 0, ...verses);
    i += verses.length;
    out.splice(i, 0, entry);
    i++;   // the reprint now sits under it
  }
}
/* THE REPRINT RIGHT AFTER ITS ORIGINAL (sr11, 2026-10-15). Corbin (DECISIONS 10-14) on a letter that Words To Live
   By later excerpts: "what surfaces first? The original, yes. But both should surface, with WTLB being second."
   With the original first, a reprint of the passage it was found by sat anywhere below it (#7, #15, #100 on the
   benchmark). The first text below that holds the passage's words in a row comes up second. A verse first keeps
   its order: the letters quoting it are no reprints of it. */
/** How far below the first result a reprint of its passage is looked for. */
const REPRINT_REACH = 200;
/** Words in a row a reprint shares with the passage (fewer when the sentence is shorter, five at least). */
const REPRINT_RUN = 8;
/** The results the screen shows first (its Best Matches): a verse quoted among them is shown. */
const BEST_SHOWN = 5;
/* THE VERSE A PASSAGE QUOTES, SHOWN WITH IT (search200 R1, 2026-10-18). A letter's line that quotes Scripture ("Or have
   you forgotten this Scripture: For everyone to whom much is given...") was found by the letter's own words, and the
   verse it quotes never came up: the reader saw the letter and not the Scripture it names. A clause of the passage
   that is a verse's sentence word for word (QUOTED_KEY_MIN words or more, His name as printed, and one verse's, not a
   formula many verses say) is that verse quoted: it comes up second, after a reprint of the passage's own words when
   one is shown. A text holding only the quoted words is no reprint of the passage: it quotes the verse too. */
/** Words, at least, of a clause that names the verse it quotes by its sentence. */
const QUOTED_KEY_MIN = 8;
/** The verses (one, or Matthew's two printings of it) whose sentence a passage clause is: [] when none or a formula. */
function quotedVerses(/** @type {string} */ clause) {
  const k = sentenceKey(clause);
  const O = ORIGINALS;
  const D = ORIGINAL_DOCS;
  if (!k || !O || !D || k.split(' ').length < QUOTED_KEY_MIN) return [];
  const ids = (O.get(k) || []).filter((id) => D.has(id) && D.get(id).kind === 'verse');
  const where = new Set(ids.map((id) => { const f = D.get(id); return (f.bookId === 'matthew-plain' ? 'matthew' : f.bookId) + ':' + f.chapterNum + ':' + f.verseNum; }));
  return where.size === 1 ? ids : [];
}
/* AN ANSWERS TOPIC FIRST: ITS PASSAGE'S REPRINT, THEN THE LETTER IT CITES (search200 R1, 2026-10-18). An Answers topic
   that leads (its title typed, a heading of its own) opens on a passage it prints, a heading over a letter's excerpt
   closed by its source ("~ [From “...” ~ Volume 2]"), and neither the other topic printing that passage nor the
   letter came up: the reader saw one reprint, and not its original. As after a letter, the first text below holding
   the passage's words in a row comes up second (the topic's own heading line, the letter's heading cut, HEADING);
   then the text the excerpt cites, unless it is shown already. */
/** HEADING, one match at a time (no lastIndex carried between calls). */
const HEADING_AT = new RegExp(HEADING.source, 'i');
/**
 * @param {Array<{score:number, doc:any, placeStart?:number, terms?:string[]}>} out  ranked, best first, an Answers topic first
 * @param {number} st  where the topic opens
 * @param {number} slot  where the cited text comes (after a reprint moved up second)
 * @param {Map<any, string>} idOf
 * @param {(doc:any) => boolean} allowed
 * @returns {boolean} whether an entry was added
 */
function citedNext(out, st, slot, idOf, allowed) {
  const D = ORIGINAL_DOCS;
  const t = out[0].doc.text;
  if (!D) return false;
  const end = t.indexOf('✦', st);
  const id = citedId(t.slice(t.lastIndexOf('✦', st) + 1, end < 0 ? t.length : end));
  if (!id) return false;
  const r = out.findIndex((e) => idOf.get(e) === id);
  if (r >= 0 && r < BEST_SHOWN) return false;
  if (r > slot) { out.splice(slot, 0, out.splice(r, 1)[0]); return false; }
  const f = D.get(id);
  if (!f || !allowed({ ...f, id })) return false;
  const entry = { score: out[slot - 1].score, doc: reshapeDoc(f), terms: out[0].terms || [] };
  idOf.set(entry, id);
  out.splice(slot, 0, entry);
  return true;
}
/**
 * @param {Array<{score:number, doc:any, placeStart?:number, terms?:string[]}>} out  ranked, best first
 * @param {string[]} terms  the words a landing marks
 * @param {Map<any, string>} [idOf]  each entry's doc id (with `allowed`: the verse a passage quotes may come up)
 * @param {(doc:any) => boolean} [allowed]  the search's corpus and scope filters, and its dedup
 * @returns {boolean} whether an entry was added
 */
function reprintSecond(out, terms, idOf, allowed) {
  if (out.length < 3 || !terms.length) return false;
  const first = out[0];
  const d = first.doc;
  if (!d.text || !(d.kind === 'letter' || d.kind === 'wtlb' || d.kind === 'blessed' || (d.kind === 'answers' && idOf && allowed))) return false;
  // the passage it was found by: the sentence it opens on, else the one where the typed words sit thickest
  let st = typeof first.placeStart === 'number' && first.placeStart >= 0 ? first.placeStart : -1;
  if (st < 0) { const ex = matchExcerpt(d.text, terms, undefined, first.terms); st = ex ? d.text.indexOf(ex) : -1; }
  if (st < 0) return false;
  const topic = d.kind === 'answers';
  const spans = sentenceSpans(d.text);
  const at = spans.findIndex((x) => x.end > st);
  const sp = at >= 0 ? spans[at] : null;
  let toks = sp ? kjvEncode(sp.text) : [];
  // an Answers topic's sentence running into the heading of the letter it prints: the topic's own line before it
  // (its heading), else the letter's words after it; the letter's heading is no one's words (HEADING)
  if (topic && sp) {
    const h = HEADING_AT.exec(sp.text);
    if (h) toks = kjvEncode(h.index > 0 ? sp.text.slice(0, h.index) : sp.text.slice(h[0].length));
  }
  // the verse it quotes: a clause of the reader's sentence (to its . ! or ?), whole or after a colon or opening quote
  /** @type {string[]} */ let verses = [];
  if (sp && idOf && allowed && !topic) {
    for (let j = at; j < Math.min(spans.length, at + 3) && !verses.length; j++) {
      const s = spans[j].text;
      const cut = s.search(/[:“"]/);
      verses = quotedVerses(s);
      if (!verses.length && cut > 0) {
        verses = quotedVerses(s.slice(cut + 1));
        // the passage's own words are those before the quote
        if (verses.length && j === at) toks = kjvEncode(s.slice(0, cut));
      } else if (verses.length && j === at) toks = [];
      if (/[.!?]\s*$/.test(s)) break;
    }
  }
  /* a reprint of the passage's own words: the first text below holding a run of them, the one holding the most of its
     runs first (search200 sealed2, 2026-10-22: a letter sharing only the sentence's last words, "for they have refused
     to accept Me as I truly am", came up second, and the Answers topic reprinting the whole sentence stayed at #12) */
  let slot = 1;
  if (toks.length >= 5) {
    const runs = toks.length <= REPRINT_RUN ? [toks] : [0, (toks.length - REPRINT_RUN) >> 1, toks.length - REPRINT_RUN].map((i) => toks.slice(i, i + REPRINT_RUN));
    const esc = (/** @type {string} */ t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /* search200 audit n217 (s07.6): this scan cost 1.29 ms a search on a desktop over the open tri and hunt queries
       (20 ms at most), up to 200 long texts and three patterns each. A word edge looked behind for, not matched, lets
       the pattern start on its first letter (about a third less a text), and a text stops being read once the patterns
       left cannot carry it past the best so far. The same text comes up. */
    const res = runs.map((run) => new RegExp('(?<![a-z0-9])' + run.map(esc).join('[^a-z0-9]+') + '(?![a-z0-9])', 'i'));
    let best = 0;
    let most = 0;
    for (let r = 1; r < Math.min(out.length, REPRINT_REACH) && most < res.length; r++) {
      const t = out[r].doc.text;
      if (!t || out[r].doc.kind === 'verse') continue;
      let n = 0;
      for (let k = 0; k < res.length && n + res.length - k > most; k++) if (res[k].test(t)) n++;
      if (n > most) { most = n; best = r; }
    }
    if (best) { if (best > 1) out.splice(1, 0, out.splice(best, 1)[0]); slot = 2; }
  }
  if (topic) return citedNext(out, st, slot, /** @type {Map<any, string>} */ (idOf), /** @type {(doc:any) => boolean} */ (allowed));
  if (!verses.length || !idOf || !allowed) return false;
  // ...and after it the verse quoted, unless it is shown already
  const r = out.findIndex((e) => verses.indexOf(idOf.get(e) || '') >= 0);
  if (r >= 0 && r < BEST_SHOWN) return false;
  if (r > slot) { out.splice(slot, 0, out.splice(r, 1)[0]); return false; }
  const D = /** @type {Map<string, any>} */ (ORIGINAL_DOCS);
  const id = verses.find((x) => allowed({ ...D.get(x), id: x }));
  if (!id) return false;
  const entry = { score: out[slot - 1].score, doc: reshapeDoc(D.get(id)), terms: first.terms || [] };
  idOf.set(entry, id);
  out.splice(slot, 0, entry);
  return true;
}
/** @type {Promise<boolean>|null} */ let building = null;
/** The edition the build under way is for. */
/** @type {string|null} */ let buildingFor = null;
let ready = false;
/** @type {Error|null} */ let buildError = null;
/** `sig`: what the index was built from (cache.js dataSignature), for the check that it still is. */
/** `restoredIn`: where a warm index was read, the search worker or the page (sr9). */
/** @type {{docCount?:number, buildMs?:number, collectMs?:number, insertMs?:number, cached?:boolean, translation?:string, sig?:string, restoredIn?:string}} */ let stats = {};

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

/** Pick only the contract fields onto a clean result doc. */
function reshapeDoc(r) {
  const doc = {};
  for (let i = 0; i < MS_STORE_FIELDS.length; i++) {
    const f = MS_STORE_FIELDS[i];
    doc[f] = r[f];
  }
  return doc;
}

/** Put a built or restored index in use. The caches read from the last one go with it: a new index is
    new texts behind the same ids (a translation change), and the phrase ranking's token cache must not
    outlive the index it was read from. Cleared here, at the swap, not when the build starts: a search on
    the old index while the new one builds would fill them again with the old texts. */
function swapIn(/** @type {any} */ ms, /** @type {typeof stats} */ st) {
  STORE = null;
  TITLES = null;
  TITLE_TOKS.clear();
  ORIGINALS = null;
  ORIGINALS_BUILD = null;
  EXCERPTS_FOR = null;
  ORIGINAL_DOCS = null;
  SHINGLES = null;
  CITED = null;
  VERSE_IDS = null;
  REF_FACTS = null;
  UNIT_IDS = null;
  LEMMA_CACHE.clear();
  EXCERPT_CACHE.clear();
  SOURCE_CACHE.clear();
  msIndex = ms;
  ready = true;
  buildError = null;
  stats = st;
  if (typeof document !== 'undefined') onIdle(() => { warmOriginals().then(() => warmExcerpts(ms)).catch(() => {}); }, { timeout: 2000, fallbackDelay: 300 });
}

/* THE WARM INDEX IS READ ON THE SEARCH WORKER (sr9, 2026-10-14). MiniSearch.loadJSON restored it in one block on
   the page's thread: JSON.parse of ~21 MB, then a Map per document field and per term, 244-262 ms on the S22
   inside init. The search worker (worker-client.js) reads and parses it and hands it over in parts
   (index-transfer.js), each received in a short task here. Where there is no worker (node, a WebView that does
   not hand one the app's files, a worker that failed or does not answer) the page reads it, as before.
   The worker is given up when it sends nothing for RESTORE_QUIET_MS: each part starts the wait again, so a slow
   phone's restore is never cut off while its parts are still coming (sr9 refuter r1). */
const RESTORE_QUIET_MS = 20000;
/* "REBUILD THE INDEX" BUILDS IT (sweep 2026-10-14 v100). rebuild() dropped the warm cache without waiting, and the
   build it started read the cache before the delete landed and swapped the same index back in. The next build
   after a rebuild() reads no cache, whichever call starts it (a search waiting on the index can). */
let coldNext = false;

/* A BUILD THE APP STARTS AT LAUNCH RUNS IN IDLE TIME (search200 wave 3, U10.3). init({ background: true })
   builds a chunk per idle turn (bounded by IDLE_TURN_MS), so a reader turning pages meanwhile is never behind
   it. Any other init (the Search screen, a search) takes the build to full speed from its next chunk. */
const IDLE_TURN_MS = 1000;
let paceIdle = false;
/** @type {null | (() => void)} ends the idle turn a background build is waiting on */
let hurryTurn = null;
/** The wait between two chunks of a build: the next task, or the next idle turn for a background build. */
function buildTurn() {
  if (!paceIdle) return new Promise((r) => setTimeout(r, 0));
  return new Promise((r) => {
    let over = false;
    const end = () => { if (over) return; over = true; hurryTurn = null; r(undefined); };
    const cancel = onIdle(end, { timeout: IDLE_TURN_MS, fallbackDelay: 16 });
    hurryTurn = () => { cancel(); end(); };
  });
}
/** The cached index for `sig`, or null when there is none. @returns {Promise<{ms: any, where: string}|null>} */
async function restoreIndex(/** @type {string} */ sig) {
  const w = searchWorker();
  if (w) {
    try {
      /** @type {ReturnType<typeof indexAssembler>|null} */ let asm = null;
      const r = await w.request('restore', { sig }, (/** @type {any} */ m) => {
        if (m.head) asm = indexAssembler(MiniSearch, m.head, buildMiniSearchOptions());
        else if (asm) asm.add(m.part, m.entries);
        else throw new Error('search worker: a part before the head');
      }, RESTORE_QUIET_MS);
      // a miss is checked here too: a worker with no Cache API sees none where the page has one
      if (!r.miss && asm) return { ms: /** @type {any} */ (asm).ms, where: 'worker' };
    } catch { /* the page reads it */ }
  }
  const json = await loadCached(sig);
  return json ? { ms: MiniSearch.loadJSON(json, buildMiniSearchOptions()), where: 'page' } : null;
}

/** Build the in-memory index for one translation (chunked for onProgress). `persist: false` keeps it
    out of the warm cache (a corpus failed to load: that index must not replace a whole one there). */
async function build(options) {
  options = options || {};
  const code = options.translation || 'nkjv';
  const sig = dataSignature(code);

  // Warm cache: restore the serialized index (~0.3s) instead of rebuilding (~10s), unless rebuild() asked.
  const cold = coldNext;
  coldNext = false;
  if (!cold) {
    try {
      const tc = now();
      const restored = await restoreIndex(sig);
      if (restored) {
        const ms = restored.ms;
        swapIn(ms, { docCount: ms.documentCount, buildMs: Math.round(now() - tc), cached: true, translation: code, sig, restoredIn: restored.where });
        if (options.onProgress) options.onProgress(ms.documentCount, ms.documentCount);
        return;
      }
    } catch { /* corrupt / blocked cache — fall through to a fresh build */ }
  }

  // Cold build: collect docs (fast, ~55ms) then index (the slow part, ~10s —
  // chunked so the progress bar animates and the UI stays responsive). The
  // signature is read again with the docs, in the same task: a corpus that
  // arrived while the cache was read is in both or in neither.
  const t0 = now();
  const builtSig = dataSignature(code);
  const docs = buildDocs({ translation: shownEdition(code) });
  const t1 = now();
  const ms = new MiniSearch(buildMiniSearchOptions());
  // 500 at a time: a chunk of 2,000 held the main thread for about a second on a
  // slow phone (UI audit 2026-09-27), and the box stalled under the reader's typing.
  const CHUNK = 500;
  for (let i = 0; i < docs.length; i += CHUNK) {
    ms.addAll(docs.slice(i, i + CHUNK));
    if (options.onProgress) options.onProgress(Math.min(i + CHUNK, docs.length), docs.length);
    await buildTurn();
  }
  if (options.onProgress) options.onProgress(docs.length, docs.length);
  const t2 = now();
  swapIn(ms, {
    docCount: docs.length,
    buildMs: Math.round(t2 - t0),
    collectMs: Math.round(t1 - t0), // buildDocs (tokenizer-bound)
    insertMs: Math.round(t2 - t1), // MiniSearch addAll (index-bound)
    cached: false,
    translation: code,
    sig: builtSig,
  });
  if (options.persist === false) return;
  // Persist for next session (fire-and-forget) once the reader is not waiting on it:
  // serializing the index is one long task (1.7 s on a slow phone), and it ran the
  // moment the build finished, so the first search froze behind it (UI audit
  // 2026-09-27).
  onIdle(() => { saveCached(builtSig, JSON.stringify(ms)).catch(() => {}); }, { timeout: 15000, fallbackDelay: 3000 });
}

/* EVERY TEXT, FOR THE READER'S EDITION, BEFORE THE INDEX IS BUILT (sweep W2, 2026-10-13). buildDocs
   reads the lazy corpus globals and skips, silently, any not loaded yet. Search waited for them on
   mount only, so a query already there ("search this", a restored tab) or typed while they loaded
   built from what had arrived: VOT letters, Answers or the studies could be missing from every search
   for the session, and that partial index was cached over the whole one. A mount with no edition
   built NKJV for a KJV reader, and a search during it was answered in NKJV words. So init loads the
   corpora itself, whoever calls it, and builds for the edition asked; an index built from other data
   than the corpora hold now (the signature differs: another edition, a corpus loaded since) is built
   again, and a build under way for other data is followed by one for this, never returned for it. */
/** The lazy loaders of every corpus the index reads (index.html, translations.js), each a window global. */
const CORPUS_LOADERS = ['__loadBibleCorpus', '__loadMatthewCorpus', '__loadVotCorpus', '__loadAnswersCorpus', 'loadBibleStudies'];

/** Load every corpus and the edition's own text. Resolves true when all of them loaded: a failed load
    leaves its global out, which the signature records, so the index is built again once it loads. */
function loadCorpora(/** @type {string} */ code) {
  const w = /** @type {any} */ (globalThis);
  const call = (/** @type {any} */ fn, /** @type {any[]} */ args) => Promise.resolve().then(() => fn(...args)).then((r) => r !== false, () => false);
  const loads = CORPUS_LOADERS.filter((n) => typeof w[n] === 'function').map((n) => call(w[n], []));
  if (code !== 'nkjv' && typeof w.loadTranslation === 'function') {
    loads.push(call(w.loadTranslation, [code]).then((ok) => ok && !!w['BIBLE_' + code.toUpperCase()]));
  }
  return Promise.all(loads).then((oks) => oks.every(Boolean));
}

/* THE EDITION THE READER CAN SHOW (search200 wave 3, RC.6, 2026-10-23). The Bible shows an edition only while its
   text is in memory (translations.js isTranslationLoaded), else NKJV. Offline, WEB picked and not on the phone, the
   index was built "for WEB": NKJV words badged WEB, and a sparse overlay without its own text read its base's words,
   which the reader never shows. The docs are built from the edition shown; the signature still names the one picked
   with its text absent, so the index is built again the moment that text is in memory. */
/** @returns {string} */
function shownEdition(/** @type {string} */ code) {
  if (code === 'nkjv') return code;
  // translations.js's own rule (it is not a bundle-d global): the text in memory, and a sparse overlay's base too
  const w = /** @type {any} */ (globalThis);
  if (!w['BIBLE_' + code.toUpperCase()]) return 'nkjv';
  // index.html's registry is a top-level const, a global binding and no property of globalThis: read it by its name
  const opts = typeof TRANSLATION_OPTIONS !== 'undefined' ? TRANSLATION_OPTIONS : w.TRANSLATION_OPTIONS;
  const opt = Array.isArray(opts) ? opts.find((/** @type {any} */ o) => o && o.id === code) : null;
  const base = opt && opt.base;
  return !base || base === 'nkjv' || w['BIBLE_' + String(base).toUpperCase()] ? code : 'nkjv';
}

/** The edition a call means: the one it names, else the one built or being built, else NKJV. */
function editionOf(/** @type {{translation?:string}|undefined} */ options) {
  return (options && options.translation) || buildingFor || stats.translation || 'nkjv';
}

/** Whether the index in use was built for this edition from the data the corpora hold now. */
function isCurrent(/** @type {{translation?:string}|undefined} */ options) {
  const code = editionOf(options);
  return ready && stats.translation === code && stats.sig === dataSignature(code);
}

/**
 * Build (or rebuild) the index for an edition from every corpus. Concurrent calls
 * for the same data share one build. SearchScreen calls this on mount; the app calls it at launch
 * with `background: true` (search/warm-at-launch.js), which builds in idle time until another call asks.
 * @param {{translation?:string, onProgress?:(done:number,total:number)=>void, background?:boolean}} [options]
 * @returns {Promise<boolean>}
 */
function init(options) {
  const code = editionOf(options);
  const opts = { ...options, translation: code };
  // someone is waiting for this index now: a background build goes at full speed from here
  if (!opts.background && paceIdle) { paceIdle = false; if (hurryTurn) hurryTurn(); }
  loadAlignLexicon(true); // beside the corpora (B7): a text search waits for it, not the build
  loadKjvTwin(true); // the KJV wording too (kjv-twin.js), waited for the same way
  // One build at a time (each swaps in its index): this call is looked at again when it ends.
  // A build for this edition that fails fails this call; one for another edition does not.
  if (building) return buildingFor === code ? building.then(() => init(opts)) : building.then(() => init(opts), () => init(opts));
  return loadCorpora(code).then((all) => {
    if (building) return init(opts); // another call started one while the corpora loaded
    if (isCurrent(opts)) return true;
    buildingFor = code;
    paceIdle = !!opts.background;
    building = build({ ...opts, persist: all })
      .then(() => { building = null; buildingFor = null; paceIdle = false; startMeaningWhenIdle(); return true; })
      .catch((e) => { building = null; buildingFor = null; paceIdle = false; buildError = e; throw e; });
    return building;
  });
}

/** The meaning search loads once the words index is up, when the page is idle (the browser only: node callers start it). */
function startMeaningWhenIdle() {
  if (typeof document === 'undefined') return;
  onIdle(() => { startSemantic(); }, { timeout: 20000, fallbackDelay: 5000 });
}

async function ensureReady(options) {
  if (isCurrent(options)) return;
  await init(options);
}

/**
 * Execute a search.
 * @param {string} query
 * `limit` caps the hits in all; `perVolume`, when given, caps each collection's own
 * (doc.volumeId: 'bible', 'v7', 'answers'...). A single total let the Bible's verses
 * fill the whole budget in the All corpus: "love" kept 90 of its 379 volume hits and
 * "lord" 125 of 890, with no sign anything was missing. `capped` names every
 * collection that hit its cap (it may hold more), `truncated` says the total did.
 * `_corrected` is the engine's own: this search is a corrected query's re-run.
 * @param {{translation?:string, useStopWords?:boolean, synonyms?:boolean, scope?:{bookId?:string,volumeId?:string}|null, corpus?:string, limit?:number, perVolume?:number, allWords?:boolean, _corrected?:boolean, _unquoted?:boolean, signal?:{aborted:boolean}}} [options]
 * `signal`: when it is aborted the search stops at its next turn and returns `aborted: true`, no results (sr7).
 * `corrections` lists each typed word that found nothing of its own and was
 * searched as the nearest indexed word instead ({ from: 'shephard', to: 'shepherd' }).
 * `meaningLater`: a text search the meaning model was not ready for ran on the words alone; whenMeaningReady() says when to ask again.
 * @returns {Promise<{parsed:Object|null, results:Array<{score:number, doc:Object, terms?:string[], close?:boolean, placeStart?:number}>, parsedTerms?:string[], textQuery?:Object|null, capped?:string[], truncated?:boolean, corrections?:Array<{from:string, to:string}>, stopWordsOnly?:boolean, unquoted?:string, aborted?:boolean, meaningLater?:boolean}>}
 */
async function searchWords(query, options) {
  options = options || {};
  let limit = options.limit || 200;
  const corpus = options.corpus || 'all';

  /* THE PARSE GOES FIRST, BECAUSE IT NEEDS NO INDEX (search-6). `parseReference`
     reads only the `searchData()` tables, which ship in bundle-a and are loaded
     before the app renders — the suggest box already relies on that, answering at
     one character with no index at all.

     `await ensureReady` used to sit above this line, so a command and every
     structured reference waited for a ~10 s cold build and then returned
     `results: []` without ever touching MiniSearch. The reader typed "gen 1" and
     got nothing for ten seconds, for a lookup the index has no part in.

     ONLY THE TEXT BRANCH WAITS NOW, and it waits in the same place it always did
     — the wait was moved, not removed. A case asserts a text query still builds,
     because "the index was not built" is otherwise satisfied by a search() that
     stopped building for everything. */
  query = expandContractions(query);
  let parsed = readReference(query, { corpus });
  if (!parsed) return { parsed: null, results: [] };
  // Command + structured references (bible / book / letter / named-passage) are
  // answered by a direct-nav card built in the UI — skip text search entirely.
  // ...unless the reference may be words too ("rebuke one": ref-parser's alsoText), which are searched under the card.
  if (NAV_ONLY_KINDS.has(parsed.kind) && !parsed.alsoText) return { parsed, results: [], parsedTerms: [], textQuery: null };

  await ensureReady(options);
  await warmOriginals();
  await alignLexiconReady();
  // a search the screen moved past while it waited to start stops here, not at its first page turn (search200 bugcheck #11)
  if (options.signal && options.signal.aborted) return { parsed, results: [], aborted: true };
  // rebuild() dropped the index while this search waited (sweep 2026-10-14 v061): it waits for the new one
  if (!msIndex) return searchWords(query, options);
  /* A REFERENCE TYPED WITH WORDS (search200 fix1, ref-edge.js): "john 3 16 for god so loved the world" is the
     verse's card, and the words beside the reference are what is searched under it (`textQ`), not its numbers and
     book name as words a text must hold. Read here, once the index can say the verse is there. */
  if (parsed.kind === 'text') {
    const edge = edgeReading(query, { corpus }, refFacts());
    if (edge) parsed = edge;
    if (NAV_ONLY_KINDS.has(parsed.kind) && !parsed.alsoText) return { parsed, results: [], parsedTerms: [], textQuery: null };
  }
  const typedQ = typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text : query;
  const textQ = undescribed(typedQ);
  /* A question read by its frame (questionFrame), for the gates that turn the meaning on. Not a query some text holds
     word for word, whole ("who do men say that i am" is Mark 8:27 asked, not a question about men): that is a quote.
     Nor a run too common to settle it (runHolders null): a short question of common words is more likely a quote than
     a subject. Nor one with operators or a quoted phrase. */
  let frame = parsed.kind === 'text' && options.useStopWords !== false && !/["+]|(^|\s)-\S/.test(textQ) ? questionFrame(textQ) : null;
  if (frame) {
    const hs = runHolders(joinApostropheS(kjvEncode(textQ)));
    if (!hs || hs.size) frame = null;
  }

  /* THE RANKING GIVES THE PAGE TURNS (sr7, 2026-10-14). With the originals read, a first search still
     ranked in one block: 110-400 ms on a desktop, about 350 ms on the S22, under the reader's typing. In
     a browser it gives the page a turn whenever SLICE_MS is spent, in its loops over units, hits and
     candidates (node, the bench and the tools, ranks in one pass). An index swapped in meanwhile (another
     edition) starts the search over on it; a search the screen has moved past (`signal` aborted) stops
     at its next turn instead of ranking for nobody. */
  const inUse = msIndex;
  const twinInUse = TWIN_READ;
  const sliced = typeof document !== 'undefined';
  let sliceEnd = now() + SLICE_MS;
  const spent = () => sliced && now() >= sliceEnd;
  /** The page's turn: null to go on, else what this search returns (stopped, or run again on the new index or KJV wording). */
  const pause = async () => {
    await yieldToPage();
    sliceEnd = now() + SLICE_MS;
    if (options.signal && options.signal.aborted) return { parsed, results: [], aborted: true };
    if (msIndex !== inUse || TWIN_READ !== twinInUse) return searchWords(query, options);
    return null;
  };

  /* search-2— A BARE BOOK NAME AND A NAMED-PASSAGE KEY KEEP THEIR CARD AND ALSO
     RUN THE TEXT PIPELINE. Until now every non-text parse returned `results: []`,
     so a reader who typed "Revelation" got a card to the book and not one verse
     containing the word. The cost landed on the book names that are also ordinary
     English words: Numbers, Judges, Kings, Chronicles, Job, Psalms, Proverbs,
     Song, Acts, Revelation, Lamentations, James, Jude.

     The card is untouched — SearchScreen already renders direct entries ABOVE the
     results list — so the reader who wanted the book loses nothing and the reader
     who wanted the word stops being told there is nothing. Agent design
     (2026-09-06): card first, text below, capped; the full results stay reachable.

     `parsed` stays the NAV kind, because that is what builds the card; the text
     pipeline needs the same query parsed as TEXT, which is what `p` is. Two
     readings of one query, and the return carries both. */
  const navAlso = parsed.kind !== 'text';
  const useStop = options.useStopWords !== false;
  const read = navAlso || textQ !== typedQ ? parseTextQuery(textQ) : parsed;
  /* A BARE WORD BESIDE A QUOTED PHRASE IS A WORD THE TEXT HOLDS (sweep 2026-10-14 v001). Only the phrase was
     searched, so '"love one another" brethren' showed every text holding the phrase, ranked and marked as if
     "brethren" was never typed. It narrows the phrase as a +word does (a small word aside); a phrase and word
     no text holds together fall back to the words unquoted, as a quote nothing holds does. */
  let p = read.phrase && read.terms && read.terms.length
    ? { ...read, must: read.must.concat(read.terms.map(withoutPossessive).filter((t) => !(useStop && isStopTerm(t)))), terms: [] }
    : read;
  // `allWords`: the reader asked for every match under the card (SearchScreen).
  if (navAlso && !options.allWords) limit = Math.min(limit, NAV_TEXT_LIMIT);
  const D = searchData();
  const terms = (p.phrase ? p.phrase.split(/\s+/) : p.terms.map(withoutPossessive)).concat(p.must);

  // All-stop-word query → no searchable content. Not a quoted phrase: "and it was so" (Genesis 1), quoted,
  // means those words in that order, which the phrase filter checks (sweep 2026-10-14 v016). One small word
  // in quotes ("the") is no run of words: it is in nearly every verse, quoted or not.
  const quotedRun = !!p.phrase && kjvEncode(p.phrase).length >= 2;
  /* ...but SMALL_RUN_MIN small words or more, unquoted, are a run of words (search200 B3): "and it was so" found
     nothing unless quoted. They are searched as the run, as if quoted (every text shown holds it), and the card marks
     the run; a run no text holds is the small words alone, as before. */
  // (the words as typed: the parse eats "AND", "OR" and "NOT" typed in capitals as operators)
  const smallRun = useStop && !quotedRun && !p.phrase && !options._unquoted && !p.must.length && !p.mustNot.length &&
    terms.length && terms.every(isStopTerm) && kjvEncode(textQ).length >= SMALL_RUN_MIN ? String(textQ).trim() : '';
  const stopOnly = { parsed, results: [], parsedTerms: [], textQuery: null, stopWordsOnly: true };
  if (smallRun) p = { ...p, phrase: smallRun, terms: [] };
  else if (useStop && !quotedRun && terms.length && terms.every(isStopTerm)) return stopOnly;
  let filtered;
  if (!useStop || terms.length <= 4) filtered = terms.slice();
  else { filtered = terms.filter((t) => !isStopTerm(t)); if (!filtered.length) filtered = terms; }
  if (!filtered.length && !p.phrase) return { parsed, results: [], parsedTerms: filtered, textQuery: p };

  // Build search units (literal + synonyms).
  let units;
  let didExpand = false;
  if (p.phrase) {
    units = [{ term: p.phrase, origin: 0, literal: true }];
  } else {
    const ex = expandQueryTerms(filtered, { enabled: options.synonyms !== false });
    units = ex.units;
    didExpand = ex.didExpand;
    /* WORD FORMS (2026-09-26). A literal word reaches only forward through its
       prefix ("flood" finds flooding; "flooding" never finds flood), so typing
       "prayed" missed 397 of the 463 pray-family results. Each one-word literal
       adds its family (word-forms.js) as exact, non-literal units under the
       same origin: they count toward the word's coverage, a doc found only
       through them takes the synonym demotion, so the typed form ranks first,
       and a form not in the index finds nothing. Never for a phrase. */
    const had = new Set(units.map((u) => String(u.term).toLowerCase()));
    const forms = [];
    for (const u of units) {
      if (!u.literal) continue;
      const toks = kjvEncode(u.term);
      if (toks.length !== 1) continue;
      for (const f of wordForms(toks[0], (w) => D.STOP_WORDS_TRIMMED.has(w))) {
        if (had.has(f)) continue;
        had.add(f);
        forms.push({ term: f, origin: u.origin, literal: false, form: true });
      }
    }
    if (forms.length) { units = units.concat(forms); didExpand = true; }
    /* A NAME TYPED IN PARTS (search audit 2026-09-27). The Volumes write HaMashiach
       and YahuShua as one word, so "Ha Mashiach" found only the texts that split it.
       Two typed words side by side that the index holds as one word are searched as
       that word too, standing for both (its `cover`). */
    for (let i = 0; i + 1 < filtered.length && i + 1 < 31; i++) {
      const a = kjvEncode(filtered[i]);
      const b = kjvEncode(filtered[i + 1]);
      if (a.length !== 1 || b.length !== 1) continue;
      // not with a stop word: "in deed" is not "indeed"
      if (D.STOP_WORDS_TRIMMED && (D.STOP_WORDS_TRIMMED.has(a[0]) || D.STOP_WORDS_TRIMMED.has(b[0]))) continue;
      const joined = a[0] + b[0];
      if (joined.length < 5 || had.has(joined) || !termExists(joined)) continue;
      had.add(joined);
      units.push({ term: joined, origin: i, cover: (1 << i) | (1 << (i + 1)), literal: false, joined: true });
      didExpand = true;
    }
    // His names: each typed name is searched as its other forms too, under its own word (NAME_FORMS)
    for (let i = 0; i < filtered.length && i < 31; i++) {
      const toks = kjvEncode(filtered[i]);
      if (toks.length !== 1) continue;
      const n = restoredNameOf(toks[0]);
      if (!NAME_FORMS[n]) continue;
      for (const f of (n === toks[0] ? [] : [n]).concat(NAME_FORMS[n])) {
        if (had.has(f) || !termExists(f)) continue;
        had.add(f);
        units.push({ term: f, origin: i, literal: false, joined: true });
        didExpand = true;
      }
    }
    /* A NUMBER TYPED IN WORDS (search200 fix1): typed words reading as one number ("six hundred sixty six",
       numbers.js; "twenty four", which kjvEncode reads as 24) are searched as that number too, standing for
       them all, as a name typed in parts is: one by one, "six" "hundred" never meet a text's 666. */
    for (let i = 0; i < filtered.length && i < 31; i++) {
      for (let j = Math.min(filtered.length, i + 9, 31); j > i + 1; j--) {
        const toks = numberReading(kjvEncode(filtered.slice(i, j).join(' ')));
        if (toks.length !== 1 || !/^\d+$/.test(toks[0])) continue;
        if (!had.has(toks[0]) && termExists(toks[0])) {
          had.add(toks[0]);
          let cover = 0;
          for (let k = i; k < j; k++) cover |= 1 << k;
          units.push({ term: toks[0], origin: i, cover, literal: false, joined: true });
          didExpand = true;
        }
        i = j - 1;
        break;
      }
    }
  }

  // One BM25 search per unit; accumulate score + coverage bitmask.
  const scoreMap = Object.create(null);
  const termMask = Object.create(null);
  const literalHit = Object.create(null);
  const matchedTerms = Object.create(null);
  /** @type {Record<string, Array<[number, string[]]>>} an Answers topic's matched words, each with the query words it counts for */
  const answersHits = Object.create(null);
  /** @type {Record<string, number>} a verse's score in its KJV wording, unit by unit (kjv-twin.js) */
  const kjvScore = Object.create(null);
  /** @type {Record<string, number>} the typed words its KJV wording holds, as termMask */
  const kjvMask = Object.create(null);
  const docLookup = Object.create(null);
  const unitOpts = (unit) => ({ prefix: unit.literal ? prefixable : false, fuzzy: false, combineWith: 'AND', boost: MS_SEARCH_DEFAULTS.boost });
  // A stop word the reader typed among real words ranks, but is not a word to mark:
  // its matches do not ride on the result for the snippet and the find bar.
  const contentTyped = units.some((u) => u.literal && !isStopTerm(u.term));
  /* What the reader wants found: a -word is ruled out, not typed, and a +word is its word (sweep 2026-10-14 v002).
     Read as typed, "Q -x" asked the texts to hold the run "Q x", so the passage quoted lost its phrase and
     original boosts to a word the reader excluded; and the -word counted toward the words that make a keyword
     search, so "to the false prophets -x" was searched as a passage. */
  const wanted = (p.must && p.must.length) || (p.mustNot && p.mustNot.length) ? wantedQuery(textQ) : textQ;
  /* A word or two is a keyword search, and a word in a title is the strongest sign of
     the text meant ("144000", "false prophets"). More is a passage or a title typed out,
     and the original of a passage comes before the texts that reprint it. */
  const STOP_TRIMMED = D.STOP_WORDS_TRIMMED;
  const contentWords = p.phrase
    ? kjvEncode(p.phrase).filter((t) => !(STOP_TRIMMED && STOP_TRIMMED.has(t))).length
    : units.filter((u) => u.literal && !isStopTerm(u.term)).length;
  const keyword = contentWords <= KEYWORD_CONTENT_WORDS && kjvEncode(p.phrase || wanted).length <= KEYWORD_WORDS;
  /** @param {any} unit @param {any[]} res */
  const accumulate = (unit, res) => {
    const weight = unit.literal || unit.joined ? 1 : unit.form ? FORM_WEIGHT : SYNONYM_WEIGHT;
    for (let r = 0; r < res.length; r++) {
      const hit = res[r];
      const id = hit.id;
      scoreMap[id] = (scoreMap[id] || 0) + hit.score * weight;
      if (!docLookup[id]) docLookup[id] = hit;
      if (unit.literal || unit.joined) literalHit[id] = true;   // a text found only through a form or a synonym is demoted below: the typed form first
      if ((unit.literal || unit.form || unit.joined) && !(contentTyped && isStopTerm(unit.term))) {
        // hit.terms is the DOC-side vocabulary that matched (MiniSearch derives
        // it from the match map), so for a fuzzy/prefix hit it's the corrected
        // word — query "sheperd" carries "shepherd" here. The snippet
        // highlighter only knows the literal typed terms, so these ride along
        // on the result for the UI to merge in (v1.1 gap: corrected words
        // rendered unmarked). A word-form unit's hit ("flood" for a typed
        // "flooding") rides the same way, or its snippet would show no mark.
        // Not synonym units: they match exactly, and SRCH4's
        // expandSnippetTerms already covers those.
        if (hit.terms) {
          const mt = matchedTerms[id] || (matchedTerms[id] = []);
          for (let t = 0; t < hit.terms.length && mt.length < 12; t++) {
            if (mt.indexOf(hit.terms[t]) < 0) mt.push(hit.terms[t]);
          }
        }
      }
      if (unit.origin < 31) {
        if (!hit.kjvOnly) termMask[id] = (termMask[id] || 0) | (unit.cover || (1 << unit.origin));
        if (hit.kind === 'answers' && hit.terms) (answersHits[id] || (answersHits[id] = [])).push([unit.cover || (1 << unit.origin), hit.terms]);
      }
      // the verse's KJV reading, added up on its own (kjvReading)
      if (hit.kjv !== undefined) {
        kjvScore[id] = (kjvScore[id] || 0) + hit.kjv * weight * (hit.kjvOnly ? FORM_WEIGHT : 1);
        if (unit.origin < 31) kjvMask[id] = (kjvMask[id] || 0) | (unit.cover || (1 << unit.origin));
      }
    }
  };
  const heard = Object.create(null);   // origin -> some unit of that word found something
  const heardOwn = Object.create(null); // origin -> a unit other than its word forms found something
  const unheard = [];                  // literal units that found nothing as typed
  for (let u = 0; u < units.length; u++) {
    if (spent()) { const r = await pause(); if (r) return r; }
    const unit = units[u];
    let res;
    try { res = searchUnit(unit.term, unitOpts(unit), keyword); } catch { continue; }
    if (res && res.length) { heard[unit.origin] = true; if (!unit.form) heardOwn[unit.origin] = true; accumulate(unit, res); continue; }
    if (unit.literal) unheard.push(unit);
  }
  /* THE TYPO FALLBACK WAITS FOR THE WHOLE FAMILY (2026-09-26). A typed word that
     finds nothing as typed but whose forms or synonyms do is a real word this
     corpus happens to inflect differently ("prays", where the text says pray and
     prayed); correcting it to the nearest spelling instead could land on any
     one-edit neighbour with more documents ("rays"). Only a word nothing of its
     own reached is a typo, and the correction is reported so the screen can say
     "Showing results for shepherd" rather than change the reader's words
     silently. */
  const corrections = [];
  // Under a card (a book name, a named passage) the card answers the query: no typo
  // guess ("Beatitudes", the quick pick, showed "Showing results for platitudes").
  /* ...AND A WORD ONLY ITS FORMS FOUND IS STILL A TYPO WHEN THE TEXT'S OWN SPELLING OF IT IS ONE SLIP AWAY (search200
     wave 3, U08.6, 2026-10-23). "in the begining god creatd" corrected creatd and kept "begining": stripped of -ing it
     is begin, which the text holds. Its near spelling "beginning" is of the same family (its forms meet the typed
     word's) and is no form the engine searched, so the typed word is that word misspelt. "prays" stays as typed: its
     near spelling, pray, is one of the forms already searched. */
  for (let u = 0; u < (navAlso ? 0 : unheard.length); u++) {
    const unit = unheard[u];
    if (heardOwn[unit.origin]) continue;
    if (spent()) { const r = await pause(); if (r) return r; }
    if (/\d/.test(unit.term)) continue;   // a number is not a typo: "316" is not "16"
    const typed = kjvEncode(unit.term);
    let fixed;
    try { fixed = searchCorrected(unit.term, unitOpts(unit), keyword, heard[unit.origin] ? (w) => formMisspelt(typed, w) : undefined); } catch { continue; }
    if (!fixed.res.length) continue;
    accumulate(unit, fixed.res);
    if (fixed.to && typed.length === 1 && typed[0] !== fixed.to) corrections.push({ from: typed[0], to: fixed.to });
  }
  /* A CORRECTED QUERY IS SEARCHED AS THAT QUERY (2026-09-27). "Showing results for
     shepherd" showed 152 results where "shepherd" shows 171 (the UI walk): the
     corrected word was searched bare, without the synonyms, forms and phrase ranking
     the same word gets when typed. Re-run the query with the corrections put in, and
     report them. */
  if (corrections.length && !options._corrected) {
    const fixedQuery = applyCorrections(query, corrections);
    if (fixedQuery !== query.trim()) {
      const again = await searchWords(fixedQuery, { ...options, _corrected: true });
      return { ...again, corrections: corrections.concat(again.corrections || []) };
    }
  }

  /* THE WORDS THAT COUNT (2026-09-27). Coverage and the phrase ranking ask whether a
     doc holds every word the reader typed; that is every origin with a literal unit.
     A word typed twice has one unit (synonyms.js), at its first place, so counting
     the typed terms themselves ("dust you are and to dust you shall return": dust
     twice) asked for a coverage no doc could reach and the phrase never ranked. */
  let requiredMask = 0;
  for (let u = 0; u < units.length; u++) if (units[u].literal && units[u].origin < 31) requiredMask |= (1 << units[u].origin);
  const required = popcount(requiredMask);

  /* A VERSE READ IN ONE WORDING AT A TIME (search200 fix1 "ed"). Its edition's reading and its KJV reading are each
     added up over the units alone, and the better stands, its words counted with it: the two are never mixed, a word
     from one wording and its neighbour from the other, nor their coverage pooled (a verse holding the common words of a
     query in one wording and the rest in the other outranked every text holding them all in one). */
  /** @type {Record<string, number>} a verse its KJV reading stands for: its own reading's share of that score */
  const ownShare = Object.create(null);
  /** @type {Record<string, number>} ...and the typed words its own wording holds (as termMask) */
  const ownMask = Object.create(null);
  let readInKjv = 0;
  for (const id in kjvScore) {
    const own = (scoreMap[id] || 0) * coverageMultiplier(popcount(termMask[id] || 0));
    const kjv = kjvScore[id] * coverageMultiplier(popcount(kjvMask[id] || 0));
    if (kjv > own) { ownShare[id] = own / kjv; ownMask[id] = termMask[id] || 0; scoreMap[id] = kjvScore[id]; termMask[id] = kjvMask[id]; readInKjv++; }
  }
  /* A POOL IS READ IN THE READER'S EDITION FIRST. A pass read on the best-scored few (the phrase's PHRASE_CANDIDATES,
     the alignment's ALIGN_CANDIDATES) takes them as the reader's edition scores them, and beside them the best as the two
     readings score them: the KJV wording widens a pool, never turns a text out of it. Read on the two readings alone, a
     query of common words ("and when you ... to me") filled the pool with verses whose KJV wording holds them, and the
     letter holding the words one word off was never read. */
  const pool = (/** @type {string[]} */ ids, /** @type {number} */ cap, /** @type {(id: string) => boolean} */ fits, /** @type {(id: string) => boolean} */ fitsOwn) => {
    const best = ids.filter(fits).sort((a, b) => scoreMap[b] - scoreMap[a]);
    if (!readInKjv) return best.slice(0, cap);
    const ownScore = (/** @type {string} */ id) => scoreMap[id] * (id in ownShare ? ownShare[id] : 1);
    const own = ids.filter(fitsOwn).sort((a, b) => ownScore(b) - ownScore(a)).slice(0, cap);
    const out = new Set(best.slice(0, cap));
    for (const id of own) out.add(id);
    return [...out].sort((a, b) => scoreMap[b] - scoreMap[a]);
  };
  const maskOwn = (/** @type {string} */ id) => (id in ownMask ? ownMask[id] : termMask[id] || 0);
  const rankedIds = Object.keys(scoreMap);
  // KIND_BOOST (once).
  for (let i = 0; i < rankedIds.length; i++) {
    const d = docLookup[rankedIds[i]];
    const kb = d && KIND_BOOST[d.kind];
    if (kb) scoreMap[rankedIds[i]] *= kb;
  }
  // Coverage multiplier (distinct original terms matched); an Answers topic's, within one excerpt.
  let mostHeld = 0;
  for (let i = 0; i < rankedIds.length; i++) {
    if (spent()) { const r = await pause(); if (r) return r; }
    const id = rankedIds[i];
    const cc = answersHits[id] ? excerptCover(id, docLookup[id].text || '', answersHits[id]) : popcount(termMask[id] || 0);
    if (cc > mostHeld) mostHeld = cc;
    if (cc > 1) scoreMap[rankedIds[i]] *= coverageMultiplier(cc);
  }
  if (keyword && required > 1 && mostHeld < required) storyWindow(rankedIds, docLookup, termMask, requiredMask, scoreMap);
  /* THE PHRASE RANKING, graded (search audit 2026-09-27). A text holding the typed
     words together outranks one that scatters them: the exact run of every typed word
     x PHRASE_BOOST as before; a run one word off (a word swapped, dropped or added)
     by how much of it the text holds together (ranking.js nearPhrase). Read on the
     PHRASE_CANDIDATES best-scored texts holding every typed word, or all but one of
     three or more. A corrected word counts as the word it was corrected to, so "the
     lord is my shephard" ranks Psalm 23:1 the way the phrase spelled right does. */
  const fixedTo = Object.create(null);
  /** @type {Record<string, number>} the phrase pass's reading: how nearly a text holds the typed words in a row */
  const nearOf = Object.create(null);
  for (let c = 0; c < corrections.length; c++) fixedTo[corrections[c].from] = corrections[c].to;
  const typedTokens = joinApostropheS(kjvEncode(wanted).map((t) => fixedTo[t] || t));
  // the typed run with His names as a verse prints them ("yahuwah is my shepherd": the LORD is), when it differs
  const printedRun = typedTokens.map(namesAsVersePrints);
  const typedPrinted = printedRun.some((t, i) => t !== typedTokens[i]) ? printedRun : null;
  // the typed run with each number written in words as its digits (numbers.js), when it differs
  const numbered = numberReading(typedTokens);
  const typedNum = numbered.length !== typedTokens.length ? numbered : null;
  const STOP = D.STOP_WORDS_TRIMMED;
  /* THE RUN IN EVERY TEXT HOLDING IT (search200 B3, 2026-10-18). Read in the 500 best-scored texts alone, a run of
     common words in a long letter went unread when more short texts outscored it on its content word, and it was
     never boosted. RUN_MIN typed tokens or more are looked for in every text holding the rarest of them (the token
     store, runHolders): each holding the run in a row is boosted wherever it ranked, the original before a reprint
     (ORIGINAL_BOOST) in a keyword search too: the Answers topic denser in two of its words led the letter it
     reprints. In a keyword search that boost passes over the Answers alone: a study or a holy day holding the run
     keeps its place among the letters (it reads the run as its own, where the Answers reprint a letter's words).
     The 500 best are still read for a run one word off (nearPhrase). */
  const holders = !p.phrase ? runHolders(typedTokens) : null;
  /** @type {Record<string, number>} where a text holds the typed run, as a token index (the landing) */
  const runAt = Object.create(null);
  const runBoost = (/** @type {string} */ id, /** @type {any} */ d) => {
    nearOf[id] = 1;
    scoreMap[id] *= PHRASE_BOOST;
    if (!keyword ? !REPRINT_KINDS.has(d.kind) : typedTokens.length >= RUN_MIN && d.kind !== 'answers') scoreMap[id] *= ORIGINAL_BOOST;
  };
  /** The holders the passes below did not read: boosted where they rank (a text the words did not find is no result). */
  const restOfRun = () => {
    if (!holders) return;
    for (const [id, at] of holders) {
      if (id in nearOf || scoreMap[id] === undefined || !docLookup[id]) continue;
      runAt[id] = at;
      runBoost(id, docLookup[id]);
    }
  };
  if (!p.phrase && required > 1 && typedTokens.length > 1) {
    const needCover = required >= 3 ? required - 1 : required;
    const covers = (/** @type {number} */ m) => popcount(m & requiredMask) >= needCover;
    const cands = pool(rankedIds, PHRASE_CANDIDATES, (id) => covers(termMask[id] || 0), (id) => covers(maskOwn(id)));
    /* the typed run with its numbers in digits is a reading of it too, in a verse: the NKJV prints "His number is
       666" (numbers.js). Read in a letter's "who are the 144,000?" it led the Answers titled for that number. */
    for (const id of cands) {
      if (spent()) { const r = await pause(); if (r) return r; }
      const d = docLookup[id];
      if (!d) continue;
      const toks = docTokens(id, d);
      let at = holders ? (holders.has(id) ? /** @type {number} */ (holders.get(id)) : -1) : tokenRunAt(toks, typedTokens);
      const num = typedNum && d.kind === 'verse' ? typedNum : null;
      if (at < 0 && num) at = tokenRunAt(toks, num);
      const printed = typedPrinted && d.kind === 'verse' ? typedPrinted : null;
      if (at < 0 && printed) at = tokenRunAt(toks, printed);
      if (at >= 0) { runAt[id] = at; runBoost(id, d); continue; }
      let near = eachWording(toks, (t) => nearPhrase(t, typedTokens, STOP));
      if (num) near = Math.max(near, eachWording(toks, (t) => nearPhrase(t, num, STOP)));
      if (printed) near = Math.max(near, eachWording(toks, (t) => nearPhrase(t, printed, STOP)));
      nearOf[id] = near;
      if (near >= NEAR_PHRASE_MIN) scoreMap[id] *= 1 + (PHRASE_BOOST - 1) * near * near;
      // the original before a reprint when both hold the phrase
      if (near >= 0.9 && !keyword && !REPRINT_KINDS.has(d.kind)) scoreMap[id] *= ORIGINAL_BOOST;
    }
    restOfRun();
    // a verse past the candidates holding the run with His name printed holds the typed run too
    if (typedPrinted && typedTokens.length >= RUN_MIN) {
      const inCands = new Set(cands);
      let k = 0;
      for (const id of rankedIds) {
        if ((++k & 255) === 0 && spent()) { const r = await pause(); if (r) return r; }
        if (inCands.has(id) || id in runAt) continue;
        const d = docLookup[id];
        if (!d || d.kind !== 'verse') continue;
        const at = tokenRunAt(docTokens(id, d), typedPrinted);
        if (at >= 0) { runAt[id] = at; runBoost(id, d); }
      }
    }
  }
  /* A QUOTE TYPED ONE WORD OFF, WHEREVER IT RANKS (search200 fix1, scope cause 1). The pass above grades a run one
     word off in the PHRASE_CANDIDATES best-scored texts alone, a cut drawn over every collection before any scope: a
     verse quoting the typed words with one swapped, outscored by hundreds of texts thick with them, was never graded
     ("the god of this nation israel": Acts 13:17 was #501). Each typed word in turn is the slip, and the run on its
     longer side is read from the token store (runHolders, as B3 reads the whole run); a text holding it and the
     pass's own cover is graded too. */
  if (!p.phrase && required > 1 && typedTokens.length >= RUN_MIN + 1) {
    const needCover = required >= 3 ? required - 1 : required;
    const graded = new Set();
    for (let k = 0; k < typedTokens.length; k++) {
      const left = typedTokens.slice(0, k);
      const right = typedTokens.slice(k + 1);
      const side = left.length >= right.length ? left : right;
      if (side.length < RUN_MIN || side.every((t) => STOP.has(t))) continue;
      const hs = runHolders(side);
      if (!hs) continue;
      for (const id of hs.keys()) {
        if (graded.has(id) || id in nearOf || scoreMap[id] === undefined) continue;
        if (popcount((termMask[id] || 0) & requiredMask) < needCover) continue;
        graded.add(id);
        const d = docLookup[id];
        if (!d) continue;
        const near = eachWording(docTokens(id, d), (t) => nearPhrase(t, typedTokens, STOP));
        if (near >= NEAR_PHRASE_MIN) { nearOf[id] = near; scoreMap[id] *= 1 + (PHRASE_BOOST - 1) * near * near; }
      }
    }
  }
  // One word that means anything among small ones ("for you to embrace me"): the texts holding the typed run exactly.
  // The card marks the run, so its excerpt and the landing go to it, not the word's first place (textQuery.run).
  let run = '';
  if (!p.phrase && required === 1 && typedTokens.length >= SMALL_RUN_MIN) {
    const cands = holders ? [] : rankedIds.slice().sort((a, b) => scoreMap[b] - scoreMap[a]).slice(0, PHRASE_CANDIDATES);
    for (const id of cands) {
      if (spent()) { const r = await pause(); if (r) return r; }
      const d = docLookup[id];
      const at = d ? tokenRunAt(docTokens(id, d), typedTokens) : -1;
      if (at < 0) continue;
      runAt[id] = at;
      runBoost(id, d);
    }
    restOfRun();
    if (Object.keys(runAt).length) run = wanted.trim().replace(/\s+/g, ' ').toLowerCase();
  }
  /* THE RUN HELD WHOLE LEADS (search200 B3, 2026-10-18). A short verse thick with a quote's words, or a holy day
     dense in them, outscored the text holding the typed run word for word even after its PHRASE_BOOST: a letter's
     sentence that turns Titus 1:11 to "you" opened on the verse ("they"), the letter second (the tri bench: three
     exact quotes). When RUN_LEAD_MIN typed tokens or more sit in a row in some text and a text holding
     less leads them all, every holder is lifted by one factor, just past it (their own order kept). Not for a
     corrected typo (the run is the engine's guess), nor over a verse a study holds the run of: a study quotes
     Scripture in the KJV or with His name restored, and the verse is its original (DECISIONS 10-14). */
  const heldWhole = Object.keys(runAt);
  /** A verse's own wording's tokens (before its KJV wording, TWIN_GAP between); the text's tokens else. */
  const ownTokens = (/** @type {string} */ id, /** @type {any} */ d) => {
    const t = docTokens(id, d);
    const sep = t.indexOf(TWIN_SEP);
    return sep < 0 ? t : t.slice(0, sep);
  };
  /** THE RUN SHOWN FIRST (below): the verses of `held` holding the run in their KJV wording alone (`inKjv`) go just
      under the lowest text of its own among `held` holding it in the words it shows (their own order kept). */
  const shownFirst = (/** @type {string[]} */ held, /** @type {Set<string>} */ inKjv) => {
    if (!inKjv.size) return;
    let low = Infinity;
    for (const id of held) {
      const d = docLookup[id];
      if (!inKjv.has(id) && d && !REPRINT_KINDS.has(d.kind) && scoreMap[id] < low) low = scoreMap[id];
    }
    let high = 0;
    for (const id of inKjv) if (scoreMap[id] > high) high = scoreMap[id];
    if (low < Infinity && high >= low) { const f = (low * PART_UNDER_RUN) / high; for (const id of inKjv) scoreMap[id] *= f; }
  };
  /** @type {Set<string>} the holders holding the run in a verse's KJV wording alone */
  const runInKjv = new Set();
  for (const id of heldWhole) {
    const d = docLookup[id];
    if (d && d.kind === 'verse' && runAt[id] >= ownTokens(id, d).length) runInKjv.add(id);
  }
  /** The first holder's score, lifted or not: the title lift below lifts a part of a title typed no higher. */
  let heldTop = 0;
  if (!p.phrase && !corrections.length && typedTokens.length >= RUN_LEAD_MIN && heldWhole.length) {
    let topHeld = 0;
    let topOther = 0;
    let heldBy = '';
    let otherBy = '';
    for (const id in scoreMap) {
      const s = scoreMap[id];
      if (id in runAt) { if (s > topHeld) { topHeld = s; heldBy = id; } } else if (s > topOther) { topOther = s; otherBy = id; }
    }
    const studyOfVerse = docLookup[heldBy] && docLookup[otherBy] && docLookup[heldBy].kind === 'bible-study' && docLookup[otherBy].kind === 'verse';
    if (topHeld > 0 && topHeld <= topOther && !studyOfVerse) {
      const f = (topOther / topHeld) * 1.05;
      for (const id of heldWhole) if (scoreMap[id] !== undefined) scoreMap[id] *= f;
    }
    /* THE RUN SHOWN FIRST. A text of its own (a letter, Words To Live By, The Blessed, a verse in its own words) holding
       the run in the words it shows leads a verse holding it in its KJV wording alone: the reader reads the one, and the
       verse's card shows other words ("I saw a star fall from Heaven" opens a Words To Live By entry; Revelation 9:1
       says it in the KJV, "fallen" in the NKJV). A reprint holding it (Answers, a study, a holy day) quotes the KJV:
       its verse is its original, and keeps its place (originalsFirst). */
    shownFirst(heldWhole, runInKjv);
    for (const id of heldWhole) if (scoreMap[id] > heldTop) heldTop = scoreMap[id];
  }
  // A quoted phrase: every text shown holds it (the filter below), so the original first.
  if (p.phrase) {
    for (let i = 0; i < rankedIds.length; i++) {
      const d = docLookup[rankedIds[i]];
      if (d && !REPRINT_KINDS.has(d.kind)) scoreMap[rankedIds[i]] *= ORIGINAL_BOOST;
    }
    /* ...and shown first where it is read (search200 fix2): THE RUN SHOWN FIRST holds for a quoted phrase as for a
       typed run, among the best-scored PHRASE_CANDIDATES. "and it was so" in quotes opened on 2 Kings 12:10, whose
       KJV wording says it ("So it was" in the NKJV), over Genesis 1:7, whose card says it. */
    const run = twinNow() ? joinApostropheS(kjvEncode(p.phrase)) : [];
    if (run.length) {
      const top = rankedIds.slice().sort((a, b) => scoreMap[b] - scoreMap[a]).slice(0, PHRASE_CANDIDATES);
      /** @type {string[]} */ const held = [];
      /** @type {Set<string>} */ const inKjv = new Set();
      for (const id of top) {
        const d = docLookup[id];
        const at = d ? tokenRunAt(docTokens(id, d), run) : -1;
        if (at < 0) continue;
        held.push(id);
        if (d.kind === 'verse' && at >= ownTokens(id, d).length) inKjv.add(id);
      }
      shownFirst(held, inKjv);
    }
  }
  /** How the query names a text's title (ranking.js titleMatch); a study chapter's by its own title too. */
  /* ...His names in it as one name, restored or printed (search200 fix2): "jesus christ is king" names the letter
     "YahuShua HaMashiach Is King" whole, not its last two words. */
  const namedTyped = typedTokens.some((t) => NAME_FORMS[restoredNameOf(t)]);
  const titleOf = (/** @type {string[]} */ tt, /** @type {string[]} */ q) => {
    const m = titleMatch(tt, q, STOP);
    return namedTyped ? Math.max(m, titleMatch(tt.map(oneName), q.map(oneName), STOP)) : m;
  };
  const titleScore = (/** @type {any} */ d) => {
    const t = titleToks(d);
    const read = (/** @type {string[]} */ q) => {
      const all = titleOf(t.all, q);
      return t.own ? Math.max(all, titleOf(t.own, q)) : all;
    };
    // a title's number typed in words names it as its digits do ("the one hundred forty four thousand witnesses")
    return typedNum ? Math.max(read(typedTokens), read(typedNum)) : read(typedTokens);
  };
  /* A TITLE THAT IS A VERSE IN THE READER'S EDITION. A title saying a verse's own words ("I Am The Lord, I Do Not Change",
     Malachi 3:6 in the NKJV) is that verse named: typed in its KJV words ("i am the lord i change not"), the verse holds
     the run in its KJV wording alone, and the title is no title remembered loosely beside it. That verse sets no cap. */
  const capOf = (/** @type {any} */ d) => {
    if (!runInKjv.size) return heldTop;
    const tt = joinApostropheS(titleToks(d).all);
    const run = tt.length > 1 && TITLE_LEAD.has(tt[0]) ? tt.slice(1) : tt;
    let top = 0;
    for (const id of heldWhole) {
      if (scoreMap[id] <= top) continue;
      if (run.length >= RUN_MIN && runInKjv.has(id) && hasTokenRun(ownTokens(id, docLookup[id]), run)) continue;
      top = scoreMap[id];
    }
    return top;
  };
  /* A title typed whole, or a run of it, ranks its unit up (ranking.js titleMatch). A part of a title typed (less
     than TITLE_EXACT_BOOST) on a text not holding the typed run is lifted no higher than just under the first text
     that holds it word for word (B3, above), and never lower than its words put it (search200 fix1): "the X of Y"
     took "The X of Z" x1.98 past the verse saying it, undoing B3, and B5's rule that a quote found keeps above a
     title remembered loosely came too late to act. */
  if (typedTokens.length) {
    for (let i = 0; i < rankedIds.length; i++) {
      if (spent()) { const r = await pause(); if (r) return r; }
      const id = rankedIds[i];
      const d = docLookup[id];
      if (!d || !d.title || d.kind === 'verse') continue;
      const tm = titleScore(d);
      if (tm <= 1) continue;
      const lifted = scoreMap[id] * tm;
      const top = heldTop > 0 && tm < TITLE_EXACT_BOOST && !(id in runAt) && lifted >= heldTop ? capOf(d) : 0;
      const under = top > 0 && lifted >= top;
      scoreMap[id] = under ? Math.max(scoreMap[id], top * PART_UNDER_RUN) : lifted;
    }
  }
  // Synonym-only demotion.
  if (didExpand) {
    for (let i = 0; i < rankedIds.length; i++) {
      if (!literalHit[rankedIds[i]]) scoreMap[rankedIds[i]] *= SYNONYM_DEMOTION;
    }
  }
  /* A QUOTE REMEMBERED WITH ITS SLIPS (search200 B4, 2026-10-18). The phrase pass reads the typed words in a row as
     typed, so a quote remembered with a tense changed, the modern word for the King James one, a synonym, a word left
     out or two clauses run together broke its run, and BM25 ranked the texts thick with its words over the one it
     quotes (the tri bench's misremembered quotes, and the exact ones a verse pair holds between them). align.js lines
     the typed words up against a text the way a reader would recognise it (cov 0..1). When no text holds the typed run
     whole (B3's runAt, tier A), the best-scored ALIGN_CANDIDATES holding ALIGN_MASS of the typed words' weight are
     aligned, a verse with its neighbour too (a quote of two verses run together); those holding ALIGN_HELD of the
     quote or more (tier B) lead every text holding less, the one holding more first, and open on the words. A cov
     within a small word of another's is no better (the words rank the two), nor is one within a small word of the
     best text left under ALIGN_HELD (it is not lifted); a study quoting a verse gives way to the verse, and a text
     held so gives way in originalsFirst only to an original holding the quote as well. On the open benches
     (2026-10-18): tri 577 -> 586 of 600, the 500's open unchanged (381), dropped-word probe 1720 -> 1751. */
  /** @type {Map<string, {cov: number, start: number, rank: number, met?: Uint8Array}>} tier B: the texts holding the quote, slips and all */
  const alignHeld = new Map();
  /** @type {((id: string) => number)|null} how much of the quote a text holds (align.js cov), for originalsFirst */
  let alignCovOf = null;
  /** How much of the quote the texts held hold at least: ALIGN_HELD, or a clear best's (below), for originalsFirst */
  let alignBar = ALIGN_HELD;
  const AS = ALIGN_ON && !p.phrase && !keyword && typedTokens.length >= ALIGN_MIN && !heldWhole.length ? storeNow() : null;
  if (AS) {
    const n = msIndex.documentCount || 1;
    // a possessive's "s" joined ("lord's" as lords) is its word's
    const df = (/** @type {string} */ t) => docFreq(t) || (t.length > 2 && t[t.length - 1] === 's' ? docFreq(t.slice(0, -1)) : 0);
    const idf = (/** @type {string} */ t) => { const x = df(t); return Math.log(1 + (n - x + 0.5) / (x + 0.5)); };
    const ow = new Float64Array(31);
    for (const u of units) if (u.literal && u.origin < 31) ow[u.origin] = Math.max(ow[u.origin], kjvEncode(u.term).reduce((a, t) => a + idf(t), 0));
    let all = 0;
    for (let o = 0; o < 31; o++) all += ow[o];
    const massOf = (/** @type {string} */ id, m = termMask[id] || 0) => {
      let s = 0;
      for (let o = 0; o < 31; o++) if (m & (1 << o)) s += ow[o];
      return all ? s / all : 0;
    };
    /** The verse beside a verse (`by` -1 or 1) in its chapter: its id, or ''. */
    const besideVerse = (/** @type {string} */ id, /** @type {any} */ d, /** @type {number} */ by) => {
      const k = /^d(\d+)$/.exec(id);
      if (!k) return '';
      const nid = 'd' + (+k[1] + by);
      const f = docLookup[nid] || msIndex.getStoredFields(nid);
      return f && f.kind === 'verse' && f.bookId === d.bookId && f.chapterNum === d.chapterNum && f.verseNum === d.verseNum + by ? nid : '';
    };
    let gated = rankedIds.filter((id) => massOf(id) >= ALIGN_MASS);
    /* A TYPED WORD NO TEXT HOLDING THE QUOTE HOLDS (search200 last2, 2026-10-18). A word of the reader's own in the
       quote's place that the texts barely use ("quietly" for privately: three texts say it) weighed the most of the
       typed words, so the verse holding every other word in the typed order held under ALIGN_MASS of the weight and
       was never aligned ("and said quietly blessed are the eyes that see what you see": Luke 10:23 held 0.49 of it,
       and Matthew 13:16, holding three of its words, led). A typed content word that no text holding ALIGN_MASS holds,
       as typed or in a form, a synonym or a spelling corrected, tells none of them apart: it leaves the weight, the
       gate's and every text's cov, and the texts are read again for ALIGN_MASS of what is left (decided once, on the
       first reading). The verse beside a verse holding ALIGN_MASS holds the quote with it (two verses run together,
       read below as one), so a word only it holds is the quote's own and keeps its weight. On the open benches
       (2026-10-18): tri 598 -> 599 of 600, the 500's open (381) and the dropped-word probe (1765) unchanged.
       ...BUT THE READER'S OWN WORD MAY BE THE RARE ONE (last2 review, 2026-10-18). "the joy of the lord is your
       fortress" (Nehemiah 8:10 says strength): fortress, 28 texts, weighed enough that the texts holding it and LORD
       held ALIGN_MASS, and the verse remembered, holding joy and LORD, fell under it; no text holds fortress and joy, so
       joy, the verse's own word, left the weight, and the fortress verses, aligned without it, led (Nehemiah 8:10 at
       #7). A word a text holds with as many of the typed content words as the best text holding ALIGN_MASS holds is
       a word of a text as near the quote as any: it keeps its weight. Quietly's three texts hold it alone (1 of the
       5 typed content words; the best gated text 4), so it still leaves. */
    let heldBits = 0;
    for (const id of gated) heldBits |= termMask[id] || 0;
    let lost = 0;
    for (let o = 0; o < 31; o++) if (ow[o] > 0 && !(heldBits & (1 << o))) lost |= 1 << o;
    /** @type {Set<string>} the typed tokens of the words no text holding the quote holds */
    const lostTok = new Set();
    if (lost && gated.length) {
      const inGate = new Set(gated);
      let content = 0;
      for (const u of units) if (u.literal && u.origin < 31 && !isStopTerm(u.term)) content |= 1 << u.origin;
      let most = 0;
      for (const id of gated) most = Math.max(most, popcount((termMask[id] || 0) & content));
      for (const id of rankedIds) {
        const m = (termMask[id] || 0) & lost;
        if (!m) continue;
        if (popcount(termMask[id] & content) >= most) { lost &= ~m; continue; }
        const d = docLookup[id];
        if (d && d.kind === 'verse' && (inGate.has(besideVerse(id, d, -1)) || inGate.has(besideVerse(id, d, 1)))) lost &= ~m;
      }
      for (const u of units) {
        if (!u.literal || u.origin >= 31 || !(lost & (1 << u.origin))) continue;
        for (const t of kjvEncode(u.term)) { lostTok.add(t); if (fixedTo[t]) lostTok.add(fixedTo[t]); }
      }
      for (let o = 0; o < 31; o++) if (lost & (1 << o)) { all -= ow[o]; ow[o] = 0; }
      if (lost) gated = rankedIds.filter((id) => massOf(id) >= ALIGN_MASS);
    }
    const inGated = new Set(gated);
    const cands = pool(rankedIds, ALIGN_CANDIDATES, (id) => inGated.has(id), (id) => massOf(id, maskOwn(id)) >= ALIGN_MASS);
    /* ...and every text graded near the phrase is aligned, past the cut and the gate (search200 fix1, cause 1). A text
       added so may be held, but is never the near miss (`under`): the wider list lifts a text, and never drops one the
       gated texts alone would hold ("happy is the lord god of": Luke 1:68, never gated, tied every held verse). */
    /** @type {Set<string>} */ const nearAdded = new Set();
    {
      const inCands = new Set(cands);
      for (const id in nearOf) if (nearOf[id] >= NEAR_PHRASE_MIN && !inCands.has(id) && scoreMap[id] !== undefined) { cands.push(id); nearAdded.add(id); }
    }
    const w = alignWeights(typedTokens, df, n);
    for (let i = 0; i < typedTokens.length; i++) if (lostTok.has(typedTokens[i]) && !STOP.has(typedTokens[i])) w[i] = 0;
    const cls = alignClasses(typedTokens, { stop: STOP, id: (t) => AS.ids.get(t), word: (x) => AS.words[x], lexicon: ALIGN_LEXICON });
    const toksOf = (/** @type {string} */ id) => { const sid = storeSpan(AS, id); return sid === null ? null : AS.toks.subarray(AS.from[sid], AS.to[sid]); };
    /* Two covs within a small word of each other (the heaviest typed, "so" for "and"), give or take ALIGN_TIE, hold the
       quote alike: the words' order stands. */
    let wAll = 0;
    let wSmall = 0;
    for (let i = 0; i < typedTokens.length; i++) { wAll += w[i]; if (STOP.has(typedTokens[i]) && w[i] > wSmall) wSmall = w[i]; }
    const tie = ALIGN_TIE + (wAll ? wSmall / wAll : 0);
    /** The most a candidate left under ALIGN_HELD holds: a text holding the quote only that well is not told from it. */
    let under = 0;
    /** @type {[ArrayLike<any>, number, number]|null} that candidate's tokens and span, for the typed words it holds */
    let underAt = null;
    /** @type {Array<{id: string, cov: number, first: number, at: [ArrayLike<any>, number, number], added: boolean}>} the candidates under ALIGN_HELD */
    const below = [];
    /* A TEXT HOLDING MORE OF THE TYPED WORDS IS NO TIE (search200 R4, 2026-10-18). Two covs within `tie` hold the quote
       alike only when neither text holds a typed word the other lacks (align.js alignMet): x over y when x holds every
       content word y holds and more, or the same content words and every small word y holds and more. */
    /** x against y on one class of typed word (small 1: the stop words, 0: the rest): -1 when y holds one x lacks, 1
        when x holds all y holds and more, else 0. */
    const beyond = (/** @type {Uint8Array} */ x, /** @type {Uint8Array|null} */ y, /** @type {number} */ small) => {
      let more = false;
      for (let i = 1; i < x.length; i++) {
        if (cls.stop[i - 1] !== small) continue;
        const b = y ? y[i] : 0;
        if (b && !x[i]) return -1;
        if (x[i] && !b) more = true;
      }
      return more ? 1 : 0;
    };
    const over = (/** @type {Uint8Array|undefined} */ x, /** @type {Uint8Array|null|undefined} */ y) => {
      if (!x) return false;
      const c = beyond(x, y || null, 0);
      return c ? c > 0 : beyond(x, y || null, 1) > 0;
    };
    /** @type {Map<string, number>} each verse's own cov, its neighbour's pair aside */
    const single = new Map();
    // a verse's two wordings are read each alone (wordingsOf), the better one standing
    const sep = AS.ids.get(TWIN_SEP);
    const alone = (/** @type {string} */ id, /** @type {any} */ t) => {
      let c = single.get(id);
      if (c === undefined) { c = 0; for (const q of wordingsOf(t, sep)) c = Math.max(c, alignScore(q, typedTokens, w, cls).cov); single.set(id, c); }
      return c;
    };
    alignCovOf = (id) => { const t = single.has(id) ? null : toksOf(id); return single.has(id) || t ? alone(id, t) : 0; };
    /** @type {Map<string, string>} a verse lifted by its neighbour -> that neighbour */
    const pairOf = new Map();
    for (const id of cands) {
      if (spent()) { const r = await pause(); if (r) return r; }
      const t = toksOf(id);
      const d = docLookup[id];
      if (!t || !d) continue;
      const ws = wordingsOf(t, sep);
      let a = alignScore(ws[0], typedTokens, w, cls);
      /** @type {[ArrayLike<any>, number, number]} the tokens and span `a` holds the quote in */
      let at = [ws[0], a.start, a.end];
      for (let e = 1; e < ws.length; e++) {
        const x = alignScore(ws[e], typedTokens, w, cls);
        if (x.cov > a.cov) { a = x; at = [ws[e], x.start, x.end]; }
      }
      single.set(id, a.cov);
      // two verses run together: the pair holds what neither holds alone (a neighbour holding it alone is the verse
      // remembered, and this one, saying the like, is not lifted by it). A verse aligned only for its near phrase
      // (nearAdded) is held on its own words: "nor in the son of man" joined to the verse before it held "the sing of
      // the son of man" and led it; the verse the quote starts in is held with it, and it comes after (search200 fix2)
      if (d.kind === 'verse' && a.cov < ALIGN_HELD && !nearAdded.has(id)) {
        for (const by of [-1, 1]) {
          const o = besideVerse(id, d, by);
          const ot = o ? toksOf(o) : null;
          if (!ot || alone(o, ot) >= ALIGN_HELD) continue;
          // ...in one wording at a time: the first verse's KJV wording runs into the second's
          const [xs, ys] = by < 0 ? [wordingsOf(ot, sep), ws] : [ws, wordingsOf(ot, sep)];
          /** @type {any} */ let b = null;
          let both = t;
          let x = t;
          for (let e = 0; e < Math.max(xs.length, ys.length); e++) {
            const xe = xs[Math.min(e, xs.length - 1)];
            const ye = ys[Math.min(e, ys.length - 1)];
            const be = new Uint32Array(xe.length + ye.length);
            be.set(xe);
            be.set(ye, xe.length);
            const r = alignScore(be, typedTokens, w, cls);
            if (!b || r.cov > b.cov) { b = r; both = be; x = xe; }
          }
          if (b.cov > a.cov && b.start < x.length && b.end > x.length) {
            a = { cov: b.cov, start: -1, end: -1, first: -1 };
            at = [both, b.start, b.end];
            // ...the neighbour holding more of the quote than a small word is the rest of it
            if (b.cov - /** @type {number} */ (single.get(id)) > tie) pairOf.set(id, o); else pairOf.delete(id);
          }
        }
      }
      // it opens where the first typed words are (clauses typed in the other order: on the first typed)
      if (a.cov >= ALIGN_HELD) alignHeld.set(id, { cov: a.cov, start: a.first, rank: 0, met: alignMet(at[0], at[1], at[2], w, cls) });
      else {
        if (a.cov > under && !nearAdded.has(id)) { under = a.cov; underAt = at; }
        below.push({ id, cov: a.cov, first: a.first, at, added: nearAdded.has(id) });
      }
    }
    /* A CLEAR BEST UNDER ALIGN_HELD (search200 sealed2, 2026-10-22; the fault hunt's slip C4 (b)). A text holding the
       quote far better than every other text, short of ALIGN_HELD, got nothing: a study's line remembered with two of
       its words traded ("offered as a symbol" for "sacrificed as a representation") held 0.748 of it, the next text
       0.357, and verses holding its common words led (tri m274; the hunt's sli-18 0.66 against 0.49, sli-21 0.72
       against 0.47). With no text holding ALIGN_HELD, the best holding ALIGN_CLEAR is held, with the texts holding it
       alike (within a small word: its copy, its pair), when every other text holds it twice that less: a field of
       texts holding it about as well (the Nehemiah 8:10 shape, fortress verses for "your fortress") holds nothing so,
       nor does a passage many texts print alike (more than CLEAR_COPIES: "who willingly gave up His life... carried
       the weight of the world's sin to the cross", in six texts, held 0.697 of "a servant who gives up his life every
       day carrying his cross", a paraphrase of a Blessed line, and led it on the 500's open t359). The best other text
       is then the one the held are told from (`under`). */
    if (!alignHeld.size && below.length) {
      let top = 0;
      for (const b of below) if (b.cov > top) top = b.cov;
      if (top >= ALIGN_CLEAR) {
        const alike = below.filter((b) => top - b.cov <= tie);
        let next = null;
        for (const b of below) if (!b.added && top - b.cov > tie && (!next || b.cov > next.cov)) next = b;
        if (alike.length <= CLEAR_COPIES && top - (next ? next.cov : 0) > 2 * tie) {
          for (const b of alike) alignHeld.set(b.id, { cov: b.cov, start: b.first, rank: 0, met: alignMet(b.at[0], b.at[1], b.at[2], w, cls) });
          alignBar = Math.min(...alike.map((b) => b.cov));
          under = next ? next.cov : 0;
          underAt = next ? next.at : null;
        }
      }
    }
    const underMet = underAt ? alignMet(underAt[0], underAt[1], underAt[2], w, cls) : null;
    /* Held, and told from the rest: a text holding the quote within a small word of one just under ALIGN_HELD holds it
       no better ("blessed be the name of our lord": three verses and a Blessed hold it in a row with "the" for "our",
       and a verse spreading its words over twice its length holds "our" too), and the words' order stands. */
    for (const [id, a] of alignHeld) if (a.cov - under <= tie && !over(a.met, underMet)) alignHeld.delete(id);
    if (alignHeld.size) {
      const order = [...alignHeld.keys()].sort((x, y) => {
        const hx = /** @type {any} */ (alignHeld.get(x));
        const hy = /** @type {any} */ (alignHeld.get(y));
        const cx = hx.cov;
        const cy = hy.cov;
        if (Math.abs(cy - cx) > tie) return cy - cx;
        // within a small word: the text holding more of the typed words first, else the words' order
        if (cx >= cy && over(hx.met, hy.met)) return -1;
        if (cy >= cx && over(hy.met, hx.met)) return 1;
        return scoreMap[y] - scoreMap[x];
      });
      // A study quoting a verse (the KJV's words, or with His name restored) gives way to the verse, its original (DECISIONS 10-14).
      const kindAt = (/** @type {string} */ id) => (docLookup[id] ? docLookup[id].kind : '');
      const v = order.findIndex((id) => kindAt(id) === 'verse');
      const st = v > 0 ? order.findIndex((id) => kindAt(id) === 'bible-study') : -1;
      if (st >= 0 && st < v) order.splice(st, 0, ...order.splice(v, 1));
      /* TWO VERSES RUN TOGETHER, BOTH SHOWN (search200 R1, 2026-10-18). A quote of two verses lifted the verse holding
         most of it, and its neighbour, holding the rest in a few common words ("...an abomination to the LORD"), stayed
         where those words put it, below every text thick with them: the reader saw half of the saying remembered. The
         neighbour comes right after the verse it lifted. */
      for (let r = order.length - 1; r >= 0; r--) {
        const o = pairOf.get(order[r]);
        if (!o || alignHeld.has(o)) continue;
        if (!(o in scoreMap)) {
          if (!docLookup[o]) docLookup[o] = { id: o, ...msIndex.getStoredFields(o) };
          scoreMap[o] = 0;
          rankedIds.push(o);
        }
        alignHeld.set(o, { cov: /** @type {any} */ (alignHeld.get(order[r])).cov, start: -1, rank: 0 });
        order.splice(r + 1, 0, o);
      }
      let top = 0;
      for (const id in scoreMap) if (!alignHeld.has(id) && scoreMap[id] > top) top = scoreMap[id];
      for (let r = 0; r < order.length; r++) {
        /** @type {any} */ (alignHeld.get(order[r])).rank = r;
        scoreMap[order[r]] = (top || 1) * 1.05 * (1 + (order.length - r) * 1e-3);
      }
    }
  }

  rankedIds.sort((a, b) => scoreMap[b] - scoreMap[a]);

  // Post-ranking filters + dedup + cap.
  const out = [];
  /** @type {Map<any, string>} */ const idOf = new Map();
  const seen = Object.create(null);
  // A quoted phrase and +/- words match WORDS, on the index's own tokens
  // (kjvEncode folds case, accents and both apostrophes, and splits on every
  // punctuation mark). The raw substring test this replaces missed "shepherd; I"
  // and the curly "Lord’s", and read "heart" as containing "art" (v07-02).
  const phraseToks = p.phrase ? kjvEncode(p.phrase) : null;
  const hasMust = !!(p.must && p.must.length);
  const hasMustNot = !!(p.mustNot && p.mustNot.length);
  const mustToks = hasMust ? p.must.map((t) => kjvEncode(t)) : [];
  const mustNotToks = hasMustNot ? p.mustNot.map((t) => kjvEncode(t)).filter((run) => run.length) : [];
  const scope = options.scope || null;
  const scopeBookId = scope && scope.bookId ? scope.bookId : null;
  const scopeVolumeId = scope && scope.volumeId ? scope.volumeId : null;
  const corpusFilter = corpus === 'all' ? null : corpus;
  const perVolume = options.perVolume || 0;
  const volCount = Object.create(null);
  const capped = Object.create(null);

  /* ONE TEST OF WHAT A SEARCH MAY SHOW (sweep W1, 2026-10-13). After this loop the meaning search
     adds the model's best texts and originalsFirst puts an original above its reprint, and both took
     documents straight from the index: a Scriptures-only search, a book or volume scope, the link
     picker's corpus chip or a -word let up to ten texts from outside it into the top 30. Every
     document a search shows passes `allowed` (the reader's collection and scope, and the quoted, +
     and - words), and shows once; what the meaning and originalsFirst add counts in its collection's cap. */
  const inScope = (/** @type {any} */ d) => (!corpusFilter || d.corpus === corpusFilter) &&
    (!scopeBookId || d.bookId === scopeBookId) && (!scopeVolumeId || d.volumeId === scopeVolumeId);
  /* ...read in the token store (search200 B3): kjvEncode'ing every text the loop below passes over, a quoted phrase
     of common words read thousands of texts anew per search. The store holds text and title; a heading and a ref
     (a collection's name, "John 3:16") are read apart, with the title, where the store has not the run. */
  const S = storeNow();
  const asIds = (/** @type {string[]} */ run) => run.map((t) => { const id = S && S.ids.get(t); return id === undefined || id === null ? -1 : id; });
  const phraseIds = phraseToks && S ? asIds(phraseToks) : null;
  const mustIds = S ? mustToks.map(asIds) : [];
  const mustNotIds = S ? mustNotToks.map(asIds) : [];
  const holdsWords = (/** @type {any} */ d) => {
    if (!phraseToks && !hasMust && !hasMustNot) return true;
    const sid = S ? storeSpan(S, d.id) : null;
    if (!S || sid === null) {
      const toks = kjvEncode((d.text || '') + ' ' + (d.title || '') + ' ' + (d.heading || '') + ' ' + (d.ref || ''));
      if (phraseToks && !hasTokenRun(toks, phraseToks)) return false;
      if (hasMust && !mustToks.every((run) => hasTokenRun(toks, run))) return false;
      return !mustNotToks.some((run) => hasTokenRun(toks, run));
    }
    /** @type {string[]|null} */ let side = null;
    const sideToks = () => side || (side = d.heading || d.ref ? kjvEncode((d.title || '') + ' ' + (d.heading || '') + ' ' + (d.ref || '')) : []);
    const holds = (/** @type {string[]} */ run, /** @type {number[]} */ ids) => storeWordsAt(S, sid, ids) >= 0 || hasTokenRun(sideToks(), run);
    if (phraseToks && !holds(phraseToks, /** @type {number[]} */ (phraseIds))) return false;
    if (hasMust && !mustToks.every((run, i) => holds(run, mustIds[i]))) return false;
    return !mustNotToks.some((run, i) => holds(run, mustNotIds[i]));
  };
  const allowed = (/** @type {any} */ d) => inScope(d) && holdsWords(d);
  /** A text not shown yet, marked shown (the dedup). */
  const fresh = (/** @type {any} */ d) => {
    const key = dedupKey(d);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  };

  let h = 0;
  for (; h < rankedIds.length && out.length < limit; h++) {
    if (spent()) { const r = await pause(); if (r) return r; }
    const id = rankedIds[h];
    const doc = docLookup[id];
    if (!doc || !inScope(doc)) continue;
    // Before the word filters, which tokenise the whole doc: a full collection
    // costs nothing more to pass over. (A doc the filters would have refused can
    // mark its collection capped, so "400+" may mean exactly 400; never fewer.)
    const vid = doc.volumeId || '';
    if (perVolume && (volCount[vid] || 0) >= perVolume) { capped[vid] = true; continue; }
    if (!holdsWords(doc) || !fresh(doc)) continue;
    volCount[vid] = (volCount[vid] || 0) + 1;
    const entry = { score: scoreMap[id], doc: reshapeDoc(doc), terms: matchedTerms[id] || [] };
    idOf.set(entry, id);
    out.push(entry);
  }
  /** What the words found; the meaning and originalsFirst bring in more below. */
  const byWords = new Set(out);
  // A title the query names keeps its place; in a keyword search, a title holding its every word
  // ("144,000"), not one of two ("lord from aforetime" quotes a letter, not "Regarding the Day of The Lord").
  const typedContent = typedTokens.filter((w) => !(STOP && STOP.has(w)));
  const named = (/** @type {any} */ d) => {
    if (!d.title) return false;
    const tt = titleToks(d).all;
    return titleScore(d) > 1 || (keyword && typedContent.length > 0 && typedContent.every((w) => tt.indexOf(w) >= 0));
  };
  /* THE TITLE TYPED LEADS (search200 B1, 2026-10-18). titleMatch scores a title typed whole x3 with its leading
     Regarding/The/A/An left off, so "Fasting" and "Regarding Fasting", "Watchmen" and "The Watchmen" tied, and
     body BM25 chose: the dense Answers topic, or the short Words To Live By entry, led the letter whose title was
     typed (weak-spots T1: 21 of the 52 whole-title sweep failures), and a near title over a richer body beat the
     title typed whole (T3). Among the first TITLE_ORDER_REACH, keyword searches too, the text whose title the query
     is leads. Which, when several are: a lead word typed is a word of the title, so "the gatekeepers" names "The
     Gatekeepers" (titleLevel 4) before "Gatekeepers" (3), and then the original (ORIGINAL_TIER: a letter, then Words
     To Live By, Holy Days, a study, Answers); a lead word left off says nothing (readers drop it: open case t233,
     "true baptism" for the letter "The True Baptism", whose Words To Live By entry is "True Baptism"), so the original
     first, then the title as typed; then the score. A verse first that holds a quote of VERSE_RUN_HELD typed words
     or more as typed keeps its place (T4's default). */
  const levelOf = (/** @type {any} */ d) => {
    if (!d.title || d.kind === 'verse') return 0;
    const t = titleToks(d);
    const read = (/** @type {string[]} */ q) => Math.max(titleLevel(t.all, q), t.own ? titleLevel(t.own, q) : 0);
    return typedNum ? Math.max(read(typedTokens), read(typedNum)) : read(typedTokens);
  };
  let typedTitle = -1;
  if (out.length > 1 && typedTokens.length) {
    const leadTyped = TITLE_LEAD.has(typedTokens[0]) && typedTokens.length > 1;
    let best = 0;
    for (let r = 0; r < Math.min(out.length, TITLE_ORDER_REACH); r++) {
      const lv = levelOf(out[r].doc);
      if (lv < TITLE_LEVEL_LEAD) continue;
      const t = 9 - (ORIGINAL_TIER[out[r].doc.kind] ?? 5);
      // out is in score order, so the first of equal keys is the higher score
      const key = leadTyped ? lv * 10 + t : t * 10 + lv;
      if (key > best) { typedTitle = r; best = key; }
    }
    const f = out[0];
    const verseHolds = f.doc.kind === 'verse' && typedTokens.length >= VERSE_RUN_HELD && hasTokenRun(docTokens(idOf.get(f) || '', f.doc), typedTokens);
    if (typedTitle > 0 && !verseHolds) out.unshift(out.splice(typedTitle, 1)[0]);
  }
  // Two titles the query names, none typed whole: the one it names more nearly leads ("the high holy days" names The Holy Days, not Regarding The Holy Days of God).
  if (typedTitle < 0 && out.length > 1 && out[0].doc.title && !keyword) {
    const tm = (/** @type {any} */ d) => (d.title ? titleScore(d) : 1);
    const t0 = tm(out[0].doc);
    if (t0 > 1) {
      let b = 0;
      let bt = t0;
      for (let r = 1; r < Math.min(out.length, TITLE_REACH); r++) { const t = tm(out[r].doc); if (t > bt + TITLE_NEARER) { b = r; bt = t; } }
      if (b) out.unshift(out.splice(b, 1)[0]);
    }
  }
  /* A TITLE REMEMBERED LOOSELY (search200 B5, 2026-10-18). BM25 reads a title as a field among the body's words: a
     title typed with a word changed in form, a near-synonym, its words reordered, a typo or the collection's name
     beside it ranked under the Answers topics and short entries whose bodies say the words again and again (the tri
     bench's title/hard, 44 of 70), and an Answers section heading, no field at all, was found only by its body. titles.js
     scores every title and heading on its own; the one the query clearly names (admitTitles: its same-titled reprints
     and its series with it, the original first) joins the results wherever BM25 ranked it, or did not. It leads, just
     under a title typed whole (the pass above: titles.js's levels 4 and 3 are B1's) and under the first texts holding
     the typed words as a quote (below: a quote found is no title). A title opens at its start;
     a heading opens on itself, and a text that holds the heading's words in a row is the passage it labels, its
     original: that text comes first, on those words, and the topic second (Corbin, DECISIONS 10-14). */
  /** @type {Set<any>} the docs the admission placed: they keep their place, as a title named does */
  const admittedDocs = new Set();
  /** @type {Set<any>} ...and the quotes held word for word it left above them, and the texts holding the quote with its slips (B4) */
  const keptDocs = new Set();
  /** A text holding the quote, its slips allowed for (B4's tier B). */
  const alignedSo = (/** @type {any} */ e) => alignHeld.has(/** @type {string} */ (idOf.get(e)));
  for (const e of out) if (alignedSo(e)) keptDocs.add(e.doc);
  /** @type {Set<any>} the entries a title named opens where it says (placeStart): the run typed does not move them */
  const landedByTitle = new Set();
  /** @type {Set<any>} ...of them, those opened at their start: the text was asked for, not a passage of it */
  const titleTop = new Set();
  /** whether what was admitted is a title typed whole (titles.js's levels 4 and 3) */
  let admittedWhole = false;
  /** @type {Set<any>} the docs admitted by their own title (a unit, chapter or part), not by a heading inside them */
  const byOwnTitle = new Set();
  /** A text whose body (not its title) holds the typed words in a row: they are a line of it as well as its title. */
  const bodyHolds = (/** @type {any} */ e) => {
    const id = idOf.get(e);
    return id !== undefined && id in runAt && e.doc.kind !== 'verse' && tokenPlace(e.doc.text || '', runAt[id]) >= 0;
  };
  const titleIx = !p.phrase && typedTokens.length ? titlesNow() : null;
  /* Two readings the words alone do not settle (e2e-search). A collection's word taken off a title in another collection
     names no title: "rebuke one" is no Words To Live By "ONE" (Proverbs 19:25 holds both words). And in a word or two, an
     Answers heading gives way to a text its own title names by them: "144,000" is the topic "Regarding the 144,000
     Witnesses", not the heading "The 144,000" in the index of false doctrines. */
  const titledSo = keyword && out.slice(0, TITLE_REACH).some((e) => e.doc.kind !== 'verse' && named(e.doc));
  const admissible = (/** @type {any} */ h) => !(/collection/.test(h.via) && !h.hinted) && !(titledSo && h.kind === 'heading');
  const scored = titleIx ? scoreTitles(wanted, { index: titleIx, limit: TITLE_HITS, known: termExists }) : [];
  /** @type {any[]} */
  const admitted = admitTitles(scored).filter(admissible);
  /* A PHRASE TYPED AS MEANT IS NO TYPO OF A SHORT TITLE (search200 fix1, scope cause 6). The trigram reading (level 1)
     measures the whole title, and in a short "The X of The Lord" title "of the lord" is most of its trigrams: any short
     word in X's place read as a typo of X. A level-1 title is named only when no text but its own holds the typed run
     whole, its lead words aside (runHolders; null when the run is under RUN_MIN or too common to settle it). A typo's
     word is in no text, so a real typo is still read. */
  if (admitted.length && admitted[0].level === 1) {
    let k = 0;
    while (k < typedTokens.length - 1 && TITLE_LEAD.has(typedTokens[k])) k++;
    const runHeld = runHolders(typedTokens.slice(k));
    const mine = new Set(admitted.map((h) => h.docId));
    if (runHeld && [...runHeld.keys()].some((id) => !mine.has(id))) admitted.length = 0;
  }
  /* A TITLE TYPED WITH ONE WORD WRONG (search200 last2, 2026-10-18). "chosen to teach" for the letter "Given to Teach":
     "chosen" is no form, typo or near-synonym of "given", so no title was named and the letter sat fourth, under texts
     holding the typed words far apart (tri bench n275). titles.js swapTitles reads the title's shape where it fits one
     title alone; that title joins as one remembered loosely (level 2) where nothing else names a title (none admitted
     or scored, none named among the first results) and no text but its own holds every typed content word, or a form
     of it, in the typed order within the typed words' length and two (quotesNear's stretch). A short quote one word
     off a title is the quote ("a pillar of salt" is Genesis 19:26, not "A Pillar of Strength"), and a sentence holding
     the typed words with a word of its own between them is that quote with a word dropped; one holding them in another
     order is another sentence (search200 fix1). An Answers section heading is not read so
     (review, 2026-10-18): it titles no text, only a stretch of a topic titled otherwise, which hands the lead to the
     letter the section cites; a heading one word off ("a flood of mercy" for the heading "A Flood of Judgment", the
     word its opposite) put first a letter whose title holds none of the typed words. */
  if (!admitted.length && titleIx) {
    const sw = swapTitles(wanted, { index: titleIx, hits: scored.filter(admissible) }).filter((h) => admissible(h) && h.kind !== 'heading');
    const mine = new Set(sw.map((h) => h.docId));
    const namedElse = () => out.slice(0, TITLE_REACH).some((e) => e.doc.kind !== 'verse' && named(e.doc) && !mine.has(/** @type {string} */ (idOf.get(e)))
      && titleShare(wanted, e.doc.title, { index: titleIx }) >= SWAP_NAMED_SHARE);
    if (sw.length && !namedElse()) {
      const words = [...new Set(sw[0].typed.filter((w) => !titleIx.skip(w) && w[0] !== '#'))];
      if (holdsTogether(words, sw[0].typed.length + 2, mine) === false) admitted.push(...sw);
    }
  }
  if (admitted.length) {
    /** @type {Map<string, any>} */ const entryOf = new Map();
    for (const e of out) entryOf.set(/** @type {string} */ (idOf.get(e)), e);
    /** The text's entry: the one shown, else a new one when the search may show it. */
    const take = (/** @type {string} */ id) => {
      let e = entryOf.get(id);
      if (e) return e;
      const f = docLookup[id] || msIndex.getStoredFields(id);
      if (!f) return null;
      const d = docLookup[id] ? f : { ...f, id };
      if (!allowed(d) || !fresh(d)) return null;
      e = { score: 0, doc: reshapeDoc(d), terms: matchedTerms[id] || [] };
      idOf.set(e, id);
      entryOf.set(id, e);
      return e;
    };
    /** The prose holding a heading's words in a row, the lowest tier first, then the best ranked: {id, place} or null. */
    const headingOriginal = (/** @type {any} */ h) => {
      const run = joinApostropheS(kjvEncode(h.title));
      /** @type {Map<string, number>|null} */ let hold = run.length >= RUN_MIN ? runHolders(run) : null;
      // A heading too short to look for ("Solidified Eternally") that the typed run holds: the texts holding the typed
      // run hold the heading's words too, so they are its candidates, opened on the typed words.
      if (!hold && run.length && tokenRunAt(typedTokens, run) >= 0) {
        hold = new Map();
        for (const id in runAt) hold.set(id, runAt[id]);
      }
      if (!hold || !hold.size) return null;
      let best = null;
      let bestKey = Infinity;
      for (const [id, at] of hold) {
        if (id === h.docId) continue;
        const f = docLookup[id] || msIndex.getStoredFields(id);
        if (!f || !HEADING_ORIGINALS.has(f.kind)) continue;
        const shown = entryOf.get(id);
        const key = ORIGINAL_TIER[f.kind] * 1e7 + (shown ? out.indexOf(shown) : 1e7 - 1);
        if (key < bestKey) { bestKey = key; best = { id, at, f }; }
      }
      if (!best) return null;
      // held in its title alone: opening the text is arriving under the heading
      const c = tokenPlace(best.f.text || '', best.at);
      return { id: best.id, place: c >= 0 ? c : 0 };
    };
    /** @type {Array<{e: any, at: number, title?: boolean}>} each text admitted, where it opens (-1: where its words are), and whether by its title */
    const placed = [];
    const has = (/** @type {any} */ e) => placed.some((x) => x.e === e);
    for (const h of admitted) {
      if (h.kind === 'heading') {
        const o = headingOriginal(h);
        const oe = o && take(o.id);
        if (oe && !has(oe)) placed.push({ e: oe, at: o.place });
      }
      const e = take(h.docId);
      if (!e || has(e)) continue;
      placed.push({ e, at: h.kind !== 'heading' ? 0 : h.start, title: h.kind !== 'heading' });
    }
    /* A title typed whole (titles.js's levels 4 and 3, its collection's name beside it) is named as B1 names one: only a
       verse quoted word for word keeps above it. Prose holding the typed words in a row is then a text citing the title
       by name ("~ From “Sabbath Peace” ~ Words To Live By"), not a quote found. A title remembered loosely (levels 2
       and 1) is weaker than any quote found: a text holding the typed run (RUN_MIN words or more, B3's runAt) keeps above
       it, as a verse quoted keeps above any title ("held them fast" is a verse's words before it names "Hold Fast"). */
    /* A TITLE'S WORDS TYPED IN ANOTHER ORDER ARE THE TITLE TYPED WHOLE (search200 R3, 2026-10-18). Every word of a title
       and no other typed (TITLE_REORDER_MIN or more, a collection's name beside them aside), only their order changed, is
       the title named, as levels 4 and 3 name it: a text holding those words in the typed order holds a line, the title
       being the reader's whole query. A title missing a typed word, or typed with one of its own left out, stays loose. */
    const typedTitle = (() => { const w = titleWords(wanted); const st = stripCollections(w); return st ? st.w : w; })();
    const sortedWords = (/** @type {string[]} */ w) => [...w].sort().join(' ');
    const typedSorted = typedTitle.length >= TITLE_REORDER_MIN ? sortedWords(typedTitle) : '';
    const reordered = (/** @type {any} */ h) => !!typedSorted && h.kind !== 'heading' && sortedWords(titleWords(h.title || '')) === typedSorted;
    const whole = admitted.some((h) => h.level >= TITLE_LEVEL_LEAD || reordered(h));
    admittedWhole = whole;
    /* A COLLECTION'S NAME TYPED BESIDE A TITLE NAMES THE COLLECTION (main CI, 2026-10-22). "regarding israel answers
       only god can give" is the topic "Regarding Israel" typed whole with its collection's name. The collection's own
       front page is titled with that name and opens on it, so it held five of the seven typed words in a row: B4 read
       it as the quote remembered with its slips, kept it as a quote found, and the meaning, sure of the front page, put
       it over the title the reader named (tri n121, after a re-embed). Typed beside a title in it, the collection's
       words name the collection only: a text B4 held that holds the title's own typed words (the collection's taken
       off) nowhere together holds the typed words only by that name, and holds no quote. */
    if (whole && admitted.some((h) => h.hinted && (h.level >= TITLE_LEVEL_LEAD || reordered(h)))) {
      const own = joinApostropheS(kjvEncode(typedTitle.join(' ')));
      for (const e of own.length ? out : []) {
        if (!alignedSo(e) || has(e)) continue;
        if (typedHeld(joinApostropheS(kjvEncode(e.doc.text || '')), own, own.length + 2) >= own.length) continue;
        keptDocs.delete(e.doc);
        alignHeld.delete(/** @type {string} */ (idOf.get(e)));
      }
    }
    /** A text holding the typed words in a row, in its own words (a title holding them is the admission's call). */
    const holdsTyped = (/** @type {any} */ e) => {
      const id = idOf.get(e);
      if (id === undefined) return false;
      if (whole && e.doc.kind !== 'verse') return false;
      if (id in runAt && typedTokens.length >= (whole ? VERSE_RUN_HELD : RUN_MIN)) return e.doc.kind === 'verse' || tokenPlace(e.doc.text || '', runAt[id]) >= 0;
      return typedTokens.length >= VERSE_RUN_HELD && e.doc.kind === 'verse' && hasTokenRun(docTokens(id, e.doc), typedTokens);
    };
    /* A title remembered loosely is weaker than a quote one word off, too: a text a stretch of which holds every typed
       word but one (QUOTE_NEAR_MIN typed or more), and more of them than the title does, is the quote with a word
       dropped or changed, the title a part of it ("love your bless those who curse you" drops a word of Matthew 5:44,
       its middle the title "Bless Those Who Curse You"). A collection's name typed with the title is the title's: a
       letter's first words "Timothy, concerning the Sabbath..." name no collection, but its words are held. */
    const hintWords = (() => { const w = titleWords(wanted); const st = stripCollections(w); return st ? w.length - st.w.length : 0; })();
    const titleHeld = whole || typedTokens.length < QUOTE_NEAR_MIN ? Infinity
      : Math.max(...admitted.map((h) => typedHeld(joinApostropheS(kjvEncode(h.title || '')), typedTokens, typedTokens.length + 2) + (h.hinted ? hintWords : 0)));
    const quotesNear = (/** @type {any} */ e) => {
      if (titleHeld === Infinity || !e.doc.text) return false;
      const n = typedHeld(joinApostropheS(kjvEncode(e.doc.text)), typedTokens, typedTokens.length + 2);
      return n >= typedTokens.length - 1 && n > titleHeld;
    };
    const lead = out.length && levelOf(out[0].doc) >= TITLE_LEVEL_LEAD ? 1 : 0;
    let pos = lead;
    while (pos < out.length && (holdsTyped(out[pos]) || quotesNear(out[pos]))) { keptDocs.add(out[pos].doc); pos++; }
    for (const x of placed) {
      const at = out.indexOf(x.e);
      // a text the typed words were found in word for word is a quote found, ranked as one (its original first)
      if (at >= lead && at < pos) continue;
      if (at < 0 || at >= pos) {
        if (at >= 0) out.splice(at, 1);
        out.splice(pos++, 0, x.e);
      }
      admittedDocs.add(x.e.doc);
      keptDocs.add(x.e.doc);
      if (x.title) byOwnTitle.add(x.e.doc);
      if (x.at < 0) continue;
      // A title typed whole that its body says word for word: the typed words are that line too, and the run landing
      // below opens on it (a remembered sentence that is also its letter's title, the bench's sentence cases).
      if (x.title && whole && bodyHolds(x.e)) continue;
      // A title remembered loosely that its own body says (nearly) as typed: the reader remembered that sentence, which
      // the run landing below opens on ("the mountains will crumble..." is a line of the letter so titled).
      if (x.title && !whole && (nearOf[/** @type {string} */ (idOf.get(x.e))] || 0) >= NEAR_PHRASE_MIN) continue;
      x.e.placeStart = x.at;
      landedByTitle.add(x.e);
      if (x.at === 0 && x.e.doc.title && admitted.some((h) => h.docId === idOf.get(x.e) && h.kind !== 'heading')) titleTop.add(x.e);
    }
  }
  /* A TITLE NAMED OPENS AT THE TITLE (search200 B5, the S22 look of B1-B3). A text found by its title typed whole opened
     where its words sat thickest in the body (use-search matchExcerpt), or on the typed run held deep in it: the reader
     who typed "God Speaks About The Sabbath" landed on the in-text find's fifth place of six, not on the letter's
     title. A title typed whole (B1's levels) or admitted opens at its start (placeStart 0, use-search's landing at the
     top), a heading on itself; the run landing below leaves them. */
  if (typedTokens.length) {
    for (let r = 0; r < Math.min(out.length, TITLE_ORDER_REACH); r++) {
      const e = out[r];
      if (landedByTitle.has(e) || levelOf(e.doc) < TITLE_LEVEL_LEAD || bodyHolds(e)) continue;
      e.placeStart = 0;
      landedByTitle.add(e);
      titleTop.add(e);
    }
  }
  /** A title named keeps its place, and so does what the admission placed (and the quotes it left above it). */
  const namedOr = keptDocs.size ? (/** @type {any} */ d) => keptDocs.has(d) || named(d) : named;
  // A first result holding the typed words in a row, or one word off, is a quote found: no re-ordering.
  // A question read by its frame is asked of its subject: the first holding the words after the frame in a row (two or
  // more) is a quote found; one holding the frame with them is not ("why should we" is no quote of "fast").
  const restToks = frame ? joinApostropheS(kjvEncode(frame.rest)) : null;
  const quoted = out.length > 0 && (restToks
    ? restToks.length >= 2 && eachWording(docTokens(idOf.get(out[0]) || '', out[0].doc), (t) => nearPhrase(t, restToks, STOP)) >= NEAR_PHRASE_MIN
    : (nearOf[idOf.get(out[0]) || ''] || 0) >= NEAR_PHRASE_MIN);
  // A question's subject in a word or two is still a question: the meaning reads it (no keyword search's gate).
  const meantToo = !keyword || !!frame;
  const held = meantToo && !p.phrase && !quoted ? bestPassageFirst(out, idOf, units, isStopTerm, namedOr) : 1;
  /** @type {Awaited<ReturnType<typeof semanticDocs>>} */ let sem = null;
  // A search the model was not ready for: its words' order stands, and says the meaning comes later (semanticReady).
  let meaningLater = false;
  // The index the words were read from. While the model runs, a build for another edition (the reader
  // changed translation) can swap its own in: from then on this search reads nothing more by id, since
  // that index would hand back the other edition's text. The words' results stand alone.
  if (meantToo && !p.phrase && !quoted && parsed.kind === 'text') {
    // The model reads what the reader wants, not what they ruled out: no -word, and +word as the word.
    const meant = String(wanted);
    // Kept to a collection or scope, the model's best of everything may hold few of its texts: it reads further.
    sem = await semanticDocs(meant, unitId, corpusFilter || scopeBookId || scopeVolumeId ? MEANING_FILTERED : undefined);
    meaningLater = !sem && semanticStatus().status !== 'ready';
    if (msIndex !== inUse) sem = null;
    if (sem) sem = sem.filter((s) => { const f = msIndex.getStoredFields(s.id); return !!f && allowed({ ...f, id: s.id }); });
    const wordsFirst = out[0];
    if (sem && sem.length) {
      // the rare typed words (MEANING_RARE_DF): a word's forms count with it, its synonyms do not
      const dfOf = new Map();
      for (const u of units) if ((u.literal || u.form) && u.origin < 31 && !isStopTerm(u.term)) dfOf.set(u.origin, Math.max(dfOf.get(u.origin) || 0, docFreq(u.term)));
      let rareMask = 0;
      for (const u of units) if (u.literal && u.origin < 31 && !isStopTerm(u.term) && dfOf.get(u.origin) <= MEANING_RARE_DF && docFreq(u.term) > 0) rareMask |= 1 << u.origin;
      meaningFirst(out, idOf, sem, namedOr, held, fresh, (id) => (termMask[id] || 0) & rareMask);
    }
    /* A QUOTE TYPED NEARLY RIGHT KEEPS ITS PLACE OVER AN UNSURE MEANING (search200 fix1, scope cause 5). Kept to a
       scope that hides the texts holding the typed run whole, the words' best passage held most of the quote
       (ALIGN_HELD) and the meaning still lifted over it a text the model was not sure of, holding fewer of the typed
       content words. The words' first goes back first when the meaning's is no sure pick, holds fewer typed content
       words and is not named. */
    if (sem && sem.length && wordsFirst && out[0] !== wordsFirst && held >= ALIGN_HELD) {
      let content = 0;
      for (const u of units) if (u.literal && u.origin < 31 && !isStopTerm(u.term)) content |= 1 << u.origin;
      const holds = (/** @type {any} */ e) => popcount((termMask[idOf.get(e) || ''] || 0) & content);
      const next = sem.find((x) => sem[0].score - x.score > MEANING_SAME);
      const sure = (!next || sem[0].score - next.score >= MEANING_SURE) && idOf.get(out[0]) === sem[0].id;
      if (holds(out[0]) < holds(wordsFirst) && !sure && !namedOr(out[0].doc)) { out.splice(out.indexOf(wordsFirst), 1); out.unshift(wordsFirst); }
    }
    // The meaning re-orders the texts holding less of the quote (B4): those holding it keep their own order.
    if (sem && sem.length && alignHeld.size) {
      const slots = [];
      const kept = [];
      // (what the admission placed keeps its place: a title named, held with its slips too, is no slot)
      for (let r = 0; r < out.length; r++) if (alignedSo(out[r]) && !admittedDocs.has(out[r].doc)) { slots.push(r); kept.push(out[r]); }
      const rank = (/** @type {any} */ e) => /** @type {any} */ (alignHeld.get(/** @type {string} */ (idOf.get(e)))).rank;
      kept.sort((x, y) => rank(x) - rank(y));
      for (let s = 0; s < slots.length; s++) out[slots[s]] = kept[s];
    }
  }
  const nearTyped = (/** @type {string} */ id, /** @type {any} */ d) => nearOf[id] ?? (typedTokens.length > 1 ? eachWording(docTokens(id, d), (t) => nearPhrase(t, typedTokens, STOP)) : 0);
  /* A TITLE NAMED IN PASSING (sr11, 2026-10-15). A title the query names keeps its text's place, but a Words To
     Live By entry's title is often a line of the letter it condenses: a reader quoting the letter ("attained by
     human means": the entry "Not By Human Means") or describing it ("letter explaining that history has an end and
     christ is coming": "History Has an End") named the entry and got it above its letter. Corbin (DECISIONS
     10-14): the original first, the reprint second. A title typed whole, or one the query is mostly made of, still
     keeps its text's place; one the query holds beside more of its own words, or that a quote of the text's own
     words runs through (the text holds more of the query in a row than the title does), does not. */
  const namedSo = (/** @type {any} */ d) => {
    if (!named(d)) return false;
    const tt = titleToks(d).all;
    if (titleScore(d) >= TITLE_EXACT_BOOST) return true;
    const tl = new Set(tt.map(lemma));
    const inTitle = typedContent.filter((w) => tl.has(lemma(w))).length;
    const beside = typedContent.length - inTitle;
    if (beside > inTitle) return false;
    if (!beside) return true;
    const body = nearPhrase(kjvEncode(d.text || ''), typedTokens, STOP);
    return !(body >= NEAR_PHRASE_MIN && body > nearPhrase(tt, typedTokens, STOP));
  };
  /* A title admitted keeps its place as a title named does, but one remembered loosely gives way as namedSo's do when a
     quote of its own words runs through it: "rather let the be written in your heart" is a line of the letter that
     the entry titled "Let The Law Be Written in Your Heart" reprints, the letter first (DECISIONS 10-14). */
  const admittedSo = (/** @type {any} */ d) => {
    if (!admittedDocs.has(d)) return false;
    if (admittedWhole || !byOwnTitle.has(d) || !d.title || typedTokens.length < RUN_MIN) return true;
    const t = joinApostropheS(titleToks(d).all);
    return typedHeld(joinApostropheS(kjvEncode(d.text || '')), typedTokens, typedTokens.length + 2) <= typedHeld(t, typedTokens, t.length);
  };
  if (msIndex === inUse) originalsFirst(out, idOf, (p.phrase ? [p.phrase] : []).concat(filtered.filter((t) => !isStopTerm(t))), (d) => allowed(d) && fresh(d),
    admittedDocs.size ? (/** @type {any} */ d) => admittedSo(d) || namedSo(d) : namedSo, nearTyped, typedTokens,
    alignHeld.size && alignCovOf ? { has: (id) => alignHeld.has(id), cov: alignCovOf, bar: alignBar } : null, typedAlts(units, filtered), askedNotQuoted(typedQ));
  // What those two added counts in its collection. A full one does not refuse it (the words' 400th
  // verse is no reason to drop the model's best text or an original): its last text gives way.
  if (perVolume) {
    const n = Object.create(null);
    for (const e of out) n[e.doc.volumeId || ''] = (n[e.doc.volumeId || ''] || 0) + 1;
    for (let r = out.length - 1; r >= 0; r--) {
      const v = out[r].doc.volumeId || '';
      if (n[v] > perVolume) { n[v]--; capped[v] = true; out.splice(r, 1); }
    }
  }
  /* MATTHEW ONCE (search plan S1, 2026-10-05). Matthew is in the corpus twice, the Study Bible's
     restored text under The Volumes and the plain chapter under Scriptures, so "judge not" showed
     Matthew 7:1 twice, one under the other. Across both collections a verse shows once, as whichever
     of the two the query found first; a search kept to one collection still finds its own. */
  /* ...AS THE SCRIPTURE'S, WHEN BOTH WERE FOUND (search200 wave 3, U03.9, 2026-10-23). Kept as whichever came first,
     Matthew's five "bride" verses showed as the Study Bible's under everything and as the Scripture's under its own
     tab: the Scriptures group said 24 verses there, 29 here. A verse both readings found shows as the Scripture's,
     where the first of them stood, when it holds as many of the typed words; one only the study's restored text
     found (its names) stays the study's. */
  if (!corpusFilter) {
    /** The plain verse the dedup (dedupKey) left out for its study twin worded alike, as an entry; null if none. @param {any} e */
    const plainTwin = (e) => {
      const id = verseIds().get('matthew:' + e.doc.chapterNum + ':' + e.doc.verseNum);
      const f = id && (docLookup[id] || msIndex.getStoredFields(id));
      if (!f || f.bookId !== 'matthew-plain' || f.text !== e.doc.text || !inScope({ ...f, id }) || capped[f.volumeId || 'bible']) return null;
      const twin = { score: scoreMap[id] ?? e.score, doc: reshapeDoc({ ...f, id }), terms: e.terms || [] };
      idOf.set(twin, id);
      return twin;
    };
    const plainOf = new Map();
    for (const e of out) if (e.doc.kind === 'verse' && e.doc.bookId === 'matthew-plain') plainOf.set(e.doc.chapterNum + ':' + e.doc.verseNum, e);
    const seenVerse = new Set();
    let w = 0;
    for (let r = 0; r < out.length; r++) {
      let e = out[r];
      const d = e.doc;
      if (d.kind === 'verse' && (d.bookId === 'matthew' || d.bookId === 'matthew-plain')) {
        const k = d.chapterNum + ':' + d.verseNum;
        if (seenVerse.has(k)) continue;
        seenVerse.add(k);
        if (d.bookId === 'matthew') {
          const plain = plainOf.get(k) || plainTwin(e);
          if (plain && (plain.doc.text === d.text || (e.terms || []).every((/** @type {string} */ t) => (plain.terms || []).includes(t)))) e = plain;
        }
      }
      out[w++] = e;
    }
    out.length = w;
  }
  // And in all: an original originalsFirst brought in from outside the results (or the model's best text) was one
  // text past the limit (sweep low, REPORT.md:645). The last gives way, and the result says texts were left.
  let over = out.length > limit;
  if (over) out.length = limit;
  /* THE READER LANDS ON THE RUN TYPED (search200 B3, 2026-10-18). A text opened where the typed words sit thickest
     (use-search matchExcerpt), and a long letter holding the run deep down opened where its common words crowd. The
     first RUN_LAND_REACH texts holding the typed run (RUN_MIN tokens or more), or the quoted phrase, open on it
     (placeStart), at the run's first word: a landing snapped back to its sentence's start opened a letter's
     greeting, or the clause before the one typed, and missed the words. */
  const landRun = p.phrase ? joinApostropheS(/** @type {string[]} */ (phraseToks)) : typedTokens;
  const landAcc = S && landRun.length >= RUN_MIN ? runIds(S, landRun) : null;
  if (S && landAcc) {
    for (let r = 0; r < Math.min(out.length, RUN_LAND_REACH); r++) {
      const e = out[r];
      if (e.doc.kind === 'verse' || !e.doc.text || landedByTitle.has(e)) continue;
      const id = idOf.get(e);
      const sid = storeSpan(S, id);
      if (sid === null) continue;
      const at = !p.phrase && id !== undefined && id in runAt ? runAt[id] : storeRunAt(S, sid, landAcc);
      const c = at >= 0 ? tokenPlace(e.doc.text, at) : -1;
      if (c >= 0) /** @type {any} */ (e).placeStart = c;
    }
  }
  // A text holding the quote with its slips (B4) opens on the words it holds, at the first of them.
  for (let r = 0; r < Math.min(out.length, RUN_LAND_REACH) && alignHeld.size; r++) {
    const e = out[r];
    const a = alignHeld.get(/** @type {string} */ (idOf.get(e)));
    if (!a || a.start < 0 || e.doc.kind === 'verse' || !e.doc.text || typeof (/** @type {any} */ (e).placeStart) === 'number') continue;
    const c = tokenPlace(e.doc.text, a.start);
    if (c >= 0) /** @type {any} */ (e).placeStart = c;
  }
  if (sem && sem.length) meaningLanding(out, idOf, sem, (p.phrase ? [p.phrase] : []).concat(filtered.filter((t) => !isStopTerm(t))), landedByTitle);
  /* THE SAME WORDS IN ANOTHER VERSE, SHOWN SECOND (search200 fix2, the hunt bench). A verse leading on the typed run
     is often one of two that word it alike (a saying a gospel repeats, a proverb said twice), and the letters quoting
     the first filled Best Matches: the other verse sat below them, unseen. One or two other verses holding the typed
     words in order, nearly in a row, and neither the leader nor its neighbour: the first of them comes up second. */
  if (out.length > 2 && out[0].doc.kind === 'verse' && typedTokens.length >= RUN_MIN) {
    const fid = idOf.get(out[0]) || '';
    const fd = out[0].doc;
    const bk = (/** @type {any} */ d) => (d.bookId === 'matthew-plain' ? 'matthew' : d.bookId);
    const content = typedTokens.filter((t) => !STOP.has(t));
    const inOrder = (/** @type {string[]} */ toks) => { let k = 0; for (const t of toks) if (k < content.length && t === content[k]) k++; return k === content.length; };
    if (((nearOf[fid] || 0) >= 0.9 || fid in runAt) && content.length >= 2) {
      const par = [];
      for (let r = 1; r < Math.min(out.length, REPRINT_REACH) && par.length <= 2; r++) {
        const d = out[r].doc;
        if (d.kind !== 'verse') continue;
        if (bk(d) === bk(fd) && d.chapterNum === fd.chapterNum && Math.abs(d.verseNum - fd.verseNum) <= 1) continue;
        const id = idOf.get(out[r]) || '';
        if ((nearOf[id] || 0) < NEAR_PHRASE_MIN && !(id in runAt)) continue;
        if (!inOrder(docTokens(id, d))) continue;
        par.push(r);
      }
      if (par.length && par.length <= 2 && par[0] >= BEST_SHOWN) out.splice(1, 0, out.splice(par[0], 1)[0]);
    }
  }
  // ...by the passage the screen lands on: the card marks the phrase or the typed run with the words (textQuery.run).
  // A title named first was found by no passage: its same-titled reprints were admitted beside it.
  if ((!out.length || !titleTop.has(out[0])) && reprintSecond(out, (p.phrase ? [p.phrase] : run ? [run] : []).concat(filtered.filter((t) => !isStopTerm(t))),
    idOf, (d) => allowed(d) && fresh(d)) && out.length > limit) { out.length = limit; over = true; }
  /* A QUESTION'S SUBJECT IS HELD (search200 wave 3, U02.5, 2026-10-23). "who is Timothy" listed, past the few texts
     naming him, verses holding only "who is" ("he who is unjust"), above two hundred texts naming Timothy; "what is the
     bride" led with twelve verses saying "what is". A text found by a question's frame words alone (questionFrame), or
     by its small words, answers nothing asked: it goes after the texts holding a word of the subject, in its order. Not a text the model
     ranked (it reads the question whole), a title named or one the admission placed. */
  if (frame && out.length > 1) {
    const frameSet = new Set(joinApostropheS(kjvEncode(frame.frame)));
    const semIds = new Set((sem || []).map((s) => s.id));
    const frameOnly = (/** @type {any} */ e) => {
      const ts = e.terms || [];
      return ts.every((/** @type {string} */ t) => frameSet.has(t) || STOP.has(t)) && !semIds.has(idOf.get(e) || '') &&
        !named(e.doc) && !admittedDocs.has(e.doc) && !titleTop.has(e);
    };
    const asked = out.filter((e) => !frameOnly(e));
    if (asked.length && asked.length < out.length) {
      const rest = out.filter(frameOnly);
      out.length = 0;
      for (const e of asked) out.push(e);
      for (const e of rest) out.push(e);
    }
  }
  /* HOW SURE THE MEANING IS OF A RESULT (search200 ideas F). The screen's topic card names an Answers topic only when
     the model is sure of it: each result the model ranked carries its cosine (`meaning`), however far down the words
     put it ("what happens when we die?" listed keyword verses first and the topics that answer it last, the hub walk
     2026-10-22). A note on the result, read by nothing here: the order above is unchanged. */
  if (sem && sem.length) {
    const cos = new Map(sem.map((s) => [s.id, s.score]));
    for (let r = 0; r < out.length; r++) {
      const c = cos.get(idOf.get(out[r]) || '');
      if (c !== undefined) /** @type {any} */ (out[r]).meaning = c;
    }
  }

  /* CLOSE MATCHES (sr13, 2026-10-15). Book order lists the results in reading order, and most of a passage
     search's results hold a word or two of it: "I am The Lord and I do not change" found 1,344 texts, and Book
     order opened on Genesis 4:9 ("Am I my brother's keeper?"). Each result of a passage search says whether it
     holds the typed words together: most of them in a row (nearPhrase, as the phrase ranking reads it, so one
     word off still counts) and most of their weight in one place (bestWindow: "I am the LORD, and there is no
     other" holds the run's start but not "change", the word that names the saying; a word no text holds, one the
     reader misremembered, weighs nothing). The screen lists the close ones first. A keyword search and a quoted
     phrase mark none: every text they show holds what was typed. Read where the phrase ranking read (its 500 best
     holding the words, nearOf) and on what the meaning and originalsFirst brought in (a reprint's original sits
     with it); past that reach a text holds the words apart, as the ranking scored it. */
  if (!keyword && !p.phrase && typedTokens.length > 1 && typedContent.length) {
    // on the tokens the phrase ranking read (docTokens: cached, the title's words in them)
    const pq = passageQuery(typedContent.filter((w) => docFreq(w) > 0), true);
    for (const e of out) {
      if (spent()) { const r = await pause(); if (r) return r; }
      const id = /** @type {string} */ (idOf.get(e));
      let near = nearOf[id];
      if (near === undefined) near = byWords.has(e) ? 0 : eachWording(docTokens(id, e.doc), (t) => nearPhrase(t, typedTokens, STOP));
      /** @type {{close?: boolean}} */ (e).close = alignHeld.has(id) || (near >= NEAR_PHRASE_MIN && eachWording(docTokens(id, e.doc), (t) => bestWindow(pq.query, t, pq.span)) >= CLOSE_SHARE);
    }
  }

  /* A VERSE ITS KJV WORDING FOUND SAYS SO (search200 idea A, 2026-10-22): its card shows the KJV words it matched,
     and the reader opens it in the KJV for the visit. Only where that wording stood for it (ownShare: it scored better
     than the verse's own), never on a text that is not a verse. Ranking reads nothing of it. */
  if (readInKjv) {
    for (const e of out) {
      if (e.doc.kind === 'verse' && /** @type {string} */ (idOf.get(e)) in ownShare) /** @type {any} */ (e).kjvWording = true;
    }
  }

  /* A QUOTED PHRASE NOTHING HOLDS IS SEARCHED AS ITS WORDS (search audit 2026-09-27).
     A quote remembered one word off ("the earth shall grow old like a garment", where
     the letter says "will") showed "No results" with the letter a word away; the
     reader had to know to take the quote marks off. `unquoted` names the phrase, so
     the screen can say what it did. */
  if (smallRun) return out.length ? { parsed, results: out, parsedTerms: [], textQuery: { ...p, phrase: null, run: smallRun.trim().replace(/\s+/g, ' ').toLowerCase() }, capped: Object.keys(capped), truncated: over || (out.length >= limit && h < rankedIds.length), corrections, meaningLater } : stopOnly;
  if (p.phrase && !out.length && !options._unquoted) {
    const again = await searchWords(String(query).replace(/["\u201C\u201D\u201E\u201F]/g, ' '), { ...options, _unquoted: true });
    if (again.results && again.results.length) return { ...again, unquoted: p.phrase };
  }
  return { parsed, results: out, parsedTerms: filtered, textQuery: run ? { ...p, run } : p, capped: Object.keys(capped), truncated: over || (out.length >= limit && h < rankedIds.length), corrections, meaningLater };
}

/* A BOOK OR COLLECTION NAMED BESIDE THE WORDS (search200 sweep, scope-word.js). "malachi tithes", "faith in hebrews",
   "answers only god can give hell": the name was a word the text must hold, so a verse naming the prophet, a study
   citing the book or the collection's front page led, and the verses in the book or the topics in the collection sat
   far down (Malachi 3:10 25th, Hebrews 11 past the 90th). The rest of the words are searched kept to the book or
   collection, beside the query as typed. The kept search's best leads, with up to SCOPE_LIFT more holding as many of
   the rest's words, when it holds at least as many of them as the plain lead (more, for a book named by an English
   word), and the plain lead is not a text of the book or collection (its front page aside) holding as many, nor
   holds the typed words in a row (a name typed with its title: "john the baptist"). Otherwise the plain reading stands. */
/** How many of the kept search's texts lead, at most. */
const SCOPE_LIFT = 3;
/** A text's identity across two searches (each reshapes its own documents). @param {any} d */
const docKey = (d) => (d.kind === 'verse' ? 'v|' + (d.bookId === 'matthew-plain' ? 'matthew' : d.bookId) + ':' + d.chapterNum + ':' + d.verseNum
  : [d.kind, d.volumeId, d.letterId, d.studyChapterId, d.heading, d.title].join('|'));
/** A title's words, lower case, apostrophes off. @param {string} t */
const nameWords = (t) => String(t || '').toLowerCase().replace(/['‘’]/g, '').split(/[^a-z0-9]+/).filter(Boolean).join(' ');

/**
 * Execute a search: the words (searchWords), and a book or collection named beside them read as where they are.
 * @param {string} query
 * @param {Parameters<typeof searchWords>[1]} [options]
 * @returns {ReturnType<typeof searchWords>}
 */
async function search(query, options) {
  const plain = await searchWords(query, options);
  const front = frontPageFirst(query, options, plain);
  if (front) return front;
  const o = options || {};
  const lead = plain.results && plain.results[0];
  if (!lead || o.scope || plain.aborted || plain.unquoted || (plain.corrections && plain.corrections.length) || !plain.parsed || plain.parsed.kind !== 'text') return plain;
  const sw = scopeWord(query);
  if (!sw || !msIndex) return plain;
  const want = restWords(sw.rest);
  if (!want.length || refFacts().namesTitle(query)) return plain;
  const inScope = (/** @type {any} */ d) => (sw.book ? d.kind === 'verse' && (d.bookId === 'matthew-plain' ? 'matthew' : d.bookId) === sw.book : (sw.volumes || []).includes(d.volumeId));
  const typed = joinApostropheS(kjvEncode(query));
  if (typed.length >= 2 && hasTokenRun(joinApostropheS(kjvEncode((lead.doc.text || '') + ' ' + (lead.doc.title || ''))), typed)) return plain;
  /** @type {any[]} */ let kept = [];
  const scopes = sw.book ? [{ bookId: sw.book === 'matthew' ? 'matthew-plain' : sw.book }] : (sw.volumes || []).map((v) => ({ volumeId: v }));
  for (const scope of scopes) {
    const r = await searchWords(sw.rest, { ...o, scope, limit: 10 });
    if (r.aborted) return r;
    kept = kept.concat(r.results || []);
  }
  if (!kept.length) return plain;
  kept.sort((a, b) => b.score - a.score);
  const D = searchData();
  const isStop = (/** @type {string} */ w) => !!D.STOP_WORDS_TRIMMED && D.STOP_WORDS_TRIMMED.has(w);
  const forms = want.map((w) => new Set([w, ...wordForms(w, isStop)]));
  /** How many of the rest's words a text was found by (its own forms, or the word's start). @param {any} e */
  const held = (e) => forms.filter((f, i) => (e.terms || []).some((/** @type {string} */ t) => f.has(t) || (want[i].length >= 4 && t.startsWith(want[i])))).length;
  const top = held(kept[0]);
  const plainHeld = held(lead);
  if (!top || top < plainHeld || (sw.wordish && top === plainHeld)) return plain;
  // a lead already in the book or collection (its front page aside) holding as many of the words keeps its place
  if (inScope(lead.doc) && nameWords(lead.doc.title) !== sw.name && plainHeld >= top) return plain;
  const lift = kept.filter((e) => held(e) === top).slice(0, SCOPE_LIFT);
  const lifted = new Set(lift.map((e) => docKey(e.doc)));
  const results = lift.concat(plain.results.filter((e) => !lifted.has(docKey(e.doc)))).slice(0, Math.max(plain.results.length, lift.length));
  return { ...plain, results };
}

/* A COLLECTION'S NAME TYPED ALONE OPENS IT (search200 wave 3, U02.5, 2026-10-23). "letters from timothy" led with a
   Bible study and Answers topics saying "letters", "from" and "Timothy" often, the collection's own first page nowhere
   near the top. A collection's full name typed alone (scope-word.js collectionNamed) puts its front page first: the
   text titled with the name (Answers Only God Can Give's main page), else its preface, else its first letter. A search
   kept to a scope, or to a corpus the collection is not in, is left alone. */
/** @returns {ReturnType<typeof searchWords>|null} */
function frontPageFirst(/** @type {string} */ query, /** @type {any} */ options, /** @type {any} */ plain) {
  const o = options || {};
  if (o.scope || !msIndex || plain.aborted || !plain.parsed || plain.parsed.kind !== 'text' || !Array.isArray(plain.results)) return null;
  const named = collectionNamed(query);
  if (!named) return null;
  const vol = named.volumes[0];
  const corpus = o.corpus && o.corpus !== 'all' ? o.corpus : null;
  /** @type {any} */ let best = null;
  let rank = 0;
  for (const f of msIndex._storedFields.values()) {
    if (!f || f.kind === 'verse' || f.volumeId !== vol || (corpus && f.corpus !== corpus)) continue;
    const r = nameWords(f.title) === named.name ? 3 : / · Preface$/.test(f.ref || '') ? 2 : 1;
    const num = (/** @type {any} */ d) => d.letterNum || Infinity;
    if (!best || r > rank || (r === rank && r === 1 && num(f) < num(best))) { best = f; rank = r; }
  }
  if (!best) return null;
  const same = (/** @type {any} */ d) => d.kind === best.kind && d.volumeId === best.volumeId && d.letterId === best.letterId && (d.studyChapterId || '') === (best.studyChapterId || '');
  const at = plain.results.findIndex((/** @type {any} */ e) => same(e.doc));
  if (at === 0) return plain;
  const entry = at > 0 ? plain.results[at] : { score: plain.results.length ? plain.results[0].score : 0, doc: reshapeDoc(best), terms: [] };
  return { ...plain, results: [entry, ...plain.results.filter((/** @type {any} */ e) => !same(e.doc))] };
}

/** Whether the index holds a word (search200 ideas G: "Try fewer words" keeps the words some text holds). */
function knows(/** @type {string} */ word) {
  if (!msIndex) return false;
  const toks = kjvEncode(String(word || ''));
  return toks.length > 0 && toks.every((t) => termExists(t));
}

/**
 * THE NEAREST TEXTS BY MEANING ALONE (search200 ideas G). A search that found nothing ("photosynthesis" under the
 * Scriptures) shows the texts the on-device model ranks nearest what was typed, each with its cosine (`meaning`), so
 * the screen can show those above its floor. The words play no part: no typed word reached them. Kept to the corpus
 * and scope the search was, one text per passage (a reprint of one shown is left out), at most `limit`. Empty while
 * the model is not ready, or for an index another edition swapped in meanwhile.
 * @param {string} query
 * @param {{corpus?:string, scope?:{bookId?:string, volumeId?:string}|null, limit?:number}} [options]
 * @returns {Promise<Array<{score:number, meaning:number, doc:any, terms:string[], placeStart?:number}>>}
 */
async function nearest(query, options) {
  options = options || {};
  const q = String(query || '').trim();
  if (!q || !ready || !msIndex) return [];
  const inUse = msIndex;
  const corpusFilter = options.corpus && options.corpus !== 'all' ? options.corpus : null;
  const scope = options.scope || null;
  const bookId = scope && scope.bookId ? scope.bookId : null;
  const volumeId = scope && scope.volumeId ? scope.volumeId : null;
  const sem = await semanticDocs(q, unitId, corpusFilter || bookId || volumeId ? MEANING_FILTERED : undefined);
  if (!sem || msIndex !== inUse) return [];
  const limit = options.limit || 3;
  /** @type {Array<{score:number, meaning:number, doc:any, terms:string[], placeStart?:number}>} */
  const out = [];
  const seen = new Set();
  for (const s of sem) {
    if (out.length >= limit) break;
    const f = msIndex.getStoredFields(s.id);
    if (!f || (corpusFilter && f.corpus !== corpusFilter) || (bookId && f.bookId !== bookId) || (volumeId && f.volumeId !== volumeId)) continue;
    const key = String(f.text || '').slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    const e = { score: 0, meaning: s.score, doc: reshapeDoc(f), terms: /** @type {string[]} */ ([]) };
    if (f.kind !== 'verse' && s.start >= 0) /** @type {any} */ (e).placeStart = s.start;
    out.push(e);
  }
  return out;
}

/* STUDY NOTES, CHAPTER SUMMARIES AND HEADINGS (Corbin 2026-10-23, DECISIONS item 5): searched in an index of their own
   (notes-index.js), so search() and its ranking are untouched; the screen lists them as one group after the collections.
   Built on the first call from the corpora the main index loaded (ensureReady), again only when a corpus object is
   replaced (another load), never cached. */
/** @type {{ books: any, plain: any, mt: any, restored: any, searcher: Promise<Awaited<ReturnType<typeof notesSearcherAsync>>>, size: number, buildMs: number } | null} */
let NOTES = null;
/**
 * The study notes, chapter summaries and headings holding the typed words, best first, kept to the corpus and scope.
 * @param {string} query
 * @param {{useStopWords?: boolean, corpus?: string, scope?: {bookId?: string, volumeId?: string}|null, limit?: number, translation?: string}} [options]
 * @returns {Promise<Array<{score: number, doc: any, terms: string[]}>>}
 */
async function searchNotes(query, options) {
  const q = String(query || '').trim();
  if (!q) return [];
  await ensureReady(options);
  const books = typeof BOOKS !== 'undefined' ? BOOKS : null;
  const mt = typeof MATTHEW !== 'undefined' ? MATTHEW : null;
  const plain = books ? books['matthew-plain'] : null;
  const restored = typeof BOOKS_RESTORED !== 'undefined' ? BOOKS_RESTORED : null;
  if (!NOTES || NOTES.books !== books || NOTES.plain !== plain || NOTES.mt !== mt || NOTES.restored !== restored) {
    const t0 = now();
    const docs = buildNoteDocs();
    const built = { books, plain, mt, restored, size: docs.length, buildMs: -1, searcher: notesSearcherAsync(docs) };
    built.searcher.then(() => { built.buildMs = Math.round(now() - t0); }, () => { if (NOTES === built) NOTES = null; });
    NOTES = built;
  }
  return (await NOTES.searcher).search(q, options);
}

/** The notes index's size and build time (-1 while it builds), once asked for (benchmarks, the console). */
function notesStats() {
  return NOTES ? { docs: NOTES.size, buildMs: NOTES.buildMs } : null;
}

/**
 * Autocomplete suggestions (named passages + book names + commands).
 * @param {string} query
 * @param {{max?:number}} [opts]
 * @returns {Array<{kind:string, label:string, query:string, hint?:string}>}
 */
function suggest(query, opts) {
  opts = opts || {};
  const max = opts.max || 10;
  const out = [];
  // trimmed first: a space alone was a prefix of every key (sweep 2026-10-14 v053)
  const q = String(query || '').trim().toLowerCase();
  if (!q) return out;
  const D = searchData();

  for (let i = 0; i < D.NAMED_PASSAGES.length && out.length < max; i++) {
    const np = D.NAMED_PASSAGES[i];
    for (let k = 0; k < np.keys.length; k++) {
      if (np.keys[k].indexOf(q) === 0) {
        out.push({
          kind: 'passage',
          label: np.keys[k].replace(/\b\w/g, (c) => c.toUpperCase()),
          query: np.keys[k],
          hint: (D.BOOK_DISPLAY[np.bookId] || np.bookId) + ' ' + np.chapter + (np.verseStart ? ':' + np.verseStart + (np.verseEnd ? '-' + np.verseEnd : '') : ''),
        });
        break;
      }
    }
  }

  const bookSeen = Object.create(null);
  const abbrevKeys = Object.keys(D.BOOK_ABBREVS);
  for (let b = 0; b < abbrevKeys.length && out.length < max; b++) {
    const k2 = abbrevKeys[b];
    if (k2.length < 2) continue;
    if (k2.indexOf(q) === 0) {
      const bid = D.BOOK_ABBREVS[k2];
      if (bookSeen[bid]) continue;
      bookSeen[bid] = true;
      out.push({ kind: 'book', label: D.BOOK_DISPLAY[bid] || bid, query: D.BOOK_DISPLAY[bid] || bid, hint: 'Book' });
    }
  }

  for (let c = 0; c < D.COMMANDS.length && out.length < max; c++) {
    for (let cc = 0; cc < D.COMMANDS[c].keys.length; cc++) {
      if (D.COMMANDS[c].keys[cc].indexOf(q) === 0) {
        out.push({ kind: 'command', label: D.COMMANDS[c].label, query: D.COMMANDS[c].keys[cc], hint: 'Command' });
        break;
      }
    }
  }
  return out;
}

/** Drop the in-memory index and the warm cache, and build again for the active (or given) translation. */
function rebuild(options) {
  options = options || {};
  const code = options.translation || stats.translation || 'nkjv';
  ready = false;
  msIndex = null;
  coldNext = true;
  clearCached().catch(() => {});
  return init({ translation: code });
}

function getState() {
  return {
    ready,
    building: !!building,
    error: buildError ? buildError.message : null,
    docCount: stats.docCount || 0,
    translation: stats.translation || null,
    // the originals (originalsFirst): read, being read a slice at a time, or not yet
    originals: ORIGINALS ? 'ready' : (ORIGINALS_BUILD && ORIGINALS_BUILD.ms === msIndex ? 'building' : 'none'),
    // every verse's KJV wording (kjv-twin.js): 'ready', 'loading', 'failed' or 'none'
    kjv: kjvTwinStatus(),
  };
}

function getStats() {
  return Object.assign({}, stats);
}

/**
 * The key a result is shown once by: one text in one place. Its unit is in it (search200 bugcheck #5): five pairs
 * of Answers topics open with the same dated header, so the 60 characters a key read alone hid one topic of each
 * pair ("Regarding Sin" under "Regarding Forgiveness"). A verse has no unit: the same verse twice still folds.
 * @param {any} d
 * @returns {string}
 */
export function dedupKey(d) {
  return d.kind + '|' + (d.ref || '') + '|' + (d.kind === 'verse' ? '' : d.letterId || '') + '|' + (d.text || '').slice(0, 60);
}

export const VotSearchMini = {
  init,
  isCurrent,
  // the on-device meaning search: its state ({status, failure, units}), and a start for callers that need it now
  meaningStatus: semanticStatus,
  startMeaning: startSemantic,
  whenMeaningReady: semanticReady,
  rebuild,
  parse: readReference,
  search,
  // study notes, chapter summaries and headings: their own index and their own group (notes-index.js)
  searchNotes,
  notesStats,
  nearest,
  knows,
  suggest,
  snippet,
  snippetAt,
  matchExcerpt,
  morePlaces,
  findPlaces,
  highlightSpans,
  levenshtein,
  fuzzyBookSuggest,
  getState,
  getStats,
  // B4's alignment of a quote remembered with its slips: on by default, setAlign(false) its emergency off switch
  setAlign,
  // B7's substitution lexicon (lexicon.js), credited inside the alignment only: the app names its file
  // (setAlignLexiconSource, ui/_entry-d.js); the benchmark and tests set one directly (setAlignLexicon)
  setAlignLexicon,
  setAlignLexiconSource,
  // every verse's KJV wording, read beside the reader's edition (kjv-twin.js): the app names its file
  // (setKjvTwinSource, ui/_entry-d.js); the benchmark and tests set one directly (setKjvTwin, parsed: parseKjvTwin)
  setKjvTwin,
  setKjvTwinSource,
};
