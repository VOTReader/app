// Gate A (tri/gate-a.mjs) on the briefs' own examples, which come from outside the corpus on purpose (search200, 2026-10-18).
import { describe, it, expect } from 'vitest';
import { gateA, typedChanges, bestMove } from './gate-a.mjs';
import { titleFold, foldNumbers, toks, typoOf } from './lex.mjs';

const ex = (form, tier, remembered, extra = {}) => ({ style: 'exact', form, tier, remembered, ...extra });
const mr = (form, tier, remembered, extra = {}) => ({ style: 'misremembered', form, tier, remembered, ...extra });
const ti = (form, tier, title, extra = {}) => ({ style: 'title', form, tier, title, collection: 'Synthetic', ...extra });
const why = (t, q, from) => gateA(t, { q, from }).why;

const GETTYSBURG = 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.';
const AUSTEN = 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.';
const MELVILLE = 'Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, I thought I would sail about a little and see the watery part of the world.';

describe('Gate A: exact', () => {
  it('long-run: a 9-14 word run with 4 content words', () => {
    expect(why(ex('long-run', 'easy', GETTYSBURG), 'conceived in liberty and dedicated to the proposition that all men are created equal')).toEqual([]);
    expect(why(ex('long-run', 'easy', GETTYSBURG), 'four score and seven years ago our fathers brought forth on this continent a new nation')).toEqual(['words:16']);
    expect(why(ex('long-run', 'easy', GETTYSBURG), 'conceived in freedom and dedicated to the proposition that all men are created equal')).toEqual(['not-run']);
    expect(gateA(ex('long-run', 'easy', GETTYSBURG), { q: 'four score and seven years ago our fathers brought forth' }).meta.atStart).toBe(true);
  });
  it('short-sentence: every word', () => {
    expect(why(ex('short-sentence', 'easy', 'Brevity is the soul of wit.'), 'brevity is the soul of wit')).toEqual([]);
    expect(why(ex('short-sentence', 'easy', 'Brevity is the soul of wit.'), 'brevity is the soul')).toEqual(['not-whole-sentence']);
  });
  it('pasted-quoted: in quotation marks, its own capitals and punctuation', () => {
    const t = ex('pasted-quoted', 'easy', 'It was the best of times, it was the worst of times, it was the age of wisdom.');
    expect(why(t, '"It was the best of times, it was the worst of times,"')).toEqual([]);
    expect(why(t, '“It was the best of times, it was the worst of times,”')).toEqual([]);
    expect(why(t, 'it was the best of times it was the worst of times')).toEqual(['not-quoted']);
    expect(why(t, '"it was the best of times it was the worst of times"')).toEqual(['not-verbatim']);
  });
  it('start, middle, end: 5-8 words from the part the form names', () => {
    expect(why(ex('start', 'medium', AUSTEN), 'it is a truth universally acknowledged')).toEqual([]);
    expect(why(ex('middle', 'medium', AUSTEN), 'single man in possession of a good fortune')).toEqual([]);
    expect(why(ex('end', 'medium', AUSTEN), 'must be in want of a wife')).toEqual([]);
    expect(why(ex('start', 'medium', AUSTEN), 'single man in possession of a good fortune')).toEqual(['not-start']);
    expect(why(ex('end', 'medium', AUSTEN), 'it is a truth universally acknowledged')).toEqual(['not-end']);
    expect(why(ex('middle', 'medium', AUSTEN), 'it is a truth')).toContain('words:4');
  });
  it('rare-short and common-words', () => {
    expect(why(ex('rare-short', 'hard', 'When we have shuffled off this mortal coil, must give us pause.'), 'this mortal coil')).toEqual([]);
    expect(why(ex('rare-short', 'hard', 'When we have shuffled off this mortal coil, must give us pause.'), 'when we have')).toEqual(['content:0']);
    const lincoln = 'That government of the people, by the people, for the people, shall not perish from the earth.';
    expect(why(ex('common-words', 'hard', lincoln), 'of the people by the people')).toEqual([]);
    expect(why(ex('common-words', 'hard', lincoln), 'shall not perish from the earth')).toEqual([]);
    expect(why(ex('common-words', 'hard', lincoln), 'government of the people by the')).toEqual([]);
  });
  it('boundary: across the end of the first sentence, no period', () => {
    const t = ex('boundary', 'hard', MELVILLE, { span: { first: 'Call me Ishmael.', second: MELVILLE.slice(17) } });
    expect(why(t, 'call me ishmael some years ago')).toEqual([]);
    expect(why(t, 'call me ishmael. some years ago')).toEqual(['period']);
    expect(why(t, 'some years ago never mind how')).toEqual(['not-across']);
  });
  it('typed-forms: a run once & / digits / apostrophes / hyphens fold, with one such change', () => {
    expect(why(ex('typed-forms', 'hard', GETTYSBURG), '4 score & 7 years ago our fathers')).toEqual([]);
    expect(why(ex('typed-forms', 'hard', GETTYSBURG), 'four score and seven years ago our fathers')).toEqual(['no-typed-change']);
    expect(why(ex('typed-forms', 'hard', GETTYSBURG), '4 score & 8 years ago our fathers')).toEqual(['not-run']);
    const t = "I don't know the well-known man who came on the third day.";
    expect(typedChanges('i dont know the well-known man', t)).toBe(1);
    expect(typedChanges('the well known man who came on the 3rd day', t)).toBe(2);
    expect(why(ex('typed-forms', 'hard', t), 'the wellknown man who came')).toEqual([]);
  });
});

