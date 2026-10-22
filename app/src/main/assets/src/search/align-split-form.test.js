/* A WORD TYPED FOR TWO, IN ANOTHER FORM (search200 fix1). align.js reads a typed word a text spells as two words
   ("any thing" for anything), but only when the two spell the typed word exactly: a reader typing a compound in
   another form than the text's two words ("stouthearted" for "of a stout heart") left the heaviest typed word unmet.
   The two words spell the typed word's lemma now too, for a typed word of six letters or more. Fixture texts only
   (no bench query). */
import { describe, it, expect } from 'vitest';
import { alignScore, alignClasses, alignWeights, alignMet } from './align.js';
import { kjvEncode } from './tokenize.js';

const STOP = new Set('the a an and or of to for you your he his is be in into before goes'.split(' '));
const TEXTS = [
  'Be of good courage, you of stout heart, for the LORD goes before you into the land.',
  'The stout ox treads the grain, and the heart of the farmer is glad.',
  'Go up into the land, for the LORD has given it to you.',
  'Be of good courage, and let your heart be strong.',
];
const toks = (/** @type {string} */ s) => kjvEncode(s);
const DF = new Map();
for (const t of TEXTS) for (const w of new Set(toks(t))) DF.set(w, (DF.get(w) || 0) + 1);
const df = (/** @type {string} */ w) => DF.get(w) || 0;
const align = (/** @type {string} */ q, /** @type {string} */ text) => {
  const words = toks(q);
  const cls = alignClasses(words, { stop: STOP });
  const w = alignWeights(words, df, TEXTS.length);
  const t = toks(text);
  const a = alignScore(t, words, w, cls);
  return { a, met: alignMet(t, a.start, a.end, w, cls), words };
};

describe('a typed compound the text spells as two words in another form', () => {
  it('"stouthearted" is met by "stout heart"', () => {
    const { a, met, words } = align('be of good courage you stouthearted for the lord goes before you', TEXTS[0]);
    expect(met[words.indexOf('stouthearted') + 1]).toBe(1);
    expect(a.cov).toBeGreaterThanOrEqual(0.9);
  });

  it('the two words apart are no compound', () => {
    const { met, words } = align('the stouthearted farmer', TEXTS[1]);
    expect(met[words.indexOf('stouthearted') + 1]).toBe(0);
  });
});
