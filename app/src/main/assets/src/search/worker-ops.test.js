/* The search worker's side (sr9 refuter r1, 2026-10-14): while the meaning model loads, the worker tells the
   page it is alive every few seconds, so the page waits out a slow download and gives up only a silent worker. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleWorkerMessage } from './worker-ops.js';
import MiniSearch from './vendor/minisearch.js';
import { buildMiniSearchOptions } from './search-config.js';
import { indexAssembler } from './index-transfer.js';
import { configureSemantic, resetSemantic } from './semantic.js';

afterEach(() => {
  resetSemantic();
  vi.useRealTimers();
});

describe('meaning-start', () => {
  it('says it is alive every 5 s while the model loads, and stops once it answers', async () => {
    vi.useFakeTimers();
    // a download that takes 12 s and then drops
    configureSemantic({ load: () => new Promise((_r, reject) => setTimeout(() => reject(new Error('dropped')), 12000)) });
    const posts = /** @type {any[]} */ ([]);
    const done = handleWorkerMessage({ id: 7, op: 'meaning-start', base: 'http://localhost/' }, (m) => posts.push(m));
    await vi.advanceTimersByTimeAsync(12500);
    await done;
    expect(posts.filter((m) => m.alive)).toEqual([{ id: 7, alive: true }, { id: 7, alive: true }]);
    const last = posts[posts.length - 1];
    expect(last).toMatchObject({ id: 7, done: true, ok: false });
    await vi.advanceTimersByTimeAsync(20000);
    expect(posts[posts.length - 1]).toBe(last); // nothing after the answer
  });
});

/* A cold build on the worker (search200 h8, 2026-11-04): the docs come a part at a time, the index goes back in a
   restore's parts, and the warm cache is written here under the signature the page names (none: kept out). */
describe('build', () => {
  const OPTIONS = buildMiniSearchOptions();
  const docs = Array.from({ length: 2300 }, (_, i) => ({ id: 'd' + i, kind: 'verse', title: '', text: 'grace and mercy verse ' + i + (i % 7 ? ' still waters' : ' cedar') }));

  /** @param {any} save */
  async function buildIn(save) {
    const posts = /** @type {any[]} */ ([]);
    const post = (/** @type {any} */ m) => posts.push(structuredClone(m));
    for (let i = 0, n = 0; i < docs.length; i += 1000, n++) await handleWorkerMessage({ id: 1 + n, op: 'build-add', key: 'k', first: i === 0, docs: docs.slice(i, i + 1000) }, post);
    await handleWorkerMessage({ id: 9, op: 'build-end', key: 'k', save }, post);
    let asm = /** @type {any} */ (null);
    for (const m of posts.filter((p) => p.id === 9 && !p.done)) {
      if (m.head) asm = indexAssembler(MiniSearch, m.head, OPTIONS);
      else asm.add(m.part, m.entries);
    }
    return { posts, ms: asm.ms };
  }

  it('posts back the index the page would have built, and writes the warm cache under the signature named', async () => {
    const put = vi.fn(() => Promise.resolve());
    vi.stubGlobal('caches', { open: () => Promise.resolve({ put, match: () => Promise.resolve(undefined) }) });
    try {
      const { posts, ms } = await buildIn('sig-1');
      const page = new MiniSearch(OPTIONS);
      page.addAll(docs);
      // as a restore of its JSON has it (a term tree assembled in its own order: loadJSON's)
      expect(JSON.stringify(ms)).toBe(JSON.stringify(MiniSearch.loadJSON(JSON.stringify(page), OPTIONS)));
      expect(posts.filter((p) => p.done && p.id < 9).map((p) => p.count)).toEqual([1000, 2000, 2300]);
      expect(posts.find((p) => p.id === 9 && p.done)).toMatchObject({ docCount: 2300 });
      expect(put).toHaveBeenCalledTimes(1);
      const [, res] = /** @type {any} */ (put.mock.calls[0]);
      expect(res.headers.get('x-vot-index-sig')).toBe('sig-1');
      expect(await res.text()).toBe(JSON.stringify(page));
      // the build is gone once ended
      const again = /** @type {any[]} */ ([]);
      await handleWorkerMessage({ id: 10, op: 'build-end', key: 'k' }, (m) => again.push(m));
      expect(again[0].error).toMatch(/no build/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps an index out of the warm cache when the page names no signature', async () => {
    const put = vi.fn(() => Promise.resolve());
    vi.stubGlobal('caches', { open: () => Promise.resolve({ put, match: () => Promise.resolve(undefined) }) });
    try {
      await buildIn(null);
      expect(put).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
