// @ts-nocheck
/* answers-browse — the words, places and lists the Answers browse screens show (AOGCG Browse). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
  NBSP, SEP, pl, answersLeadSplit, isDateHead, dateOfHead, answersMinutes, answersMediaKinds, answersSizeWords,
  answersRowSub, answersPlaceOf, answersBrowseShelves, answersShelfByKey, ANSWERS_QUESTIONS, answersAZGroups,
  answersSourceParts, answersInlinePieces, answersWordCount, answersDailyPool, answersDayNumber, answersDailyPick,
  answersOpenablePool, answersPathState, answersMediaIndex,
} from './answers-browse.js';
import { answersSiteOrder } from './answers-site.js';

const here = dirname(fileURLToPath(import.meta.url));
const ctx = {};
runInNewContext(readFileSync(resolve(here, '..', 'data', 'answers.js'), 'utf8'), ctx);
runInNewContext(readFileSync(resolve(here, '..', 'data', 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS;
const M = ctx.ANSWERS_META;
const E = (id) => A.find((e) => e.id === id);
const show = (s) => String(s).split(NBSP).join('~');

describe('copy rules', () => {
  it('a number never parts from its word; separators are " · " bound to the word before', () => {
    expect(show(pl(1, 'passage'))).toBe('1~passage');
    expect(show(pl(46, 'category'))).toBe('46~categories');
    expect(show(pl(73, 'match'))).toBe('73~matches');
    expect(show(pl(16, 'topic'))).toBe('16~topics');
    expect(show(SEP)).toBe('~· ');
  });
  it('the lead words split off, the title kept whole', () => {
    expect(answersLeadSplit('Regarding Faith')).toEqual({ lead: 'Regarding', rest: 'Faith' });
    expect(answersLeadSplit('God Speaks About the Sabbath')).toEqual({ lead: 'God Speaks About', rest: 'the Sabbath' });
    expect(answersLeadSplit('The Messiah')).toEqual({ lead: '', rest: 'The Messiah' });
    expect(answersLeadSplit('Regarding ')).toEqual({ lead: '', rest: 'Regarding ' });
  });
  it('a dated header is told apart without a pattern over the text', () => {
    expect(isDateHead('_7/5/10_ **_From The Lord_**')).toBe(true);
    expect(isDateHead('_12/31/2011_ x')).toBe(true);
    expect(isDateHead('_From The Lord_')).toBe(false);
    expect(isDateHead('_7/5_ x')).toBe(false);
    expect(dateOfHead('_3/29/06_ x')).toBe('3/29/06');
    expect(dateOfHead('text')).toBe('');
  });
  it('minutes at 200 words a minute, never under 1; media words in one order', () => {
    expect(answersMinutes({ words: 50 })).toBe(1);
    expect(answersMinutes({ words: 2500 })).toBe(13);
    expect(answersMinutes(null)).toBe(1);
    expect(answersMediaKinds({ media: [{ kind: 'download' }, { kind: 'image', at: 3 }, { kind: 'audio' }, { kind: 'playlist' }, { kind: 'image', at: -1 }] }))
      .toEqual(['video', 'audio', 'chart', 'downloads']);
  });
});

describe('on the real corpus', () => {
  it('row subs say the size, then the media', () => {
    expect(show(answersRowSub(E('answers-main-page'), M['answers-main-page']))).toBe('12~passages~· ~12~min~· video~· downloads');
    expect(show(answersSizeWords(E('false-doctrines-within-the-churches-of-men-regarding'), M['false-doctrines-within-the-churches-of-men-regarding']))).toBe('46~categories');
    // before the sidecar lands, no minutes are guessed
    expect(show(answersSizeWords(E('answers-main-page'), null))).toBe('12~passages');
  });
  it('the shelves in the sidebar\'s order: ten commandments, Other Topics (16), twelve groups', () => {
    const b = answersBrowseShelves(A);
    expect(b.commandments).toHaveLength(10);
    expect(b.commandments.reduce((n, s) => n + s.topics.length, 0)).toBe(19);
    expect(b.otherTopics).toHaveLength(16);
    expect(b.otherTopics[0].title).toBe('The Volumes of Truth');
    expect(b.other.notInMenu.map((e) => e.title)).toEqual(['Come Out and Fight Against Me']);
    expect(b.groups.map((g) => `${g.num}:${g.short}:${g.topics.length}`)).toEqual([
      '1:Signs of this generation:7', '2:Prophets, witnesses & gifts:6', '3:The nations:4', '4:The churches:7',
      '5:Scripture & doctrine:9', '6:Holy Days, cross & resurrection:7', '7:Forgiveness to salvation:5',
      '8:The end & the Kingdom:6', '9:Warfare, sin, death & judgment:8', '10:The walk of faith:12',
      '11:Body, marriage & family:6', '12:People of the Bible & creation:8',
    ]);
    expect(b.index.kind).toBe('index');
    expect(answersShelfByKey(A, '5').topics).toHaveLength(9);
    expect(answersShelfByKey(A, 'other').topics).toHaveLength(16);
    expect(answersShelfByKey(A, '13')).toBeNull();
  });
  it('a topic\'s place in the words a row uses', () => {
    expect(answersPlaceOf(A, 'answers-main-page')).toBe('Main Page');
    expect(answersPlaceOf(A, 'false-doctrines-within-the-churches-of-men-regarding')).toBe('False Doctrines index');
    expect(answersPlaceOf(A, 'god-speaks-about-the-sabbath')).toBe('The Fourth Commandment');
    expect(show(answersPlaceOf(A, answersShelfByKey(A, '5').topics[0].id))).toBe('5~· Scripture & doctrine');
    expect(answersPlaceOf(A, 'come-out-and-fight-against-me')).toBe('Other Topics');
  });
  it('every question opens a topic that exists; six are chips', () => {
    expect(ANSWERS_QUESTIONS).toHaveLength(12);
    for (const [label, id] of ANSWERS_QUESTIONS) {
      expect(label.startsWith('…') && label.endsWith('?'), label).toBe(true);
      expect(E(id), id).toBeTruthy();
    }
  });
  it('A–Z holds every topic once (no Main Page), grouped by letter', () => {
    const az = answersAZGroups(A);
    expect(az.map((g) => g.letter + g.entries.length).join(' ')).toBe('#1 A10 B4 C12 D6 E1 F10 G1 H8 I4 J2 K1 L1 M5 N5 O3 P9 R1 S13 T12 U3 V3 W6');
    const ids = az.flatMap((g) => g.entries.map((e) => e.id));
    expect(new Set(ids).size).toBe(121);
    expect(ids).not.toContain('answers-main-page');
  });
  it('source lines split into title and collection; inline marks keep every character', () => {
    expect(answersSourceParts('~ [From “Pentecost” ~ Volume 6]')).toEqual({ title: '“Pentecost”', collection: 'Volume 6' });
    expect(answersSourceParts('~ [From “A ~ B” ~ Volume 2]')).toEqual({ title: '“A ~ B”', collection: 'Volume 2' });
    expect(answersSourceParts('Not a source line')).toBeNull();
    expect(answersInlinePieces('a **b** _c_\nd{{ref:John 3:16}}{{x}}')).toEqual([
      { t: 'a ', b: false, i: false }, { t: 'b', b: true, i: false }, { t: ' ', b: false, i: false },
      { t: 'c', b: false, i: true }, { t: '', br: true }, { t: 'd(John 3:16)', b: false, i: false },
    ]);
    expect(answersWordCount('**One** _two_ three\nfour')).toBe(4);
  });
  it('the answer of the day: whole excerpts of 12-80 words, the same for everyone, turning at local midnight', () => {
    const pool = answersDailyPool(A, M);
    expect(pool.length).toBe(355);
    expect(pool[0]).toEqual({ id: 'there-is-no-other', head: 0, quote: [1], attr: 2 });
    for (const x of pool) {
      const P = E(x.id).paragraphs;
      expect(x.quote.every((k) => k > x.head && k < x.attr && !isDateHead(P[k].text)), x.id).toBe(true);
      const words = x.quote.reduce((n, k) => n + answersWordCount(P[k].text), 0);
      expect(words >= 12 && words <= 80 && words <= 120, x.id).toBe(true);
    }
    expect(answersDayNumber(new Date(2026, 9, 20, 0, 1))).toBe(answersDayNumber(new Date(2026, 9, 20, 23, 59)));
    expect(answersDayNumber(new Date(2026, 9, 21))).toBe(answersDayNumber(new Date(2026, 9, 20)) + 1);
    expect(answersDailyPick(pool, new Date(2026, 9, 20))).toBe(pool[answersDayNumber(new Date(2026, 9, 20)) % pool.length]);
    expect(answersDailyPick([], new Date())).toBeNull();
    expect(answersDailyPool(A, null)).toEqual([]);
  });
  it('"Open to an answer" lands only on a quote paragraph', () => {
    const op = answersOpenablePool(A, M);
    expect(op.length).toBe(2255);
    for (const { id, index } of op.slice(0, 400)) {
      const p = E(id).paragraphs[index];
      expect(p.align).toBe('justify');
      expect(isDateHead(p.text)).toBe(false);
    }
  });
  it('the reading path: start, then the first unread topic after the last one finished, then again', () => {
    const order = answersSiteOrder(A);
    expect(answersPathState(A, () => false, null)).toMatchObject({ kind: 'start', n: 0 });
    expect(answersPathState(A, () => false, null).entry.id).toBe('answers-main-page');
    const read = new Set([order[0].id, order[1].id]);
    const p = answersPathState(A, (id) => read.has(id), order[1].id);
    expect(p).toMatchObject({ kind: 'continue', n: 2 });
    expect(p.entry.id).toBe(order[2].id);
    read.add(order[3].id);
    // the next unread one is skipped past a topic already read
    expect(answersPathState(A, (id) => read.has(id), order[1].id).entry.id).toBe(order[2].id);
    read.add(order[2].id);
    expect(answersPathState(A, (id) => read.has(id), order[2].id).entry.id).toBe(order[4].id);
    expect(answersPathState(A, () => true, order[5].id).kind).toBe('again');
    // a topic that is not read is no pointer
    expect(answersPathState(A, () => false, order[9].id).kind).toBe('start');
  });
  it('Charts & videos lists every item the sidecars name, nothing fetched', () => {
    const mi = answersMediaIndex(A, M);
    expect([mi.charts.length, mi.videos.length, mi.lists.length, mi.files.length]).toEqual([2, 4, 13, 7]);
    expect(mi.files.map((f) => f.id + ':' + f.at)).toEqual([
      'answers-main-page:78', 'answers-main-page:80', 'answers-the-volumes-of-truth:217', 'the-name-of-the-lord:149',
      'regarding-the-holy-days-of-god:195', 'regarding-the-holy-days-of-god:196', 'false-doctrines-within-the-churches-of-men-regarding:70',
    ]);
    for (const v of mi.videos) expect(String(v.url)).toMatch(/^https:\/\/(www\.)?youtube\.com\/|^https:\/\/youtu\.be\//);
    for (const c of mi.charts) expect(c.ids.length).toBeGreaterThan(0);
  });
});
