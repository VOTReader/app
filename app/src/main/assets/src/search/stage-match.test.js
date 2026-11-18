/* search/stage-match.js — the words matched: one BM25 search per search unit, each text's score and coverage added up.
   matchWords takes the context the units left; here the context is built by hand over a small
   fake searchUnit, so each gate reads on its own: the weight of a literal, a joined, a form and a
   synonym unit; the score added up and the first hit kept; the literal hit and the matched terms
   (capped, deduped, never a stop word); the term mask and the KJV score with their bits; the
   Answers hits; the unit options; what was heard, heard on its own, and unheard; a search that
   throws; and the page's turn stopping the run. Only the engine's search verbs are fakes. */
import { describe, it, expect, vi } from 'vitest';
import { accumulate, matchWords } from './stage-match.js';
import { MS_SEARCH_DEFAULTS } from './search-config.js';
import { SYNONYM_WEIGHT, FORM_WEIGHT } from './ranking.js';

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her he she they their them we our ours you your yours it its '
  + 'i me my mine us said').split(' '));

const isStopTerm = (t) => STOP.has(t);

/** A bare accumulate context: the tables matchWords would have written. @returns {any} */
function accCtx(o = {}) {
  return {
    scoreMap: Object.create(null),
    termMask: Object.create(null),
    literalHit: Object.create(null),
    matchedTerms: Object.create(null),
    answersHits: Object.create(null),
    kjvScore: Object.create(null),
    kjvMask: Object.create(null),
    docLookup: Object.create(null),
    contentTyped: o.contentTyped ?? false,
    eng: { isStopTerm },
  };
}

const hit = (o = {}) => ({ id: 'd1', score: 10, kind: 'letter', terms: ['shepherd'], ...o });

