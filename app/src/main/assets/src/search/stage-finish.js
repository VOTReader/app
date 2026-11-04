/* search/stage-finish.js — the results finished: cut to the limit, each opened where the reader meant, and marked.
   A stage of engine.js searchWords (audit 232: one stage per module, the run's state in one context object).

   READS ctx.out / ctx.idOf, ctx.limit, ctx.p, ctx.phraseToks, ctx.filtered, ctx.run, ctx.typedTokens, ctx.typedContent,
   ctx.keyword, ctx.frame, ctx.STOP, ctx.S (the token store), ctx.runAt, ctx.nearOf, ctx.alignHeld, ctx.sem, ctx.named,
   ctx.admittedDocs, ctx.landedByTitle, ctx.titleTop, ctx.byWords, ctx.allowed, ctx.fresh, ctx.readInKjv, ctx.ownShare,
   ctx.spent / ctx.pause, ctx.eng.
   WRITES ctx.over (texts were left past the limit); sets each result's placeStart, close, meaning and kjvWording, and
   re-orders ctx.out (the same words in another verse second, reprintSecond, a question's subject held).
   Returns null to go on, or what the search returns when a page's turn stopped it. */

import { kjvEncode } from './tokenize.js';
import { joinApostropheS, nearPhrase, NEAR_PHRASE_MIN } from './ranking.js';
import { bestWindow } from './passage.js';

/** The first texts that open on the typed run they hold (their placeStart). */
const RUN_LAND_REACH = 10;
/** A close match holds this share of the query's content words in one passage, rare words weighing most (sr13). */
const CLOSE_SHARE = 0.75;

/** Cut, land and mark the results. @param {any} ctx */
export async function finishResults(ctx) {
  const { out, idOf, limit, p, phraseToks, filtered, run, typedTokens, typedContent, keyword, frame, STOP, S, runAt, nearOf, alignHeld, sem, named,
    admittedDocs, landedByTitle, titleTop, byWords, allowed, fresh, readInKjv, ownShare, spent, pause } = ctx;
  const { runIds, storeSpan, storeRunAt, tokenPlace, meaningLanding, docTokens, reprintSecond, isStopTerm, passageQuery, docFreq, eachWording,
    REPRINT_REACH, BEST_SHOWN, RUN_MIN } = ctx.eng;
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

  ctx.over = over;
  return null;
}