describe('Gate A: misremembered', () => {
  it('one-slip and two-three-slips', () => {
    const h = mr('one-slip', 'easy', 'There are more things in heaven and earth, Horatio, than are dreamt of in your philosophy.');
    expect(why(h, 'than are dreamt of in our philosophy', 'than are dreamt of in your philosophy')).toEqual([]);
    expect(why(h, 'than are dreamt of in your philosophy', 'than are dreamt of in your philosophy')).toEqual(['slips:0']);
    expect(why(h, 'than are dreamt of in our philosophy', 'than are dreamed of in your philosophy')).toEqual(['from-not-run']);
    const l = mr('two-three-slips', 'medium', 'That government of the people, by the people, for the people, shall not perish from the earth.');
    expect(why(l, 'for the people will not vanish from this earth', 'for the people shall not perish from the earth')).toEqual([]);
    expect(why(l, 'for the people will not perish from this earth', 'for the people shall not perish from the earth')).toEqual(['no-content-slip']);
  });
  it('many-slips keeps 40% of the content words and is no run', () => {
    const t = mr('many-slips', 'hard', 'If you can keep your head when all about you are losing theirs and blaming it on you.');
    expect(why(t, 'if you keep your cool when everyone around you is losing theirs', 'if you can keep your head when all about you are losing theirs')).toEqual([]);
    expect(why(t, 'if you can keep your head when all about you', 'if you can keep your head when all about you are losing theirs')).toEqual(['is-run', 'slips:3']);
  });
  it('reordered: a clause moved, up to 2 slips', () => {
    const t = mr('reordered', 'hard', 'With malice toward none, with charity for all, with firmness in the right.');
    expect(why(t, 'with charity for all and malice toward none', 'with malice toward none with charity for all')).toEqual([]);
    expect(bestMove(toks('with malice toward none with charity for all'), toks('with charity for all and malice toward none'))).toBe(1);
    expect(why(t, 'with malice towards no one with charity for every', 'with malice toward none with charity for all')).toEqual(['not-reordered']);
  });
  it('register: swapped throughout', () => {
    const t = mr('register', 'hard', 'And so, my fellow Americans: ask not what your country can do for you, ask what you can do for your country.');
    expect(why(t, 'ask not what thy country can do for thee', 'ask not what your country can do for you')).toEqual([]);
    const k = mr('register', 'hard', 'Thou shalt love thy neighbour as thyself, saith the teacher.');
    expect(why(k, 'you will love your neighbour as yourself', 'thou shalt love thy neighbour as thyself')).toEqual([]);
    expect(why(k, 'you will love thy neighbour as yourself', 'thou shalt love thy neighbour as thyself')).toEqual(['register-partial']);
  });
  it('merged: the start of one sentence, the end of the next, the middle gone', () => {
    const t = mr('merged', 'hard', MELVILLE, { span: { first: 'Call me Ishmael.', second: MELVILLE.slice(17) } });
    const from = 'call me ishmael some years ago never mind how long precisely having little or no money in my purse i thought i would sail about a little and see the watery part of the world';
    expect(why(t, 'call me ishmael i would sail about and see the watery part of the world', from)).toEqual([]);
    expect(why(t, 'some years ago i would sail about and see the watery part', 'some years ago never mind how long precisely having little or no money in my purse i thought i would sail about a little and see the watery part')).toEqual(['from-not-across']);
  });
  it('half: the first 4-6 words right, then 2 content slips', () => {
    const t = mr('half', 'hard', 'Two roads diverged in a yellow wood, and sorry I could not travel both.');
    expect(why(t, 'two roads diverged in a dark forest', 'two roads diverged in a yellow wood')).toEqual([]);
    expect(why(t, 'two roads split in a dark forest', 'two roads diverged in a yellow wood')).toEqual(['prefix:2']);
    expect(why(t, 'two roads diverged in a dark wood', 'two roads diverged in a yellow wood')).toEqual(['content-slips-after:1']);
  });
});

