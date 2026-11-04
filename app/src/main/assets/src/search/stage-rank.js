/* search/stage-rank.js — the words' ranking: coverage, the KJV wording, the phrase and the typed run, titles named.
   A stage of engine.js searchWords (audit 232: one stage per module, the run's state in one context object).

   READS ctx.units, the score tables (stage-match.js: ctx.scoreMap, ctx.termMask, ctx.kjvScore, ctx.kjvMask,
   ctx.literalHit, ctx.answersHits, ctx.docLookup), ctx.didExpand, ctx.corrections, ctx.keyword, ctx.wanted, ctx.p,
   ctx.D, ctx.spent / ctx.pause, ctx.eng.
   WRITES ctx.rankedIds (every text found), ctx.typedTokens (the typed run, corrections in), ctx.typedNum, ctx.STOP,
   ctx.fixedTo, ctx.nearOf (how nearly a text holds the typed run), ctx.runAt / ctx.heldWhole (the texts holding it
   whole), ctx.run (a small-word run's marks), ctx.ownShare / ctx.readInKjv (verses read in their KJV wording),
   ctx.pool / ctx.maskOwn (a pool read in the reader's edition first) and ctx.titleScore; re-scores ctx.scoreMap.
   Returns null to go on, or what the search returns when a page's turn stopped it. */

import { kjvEncode } from './tokenize.js';
import { numberReading } from './numbers.js';
import {
  KIND_BOOST, coverageMultiplier, popcount, PHRASE_BOOST, SYNONYM_DEMOTION, joinApostropheS, NEAR_PHRASE_MIN, ORIGINAL_BOOST, REPRINT_KINDS,
  nearPhrase, titleMatch, TITLE_EXACT_BOOST, TITLE_LEAD,
} from './ranking.js';

/** Rank what the words found. @param {any} ctx */
export async function rankWords(ctx) {
  const { units, scoreMap, termMask, kjvScore, kjvMask, literalHit, answersHits, docLookup, didExpand, corrections, keyword, wanted, p, D, spent, pause } = ctx;
  const { docTokens, eachWording, excerptCover, hasTokenRun, namesAsVersePrints, oneName, restoredNameOf, runHolders, storyWindow, titleToks,
    tokenRunAt, twinNow, NAME_FORMS, TWIN_SEP, PART_UNDER_RUN, PHRASE_CANDIDATES, RUN_LEAD_MIN, RUN_MIN, SMALL_RUN_MIN } = ctx.eng;
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
  Object.assign(ctx, { rankedIds, typedTokens, typedNum, STOP, fixedTo, nearOf, runAt, heldWhole, run, ownShare, readInKjv, pool, maskOwn, titleScore });
  return null;
}
