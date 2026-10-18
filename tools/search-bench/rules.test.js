import { describe, it, expect } from 'vitest';
import { heldShare, recurring, reprintShown, nearCopy, nearQuote, namesCollection, titleForms, rangeHolds, pairHolds } from './rules.mjs';

const w = (s) => s.split(' ');
const entry = w('do not fear the days ahead for i am with you and i will keep you through the fire and the flood says the lord');

describe('heldShare (containment)', () => {
  it('a letter holding the whole entry inside a longer text holds all of it', () => {
    const letter = w('thus says the lord my people hear me ' + entry.join(' ') + ' and walk in my ways all your days');
    expect(heldShare(entry, letter)).toBe(1);
  });
  it('a copy with a word changed still holds most of it; two in so short a text do not', () => {
    const copy = entry.slice(); copy[3] = 'coming';
    expect(heldShare(entry, copy)).toBeGreaterThanOrEqual(0.8);
    copy[17] = 'water';
    expect(heldShare(entry, copy)).toBeLessThan(0.8);
  });
  it('the same 3-grams scattered across a long text are not a copy', () => {
    const grams = []; for (let i = 0; i + 3 <= entry.length; i += 3) grams.push(...entry.slice(i, i + 3), ...Array(40).fill('filler'));
    expect(heldShare(entry, grams)).toBeLessThan(0.5);
  });
  it('an excerpt does not hold the text it came from', () => {
    expect(heldShare(entry, entry.slice(0, 8))).toBeLessThan(0.8);
  });
  it('a text too short to judge holds nothing', () => {
    expect(heldShare(w('i am the lord'), w('i am the lord'))).toBe(0);
  });
});

describe('recurring (no one original)', () => {
  const isVerse = (k) => k.startsWith('bible/');
  const isLetter = (k) => /^(v[1-7]|flock|rebuke|timothy)\//.test(k);
  it('the Bible and three letters: any of them answers', () => {
    expect(recurring(['bible/malachi:3:6', 'v1/a', 'v3/b', 'flock/c'], isVerse, isLetter)).toBe(true);
  });
  it('a verse a study quotes has the verse as its original', () => {
    expect(recurring(['bible/luke:7:9', 'bible-studies/x'], isVerse, isLetter)).toBe(false);
  });
  it('letters and their reprints without the Bible keep the tier order', () => {
    expect(recurring(['v1/a', 'v3/b', 'flock/c', 'wtlb1/d'], isVerse, isLetter)).toBe(false);
  });
});

describe('reprintShown (the original first, its reprint after)', () => {
  const hit = (key, card = key) => ({ key, card });
  it('the reprint second', () => {
    expect(reprintShown([hit('v6/a'), hit('wtlb2/b')], ['v6/a', 'wtlb2/b'], 'v6/a')).toBe(true);
  });
  it('the reprint fifth among the Best Matches', () => {
    expect(reprintShown([hit('v6/a'), hit('x'), hit('y'), hit('z'), hit('wtlb2/b')], ['v6/a', 'wtlb2/b'], 'v6/a')).toBe(true);
  });
  it('the reprint past the five', () => {
    expect(reprintShown([hit('v6/a'), hit('x'), hit('y'), hit('z'), hit('q'), hit('wtlb2/b')], ['v6/a', 'wtlb2/b'], 'v6/a')).toBe(false);
  });
  it('a copy with the same title and opening is the same card: shown', () => {
    expect(reprintShown([hit('v3/a', 'Keep|text'), hit('holydays/a', 'Keep|text')], ['v3/a', 'holydays/a'], 'v3/a')).toBe(true);
  });
  it('a repeated card does not take a place in the five', () => {
    const hits = [hit('v6/a'), hit('x'), hit('x2', 'x'), hit('x3', 'x'), hit('y'), hit('z'), hit('wtlb2/b')];
    expect(reprintShown(hits, ['v6/a', 'wtlb2/b'], 'v6/a')).toBe(true);
  });
  it('a class of one, or one passage under two keys, needs nothing more', () => {
    expect(reprintShown([hit('v6/a')], ['v6/a'], 'v6/a')).toBe(true);
    const twin = (a, b) => a.replace('matthew-study/matthew', 'bible/matthew') === b.replace('matthew-study/matthew', 'bible/matthew');
    expect(reprintShown([hit('bible/matthew:5:3')], ['bible/matthew:5:3', 'matthew-study/matthew:5:3'], 'bible/matthew:5:3', twin)).toBe(true);
  });
});

describe('nearCopy (a recurring line with a word or two changed)', () => {
  const stop = new Set(['the', 'and', 'of', 'is', 'be', 'for', 'i', 'you', 'in', 'to', 'them', 'me', 'from']);
  const pride = w('and the pride of man shall be bowed down and the arrogance of man utterly humiliated');
  it('the line with its tense changed is the same line', () => {
    const t = w('let the glory of man be turned backward until the pride of man is bowed down and the arrogance of man is utterly humiliated for the lord alone');
    expect(nearCopy(pride, t, stop, 'arrogance')).toBe(true);
  });
  it('the same opening ending in another sentence is not', () => {
    const s = w('for i tell you the truth all have entered in');
    expect(nearCopy(s, w('cast down for i tell you the truth all flesh shall be humbled in the day'), stop, 'truth')).toBe(false);
    expect(nearCopy(s, w('behold for i tell you the truth it has come all have entered in'), stop, 'truth')).toBe(true);
  });
  it('the words spread over a longer stretch are no copy', () => {
    const t = w('the pride of man the people saw shall be bowed down in that day and the arrogance of the nations and of man shall be utterly humiliated');
    expect(nearCopy(pride, t, stop, 'arrogance')).toBe(false);
  });
  it('a line too short to tell from a formula judges nothing', () => {
    expect(nearCopy(w('i am the lord your god'), w('i am the lord your god'), stop, 'lord')).toBe(false);
  });
});

