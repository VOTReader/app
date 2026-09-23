// @ts-nocheck — reads the corpus files the way the app's own gates do
/* answers-shelves — the Answers landing's two shelves, held to the data.
   The subjects are the APP'S grouping of the site's topics, so the only thing
   standing between a regenerated answers.js and a topic silently missing from
   the landing (or listed twice) is this file. The commandment verses are
   quoted, so they are held to the app's own NKJV word for word. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
  ANSWERS_COMMANDMENTS, ANSWERS_SUBJECTS, answersCommandmentTopics, answersPassageCount,
  answersShortTitle, answersSortKey, answersIndexLetter, answersSubjectById,
} from './answers-shelves.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
function load(file, name) {
  const src = readFileSync(resolve(DATA, file), 'utf8').replace(/^(const|let) /gm, 'var ');
  const ctx = { window: {} };
  runInNewContext(src, ctx);
  return ctx[name] || ctx.window[name];
}
const ANSWERS = load('answers.js', 'ANSWERS');

describe('ANSWERS_SUBJECTS — every topic has exactly one home on the landing', () => {
  const commandmentIds = ANSWERS.filter((e) => /^Commandment \d+$/.test(e.group)).map((e) => e.id);
  const subjectIds = ANSWERS_SUBJECTS.flatMap((s) => s.topics);

  it('names only topics that exist in the data', () => {
    const known = new Set(ANSWERS.map((e) => e.id));
    expect(subjectIds.filter((id) => !known.has(id))).toEqual([]);
  });

  it('places no topic twice, and no commandment topic in a subject', () => {
    expect(subjectIds.length).toBe(new Set(subjectIds).size);
    expect(subjectIds.filter((id) => commandmentIds.includes(id))).toEqual([]);
  });

  it('leaves no topic out: commandments + subjects = the whole site', () => {
    const placed = new Set([...commandmentIds, ...subjectIds]);
    expect(ANSWERS.filter((e) => !placed.has(e.id)).map((e) => e.title)).toEqual([]);
    expect(placed.size).toBe(ANSWERS.length);
  });

  it('has nine subjects with unique ids, each findable by id', () => {
    expect(ANSWERS_SUBJECTS.length).toBe(9);
    for (const s of ANSWERS_SUBJECTS) expect(answersSubjectById(s.id)).toBe(s);
    expect(answersSubjectById('no-such-subject')).toBeNull();
  });
});

describe('ANSWERS_COMMANDMENTS — the tablets', () => {
  it('are the ten, in order, and every one files at least one of the site\'s topics', () => {
    expect(ANSWERS_COMMANDMENTS.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const c of ANSWERS_COMMANDMENTS) {
      expect(answersCommandmentTopics(ANSWERS, c.n).length, c.numeral).toBeGreaterThan(0);
    }
  });

  it('quote Exodus 20 exactly as the app\'s NKJV carries it', () => {
    const BOOKS = load('books.js', 'BOOKS');
    const ch = BOOKS.exodus.chapters.find((x) => x.num === 20);
    const verse = new Map(ch.sections.flatMap((s) => s.verses).map((v) => [v.n, v.text]));
    for (const c of ANSWERS_COMMANDMENTS) {
      const m = /^Exodus 20:(\d+)$/.exec(c.ref);
      expect(m, c.ref).toBeTruthy();
      expect(c.verse, c.ref).toBe(verse.get(Number(m[1])));
    }
  });
});

describe('titles for lists', () => {
  it('drop only the site\'s lead-in phrase', () => {
    expect(answersShortTitle('Regarding Pride')).toBe('Pride');
    expect(answersShortTitle('Regarding the Day of The Lord')).toBe('The Day of The Lord');
    expect(answersShortTitle('Thus Says The Lord Regarding Abortion')).toBe('Abortion');
    expect(answersShortTitle('God Speaks About The Sabbath')).toBe('The Sabbath');
    expect(answersShortTitle('God Speaks Regarding Those Who Take His Name in Vain')).toBe('Those Who Take His Name in Vain');
    expect(answersShortTitle('God Rebukes New Age Spirituality')).toBe('New Age Spirituality');
    expect(answersShortTitle('THERE IS NO OTHER')).toBe('THERE IS NO OTHER');
    expect(answersShortTitle('The Name of The Lord')).toBe('The Name of The Lord');
  });

  it('every short title is a tail of the site\'s own title', () => {
    for (const e of ANSWERS) expect(e.title.toLowerCase().endsWith(answersShortTitle(e.title).toLowerCase()), e.title).toBe(true);
  });

  it('file A–Z by the word that matters, numbers under #', () => {
    expect(answersSortKey('Regarding the Antichrist')).toBe('Antichrist');
    expect(answersIndexLetter('Regarding the 144,000 Witnesses')).toBe('#');
    expect(answersIndexLetter('The Messiah')).toBe('M');
  });
});

describe('passage counts', () => {
  it('count the attribution lines, and add up to the site\'s 1,636', () => {
    expect(ANSWERS.reduce((a, e) => a + answersPassageCount(e), 0)).toBe(1636);
  });
});

describe('the highlight namespace', () => {
  // A topic renders in WtlbEntryView, whose highlights key on wtlb:<id>:<n> —
  // shared with WTLB One/Two, The Blessed and Holy Days. A shared id would
  // show one reader's marks on another's page.
  it('no Answers id is also a WTLB / Blessed / Holy Days id', () => {
    const others = [
      ['wtlb-one.js', 'WTLB_ONE'], ['wtlb-two.js', 'WTLB_TWO'],
      ['the-blessed.js', 'THE_BLESSED'], ['holy-days.js', 'HOLY_DAYS'],
    ].flatMap(([f, n]) => (load(f, n) || []).map((e) => e.id));
    const taken = new Set(others);
    expect(others.length).toBeGreaterThan(300);
    expect(ANSWERS.filter((e) => taken.has(e.id)).map((e) => e.id)).toEqual([]);
  });
});
