/**
 * tools/search-bench/classes.test.js — tests for tools/search-bench/classes.mjs.
 *
 * makeClasses is directly testable: a small synthetic corpus (7 verse docs,
 * 7 prose units) plus a 21-unit corpus for containers, whose rare-word rule
 * needs more than 20 units before a word held by two units counts as rare.
 * nearCopies / versesNear read globalThis.VotSearchData.STOP_WORDS_TRIMMED,
 * stubbed here as a Set of the common words.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeClasses } from './classes.mjs';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'i', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'not', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'with', 'through', 'says', 'will', 'you', 'he', 'she', 'it', 'we', 'they', 'at', 'him', 'unto', 'when', 'but', 'as', 'by', 'on', 'from', 'have', 'has', 'had', 'no', 'so', 'if', 'then', 'than', 'there', 'here', 'all', 'any', 'them']);

const LUKE79 = 'When Jesus heard these things, he marvelled at him, and turned him about, and said unto the people that followed him, I say unto you, I have not found so great faith, no, not in Israel.';
const JOHN316 = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
const MATT53 = 'Blessed are the poor in spirit: for theirs is the kingdom of heaven.';
const EZRA = 'The whole congregation together was forty and two thousand three hundred and threescore.';
const SENTENCE = 'Do not fear the days ahead, for I am with you and I will keep you through the fire and the flood, says the Lord.';
const NEAR_SENTENCE = 'Do not fear the days ahead, for I am with you and I will keep you through the fire and the waters, says the Lord.';
const SCATTERED = [
  'do not fear', 'fear the days', 'days ahead for', 'ahead for i', 'for i am', 'i am with', 'am with you', 'with you and', 'you and i', 'and i will', 'i will keep', 'will keep you', 'keep you through', 'you through the', 'through the fire', 'the fire and', 'fire and the', 'and the flood', 'the flood says', 'flood says the', 'says the lord',
].join(' zxq zxq zxq zxq zxq ');

const D = [
  { kind: 'verse', volumeId: 'bible', bookId: 'luke', chapterNum: 7, verseNum: 9, text: LUKE79 },
  { kind: 'verse', volumeId: 'bible', bookId: 'john', chapterNum: 3, verseNum: 16, text: JOHN316 },
  { kind: 'verse', volumeId: 'bible', bookId: 'matthew', chapterNum: 5, verseNum: 3, text: MATT53 },
  { kind: 'verse', volumeId: 'matthew-study', bookId: 'matthew', chapterNum: 5, verseNum: 3, text: MATT53 },
  { kind: 'verse', volumeId: 'bible', bookId: 'john', chapterNum: 11, verseNum: 35, text: 'Jesus wept.' },
  { kind: 'verse', volumeId: 'bible', bookId: 'ezra', chapterNum: 2, verseNum: 64, text: EZRA },
  { kind: 'verse', volumeId: 'bible', bookId: 'nehemiah', chapterNum: 7, verseNum: 66, text: EZRA },
];
const KJV = {
  luke: { 7: [{ n: 9, text: LUKE79 }] },
  john: { 3: [{ n: 16, text: JOHN316 }] },
  ezra: { 2: [{ n: 64, text: EZRA }] },
  nehemiah: { 7: [{ n: 66, text: EZRA }] },
};
const B = [
  { uk: 'v1/a', idx: 0, type: 'p', text: SENTENCE, title: 'A Letter of Comfort' },
  { uk: 'v1/a', idx: 1, type: 'p', text: 'Walk in the light and do not turn aside.', title: 'A Letter of Comfort' },
  { uk: 'v1/b', idx: 0, type: 'p', text: SENTENCE, title: 'A Letter of Comfort' },
  { uk: 'v3/b', idx: 0, type: 'p', text: NEAR_SENTENCE, title: 'A Near Echo' },
  { uk: 'v3/c', idx: 0, type: 'p', text: SCATTERED, title: 'Scattered Echo' },
  { uk: 'answers/c', idx: 0, type: 'p', text: 'The Religions of Men Are an Abomination to The Lord', title: 'The Religions of Men Are an Abomination to The Lord' },
  { uk: 'answers/c', idx: 1, type: 'p', text: '~ [From "The Truth Absolute" ~ Volume 3]', title: 'The Religions of Men Are an Abomination to The Lord' },
  { uk: 'answers/c', idx: 2, type: 'p', text: 'A short reprinted passage here.', title: 'The Religions of Men Are an Abomination to The Lord' },
  { uk: 'answers/c', idx: 3, type: 'p', text: '✦', title: 'The Religions of Men Are an Abomination to The Lord' },
  { uk: 'v3/d', idx: 0, type: 'p', text: 'The Truth Absolute is the whole counsel of God.', title: 'The Truth Absolute' },
  { uk: 'bible-studies/lamb-1', idx: 0, type: 'p', text: 'The Lamb of God takes away the sin of the world.', title: 'Lamb of God — Without Spot or Blemish' },
];

let C;
beforeEach(() => {
  globalThis.VotSearchData = { STOP_WORDS_TRIMMED: STOP };
  C = makeClasses({ D, B, KJV });
});
afterEach(() => { delete globalThis.VotSearchData; });

describe('tables', () => {
  it('proseKeys in first-seen block order; unitDoc holds the verse docs', () => {
    expect(C.proseKeys).toEqual(['v1/a', 'v1/b', 'v3/b', 'v3/c', 'answers/c', 'v3/d', 'bible-studies/lamb-1']);
    expect(C.unitDoc['bible/luke:7:9'].text).toBe(LUKE79);
    expect(C.unitBlocks['v1/a']).toHaveLength(2);
  });
  it('verseNorm holds the D verses and the KJV wordings, and drops verses under 8 words', () => {
    expect(C.verseNorm).toHaveLength(10);
    expect(C.verseNorm.map(([k]) => k)).not.toContain('bible/john:11:35');
    expect(C.verseNorm.filter(([k]) => k === 'bible/luke:7:9')).toHaveLength(2);
  });
  it('titleNorm files a unit under its title, and a study chapter under its chapter title too', () => {
    expect(C.titleNorm[' a letter of comfort ']).toEqual(['v1/a', 'v1/b']);
    expect(C.titleNorm[' the truth absolute ']).toEqual(['v3/d']);
    expect(C.titleNorm[' without spot or blemish ']).toEqual(['bible-studies/lamb-1']);
    expect(C.titleNorm[' lamb of god without spot or blemish ']).toEqual(['bible-studies/lamb-1']);
  });
});

describe('TIER / matthewTwin / key kinds', () => {
  it('tiers: bible, matthew-study, v1-7, timothy, flock, rebuke 0; wtlb 1; holydays 2; bible-studies 3; answers and the rest 4', () => {
    expect(C.TIER('bible/john:3:16')).toBe(0);
    expect(C.TIER('matthew-study/matthew:5:3')).toBe(0);
    expect(C.TIER('v1/a')).toBe(0);
    expect(C.TIER('timothy/x')).toBe(0);
    expect(C.TIER('flock/x')).toBe(0);
    expect(C.TIER('rebuke/x')).toBe(0);
    expect(C.TIER('wtlb1/x')).toBe(1);
    expect(C.TIER('wtlb2/x')).toBe(1);
    expect(C.TIER('blessed/x')).toBe(1);
    expect(C.TIER('holydays/x')).toBe(2);
    expect(C.TIER('bible-studies/x')).toBe(3);
    expect(C.TIER('answers/x')).toBe(4);
    expect(C.TIER('unknown/x')).toBe(4);
  });
  it('matthewTwin pairs plain Matthew with the study, either way round; other keys twin to themselves', () => {
    expect(C.matthewTwin('bible/matthew:5:3')).toEqual(['bible/matthew-plain:5:3', 'matthew-study/matthew:5:3']);
    expect(C.matthewTwin('matthew-study/matthew:5:3')).toEqual(['bible/matthew-plain:5:3', 'matthew-study/matthew:5:3']);
    expect(C.matthewTwin('bible/matthew-plain:5:3')).toEqual(['bible/matthew-plain:5:3', 'matthew-study/matthew:5:3']);
    expect(C.matthewTwin('bible/luke:7:9')).toEqual(['bible/luke:7:9']);
  });
  it('isVerseKey / isLetterKey', () => {
    expect(C.isVerseKey('bible/john:3:16')).toBe(true);
    expect(C.isVerseKey('matthew-study/matthew:5:3')).toBe(true);
    expect(C.isVerseKey('v1/a')).toBe(false);
    expect(C.isLetterKey('v1/a')).toBe(true);
    expect(C.isLetterKey('timothy/x')).toBe(true);
    expect(C.isLetterKey('answers/x')).toBe(false);
  });
});

describe('holders', () => {
  it('a sentence held word for word, and a near copy holding 80% of its 3-grams in one window', () => {
    expect(C.holders(SENTENCE)).toEqual(['v1/a', 'v1/b', 'v3/b']);
  });
  it('the same 3-grams scattered across a long text, never five words in a row, are not a holder', () => {
    expect(C.holders(SENTENCE)).not.toContain('v3/c');
  });
  it('a short sentence under 5 words is judged verbatim only', () => {
    expect(C.holders('fear the days')).toEqual(['v1/a', 'v1/b', 'v3/b', 'v3/c']);
    expect(C.holders('fear days ahead')).toEqual([]);
  });
});

describe('versesQuoted / versesNear', () => {
  it('a sentence quoting a verse word for word, with His name restored from YahuShua', () => {
    expect(C.versesQuoted('When YahuShua heard these things, he marvelled at him and turned him about')).toContain('bible/luke:7:9');
  });
  it('a verse the sentence holds whole is quoted too', () => {
    expect(C.versesQuoted(LUKE79 + ' And so it was.')).toContain('bible/luke:7:9');
  });
  it('a near quote, two stop words changed, is near but not quoted', () => {
    const near = 'When Jesus heard these things, he marvelled at them but turned him about and said';
    expect(C.versesNear(near)).toContain('bible/luke:7:9');
    expect(new Set(C.versesNear(near)).size).toBe(1);
    expect(C.versesQuoted(near)).not.toContain('bible/luke:7:9');
  });
  it('an unrelated sentence quotes nothing', () => {
    expect(C.versesQuoted('The quick brown fox jumps over the lazy dog near the river bank today')).toEqual([]);
    expect(C.versesNear('The quick brown fox jumps over the lazy dog near the river bank today')).toEqual([]);
  });
});

describe('nearCopies', () => {
  it('a sentence held with one word changed, found at its rarest words', () => {
    expect([...C.nearCopies(SENTENCE)].sort()).toEqual(['v1/a', 'v1/b', 'v3/b']);
  });
  it('an unrelated sentence has no near copy', () => {
    expect([...C.nearCopies('The quick brown fox jumps over the lazy dog near the river bank today')]).toEqual([]);
  });
});

describe('containers', () => {
  it('a unit holding 80% of a whole-text target, found at its rare words', () => {
    const targetText = 'the shepherd gathers the flock at dawn beside still waters and calls each lamb by name';
    const Bc = [
      { uk: 'v1/a', idx: 0, type: 'p', text: targetText, title: 'Target' },
      { uk: 'v1/b', idx: 0, type: 'p', text: targetText + ' and the flock follows', title: 'Container' },
    ];
    for (let i = 0; i < 19; i++) Bc.push({ uk: `v9/f${i}`, idx: 0, type: 'p', text: `zx${i}qw alpha${i} beta${i} gamma${i} delta${i} epsilon${i} zeta${i} eta${i}`, title: `Filler ${i}` });
    const Cc = makeClasses({ D: [], B: Bc, KJV: {} });
    expect(Cc.containers('v1/a')).toEqual(['v1/b']);
    expect(Cc.containers('v9/f0')).toEqual([]);
    expect(Cc.containers('answers/nope')).toEqual([]);
  });
});

describe('sectionOf', () => {
  it('an Answers heading over one cited excerpt names the cited text', () => {
    expect(C.sectionOf({ uk: 'answers/c', blockIdx: 0, sentence: 'The Religions of Men Are an Abomination to The Lord' }))
      .toEqual({ key: 'v3/d', text: ' a short reprinted passage here ' });
  });
  it('no cite line, or a heading that is not a block, is no section', () => {
    expect(C.sectionOf({ uk: 'v3/d', blockIdx: 0, sentence: 'The Truth Absolute is the whole counsel of God.' })).toBeNull();
    expect(C.sectionOf({ uk: 'answers/c', blockIdx: 2, sentence: 'A short reprinted passage here.' })).toBeNull();
    expect(C.sectionOf({ uk: 'answers/c', blockIdx: 0, sentence: 'x'.repeat(161) })).toBeNull();
  });
  it('CITE_LINE reads the cited title and volume', () => {
    const m = C.CITE_LINE.exec('~ [From "The Truth Absolute" ~ Volume 3]');
    expect(m[1]).toBe('The Truth Absolute');
    expect(m[2]).toBe('Volume 3');
    expect(C.CITE_LINE.test('~ [From "The Truth Absolute" ~ Volume 3]')).toBe(true);
  });
});

describe('classOf', () => {
  it('a verse target: its Matthew twins, tier 0', () => {
    const c = C.classOf({ level: 'verse', uk: 'bible/matthew:5:3' });
    expect([...c.members].sort()).toEqual(['bible/matthew-plain:5:3', 'matthew-study/matthew:5:3']);
    expect(c.best).toBe(0);
    expect(c.recurring).toBe(false);
    expect(c.near.size).toBe(0);
  });
  it('a verse target: a parallel verse answers as a near member', () => {
    const c = C.classOf({ level: 'verse', uk: 'bible/ezra:2:64', q: 'the whole congregation together was forty and two thousand', ref: 'Ezra 2:64' });
    expect(c.members.has('bible/ezra:2:64')).toBe(true);
    expect(c.members.has('bible/nehemiah:7:66')).toBe(true);
    expect(c.near.has('bible/nehemiah:7:66')).toBe(true);
    expect(c.best).toBe(0);
  });
  it('a verse target: a query naming the verse asks for it alone, no parallels', () => {
    const c = C.classOf({ level: 'verse', uk: 'bible/ezra:2:64', q: 'ezra 2 64 the whole congregation together', ref: 'Ezra 2:64' });
    expect([...c.members]).toEqual(['bible/ezra:2:64']);
    expect(c.near.size).toBe(0);
  });
  it('a verse target with uk2: the pair, and a pair has no parallels', () => {
    const c = C.classOf({ level: 'verse', uk: 'bible/ezra:2:64', uk2: 'bible/nehemiah:7:66' });
    expect([...c.members].sort()).toEqual(['bible/ezra:2:64', 'bible/nehemiah:7:66']);
    expect(c.near.size).toBe(0);
  });
  it('a sentence target quoting a verse has the verse as its original', () => {
    const c = C.classOf({ level: 'sentence', uk: 'v1/a', sentence: 'When YahuShua heard these things, he marvelled at him and turned him about' });
    expect(c.members.has('bible/luke:7:9')).toBe(true);
    expect(c.members.has('v1/a')).toBe(true);
    expect(c.near.size).toBe(0);
    expect(c.best).toBe(0);
  });
  it('a sentence target quoting a verse with words changed has the verse as a near member', () => {
    const c = C.classOf({ level: 'sentence', uk: 'v1/a', sentence: 'When Jesus heard these things, he marvelled at them but turned him about and said' });
    expect(c.members.has('bible/luke:7:9')).toBe(true);
    expect(c.near.has('bible/luke:7:9')).toBe(true);
    expect(c.best).toBe(0);
  });
  it('a block target quoting a verse has the verse answer the gist as a near member, the block stays the original', () => {
    const c = C.classOf({ level: 'block', uk: 'v1/a', sentence: 'When YahuShua heard these things, he marvelled at him and turned him about' });
    expect(c.members.has('bible/luke:7:9')).toBe(true);
    expect(c.near.has('bible/luke:7:9')).toBe(true);
    expect(c.members.has('v1/a')).toBe(true);
  });
  it('a unit target: a title names the text it belongs to', () => {
    const c = C.classOf({ level: 'unit', uk: 'answers/c', title: 'The Truth Absolute' });
    expect(c.members.has('answers/c')).toBe(true);
    expect(c.members.has('v3/d')).toBe(true);
    expect(c.best).toBe(0);
  });
  it('a unitgist target: its containers answer too', () => {
    const targetText = 'the shepherd gathers the flock at dawn beside still waters and calls each lamb by name';
    const Bc = [
      { uk: 'v1/a', idx: 0, type: 'p', text: targetText, title: 'Target' },
      { uk: 'v1/b', idx: 0, type: 'p', text: targetText + ' and the flock follows', title: 'Container' },
    ];
    for (let i = 0; i < 19; i++) Bc.push({ uk: `v9/f${i}`, idx: 0, type: 'p', text: `zx${i}qw alpha${i} beta${i} gamma${i} delta${i} epsilon${i} zeta${i} eta${i}`, title: `Filler ${i}` });
    const Cc = makeClasses({ D: [], B: Bc, KJV: {} });
    const c = Cc.classOf({ level: 'unit', uk: 'v1/a', style: 'unitgist', title: 'Target' });
    expect(c.members.has('v1/a')).toBe(true);
    expect(c.members.has('v1/b')).toBe(true);
    expect(c.best).toBe(0);
  });
  it('an Answers heading over one cited excerpt has the cited text as its original, ranked below the heading', () => {
    const c = C.classOf({ level: 'block', uk: 'answers/c', col: 'answers', blockIdx: 0, sentence: 'The Religions of Men Are an Abomination to The Lord' });
    expect(c.members.has('answers/c')).toBe(true);
    expect(c.members.has('v3/d')).toBe(true);
    expect(c.sectioned.get('v3/d')).toBe(' a short reprinted passage here ');
    expect(c.best).toBe(4);
  });
  it('errata: also adds, near marks, drop removes, and best is recomputed over the rest', () => {
    const c = C.classOf({ level: 'sentence', uk: 'v1/a', sentence: SENTENCE, errata: { also: ['bible/john:3:16'], near: ['v3/b'], drop: ['v1/b'] } });
    expect([...c.members].sort()).toEqual(['bible/john:3:16', 'v1/a', 'v3/b']);
    expect([...c.near]).toEqual(['v3/b']);
    expect(c.best).toBe(0);
    expect(c.recurring).toBe(false);
  });
});
