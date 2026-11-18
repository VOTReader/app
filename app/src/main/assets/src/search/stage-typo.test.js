/* search/stage-typo.test.js — the typo fallback: a word nothing found, searched as its nearest spelling.
   First tests of typoFallback (stage-typo.js). The corrected search itself is real (stage-match.js
   accumulate); the spelling lookup (eng.searchCorrected / eng.formMisspelt) is a mock — the real ones
   need the MiniSearch index (engine.js:589/658). */
import { describe, it, expect, vi } from 'vitest';
import { typoFallback } from './stage-typo.js';

/* The score tables accumulate writes, as matchWords builds them. */
function makeCtx(overrides = {}) {
  return {
    unheard: [],
    heard: Object.create(null),
    heardOwn: Object.create(null),
    unitOpts: (unit) => ({ prefix: unit.literal, fuzzy: false }),
    navAlso: false,
    keyword: 'sheperd',
    spent: () => false,
    pause: async () => null,
    scoreMap: Object.create(null),
    termMask: Object.create(null),
    literalHit: Object.create(null),
    matchedTerms: Object.create(null),
    answersHits: Object.create(null),
    kjvScore: Object.create(null),
    kjvMask: Object.create(null),
    docLookup: Object.create(null),
    contentTyped: true,
    corrections: [],
    eng: {
      isStopTerm: () => false,
      searchCorrected: /** @type {any} */ (vi.fn(() => ({ res: [], to: undefined }))),
      formMisspelt: vi.fn(),
    },
    ...overrides,
  };
}

const SHEPERD = { term: 'sheperd', origin: 0, literal: true };
const SHEPHERD_HIT = [{ id: 'd1', score: 2, kind: 'verse', terms: ['shepherd'], kjv: 1 }];

