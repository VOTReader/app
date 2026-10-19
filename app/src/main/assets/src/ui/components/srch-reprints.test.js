/* srch-reprints — Best Matches folds a reprint under its original (search200 UX B10, item 2).
   "etched My words in stone" gave Volume Three's "Abide in the Doctrine" and the Answers
   topic "Regarding Obedience" two of the five places with the same passage word for word,
   and Volume Seven Letter 65 with "Regarding the Churches of Men" two more. The engine says
   nothing of which text reprints which, so the screen reads it from what each card shows:
   two hits of different standing whose shown passages are one passage are one card, under
   the original (a letter before an entry, an entry before a Holy Day, before a study, before
   an Answers topic). */
import { describe, it, expect } from 'vitest';
import { foldReprints, samePassage, REPRINT_TIER } from './srch-reprints.js';

const ABIDE = 'etched My words in stone with My own finger, yet who has received My message? Who has obeyed My Word, as it is written? I tell you the truth, only those fully converted in';
const CHURCHES = '…FROM DESECRATING THE HOLY LAW! For that written by the finger of God was etched in everlasting stone and forged with eternal fire! Therefore woe to any man who';
const OTHER = '…other, “We believe the Torah, yet we will reject these sent to us. Yes, we shall stone them in word and by deed, and cast all their cords from us,” though it was I Myself who had…';
const TERMS = ['etched', 'my', 'words', 'in', 'stone'];

let n = 0;
const hit = (kind, title, passage) => ({ score: 10 - (n++), doc: { kind, title, text: passage }, passage });
const passageOf = (/** @type {any} */ e) => e.passage;

describe('samePassage', () => {
  it('is one passage when most of the shorter shows in one run, holding a typed word', () => {
    expect(samePassage(ABIDE, ABIDE, TERMS)).toBe(true);
    // a window shifted a few words is still the same passage
    expect(samePassage(ABIDE, 'yet who has received My message? Who has obeyed My Word, as it is written? I tell you the truth, only those fully converted in their innermost parts, and only', ['received'])).toBe(true);
    expect(samePassage(ABIDE, CHURCHES, TERMS)).toBe(false);
  });

  it('a shared stock line is not a reprint: a short run, or one holding no typed word', () => {
    const a = 'From The Lord, Our God and Savior, The Word of The Lord Spoken to Timothy, for all those who have ears to hear: love one another as I have loved you, says The Lord.';
    const b = 'From The Lord, Our God and Savior, The Word of The Lord Spoken to Timothy, for all those who have ears to hear: behold, the day of the Lord is at hand, and who shall stand.';
    expect(samePassage(a, b, ['love', 'another'])).toBe(false);
    expect(samePassage('', ABIDE, TERMS)).toBe(false);
  });
});

describe('foldReprints', () => {
  it('folds an Answers topic under the letter it reprints, and every such pair (Vol 7 Letter 65 too)', () => {
    const abide = hit('letter', 'Abide in the Doctrine of The Messiah', ABIDE);
    const obedience = hit('answers', 'Regarding Obedience', ABIDE);
    const l65 = hit('letter', 'I Am Calling You Out! (Part 2)', CHURCHES);
    const churches = hit('answers', 'Regarding the Churches of Men', CHURCHES);
    const torah = hit('answers', 'The Volumes of Truth', OTHER);
    const cards = foldReprints([abide, obedience, l65, churches, torah], passageOf, TERMS);
    expect(cards.map((c) => c.entry)).toEqual([abide, l65, torah]);
    expect(cards.map((c) => c.also)).toEqual([[obedience], [churches], []]);
  });

  it('an original ranked below its reprint takes the card’s place, the reprint folded under it', () => {
    const entry = hit('wtlb', 'Service and Sacrifice', ABIDE);
    const letter = hit('letter', 'Trust Comes by Service and Sacrifice', ABIDE);
    const cards = foldReprints([entry, letter], passageOf, TERMS);
    expect(cards).toHaveLength(1);
    expect(cards[0].entry).toBe(letter);
    expect(cards[0].also).toEqual([entry]);
  });

  it('never folds two originals of one standing (two letters, a letter and the verse it quotes, two entries)', () => {
    const a = hit('letter', 'One', ABIDE);
    const b = hit('letter', 'Two', ABIDE);
    const v = hit('verse', undefined, ABIDE);
    const w1 = hit('wtlb', 'Three', ABIDE);
    const w2 = hit('blessed', 'Four', ABIDE);
    expect(foldReprints([a, b, v], passageOf, TERMS).map((c) => c.also.length)).toEqual([0, 0, 0]);
    expect(foldReprints([w1, w2], passageOf, TERMS).map((c) => c.also.length)).toEqual([0, 0]);
  });

  it('two compilations quoting one passage are one card ("The Volumes of Truth" and "Regarding Prophets (True)"), the first kept', () => {
    // An Answers topic, a Holy Day and a study chapter are made of passages from the volumes, so two of them
    // showing one passage both reprint one original, though it is not in the list.
    const a = hit('answers', 'The Volumes of Truth', OTHER);
    const b = hit('answers', 'Regarding Prophets (True)', OTHER);
    const s = hit('bible-study', 'A Study', OTHER);
    const cards = foldReprints([a, b, s], passageOf, ['stone', 'word']);
    expect(cards).toHaveLength(1);
    expect(cards[0].entry).toBe(a);
    expect(cards[0].also).toEqual([b, s]);
  });

  it('a title hit, or a kind it does not know, is never folded', () => {
    const a = hit('letter', 'Abide', ABIDE);
    const t = hit('answers-title', 'Regarding Obedience', ABIDE);
    expect(foldReprints([a, t], passageOf, TERMS).map((c) => c.also.length)).toEqual([0, 0]);
    expect(REPRINT_TIER['answers-title']).toBeUndefined();
  });

  it('takes five cards, and still finds their reprints further down the list', () => {
    const list = [hit('letter', 'Abide', ABIDE)];
    for (let i = 0; i < 6; i++) list.push(hit('letter', 'L' + i, OTHER.replace('Torah', 'Torah' + i).replace('stone', 'stone' + i)));
    const late = hit('answers', 'Regarding Obedience', ABIDE);
    list.push(late);
    const cards = foldReprints(list, passageOf, TERMS);
    expect(cards).toHaveLength(5);
    expect(cards[0].also).toEqual([late]);
  });

  it('reach bounds only the search for reprints: the five still fill from past it, as the one-card-per-text loop did', () => {
    const list = [];
    for (let i = 0; i < 4; i++) list.push(hit('letter', 'L' + i, OTHER.replace('Torah', 'Torah' + i)));
    const late = hit('letter', 'Late', CHURCHES);
    const cards = foldReprints(list.concat([late]), passageOf, TERMS, { reach: 2 });
    expect(cards.map((c) => c.entry)).toEqual(list.concat([late]));
  });

  it('with no passage to read (no snippet engine), nothing folds', () => {
    const a = hit('letter', 'Abide', ABIDE);
    const b = hit('answers', 'Regarding Obedience', ABIDE);
    expect(foldReprints([a, b], () => '', TERMS).map((c) => c.entry)).toEqual([a, b]);
  });
});
