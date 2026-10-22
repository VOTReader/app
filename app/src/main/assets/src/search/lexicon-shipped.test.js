// @ts-nocheck — reads the shipped lexicon file with node's fs.
/* The substitution lexicon the app ships (search-lexicon.json, tools/build-wordnet-lex.mjs; search200 B7): WordNet's
   pairs, both words held by the corpus, each credit a close or a loose link's. Reads the shipped file. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLexicon } from './lexicon.js';
import { lemma } from './passage.js';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../search-lexicon.json');
const J = JSON.parse(readFileSync(FILE, 'utf8'));
const LEX = parseLexicon(J.lexicon);
const credit = (/** @type {string} */ a, /** @type {string} */ b) => LEX.get(lemma(a))?.get(lemma(b)) || 0;

describe('the shipped lexicon (search-lexicon.json)', () => {
  it("is WordNet's, and carries WordNet's license whole, its copyright and disclaimer", () => {
    expect(J.name).toBe('wordnet');
    expect(J.source).toMatch(/WordNet 3\.1, Princeton University/);
    expect(J.license).toContain('WordNet 3.1 Copyright 2011 by Princeton University.  All rights reserved.');
    expect(J.license).toContain('THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS"');
    expect(J.license).toContain('Princeton University and LICENSEE agrees to preserve same.');
  });

  it('holds the pairs it counts, every one keyed by a lemma of plain letters, read both ways', () => {
    let directed = 0;
    for (const [k, m] of LEX) {
      expect(k).toMatch(/^[a-z]+$/);
      for (const [p, s] of m) {
        directed++;
        expect(LEX.get(p)?.get(k)).toBe(s);
      }
    }
    expect(directed).toBe(2 * J.pairs);
    expect(J.pairs).toBeGreaterThan(5000);
  });

  it('credits only a close link (0.7 a synset, 0.6 a similar-to link) or a loose one (0.5): never a form\'s 0.9', () => {
    const seen = new Set();
    for (const m of LEX.values()) for (const s of m.values()) seen.add(s);
    expect([...seen].sort()).toEqual([0.5, 0.6, 0.7]);
  });

  it('knows the trades readers make: creator for maker (a synset), wide for broad, tread for walk (a kind of it)', () => {
    expect(credit('creator', 'maker')).toBe(0.7);
    expect(credit('maker', 'creator')).toBe(0.7);
    expect(credit('wide', 'broad')).toBeGreaterThanOrEqual(0.6);
    expect(credit('tread', 'walk')).toBe(0.5);
  });

  it('gives no partner to a stop word, nor to "not" through note (a lemma that stands for two words)', () => {
    for (const w of ['the', 'and', 'unto', 'shall', 'not', 'never', 'him']) expect(LEX.get(lemma(w))).toBeUndefined();
    for (const m of LEX.values()) expect(m.has('not')).toBe(false);
  });
});
