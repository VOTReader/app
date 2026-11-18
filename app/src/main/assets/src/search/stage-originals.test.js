/* search/stage-originals.js — the original before its reprint, each collection's cap, and Matthew once.
   originalsStage takes the context the stages left; here the context is built by hand, so each gate
   reads on its own: the originals pass (and when the index moved on, skipped), what keeps a named
   title's place and what gives way, what keeps an admitted title's place, the terms and the
   aligned entries the pass is given, each collection's cap, and Matthew shown once — as the
   Scripture's when both readings were found, as the study's when only its text holds the words,
   and untouched when the search keeps to one collection. Only the engine's index verbs are fakes;
   the title words, the phrase nearness and the held-words count are real. */
import { describe, it, expect, vi } from 'vitest';
import { originalsStage } from './stage-originals.js';
import { kjvEncode } from './tokenize.js';
import { joinApostropheS, nearPhrase, NEAR_PHRASE_MIN, TITLE_EXACT_BOOST } from './ranking.js';

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her he she they their them we our ours you your yours it its '
  + 'i me my mine us said').split(' '));

const isStopTerm = (t) => STOP.has(t);

/** The most of the typed words any stretch of `width` tokens holds, as engine.js reads it. */
function typedHeld(toks, typed, width) {
  const want = new Map();
  for (const t of typed) want.set(t, (want.get(t) || 0) + 1);
  const have = new Map();
  let n = 0;
  let best = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const w = want.get(t) || 0;
    if (w) { const h = have.get(t) || 0; if (h < w) n++; have.set(t, h + 1); }
    if (i >= width) {
      const o = toks[i - width];
      const wo = want.get(o) || 0;
      if (wo) { const h = have.get(o) - 1; have.set(o, h); if (h < wo) n--; }
    }
    if (n > best) best = n;
  }
  return best;
}

const doc = (o = {}) => ({ kind: 'letter', title: '', text: '', volumeId: 'v1', ...o });
const entry = (d, score = 5, terms = []) => ({ score, doc: d, terms });

/** @returns {any} */
function makeCtx(o = {}) {
  const out = (o.out ?? []).map((e) => ({ score: e.score, doc: e.doc, terms: e.terms ?? [] }));
  const idOf = new Map(out.map((e) => [e, e.doc.id]));
  const inUse = o.inUse ?? { getStoredFields: (id) => (o.stored ?? {})[id] ?? null };
  return {
    out, idOf,
    p: o.p ?? {},
    filtered: o.filtered ?? ['history', 'has', 'an', 'end'],
    units: o.units ?? [],
    typedQ: o.typedQ ?? 'history has an end',
    typedTokens: o.typedTokens ?? ['history', 'has', 'an', 'end'],
    typedContent: o.typedContent ?? ['history', 'has', 'an', 'end'],
    STOP,
    nearOf: o.nearOf ?? {},
    named: o.named ?? (() => false),
    titleScore: o.titleScore ?? (() => 1),
    admittedDocs: o.admittedDocs ?? new Set(),
    admittedWhole: o.admittedWhole ?? false,
    byOwnTitle: o.byOwnTitle ?? new Set(),
    allowed: o.allowed ?? (() => true),
    fresh: o.fresh ?? (() => true),
    inScope: o.inScope ?? (() => true),
    alignHeld: o.alignHeld ?? new Map(),
    alignCovOf: o.alignCovOf ?? null,
    alignBar: o.alignBar ?? 0,
    perVolume: o.perVolume ?? null,
    capped: o.capped ?? {},
    corpusFilter: o.corpusFilter ?? null,
    scoreMap: o.scoreMap ?? {},
    docLookup: o.docLookup ?? {},
    inUse,
    eng: {
      index: o.index ?? (() => inUse),
      isStopTerm,
      eachWording: (toks, fn) => fn(toks),
      docTokens: (id, d) => joinApostropheS(kjvEncode((d.text || '') + ' ' + (d.title || ''))),
      titleToks: (d) => ({ all: kjvEncode(d.title || ''), own: null }),
      typedHeld,
      originalsFirst: o.originalsFirst ?? vi.fn(),
      typedAlts: o.typedAlts ?? vi.fn(() => []),
      askedNotQuoted: o.askedNotQuoted ?? vi.fn(() => false),
      verseIds: o.verseIds ?? (() => new Map()),
      reshapeDoc: (f) => ({ kind: f.kind, bookId: f.bookId, chapterNum: f.chapterNum, verseNum: f.verseNum, text: f.text, volumeId: f.volumeId, title: f.title || '' }),
      RUN_MIN: 3,
    },
  };
}

