/* search/titles.js (search200 B5): a title typed the way a reader remembers it. Fixture
   titles only; each test builds its own index, so the file passes in any order. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTitles, scoreTitles, admitTitles, setTitleCoverage, titleCoverage, titleWords, stripCollections, TITLE_ADMIT } from './titles.js';

const STOP = new Set(('the a an and or but in on at to for of with by from that this these those is was are were be been being have has had '
  + 'do does did as if than then so yet him his her he she they their them we our ours you your yours it its i me my mine us said').split(' '));
const VOT_DATA = { STOP_WORDS_TRIMMED: STOP, SYNONYM_MAP: { bread: ['bread', 'loaf'], loaf: ['bread', 'loaf'] } };

let n = 0;
const doc = (kind, volumeId, letterId, title, text) => ({ id: 'd' + (n++), kind, volumeId, letterId, title, text: text || title + ' is spoken of here.' });
const study = (chapterId, title) => Object.assign(doc('bible-study', 'bible-studies', 'purity', title), { studyChapterId: chapterId });
const ANSWER_TEXT = 'Hear Me. Vision Given to the Watchman I saw the watchman on the wall. The Fast The Lord Has Chosen Loose the bonds.';
const DOCS = [
  doc('letter', 'v7', 'calling-1', 'I Am Calling You Out! (Part 1)'),
  doc('letter', 'v7', 'calling-2', 'I Am Calling You Out! (Part 2)... Come Out of the Churches of Men and I Will Receive You! Says The Lord'),
  doc('letter', 'v5', 'trust-letter', 'Trust in Me'),
  doc('letter', 'v3', 'hour-late', 'The Hour Is Late'),
  doc('letter', 'v2', 'walking-light', 'Walking in the Light'),
  doc('letter', 'v2', 'walking-truth', 'Walking in the Truth'),
  doc('letter', 'v4', 'strength-meek', 'The Strength of the Meek'),
  doc('letter', 'v6', 'two-witnesses', 'The Two Witnesses'),
  doc('letter', 'v6', 'blessed-hope', 'Blessed Hope'),
  doc('letter', 'flock', 'rod', 'The Rod of Discipline'),
  doc('letter', 'v1', 'stand-firm-hold', 'Stand Firm... Hold Fast to the Truth'),
  doc('wtlb', 'wtlb1', 'selfless-servant', 'The Selfless Servant'),
  doc('wtlb', 'wtlb1', 'trust-in-me', 'Trust in Me'),
  doc('wtlb', 'wtlb1', 'justice-of-god', 'The Justice of God'),
  doc('wtlb', 'wtlb2', 'god-of-justice', 'The God of Justice'),
  doc('wtlb', 'wtlb2', 'spare-the-rod', 'Spare the Rod'),
  doc('wtlb', 'wtlb2', 'bread-heaven', 'Bread from Heaven'),
  doc('wtlb', 'wtlb2', 'stand-firm', 'STAND FIRM'),
  study('purity-ch1', 'Purity - Bible/Letter Study — Purity Part One: Purity is Important to God'),
  study('purity-ch5', 'Purity - Bible/Letter Study — Purity Part Five: Purified in the Spirit'),
  study('purity-ch6', 'Purity - Bible/Letter Study — Purity Part Six: Purified Through the Blood of Messiah'),
  study('lamb-ch3', 'The Lamb of God — Without Spot or Blemish'),
  doc('answers', 'answers', 'calling-you-out', 'I Am Calling You Out', ANSWER_TEXT),
];
const ANSWERS = [{ id: 'calling-you-out', paragraphs: [
  { align: 'justify', text: 'Hear Me.' },
  { align: 'center', text: '**Vision Given to the Watchman**' },
  { align: 'justify', text: 'I saw the watchman on the wall.' },
  { align: 'center', text: '**The Fast The Lord Has Chosen**' },
  { align: 'justify', text: 'Loose the bonds.' },
] }];

let prev;
beforeAll(() => { prev = window.VotSearchData; window.VotSearchData = VOT_DATA; });
afterAll(() => { window.VotSearchData = prev; });
const index = () => buildTitles(DOCS, { answers: ANSWERS });
const first = (q) => scoreTitles(q, { index: index() })[0];
const admitted = (q) => admitTitles(scoreTitles(q, { index: index() })).map((h) => h.uk);

describe('scoreTitles: the RED cases of PLAN B5', () => {
  it('a near-word typed for one word of a short title ("selfish" for "Selfless")', () => {
    expect(first('the selfish servant').uk).toBe('wtlb1/selfless-servant');
    expect(admitted('the selfish servant')).toEqual(['wtlb1/selfless-servant']);
  });

  it('a typo in a numbered study chapter, and the number veto keeps the other parts out', () => {
    const hits = scoreTitles('puirty part six', { index: index() });
    expect(hits[0].uk).toBe('bible-studies/purity-ch6');
    expect(hits.some((h) => h.uk === 'bible-studies/purity-ch5')).toBe(false);
    expect(admitted('puirty part six')).toEqual(['bible-studies/purity-ch6']);
  });

  it('the collection named beside the title breaks the tie toward that collection', () => {
    const hits = scoreTitles('trust in me words to live by', { index: index() });
    expect(hits[0].uk).toBe('wtlb1/trust-in-me');
    expect(hits[0].hinted).toBe(true);
    expect(hits[0].via).toBe('typed+collection');
    expect(admitted('trust in me words to live by')[0]).toBe('wtlb1/trust-in-me');
  });

  it('"volume N <words>" finds the letter in that volume over the Answers topic of the same words', () => {
    const hits = scoreTitles('volume 7 calling you out', { index: index() });
    expect(hits[0].uk).toBe('v7/calling-1');
    const a = admitted('volume 7 calling you out');
    expect(a[0]).toBe('v7/calling-1');
    expect(a).not.toContain('answers/calling-you-out');
  });

  it('"the god of justice" and "the justice of god" each find their own title', () => {
    expect(first('the god of justice')).toMatchObject({ uk: 'wtlb2/god-of-justice', level: 4 });
    expect(first('the justice of god')).toMatchObject({ uk: 'wtlb1/justice-of-god', level: 4 });
    expect(admitted('the justice of god')).toEqual(['wtlb1/justice-of-god']);
  });
});

describe('scoreTitles: the ways a title is misremembered', () => {
  it('reordered words', () => {
    expect(first('late is the hour')).toMatchObject({ uk: 'v3/hour-late', level: 2, via: 'cover' });
    expect(admitted('late is the hour')).toEqual(['v3/hour-late']);
  });

  it('a near-synonym swapped in, from the title table and from SYNONYM_MAP', () => {
    expect(admitted('the power of the meek')).toEqual(['v4/strength-meek']);
    expect(admitted('loaf from heaven')).toEqual(['wtlb2/bread-heaven']);
  });

  it('a word run together, by the whole title\'s trigrams', () => {
    const h = first('spare therod');
    expect(h).toMatchObject({ uk: 'wtlb2/spare-the-rod', level: 1, via: 'typo' });
    expect(admitted('spare therod')).toEqual(['wtlb2/spare-the-rod']);
  });

  it('a digit for a number word is the title as typed; a different number is vetoed', () => {
    expect(first('the 2 witnesses')).toMatchObject({ uk: 'v6/two-witnesses', level: 4 });
    expect(scoreTitles('the 3 witnesses', { index: index() }).some((h) => h.uk === 'v6/two-witnesses')).toBe(false);
    const five = scoreTitles('purity part 5', { index: index() });
    expect(five[0].uk).toBe('bible-studies/purity-ch5');
    expect(five.some((h) => h.uk === 'bible-studies/purity-ch6')).toBe(false);
  });

  it('a long title named by its first part, with its own part number', () => {
    expect(first('calling you out, part 2').uk).toBe('v7/calling-2');
    expect(admitted('calling you out, part 2')).toEqual(['v7/calling-2']);
  });

  it('collection words stripped from the end, and the part number with them', () => {
    expect(first('spare the rod words to live by part two')).toMatchObject({ uk: 'wtlb2/spare-the-rod', level: 4, hinted: true });
    expect(stripCollections(titleWords('mature faith words to live by part one'))).toEqual({ w: ['mature', 'faith'], hints: new Set(['wtlb1']) });
    expect(stripCollections(titleWords('woe to the captives vol 3'))).toEqual({ w: ['woe', 'to', 'the', 'captives'], hints: new Set(['v3']) });
  });

  it('a whole title typed shows before a longer title that opens with the same words', () => {
    expect(admitted('stand firm')).toEqual(['wtlb2/stand-firm', 'v1/stand-firm-hold']);
  });

  it('a title holding a collection word still meets it as typed', () => {
    expect(first('blessed hope')).toMatchObject({ uk: 'v6/blessed-hope', level: 4 });
  });

  it('a study chapter typed by its own title, and an Answers heading with its place in the text', () => {
    expect(first('without spot or blemish')).toMatchObject({ uk: 'bible-studies/lamb-ch3', level: 4, kind: 'chapter' });
    const h = first('vision given to the watchman');
    expect(h).toMatchObject({ uk: 'answers/calling-you-out', kind: 'heading', level: 4 });
    expect(ANSWER_TEXT.slice(h.start)).toMatch(/^Vision Given to the Watchman/);
  });
});

describe('admitTitles: the margin rule keeps gists out', () => {
  it('a gist that reads like two titles is not admitted', () => {
    const hits = scoreTitles('walking in the light of the truth', { index: index() });
    expect(hits[0].score).toBeGreaterThanOrEqual(TITLE_ADMIT);
    expect(admitTitles(hits)).toEqual([]);
  });

  it('a sentence about a title\'s subject is not admitted', () => {
    expect(admitted('he told us to keep walking in his light so we never stumble in the dark')).toEqual([]);
    expect(admitted('the lord gives strength to all the meek who wait on him')).toEqual([]);
    // every content word a title's, but the sentence runs well past it
    expect(admitted('so we were walking in the truth with them')).toEqual([]);
  });

  it('nothing typed, nothing admitted', () => {
    expect(scoreTitles('', { index: index() })).toEqual([]);
    expect(admitTitles([])).toEqual([]);
  });
});

describe('the coverage seam', () => {
  it('scoring runs through the coverage function set, and none restores titleCoverage', () => {
    const ix = index();
    try {
      setTitleCoverage(() => ({ q: 0, t: 0, order: 0 }));
      expect(scoreTitles('late is the hour', { index: ix }).some((h) => h.via === 'cover')).toBe(false);
    } finally {
      setTitleCoverage(null);
    }
    expect(scoreTitles('late is the hour', { index: ix })[0].via).toBe('cover');
    const q = [{ tok: 'unwavering', wt: 1, rel: new Map([['steadfast', 0.65]]) }, { tok: 'faith', wt: 3, rel: new Map([['faith', 1]]) }];
    expect(titleCoverage(q, [{ tok: 'steadfast', wt: 2 }, { tok: 'faith', wt: 3 }])).toEqual({ q: (0.65 + 3) / 4, t: (1.3 + 3) / 5, order: 1, unmet: 0 });
    expect(titleCoverage(q.slice().reverse(), [{ tok: 'steadfast', wt: 2 }, { tok: 'faith', wt: 3 }]).order).toBe(0.5);
  });
});
