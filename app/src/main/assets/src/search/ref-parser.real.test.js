/* References and passage names as readers type them, read against the app's own
   tables (search-data.js), from the search audit's query sets (2026-09-27). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseReference } from './ref-parser.js';

let prev;
beforeAll(async () => {
  prev = window.VotSearchData;
  // @ts-ignore -- a classic script: it sets window.VotSearchData
  await import('../../search-data.js');
});
afterAll(() => { window.VotSearchData = prev; });

/** @param {string} q @param {string} [corpus] */
const at = (q, corpus) => {
  const p = /** @type {any} */ (parseReference(q, { corpus: corpus || 'all' })) || {};
  return (p.kind === 'named-passage' || p.kind === 'ref-bible') ? p.bookId + ' ' + p.chapter + (p.verseStart ? ':' + p.verseStart : '') : p.kind;
};

describe('passage names as readers type them', () => {
  it('with "the", with or without an apostrophe (either kind), a number in digits', () => {
    expect(at('the lord\u2019s prayer')).toBe('matthew 6:9');
    expect(at('lord\u2019s prayer')).toBe('matthew 6:9');
    expect(at('the beatitudes')).toBe('matthew 5:3');
    expect(at('the ten commandments')).toBe('exodus 20:1');
    expect(at('10 commandments')).toBe('exodus 20:1');
    expect(at('noah\u2019s ark')).toBe('genesis 6');
    expect(at('the good samaritan')).toBe(at('good samaritan'));
    expect(at('parable of the prodigal son')).toBe('luke 15:11');
    expect(at('the sermon on the mount')).toBe('matthew 5');
    expect(at('fruits of the spirit')).toBe('galatians 5:22');
    expect(at('daniel in the lion\u2019s den')).toBe('daniel 6');
    expect(at('four horsemen of the apocalypse')).toBe('revelation 6');
    expect(at('whole armour of god')).toBe('ephesians 6:10');
  });

  it('a chapter typed is that chapter, not the passage a key of the same words names', () => {
    expect(at('Isaiah 7')).toBe('isaiah 7');   // the key "isaiah 7" named verse 14
    expect(at('Isaiah 9')).toBe('isaiah 9');
    expect(at('Psalm 23')).toBe('psalms 23');
    expect(/** @type {any} */ (parseReference('Psalm 23')).kind).toBe('ref-bible');
  });

  it('a passage name that begins with a book\u2019s name is still the passage', () => {
    expect(/** @type {any} */ (parseReference('mark of the beast')).kind).toBe('named-passage');
  });

  it('words that only resemble a name stay words', () => {
    expect(at('the')).toBe('text');
    expect(at('our fathers')).toBe('text');
    expect(at('the lord\u2019s prayer', 'volumes')).toBe('text');
  });
});
