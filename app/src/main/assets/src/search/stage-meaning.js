/* search/stage-meaning.js — the meaning: the on-device model's order (semantic.js) fused with the words'.
   A stage of engine.js searchWords (audit 232: one stage per module, the run's state in one context object).

   READS ctx.out / ctx.idOf (the results so far, by the words), ctx.p, ctx.parsed, ctx.keyword, ctx.frame, ctx.wanted,
   ctx.units, ctx.termMask, ctx.nearOf, ctx.STOP, ctx.named, ctx.keptDocs, ctx.allowed, ctx.fresh, ctx.alignHeld,
   ctx.alignedSo, ctx.admittedDocs, the scope (ctx.corpusFilter, ctx.scopeBookId, ctx.scopeVolumeId), the index and
   KJV wording the words were read with (ctx.inUse, ctx.twinInUse; ctx.rerun searches again on new ones), ctx.eng.
   WRITES ctx.sem (the model's texts, best first; null when it did not run) and ctx.meaningLater; re-orders ctx.out
   (bestPassageFirst, meaningFirst) and adds the model's best texts to it.
   Returns null to go on, or what the search returns when it started over. */

import { kjvEncode } from './tokenize.js';
import { popcount, joinApostropheS, nearPhrase, NEAR_PHRASE_MIN } from './ranking.js';
import { lemma, bestWindow } from './passage.js';
import { semanticDocs, semanticStatus } from './semantic.js';
import { ALIGN_HELD } from './stage-align.js';

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
export const MEANING_FILTERED = 300;
const MEANING_K = 10;
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
 * @param {any} eng  the engine's own (engine.js ENGINE)
 * @param {Array<{score:number, doc:any, terms?:string[], placeStart?:number, meaningStart?:number}>} out
 * @param {Map<any, string>} idOf
 * @param {Array<{id:string, score:number, start:number}>} sem  best first
 * @param {(doc:any) => boolean} named
 * @param {number} held  the most of the query one passage of the words engine's top holds (bestPassageFirst)
 * @param {(doc:any) => boolean} admit  marks a document the meaning adds shown: false for a text already shown
 * @param {(id:string) => number} rare  the rare typed words a document holds (a mask; 0 for none)
 */
export function meaningFirst(eng, out, idOf, sem, named, held, admit, rare) {
  const { index, reshapeDoc, ORIGINAL_TIER } = eng;
  const w = MEANING_WEIGHT * Math.max(0, 1 - held);
  // Its order, with texts it cannot tell apart taken original first.
  const tierOf = (/** @type {string} */ id) => { const f = index().getStoredFields(id); return (f && ORIGINAL_TIER[f.kind]) ?? 5; };
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
      const f = index().getStoredFields(s.id);
      if (!f || !admit(f)) continue;
      e = { score: 0, doc: reshapeDoc(f), terms: [] };
      idOf.set(e, s.id);
    }
    top.push(e);
    inTop.add(s.id);
    added.add(e);
    // its card says "by meaning" when the typed words do not find it as typed (search200 ideas E, snippet.js whyMatched)
    /** @type {any} */ (e).byMeaning = true;
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
 * @param {any} eng  the engine's own (engine.js ENGINE)
 * @param {Array<{score:number, doc:any, terms?:string[]}>} out
 * @param {Map<any, string>} idOf
 * @param {Array<{term:string, origin:number, literal?:boolean}>} units  the search's units: each typed
 *   word (literal) with its synonyms, names and forms (same origin)
 * @param {(term:string) => boolean} stop
 * @param {(doc:any) => boolean} named
 */
export function bestPassageFirst(eng, out, idOf, units, stop, named) {
  const { index, docFreq, docLemmas, eachWording, REPRINT_COST } = eng;
  const n = index().documentCount || 1;
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

/** Fuse the meaning's order with the words'. @param {any} ctx */
export async function meaningFuse(ctx) {
  const { out, idOf, p, parsed, keyword, frame, wanted, units, termMask, nearOf, STOP, named, keptDocs, allowed, fresh, alignHeld, alignedSo, admittedDocs,
    corpusFilter, scopeBookId, scopeVolumeId, inUse, twinInUse, rerun } = ctx;
  const { index, twinRead, isStopTerm, docFreq, docTokens, eachWording, unitId } = ctx.eng;
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
  const held = meantToo && !p.phrase && !quoted ? bestPassageFirst(ctx.eng, out, idOf, units, isStopTerm, namedOr) : 1;
  /** @type {any} */ let sem = null;
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
    /* A KJV wording taken up while the model ran (adoptTwin: the file loaded late) dropped the originals and the
       store this search read with, and originalsFirst below would read the originals anew in one block, under the
       reader's typing, in the new wording. It starts over on the new wording, as at a page's turn (pause). */
    if (index() === inUse && twinRead() !== twinInUse) return rerun();
    if (index() !== inUse) sem = null;
    if (sem) sem = sem.filter((s) => { const f = index().getStoredFields(s.id); return !!f && allowed({ ...f, id: s.id }); });
    const wordsFirst = out[0];
    if (sem && sem.length) {
      // the rare typed words (MEANING_RARE_DF): a word's forms count with it, its synonyms do not
      const dfOf = new Map();
      for (const u of units) if ((u.literal || u.form) && u.origin < 31 && !isStopTerm(u.term)) dfOf.set(u.origin, Math.max(dfOf.get(u.origin) || 0, docFreq(u.term)));
      let rareMask = 0;
      for (const u of units) if (u.literal && u.origin < 31 && !isStopTerm(u.term) && dfOf.get(u.origin) <= MEANING_RARE_DF && docFreq(u.term) > 0) rareMask |= 1 << u.origin;
      meaningFirst(ctx.eng, out, idOf, sem, namedOr, held, fresh, (id) => (termMask[id] || 0) & rareMask);
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
  ctx.sem = sem;
  ctx.meaningLater = meaningLater;
  return null;
}
