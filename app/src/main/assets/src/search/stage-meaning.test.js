/* search/stage-meaning.js — the meaning: the on-device model's order fused with the words'.
   meaningFirst, bestPassageFirst and meaningFuse take the context the words left; here the
   context is built by hand over small fixture docs, so each gate reads on its own: the tie
   the original wins, the sure first, the rare word that makes it sure, the rare word that
   blocks it, the model's texts joining, the weight falling as the words hold more, the named
   title, the meaning's start, the best passage, the reprint yielding, the margin to overtake,
   the quote that stays, the model not ready, the index swapped mid-run, the rare mask, the
   quote typed nearly right, and the held texts re-sorted by rank. The model itself is a mock;
   the passage math (bestWindow, lemma) runs real. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { meaningFirst, bestPassageFirst, meaningFuse, MEANING_FILTERED } from './stage-meaning.js';
import { kjvEncode } from './tokenize.js';
import { lemma } from './passage.js';

const mockSemanticDocs = vi.hoisted(() => vi.fn());
const mockSemanticStatus = vi.hoisted(() => vi.fn());
vi.mock('./semantic.js', () => ({
  semanticDocs: mockSemanticDocs,
  semanticStatus: mockSemanticStatus,
}));

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her he she they their them we our ours you your yours it its '
  + 'i me my mine us said').split(' '));

/* Each typed word's document frequency, in a 100-text index. */
const DF = { god: 3, lives: 2, among: 4, israel: 2, flock: 2, disbanded: 2, blessed: 3, eyes: 2, see: 4 };
const ORIGINAL_TIER = { verse: 0, letter: 0, wtlb: 1, blessed: 1, 'holy-day': 2, 'bible-study': 3, answers: 4 };

const DOCS = {
  l1: { id: 'l1', kind: 'letter', title: 'Letter One', text: 'god lives among israel and his people will never be ashamed' },
  l2: { id: 'l2', kind: 'letter', title: 'Letter Two', text: 'the little flock gathers in quiet hope' },
  a1: { id: 'a1', kind: 'answers', title: 'Answers Topic', text: 'god lives among israel and his people will never be ashamed reprinted here' },
  v1: { id: 'v1', kind: 'verse', title: '', text: 'joel two twenty seven god is with you' },
  b1: { id: 'b1', kind: 'letter', title: 'Letter B', text: 'quiet hope in the morning' },
  c1: { id: 'c1', kind: 'letter', title: 'Letter C', text: 'morning light over the hills' },
  d1: { id: 'd1', kind: 'letter', title: 'Letter D', text: 'hills and valleys sing' },
  e1: { id: 'e1', kind: 'letter', title: 'E One', text: 'first words here' },
  e2: { id: 'e2', kind: 'letter', title: 'E Two', text: 'second words here' },
  e3: { id: 'e3', kind: 'letter', title: 'E Three', text: 'third words here' },
};

function unitsFor(words) {
  return words.map((term, origin) => ({ term, literal: true, origin }));
}

function entry(doc, score = 5) { return { score, doc, terms: [] }; }

function idOfFor(out) { return new Map(out.map((e) => [e, e.doc.id])); }

/** @param {Record<string, any>} [docs] */
function makeMeaningEng(docs = DOCS) {
  return {
    index: () => ({ getStoredFields: (id) => docs[id] || null }),
    reshapeDoc: (f) => ({ ...f }),
    ORIGINAL_TIER,
  };
}

function makePassageEng() {
  return {
    index: () => ({ documentCount: 100 }),
    docFreq: (w) => DF[w] ?? 3,
    docLemmas: (id, text) => kjvEncode(text || '').map(lemma),
    eachWording: (lem, fn) => fn(lem),
    REPRINT_COST: 0.05,
  };
}

