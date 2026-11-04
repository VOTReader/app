/* search/stage-units.js — the search units: the words of a text query, each with what it is searched as too.
   A stage of engine.js searchWords (audit 232: one stage per module, the run's state in one context object).

   READS ctx.p (the text parse), ctx.filtered (its words, small words dropped past four), ctx.options (synonyms),
   ctx.D (searchData()), ctx.eng (the engine's own: termExists, restoredNameOf, NAME_FORMS).
   WRITES ctx.units (one BM25 search each: the literal words, their synonyms and forms, a name or number typed in
   parts) and ctx.didExpand (some unit is not a word as typed: the synonym-only demotion applies). */

import { expandQueryTerms } from './synonyms.js';
import { wordForms } from './word-forms.js';
import { numberReading } from './numbers.js';
import { kjvEncode } from './tokenize.js';

/** Build the search units (literal + synonyms). @param {any} ctx */
export function searchUnits(ctx) {
  const { p, filtered, options, D } = ctx;
  const { termExists, restoredNameOf, NAME_FORMS } = ctx.eng;
  /** @type {any[]} */ let units;
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
  ctx.units = units;
  ctx.didExpand = didExpand;
}
