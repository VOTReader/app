// @ts-nocheck
/* AnswersTopic — a landing re-renders the paragraph it names, not the page. A search landing, an
   excerpt jump or a note's "Show in the page" pulses one paragraph (on, then off 4 s later); before
   Para was memoised each of those re-ran every paragraph's plan and decorations (~25 ms in jsdom on
   the longest topic, 316 paragraphs). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const planCalls = [];
vi.mock('../../utils/answers-topic.js', async (orig) => {
  const m = await orig();
  return { ...m, answersParaPlan: (e, meta, i) => { planCalls.push(i); return m.answersParaPlan(e, meta, i); } };
});
const { AnswersTopic } = await import('./AnswersTopic.jsx');

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS, M = ctx.ANSWERS_META;
const E = A.find((e) => e.id === 'regarding-the-holy-days-of-god');

beforeEach(() => { globalThis.ReactDOM = ReactDOM; globalThis.StaticSubtree = ({ children }) => <>{children}</>; });
afterEach(() => { cleanup(); delete globalThis.StaticSubtree; });

const page = (landedPara) => (
  <AnswersTopic entry={E} entries={A} meta={M[E.id]} metaAll={M} site={null} ready={true} ts2={false} landedPara={landedPara}
    mainRef={{ current: null }} isRead={() => false} pathOn={false} findOn={false} act={{ cite() {}, jump() {}, source() {}, letter() {} }} nav={{}} />
);

describe('AnswersTopic — a landing re-renders one paragraph', () => {
  it('pulses the landed paragraph and plans only it (and the one it leaves) again', () => {
    const r = render(page(-1));
    expect(planCalls.length).toBeGreaterThan(20);
    planCalls.length = 0;
    r.rerender(page(5));
    expect(document.querySelector('[data-hl-key="wtlb:' + E.id + ':5"]').className).toContain('pulse');
    expect(planCalls).toEqual([5]);
    planCalls.length = 0;
    r.rerender(page(-1));
    expect(document.querySelector('[data-hl-key="wtlb:' + E.id + ':5"]').className).not.toContain('pulse');
    expect(planCalls).toEqual([5]);
  });
});