describe('accumulate', () => {
  it('weights a literal unit at 1', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'shepherd', origin: 0, literal: true }, [hit()]);
    expect(ctx.scoreMap.d1).toBe(10);
  });

  it('weights a joined unit at 1', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'yahushua', origin: 0, joined: true, cover: 0b11 }, [hit()]);
    expect(ctx.scoreMap.d1).toBe(10);
    expect(ctx.literalHit.d1).toBe(true);
  });

  it('weights a form unit at FORM_WEIGHT', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'shepherd', origin: 0, form: true }, [hit()]);
    expect(ctx.scoreMap.d1).toBeCloseTo(10 * FORM_WEIGHT);
  });

  it('weights a synonym unit at SYNONYM_WEIGHT', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'pastor', origin: 0 }, [hit()]);
    expect(ctx.scoreMap.d1).toBeCloseTo(10 * SYNONYM_WEIGHT);
  });

  it('adds scores across units and keeps the first hit in docLookup', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'shepherd', origin: 0, literal: true }, [hit({ score: 10 })]);
    accumulate(ctx, { term: 'flock', origin: 1, literal: true }, [hit({ id: 'd1', score: 4, terms: ['flock'] })]);
    expect(ctx.scoreMap.d1).toBe(14);
    expect(ctx.docLookup.d1.score).toBe(10);
    expect(ctx.docLookup.d1.terms).toEqual(['shepherd']);
  });

  it('marks literalHit only for literal and joined units', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'shepherd', origin: 0, form: true }, [hit()]);
    accumulate(ctx, { term: 'pastor', origin: 1 }, [hit({ id: 'd2' })]);
    expect(ctx.literalHit.d1).toBeUndefined();
    expect(ctx.literalHit.d2).toBeUndefined();
    accumulate(ctx, { term: 'flock', origin: 2, literal: true }, [hit({ id: 'd2' })]);
    expect(ctx.literalHit.d2).toBe(true);
  });

  it('carries matchedTerms deduped and capped at 12', () => {
    const ctx = accCtx();
    const terms = Array.from({ length: 15 }, (_, i) => 'w' + i);
    accumulate(ctx, { term: 'shepherd', origin: 0, literal: true }, [hit({ terms })]);
    accumulate(ctx, { term: 'shepherd', origin: 0, literal: true }, [hit({ terms: ['w0', 'w15'] })]);
    expect(ctx.matchedTerms.d1).toHaveLength(12);
    expect(ctx.matchedTerms.d1).toEqual(terms.slice(0, 12));
  });

  it('carries no matchedTerms for a synonym unit', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'pastor', origin: 0 }, [hit()]);
    expect(ctx.matchedTerms.d1).toBeUndefined();
  });

  it('carries no matchedTerms for a stop word once content was typed', () => {
    const ctx = accCtx({ contentTyped: true });
    accumulate(ctx, { term: 'the', origin: 0, literal: true }, [hit({ terms: ['the'] })]);
    expect(ctx.matchedTerms.d1).toBeUndefined();
    expect(ctx.scoreMap.d1).toBe(10);
  });

  it('sets the termMask bit per origin, or the cover when given', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'shepherd', origin: 0, literal: true }, [hit()]);
    accumulate(ctx, { term: 'flock', origin: 2, literal: true }, [hit()]);
    accumulate(ctx, { term: 'yahushua', origin: 1, joined: true, cover: 0b110 }, [hit()]);
    expect(ctx.termMask.d1).toBe(0b1 | 0b100 | 0b110);
  });

  it('skips the termMask at origin 31 and above, and for kjvOnly hits', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'shepherd', origin: 31, literal: true }, [hit()]);
    expect(ctx.termMask.d1).toBeUndefined();
    accumulate(ctx, { term: 'flock', origin: 0, literal: true }, [hit({ kjvOnly: true })]);
    expect(ctx.termMask.d1).toBeUndefined();
    expect(ctx.scoreMap.d1).toBe(20);
  });

  it('records Answers hits as [cover, terms] pairs', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'shepherd', origin: 1, literal: true }, [
      hit({ kind: 'answers', terms: ['shepherd', 'flock'] }),
      hit({ id: 'd2', kind: 'letter', terms: ['shepherd'] }),
    ]);
    expect(ctx.answersHits.d1).toEqual([[0b10, ['shepherd', 'flock']]]);
    expect(ctx.answersHits.d2).toBeUndefined();
  });

  it('adds the KJV score, times FORM_WEIGHT when kjvOnly, and sets the kjvMask', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'shepherd', origin: 0, literal: true }, [hit({ kjv: 4 })]);
    accumulate(ctx, { term: 'flock', origin: 1, form: true }, [hit({ kjv: 5, kjvOnly: true })]);
    expect(ctx.kjvScore.d1).toBeCloseTo(4 + 5 * FORM_WEIGHT * FORM_WEIGHT);
    expect(ctx.kjvMask.d1).toBe(0b11);
  });

  it('skips the kjvMask at origin 31 and above', () => {
    const ctx = accCtx();
    accumulate(ctx, { term: 'shepherd', origin: 31, literal: true }, [hit({ kjv: 4 })]);
    expect(ctx.kjvScore.d1).toBe(4);
    expect(ctx.kjvMask.d1).toBeUndefined();
  });
});

/** @returns {any} */
function makeCtx(o = {}) {
  const byTerm = o.byTerm ?? {};
  const searchUnit = vi.fn((term) => byTerm[term] ?? []);
  return {
    units: o.units ?? [{ term: 'shepherd', origin: 0, literal: true }],
    keyword: o.keyword ?? false,
    spent: o.spent ?? (() => false),
    pause: o.pause ?? (async () => null),
    eng: { searchUnit, prefixable: o.prefixable ?? true, isStopTerm },
  };
}

