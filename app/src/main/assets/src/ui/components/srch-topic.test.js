/* The topic card's pick (search200 ideas F): a question, an Answers topic among the first results, the model sure of
   it; the texts it quotes that the search found too. */
import { describe, it, expect } from 'vitest';
import { questionShaped, topicCandidate, pickTopic, topicQuotes, topicTexts, titleNames, withOwnPassage, TOPIC_MEANING_FLOOR, TOPIC_TITLED_FLOOR, TOPIC_TEXTS } from './srch-topic.js';

const topicDoc = { kind: 'answers', title: 'Regarding Tithing', text: 'Introduction. Beloved, I delight in that which one gives to another in My name, and by the works of their own hands; this is the tithe in which I delight most. Will a man rob God? Yet you have robbed Me!' };
const hit = (doc, meaning) => ({ score: 1, doc, ...(meaning === undefined ? {} : { meaning }) });

describe('questionShaped', () => {
  it('reads a question by its first word or its mark', () => {
    for (const q of ['what does the lord say about tithing', 'Can pets go to heaven', 'is the rapture real', 'who are the 144000', 'tithing?', 'Does science contradict the Bible']) {
      expect(questionShaped(q), q).toBe(true);
    }
  });
  it('a command, one word, or words with no question are not', () => {
    for (const q of ['do not fear for i am with you', "don't be afraid", 'tithing', 'what', 'the lord is my shepherd', '']) {
      expect(questionShaped(q), q).toBe(false);
    }
  });
});

describe('topicCandidate and pickTopic', () => {
  const letter = { kind: 'letter', title: 'Tithing', ref: 'Letters from Timothy · Letter 7', text: 'x' };
  it('takes the Answers topic the model is surest of, with its place and cosine', () => {
    const c = topicCandidate([hit(letter, 0.9), hit(topicDoc, 0.81)]);
    expect(c && c.rank).toBe(1);
    expect(c && c.meaning).toBe(0.81);
    expect(topicCandidate([hit(letter, 0.9), hit(topicDoc)]), 'a topic the model did not rank').toBeNull();
  });
  /* The hub walk's "what happens when we die?" (2026-10-22): keyword verses first, the topics that answer it at the end
     of the list, the surest of them not the first. */
  it('finds the topic under a page of keyword verses, and the surest of several, not the first', () => {
    const verses = Array.from({ length: 18 }, (_, i) => hit({ kind: 'verse', ref: 'Ecclesiastes 3:' + (i + 1), text: 'what happens' }, 0.6));
    const loose = hit({ kind: 'answers', title: 'Regarding the Churches of Men', text: 'x' }, 0.72);
    const death = hit({ kind: 'answers', title: 'Regarding the First Death', text: 'y' }, 0.84);
    const c = topicCandidate([...verses, loose, death]);
    expect(c && c.entry).toBe(death);
    expect(c && c.rank).toBe(19);
    expect(pickTopic('what happens when we die?', [...verses, loose, death])?.entry).toBe(death);
  });
  it('names the topic only for a question, and only at the floor or above', () => {
    const results = [hit(letter, 0.9), hit(topicDoc, TOPIC_MEANING_FLOOR)];
    expect(pickTopic('what does the lord say about tithing', results)).not.toBeNull();
    expect(pickTopic('tithing', results), 'not a question').toBeNull();
    expect(pickTopic('what does the lord say about tithing', [hit(letter), hit(topicDoc, TOPIC_TITLED_FLOOR - 0.001)]), 'under the titled floor').toBeNull();
    expect(pickTopic('what does the lord say about tithing', [hit(letter), hit(topicDoc)]), 'the model did not rank it').toBeNull();
  });
});

/* The topic its own title names (search200 ideas F, the hub's death question): "what happens when we die?" ranks
   Regarding the First Death surest at 0.72-0.74, under the plain floor, where right and wrong picks mix. A question
   whose words the topic's title holds ("die" and Death, "tithe" and Tithing) is sure at a lower floor. Cosines are
   the open cases' and the walk's (tools/search-bench/topic-floor.mjs). */
