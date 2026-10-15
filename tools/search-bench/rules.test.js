import { describe, it, expect } from 'vitest';
import { heldShare, recurring, reprintShown } from './rules.mjs';

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
