// @ts-nocheck — node:vm corpus loading and partial fixture shapes, as AnswersHome.test.jsx
/* answers-extras — Saved answers (O5) on the real corpus and its sidecars. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { answersKeyParts, answersIsTopicKey, answersSaved, answersSavedSum, answersParaSource } from './answers-extras.js';
import { answersIndexOf, answersSearch } from './answers-search.js';
import { answersSiteOrder } from './answers-site.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8') + ';this.A=ANSWERS;', ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8') + ';this.M=ANSWERS_META;', ctx);
const A = ctx.A;
const NB = (s) => s.replace(/\u00a0/g, ' ');

const mark = (gid, start, text, kind = 'highlight', extra = {}) => ({ id: gid + '-' + start, groupId: gid, kind, color: 'yellow', start, end: start + text.length, text, ...extra });

describe('Saved answers (O5)', () => {
  it('reads only Answers topic paragraphs: a wtlb key of another collection, a letter key and a bad index are not Answers', () => {
    expect(answersKeyParts('wtlb:god-speaks-about-the-sabbath:12')).toEqual({ id: 'god-speaks-about-the-sabbath', index: 12 });
    expect(answersKeyParts('letter:the-one-who-stays-lets:3')).toBeNull();
    expect(answersKeyParts('wtlb:x:-1')).toBeNull();
    expect(answersKeyParts('wtlb:x:two')).toBeNull();
    expect(answersIsTopicKey(A, 'wtlb:god-speaks-about-the-sabbath:12')).toEqual({ id: 'god-speaks-about-the-sabbath', index: 12 });
    expect(answersIsTopicKey(A, 'wtlb:devotion:3')).toBeNull();
    expect(answersIsTopicKey(null, 'wtlb:god-speaks-about-the-sabbath:12')).toBeNull();
  });

  it('groups by topic in the site\'s order and each topic in reading order; a mark across paragraphs is one, a note keeps its words', () => {
    const all = {
      'wtlb:god-speaks-about-the-sabbath:9': [mark('g2', 4, 'Remember the Sabbath')],
      'wtlb:god-speaks-about-the-sabbath:2': [mark('g1', 0, 'Thus says'), mark('n1', 20, 'keep My Sabbaths', 'note')],
      'wtlb:there-is-no-other:5': [mark('g3', 0, 'first half', 'underline')],
      'wtlb:there-is-no-other:6': [mark('g3', 0, 'second half', 'underline')],
      'wtlb:devotion:1': [mark('w1', 0, 'Words To Live By, not Answers')],
      'bible:genesis:1:1': [mark('b1', 0, 'In the beginning')],
      'wtlb:there-is-no-other:7': [{ id: 'bk', groupId: 'bk', kind: 'bookmark', start: 0, text: 'not a mark' }],
    };
    const s = answersSaved(A, all, (gid) => (gid === 'n1' ? '  Keep this one.  ' : ''));
    expect(s.topics.map((t) => t.entry.id)).toEqual(['there-is-no-other', 'god-speaks-about-the-sabbath']);
    expect(s.topics[0].items).toEqual([{ gid: 'g3', kind: 'underline', index: 5, start: 0, text: 'first half second half', note: '' }]);
    expect(s.topics[1].items.map((i) => [i.gid, i.index, i.text, i.note])).toEqual([
      ['g1', 2, 'Thus says', ''], ['n1', 2, 'keep My Sabbaths', 'Keep this one.'], ['g2', 9, 'Remember the Sabbath', ''],
    ]);
    expect([s.marks, s.notes]).toEqual([3, 1]);
    expect(NB(answersSavedSum(s))).toBe('4 highlights and notes in 2 topics');
  });

  it('a page outside the site\'s menu still lists, after the site\'s order', () => {
    const order = answersSiteOrder(A).map((e) => e.id);
    const orphan = A.find((e) => !order.includes(e.id));
    expect(orphan.title).toContain('Come Out and Fight Against Me');
    const last = order[order.length - 1];
    const all = { ['wtlb:' + orphan.id + ':1']: [mark('o', 0, 'outside')], ['wtlb:' + last + ':1']: [mark('l', 0, 'last')],
      'wtlb:answers-main-page:1': [mark('m', 0, 'main')] };
    expect(answersSaved(A, all).topics.map((t) => t.entry.id)).toEqual(['answers-main-page', last, orphan.id]);
  });

  it('counts in words: highlights, notes, or both; nothing at all is no line', () => {
    const t = [{}, {}];
    expect(NB(answersSavedSum({ topics: [{}], marks: 1, notes: 0 }))).toBe('1 highlight in 1 topic');
    expect(NB(answersSavedSum({ topics: t, marks: 0, notes: 2 }))).toBe('2 notes in 2 topics');
    expect(NB(answersSavedSum({ topics: [{}], marks: 1, notes: 1 }))).toBe('2 highlights and notes in 1 topic');
    expect(answersSavedSum({ topics: [], marks: 0, notes: 0 })).toBe('');
    expect(answersSaved(A, {}).topics).toEqual([]);
    expect(answersSaved(null, { 'wtlb:there-is-no-other:1': [mark('a', 0, 'x')] }).topics).toEqual([]);
  });

  it('a paragraph\'s source is the one a search hit shows for it', () => {
    const idx = answersIndexOf(A);
    const g = answersSearch(idx, 'sabbath', {}).groups.find((x) => x.entry.id === 'god-speaks-about-the-sabbath');
    const item = idx.find((t) => t.entry === g.entry);
    expect(answersParaSource(item, g.first.index, null)).toEqual(g.first);
    expect(answersParaSource(item, g.first.index, null)).toEqual({ index: 2, src: 10, date: '3/29/06', sec: '' });
  });
});