describe('originalsFirst pass', () => {
  it('runs the pass on the index in use, with the filtered words and the keeps gate', () => {
    const originalsFirst = vi.fn();
    const ctx = makeCtx({ originalsFirst, filtered: ['history', 'has', 'an', 'end', 'the'] });
    originalsStage(ctx);
    expect(originalsFirst).toHaveBeenCalledTimes(1);
    const [out, idOf, terms, allowed, keeps, near, typed, aligned, alts, asked] = originalsFirst.mock.calls[0];
    expect(out).toBe(ctx.out);
    expect(idOf).toBe(ctx.idOf);
    // 'has' and 'an' are stops: the pass is given the filtered words only
    expect(terms).toEqual(['history', 'end']);
    expect(typed).toEqual(['history', 'has', 'an', 'end']);
    expect(aligned).toBeNull();
    expect(alts).toEqual([]);
    expect(asked).toBe(false);
    expect(typeof allowed).toBe('function');
    expect(typeof keeps).toBe('function');
    expect(typeof near).toBe('function');
  });

  it('puts the quoted phrase first in the terms', () => {
    const originalsFirst = vi.fn();
    const ctx = makeCtx({ originalsFirst, p: { phrase: 'history has an end' }, filtered: ['history', 'has'] });
    originalsStage(ctx);
    expect(originalsFirst.mock.calls[0][2]).toEqual(['history has an end', 'history']);
  });

  it('skips the pass when the index moved on', () => {
    const originalsFirst = vi.fn();
    const other = { getStoredFields: () => null };
    const ctx = makeCtx({ originalsFirst, index: () => other });
    originalsStage(ctx);
    expect(originalsFirst).not.toHaveBeenCalled();
  });

  it('hands the aligned entries over when the quote held some', () => {
    const originalsFirst = vi.fn();
    const alignHeld = new Map([['a', { start: 0 }]]);
    const ctx = makeCtx({ originalsFirst, alignHeld, alignCovOf: { a: 4 }, alignBar: 2 });
    originalsStage(ctx);
    const aligned = originalsFirst.mock.calls[0][7];
    expect(aligned.has('a')).toBe(true);
    expect(aligned.has('b')).toBe(false);
    expect(aligned.cov).toEqual({ a: 4 });
    expect(aligned.bar).toBe(2);
  });

  it('reads the nearness from nearOf, or from the words when it has none', () => {
    const originalsFirst = vi.fn();
    const d = doc({ id: 'a', text: 'history has an end and christ is coming' });
    const ctx = makeCtx({ originalsFirst, nearOf: { a: 0.8 }, out: [entry(d)] });
    originalsStage(ctx);
    const near = originalsFirst.mock.calls[0][5];
    expect(near('a', d)).toBe(0.8);
    expect(near('b', d)).toBeCloseTo(nearPhrase(kjvEncode(d.text), ['history', 'has', 'an', 'end'], STOP));
    expect(near('b', d)).toBeGreaterThanOrEqual(NEAR_PHRASE_MIN);
  });

  it('reads a one-word query as holding nothing near', () => {
    const originalsFirst = vi.fn();
    const d = doc({ id: 'a', text: 'history has an end' });
    const ctx = makeCtx({ originalsFirst, typedTokens: ['history'], typedContent: ['history'], out: [entry(d)] });
    originalsStage(ctx);
    expect(originalsFirst.mock.calls[0][5]('b', d)).toBe(0);
  });
});

