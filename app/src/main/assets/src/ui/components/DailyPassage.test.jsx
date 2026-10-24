// @ts-nocheck: reads the Answers corpus with node:fs and stubs free-var globals
/* n173: Home's passage for the day. The same words all day for everyone (Answers' own date-seeded
   pick), word for word from the corpus, opened where it sits; Home never loads a corpus to show it,
   and a corpus that lands mid-visit never pushes Home's cards. */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, renderHook, cleanup, fireEvent, screen, act } from '@testing-library/react';

const loads = vi.hoisted(() => ({ answers: 0, meta: 0 }));
vi.mock('../../utils/sync-loaders.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    loadAnswers: () => { loads.answers++; return Promise.resolve(); },
    loadAnswersMeta: () => { loads.meta++; return Promise.resolve(); },
  };
});

import { DailyPassage, useDailyPassage, DAILY_SETTLE_MS } from './DailyPassage.jsx';
import { answersDailyPool, answersDailyPick } from '../../utils/answers-browse.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../data');
let CORPUS;
beforeAll(() => {
  const g = {};
  // Each file is `var ANSWERS = …` / `var ANSWERS_META = …`; read them into a scope, not onto the page.
  new Function('g', readFileSync(resolve(DATA, 'answers.js'), 'utf8') + '\n;g.ANSWERS = ANSWERS;')(g);
  new Function('g', readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8') + '\n;g.ANSWERS_META = ANSWERS_META;')(g);
  CORPUS = g;
});

function putCorpus() {
  globalThis.ANSWERS = CORPUS.ANSWERS;
  window.ANSWERS_META = CORPUS.ANSWERS_META;
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete globalThis.ANSWERS;
  delete window.ANSWERS_META;
  loads.answers = 0;
  loads.meta = 0;
});

describe('useDailyPassage', () => {
  it('is the Answer of the day: the same pick, its words and its source, for a date', () => {
    putCorpus();
    const now = new Date();
    const { result } = renderHook(() => useDailyPassage());
    const pick = answersDailyPick(answersDailyPool(CORPUS.ANSWERS, CORPUS.ANSWERS_META), now);
    const entry = CORPUS.ANSWERS.find((e) => e.id === pick.id);
    expect(result.current.id).toBe(pick.id);
    expect(result.current.quote).toEqual(pick.quote.map((i) => entry.paragraphs[i].text));
    expect(result.current.anchor).toBe(entry.paragraphs[pick.quote[0]].text);
    expect(entry.paragraphs[pick.attr].text).toContain(result.current.title);
    expect(result.current.collection).toBeTruthy();
  });

  it('every day of a year has a passage, and a day keeps its own all day', () => {
    const pool = answersDailyPool(CORPUS.ANSWERS, CORPUS.ANSWERS_META);
    expect(pool.length).toBeGreaterThan(300);
    for (let d = 0; d < 366; d++) {
      const morning = new Date(2027, 0, 1 + d, 0, 1);
      const night = new Date(2027, 0, 1 + d, 23, 59);
      expect(answersDailyPick(pool, morning)).toBe(answersDailyPick(pool, night));
    }
  });

  it('loads nothing while Home settles, nothing on a device without the files, and reads them once they are there', async () => {
    vi.useFakeTimers();
    renderHook(() => useDailyPassage());
    expect(loads.answers).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(DAILY_SETTLE_MS + 5000); });
    expect(loads.answers).toBe(0); // jsdom: no caches, so it would be a download
    cleanup();
    vi.stubGlobal('caches', { match: vi.fn(async (u) => (/answers(-meta)?\.js$/.test(u) ? {} : undefined)) });
    renderHook(() => useDailyPassage());
    await act(async () => { await vi.advanceTimersByTimeAsync(DAILY_SETTLE_MS - 100); });
    expect(loads.answers).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(loads.answers).toBe(1);
    expect(loads.meta).toBe(1);
  });
});

describe('DailyPassage', () => {
  it('shows the passage with its source and opens it where it sits', () => {
    putCorpus();
    const { result } = renderHook(() => useDailyPassage());
    const onOpen = vi.fn();
    render(<DailyPassage pick={result.current} onOpen={onOpen} />);
    const btn = screen.getByRole('button', { name: /^Answer of the day/ });
    expect(btn.textContent).toContain(result.current.title);
    expect(btn.textContent).not.toContain('{{ref:');
    expect(btn.textContent).not.toContain('**');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith(result.current.id, result.current.anchor);
  });
});
