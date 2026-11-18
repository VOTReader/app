/* search/stage-titles.js — the titles named: the title typed leads (B1), a title remembered loosely joins (B5).
   titlesStage takes the context the ranking left; here the context is built by hand over a small
   title index (the real buildTitles over fixture docs), so each gate reads on its own: the lead
   word, the original first, the verse that keeps its place, the nearer of two named titles,
   admission from outside the results, the heading and its original, the level-1 guard, the
   one-word-wrong swap, whole against loose, the reordered title, the collection hint, and
   where a title opens. Only the engine's store verbs are fakes. */
import { describe, it, expect } from 'vitest';
import { titlesStage } from './stage-titles.js';
import { buildTitles, titleWords } from './titles.js';
import { kjvEncode } from './tokenize.js';
import { titleLevel } from './ranking.js';

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her he she they their them we our ours you your yours it its '
  + 'i me my mine us said').split(' '));

const DOCS = {
  'l-fasting': { id: 'l-fasting', kind: 'letter', title: 'Regarding Fasting', volumeId: 'v1', letterId: 'fasting', text: 'fasting and prayer open the day with quiet words about fasting' },
  'w-fasting': { id: 'w-fasting', kind: 'wtlb', title: 'Fasting', volumeId: 'wtlb1', letterId: 'fasting-w', text: 'fasting is a gift' },
  'l-gatekeepers': { id: 'l-gatekeepers', kind: 'letter', title: 'The Gatekeepers', volumeId: 'v1', letterId: 'gatekeepers', text: 'the gatekeepers watch' },
  'l-gatekeepers2': { id: 'l-gatekeepers2', kind: 'letter', title: 'Gatekeepers', volumeId: 'v1', letterId: 'gatekeepers2', text: 'gatekeepers stand' },
  'l-baptism': { id: 'l-baptism', kind: 'letter', title: 'The True Baptism', volumeId: 'v1', letterId: 'baptism', text: 'the true baptism washes' },
  'w-baptism': { id: 'w-baptism', kind: 'wtlb', title: 'True Baptism', volumeId: 'wtlb1', letterId: 'baptism-w', text: 'true baptism explained' },
  'l-teach': { id: 'l-teach', kind: 'letter', title: 'Given to Teach', volumeId: 'v1', letterId: 'teach', text: 'given to teach the flock' },
  'l-holdfast': { id: 'l-holdfast', kind: 'letter', title: 'Hold Fast', volumeId: 'v1', letterId: 'holdfast', text: 'hold fast what you have' },
  'l-bless': { id: 'l-bless', kind: 'letter', title: 'Bless Those Who Curse You', volumeId: 'v1', letterId: 'bless', text: 'bless those who curse you and pray' },
  'l-holy': { id: 'l-holy', kind: 'letter', title: 'Holy Days of God', volumeId: 'v1', letterId: 'holy', text: 'the holy days of god are appointed times' },
  'a-holy': { id: 'a-holy', kind: 'answers', title: 'Regarding The Holy Days of God', volumeId: 'answers', letterId: 'holy', text: 'opening words. The Holy Days are kept through the week. closing words.' },
  'a-israel': { id: 'a-israel', kind: 'answers', title: 'Regarding Israel', volumeId: 'answers', letterId: 'israel', text: 'israel and the nations, prayer and many words' },
  'l-other': { id: 'l-other', kind: 'letter', title: 'Walking in Peace', volumeId: 'v1', letterId: 'other', text: 'walking in peace each day' },
  'v-matt': { id: 'v-matt', kind: 'verse', title: '', volumeId: '', letterId: '', text: 'bless those who curse you love your enemies' },
  'l-rod': { id: 'l-rod', kind: 'letter', title: 'Spare the Rod', volumeId: 'v1', letterId: 'rod', text: 'spare the rod and spoil the child' },
  'l-solid': { id: 'l-solid', kind: 'letter', title: 'Established Forever', volumeId: 'v1', letterId: 'solid', text: 'solidified eternally in the truth' },
  'a-solid': { id: 'a-solid', kind: 'answers', title: 'Regarding Eternity', volumeId: 'answers', letterId: 'solid-a', text: 'opening words. Solidified Eternally stands here. closing words.' },
  'l-rest': { id: 'l-rest', kind: 'letter', title: 'Days of Rest', volumeId: 'v1', letterId: 'rest', text: 'days of rest and quiet' },
};

const ANSWERS = [
  { id: 'holy', paragraphs: [{ align: 'center', text: '**The Holy Days**' }] },
  { id: 'solid-a', paragraphs: [{ align: 'center', text: '**Solidified Eternally**' }] },
];

