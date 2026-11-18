/* search/stage-units.test.js — the search units: the words of a text query, each with what it is searched as too.
   First tests of searchUnits (stage-units.js). Synonyms and word forms run real (synonyms.js,
   word-forms.js, numbers.js, tokenize.js); the index checks (eng.termExists) and the name tables
   (eng.restoredNameOf, eng.NAME_FORMS) are fakes — the real ones need the index and engine.js.
   NAME_FORMS pinned from engine.js:1223-1229; restoredNameOf is the engine.js:1243 rule, copied. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchUnits } from './stage-units.js';

const NAME_FORMS = {
  yahushua: ['jesus'], yeshua: ['yahushua', 'jesus'], yahshua: ['yahushua', 'jesus'], yahusha: ['yahushua', 'jesus'],
  jesus: ['yahushua'],
  hamashiach: ['christ', 'mashiach'], mashiach: ['hamashiach', 'christ'], christ: ['hamashiach', 'mashiach'],
  yahuwah: ['lord', 'god'], yahweh: ['yahuwah', 'lord', 'god'], yhwh: ['yahuwah', 'lord', 'god'],
  jehovah: ['yahuwah', 'lord', 'god'], yahuah: ['yahuwah', 'lord', 'god'],
};

function restoredNameOf(t) {
  if (t.length > 4 && t.endsWith('s') && !NAME_FORMS[t]) {
    const n = t.slice(0, -1);
    if (n !== 'jesus' && n !== 'christ' && NAME_FORMS[n]) return n;
  }
  return t;
}

/**
 * @param {{ filtered: string[], phrase?: string | null, synonyms?: boolean,
 *   termExists?: (t: string) => boolean, stopWords?: string[] }} opts
 */
function makeCtx({ filtered, phrase = null, synonyms = false, termExists = () => false, stopWords = [] }) {
  return {
    p: { phrase },
    filtered,
    options: { synonyms },
    D: { STOP_WORDS_TRIMMED: new Set(stopWords) },
    eng: { termExists: vi.fn(termExists), restoredNameOf, NAME_FORMS },
  };
}

afterEach(() => {
  delete window.VotSearchData;
});