describe('typoFallback', () => {
  it('does nothing under a card: navAlso means no typo guess', async () => {
    const ctx = makeCtx({ navAlso: true, unheard: [SHEPERD] });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.eng.searchCorrected).not.toHaveBeenCalled();
    expect(ctx.corrections).toEqual([]);
  });

  it('does nothing with nothing unheard', async () => {
    const ctx = makeCtx({ unheard: [] });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.eng.searchCorrected).not.toHaveBeenCalled();
    expect(ctx.corrections).toEqual([]);
  });

  it('skips a word its own forms already found (heardOwn)', async () => {
    const ctx = makeCtx({ unheard: [SHEPERD], heardOwn: { 0: true } });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.eng.searchCorrected).not.toHaveBeenCalled();
    expect(ctx.corrections).toEqual([]);
  });

  it('skips a number: "316" is not "16"', async () => {
    const ctx = makeCtx({ unheard: [{ term: '316', origin: 0, literal: true }] });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.eng.searchCorrected).not.toHaveBeenCalled();
    expect(ctx.corrections).toEqual([]);
  });

  it('returns what the page turn returns when the run is spent', async () => {
    const ctx = makeCtx({
      unheard: [SHEPERD],
      spent: () => true,
      pause: async () => 'STOPPED',
    });
    expect(await typoFallback(ctx)).toBe('STOPPED');
    expect(ctx.eng.searchCorrected).not.toHaveBeenCalled();
  });

  it('goes on when the page turn returns nothing', async () => {
    const ctx = makeCtx({
      unheard: [SHEPERD],
      spent: () => true,
      pause: async () => null,
    });
    ctx.eng.searchCorrected.mockReturnValue({ res: SHEPHERD_HIT, to: 'shepherd' });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.eng.searchCorrected).toHaveBeenCalledTimes(1);
    expect(ctx.corrections).toEqual([{ from: 'sheperd', to: 'shepherd' }]);
  });

  it('skips a word whose correction throws, and tries the next', async () => {
    const ctx = makeCtx({ unheard: [SHEPERD, { term: 'creatd', origin: 1, literal: true }] });
    ctx.eng.searchCorrected
      .mockImplementationOnce(() => { throw new Error('no index'); })
      .mockReturnValueOnce({ res: [{ id: 'd2', score: 1, kind: 'verse', terms: ['created'] }], to: 'created' });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.eng.searchCorrected).toHaveBeenCalledTimes(2);
    expect(ctx.scoreMap.d2).toBe(1);
    expect(ctx.corrections).toEqual([{ from: 'creatd', to: 'created' }]);
  });

  it('an empty correction finds nothing and reports nothing', async () => {
    const ctx = makeCtx({ unheard: [SHEPERD] });
    ctx.eng.searchCorrected.mockReturnValue({ res: [], to: 'shepherd' });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.scoreMap).toEqual(Object.create(null));
    expect(ctx.corrections).toEqual([]);
  });

  it('adds what the corrected word finds to the score tables, and reports the correction', async () => {
    const ctx = makeCtx({ unheard: [SHEPERD] });
    ctx.eng.searchCorrected.mockReturnValue({ res: SHEPHERD_HIT, to: 'shepherd' });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.scoreMap.d1).toBe(2);
    expect(ctx.termMask.d1).toBe(1);
    expect(ctx.literalHit.d1).toBe(true);
    expect(ctx.matchedTerms.d1).toEqual(['shepherd']);
    expect(ctx.kjvScore.d1).toBe(1);
    expect(ctx.kjvMask.d1).toBe(1);
    expect(ctx.docLookup.d1).toEqual(SHEPHERD_HIT[0]);
    expect(ctx.corrections).toEqual([{ from: 'sheperd', to: 'shepherd' }]);
  });

  it('reports no correction when the nearest spelling is the typed word', async () => {
    const ctx = makeCtx({ unheard: [SHEPERD] });
    ctx.eng.searchCorrected.mockReturnValue({ res: SHEPHERD_HIT, to: 'sheperd' });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.scoreMap.d1).toBe(2);
    expect(ctx.corrections).toEqual([]);
  });

  it('reports no correction when the typed word is more than one token', async () => {
    const ctx = makeCtx({ unheard: [{ term: 'shep herd', origin: 0, literal: true }] });
    ctx.eng.searchCorrected.mockReturnValue({ res: SHEPHERD_HIT, to: 'shepherd' });
    expect(await typoFallback(ctx)).toBeNull();
    expect(ctx.scoreMap.d1).toBe(2);
    expect(ctx.corrections).toEqual([]);
  });

  it('passes an accept callback when the word was heard, so its forms count as misspellings', async () => {
    const ctx = makeCtx({ unheard: [SHEPERD], heard: { 0: true } });
    ctx.eng.searchCorrected.mockReturnValue({ res: SHEPHERD_HIT, to: 'shepherd' });
    await typoFallback(ctx);
    const accept = ctx.eng.searchCorrected.mock.calls[0][3];
    expect(typeof accept).toBe('function');
    accept('shepherd');
    expect(ctx.eng.formMisspelt).toHaveBeenCalledWith(['sheperd'], 'shepherd');
  });

  it('passes no accept callback when the word was never heard', async () => {
    const ctx = makeCtx({ unheard: [SHEPERD], heard: Object.create(null) });
    ctx.eng.searchCorrected.mockReturnValue({ res: SHEPHERD_HIT, to: 'shepherd' });
    await typoFallback(ctx);
    expect(ctx.eng.searchCorrected.mock.calls[0][3]).toBeUndefined();
  });

  it('searches with the unit options the match stage built', async () => {
    const unitOpts = vi.fn(() => ({ prefix: true, fuzzy: false }));
    const ctx = makeCtx({ unheard: [SHEPERD], unitOpts });
    ctx.eng.searchCorrected.mockReturnValue({ res: [], to: undefined });
    await typoFallback(ctx);
    expect(unitOpts).toHaveBeenCalledWith(SHEPERD);
    expect(ctx.eng.searchCorrected).toHaveBeenCalledWith(
      'sheperd', { prefix: true, fuzzy: false }, 'sheperd', undefined,
    );
  });
});
