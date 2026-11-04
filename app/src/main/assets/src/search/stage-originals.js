/* search/stage-originals.js — the original before its reprint, each collection's cap, and Matthew once.
   A stage of engine.js searchWords (audit 232: one stage per module, the run's state in one context object).

   READS ctx.out / ctx.idOf, ctx.p, ctx.filtered, ctx.units, ctx.typedQ, ctx.typedTokens, ctx.typedContent, ctx.STOP,
   ctx.nearOf, ctx.named, ctx.titleScore, ctx.admittedDocs, ctx.admittedWhole, ctx.byOwnTitle, ctx.allowed, ctx.fresh,
   ctx.inScope, ctx.alignHeld / ctx.alignCovOf / ctx.alignBar (stage-align.js), ctx.perVolume, ctx.capped,
   ctx.corpusFilter, ctx.scoreMap, ctx.docLookup, ctx.inUse, ctx.eng.
   Re-orders ctx.out (originalsFirst: a reprint gives its place to its original), cuts each full collection's last
   texts (marking ctx.capped), and shows a Matthew verse found in both readings once, as the Scripture's. */

import { kjvEncode } from './tokenize.js';
import { joinApostropheS, nearPhrase, NEAR_PHRASE_MIN, TITLE_EXACT_BOOST } from './ranking.js';
import { lemma } from './passage.js';

/** The originals, the caps and Matthew once, on the results so far. @param {any} ctx */
export function originalsStage(ctx) {
  const { out, idOf, p, filtered, units, typedQ, typedTokens, typedContent, STOP, nearOf, named, titleScore, admittedDocs, admittedWhole, byOwnTitle,
    allowed, fresh, inScope, alignHeld, alignCovOf, alignBar, perVolume, capped, corpusFilter, scoreMap, docLookup, inUse } = ctx;
  const { index, isStopTerm, eachWording, docTokens, titleToks, typedHeld, originalsFirst, typedAlts, askedNotQuoted, verseIds, reshapeDoc, RUN_MIN } = ctx.eng;
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
  if (index() === inUse) originalsFirst(out, idOf, (p.phrase ? [p.phrase] : []).concat(filtered.filter((t) => !isStopTerm(t))), (d) => allowed(d) && fresh(d),
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
      const f = id && (docLookup[id] || index().getStoredFields(id));
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
}
