/* search/stage-finish.js — the results finished: cut to the limit, each opened where the reader meant, and marked.
   finishResults takes the context the stages left; here the context is built by hand over a small
   fake token store, so each gate reads on its own: the cut past the limit; the landing on the typed
   run (the run's own place first, the store's second, the phrase's store only); the quote's landing
   and when it gives way; the meaning's landing and its cosines; the same words in another verse
   shown second; the reprint's re-cut; the question's subject held; the close marking (and when it
   marks none); the KJV wording; and the page's turn stopping the run. Only the engine's store
   verbs are fakes; the phrase ranking and the passage window are real. */
import { describe, it, expect, vi } from 'vitest';
import { finishResults } from './stage-finish.js';
import { kjvEncode } from './tokenize.js';
import { lemma } from './passage.js';

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her he she they their them we our ours you your yours it its '
  + 'i me my mine us said').split(' '));

const isStopTerm = (t) => STOP.has(t);

/** Where the at-th token of a text starts, as the engine's tokenPlace reads it. */
function tokenPlace(text, at) {
  const toks = kjvEncode(text);
  if (at < 0 || at >= toks.length) return -1;
  const low = text.toLowerCase();
  let pos = 0;
  for (let i = 0; i <= at; i++) {
    const idx = low.indexOf(toks[i], pos);
    if (idx < 0) return -1;
    if (i === at) return idx;
    pos = idx + toks[i].length;
  }
  return -1;
}

const doc = (o = {}) => ({ kind: 'letter', title: '', text: '', volumeId: 'v1', ...o });
const entry = (d, score = 5) => ({ score, doc: d, terms: [] });

/** @returns {any} */
function makeCtx(o = {}) {
  const out = o.out ?? [];
  const idOf = new Map(out.map((e) => [e, e.doc.id]));
  const S = o.S ?? null;
  return {
    out, idOf,
    limit: o.limit ?? 10,
    p: o.p ?? {},
    phraseToks: o.phraseToks ?? [],
    filtered: o.filtered ?? ['lord', 'shepherd'],
    run: o.run ?? null,
    typedTokens: o.typedTokens ?? ['the', 'lord', 'is', 'my', 'shepherd'],
    typedContent: o.typedContent ?? ['lord', 'shepherd'],
    keyword: o.keyword ?? false,
    frame: o.frame ?? null,
    STOP,
    S,
    runAt: o.runAt ?? {},
    nearOf: o.nearOf ?? {},
    alignHeld: o.alignHeld ?? new Map(),
    sem: o.sem ?? null,
    named: o.named ?? (() => false),
    admittedDocs: o.admittedDocs ?? new Set(),
    landedByTitle: o.landedByTitle ?? new Set(),
    titleTop: o.titleTop ?? new Set(),
    byWords: o.byWords ?? new Set(),
    allowed: o.allowed ?? (() => true),
    fresh: o.fresh ?? (() => true),
    readInKjv: o.readInKjv ?? false,
    ownShare: o.ownShare ?? {},
    spent: o.spent ?? (() => false),
    pause: o.pause ?? (async () => null),
    eng: {
      runIds: (s, run) => run.map((_, i) => [i, -1]),
      storeSpan: (s, id) => (s && s.spans[id] !== undefined ? s.spans[id] : null),
      storeRunAt: (s, sid, _acc) => (s && s.at[sid] !== undefined ? s.at[sid] : -1),
      tokenPlace,
      meaningLanding: o.meaningLanding ?? vi.fn(),
      docTokens: (id, d) => kjvEncode((d.text || '') + ' ' + (d.title || '')).map(lemma),
      reprintSecond: o.reprintSecond ?? vi.fn(() => false),
      isStopTerm,
      passageQuery: (words) => ({ query: words.map((w) => ({ lem: lemma(w), weight: 1, syn: [] })), span: 30 }),
      docFreq: () => 1,
      eachWording: (toks, fn) => fn(toks),
      REPRINT_REACH: 200,
      BEST_SHOWN: 5,
      RUN_MIN: 3,
    },
  };
}

const LETTER_TEXT = 'opening words the lord is my shepherd here';

describe('cut', () => {
  it('cuts past the limit and says texts were left', async () => {
    const ctx = makeCtx({ limit: 2, out: [entry(doc({ id: 'a' })), entry(doc({ id: 'b' })), entry(doc({ id: 'c' }))] });
    expect(await finishResults(ctx)).toBeNull();
    expect(ctx.out).toHaveLength(2);
    expect(ctx.over).toBe(true);
  });

  it('leaves the list whole at the limit and over is false', async () => {
    const ctx = makeCtx({ limit: 3, out: [entry(doc({ id: 'a' })), entry(doc({ id: 'b' }))] });
    await finishResults(ctx);
    expect(ctx.out).toHaveLength(2);
    expect(ctx.over).toBe(false);
  });
});

