/* search/stage-match.js — the words matched: one BM25 search per search unit, each text's score and coverage added up.
   A stage of engine.js searchWords (audit 232: one stage per module, the run's state in one context object).

   READS ctx.units (stage-units.js), ctx.keyword, ctx.spent / ctx.pause (the page's turn), ctx.eng (searchUnit,
   prefixable, isStopTerm).
   WRITES the run's score tables, keyed by doc id: ctx.scoreMap, ctx.termMask (the typed words a text holds, a bit per
   word), ctx.literalHit, ctx.matchedTerms, ctx.answersHits, ctx.kjvScore, ctx.kjvMask, ctx.docLookup; ctx.unitOpts
   (a unit's MiniSearch options), ctx.contentTyped; and for the typo fallback ctx.heard, ctx.heardOwn, ctx.unheard.
   Returns null to go on, or what the search returns when a page's turn stopped it. */

import { MS_SEARCH_DEFAULTS } from './search-config.js';
import { SYNONYM_WEIGHT, FORM_WEIGHT } from './ranking.js';

/** One unit's hits added to the run's tables. @param {any} ctx @param {any} unit @param {any[]} res */
export function accumulate(ctx, unit, res) {
  const { scoreMap, termMask, literalHit, matchedTerms, answersHits, kjvScore, kjvMask, docLookup, contentTyped } = ctx;
  const { isStopTerm } = ctx.eng;
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
}

/** Search every unit, adding up what each finds. @param {any} ctx */
export async function matchWords(ctx) {
  const { units, keyword, spent, pause } = ctx;
  const { searchUnit, prefixable, isStopTerm } = ctx.eng;
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
  Object.assign(ctx, { scoreMap, termMask, literalHit, matchedTerms, answersHits, kjvScore, kjvMask, docLookup, unitOpts, contentTyped });
  const heard = Object.create(null);   // origin -> some unit of that word found something
  const heardOwn = Object.create(null); // origin -> a unit other than its word forms found something
  const unheard = [];                  // literal units that found nothing as typed
  for (let u = 0; u < units.length; u++) {
    if (spent()) { const r = await pause(); if (r) return r; }
    const unit = units[u];
    let res;
    try { res = searchUnit(unit.term, unitOpts(unit), keyword); } catch { continue; }
    if (res && res.length) { heard[unit.origin] = true; if (!unit.form) heardOwn[unit.origin] = true; accumulate(ctx, unit, res); continue; }
    if (unit.literal) unheard.push(unit);
  }
  Object.assign(ctx, { heard, heardOwn, unheard });
  return null;
}