/** @returns {any} */
function makeFuseCtx(o = {}) {
  const docs = o.docs ?? DOCS;
  const out = (o.out ?? [entry(docs.l1, 9)]).map((e) => ({ score: e.score, doc: e.doc, terms: e.terms ?? [] }));
  const idOf = idOfFor(out);
  const idx = { documentCount: 100, getStoredFields: (id) => docs[id] || null };
  const inUse = o.inUse ?? idx;
  const alignHeld = o.alignHeld ?? new Map();
  return {
    out, idOf,
    p: o.p ?? {},
    parsed: o.parsed ?? { kind: 'text' },
    keyword: o.keyword ?? false,
    frame: o.frame ?? null,
    wanted: o.wanted ?? 'god lives among israel',
    units: o.units ?? unitsFor(['god', 'lives', 'among', 'israel']),
    termMask: o.termMask ?? {},
    nearOf: o.nearOf ?? {},
    STOP,
    named: o.named ?? (() => false),
    keptDocs: o.keptDocs ?? new Set(),
    allowed: o.allowed ?? (() => true),
    fresh: o.fresh ?? (() => true),
    alignHeld,
    alignedSo: (e) => alignHeld.has(idOf.get(e)),
    admittedDocs: o.admittedDocs ?? new Set(),
    corpusFilter: o.corpusFilter ?? null,
    scopeBookId: o.scopeBookId ?? null,
    scopeVolumeId: o.scopeVolumeId ?? null,
    inUse,
    twinInUse: o.twinInUse ?? 'twin1',
    rerun: o.rerun ?? (() => 'rerun-value'),
    eng: {
      index: o.indexFn ?? (() => idx),
      twinRead: o.twinRead ?? (() => 'twin1'),
      isStopTerm: (t) => STOP.has(t),
      docFreq: (w) => DF[w] ?? 3,
      docTokens: (id, doc) => kjvEncode(doc.text || ''),
      docLemmas: (id, text) => kjvEncode(text || '').map(lemma),
      eachWording: (lem, fn) => fn(lem),
      reshapeDoc: (f) => ({ ...f }),
      ORIGINAL_TIER,
      REPRINT_COST: 0.05,
      unitId: 'kjv',
    },
  };
}

