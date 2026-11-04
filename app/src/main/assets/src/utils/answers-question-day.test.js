// @ts-nocheck — reads the corpus file the way the app's own gates do
/* answers-question-day — the Today card's one Answers question a day. The rule runs on the shipped
   title index only (no corpus at draw time); these tests hold it to the whole corpus, so a re-vendor
   that empties a page, renames a topic or adds one cannot slip a dead question in. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
  answersQuestionSubject, answersQuestionPool, answersQuestionOfDay, questionStride, shippedQuestionPool,
  SEE_ONLY, QUESTION_LEAD_IN,
} from './answers-question-day.js';
import { ANSWERS_TITLES } from './answers-url-index.js';
import { isAttribution, isDateHead } from './answers-shelves.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
const A = ctx.ANSWERS;
const byId = new Map(A.map((e) => [e.id, e]));

/** A topic that opens to real content: a quote (5+ words) with its source line under it, and 150 words in all. */
function opensToContent(e) {
  const P = (e && e.paragraphs) || [];
  const count = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
  let run = 0, quoted = false;
  for (const p of P) {
    const t = String(p.text || '');
    if (isAttribution(t)) { if (run >= 5) quoted = true; run = 0; }
    else if (t.trim() === '✦') run = 0;
    else if (!isDateHead(t)) run += count(t);
  }
  return quoted && P.reduce((n, p) => n + count(p.text), 0) >= 150;
}

describe('the question rule over the whole Answers index', () => {
  const pool = answersQuestionPool(ANSWERS_TITLES);

  it('the title index is the corpus: every topic, and the same titles', () => {
    expect(Object.keys(ANSWERS_TITLES).sort()).toEqual(A.map((e) => e.id).sort());
    for (const [id, title] of Object.entries(ANSWERS_TITLES)) expect(byId.get(id) && byId.get(id).title, id).toBe(title);
  });

  it('94 of the 122 titles pass, and every one opens to a sourced quote', () => {
    expect(Object.keys(ANSWERS_TITLES)).toHaveLength(122);
    expect(pool).toHaveLength(94);
    for (const q of pool) expect(opensToContent(byId.get(q.id)), q.id).toBe(true);
  });

  it('SEE_ONLY is exactly the question titles whose page has no quote (a "See:" list)', () => {
    const seeOnly = Object.keys(ANSWERS_TITLES).filter((id) => answersQuestionSubject(ANSWERS_TITLES[id]) && !opensToContent(byId.get(id)));
    expect(seeOnly).toEqual([...SEE_ONLY]);
  });

  it('reads as a question a reader would ask: the site\'s subject after one lead-in, no labels, no question inside', () => {
    for (const q of pool) {
      expect(q.subject).not.toMatch(/[()]/);
      expect(q.subject).not.toMatch(/^(What|Who)\b/i);
      expect(ANSWERS_TITLES[q.id].endsWith(q.subject)).toBe(true);   // the site's words, as written
    }
    expect(answersQuestionSubject('Regarding the Days of Noah')).toBe('the Days of Noah');
    expect(answersQuestionSubject('Thus Says The Lord Regarding Abortion')).toBe('Abortion');
    expect(answersQuestionSubject('God Speaks About The Sabbath')).toBe('The Sabbath');
    expect(answersQuestionSubject('God Rebukes New Age Spirituality')).toBe('');
    expect(answersQuestionSubject('Regarding Prophets (True)')).toBe('');
    expect(answersQuestionSubject('Regarding Who Killed The Messiah')).toBe('');
    expect(answersQuestionSubject('Parables')).toBe('');
    expect(answersQuestionSubject(null)).toBe('');
  });

  it('the shipped pool is the same list', () => {
    expect(shippedQuestionPool()).toEqual(pool);
  });
});

describe('the day', () => {
  const pool = shippedQuestionPool();

  it('the same question all day, and the next one after local midnight', () => {
    const morning = answersQuestionOfDay(pool, new Date(2026, 10, 4, 0, 0, 1));
    const night = answersQuestionOfDay(pool, new Date(2026, 10, 4, 23, 59, 59));
    const next = answersQuestionOfDay(pool, new Date(2026, 10, 5, 0, 0, 1));
    expect(night).toEqual(morning);
    expect(next.id).not.toBe(morning.id);
    expect(morning.text).toBe(QUESTION_LEAD_IN + ' ' + morning.subject + '?');
  });

  it('every question comes round once per cycle, and neighbouring days are not neighbouring topics', () => {
    const seen = new Set();
    for (let d = 0; d < pool.length; d++) seen.add(answersQuestionOfDay(pool, new Date(2026, 0, 1 + d)).id);
    expect(seen.size).toBe(pool.length);
    expect(questionStride(pool.length)).toBeGreaterThan(1);
    const a = pool.findIndex((q) => q.id === answersQuestionOfDay(pool, new Date(2026, 0, 1)).id);
    const b = pool.findIndex((q) => q.id === answersQuestionOfDay(pool, new Date(2026, 0, 2)).id);
    expect(Math.abs(a - b)).toBeGreaterThan(1);
  });

  it('nothing to pick from: null', () => {
    expect(answersQuestionOfDay([], new Date())).toBeNull();
    expect(answersQuestionPool(null)).toEqual([]);
    expect(answersQuestionPool({})).toEqual([]);
  });
});
