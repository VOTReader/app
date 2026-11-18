/* search/stage-align.js — a quote remembered with its slips.
   alignQuote takes the context the ranking left; here the context is built
   by hand, over a small token store, so each gate reads on its own: the
   gate shut, the mass, the lost word, the near phrase added, the tier B
   hold, the clear best, the tie, the verse pair, the pause. The real
   align.js runs; only the engine's store verbs are fakes. */
import { describe, it, expect } from 'vitest';
import { alignQuote, ALIGN_HELD } from './stage-align.js';

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her he she they their them we our ours you your yours it its '
  + 'i me my mine us said').split(' '));

const QUERY = ['blessed', 'are', 'the', 'eyes', 'that', 'see'];
/* Each typed word's document frequency, in a 100-text index: the rare
   words weigh the most, the small words the least. */
const DF = {
  blessed: 3, are: 60, the: 80, eyes: 2, that: 55, see: 4,
  hands: 5, work: 6, quietly: 1, be: 70, name: 4, of: 75, our: 2, lord: 3, chosen: 50, house: 50, king: 50,
};

function unitsFor(words) {
  return words.map((term, origin) => ({ term, literal: true, origin }));
}

/** A store span's wordings: the runs between the twin separator. */
function wordingsOf(t, sep) {
  if (sep === undefined || t.indexOf(sep) < 0) return [t];
  const out = [];
  let a = 0;
  for (let i = 0; i <= t.length; i++) {
    if (i === t.length || t[i] === sep) {
      if (i > a) out.push(t.subarray(a, i));
      a = i + 1;
    }
  }
  return out.length ? out : [t];
}

/** A token store over the fixture docs: words to ids, spans per doc. */
function makeStore(docWords) {
  const vocab = new Map();
  const words = [undefined];
  const idOf = (w) => {
    if (!vocab.has(w)) { vocab.set(w, words.length); words.push(w); }
    return vocab.get(w);
  };
  idOf('|'); // the twin separator's id, so the store can split wordings
  const toks = [];
  const from = [];
  const to = [];
  const spans = new Map();
  for (const [docId, ws] of Object.entries(docWords)) {
    spans.set(docId, from.length);
    from.push(toks.length);
    for (const w of ws) toks.push(idOf(w));
    to.push(toks.length);
  }
  return { AS: { ids: vocab, words, toks: new Uint32Array(toks), from, to }, spans };
}

/** The typed words spread over twice their length, filler between them. */
function spread(words, gaps) {
  const filler = ['walks', 'far', 'away', 'today', 'now', 'then', 'here', 'there'];
  const out = [];
  let f = 0;
  words.forEach((w, i) => {
    out.push(w);
    for (let k = 0; k < (gaps[i] || 0); k++) out.push(filler[(f++) % filler.length]);
  });
  return out;
}

/** @returns {any} */
function makeAlignCtx(o = {}) {
  const docWords = o.docWords || { s1: [...QUERY] };
  const { AS, spans } = makeStore(docWords);
  const docs = o.docs || { s1: { id: 's1', kind: 'letter', title: '', text: '' } };
  const scoreMap = o.scoreMap || { s1: 10 };
  const termMask = o.termMask || { s1: 63 };
  return {
    p: o.p || {},
    keyword: o.keyword ?? false,
    units: o.units ?? unitsFor(QUERY),
    typedTokens: o.typedTokens ?? [...QUERY],
    heldWhole: o.heldWhole || [],
    fixedTo: o.fixedTo || {},
    STOP,
    nearOf: o.nearOf || {},
    scoreMap,
    termMask,
    docLookup: docs,
    rankedIds: o.rankedIds || Object.keys(docs),
    pool: o.pool || ((ids, cap, fits) => ids.filter(fits).sort((a, b) => scoreMap[b] - scoreMap[a]).slice(0, cap)),
    maskOwn: o.maskOwn || ((id) => termMask[id] || 0),
    spent: o.spent || (() => false),
    pause: o.pause || (async () => null),
    eng: {
      alignOn: o.alignOn || (() => true),
      alignLexicon: o.alignLexicon || (() => null),
      index: () => ({ documentCount: 100, getStoredFields: (id) => docs[id] || null }),
      storeNow: () => AS,
      storeSpan: (as, id) => (spans.has(id) ? spans.get(id) : null),
      docFreq: (t) => DF[t] ?? 3,
      wordingsOf,
      isStopTerm: (t) => STOP.has(t),
      TWIN_SEP: '|',
    },
  };
}