let cachedIx = null;
function titleIndex() {
  if (!cachedIx) cachedIx = buildTitles(Object.values(DOCS), { answers: ANSWERS });
  return cachedIx;
}

/** The first place `run` occurs in `toks` as one run, or -1. */
function subseq(toks, run) {
  for (let i = 0; i + run.length <= toks.length; i++) {
    if (run.every((w, j) => toks[i + j] === w)) return i;
  }
  return -1;
}

/** How many of `words` the text (a string, or its tokens) holds. */
function typedHeld(text, words) {
  const toks = new Set(Array.isArray(text) ? text : kjvEncode(text || ''));
  return [...new Set(words)].filter((w) => toks.has(w)).length;
}

function entry(doc, score = 5) { return { score, doc, terms: [] }; }

/** @returns {any} */
function makeCtx(o = {}) {
  const typedTokens = o.typedTokens ?? ['fasting'];
  const docs = o.docs ?? DOCS;
  const out = (o.out ?? []).map((e) => ({ score: e.score, doc: e.doc, terms: e.terms ?? [] }));
  const idOf = new Map(out.map((e) => [e, e.doc.id]));
  const alignHeld = o.alignHeld ?? new Map();
  return {
    out, idOf,
    p: o.p ?? {},
    wanted: o.wanted ?? 'fasting',
    keyword: o.keyword ?? false,
    typedTokens,
    typedNum: o.typedNum ?? null,
    STOP,
    titleScore: (d) => (o.titleScores && o.titleScores[d.id] !== undefined
      ? o.titleScores[d.id]
      : (titleLevel(titleWords(d.title || ''), typedTokens) >= 3 ? 3 : 1)),
    runAt: o.runAt ?? {},
    nearOf: o.nearOf ?? {},
    alignHeld,
    docLookup: docs,
    matchedTerms: o.matchedTerms ?? {},
    allowed: o.allowed ?? (() => true),
    fresh: o.fresh ?? (() => true),
    eng: {
      index: () => ({ documentCount: 100, getStoredFields: (id) => docs[id] || null }),
      docTokens: (id, doc) => kjvEncode(doc.text || ''),
      hasTokenRun: (toks, run) => subseq(toks, run) >= 0,
      holdsTogether: () => o.holdsTogether ?? false,
      reshapeDoc: (f) => ({ ...f }),
      runHolders: () => o.runHoldersMap ?? null,
      termExists: () => true,
      titleToks: (d) => ({ all: titleWords(d.title || ''), own: titleWords(d.title || '') }),
      titlesNow: o.noTitles ? () => null : () => titleIndex(),
      tokenPlace: (text, at) => (typeof at === 'number' && at >= 0 ? at : -1),
      tokenRunAt: (toks, run) => subseq(toks, run),
      typedHeld,
      HEADING_ORIGINALS: new Set(['letter', 'wtlb', 'blessed', 'holy-day', 'bible-study']),
      ORIGINAL_TIER: { verse: 0, letter: 0, wtlb: 1, blessed: 1, 'holy-day': 2, 'bible-study': 3, answers: 4 },
      QUOTE_NEAR_MIN: 5, RUN_MIN: 3, SWAP_NAMED_SHARE: 0.6, TITLE_HITS: 12, TITLE_NEARER: 0.2,
      TITLE_ORDER_REACH: 30, TITLE_REACH: 5, TITLE_REORDER_MIN: 3, VERSE_RUN_HELD: 4,
    },
  };
}