describe('titleForms (tri bench, PLAN 1.6: a study chapter is linked by its short title too)', () => {
  const study = 'YAHUSHUA More Than a Man: YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive Bible/Letter Study) — Section One: YahuShua The Messiah, God With Us';
  it('a study chapter is filed under its whole title and under the chapter title alone', () => {
    expect(titleForms(study, true)).toEqual([study, 'Section One: YahuShua The Messiah, God With Us']);
  });
  it('a chapter title that itself holds " — " keeps the rest whole', () => {
    expect(titleForms('The Lamb of God — Part 3 — Without Spot or Blemish', true)).toEqual(['The Lamb of God — Part 3 — Without Spot or Blemish', 'Part 3 — Without Spot or Blemish']);
  });
  it('any other unit keeps its one title, a dash in it or not', () => {
    expect(titleForms('Stand — and Wait', false)).toEqual(['Stand — and Wait']);
    expect(titleForms('Without Spot or Blemish', false)).toEqual(['Without Spot or Blemish']);
  });
  it('a study chapter with nothing after the dash, or no dash, has one form', () => {
    expect(titleForms('Lamb of God — ', true)).toEqual(['Lamb of God — ']);
    expect(titleForms('Lamb of God', true)).toEqual(['Lamb of God']);
  });
});

describe('rangeHolds / pairHolds (a Bible card; a merged Bible misquote passes on either verse)', () => {
  const card = (chapter, chapterEnd, verseStart, verseEnd) => ({ chapter, chapterEnd, verseStart, verseEnd });
  it('a whole-chapter card holds every verse of its chapters', () => {
    expect(rangeHolds(card(5, 7), 6, 12)).toBe(true);
    expect(rangeHolds(card(5, 7), 8, 1)).toBe(false);
    expect(rangeHolds(card(5), 5, 40)).toBe(true);
  });
  it('a verse-range card holds only its verses', () => {
    expect(rangeHolds(card(5, null, 3, 12), 5, 3)).toBe(true);
    expect(rangeHolds(card(5, null, 3, 12), 5, 13)).toBe(false);
    expect(rangeHolds(card(5, null, 3), 5, 3)).toBe(true);
    expect(rangeHolds(card(5, null, 3), 5, 4)).toBe(false);
  });
  it('a pair: the card holding either verse passes, one holding neither does not', () => {
    const pair = { chapter: 3, verse: 16, verse2: 17 };
    expect(pairHolds(card(3, null, 17), pair)).toBe(true);
    expect(pairHolds(card(3, null, 16), pair)).toBe(true);
    expect(pairHolds(card(3, null, 18, 20), pair)).toBe(false);
  });
  it('a single verse (no verse2) is just rangeHolds', () => {
    expect(pairHolds(card(3, null, 16), { chapter: 3, verse: 16 })).toBe(true);
    expect(pairHolds(card(3, null, 17), { chapter: 3, verse: 16 })).toBe(false);
  });
});

describe('nearQuote (errata 2026-10-18, m246: a verse quoted with a word or two changed answers the sentence)', () => {
  const stop = new Set(['the', 'and', 'of', 'is', 'be', 'it', 'will', 'shall', 'to', 'you', 'so', 'i', 'say', 'given']);
  const rank = (x) => ({ knock: 1, seek: 2, opened: 3, ask: 4, find: 5 }[x] || 9);
  const letter = w('it is written ask and it will be given you seek and you shall find knock and it will be opened to you');
  it('a letter quoting the verse with two words changed holds it (the 80% 3-gram rule does not)', () => {
    const matt = w('ask and it will be given to you seek and you will find knock and it will be opened to you');
    expect(heldShare(matt, letter)).toBeLessThan(0.8);
    expect(nearQuote(letter, matt, stop, rank)).toBe(true);
  });
  it('a longer parallel that holds the quoted sentence answers it too', () => {
    const luke = w('so i say to you ask and it will be given to you seek and you will find knock and it will be opened to you');
    expect(nearQuote(letter, luke, stop, rank)).toBe(true);
  });
  it('a verse sharing a few of its words is no quote', () => {
    expect(nearQuote(letter, w('knock and it will be opened to you for everyone who asks receives'), stop, rank)).toBe(false);
    expect(nearQuote(letter, w('seek the lord while he may be found call upon him while he is near'), stop, rank)).toBe(false);
  });
});

describe('namesCollection (errata 2026-10-18, n344: a query naming the target collection asks for that text)', () => {
  const n = (s) => ' ' + s + ' ';
  it('the collection named beside the title', () => {
    expect(namesCollection(n('capital punishment answers only god can give'), n('capital punishment'), 'answers')).toBe(true);
    expect(namesCollection(n('mature faith words to live by'), n('mature faith'), 'wtlb1')).toBe(true);
    expect(namesCollection(n('under god nation volume 7'), n('one nation under god'), 'v7')).toBe(true);
  });
  it('another collection name, or none, names nothing', () => {
    expect(namesCollection(n('capital punishment volume two'), n('capital punishment'), 'answers')).toBe(false);
    expect(namesCollection(n('capital punishment'), n('capital punishment'), 'answers')).toBe(false);
  });
  it('a name the title or the quoted sentence holds itself names nothing', () => {
    expect(namesCollection(n('the blessed hope'), n('the blessed hope'), 'blessed')).toBe(false);
    expect(namesCollection(n('i am the answers you seek'), n('i am the answers you seek'), 'answers')).toBe(false);
  });
});