describe('landRun', () => {
  it('opens the first texts on the typed run, at the store place', async () => {
    const S = { spans: { 'l-1': 0 }, at: { 0: 2 } };
    const ctx = makeCtx({ S, out: [entry(doc({ id: 'l-1', text: LETTER_TEXT }))] });
    await finishResults(ctx);
    expect(ctx.out[0].placeStart).toBe(14);
  });

  it('prefers the run place over the store place', async () => {
    const S = { spans: { 'l-1': 0 }, at: { 0: 2 } };
    const ctx = makeCtx({ S, runAt: { 'l-1': 0 }, out: [entry(doc({ id: 'l-1', text: LETTER_TEXT }))] });
    await finishResults(ctx);
    expect(ctx.out[0].placeStart).toBe(0);
  });

  it('a quoted phrase lands on the store place, never the run place', async () => {
    const S = { spans: { 'l-1': 0 }, at: { 0: 2 } };
    const ctx = makeCtx({
      S, runAt: { 'l-1': 0 },
      p: { phrase: 'the lord is my shepherd' },
      phraseToks: ['the', 'lord', 'is', 'my', 'shepherd'],
      out: [entry(doc({ id: 'l-1', text: LETTER_TEXT }))],
    });
    await finishResults(ctx);
    expect(ctx.out[0].placeStart).toBe(14);
  });

  it('skips verses and texts the title already landed', async () => {
    const S = { spans: { 'v-1': 0, 'l-1': 1, 'l-2': 2 }, at: { 0: 0, 1: 0, 2: 0 } };
    const e1 = entry(doc({ id: 'v-1', kind: 'verse', text: LETTER_TEXT }));
    const e2 = entry(doc({ id: 'l-1', text: LETTER_TEXT }));
    const e3 = entry(doc({ id: 'l-2', text: LETTER_TEXT }));
    const ctx = makeCtx({ S, out: [e1, e2, e3], landedByTitle: new Set([e2]) });
    await finishResults(ctx);
    expect(ctx.out[0].placeStart).toBeUndefined();
    expect(ctx.out[1].placeStart).toBeUndefined();
    expect(ctx.out[2].placeStart).toBe(0);
  });

  it('lands no further than the first ten', async () => {
    const spans = {};
    const at = {};
    const out = [];
    for (let i = 0; i < 12; i++) {
      spans['l-' + i] = i;
      at[i] = 0;
      out.push(entry(doc({ id: 'l-' + i, text: LETTER_TEXT })));
    }
    const ctx = makeCtx({ S: { spans, at }, out, limit: 20 });
    await finishResults(ctx);
    expect(ctx.out[9].placeStart).toBe(0);
    expect(ctx.out[10].placeStart).toBeUndefined();
    expect(ctx.out[11].placeStart).toBeUndefined();
  });
});

describe('alignHeld landing', () => {
  it('opens a text holding the quote on the first word it holds', async () => {
    const ctx = makeCtx({
      out: [entry(doc({ id: 'l-1', text: LETTER_TEXT }))],
      alignHeld: new Map([['l-1', { start: 3 }]]),
    });
    await finishResults(ctx);
    expect(ctx.out[0].placeStart).toBe(18);
  });

  it('does not move a text already landed, and skips verses', async () => {
    const S = { spans: { 'l-1': 0, 'v-1': 1 }, at: { 0: 2, 1: 3 } };
    const ctx = makeCtx({
      S,
      out: [
        entry(doc({ id: 'l-1', text: LETTER_TEXT })),
        entry(doc({ id: 'v-1', kind: 'verse', text: LETTER_TEXT })),
      ],
      alignHeld: new Map([['l-1', { start: 3 }], ['v-1', { start: 3 }]]),
    });
    await finishResults(ctx);
    expect(ctx.out[0].placeStart).toBe(14);
    expect(ctx.out[1].placeStart).toBeUndefined();
  });
});