describe('titlesStage', () => {
  it('the title typed whole leads (B1)', () => {
    const ctx = makeCtx({ noTitles: true, out: [entry(DOCS['a-israel'], 9), entry(DOCS['l-fasting'], 5), entry(DOCS['l-other'], 4)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('l-fasting');
    expect(ctx.out[0].placeStart).toBe(0);
    expect(ctx.titleTop.has(ctx.out[0])).toBe(true);
  });

  it('a lead word typed puts the level-4 title first', () => {
    const ctx = makeCtx({ noTitles: true, wanted: 'the gatekeepers', typedTokens: ['the', 'gatekeepers'],
      out: [entry(DOCS['l-gatekeepers2'], 9), entry(DOCS['l-gatekeepers'], 5), entry(DOCS['l-other'], 4)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('l-gatekeepers');
  });

  it('without a lead word the original leads, then the title as typed', () => {
    const ctx = makeCtx({ noTitles: true, wanted: 'true baptism', typedTokens: ['true', 'baptism'],
      out: [entry(DOCS['w-baptism'], 9), entry(DOCS['l-baptism'], 5)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('l-baptism');
    expect(ctx.out[1].doc.id).toBe('w-baptism');
  });

  it('a verse holding a four-word quote keeps its place over a title typed whole', () => {
    const ctx = makeCtx({ noTitles: true, wanted: 'bless those who curse you', typedTokens: ['bless', 'those', 'who', 'curse', 'you'],
      out: [entry(DOCS['v-matt'], 9), entry(DOCS['l-bless'], 5)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('v-matt');
  });

  it('one result is left alone', () => {
    const ctx = makeCtx({ noTitles: true, out: [entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out).toHaveLength(1);
    expect(ctx.out[0].doc.id).toBe('l-other');
  });

  it('no typed tokens reorders nothing', () => {
    const ctx = makeCtx({ noTitles: true, wanted: '', typedTokens: [], out: [entry(DOCS['a-israel'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['a-israel', 'l-other']);
    expect(ctx.typedContent).toEqual([]);
  });

  it('of two titles named, the one named more nearly leads', () => {
    const ctx = makeCtx({ noTitles: true, wanted: 'holy days', typedTokens: ['holy', 'days'],
      titleScores: { 'a-holy': 1.5, 'l-rest': 1.8 },
      out: [entry(DOCS['a-holy'], 9), entry(DOCS['l-rest'], 5), entry(DOCS['l-other'], 4)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('l-rest');
  });

  it('a nearer title inside TITLE_NEARER does not lead', () => {
    const ctx = makeCtx({ noTitles: true, wanted: 'holy days', typedTokens: ['holy', 'days'],
      titleScores: { 'a-holy': 1.5, 'l-rest': 1.6 },
      out: [entry(DOCS['a-holy'], 9), entry(DOCS['l-rest'], 5), entry(DOCS['l-other'], 4)] });
    titlesStage(ctx);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['a-holy', 'l-rest', 'l-other']);
  });

  it('a title remembered loosely joins from outside the results', () => {
    const ctx = makeCtx({ out: [entry(DOCS['a-israel'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('w-fasting');
    expect(ctx.out[1].doc.id).toBe('l-fasting');
    expect(ctx.out[0].placeStart).toBe(0);
    expect(ctx.out[1].placeStart).toBe(0);
    expect(ctx.admittedWhole).toBe(true);
    expect([...ctx.admittedDocs].map((d) => d.id).sort()).toEqual(['l-fasting', 'w-fasting']);
    expect([...ctx.byOwnTitle].map((d) => d.id).sort()).toEqual(['l-fasting', 'w-fasting']);
    expect(ctx.titleTop.has(ctx.out[0])).toBe(true);
    expect(ctx.landedByTitle.has(ctx.out[0])).toBe(true);
  });

  it('a heading joins and opens on itself', () => {
    const ctx = makeCtx({ wanted: 'the holy days', typedTokens: ['the', 'holy', 'days'], out: [entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    const heading = ctx.out.find((e) => e.doc.id === 'a-holy');
    expect(heading).toBeDefined();
    expect(heading.placeStart).toBe(DOCS['a-holy'].text.indexOf('The Holy Days'));
    expect(ctx.admittedWhole).toBe(true);
    expect(ctx.landedByTitle.has(heading)).toBe(true);
    expect(ctx.titleTop.has(heading)).toBe(false);
    expect([...ctx.admittedDocs].map((d) => d.id)).not.toContain('l-holy');
  });

  it('a level-1 title is named only when no other text holds the run', () => {
    const ctx = makeCtx({ wanted: 'spare therod', typedTokens: ['spare', 'therod'],
      runHoldersMap: new Map([['l-other', 2]]), out: [entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['l-other']);
    expect(ctx.admittedDocs.size).toBe(0);
  });

  it('a level-1 title stands when only its own text holds the run', () => {
    const ctx = makeCtx({ wanted: 'spare therod', typedTokens: ['spare', 'therod'],
      runHoldersMap: new Map([['l-rod', 2]]), out: [entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('l-rod');
    expect(ctx.out[0].placeStart).toBe(0);
  });

  it('a title typed with one word wrong joins when nothing else names a title', () => {
    const ctx = makeCtx({ wanted: 'chosen to teach', typedTokens: ['chosen', 'to', 'teach'],
      out: [entry(DOCS['a-israel'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('l-teach');
    expect(ctx.out[0].placeStart).toBe(0);
    expect(ctx.admittedWhole).toBe(false);
    expect([...ctx.byOwnTitle].map((d) => d.id)).toContain('l-teach');
  });

  it('a title one word wrong does not join when a text holds the words together', () => {
    const ctx = makeCtx({ wanted: 'chosen to teach', typedTokens: ['chosen', 'to', 'teach'], holdsTogether: true,
      out: [entry(DOCS['a-israel'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['a-israel', 'l-other']);
    expect(ctx.admittedDocs.size).toBe(0);
  });

  it('a verse quoted keeps above a title typed whole', () => {
    const ctx = makeCtx({ wanted: 'bless those who curse you', typedTokens: ['bless', 'those', 'who', 'curse', 'you'],
      runAt: { 'v-matt': 0 }, out: [entry(DOCS['v-matt'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('v-matt');
    expect(ctx.out[1].doc.id).toBe('l-bless');
    expect(ctx.keptDocs.has(DOCS['v-matt'])).toBe(true);
  });

  it('a quote one word off keeps above a title remembered loosely', () => {
    const ctx = makeCtx({ wanted: 'love bless those curse you', typedTokens: ['love', 'bless', 'those', 'curse', 'you'],
      out: [entry(DOCS['v-matt'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('v-matt');
    expect(ctx.out[1].doc.id).toBe('l-bless');
  });

  it('a text holding fewer of the words than the title does not keep above it', () => {
    const ctx = makeCtx({ wanted: 'love bless those curse you', typedTokens: ['love', 'bless', 'those', 'curse', 'you'],
      out: [entry(DOCS['l-other'], 9), entry(DOCS['a-israel'], 5)] });
    titlesStage(ctx);
    expect(ctx.out[0].doc.id).toBe('l-bless');
  });

  it('a title typed in another order counts as typed whole', () => {
    const ctx = makeCtx({ wanted: 'baptism true the', typedTokens: ['baptism', 'true', 'the'],
      out: [entry(DOCS['a-israel'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.admittedWhole).toBe(true);
    expect(ctx.out[0].doc.id).toBe('l-baptism');
    expect(ctx.out[1].doc.id).toBe('w-baptism');
  });

  it('a collection hint demotes a held text that does not hold the title’s own words', () => {
    const alignHeld = new Map([['a-israel', { rank: 1 }]]);
    const ctx = makeCtx({ wanted: 'fasting words to live by', typedTokens: ['fasting', 'words', 'to', 'live', 'by'],
      alignHeld, out: [entry(DOCS['a-israel'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.alignHeld.has('a-israel')).toBe(false);
    expect(ctx.keptDocs.has(DOCS['a-israel'])).toBe(false);
    expect(ctx.out[0].doc.id).toBe('w-fasting');
  });

  it('a whole title its body says word for word opens on the run, not its start', () => {
    const ctx = makeCtx({ runAt: { 'l-fasting': 5 }, out: [entry(DOCS['a-israel'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    const letter = ctx.out.find((e) => e.doc.id === 'l-fasting');
    const wtlb = ctx.out.find((e) => e.doc.id === 'w-fasting');
    expect(letter.placeStart).toBeUndefined();
    expect(ctx.landedByTitle.has(letter)).toBe(false);
    expect(wtlb.placeStart).toBe(0);
  });

  it('a heading too short to look for opens its original on the typed run', () => {
    const ctx = makeCtx({ wanted: 'solidified eternally', typedTokens: ['solidified', 'eternally'],
      runAt: { 'l-solid': 4 }, out: [entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    const original = ctx.out.find((e) => e.doc.id === 'l-solid');
    const heading = ctx.out.find((e) => e.doc.id === 'a-solid');
    expect(original).toBeDefined();
    expect(original.placeStart).toBe(4);
    expect(heading).toBeDefined();
    expect(heading.placeStart).toBe(DOCS['a-solid'].text.indexOf('Solidified Eternally'));
  });

  it('a phrase query reads no title index', () => {
    const ctx = makeCtx({ p: { phrase: true }, out: [entry(DOCS['a-israel'], 9), entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['a-israel', 'l-other']);
    expect(ctx.admittedDocs.size).toBe(0);
  });

  it('writes typedContent and named onto the context', () => {
    const ctx = makeCtx({ wanted: 'the holy days', typedTokens: ['the', 'holy', 'days'], out: [entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.typedContent).toEqual(['holy', 'days']);
    expect(ctx.named(DOCS['l-holy'])).toBe(false);
    expect(ctx.named(DOCS['a-holy'])).toBe(false);
  });

  it('in a keyword search a title holding every typed word is named', () => {
    const ctx = makeCtx({ noTitles: true, keyword: true, wanted: 'walking peace', typedTokens: ['walking', 'peace'],
      out: [entry(DOCS['l-other'], 5)] });
    titlesStage(ctx);
    expect(ctx.named(DOCS['l-other'])).toBe(true);
    expect(ctx.named(DOCS['a-israel'])).toBe(false);
  });
});
