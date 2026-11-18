/* search/stage-rank.js — the words' ranking, one stage at a time.
   rankWords takes the context the engine builds; here the context is built
   by hand, so each pass reads on its own: the KJV reading against the
   reader's own, the kind boost, the coverage, the phrase and the run held
   whole, the title, the synonym demotion, the pause. The real tokenize,
   numbers and ranking chains run; only the engine's verbs are fakes. */
import { describe, it, expect, vi } from 'vitest';
import { rankWords } from './stage-rank.js';
import {
  PHRASE_BOOST, ORIGINAL_BOOST, NEAR_PHRASE_MIN, TITLE_EXACT_BOOST,
  KIND_BOOST, coverageMultiplier,
} from './ranking.js';
import { kjvEncode } from './tokenize.js';

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her he she they their them we our ours you your yours it its '
  + 'i me my mine us said').split(' '));

const RUN = ['the', 'lord', 'is', 'my', 'shepherd'];
const WANTED = 'the lord is my shepherd';
const NO_OVERLAP = ['walks', 'far', 'away', 'today', 'now'];

/** Where a run of tokens sits in a text, or -1. */
function tokenRunAt(toks, run) {
  if (!run.length) return -1;
  for (let i = 0; i + run.length <= toks.length; i++) {
    let ok = true;
    for (let j = 0; j < run.length; j++) {
      if (toks[i + j] !== run[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}
function hasTokenRun(toks, run) { return tokenRunAt(toks, run) >= 0; }

/** Each wording of a text, the better standing (engine.js eachWording). */
function eachWording(toks, read) {
  if (toks.indexOf('|') < 0) return read(toks);
  let best = 0;
  let a = 0;
  for (let i = 0; i <= toks.length; i++) {
    if (i === toks.length || toks[i] === '|') {
      if (i > a) best = Math.max(best, read(toks.slice(a, i)));
      a = i + 1;
    }
  }
  return best;
}

function unitsFor(words) {
  return words.map((term, origin) => ({ term, literal: true, origin }));
}

/** @returns {any} */
function makeCtx(o = {}) {
  const docs = o.docs || {
    v1: { id: 'v1', kind: 'verse', title: '', text: 'The Lord is my shepherd' },
    l1: { id: 'l1', kind: 'letter', title: 'The Lord Is My Shepherd', text: '' },
  };
  const tokens = o.tokens || { v1: [...RUN], l1: [...NO_OVERLAP] };
  const holdersByRun = o.holdersByRun || null;
  const eng = {
    docTokens: (id) => tokens[id] || [],
    eachWording,
    excerptCover: o.excerptCover || (() => 0),
    hasTokenRun,
    namesAsVersePrints: o.namesAsVersePrints || ((t) => t),
    oneName: o.oneName || ((t) => t),
    restoredNameOf: o.restoredNameOf || ((t) => t),
    runHolders: (run) => (holdersByRun ? holdersByRun.get(run.join(' ')) || null : null),
    storyWindow: o.storyWindow || vi.fn(),
    titleToks: o.titleToks || ((d) => ({ all: kjvEncode(d.title || ''), own: null })),
    tokenRunAt,
    twinNow: o.twinNow || (() => false),
    NAME_FORMS: o.NAME_FORMS || {},
    TWIN_SEP: '|',
    PART_UNDER_RUN: 0.99,
    PHRASE_CANDIDATES: o.phraseCandidates ?? 500,
    RUN_LEAD_MIN: 3,
    RUN_MIN: 3,
    SMALL_RUN_MIN: 4,
  };
  return {
    units: o.units ?? unitsFor(RUN),
    scoreMap: o.scoreMap || { v1: 10, l1: 8 },
    termMask: o.termMask || { v1: 31, l1: 31 },
    kjvScore: o.kjvScore || {},
    kjvMask: o.kjvMask || {},
    literalHit: o.literalHit || { v1: true, l1: true },
    answersHits: o.answersHits || {},
    docLookup: docs,
    didExpand: o.didExpand ?? false,
    corrections: o.corrections || [],
    keyword: o.keyword ?? false,
    wanted: o.wanted ?? WANTED,
    p: o.p || {},
    D: { STOP_WORDS_TRIMMED: STOP },
    spent: o.spent || (() => false),
    pause: o.pause || (async () => null),
    eng,
  };
}

describe('rankWords', () => {
  it('pins the ranking constants', () => {
    expect(PHRASE_BOOST).toBe(6);
    expect(ORIGINAL_BOOST).toBe(2);
    expect(NEAR_PHRASE_MIN).toBe(0.5);
    expect(TITLE_EXACT_BOOST).toBe(3);
    expect(KIND_BOOST.verse).toBe(1.0);
    expect(KIND_BOOST['bible-study']).toBe(0.8);
    expect(coverageMultiplier(1)).toBe(1);
    expect(coverageMultiplier(2)).toBe(3);
    expect(coverageMultiplier(5)).toBe(9);
  });

  it('a verse read in its KJV wording stands on the KJV score', async () => {
    const docs = {
      v1: { id: 'v1', kind: 'verse', title: '' },
      v2: { id: 'v2', kind: 'verse', title: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { v1: [...RUN], v2: [...RUN] },
      scoreMap: { v1: 10, v2: 10 },
      termMask: { v1: 1, v2: 1 },
      kjvScore: { v1: 100, v2: 5 },
      kjvMask: { v1: 1, v2: 1 },
      wanted: 'shepherd',
      units: unitsFor(['shepherd']),
    });
    expect(await rankWords(ctx)).toBeNull();
    expect(ctx.scoreMap.v1).toBe(100);
    expect(ctx.scoreMap.v2).toBe(10);
    expect(ctx.readInKjv).toBe(1);
    expect(ctx.ownShare.v1).toBeCloseTo(0.1);
    expect(Object.keys(ctx.ownShare)).toEqual(['v1']);
    expect(ctx.maskOwn('v1')).toBe(1);
    expect(ctx.maskOwn('v2')).toBe(1);
  });

  it('a verse read better in its own wording keeps it', async () => {
    const docs = { v1: { id: 'v1', kind: 'verse', title: '' } };
    const ctx = makeCtx({
      docs,
      tokens: { v1: [...RUN] },
      scoreMap: { v1: 10 },
      termMask: { v1: 1 },
      kjvScore: { v1: 5 },
      kjvMask: { v1: 1 },
      wanted: 'shepherd',
      units: unitsFor(['shepherd']),
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.v1).toBe(10);
    expect(ctx.readInKjv).toBe(0);
    expect(Object.keys(ctx.ownShare)).toEqual([]);
  });

  it('a bible-study is kind-boosted once', async () => {
    const docs = {
      s1: { id: 's1', kind: 'bible-study', title: '' },
      v1: { id: 'v1', kind: 'verse', title: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { s1: [...NO_OVERLAP], v1: [...RUN] },
      scoreMap: { s1: 10, v1: 10 },
      termMask: { s1: 1, v1: 1 },
      literalHit: { s1: true, v1: true },
      wanted: 'shepherd',
      units: unitsFor(['shepherd']),
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.s1).toBe(8);
    expect(ctx.scoreMap.v1).toBe(10);
  });

  it('coverage multiplies by the distinct terms held', async () => {
    const docs = {
      v1: { id: 'v1', kind: 'verse', title: '' },
      v2: { id: 'v2', kind: 'verse', title: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { v1: [...NO_OVERLAP], v2: [...NO_OVERLAP] },
      scoreMap: { v1: 10, v2: 10 },
      termMask: { v1: 3, v2: 1 },
      literalHit: { v1: true, v2: true },
      wanted: 'lord shepherd',
      units: unitsFor(['lord', 'shepherd']),
      p: { phrase: 'lord shepherd' },
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.v1).toBe(60); // 10 x coverage 3 x original 2
    expect(ctx.scoreMap.v2).toBe(20); // 10 x coverage 1 x original 2
  });

  it('a keyword search short of every word opens the story window', async () => {
    const storyWindow = vi.fn();
    const ctx = makeCtx({ keyword: true, storyWindow, termMask: { v1: 7, l1: 7 } });
    await rankWords(ctx);
    expect(storyWindow).toHaveBeenCalledTimes(1);
    expect(storyWindow).toHaveBeenCalledWith(ctx.rankedIds, ctx.docLookup, ctx.termMask, 31, ctx.scoreMap);
  });

  it('no story window when the best text holds every word', async () => {
    const storyWindow = vi.fn();
    const ctx = makeCtx({ keyword: true, storyWindow });
    await rankWords(ctx);
    expect(storyWindow).not.toHaveBeenCalled();
  });

  it('a corrected word counts as the word it was corrected to', async () => {
    const ctx = makeCtx({
      wanted: 'the lord is my shephard',
      units: unitsFor(['the', 'lord', 'is', 'my', 'shephard']),
      corrections: [{ from: 'shephard', to: 'shepherd' }],
    });
    await rankWords(ctx);
    expect(ctx.typedTokens).toEqual(RUN);
    expect(ctx.fixedTo).toEqual({ shephard: 'shepherd' });
  });

  it('a number typed in words is also read as its digits', async () => {
    const docs = {
      w1: { id: 'w1', kind: 'letter', title: 'The 144000 Witnesses', text: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { w1: [...NO_OVERLAP, 'later'] },
      scoreMap: { w1: 10 },
      termMask: { w1: 63 },
      literalHit: { w1: true },
      wanted: 'the one hundred forty four thousand witnesses',
      units: unitsFor(['the', 'one', 'hundred', '44', 'thousand', 'witnesses']),
    });
    await rankWords(ctx);
    expect(ctx.typedTokens).toEqual(['the', 'one', 'hundred', '44', 'thousand', 'witnesses']);
    expect(ctx.typedNum).toEqual(['the', '144000', 'witnesses']);
    expect(ctx.titleScore(ctx.docLookup.w1)).toBe(TITLE_EXACT_BOOST);
    expect(ctx.scoreMap.w1).toBe(330); // 10 x coverage 11 x title 3
  });

  it('the exact run boosts a text, the original before a reprint', async () => {
    const ctx = makeCtx();
    await rankWords(ctx);
    expect(ctx.scoreMap.v1).toBe(1080); // 10 x coverage 9 x phrase 6 x original 2
    expect(ctx.runAt.v1).toBe(0);
    expect(ctx.nearOf.v1).toBe(1);
    expect(ctx.heldWhole).toEqual(['v1']);
    expect(ctx.run).toBe('');
  });

  it('an Answers topic holding the run gets the phrase boost, not the original', async () => {
    const docs = { a1: { id: 'a1', kind: 'answers', title: '', text: '' } };
    const ctx = makeCtx({
      docs,
      tokens: { a1: [...RUN] },
      scoreMap: { a1: 10 },
      termMask: { a1: 31 },
      literalHit: { a1: true },
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.a1).toBe(540); // 10 x coverage 9 x phrase 6
    expect(ctx.runAt.a1).toBe(0);
    expect(ctx.heldWhole).toEqual(['a1']);
  });

  it('a run one word off is graded, not boosted whole', async () => {
    const docs = { n1: { id: 'n1', kind: 'verse', title: '', text: '' } };
    const ctx = makeCtx({
      docs,
      tokens: { n1: ['the', 'lord', 'is', 'my', 'guide'] },
      scoreMap: { n1: 10 },
      termMask: { n1: 31 },
      literalHit: { n1: true },
    });
    await rankWords(ctx);
    const near = ctx.nearOf.n1;
    expect(near).toBeGreaterThanOrEqual(NEAR_PHRASE_MIN);
    expect(near).toBeLessThan(1);
    expect(ctx.scoreMap.n1).toBeCloseTo(90 * (1 + (PHRASE_BOOST - 1) * near * near) * (near >= 0.9 ? ORIGINAL_BOOST : 1));
    expect(ctx.runAt.n1).toBeUndefined();
    expect(ctx.heldWhole).toEqual([]);
  });

  it('a holder outside the candidates is boosted where it ranks', async () => {
    const docs = {
      v1: { id: 'v1', kind: 'verse', title: '', text: '' },
      v9: { id: 'v9', kind: 'verse', title: '', text: '' },
    };
    // the holders map is authoritative in the phrase pass: a holder missing from it
    // is graded by nearPhrase instead of boosted by its run, so v1 belongs here too.
    const holdersByRun = new Map([['the lord is my shepherd', new Map([['v1', 0], ['v9', 2]])]]);
    const ctx = makeCtx({
      docs,
      tokens: { v1: [...RUN], v9: ['walks', 'far', 'lord', 'is', 'my', 'shepherd'] },
      scoreMap: { v1: 10, v9: 10 },
      termMask: { v1: 31, v9: 7 },
      literalHit: { v1: true, v9: true },
      holdersByRun,
    });
    await rankWords(ctx);
    expect(ctx.runAt.v9).toBe(2);
    expect(ctx.scoreMap.v9).toBe(600); // 10 x coverage 5 x phrase 6 x original 2
    expect(ctx.heldWhole).toEqual(['v1', 'v9']);
  });

  it('a quote typed one word off is graded wherever it ranks', async () => {
    const docs = {
      v1: { id: 'v1', kind: 'verse', title: '', text: '' },
      v2: { id: 'v2', kind: 'verse', title: '', text: '' },
      o1: { id: 'o1', kind: 'verse', title: '', text: '' },
    };
    const holdersByRun = new Map([
      ['lord is my shepherd', new Map([['o1', 0]])],
    ]);
    const ctx = makeCtx({
      docs,
      tokens: {
        v1: [...RUN],
        v2: [...RUN],
        o1: ['lord', 'is', 'my', 'shepherd', 'walks'],
      },
      scoreMap: { v1: 30, v2: 20, o1: 10 },
      termMask: { v1: 31, v2: 31, o1: 31 },
      literalHit: { v1: true, v2: true, o1: true },
      holdersByRun,
      phraseCandidates: 2,
    });
    await rankWords(ctx);
    const near = ctx.nearOf.o1;
    expect(near).toBeGreaterThanOrEqual(NEAR_PHRASE_MIN);
    expect(ctx.scoreMap.o1).toBeCloseTo(90 * (1 + (PHRASE_BOOST - 1) * near * near) * (near >= 0.9 ? ORIGINAL_BOOST : 1));
    expect(ctx.runAt.o1).toBeUndefined();
  });

  it('one word that means anything among small ones marks its run', async () => {
    const ctx = makeCtx({
      tokens: { v1: ['and', 'it', 'was', 'so', 'truly'], l1: [...NO_OVERLAP] },
      scoreMap: { v1: 10, l1: 8 },
      termMask: { v1: 1, l1: 31 },
      wanted: 'and it was so',
      units: unitsFor(['and it was so']),
    });
    await rankWords(ctx);
    expect(ctx.run).toBe('and it was so');
    expect(ctx.runAt.v1).toBe(0);
    expect(ctx.scoreMap.v1).toBe(120); // 10 x phrase 6 x original 2
    expect(ctx.heldWhole).toEqual(['v1']);
  });

  it('a small run the holders know is boosted where it ranks', async () => {
    const docs = {
      v1: { id: 'v1', kind: 'verse', title: '', text: '' },
      v9: { id: 'v9', kind: 'verse', title: '', text: '' },
    };
    const holdersByRun = new Map([['and it was so', new Map([['v9', 3]])]]);
    const ctx = makeCtx({
      docs,
      tokens: { v1: [...RUN], v9: ['walks', 'far', 'away', 'and', 'it', 'was', 'so'] },
      scoreMap: { v1: 10, v9: 10 },
      termMask: { v1: 1, v9: 1 },
      literalHit: { v1: true, v9: true },
      wanted: 'and it was so',
      units: unitsFor(['and it was so']),
      holdersByRun,
    });
    await rankWords(ctx);
    expect(ctx.run).toBe('and it was so');
    expect(ctx.runAt.v9).toBe(3);
    expect(ctx.scoreMap.v9).toBe(120);
    expect(ctx.scoreMap.v1).toBe(10);
  });

  it('the run held whole leads when a text holding less leads it', async () => {
    const docs = {
      h: { id: 'h', kind: 'verse', title: '', text: '' },
      o: { id: 'o', kind: 'verse', title: '', text: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { h: [...RUN], o: [...NO_OVERLAP] },
      scoreMap: { h: 10, o: 2000 },
      termMask: { h: 31, o: 31 },
      literalHit: { h: true, o: true },
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.h).toBeCloseTo(18900); // 1080 x (18000 / 1080) x 1.05
    expect(ctx.scoreMap.o).toBe(18000);
  });

  it('the run held whole does not lead when it already does', async () => {
    const docs = {
      h: { id: 'h', kind: 'verse', title: '', text: '' },
      o: { id: 'o', kind: 'verse', title: '', text: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { h: [...RUN], o: [...NO_OVERLAP] },
      scoreMap: { h: 300, o: 2000 },
      termMask: { h: 31, o: 31 },
      literalHit: { h: true, o: true },
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.h).toBe(32400); // 300 x coverage 9 x phrase 6 x original 2, no lift
  });

  it('the run held whole does not lead for a corrected typo', async () => {
    const docs = {
      h: { id: 'h', kind: 'verse', title: '', text: '' },
      o: { id: 'o', kind: 'verse', title: '', text: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { h: [...RUN], o: [...NO_OVERLAP] },
      scoreMap: { h: 10, o: 2000 },
      termMask: { h: 31, o: 31 },
      literalHit: { h: true, o: true },
      wanted: 'the lord is my shephard',
      units: unitsFor(['the', 'lord', 'is', 'my', 'shephard']),
      corrections: [{ from: 'shephard', to: 'shepherd' }],
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.h).toBe(1080);
  });

  it('a study holding the run gives way to the verse', async () => {
    const docs = {
      h: { id: 'h', kind: 'bible-study', title: '', text: '' },
      o: { id: 'o', kind: 'verse', title: '', text: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { h: [...RUN], o: [...NO_OVERLAP] },
      scoreMap: { h: 10, o: 2000 },
      termMask: { h: 31, o: 31 },
      literalHit: { h: true, o: true },
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.h).toBe(432); // 10 x kind 0.8 x coverage 9 x phrase 6
  });

  it('the run shown first: a verse holding it in its KJV wording alone sits under one holding it as shown', async () => {
    const docs = {
      vOwn: { id: 'vOwn', kind: 'verse', title: '', text: '' },
      vKjv: { id: 'vKjv', kind: 'verse', title: '', text: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: {
        vOwn: [...RUN],
        vKjv: ['the', 'lord', 'is', '|', 'the', 'lord', 'is', 'my', 'shepherd'],
      },
      scoreMap: { vOwn: 10, vKjv: 10 },
      termMask: { vOwn: 31, vKjv: 31 },
      literalHit: { vOwn: true, vKjv: true },
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.vOwn).toBe(1080);
    expect(ctx.scoreMap.vKjv).toBeCloseTo(1080 * 0.99);
    expect(ctx.runAt.vKjv).toBe(4);
  });

  it('His name printed: the run in the KJV wording holds the typed run too', async () => {
    const docs = { v1: { id: 'v1', kind: 'verse', title: '', text: '' } };
    const ctx = makeCtx({
      docs,
      tokens: { v1: [...RUN] },
      scoreMap: { v1: 10 },
      termMask: { v1: 15 },
      literalHit: { v1: true },
      wanted: 'yahuwah is my shepherd',
      units: unitsFor(['yahuwah', 'is', 'my', 'shepherd']),
      namesAsVersePrints: (t) => (t === 'yahuwah' ? 'lord' : t),
    });
    await rankWords(ctx);
    expect(ctx.runAt.v1).toBe(1);
    expect(ctx.nearOf.v1).toBe(1);
    expect(ctx.scoreMap.v1).toBe(840); // 10 x coverage 7 x phrase 6 x original 2
  });

  it('a quoted phrase lifts the original first, and the run shown first among the best', async () => {
    const docs = {
      vOwn: { id: 'vOwn', kind: 'verse', title: '', text: '' },
      vKjv: { id: 'vKjv', kind: 'verse', title: '', text: '' },
      a1: { id: 'a1', kind: 'answers', title: '', text: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: {
        vOwn: ['and', 'it', 'was', 'so'],
        vKjv: ['and', 'it', '|', 'and', 'it', 'was', 'so'],
        a1: ['and', 'it', 'was', 'so'],
      },
      scoreMap: { vOwn: 10, vKjv: 10, a1: 10 },
      termMask: { vOwn: 15, vKjv: 15, a1: 15 },
      literalHit: { vOwn: true, vKjv: true, a1: true },
      wanted: 'and it was so',
      units: unitsFor(['and', 'it', 'was', 'so']),
      p: { phrase: 'and it was so' },
      twinNow: () => true,
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.vOwn).toBe(140); // 10 x coverage 7 x original 2
    expect(ctx.scoreMap.vKjv).toBeCloseTo(140 * 0.99);
    expect(ctx.scoreMap.a1).toBe(70); // 10 x coverage 7, no original boost
  });

  it('a title typed whole ranks its text up', async () => {
    const docs = { l1: { id: 'l1', kind: 'letter', title: 'The Lord Is My Shepherd', text: '' } };
    const ctx = makeCtx({
      docs,
      tokens: { l1: [...NO_OVERLAP] },
      scoreMap: { l1: 10 },
      termMask: { l1: 31 },
      literalHit: { l1: true },
    });
    await rankWords(ctx);
    expect(ctx.titleScore(ctx.docLookup.l1)).toBe(TITLE_EXACT_BOOST);
    expect(ctx.scoreMap.l1).toBe(270); // 10 x coverage 9 x title 3
  });

  it('a title typed in part is lifted no higher than just under the run', async () => {
    const docs = {
      h: { id: 'h', kind: 'verse', title: '', text: '' },
      l1: { id: 'l1', kind: 'letter', title: 'The Lord My Shepherd', text: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { h: [...RUN], l1: [...NO_OVERLAP] },
      scoreMap: { h: 10, l1: 100 },
      termMask: { h: 31, l1: 31 },
      literalHit: { h: true, l1: true },
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.h).toBe(1080);
    expect(ctx.titleScore(ctx.docLookup.l1)).toBeCloseTo(2.8);
    expect(ctx.scoreMap.l1).toBeCloseTo(1080 * 0.99);
  });

  it('synonym-only hits are demoted', async () => {
    const docs = {
      v1: { id: 'v1', kind: 'verse', title: '', text: '' },
      v2: { id: 'v2', kind: 'verse', title: '', text: '' },
    };
    const ctx = makeCtx({
      docs,
      tokens: { v1: [...RUN], v2: [...RUN] },
      scoreMap: { v1: 10, v2: 10 },
      termMask: { v1: 1, v2: 1 },
      literalHit: { v1: true, v2: false },
      wanted: 'shepherd',
      units: unitsFor(['shepherd']),
      didExpand: true,
    });
    await rankWords(ctx);
    expect(ctx.scoreMap.v1).toBe(10);
    expect(ctx.scoreMap.v2).toBe(5);
  });

  it('a page turn stops the ranking and returns what the search returns', async () => {
    const ctx = makeCtx({ spent: () => true, pause: async () => ({ stopped: 'page' }) });
    expect(await rankWords(ctx)).toEqual({ stopped: 'page' });
  });

  it('a pause that returns nothing lets the ranking go on', async () => {
    const ctx = makeCtx({ spent: () => true, pause: async () => null });
    expect(await rankWords(ctx)).toBeNull();
    expect(ctx.rankedIds).toEqual(['v1', 'l1']);
  });

  it('the rank writes its tables on the context', async () => {
    const ctx = makeCtx();
    await rankWords(ctx);
    expect(ctx.rankedIds).toEqual(['v1', 'l1']);
    expect(ctx.typedTokens).toEqual(RUN);
    expect(ctx.typedNum).toBeNull();
    expect(ctx.STOP).toBe(STOP);
    expect(ctx.fixedTo).toEqual({});
    expect(typeof ctx.pool).toBe('function');
    expect(typeof ctx.maskOwn).toBe('function');
    expect(typeof ctx.titleScore).toBe('function');
    expect(ctx.readInKjv).toBe(0);
    expect(Object.keys(ctx.ownShare)).toEqual([]);
    expect(ctx.pool(['v1', 'l1'], 1, () => true, () => true)).toEqual(['v1']);
  });
});