describe('namedSo', () => {
  const keepsOf = (o) => {
    const originalsFirst = vi.fn();
    const ctx = makeCtx({ originalsFirst, ...o });
    originalsStage(ctx);
    return originalsFirst.mock.calls[0][4];
  };

  it('a title scored whole keeps its place', () => {
    const keeps = keepsOf({ named: (d) => d.id === 'w1', titleScore: () => TITLE_EXACT_BOOST });
    expect(keeps(doc({ id: 'w1', kind: 'wtlb', title: 'History Has an End' }))).toBe(true);
  });

  it('a title the query names whole keeps its place', () => {
    const keeps = keepsOf({ named: (d) => d.id === 'w1' });
    expect(keeps(doc({ id: 'w1', kind: 'wtlb', title: 'History Has an End', text: 'other words here' }))).toBe(true);
  });

  it('a title beside more of the query than its own gives way', () => {
    const keeps = keepsOf({
      named: (d) => d.id === 'w1',
      typedContent: ['history', 'has', 'an', 'end', 'christ', 'is', 'coming', 'soon', 'today'],
    });
    expect(keeps(doc({ id: 'w1', kind: 'wtlb', title: 'History Has an End', text: 'history has an end' }))).toBe(false);
  });

  it('a title gives way when a quote of its own words runs through it', () => {
    const keeps = keepsOf({
      named: (d) => d.id === 'w1',
      typedTokens: ['history', 'has', 'an', 'end', 'christ', 'is', 'coming'],
      typedContent: ['history', 'has', 'an', 'end', 'christ', 'is', 'coming'],
    });
    const d = doc({
      id: 'w1', kind: 'wtlb', title: 'History Has an End',
      text: 'history has an end and christ is coming, history has an end indeed',
    });
    expect(keeps(d)).toBe(false);
  });

  it('a title keeps its place when its words hold the query better than its body', () => {
    const keeps = keepsOf({ named: (d) => d.id === 'w1' });
    const d = doc({ id: 'w1', kind: 'wtlb', title: 'History Has an End', text: 'the letter opens with greetings' });
    expect(keeps(d)).toBe(true);
  });

  it('an unnamed text keeps nothing', () => {
    const keeps = keepsOf({});
    expect(keeps(doc({ id: 'w1', kind: 'wtlb', title: 'History Has an End' }))).toBe(false);
  });
});

describe('admittedSo', () => {
  const keepsOf = (o) => {
    const originalsFirst = vi.fn();
    const ctx = makeCtx({ originalsFirst, ...o });
    originalsStage(ctx);
    return originalsFirst.mock.calls[0][4];
  };
  const admitted = (o = {}) => doc({ id: 'w1', kind: 'wtlb', title: 'Let The Law Be Written in Your Heart', text: 'rather let the law be written in your heart', ...o });

  it('a whole admission keeps its place', () => {
    const d = admitted();
    const keeps = keepsOf({ admittedDocs: new Set([d]), admittedWhole: true, byOwnTitle: new Set([d]) });
    expect(keeps(d)).toBe(true);
  });

  it('an admission not by its own title keeps its place', () => {
    const d = admitted();
    const keeps = keepsOf({ admittedDocs: new Set([d]), byOwnTitle: new Set() });
    expect(keeps(d)).toBe(true);
  });

  it('a short query keeps an admitted title', () => {
    const d = admitted();
    const keeps = keepsOf({
      admittedDocs: new Set([d]), byOwnTitle: new Set([d]),
      typedTokens: ['law'], typedContent: ['law'],
    });
    expect(keeps(d)).toBe(true);
  });

  it('an admission gives way when its own words run through it more than its title', () => {
    const d = admitted();
    const keeps = keepsOf({
      admittedDocs: new Set([d]), byOwnTitle: new Set([d]),
      typedTokens: ['rather', 'let', 'the', 'law', 'be', 'written', 'in', 'your', 'heart'],
      typedContent: ['rather', 'let', 'law', 'be', 'written', 'heart'],
    });
    expect(keeps(d)).toBe(false);
  });

  it('an admitted title keeps its place when its title holds the query better', () => {
    const d = admitted({ text: 'greetings to the flock' });
    const keeps = keepsOf({
      admittedDocs: new Set([d]), byOwnTitle: new Set([d]),
      typedTokens: ['let', 'the', 'law', 'be', 'written'],
      typedContent: ['let', 'law', 'be', 'written'],
    });
    expect(keeps(d)).toBe(true);
  });
});

describe('perVolume cap', () => {
  it('cuts a full collection last text first and marks it capped', () => {
    const ctx = makeCtx({
      perVolume: 2,
      out: [
        entry(doc({ id: 'a', volumeId: 'v1' })),
        entry(doc({ id: 'b', volumeId: 'v1' })),
        entry(doc({ id: 'c', volumeId: 'v1' })),
        entry(doc({ id: 'd', volumeId: 'v2' })),
      ],
    });
    originalsStage(ctx);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['a', 'b', 'd']);
    expect(ctx.capped).toEqual({ v1: true });
  });

  it('leaves a collection at its cap alone', () => {
    const ctx = makeCtx({
      perVolume: 2,
      out: [entry(doc({ id: 'a', volumeId: 'v1' })), entry(doc({ id: 'b', volumeId: 'v1' }))],
    });
    originalsStage(ctx);
    expect(ctx.out).toHaveLength(2);
    expect(ctx.capped).toEqual({});
  });
});

