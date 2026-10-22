/* align.js with a substitution lexicon (search200 B7): a typed word meets the word a reader traded it for at the
   pair's credit, and nothing else changes. Fixture pairs and texts written for this test (no bench query, no
   shipped lexicon: lexicon-shipped.test.js reads that one). Pure: every case builds its own classes, so the cases
   pass in any order. */
import { describe, it, expect } from 'vitest';
import { alignScore, alignClasses, alignWeights, ALIGN } from './align.js';
import { parseLexicon } from './lexicon.js';
import { kjvEncode } from './tokenize.js';

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being '
  + 'have has had do does did as if than then so yet him his her he she they their them we our you your it its i me my us no all').split(' '));
const SYN = { joy: ['joy', 'gladness'], gladness: ['joy', 'gladness'] };
/** The fixture lexicon: keys are light lemmas (passage.js), as the builders write them. */
const LEX = parseLexicon('creator maker7\ntread walk5\nwid broad6');

const toks = (/** @type {string} */ s) => kjvEncode(s);
const TEXTS = [
  'Yet they rebel against their Maker and take no part with the poor, though He made them all.',
  'Their part is taken: they rebel, the poor rebel against them, and their works are made against all.',
  'Yet they rebel against their Creator and take no part with the poor, though the Maker of all sees them.',
  'The children of the plain walk the broad road, and the gate is wide that leads to it.',
];
const DF = new Map();
for (const t of TEXTS) for (const w of new Set(toks(t))) DF.set(w, (DF.get(w) || 0) + 1);
const df = (/** @type {string} */ w) => DF.get(w) || 0;

/** cov of a typed query against a text, with or without a lexicon, fresh classes every time */
function align(/** @type {string} */ q, /** @type {string} */ text, /** @type {any} */ lexicon = undefined) {
  const words = toks(q);
  const classes = alignClasses(words, { stop: STOP, synonyms: SYN, lexicon });
  return alignScore(toks(text), words, alignWeights(words, df, TEXTS.length), classes);
}
/** The credit typed word `pos` (0-based) earns from text token `tok`. */
function credit(/** @type {any} */ cls, /** @type {any} */ tok, /** @type {number} */ pos) {
  const e = cls.entry(tok);
  for (let k = 0; k < e.c.length; k += 2) if (e.c[k] === pos + 1) return e.c[k + 1];
  return 0;
}

describe('alignClasses: a lexicon pair as a substitution credit', () => {
  const words = toks('they rebel against their creator and walk for joy');
  const without = alignClasses(words, { stop: STOP, synonyms: SYN });
  const withLex = alignClasses(words, { stop: STOP, synonyms: SYN, lexicon: LEX });

  it('a typed word meets its partner at the pair credit only with the lexicon, in any of its forms', () => {
    expect(credit(without, 'maker', 4)).toBe(0);
    expect(credit(withLex, 'maker', 4)).toBe(0.7);
    expect(credit(withLex, 'makers', 4)).toBe(0.7);
    expect(credit(withLex, 'treadeth', 6)).toBe(0.5);
  });

  it('a lexicon never lowers what align.js already credits: the word itself, a form, a SYNONYM_MAP group', () => {
    expect(credit(withLex, 'creator', 4)).toBe(1);
    expect(credit(withLex, 'walked', 6)).toBe(ALIGN.FORM);
    const low = alignClasses(words, { stop: STOP, synonyms: SYN, lexicon: parseLexicon('gladness joy5') });
    expect(credit(low, 'gladness', 8)).toBe(ALIGN.SYNONYM);
    const high = alignClasses(words, { stop: STOP, synonyms: SYN, lexicon: parseLexicon('gladness joy8') });
    expect(credit(high, 'gladness', 8)).toBe(0.8);
  });

  it('stop words earn nothing through a lexicon, typed or in the text', () => {
    const stopLex = parseLexicon('because for7\nalongside with7');
    const cls = alignClasses(toks('walk for joy alongside them'), { stop: STOP, synonyms: SYN, lexicon: stopLex });
    expect(credit(cls, 'because', 1)).toBe(0);
    expect(credit(cls, 'with', 3)).toBe(0);
  });

  it("a partner's words open a window only as lexAnchor, never as the typed word's own anchor", () => {
    expect(withLex.anchor[4].has('maker')).toBe(false);
    expect(withLex.lexAnchor[4].has('maker')).toBe(true);
    expect(withLex.lexAnchor[4].has('creator')).toBe(false);
    expect(without.lexAnchor[4].size).toBe(0);
    // a stop word has no partners
    expect(withLex.lexAnchor[0].size).toBe(0);
  });

  it('works on a token store (ids), as the engine runs it', () => {
    const vocab = ['they', 'rebel', 'against', 'their', 'creator', 'maker', 'makers'];
    const ids = new Map(vocab.map((w, i) => [w, i]));
    const cls = alignClasses(toks('they rebel against their creator'), {
      stop: STOP, lexicon: LEX, id: (w) => ids.get(w), word: (x) => vocab[x],
    });
    expect(credit(cls, ids.get('makers'), 4)).toBe(0.7);
    expect(cls.lexAnchor[4].has(ids.get('maker'))).toBe(true);
  });
});

describe('alignScore with a lexicon', () => {
  const Q = 'yet they rebel against their creator and take no part with the poor';

  it('the text a reader swapped one word of holds the quote with the lexicon, and a distractor still does not', () => {
    const a0 = align(Q, TEXTS[0]).cov;
    const a = align(Q, TEXTS[0], LEX).cov;
    const b = align(Q, TEXTS[1], LEX).cov;
    expect(a).toBeGreaterThan(a0);
    expect(a).toBeGreaterThanOrEqual(0.9);
    expect(b).toBeLessThanOrEqual(0.5);
  });

  it('a text holding the quote as typed scores exactly as it does with no lexicon, though it says a partner too', () => {
    const off = align(Q, TEXTS[2]);
    const on = align(Q, TEXTS[2], LEX);
    expect(on.cov).toBe(off.cov);
    expect(on.cov).toBe(1);
    expect([on.start, on.end]).toEqual([off.start, off.end]);
  });

  it('two words traded at once (walk the broad road for tread the wide road) both earn their credit', () => {
    const q = 'the children of the plain tread the wide road';
    const off = align(q, TEXTS[3]).cov;
    const on = align(q, TEXTS[3], LEX).cov;
    // over the line where the engine reads a text as holding the quote (engine.js ALIGN_HELD), from under it
    expect(off).toBeLessThan(0.75);
    expect(on).toBeGreaterThanOrEqual(0.75);
  });

  it('an empty lexicon, or a list of them, is no lexicon', () => {
    expect(align(Q, TEXTS[0], new Map()).cov).toBe(align(Q, TEXTS[0]).cov);
    expect(align(Q, TEXTS[0], [LEX, null]).cov).toBe(align(Q, TEXTS[0], LEX).cov);
  });
});
