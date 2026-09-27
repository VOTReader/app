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

/** @param {string} q */
const letter = (q) => {
  const p = /** @type {any} */ (parseReference(q, { corpus: 'volumes' })) || {};
  return p.kind === 'ref-letter' ? (p.anyVolume ? 'any' : p.volumeId) + ' ' + p.letterNum : p.kind;
};

describe('letters as readers name them', () => {
  it('a volume and a letter, with punctuation, words for numbers, either way round', () => {
    expect(letter('Volume Seven, Letter 55')).toBe('v7 55');
    expect(letter('Vol. 7 Letter 55')).toBe('v7 55');
    expect(letter('v7 55')).toBe('v7 55');
    expect(letter('v7:55')).toBe('v7 55');
    expect(letter('volume 7 #55')).toBe('v7 55');
    expect(letter('Volume 2, Letter 13')).toBe('v2 13');
    expect(letter('letter 55 volume 7')).toBe('v7 55');
    expect(letter('letter 55 of volume seven')).toBe('v7 55');
    expect(letter('Volume Three Letter Twenty Two')).toBe('v3 22');
    expect(letter('Volume Three Letter Twenty-Two')).toBe('v3 22');
    expect(letter('v7 preface')).toBe('v7 0');
    expect(letter('V2L5')).toBe('v2 5');
  });

  it('a collection named in words, with or without "letter", a curly apostrophe or not', () => {
    expect(letter('Timothy letter 3')).toBe('timothy 3');
    expect(letter('little flock letter 2')).toBe('flock 2');
    expect(letter('Lord’s Little Flock 2')).toBe('flock 2');
    expect(letter('Rebuke letter 1')).toBe('rebuke 1');
    expect(letter('The Lord’s Rebuke 1')).toBe('rebuke 1');
    expect(letter('blessed letter 4')).toBe('blessed 4');
  });

  it('Words To Live By with its part, or without it (Part One’s)', () => {
    expect(letter('WTLB 95')).toBe('wtlb1 95');
    expect(letter('WTLB Part One 95')).toBe('wtlb1 95');
    expect(letter('words to live by 95')).toBe('wtlb1 95');   // read Part Two: [12one two] took the space
    expect(letter('words to live by part two 12')).toBe('wtlb2 12');
    expect(letter('wtlb 1:45')).toBe('wtlb1 45');
    expect(letter('WTLB 2 12')).toBe('wtlb2 12');
  });

  it('a letter alone is every collection’s letter of that number', () => {
    expect(letter('letter 55')).toBe('any 55');
    expect(letter('letter five')).toBe('any 5');
  });

  it('words that begin like a reference stay words', () => {
    expect(letter('very good')).toBe('text');
    expect(letter('blessed are the meek')).toBe('text');
    expect(letter('vol 7')).toBe('text');
  });
});

describe('Bible references as readers type them', () => {
  it('a book misspelled, or begun and not finished, before a chapter', () => {
    expect(at('philipians 4:13')).toBe('philippians 4:13');
    expect(at('Philippines 4:13')).toBe('philippians 4:13');
    expect(at('Galations 5:22')).toBe('galatians 5:22');
    expect(at('ecclesiastics 3:1')).toBe('ecclesiastes 3:1');
    expect(at('eccles 3:1')).toBe('ecclesiastes 3:1');
    expect(at('Duet 6:4')).toBe('deuteronomy 6:4');
    expect(at('Matthews 6:33')).toBe('matthew 6:33');
    expect(at('Proverb 3:5')).toBe('proverbs 3:5');
    expect(at('Isaih 53')).toBe('isaiah 53');
    expect(at('Jerimiah 29:11')).toBe('jeremiah 29:11');
    expect(at('Habbakuk 2:4')).toBe('habakkuk 2:4');
    expect(at('Zach 4:6')).toBe('zechariah 4:6');
    expect(at('Jam 4:7')).toBe('james 4:7');
    expect(at('1 thes 4:16')).toBe('1thessalonians 4:16');
    expect(at('jhon 3:16')).toBe('john 3:16');
  });

  it('ordinals, "chapter" and "verse", a translation’s name, a verse list, a pasted dash', () => {
    expect(at('1st cor 13')).toBe('1corinthians 13');
    expect(at('2nd tim 3:16')).toBe('2timothy 3:16');
    expect(at('John chapter 3')).toBe('john 3');
    expect(at('John 3 verse 16')).toBe('john 3:16');
    expect(at('John 3:16 KJV')).toBe('john 3:16');
    expect(at('John 3:16 (NKJV)')).toBe('john 3:16');
    expect(/** @type {any} */ (parseReference('John 3:16,17'))).toMatchObject({ chapter: 3, verseStart: 16, verseEnd: 17 });
    expect(/** @type {any} */ (parseReference('Psalm 23:1–6'))).toMatchObject({ bookId: 'psalms', chapter: 23, verseStart: 1, verseEnd: 6 });
  });

  it('a word that is only near a book name stays a word', () => {
    expect(at('day 7')).toBe('text');
    expect(at('son 3')).toBe('text');
    expect(at('rome')).toBe('text');
    expect(at('vol 7', 'scriptures')).toBe('text');
  });
});