describe('meaning', () => {
  it('calls meaningLanding with the phrase or the filtered non-stop words', async () => {
    const meaningLanding = vi.fn();
    const ctx = makeCtx({
      meaningLanding,
      sem: [{ id: 'l-1', score: 0.9 }],
      filtered: ['lord', 'shepherd', 'the'],
      out: [entry(doc({ id: 'l-1', text: LETTER_TEXT }))],
    });
    await finishResults(ctx);
    expect(meaningLanding).toHaveBeenCalledTimes(1);
    const [_out, _idOf, sem, terms, byTitle] = meaningLanding.mock.calls[0];
    expect(sem).toEqual([{ id: 'l-1', score: 0.9 }]);
    expect(terms).toEqual(['lord', 'shepherd']);
    expect(byTitle).toBe(ctx.landedByTitle);
    expect(ctx.out[0].meaning).toBe(0.9);
  });

  it('does not call meaningLanding without a meaning', async () => {
    const meaningLanding = vi.fn();
    const ctx = makeCtx({ meaningLanding, sem: [], out: [entry(doc({ id: 'l-1' }))] });
    await finishResults(ctx);
    expect(meaningLanding).not.toHaveBeenCalled();
  });
});

describe('same words in another verse', () => {
  const parallel = () => [
    entry(doc({ id: 'v-lead', kind: 'verse', bookId: 'matthew', chapterNum: 7, verseNum: 1, text: 'the lord is my shepherd' })),
    entry(doc({ id: 'v-next', kind: 'verse', bookId: 'matthew', chapterNum: 7, verseNum: 2, text: 'the lord is my shepherd' })),
    entry(doc({ id: 'l-a', text: 'walking in peace' })),
    entry(doc({ id: 'l-b', text: 'walking in peace' })),
    entry(doc({ id: 'l-c', text: 'walking in peace' })),
    entry(doc({ id: 'v-par', kind: 'verse', bookId: 'mark', chapterNum: 1, verseNum: 1, text: 'the lord is my shepherd and i shall not want' })),
    entry(doc({ id: 'v-par2', kind: 'verse', bookId: 'luke', chapterNum: 1, verseNum: 1, text: 'the lord is my shepherd' })),
  ];

  it('brings the parallel verse up second, past its neighbour', async () => {
    const ctx = makeCtx({ out: parallel(), nearOf: { 'v-lead': 0.95, 'v-par': 0.8, 'v-par2': 0.8 } });
    await finishResults(ctx);
    expect(ctx.out[1].doc.id).toBe('v-par');
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['v-lead', 'v-par', 'v-next', 'l-a', 'l-b', 'l-c', 'v-par2']);
  });

  it('leaves the parallel verse down when it sits before the best five', async () => {
    const out = parallel();
    const moved = out.splice(5, 1)[0];
    out.splice(3, 0, moved);
    const ctx = makeCtx({ out, nearOf: { 'v-lead': 0.95, 'v-par': 0.8, 'v-par2': 0.8 } });
    await finishResults(ctx);
    expect(ctx.out[1].doc.id).toBe('v-next');
    expect(ctx.out[3].doc.id).toBe('v-par');
  });

  it('does not reorder when the leader holds no near run', async () => {
    const ctx = makeCtx({ out: parallel(), nearOf: { 'v-lead': 0.5, 'v-par': 0.8 } });
    await finishResults(ctx);
    expect(ctx.out[0].doc.id).toBe('v-lead');
    expect(ctx.out[1].doc.id).toBe('v-next');
  });
});

describe('reprintSecond', () => {
  it('re-cuts when the reprint adds past the limit', async () => {
    const reprintSecond = vi.fn((out) => { out.push(entry(doc({ id: 'extra' }))); return true; });
    const ctx = makeCtx({
      limit: 2,
      reprintSecond,
      out: [entry(doc({ id: 'a' })), entry(doc({ id: 'b' }))],
    });
    await finishResults(ctx);
    expect(reprintSecond).toHaveBeenCalledTimes(1);
    expect(ctx.out).toHaveLength(2);
    expect(ctx.over).toBe(true);
  });

  it('does not re-cut when the title tops the list', async () => {
    const reprintSecond = vi.fn(() => true);
    const e0 = entry(doc({ id: 'a' }));
    const ctx = makeCtx({ limit: 2, reprintSecond, out: [e0, entry(doc({ id: 'b' }))], titleTop: new Set([e0]) });
    await finishResults(ctx);
    expect(reprintSecond).not.toHaveBeenCalled();
    expect(ctx.over).toBe(false);
  });
});