describe('a topic its title names', () => {
  const answers = (title, meaning) => hit({ kind: 'answers', title, text: 'x' }, meaning);
  const verses = Array.from({ length: 14 }, (_, i) => hit({ kind: 'verse', ref: 'Ecclesiastes 3:' + (i + 1), text: 'what happens' }, 0.6));
  it('the title holds a word of the question, or its family (die, death, dead)', () => {
    expect(titleNames('what happens when we die?', 'Regarding the First Death')).toBe(true);
    expect(titleNames('is it wrong not to tithe', 'Regarding Tithing')).toBe(true);
    expect(titleNames('will christians be raptured', 'Regarding the Gathering Up (Rapture)')).toBe(true);
    expect(titleNames('did judas go to hell', 'Regarding Judas Iscariot')).toBe(true);
    expect(titleNames('how do we reach sinners with the good news', 'Regarding Sin'), 'a sinner is not sin').toBe(false);
    expect(titleNames('is being gay a sin', 'Regarding Unforgiveness')).toBe(false);
    expect(titleNames('what does the lord say about it', 'Thus Says The Lord Regarding Abortion'), 'the title\'s frame words').toBe(false);
  });
  it('shows the death question its topic, under the plain floor', () => {
    const death = answers('Regarding the First Death', 0.7229);
    const results = [...verses, answers('Regarding Worldly Suffering', 0.7076), death];
    expect(pickTopic('what happens when we die?', results)?.entry).toBe(death);
    expect(pickTopic('what happens when we die', [...verses, answers('Regarding the First Death', 0.7379)])).not.toBeNull();
  });
  it('stays hidden when unsure: no title word under the plain floor, or a title word under the titled floor', () => {
    expect(pickTopic('is being gay a sin', [answers('Regarding Unforgiveness', 0.7603)])).toBeNull();
    expect(pickTopic('how do we reach sinners with the good news if we are supposed to stay separate', [answers('Regarding Sin', 0.7461)])).toBeNull();
    expect(pickTopic('whose garments do you wear', [answers('Regarding the Wearing of Jewelry', 0.7008)])).toBeNull();
    expect(pickTopic('what happens when we die?', [answers('Regarding the First Death', TOPIC_TITLED_FLOOR - 0.001)])).toBeNull();
    expect(pickTopic('where do we go when we die?', [answers('Thus Says The Lord Regarding Abortion', 0.7114)])).toBeNull();
  });
});

describe('topicQuotes and topicTexts', () => {
  const plainTopic = ' ' + topicDoc.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  it('a passage the topic quotes shares a run of words with it, whatever its marks', () => {
    expect(topicQuotes(plainTopic, '…in My name, and by the works of their own hands; this is the tithe…')).toBe(true);
    expect(topicQuotes(plainTopic, '“Will a man rob God? Yet you have robbed Me!')).toBe(true);
    expect(topicQuotes(plainTopic, 'Bring all the tithes into the storehouse, that there may be food in My house')).toBe(false);
  });
  it('lists the results the topic quotes, in their order, never a topic, at most TOPIC_TEXTS', () => {
    const topic = hit(topicDoc, 0.8);
    const verse = { kind: 'verse', ref: 'Malachi 3:8', text: 'Will a man rob God? Yet you have robbed Me!' };
    const letter = { kind: 'letter', title: 'Tithing', ref: 'Letters from Timothy · Letter 7', text: 'Beloved, I delight in that which one gives to another in My name, and by the works of their own hands' };
    const other = { kind: 'verse', ref: 'Malachi 3:10', text: 'Bring all the tithes into the storehouse' };
    const another = { kind: 'answers', title: 'Regarding Giving', text: topicDoc.text };
    const results = [hit(letter), topic, hit(other), hit(another), hit(verse), hit({ ...verse }), hit(letter)];
    const texts = topicTexts(topic, results, (e) => e.doc.text);
    expect(texts.map((t) => t.entry.doc.ref)).toEqual(['Letters from Timothy · Letter 7', 'Malachi 3:8']);
    const many = Array.from({ length: 6 }, (_, i) => hit({ kind: 'verse', ref: 'V' + i, text: 'Will a man rob God? Yet you have robbed Me! ' + 'x'.repeat(i + 1) + ' ' + i }));
    expect(topicTexts(topic, many, (e) => e.doc.text)).toHaveLength(TOPIC_TEXTS);
  });
});

/* The death card quoted the same sentence twice (the branch walk, 2026-10-22): a letter's passage the topic quotes,
   then the topic's own passage, which opens with that very sentence. */
describe('withOwnPassage', () => {
  const topic = hit({ kind: 'answers', title: 'Regarding the First Death', text: 'x' }, 0.72);
  const letter = hit({ kind: 'letter', title: 'Death and Awakening', text: 'y' });
  const said = '“For I tell you the truth, if there is life during death, as it is commonly taught amongst the people, then none truly die.';
  it("adds the topic's own passage when fewer than two texts show, unless one already says it", () => {
    expect(withOwnPassage([{ entry: letter, passage: said }], topic, 'For I tell you the truth, if there is life during death, as it is commonly taught amongst the people, then none truly die. And if all')).toHaveLength(1);
    const two = withOwnPassage([{ entry: letter, passage: said }], topic, 'The first death is a sleep.');
    expect(two.map((t) => !!t.own)).toEqual([false, true]);
    expect(withOwnPassage([], topic, 'The first death is a sleep.')).toHaveLength(1);
    expect(withOwnPassage([], topic, '')).toHaveLength(0);
  });
});
