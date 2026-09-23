// @ts-nocheck
/* answers-search — the landing's "What does The Lord say about…" box. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { answersPlainText, answersFold, buildAnswersIndex, searchAnswers, answersSnippet } from './answers-search.js';

const topic = (id, title, paragraphs) => ({ id, title, paragraphs: paragraphs.map((text) => ({ align: 'justify', text })) });
const FIXTURE = [
  topic('regarding-prayer', 'Regarding Prayer', [
    '_1/2/10_ **_From The Lord, Our God and Savior_**\n_The Word of The Lord Spoken to Timothy_',
    '"Pray without ceasing, for the Lord hears the _humble_ prayer."',
    '~ [From “Prayer” ~ Volume 1]',
    '✦',
    '"Watch and pray{{ref:Matthew 26:41}}; be ready."',
    '~ [From “Watch” ~ Volume 2]',
  ]),
  topic('regarding-pride', 'Regarding Pride', [
    '"The **pride** of man is a stone of stumbling; they will not pray."',
    '~ [From “Pride” ~ Volume 3]',
  ]),
  topic('the-name-of-the-lord', 'The Name of The Lord', [
    '"Speak My name aloud."',
    '~ [From “Proclaim” ~ Volume 7]',
  ]),
];
const INDEX = buildAnswersIndex(FIXTURE);

describe('text domain', () => {
  it('strips {{markers}} and **/_ marks for display', () => {
    expect(answersPlainText('Watch and pray{{ref:Matthew 26:41}}; the _humble_ **one**')).toBe('Watch and pray ; the humble one');
  });
  it('folds without changing length (snippets cut the display text at folded indices)', () => {
    const s = 'Lord’s “Word” AND';
    expect(answersFold(s).length).toBe(s.length);
    expect(answersFold(s)).toBe('lord\'s "word" and');
  });
});

describe('searchAnswers', () => {
  it('a title match is "the topic"; other topics whose passages say it are mentions', () => {
    const r = searchAnswers(INDEX, 'pray');
    expect(r.topics.map((t) => t.entry.id)).toEqual(['regarding-prayer']);
    expect(r.topics[0].hits).toBe(2);
    expect(r.mentions.map((t) => t.entry.id)).toEqual(['regarding-pride']);
    expect(r.mentionPassages).toBe(1);
  });
  it('matches at a word start only', () => {
    expect(searchAnswers(INDEX, 'ray')).toEqual({ words: ['ray'], topics: [], mentions: [], mentionPassages: 0 });
  });
  it('needs every word, anywhere in the same passage', () => {
    const r = searchAnswers(INDEX, 'stone pray');
    expect(r.topics).toEqual([]);
    expect(r.mentions.map((t) => t.entry.id)).toEqual(['regarding-pride']);
  });
  it('does not search the dated header or the attribution line', () => {
    expect(searchAnswers(INDEX, 'timothy').mentions).toEqual([]);
    expect(searchAnswers(INDEX, 'proclaim').mentions).toEqual([]);
  });
  it('lands on the paragraph that holds the word', () => {
    const r = searchAnswers(INDEX, 'watch');
    expect(r.topics).toEqual([]);
    expect(r.mentions[0].firstPara).toBe(4);
  });
  it('a title match whose passages never say the word still carries its opening lines', () => {
    const r = searchAnswers(INDEX, 'name');
    expect(r.topics[0].hits).toBe(1);
    const lord = searchAnswers(INDEX, 'the name of the lord');
    expect(lord.topics[0].leadText).toBe('"Speak My name aloud."');
  });
  it('an empty query is no search', () => {
    expect(searchAnswers(INDEX, '  ')).toBeNull();
  });
});

describe('answersSnippet', () => {
  it('marks every word the prefix begins and cuts long text around the first hit', () => {
    const long = 'Lorem ipsum dolor sit amet. '.repeat(12) + 'Pray without ceasing and keep praying. ' + 'Tail words here. '.repeat(12);
    const segs = answersSnippet(long, ['pray'], 60);
    expect(segs[0].text).toBe('…');
    expect(segs[segs.length - 1].text).toBe('…');
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['Pray', 'praying']);
  });
  it('a short passage is shown whole', () => {
    const segs = answersSnippet('Watch and pray.', ['pray']);
    expect(segs.map((s) => s.text).join('')).toBe('Watch and pray.');
  });
});

describe('on the real corpus', () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'answers.js'), 'utf8');
  const ctx = {};
  runInNewContext(src, ctx);
  const index = buildAnswersIndex(ctx.ANSWERS);
  it('"sabbath" finds The Sabbath first, and the other topics that speak of it', () => {
    const r = searchAnswers(index, 'sabbath');
    expect(r.topics.map((t) => t.entry.id)).toEqual(['god-speaks-about-the-sabbath']);
    expect(r.mentions.length).toBeGreaterThan(10);
    expect(r.mentions.every((m) => m.hits > 0 && m.firstPara >= 0)).toBe(true);
  });
});
