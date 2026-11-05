/* The warm read on the search worker (search200 h8 round 2, 2026-11-04): the originals' keys, the runs and the token
   store the worker reads of the index it just built or restored, with the KJV wording read from the page's file,
   arrive on the page as the page reads them itself (warm-read.js readWarm on the page's own index and wording). A key
   it does not hold, or a wording file it cannot read, is an error: the page reads them then. Synthetic texts only. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleWorkerMessage } from './worker-ops.js';
import MiniSearch from './vendor/minisearch.js';
import { buildMiniSearchOptions } from './search-config.js';
import { indexAssembler } from './index-transfer.js';
import { readWarm } from './warm-read.js';
import { encodeKjvTwin, parseKjvTwin, twinView } from './kjv-twin.js';

const BIBLE = {
  alpha: {
    1: [
      { n: 1, text: 'The lamp of the watchman burneth in the tower; and the gate is shut. Thou shalt keep the gate.' },
      { n: 2, text: 'Whereof the keeper spake unto the porter, saying, Open thou the gate!' },
    ],
  },
};
const TWIN_JSON = JSON.stringify(encodeKjvTwin(BIBLE, 'fixture'));
const LONG = 'The porter keeps the door of the house and the porter watches over the gate of the city by night. ';
const docs = [
  { id: 'v1', kind: 'verse', bookId: 'alpha', chapterNum: 1, verseNum: 1, translation: 'nkjv', title: '', text: 'The watchman lights his lamp in the tower, and the gate is closed. You shall keep the gate.' },
  { id: 'v2', kind: 'verse', bookId: 'alpha', chapterNum: 1, verseNum: 2, translation: 'nkjv', title: '', text: 'About this the keeper spoke to the doorman, saying, Open the gate!' },
  ...Array.from({ length: 40 }, (_, i) => ({ id: 'l' + i, kind: i % 3 ? 'letter' : 'answers', title: 'Letter ' + i, text: LONG.repeat(1 + (i % 4)) + 'YahuShua said the word ' + i + ' to the porter of the house.' })),
  { id: 'w1', kind: 'wtlb', title: 'Words', text: LONG + 'Ears to Hear.' },
];

afterEach(() => vi.unstubAllGlobals());

/** Build on the worker, under `key`; the page's index as it assembles it from the parts. */
async function buildThere(/** @type {string} */ key) {
  const posts = /** @type {any[]} */ ([]);
  await handleWorkerMessage({ id: 1, op: 'build-add', key, first: true, docs: structuredClone(docs) }, (m) => posts.push(structuredClone(m)));
  await handleWorkerMessage({ id: 2, op: 'build-end', key, save: null }, (m) => posts.push(structuredClone(m)));
  let asm = /** @type {any} */ (null);
  for (const m of posts.filter((p) => p.id === 2 && !p.done)) {
    if (m.head) asm = indexAssembler(MiniSearch, m.head, buildMiniSearchOptions());
    else asm.add(m.part, m.entries);
  }
  return asm.ms;
}
/** Ask the worker for its warm read; what the page receives. */
async function warmThere(/** @type {any} */ msg) {
  const posts = /** @type {any[]} */ ([]);
  await handleWorkerMessage({ id: 3, op: 'warm', ...msg }, (m) => posts.push(structuredClone(m)));
  const O = new Map();
  const S = new Map();
  let store = null;
  for (const m of posts) {
    if (m.part === 'originals') for (const [k, v] of m.entries) O.set(k, v);
    else if (m.part === 'shingles') for (const [k, v] of m.entries) S.set(k, v);
    else if (m.part === 'store') store = m.store;
  }
  return { O, S, store, done: posts[posts.length - 1] };
}
const plain = (/** @type {any} */ st) => { const { ms: _ms, ...rest } = st; for (const k of Object.keys(rest)) if (ArrayBuffer.isView(rest[k])) rest[k] = Array.from(/** @type {any} */ (rest[k])); return rest; };

describe('warm on the worker', () => {
  it('reads what the page reads, with the KJV wording from the page\'s file', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(TWIN_JSON, { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    const page = await buildThere('b1');
    const got = await warmThere({ key: 'b1', twin: 'http://localhost/search-kjv-twin.json' });
    expect(got.done).toMatchObject({ done: true });
    expect(got.done.error).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('http://localhost/search-kjv-twin.json');
    const V = twinView(parseKjvTwin(JSON.parse(TWIN_JSON)), page);
    expect(V).not.toBeNull();
    const want = readWarm(page, V);
    expect([...got.O]).toEqual([...want.O]);
    expect([...got.S]).toEqual([...want.S]);
    expect(plain(got.store)).toEqual(plain(want.store));
    expect(want.O.size).toBeGreaterThan(5);
    expect(want.S.size).toBeGreaterThan(5);
    // the KJV wording is in: a verse's KJV sentence is a key, and its tokens follow its own in the store
    expect([...want.O.keys()].some((k) => k.includes('watchman burneth'))).toBe(true);
  });

  it('reads an index restored from the warm cache as it reads a built one (every launch after the first)', async () => {
    const built = await buildThere('b5');
    const stored = new Response(JSON.stringify(built), { headers: { 'x-vot-index-sig': 'sig-1' } });
    vi.stubGlobal('caches', { open: async () => ({ match: async () => stored.clone() }) });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(TWIN_JSON, { status: 200 }))));
    const posts = /** @type {any[]} */ ([]);
    await handleWorkerMessage({ id: 4, op: 'restore', sig: 'sig-1', key: 'r1' }, (m) => posts.push(structuredClone(m)));
    let asm = /** @type {any} */ (null);
    for (const m of posts.filter((p) => !p.done)) {
      if (m.head) asm = indexAssembler(MiniSearch, m.head, buildMiniSearchOptions());
      else asm.add(m.part, m.entries);
    }
    const page = asm.ms;
    const got = await warmThere({ key: 'r1', twin: 'http://localhost/search-kjv-twin.json' });
    expect(got.done.error).toBeUndefined();
    const want = readWarm(page, twinView(parseKjvTwin(JSON.parse(TWIN_JSON)), page));
    expect(want.O.size).toBeGreaterThan(5);
    expect([...got.O]).toEqual([...want.O]);
    expect([...got.S]).toEqual([...want.S]);
    expect(plain(got.store)).toEqual(plain(want.store));
  });

  it('reads without a wording when the page has none', async () => {
    const page = await buildThere('b2');
    const got = await warmThere({ key: 'b2', twin: null });
    const want = readWarm(page, null);
    expect([...got.O]).toEqual([...want.O]);
    expect(plain(got.store)).toEqual(plain(want.store));
  });

  it('an index it no longer holds, or a wording it cannot read, is an error', async () => {
    await buildThere('b3');
    expect((await warmThere({ key: 'other', twin: null })).done.error).toMatch(/no index/);
    await buildThere('b4');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('nope', { status: 404 }))));
    expect((await warmThere({ key: 'b4', twin: 'http://localhost/elsewhere.json' })).done.error).toMatch(/kjv twin/);
    // it let the index go once asked
    expect((await warmThere({ key: 'b4', twin: null })).done.error).toMatch(/no index/);
  });
});