describe('Matthew once', () => {
  const matthew = (o = {}) => doc({ id: 'v-study', kind: 'verse', bookId: 'matthew', chapterNum: 7, verseNum: 1, text: 'judge not, that ye be not judged', volumeId: 'bible', ...o });
  const plain = (o = {}) => doc({ id: 'v-plain', kind: 'verse', bookId: 'matthew-plain', chapterNum: 7, verseNum: 1, text: 'judge not, that ye be not judged', volumeId: 'bible', ...o });

  it('shows a verse found in both readings once, as the Scripture', () => {
    const ctx = makeCtx({ out: [entry(matthew()), entry(plain()), entry(doc({ id: 'v-other', kind: 'verse', bookId: 'matthew', chapterNum: 7, verseNum: 2, text: 'other words' }))] });
    originalsStage(ctx);
    expect(ctx.out).toHaveLength(2);
    expect(ctx.out[0].doc.bookId).toBe('matthew-plain');
    expect(ctx.out[1].doc.id).toBe('v-other');
  });

  it('shows it as the Scripture when the plain twin holds the same terms', () => {
    const study = entry(matthew({ text: 'judge not lest ye be judged' }), 5, ['judge', 'not']);
    const pl = entry(plain(), 5, ['judge', 'not', 'lest']);
    const ctx = makeCtx({ out: [study, pl] });
    originalsStage(ctx);
    expect(ctx.out).toHaveLength(1);
    expect(ctx.out[0].doc.bookId).toBe('matthew-plain');
  });

  it('keeps the study text when only its wording holds the words', () => {
    const study = entry(matthew({ text: 'judge not, hypocrite, that ye be not judged' }), 5, ['judge', 'not', 'hypocrite']);
    const pl = entry(plain(), 5, ['judge', 'not']);
    const ctx = makeCtx({ out: [study, pl] });
    originalsStage(ctx);
    expect(ctx.out).toHaveLength(1);
    expect(ctx.out[0].doc.bookId).toBe('matthew');
  });

  it('finds the plain twin outside the results when the texts match', () => {
    const ctx = makeCtx({
      out: [entry(matthew())],
      verseIds: () => new Map([['matthew:7:1', 'v-plain']]),
      stored: { 'v-plain': { kind: 'verse', bookId: 'matthew-plain', chapterNum: 7, verseNum: 1, text: 'judge not, that ye be not judged', volumeId: 'bible' } },
    });
    originalsStage(ctx);
    expect(ctx.out).toHaveLength(1);
    expect(ctx.out[0].doc.bookId).toBe('matthew-plain');
    expect(ctx.idOf.get(ctx.out[0])).toBe('v-plain');
  });

  it('leaves the study text when the plain twin is not in scope', () => {
    const ctx = makeCtx({
      out: [entry(matthew())],
      inScope: () => false,
      verseIds: () => new Map([['matthew:7:1', 'v-plain']]),
      stored: { 'v-plain': { kind: 'verse', bookId: 'matthew-plain', chapterNum: 7, verseNum: 1, text: 'judge not, that ye be not judged', volumeId: 'bible' } },
    });
    originalsStage(ctx);
    expect(ctx.out[0].doc.bookId).toBe('matthew');
  });

  it('leaves the study text when the plain twin sits in a capped collection', () => {
    const ctx = makeCtx({
      out: [entry(matthew())],
      capped: { bible: true },
      verseIds: () => new Map([['matthew:7:1', 'v-plain']]),
      stored: { 'v-plain': { kind: 'verse', bookId: 'matthew-plain', chapterNum: 7, verseNum: 1, text: 'judge not, that ye be not judged', volumeId: 'bible' } },
    });
    originalsStage(ctx);
    expect(ctx.out[0].doc.bookId).toBe('matthew');
  });

  it('leaves both readings when the search keeps to one collection', () => {
    const ctx = makeCtx({ corpusFilter: 'bible', out: [entry(matthew()), entry(plain())] });
    originalsStage(ctx);
    expect(ctx.out).toHaveLength(2);
  });
});