describe('meaningFirst', () => {
  it('texts the model cannot tell apart go original first', () => {
    const out = [entry(DOCS.a1, 9), entry(DOCS.l1, 5)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'a1', score: 0.9, start: 10 }, { id: 'l1', score: 0.895, start: 5 }], () => false, 0, () => true, () => 0);
    expect(out[0].doc.id).toBe('l1');
  });

  it('a clear first leads', () => {
    const out = [entry(DOCS.a1, 9), entry(DOCS.l1, 5)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'l1', score: 0.9, start: 5 }, { id: 'a1', score: 0.8, start: 10 }], () => false, 0.9, () => true, () => 0);
    expect(out[0].doc.id).toBe('l1');
  });

  it('a first holding a rare word leads on a smaller gap', () => {
    const out = [entry(DOCS.l1, 9), entry(DOCS.a1, 5)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'a1', score: 0.9, start: 10 }, { id: 'l1', score: 0.87, start: 5 }], () => false, 0.9, () => true, (id) => (id === 'a1' ? 1 : 0));
    expect(out[0].doc.id).toBe('a1');
  });

  it('the same gap without a rare word does not lead', () => {
    const out = [entry(DOCS.l1, 9), entry(DOCS.a1, 5)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'a1', score: 0.9, start: 10 }, { id: 'l1', score: 0.87, start: 5 }], () => false, 0.9, () => true, () => 0);
    expect(out[0].doc.id).toBe('l1');
  });

  it('a first lacking the rare word the words hold does not lead', () => {
    const out = [entry(DOCS.l1, 9), entry(DOCS.a1, 5)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'a1', score: 0.9, start: 10 }, { id: 'l1', score: 0.87, start: 5 }], () => false, 0.9, () => true,
      (id) => (id === 'a1' ? 1 : id === 'l1' ? 2 : 0));
    expect(out[0].doc.id).toBe('l1');
  });

  it('the model’s best texts join even when no typed word reaches them', () => {
    const out = [entry(DOCS.l1, 9)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'l2', score: 0.9, start: 7 }, { id: 'l1', score: 0.8, start: 3 }], () => false, 0, () => true, () => 0);
    const joined = out.find((e) => e.doc.id === 'l2');
    expect(joined).toBeDefined();
    expect(joined.byMeaning).toBe(true);
    expect(joined.placeStart).toBe(7);
    expect(joined.meaningStart).toBe(7);
  });

  it('a text the search may not show is not added', () => {
    const out = [entry(DOCS.l1, 9)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'l2', score: 0.9, start: 7 }, { id: 'l1', score: 0.8, start: 3 }], () => false, 0, () => false, () => 0);
    expect(out).toHaveLength(1);
  });

  it('a model text already past the top is pulled in', () => {
    /** @type {Record<string, any>} */
    const filler = {};
    for (let i = 0; i <= 30; i++) filler['f' + i] = { id: 'f' + i, kind: 'letter', title: '', text: '' };
    const out = Object.values(filler).map((d, i) => entry(d, 100 - i));
    meaningFirst(makeMeaningEng(filler), out, idOfFor(out),
      [{ id: 'f30', score: 0.9, start: 3 }], () => false, 0, () => true, () => 0);
    expect(out[0].doc.id).toBe('f30');
    expect(out[0].byMeaning).toBe(true);
    expect(out[0].placeStart).toBe(3);
  });

  it('when the words hold everything the meaning adds nothing', () => {
    const out = [entry(DOCS.l1, 9), entry(DOCS.a1, 5)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'a1', score: 0.9, start: 10 }, { id: 'l1', score: 0.8, start: 5 }], () => false, 1, () => true, () => 0);
    expect(out.map((e) => e.doc.id)).toEqual(['l1', 'a1']);
  });

  it('a title the query names keeps the lead over the meaning', () => {
    const out = [entry(DOCS.a1, 9), entry(DOCS.l1, 5)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'a1', score: 0.9, start: 10 }, { id: 'l1', score: 0.8, start: 5 }], (d) => d.id === 'l1', 0, () => true, () => 0);
    expect(out[0].doc.id).toBe('l1');
  });

  it('the meaning’s start is written, except on verses', () => {
    const out = [entry(DOCS.v1, 9), entry(DOCS.l1, 5)];
    meaningFirst(makeMeaningEng(), out, idOfFor(out),
      [{ id: 'v1', score: 0.9, start: 4 }, { id: 'l1', score: 0.8, start: 6 }], () => false, 0, () => true, () => 0);
    expect(out.find((e) => e.doc.id === 'v1').meaningStart).toBeUndefined();
    expect(out.find((e) => e.doc.id === 'l1').meaningStart).toBe(6);
  });

  it('the rest of the words’ order follows the top', () => {
    /** @type {Record<string, any>} */
    const filler = {};
    for (let i = 0; i <= 30; i++) filler['f' + i] = { id: 'f' + i, kind: 'letter', title: '', text: '' };
    const out = Object.values(filler).map((d, i) => entry(d, 100 - i));
    meaningFirst(makeMeaningEng(filler), out, idOfFor(out), [], () => false, 0, () => true, () => 0);
    expect(out.map((e) => e.doc.id)).toEqual(Object.keys(filler));
  });
});