describe('alignQuote', () => {
  it('the gate stays shut when alignment is off', async () => {
    const ctx = makeAlignCtx({ alignOn: () => false });
    expect(await alignQuote(ctx)).toBeNull();
    expect(ctx.alignHeld.size).toBe(0);
    expect(ctx.alignBar).toBe(ALIGN_HELD);
    expect(ctx.alignCovOf).toBeNull();
  });

  it('a quoted phrase is not aligned', async () => {
    const ctx = makeAlignCtx({ p: { phrase: 'blessed are the eyes that see' } });
    await alignQuote(ctx);
    expect(ctx.alignHeld.size).toBe(0);
    expect(ctx.alignBar).toBe(ALIGN_HELD);
    expect(ctx.alignCovOf).toBeNull();
  });

  it('a keyword search is not aligned', async () => {
    const ctx = makeAlignCtx({ keyword: true });
    await alignQuote(ctx);
    expect(ctx.alignHeld.size).toBe(0);
    expect(ctx.alignBar).toBe(ALIGN_HELD);
    expect(ctx.alignCovOf).toBeNull();
  });

  it('fewer than five typed tokens are not aligned', async () => {
    const typedTokens = ['blessed', 'are', 'the', 'eyes'];
    const ctx = makeAlignCtx({ typedTokens, units: unitsFor(typedTokens) });
    await alignQuote(ctx);
    expect(ctx.alignHeld.size).toBe(0);
    expect(ctx.alignBar).toBe(ALIGN_HELD);
    expect(ctx.alignCovOf).toBeNull();
  });

  it('a run held whole is not aligned', async () => {
    const ctx = makeAlignCtx({ heldWhole: ['s1'] });
    await alignQuote(ctx);
    expect(ctx.alignHeld.size).toBe(0);
    expect(ctx.alignBar).toBe(ALIGN_HELD);
    expect(ctx.alignCovOf).toBeNull();
  });

  it('a text holding the quote leads every text holding less', async () => {
    const docs = {
      s1: { id: 's1', kind: 'letter', title: '', text: '' },
      d1: { id: 'd1', kind: 'letter', title: '', text: '' },
    };
    const ctx = makeAlignCtx({
      docs,
      docWords: {
        s1: [...QUERY],
        d1: ['blessed', 'are', 'the', 'hands', 'that', 'work'],
      },
      scoreMap: { s1: 10, d1: 50 },
      termMask: { s1: 63, d1: 63 },
    });
    expect(await alignQuote(ctx)).toBeNull();
    expect(ctx.alignHeld.get('s1').cov).toBeCloseTo(1);
    expect(ctx.alignHeld.get('s1').rank).toBe(0);
    expect(ctx.alignHeld.has('d1')).toBe(false);
    expect(ctx.scoreMap.s1).toBeCloseTo(50 * 1.05 * 1.001);
    expect(ctx.scoreMap.d1).toBe(50);
    expect(ctx.alignBar).toBe(ALIGN_HELD);
    expect(ctx.alignCovOf('s1')).toBeCloseTo(1);
  });

  it('a clear best under the bar is held at its own cov', async () => {
    const docs = {
      s1: { id: 's1', kind: 'letter', title: '', text: '' },
      d1: { id: 'd1', kind: 'letter', title: '', text: '' },
    };
    const ctx = makeAlignCtx({
      docs,
      docWords: {
        s1: ['blessed', 'are', 'the', 'eyes', 'that'],
        d1: ['blessed', 'are', 'the', 'hands', 'that', 'work'],
      },
      scoreMap: { s1: 10, d1: 50 },
      termMask: { s1: 63, d1: 63 },
    });
    await alignQuote(ctx);
    const held = ctx.alignHeld.get('s1');
    expect(held).toBeDefined();
    expect(held.cov).toBeGreaterThanOrEqual(0.6);
    expect(held.cov).toBeLessThan(ALIGN_HELD);
    // the other text holds it alike (its words slot for the traded two), so
    // it is held too, and the bar is its cov, the lowest of the texts held
    expect(ctx.alignHeld.has('d1')).toBe(true);
    expect(ctx.alignBar).toBeCloseTo(ctx.alignCovOf('d1'));
    // no text is left unheld, so the lift tops from 1, not from d1's 50
    expect(ctx.scoreMap.s1).toBeCloseTo(1.05 * 1.002);
  });

  it('a held text within a small word of one just under the bar holds it no better', async () => {
    // 'our' weighs most of the quote, so the tie is wide; the common words
    // weigh little, so filler between them costs the spread text its hold
    const query = ['chosen', 'be', 'the', 'house', 'of', 'our', 'king'];
    const docs = {
      s1: { id: 's1', kind: 'letter', title: '', text: '' },
      s2: { id: 's2', kind: 'letter', title: '', text: '' },
      d1: { id: 'd1', kind: 'letter', title: '', text: '' },
    };
    const ctx = makeAlignCtx({
      docs,
      docWords: {
        // 'walks' for 'the': the quote in a row, one small word traded
        s1: ['chosen', 'be', 'walks', 'house', 'of', 'our', 'king'],
        s2: ['chosen', 'be', 'walks', 'house', 'of', 'our', 'king'],
        // the quote spread wide, holding 'the' too
        d1: spread(query, [4, 4, 3, 3, 3, 3, 0]),
      },
      scoreMap: { s1: 10, s2: 10, d1: 50 },
      termMask: { s1: 0b1111011, s2: 0b1111011, d1: 0b1111111 },
      typedTokens: query,
      units: unitsFor(query),
    });
    await alignQuote(ctx);
    expect(ctx.alignCovOf('s1')).toBeGreaterThanOrEqual(ALIGN_HELD);
    expect(ctx.alignCovOf('d1')).toBeLessThan(ALIGN_HELD);
    expect(ctx.alignHeld.size).toBe(0);
  });

  it('two verses run together are both shown, the neighbour right after', async () => {
    const docs = {
      d4: { id: 'd4', kind: 'verse', title: '', text: '', bookId: 'psalms', chapterNum: 23, verseNum: 4 },
      d5: { id: 'd5', kind: 'verse', title: '', text: '', bookId: 'psalms', chapterNum: 23, verseNum: 5 },
      d9: { id: 'd9', kind: 'letter', title: '', text: '' },
    };
    const ctx = makeAlignCtx({
      docs,
      docWords: {
        d4: ['blessed', 'are', 'the'],
        d5: ['eyes', 'that', 'see'],
        d9: ['blessed', 'are', 'the', 'hands', 'that', 'work'],
      },
      scoreMap: { d4: 10, d9: 50 },
      termMask: { d4: 15, d9: 63 },
      rankedIds: ['d4', 'd9'],
    });
    await alignQuote(ctx);
    expect(ctx.alignHeld.get('d4').cov).toBeCloseTo(1);
    expect(ctx.alignHeld.get('d4').rank).toBe(0);
    expect(ctx.alignHeld.get('d5').rank).toBe(1);
    expect(ctx.alignHeld.get('d5').cov).toBeCloseTo(1);
    expect(ctx.scoreMap.d4).toBeCloseTo(50 * 1.05 * 1.002);
    expect(ctx.scoreMap.d5).toBeCloseTo(50 * 1.05 * 1.001);
    expect(ctx.rankedIds).toContain('d5');
    expect(ctx.docLookup.d5).toBeDefined();
  });

  it('a text graded near the phrase is aligned past the gate', async () => {
    const docs = { n1: { id: 'n1', kind: 'letter', title: '', text: '' } };
    const ctx = makeAlignCtx({
      docs,
      docWords: { n1: [...QUERY] },
      scoreMap: { n1: 10 },
      termMask: { n1: 3 },
      nearOf: { n1: 0.8 },
    });
    await alignQuote(ctx);
    expect(ctx.alignHeld.get('n1').cov).toBeCloseTo(1);
    expect(ctx.scoreMap.n1).toBeCloseTo(1 * 1.05 * 1.001);
  });

  it('a word no text holding the quote holds leaves the weight', async () => {
    const query = [...QUERY, 'quietly'];
    const docs = { s1: { id: 's1', kind: 'letter', title: '', text: '' } };
    const ctx = makeAlignCtx({
      docs,
      docWords: { s1: [...QUERY] },
      scoreMap: { s1: 10 },
      termMask: { s1: 63 },
      typedTokens: query,
      units: unitsFor(query),
    });
    await alignQuote(ctx);
    expect(ctx.alignHeld.get('s1').cov).toBeGreaterThanOrEqual(0.99);
    expect(ctx.alignCovOf('s1')).toBeGreaterThanOrEqual(0.99);
  });

  it('a text under the mass is not aligned, however well it holds the quote', async () => {
    const docs = { g1: { id: 'g1', kind: 'letter', title: '', text: '' } };
    const ctx = makeAlignCtx({
      docs,
      docWords: { g1: [...QUERY] },
      scoreMap: { g1: 10 },
      termMask: { g1: 3 },
    });
    await alignQuote(ctx);
    expect(ctx.alignHeld.size).toBe(0);
    expect(ctx.alignCovOf('g1')).toBeCloseTo(1);
  });

  it('a page turn stops the alignment and returns what the search returns', async () => {
    const ctx = makeAlignCtx({ spent: () => true, pause: async () => ({ stopped: 'page' }) });
    expect(await alignQuote(ctx)).toEqual({ stopped: 'page' });
  });

  it('a pause that returns nothing lets the alignment go on', async () => {
    const ctx = makeAlignCtx({ spent: () => true, pause: async () => null });
    expect(await alignQuote(ctx)).toBeNull();
    expect(ctx.alignHeld.has('s1')).toBe(true);
  });

  it('the alignment writes its tables on the context', async () => {
    const ctx = makeAlignCtx();
    await alignQuote(ctx);
    expect(ctx.alignHeld.get('s1').cov).toBeCloseTo(1);
    expect(ctx.alignBar).toBe(ALIGN_HELD);
    expect(typeof ctx.alignCovOf).toBe('function');
    expect(ctx.alignCovOf('s1')).toBeCloseTo(1);
  });
});