describe('searchUnits', () => {
  it('a phrase is one literal unit, and nothing expands', () => {
    const ctx = makeCtx({ filtered: ['god', 'is', 'love'], phrase: 'god is love' });
    searchUnits(ctx);
    expect(ctx.units).toEqual([{ term: 'god is love', origin: 0, literal: true }]);
    expect(ctx.didExpand).toBe(false);
  });

  it('a word with no forms, synonyms or names is one literal unit, and nothing expands', () => {
    const ctx = makeCtx({ filtered: ['god'] });
    searchUnits(ctx);
    expect(ctx.units).toEqual([{ term: 'god', origin: 0, literal: true }]);
    expect(ctx.didExpand).toBe(false);
  });

  it('synonyms off by default in jsdom: no search-data bundle, so no expansion', () => {
    const ctx = makeCtx({ filtered: ['god'], synonyms: true });
    searchUnits(ctx);
    expect(ctx.units).toEqual([{ term: 'god', origin: 0, literal: true }]);
    expect(ctx.didExpand).toBe(false);
  });

  it('synonyms on with a bundle: each synonym is a non-literal unit under its word', () => {
    window.VotSearchData = { SYNONYM_MAP: { god: ['lord', 'deity'] } };
    const ctx = makeCtx({ filtered: ['god'], synonyms: true });
    searchUnits(ctx);
    expect(ctx.units).toEqual([
      { term: 'god', origin: 0, literal: true },
      { term: 'lord', origin: 0, literal: false },
      { term: 'deity', origin: 0, literal: false },
    ]);
    expect(ctx.didExpand).toBe(true);
  });

  it('a one-word literal adds its family as form units under the same origin', () => {
    const ctx = makeCtx({ filtered: ['prayed'] });
    searchUnits(ctx);
    expect(ctx.units).toEqual([
      { term: 'prayed', origin: 0, literal: true },
      { term: 'pray', origin: 0, literal: false, form: true },
      { term: 'prays', origin: 0, literal: false, form: true },
      { term: 'praying', origin: 0, literal: false, form: true },
      { term: 'prayeth', origin: 0, literal: false, form: true },
      { term: 'prayest', origin: 0, literal: false, form: true },
      { term: 'praye', origin: 0, literal: false, form: true },
      { term: 'prayes', origin: 0, literal: false, form: true },
    ]);
    expect(ctx.didExpand).toBe(true);
  });

  it('a name typed in parts is searched as the one word too, covering both', () => {
    const ctx = makeCtx({ filtered: ['ha', 'mashiach'], termExists: (t) => t === 'hamashiach' });
    searchUnits(ctx);
    expect(ctx.units).toEqual([
      { term: 'ha', origin: 0, literal: true },
      { term: 'mashiach', origin: 1, literal: true },
      { term: 'hamashiach', origin: 0, cover: 3, literal: false, joined: true },
    ]);
    expect(ctx.didExpand).toBe(true);
  });

  it('a joined name is not made from a stop word: "in deed" is not "indeed"', () => {
    const ctx = makeCtx({ filtered: ['in', 'deed'], termExists: () => true, stopWords: ['in', 'deed'] });
    searchUnits(ctx);
    expect(ctx.units).toEqual([
      { term: 'in', origin: 0, literal: true },
      { term: 'deed', origin: 1, literal: true },
    ]);
    expect(ctx.didExpand).toBe(false);
  });

  it('a joined name under five letters is not made: "go do" is not "godo"', () => {
    const ctx = makeCtx({ filtered: ['go', 'do'], termExists: () => true });
    searchUnits(ctx);
    expect(ctx.units).toEqual([
      { term: 'go', origin: 0, literal: true },
      { term: 'do', origin: 1, literal: true },
    ]);
    expect(ctx.didExpand).toBe(false);
  });

  it('His names: a typed name is searched as its other forms too, under its own word', () => {
    const ctx = makeCtx({ filtered: ['yahushua'], termExists: (t) => t === 'jesus' });
    searchUnits(ctx);
    expect(ctx.units).toEqual([
      { term: 'yahushua', origin: 0, literal: true },
      { term: 'jesus', origin: 0, literal: false, joined: true },
    ]);
    expect(ctx.didExpand).toBe(true);
  });

  it('His names: a possessive without its apostrophe is restored first ("yahushuas" is yahushua)', () => {
    const ctx = makeCtx({ filtered: ['yahushuas'], termExists: (t) => t === 'jesus' });
    searchUnits(ctx);
    expect(ctx.units).toContainEqual({ term: 'yahushua', origin: 0, literal: false, form: true });
    expect(ctx.units).toContainEqual({ term: 'jesus', origin: 0, literal: false, joined: true });
    expect(ctx.didExpand).toBe(true);
  });

  it('a number typed in words is searched as its digits too: "six hundred sixty six" is 666', () => {
    const ctx = makeCtx({ filtered: ['six', 'hundred', 'sixty', 'six'], termExists: (t) => t === '666' });
    searchUnits(ctx);
    expect(ctx.units).toContainEqual({ term: 'six', origin: 0, literal: true });
    expect(ctx.units).toContainEqual({ term: 'hundred', origin: 1, literal: true });
    expect(ctx.units).toContainEqual({ term: 'sixty', origin: 2, literal: true });
    expect(ctx.units).toContainEqual({ term: '666', origin: 0, cover: 15, literal: false, joined: true });
    expect(ctx.didExpand).toBe(true);
  });

  it('a number typed in words is searched as its digits too: "twenty four" is 24', () => {
    const ctx = makeCtx({ filtered: ['twenty', 'four'], termExists: (t) => t === '24' });
    searchUnits(ctx);
    expect(ctx.units).toContainEqual({ term: 'twenty', origin: 0, literal: true });
    expect(ctx.units).toContainEqual({ term: 'four', origin: 1, literal: true });
    expect(ctx.units).toContainEqual({ term: '24', origin: 0, cover: 3, literal: false, joined: true });
    expect(ctx.didExpand).toBe(true);
  });

  it('a number the index does not hold is not searched as digits', () => {
    const ctx = makeCtx({ filtered: ['six', 'hundred', 'sixty', 'six'], termExists: () => false });
    searchUnits(ctx);
    expect(ctx.units).not.toContainEqual(expect.objectContaining({ term: '666' }));
    expect(ctx.didExpand).toBe(true); // the word forms still expanded
  });
});