describe('Gate A: titles', () => {
  it('folds runs of number words', () => {
    expect(foldNumbers(['twenty', 'thousand', 'leagues'])).toEqual(['20000', 'leagues']);
    expect(titleFold('Part Two: The Lord\'s Day')).toEqual(['part', '2', 'the', 'lord', 'day']);
    expect(foldNumbers(['no', 'one', 'knows'])).toEqual(['no', '1', 'knows']); // a lone number word folds as numFold does, on both sides alike
  });
  it('easy: lowercase and as written', () => {
    expect(why(ti('lowercase', 'easy', 'The Old Man and the Sea'), 'the old man and the sea')).toEqual([]);
    expect(why(ti('lowercase', 'easy', 'The Old Man and the Sea'), 'The old man and the sea')).toEqual(['not-lowercase']);
    expect(why(ti('as-written', 'easy', 'Do Androids Dream of Electric Sheep?'), 'Do Androids Dream of Electric Sheep?')).toEqual([]);
    expect(why(ti('as-written', 'easy', 'Do Androids Dream of Electric Sheep?'), 'do androids dream of electric sheep')).toEqual(['not-as-written']);
  });
  it('medium: an in-order subset, never the whole title', () => {
    expect(why(ti('article-dropped', 'medium', 'The Great Gatsby'), 'great gatsby')).toEqual([]);
    expect(why(ti('word-dropped', 'medium', 'The Lion, the Witch and the Wardrobe'), 'the lion the witch and wardrobe')).toEqual([]);
    expect(why(ti('word-dropped', 'medium', 'The Lion, the Witch and the Wardrobe'), 'the lion the witch and the wardrobe')).toEqual(['whole-title']);
    expect(why(ti('memorable-part', 'medium', 'The Strange Case of Dr Jekyll and Mr Hyde'), 'dr jekyll and mr hyde')).toEqual([]);
    expect(why(ti('memorable-part', 'medium', 'The Strange Case of Dr Jekyll and Mr Hyde'), 'mr hyde and dr jekyll')).toEqual(['not-subset']);
  });
  it('number-swap and punct-swap: the whole title typed another way, never an easy form', () => {
    expect(why(ti('number-swap', 'medium', 'Twenty Thousand Leagues Under the Sea'), '20000 leagues under the sea')).toEqual([]);
    expect(why(ti('number-swap', 'medium', 'Twenty Thousand Leagues Under the Sea'), 'twenty thousand leagues under the sea')).toEqual(['equals-easy']);
    expect(why(ti('punct-swap', 'medium', "Alice's Adventures in Wonderland"), "alices' adventures in wonderland")).toEqual([]);
    expect(why(ti('punct-swap', 'medium', "Alice's Adventures in Wonderland"), 'alices adventures in wonderland')).toEqual(['equals-easy']);
  });
  it('punct-swap: a hyphen joined or split (the brief\'s own words), an apostrophe typed as a space; never a join across a space', () => {
    const SS = ti('punct-swap', 'medium', 'The Well-Known Self-Evident Truth');
    expect(why(SS, 'the wellknown selfevident truth')).toEqual([]);
    expect(why(SS, 'the wellknown self-evident truth')).toEqual([]);
    expect(why(SS, 'the well known self evident truth')).toEqual(['equals-easy']);
    expect(why(SS, 'thewellknown selfevident truth')).toEqual(['not-subset']);
    expect(why(ti('punct-swap', 'medium', "Alice's Adventures in Wonderland"), 'alice s adventures in wonderland')).toEqual([]);
    expect(why(ti('punct-swap', 'medium', 'Beloved, Awake'), 'belovedawake')).toEqual(['not-subset']);
  });
  it('hard: half the content words kept, never an in-order subset, then the form', () => {
    expect(why(ti('words-wrong', 'hard', 'The Old Man and the Sea'), 'the old man and the ocean')).toEqual([]);
    expect(why(ti('reordered', 'hard', 'The Lion, the Witch and the Wardrobe'), 'the witch the lion and the wardrobe')).toEqual([]);
    expect(why(ti('typo', 'hard', 'Wuthering Heights'), 'wuthering hieghts')).toEqual([]);
    expect(why(ti('typo', 'hard', 'Wuthering Heights'), 'wuthering cliffs')).toEqual(['not-typo']);
    expect(why(ti('collection-word', 'hard', 'Harry Potter and the Deathly Hallows', { collection: 'Book Seven' }), 'deathly hallows book 7')).toEqual([]);
    expect(why(ti('collection-word', 'hard', 'Harry Potter and the Deathly Hallows', { collection: 'Book Seven' }), 'deathly hallows wizard')).toContain('no-collection-word');
    expect(why(ti('dropped-wrong', 'hard', 'The Picture of Dorian Gray'), 'portrait of dorian gray')).toEqual([]);
    expect(why(ti('words-wrong', 'hard', 'The Old Man and the Sea'), 'old man sea')).toEqual(['is-subset']);
    expect(why(ti('words-wrong', 'hard', 'The Old Man and the Sea'), 'the young boy and the ocean')).toEqual(['retention:0%', 'not-words-wrong']);
  });
  it('hard typo: measured on the word as typed, so a 5-letter plural whose root has 4 letters still takes a typo', () => {
    expect(why(ti('typo', 'hard', 'Hard Times'), 'hard tmies')).toEqual([]);
    expect(why(ti('typo', 'hard', 'Hard Times'), 'hard time')).toEqual(['not-typo']); // a plural dropped is no typo
    expect(typoOf('tmies', 'times')).toBe(true);
    expect(typoOf('time', 'times')).toBe(false);
    expect(typoOf('tmie', 'time')).toBe(false); // under 5 letters
  });
  it('hard: a plural changed is a word wrong, so the query is no in-order subset', () => {
    expect(why(ti('words-wrong', 'hard', 'Great Expectations'), 'great expectation')).toEqual([]);
    expect(why(ti('dropped-wrong', 'hard', 'The Picture of Dorian Gray'), 'pictures of dorian gray')).toEqual([]);
    expect(why(ti('words-wrong', 'hard', 'Great Expectations'), 'great expectations')).toEqual(['is-subset']);
    // a plural changed but nothing moved is not a reordered title
    expect(why(ti('reordered', 'hard', 'The Lion, the Witch and the Wardrobe'), 'the lion the witch and the wardrobes')).toEqual(['not-reordered']);
  });
});
