/* A cold build runs on the search worker (search200 h8, 2026-11-04).
   ─────────────────────────────────────────────────────────────────────────────
   The page collects the docs and sends them to the worker a part at a time; the worker
   builds the index and posts it back in a restore's parts (index-transfer.js). The index
   the page assembles answers as the one it would have built itself. A worker that fails
   part way leaves the build to the page, as a page with no worker always had it. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleWorkerMessage } from './worker-ops.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'is', 'my', 'of', 'and']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { psalms: 'psalms', ps: 'psalms' },
  BOOK_DISPLAY: { psalms: 'Psalms' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['psalms'], NT_BOOK_IDS: [], GENRE_GROUPS: { poetry: ['psalms'] },
  WORD_NUMS: {}, ROMAN_NUMS: {},
};
// 2,500 verses: three of the page's parts of 1,000
const WORDS = ['shepherd', 'still', 'waters', 'righteous', 'cedar', 'lebanon', 'mercy', 'grace'];
const verses = Array.from({ length: 2500 }, (_, i) => ({ n: i + 1, text: 'The LORD is my ' + WORDS[i % 8] + ' and ' + WORDS[(i * 3) % 8] + ' verse ' + i }));
const BOOKS = { psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 23, sections: [{ heading: '', verses }] }] } };

/** What the worker was asked, by op; `failOn`: an op it answers with an error. */
let asked = /** @type {string[]} */ ([]);
let failOn = '';
class InProcessWorker {
  constructor() { /** @type {any} */ this.onmessage = null; this.onerror = null; this.onmessageerror = null; }
  postMessage(/** @type {any} */ msg) {
    asked.push(msg.op);
    // a clone each way, as postMessage makes one
    const post = (/** @type {any} */ m) => { const c = structuredClone(m); Promise.resolve().then(() => this.onmessage && this.onmessage({ data: c })); };
    const data = structuredClone(msg);
    if (msg.op === failOn) { post({ id: msg.id, done: true, error: 'worker refused ' + msg.op }); return; }
    void handleWorkerMessage(data, post);
  }
  terminate() {}
}

/** @param {boolean} withWorker */
async function freshEngine(withWorker) {
  const g = /** @type {any} */ (globalThis);
  window.VotSearchData = VOT_DATA;
  g.BOOKS = BOOKS;
  g.caches = undefined;   // no warm index: a cold build
  if (withWorker) vi.stubGlobal('Worker', InProcessWorker);
  else vi.stubGlobal('Worker', undefined);
  vi.resetModules();
  return (await import('./engine.js')).VotSearchMini;
}

describe('a cold build on the search worker', () => {
  let prevData, prevCaches;
  beforeEach(() => {
    const g = /** @type {any} */ (globalThis);
    prevData = window.VotSearchData; prevCaches = g.caches;
    asked = [];
    failOn = '';
  });
  afterEach(() => {
    const g = /** @type {any} */ (globalThis);
    window.VotSearchData = prevData; g.caches = prevCaches;
    delete g.BOOKS;
    vi.unstubAllGlobals();
  });
  const ids = (/** @type {any} */ r) => r.results.map((/** @type {any} */ e) => e.doc.verseNum);

  it('builds the index on the worker, and it answers as the page-built one does', async () => {
    const E = await freshEngine(true);
    const progress = /** @type {number[]} */ ([]);
    await E.init({ onProgress: (/** @type {number} */ d) => progress.push(d) });
    expect(E.getStats().builtIn).toBe('worker');
    expect(asked.filter((o) => o === 'build-add').length).toBe(3);
    expect(asked).toContain('build-end');
    expect(E.getState()).toMatchObject({ ready: true, docCount: 2500 });
    expect(progress[progress.length - 1]).toBe(2500);
    const viaWorker = [ids(await E.search('shepherd waters')), ids(await E.search('cedar')), ids(await E.search('verse 2499'))];

    const P = await freshEngine(false);
    await P.init();
    expect(P.getStats().builtIn).toBeUndefined();
    expect([ids(await P.search('shepherd waters')), ids(await P.search('cedar')), ids(await P.search('verse 2499'))]).toEqual(viaWorker);
    expect(viaWorker[0].length).toBeGreaterThan(0);
  });

  it('a worker that fails part way leaves the build to the page', async () => {
    failOn = 'build-end';
    const E = await freshEngine(true);
    await E.init();
    expect(asked).toContain('build-end');
    expect(E.getStats().builtIn).toBeUndefined();
    expect(E.getState().ready).toBe(true);
    expect((await E.search('shepherd')).results.length).toBeGreaterThan(0);
  });
});
