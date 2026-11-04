/* search/stage-align.js — a quote remembered with its slips (search200 B4): the texts holding it lead.
   A stage of engine.js searchWords (audit 232: one stage per module, the run's state in one context object).

   READS ctx.p, ctx.keyword, ctx.units, ctx.typedTokens, ctx.heldWhole (the texts holding the typed run whole: no
   alignment then), ctx.fixedTo, ctx.STOP, ctx.nearOf, the score tables (ctx.scoreMap, ctx.termMask, ctx.docLookup,
   ctx.rankedIds) and ctx.pool / ctx.maskOwn (a pool read in the reader's edition first), ctx.spent / ctx.pause,
   ctx.eng (alignOn, alignLexicon, index, storeNow, storeSpan, docFreq, wordingsOf, isStopTerm, TWIN_SEP).
   WRITES ctx.alignHeld (tier B: the texts holding the quote, slips and all), ctx.alignCovOf, ctx.alignBar; lifts the
   held texts' scores, and adds a held verse's neighbour to the tables (two verses run together).
   Returns null to go on, or what the search returns when a page's turn stopped it. */

import { kjvEncode } from './tokenize.js';
import { popcount, NEAR_PHRASE_MIN } from './ranking.js';
import { alignClasses, alignWeights, alignScore, alignMet } from './align.js';

/** Typed tokens, at least, for the typed words to be aligned as a quote. */
const ALIGN_MIN = 5;
/** The share of the typed words' weight (BM25 idf) a text holds anywhere, as typed or in a form or synonym, to be aligned
    (a typed word no text holding that share holds is left out of the weight: search() below). */
const ALIGN_MASS = 0.5;
/** Texts aligned at most: the best-scored of those holding that share. */
const ALIGN_CANDIDATES = 300;
/** How much of the quote (align.js cov) a text holds, slips allowed for, to lead every text holding less (tier B). */
export const ALIGN_HELD = 0.75;
/** How much of the quote a text holds to be held with no text holding ALIGN_HELD, when it holds it far better than the rest (search() below). */
const ALIGN_CLEAR = 0.6;
/** Texts at most holding a clear best alike (a text and its copy) for it to be held so. */
const CLEAR_COPIES = 2;
/** Two covs this near, and a small word's share of the quote (search() below), hold the quote alike: the words' order stands. */
const ALIGN_TIE = 0.02;

/** Align the typed words against the best texts holding most of them. @param {any} ctx */
export async function alignQuote(ctx) {
  const { p, keyword, units, typedTokens, heldWhole, fixedTo, STOP, nearOf, scoreMap, termMask, docLookup, rankedIds, pool, maskOwn, spent, pause } = ctx;
  const { alignOn, alignLexicon, index, storeNow, storeSpan, docFreq, wordingsOf, isStopTerm, TWIN_SEP } = ctx.eng;
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
  const AS = alignOn() && !p.phrase && !keyword && typedTokens.length >= ALIGN_MIN && !heldWhole.length ? storeNow() : null;
  if (AS) {
    const n = index().documentCount || 1;
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
      const f = docLookup[nid] || index().getStoredFields(nid);
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
    const cls = alignClasses(typedTokens, { stop: STOP, id: (t) => AS.ids.get(t), word: (x) => AS.words[x], lexicon: alignLexicon() });
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
          if (!docLookup[o]) docLookup[o] = { id: o, ...index().getStoredFields(o) };
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

  ctx.alignHeld = alignHeld;
  ctx.alignCovOf = alignCovOf;
  ctx.alignBar = alignBar;
  return null;
}