describe('bestPassageFirst', () => {
  const stop = (t) => STOP.has(t);
  const words4 = ['god', 'lives', 'among', 'israel'];

  it('fewer than three query words reorders nothing', () => {
    const out = [entry(DOCS.a1, 9), entry(DOCS.l1, 5)];
    expect(bestPassageFirst(makePassageEng(), out, idOfFor(out), unitsFor(['god', 'lives']), stop, () => false)).toBe(0);
    expect(out.map((e) => e.doc.id)).toEqual(['a1', 'l1']);
  });

  it('a first holding nine tenths keeps its place', () => {
    const out = [entry(DOCS.l1, 9), entry(DOCS.a1, 5)];
    expect(bestPassageFirst(makePassageEng(), out, idOfFor(out), unitsFor(words4), stop, () => false)).toBe(1);
    expect(out[0].doc.id).toBe('l1');
  });

  it('a reprint holding as much yields to its original', () => {
    const out = [entry(DOCS.a1, 9), entry(DOCS.l1, 5)];
    expect(bestPassageFirst(makePassageEng(), out, idOfFor(out), unitsFor(words4), stop, () => false)).toBe(1);
    expect(out[0].doc.id).toBe('l1');
  });

  it('overtaking needs a clear margin', () => {
    const da = { id: 'da', kind: 'letter', title: '', text: 'god lives and walks' };
    const db = { id: 'db', kind: 'letter', title: '', text: 'lives israel and walks' };
    const out = [entry(da, 9), entry(db, 5)];
    bestPassageFirst(makePassageEng(), out, idOfFor(out), unitsFor(words4), stop, () => false);
    expect(out[0].doc.id).toBe('da');
  });

  it('a passage holding clearly more takes the first place', () => {
    const da = { id: 'da', kind: 'letter', title: '', text: 'god lives and walks' };
    const dc = { id: 'dc', kind: 'letter', title: '', text: 'god lives among the hills' };
    const out = [entry(da, 9), entry(dc, 5)];
    bestPassageFirst(makePassageEng(), out, idOfFor(out), unitsFor(words4), stop, () => false);
    expect(out[0].doc.id).toBe('dc');
  });

  it('a named document is never overtaken and does not count as held', () => {
    const out = [entry(DOCS.l1, 9), entry(DOCS.a1, 5)];
    const held = bestPassageFirst(makePassageEng(), out, idOfFor(out), unitsFor(words4), stop, (d) => d.id === 'l1');
    expect(held).toBe(1);
    expect(out[0].doc.id).toBe('l1');
  });

  it('equal passages keep the engine’s order', () => {
    const da = { id: 'da', kind: 'letter', title: '', text: 'god lives and walks' };
    const da2 = { id: 'da2', kind: 'letter', title: '', text: 'god lives and walks' };
    const out = [entry(da, 9), entry(da2, 5)];
    bestPassageFirst(makePassageEng(), out, idOfFor(out), unitsFor(words4), stop, () => false);
    expect(out.map((e) => e.doc.id)).toEqual(['da', 'da2']);
  });
});

