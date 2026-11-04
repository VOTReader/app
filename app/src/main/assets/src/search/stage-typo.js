/* search/stage-typo.js — the typo fallback: a typed word nothing of its own found, searched as its nearest spelling.
   A stage of engine.js searchWords (audit 232: one stage per module, the run's state in one context object).

   READS ctx.unheard / ctx.heard / ctx.heardOwn / ctx.unitOpts (stage-match.js), ctx.navAlso, ctx.keyword,
   ctx.spent / ctx.pause, ctx.eng (searchCorrected, formMisspelt).
   WRITES ctx.corrections ({ from, to } per word corrected) and adds what each corrected word finds to the score
   tables (stage-match.js accumulate). The engine searches a corrected query again as that query.
   Returns null to go on, or what the search returns when a page's turn stopped it. */

import { kjvEncode } from './tokenize.js';
import { accumulate } from './stage-match.js';

/** Search each word nothing of its own found as its nearest spelling. @param {any} ctx */
export async function typoFallback(ctx) {
  const { unheard, heard, heardOwn, unitOpts, navAlso, keyword, spent, pause } = ctx;
  const { searchCorrected, formMisspelt } = ctx.eng;
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
    accumulate(ctx, unit, fixed.res);
    if (fixed.to && typed.length === 1 && typed[0] !== fixed.to) corrections.push({ from: typed[0], to: fixed.to });
  }
  ctx.corrections = corrections;
  return null;
}