describe('matchWords', () => {
  it('writes the run tables and contentTyped', async () => {
    const ctx = makeCtx({
      units: [
        { term: 'shepherd', origin: 0, literal: true },
        { term: 'flock', origin: 1, literal: true },
      ],
      byTerm: { shepherd: [hit({ score: 10 })], flock: [hit({ score: 4, terms: ['flock'] })] },
    });
    expect(await matchWords(ctx)).toBeNull();
    expect(ctx.scoreMap.d1).toBe(14);
    expect(ctx.termMask.d1).toBe(0b11);
    expect(ctx.literalHit.d1).toBe(true);
    expect(ctx.matchedTerms.d1).toEqual(['shepherd', 'flock']);
    expect(ctx.contentTyped).toBe(true);
    expect(ctx.heard).toEqual({ 0: true, 1: true });
    expect(ctx.heardOwn).toEqual({ 0: true, 1: true });
    expect(ctx.unheard).toEqual([]);
  });

  it('contentTyped is false when only stop words were typed literally', async () => {
    const ctx = makeCtx({
      units: [{ term: 'the', origin: 0, literal: true }],
      byTerm: { the: [hit()] },
    });
    await matchWords(ctx);
    expect(ctx.contentTyped).toBe(false);
  });

  it('passes unitOpts: prefix only for literals, fuzzy off, AND, the config boost', async () => {
    const ctx = makeCtx({
      units: [
        { term: 'shepherd', origin: 0, literal: true },
        { term: 'shepherds', origin: 0, form: true },
      ],
      byTerm: { shepherd: [hit()], shepherds: [hit()] },
    });
    await matchWords(ctx);
    const calls = ctx.eng.searchUnit.mock.calls;
    expect(calls[0][1]).toEqual({ prefix: true, fuzzy: false, combineWith: 'AND', boost: MS_SEARCH_DEFAULTS.boost });
    expect(calls[1][1].prefix).toBe(false);
    expect(ctx.unitOpts({ term: 'x', origin: 0, literal: true }).prefix).toBe(true);
  });

  it('passes the keyword through to searchUnit', async () => {
    const ctx = makeCtx({ keyword: true, byTerm: { shepherd: [hit()] } });
    await matchWords(ctx);
    expect(ctx.eng.searchUnit.mock.calls[0][2]).toBe(true);
  });

  it('a form-only hit is heard but not heardOwn', async () => {
    const ctx = makeCtx({
      units: [{ term: 'shepherds', origin: 0, form: true }],
      byTerm: { shepherds: [hit()] },
    });
    await matchWords(ctx);
    expect(ctx.heard).toEqual({ 0: true });
    expect(ctx.heardOwn).toEqual({});
    expect(ctx.unheard).toEqual([]);
  });

  it('a literal unit that finds nothing is unheard; a form unit is not', async () => {
    const ctx = makeCtx({
      units: [
        { term: 'shepherd', origin: 0, literal: true },
        { term: 'shepherds', origin: 0, form: true },
      ],
      byTerm: {},
    });
    await matchWords(ctx);
    expect(ctx.unheard).toHaveLength(1);
    expect(ctx.unheard[0].term).toBe('shepherd');
    expect(ctx.heard).toEqual({});
  });

  it('a searchUnit throw is skipped and the run goes on', async () => {
    const ctx = makeCtx({
      units: [
        { term: 'shepherd', origin: 0, literal: true },
        { term: 'flock', origin: 1, literal: true },
      ],
    });
    ctx.eng.searchUnit.mockImplementationOnce(() => { throw new Error('index hiccup'); });
    ctx.eng.searchUnit.mockImplementation((term) => (term === 'flock' ? [hit({ score: 4 })] : []));
    expect(await matchWords(ctx)).toBeNull();
    expect(ctx.scoreMap.d1).toBe(4);
    // the throw skips the unit outright: never searched, so never unheard either
    expect(ctx.unheard).toEqual([]);
    expect(ctx.eng.searchUnit).toHaveBeenCalledTimes(2);
  });

  it('returns what pause returns when the page spent its turn', async () => {
    const ctx = makeCtx({ spent: () => true, pause: async () => 'PAUSED' });
    expect(await matchWords(ctx)).toBe('PAUSED');
    expect(ctx.eng.searchUnit).not.toHaveBeenCalled();
  });

  it('goes on when pause returns nothing', async () => {
    let calls = 0;
    const ctx = makeCtx({ spent: () => ++calls === 1, byTerm: { shepherd: [hit()] } });
    expect(await matchWords(ctx)).toBeNull();
    expect(ctx.scoreMap.d1).toBe(10);
  });
});