describe('meaningFuse', () => {
  beforeEach(() => {
    mockSemanticDocs.mockReset();
    mockSemanticStatus.mockReset();
    mockSemanticStatus.mockReturnValue({ status: 'ready' });
  });

  it('a quote found first is not re-ordered and the model never runs', async () => {
    mockSemanticDocs.mockResolvedValue([{ id: 'a1', score: 0.9, start: 2 }]);
    const ctx = makeFuseCtx({ nearOf: { l1: 0.8 }, out: [entry(DOCS.l1, 9), entry(DOCS.a1, 5)] });
    expect(await meaningFuse(ctx)).toBeNull();
    expect(mockSemanticDocs).not.toHaveBeenCalled();
    expect(ctx.sem).toBeNull();
    expect(ctx.meaningLater).toBe(false);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['l1', 'a1']);
  });

  it('a keyword search without a frame reads no meaning', async () => {
    mockSemanticDocs.mockResolvedValue([{ id: 'a1', score: 0.9, start: 2 }]);
    const ctx = makeFuseCtx({ keyword: true, out: [entry(DOCS.l1, 9), entry(DOCS.a1, 5)] });
    expect(await meaningFuse(ctx)).toBeNull();
    expect(mockSemanticDocs).not.toHaveBeenCalled();
    expect(ctx.sem).toBeNull();
    expect(ctx.meaningLater).toBe(false);
  });

  it('a model not ready yet leaves the words’ order and says the meaning comes later', async () => {
    mockSemanticDocs.mockResolvedValue(null);
    mockSemanticStatus.mockReturnValue({ status: 'loading' });
    const ctx = makeFuseCtx({ out: [entry(DOCS.l1, 9), entry(DOCS.a1, 5)] });
    expect(await meaningFuse(ctx)).toBeNull();
    expect(ctx.sem).toBeNull();
    expect(ctx.meaningLater).toBe(true);
    expect(mockSemanticDocs).toHaveBeenCalledWith('god lives among israel', 'kjv', undefined);
  });

  it('a swapped index mid-run starts the search over', async () => {
    mockSemanticDocs.mockResolvedValue([{ id: 'a1', score: 0.9, start: 2 }]);
    const ctx = makeFuseCtx({ twinRead: () => 'twin2', out: [entry(DOCS.l1, 9), entry(DOCS.a1, 5)] });
    expect(await meaningFuse(ctx)).toBe('rerun-value');
  });

  it('an index replaced mid-run drops the model’s order', async () => {
    mockSemanticDocs.mockResolvedValue([{ id: 'a1', score: 0.9, start: 2 }]);
    const otherIdx = { documentCount: 50, getStoredFields: (id) => DOCS[id] || null };
    const ctx = makeFuseCtx({ indexFn: () => otherIdx, out: [entry(DOCS.l1, 9), entry(DOCS.a1, 5)] });
    expect(await meaningFuse(ctx)).toBeNull();
    expect(ctx.sem).toBeNull();
  });

  it('the model’s texts are kept to what the search may show', async () => {
    mockSemanticDocs.mockResolvedValue([{ id: 'l1', score: 0.9, start: 3 }, { id: 'a1', score: 0.85, start: 10 }]);
    const ctx = makeFuseCtx({ allowed: (f) => f.id !== 'a1', out: [entry(DOCS.l1, 9), entry(DOCS.a1, 5)] });
    await meaningFuse(ctx);
    expect(ctx.sem.map((s) => s.id)).toEqual(['l1']);
  });

  it('a rare word makes a small lead sure', async () => {
    mockSemanticDocs.mockResolvedValue([{ id: 'a1', score: 0.9, start: 10 }, { id: 'l1', score: 0.87, start: 5 }]);
    const ctx = makeFuseCtx({ wanted: 'disbanded god lives among', units: unitsFor(['disbanded', 'god', 'lives', 'among']),
      termMask: { a1: 1 }, out: [entry(DOCS.l1, 9), entry(DOCS.a1, 5)] });
    await meaningFuse(ctx);
    expect(ctx.out[0].doc.id).toBe('a1');
  });

  it('the same small lead without the rare word does not lead', async () => {
    mockSemanticDocs.mockResolvedValue([{ id: 'a1', score: 0.9, start: 10 }, { id: 'l1', score: 0.87, start: 5 }]);
    const ctx = makeFuseCtx({ wanted: 'disbanded god lives among', units: unitsFor(['disbanded', 'god', 'lives', 'among']),
      termMask: {}, out: [entry(DOCS.l1, 9), entry(DOCS.a1, 5)] });
    await meaningFuse(ctx);
    expect(ctx.out[0].doc.id).toBe('l1');
  });

  it('a quote typed nearly right keeps its place over an unsure meaning', async () => {
    mockSemanticDocs.mockResolvedValue([
      { id: 'a1', score: 0.9, start: 10 }, { id: 'b1', score: 0.89, start: 4 },
      { id: 'c1', score: 0.88, start: 6 }, { id: 'd1', score: 0.87, start: 8 },
      { id: 'l1', score: 0.86, start: 3 },
    ]);
    const ctx = makeFuseCtx({ wanted: 'god lives among israel flock', units: unitsFor(['god', 'lives', 'among', 'israel', 'flock']),
      termMask: { l1: 31, a1: 7 }, out: [entry(DOCS.l1, 9), entry(DOCS.a1, 5)] });
    await meaningFuse(ctx);
    expect(ctx.out[0].doc.id).toBe('l1');
  });

  it('texts holding the quote are re-sorted by rank, the admitted ones keeping their place', async () => {
    mockSemanticDocs.mockResolvedValue([{ id: 'e1', score: 0.9, start: 1 }]);
    const alignHeld = new Map([['e1', { rank: 2 }], ['e2', { rank: 1 }], ['e3', { rank: 0 }]]);
    const ctx = makeFuseCtx({ units: unitsFor(['god', 'lives']), termMask: {},
      alignHeld, admittedDocs: new Set([DOCS.e2]),
      out: [entry(DOCS.e1, 9), entry(DOCS.e2, 5), entry(DOCS.e3, 4)] });
    await meaningFuse(ctx);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['e3', 'e2', 'e1']);
  });

  it('a scoped search reads further into the model’s list', async () => {
    mockSemanticDocs.mockResolvedValue([]);
    const ctx = makeFuseCtx({ corpusFilter: 'v1', out: [entry(DOCS.l1, 9)] });
    await meaningFuse(ctx);
    expect(MEANING_FILTERED).toBe(300);
    expect(mockSemanticDocs).toHaveBeenCalledWith('god lives among israel', 'kjv', MEANING_FILTERED);
  });
});