describe('frame demotion', () => {
  it('holds the question subject first and the frame-only texts after', async () => {
    const e1 = { score: 9, doc: doc({ id: 'f1' }), terms: ['who', 'is'] };
    const e2 = { score: 8, doc: doc({ id: 'ask' }), terms: ['timothy'] };
    const e3 = { score: 7, doc: doc({ id: 'f2' }), terms: ['who'] };
    const ctx = makeCtx({ frame: { frame: 'who is' }, out: [e1, e2, e3] });
    await finishResults(ctx);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['ask', 'f1', 'f2']);
  });

  it('exempts what the meaning ranked, a name, an admission or a title top', async () => {
    const e1 = { score: 9, doc: doc({ id: 'sem' }), terms: ['who'] };
    const e2 = { score: 8, doc: doc({ id: 'named' }), terms: ['who'] };
    const e3 = { score: 7, doc: doc({ id: 'plain' }), terms: ['who'] };
    const ctx = makeCtx({
      frame: { frame: 'who is' },
      sem: [{ id: 'sem', score: 0.9 }],
      named: (d) => d.id === 'named',
      out: [e1, e2, e3],
    });
    await finishResults(ctx);
    expect(ctx.out.map((e) => e.doc.id)).toEqual(['sem', 'named', 'plain']);
  });
});

describe('close marking', () => {
  it('marks a text close when it holds the run together in one window', async () => {
    const ctx = makeCtx({
      out: [entry(doc({ id: 'l-1', text: 'the lord is my shepherd and the lord keeps watch' }))],
      nearOf: { 'l-1': 0.9 },
    });
    await finishResults(ctx);
    expect(ctx.out[0].close).toBe(true);
  });

  it('marks a text not close when the window holds too little', async () => {
    const ctx = makeCtx({
      out: [entry(doc({ id: 'l-1', text: 'the lord is my keeper and my guide' }))],
      nearOf: { 'l-1': 0.9 },
    });
    await finishResults(ctx);
    expect(ctx.out[0].close).toBe(false);
  });

  it('marks a text close when the quote held it, whatever the window says', async () => {
    const ctx = makeCtx({
      out: [entry(doc({ id: 'l-1', text: 'the lord is my keeper' }))],
      nearOf: { 'l-1': 0.1 },
      alignHeld: new Map([['l-1', { start: 0 }]]),
    });
    await finishResults(ctx);
    expect(ctx.out[0].close).toBe(true);
  });

  it('reads a by-words text as holding nothing near', async () => {
    const e = entry(doc({ id: 'l-1', text: 'the lord is my shepherd and the lord keeps watch' }));
    const ctx = makeCtx({ out: [e], byWords: new Set([e]) });
    await finishResults(ctx);
    expect(ctx.out[0].close).toBe(false);
  });

  it('marks nothing for a keyword search or a quoted phrase', async () => {
    const ctx = makeCtx({
      keyword: true,
      out: [entry(doc({ id: 'l-1', text: 'the lord is my shepherd' }))],
      nearOf: { 'l-1': 0.9 },
    });
    await finishResults(ctx);
    expect(ctx.out[0].close).toBeUndefined();
    const ctx2 = makeCtx({
      p: { phrase: 'the lord is my shepherd' },
      phraseToks: ['the', 'lord', 'is', 'my', 'shepherd'],
      out: [entry(doc({ id: 'l-1', text: 'the lord is my shepherd' }))],
      nearOf: { 'l-1': 0.9 },
    });
    await finishResults(ctx2);
    expect(ctx2.out[0].close).toBeUndefined();
  });

  it('returns what pause returns when the page spent its turn mid-marking', async () => {
    let calls = 0;
    const ctx = makeCtx({
      spent: () => ++calls >= 3,
      pause: async () => 'PAUSED',
      out: [
        entry(doc({ id: 'l-1', text: 'the lord is my shepherd' })),
        entry(doc({ id: 'l-2', text: 'the lord is my shepherd' })),
        entry(doc({ id: 'l-3', text: 'the lord is my shepherd' })),
      ],
      nearOf: { 'l-1': 0.9, 'l-2': 0.9, 'l-3': 0.9 },
    });
    expect(await finishResults(ctx)).toBe('PAUSED');
    expect(ctx.out[0].close).toBe(true);
    expect(ctx.out[2].close).toBeUndefined();
  });
});

describe('kjv wording', () => {
  it('marks only verses the KJV wording stood for', async () => {
    const ctx = makeCtx({
      readInKjv: true,
      ownShare: { 'v-1': 1 },
      out: [
        entry(doc({ id: 'v-1', kind: 'verse', text: 'the lord is my shepherd' })),
        entry(doc({ id: 'v-2', kind: 'verse', text: 'the lord is my shepherd' })),
        entry(doc({ id: 'l-1', text: 'the lord is my shepherd' })),
      ],
    });
    await finishResults(ctx);
    expect(ctx.out[0].kjvWording).toBe(true);
    expect(ctx.out[1].kjvWording).toBeUndefined();
    expect(ctx.out[2].kjvWording).toBeUndefined();
  });
});
