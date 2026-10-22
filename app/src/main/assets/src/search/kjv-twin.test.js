/* EVERY VERSE'S KJV WORDING (kjv-twin.js; search200 fix1 "ed", 2026-10-19): the file's code read back word for word,
   sentence by sentence; a unit scored in the KJV wording exactly as MiniSearch scores the text field, on the index's
   scale with one document count per word over both wordings; the two wordings' hits kept at the better, never the
   sum; the file's load, and its failures. Synthetic texts only (no bench query). */
import { describe, it, expect, afterEach, vi } from 'vitest';
import MiniSearch from './vendor/minisearch.js';
import { buildMiniSearchOptions } from './search-config.js';
import { kjvEncode } from './tokenize.js';
import {
  encodeKjvTwin, parseKjvTwin, twinView, twinHits, kjvReading, twinTokens, twinSentences, twinOnly, twinHolders,
  setKjvTwin, setKjvTwinSource, loadKjvTwin, kjvTwinReady, kjvTwin, kjvTwinStatus, KJV_TWIN_WAIT_MS,
} from './kjv-twin.js';
import { BM25_PARAMS } from './ranking.js';

/** A Bible as bible-kjv.js keys it: book -> chapter -> verses numbered from 1. */
const BIBLE = {
  alpha: {
    1: [
      { n: 1, text: 'The lamp of the watchman burneth in the tower; and the gate is shut.' },
      { n: 2, text: 'Whereof the keeper spake unto the porter, saying, Open thou the gate!' },
    ],
    2: [{ n: 1, text: 'And the porter opened, and the lamp went out.' }],
  },
  'matthew-plain': {
    1: [{ n: 1, text: 'The sower went forth to sow his seed by the wayside, and the fowls devoured it.' }],
  },
};
const twin = () => parseKjvTwin(JSON.parse(JSON.stringify(encodeKjvTwin(BIBLE, 'fixture'))));

/** The reader's edition: the same verses in other words, Matthew twice (the Study Bible's and the plain chapter's),
    and a letter holding a word both wordings use. */
const DOCS = [
  { id: 'v1', kind: 'verse', bookId: 'alpha', chapterNum: 1, verseNum: 1, translation: 'nkjv', title: '', text: 'The watchman lights his lamp in the tower, and the gate is closed.' },
  { id: 'v2', kind: 'verse', bookId: 'alpha', chapterNum: 1, verseNum: 2, translation: 'nkjv', title: '', text: 'About this the keeper spoke to the doorman, saying, Open the gate!' },
  { id: 'v3', kind: 'verse', bookId: 'alpha', chapterNum: 2, verseNum: 1, translation: 'nkjv', title: '', text: 'And the porter opened, and the lamp went out.' },
  { id: 'm1', kind: 'verse', bookId: 'matthew', chapterNum: 1, verseNum: 1, translation: 'nkjv', title: '', text: 'A sower went out to sow his seed along the road, and the birds ate it.' },
  { id: 'm2', kind: 'verse', bookId: 'matthew-plain', chapterNum: 1, verseNum: 1, translation: 'nkjv', title: '', text: 'A sower went out to sow his seed along the road, and the birds ate it.' },
  { id: 'l1', kind: 'letter', bookId: '', chapterNum: 0, verseNum: 0, translation: 'nkjv', title: 'The Porter', text: 'The porter keeps the door of the house, and the porter watches.' },
];
/** The index as engine.js builds it. */
const index = (docs = DOCS) => {
  const ms = new MiniSearch({ ...buildMiniSearchOptions(), storeFields: ['kind', 'bookId', 'chapterNum', 'verseNum', 'translation', 'text', 'title'] });
  ms.addAll(docs);
  return ms;
};
const sidOf = (/** @type {any} */ ms, /** @type {string} */ id) => ms._idToShortId.get(id);

describe('the KJV wording file (kjv-twin.js)', () => {
  it('reads back every verse as kjvEncode reads it, a sentence where the engine ends one', () => {
    const D = twin();
    const V = /** @type {any} */ (twinView(D, index()));
    const ms = V.ms;
    expect(twinTokens(V, sidOf(ms, 'v2'))).toEqual(kjvEncode(BIBLE.alpha[1][1].text));
    expect(twinSentences(V, sidOf(ms, 'v1'))).toEqual([
      kjvEncode('The lamp of the watchman burneth in the tower;'),
      kjvEncode(' and the gate is shut.'),
    ]);
    // Matthew both ways: the Study Bible's verse and the plain chapter's read the plain KJV
    expect(twinTokens(V, sidOf(ms, 'm1'))).toEqual(kjvEncode(BIBLE['matthew-plain'][1][0].text));
    expect(twinTokens(V, sidOf(ms, 'm2'))).toEqual(kjvEncode(BIBLE['matthew-plain'][1][0].text));
    // a letter has no KJV wording
    expect(twinTokens(V, sidOf(ms, 'l1'))).toBeNull();
    expect(twinSentences(V, sidOf(ms, 'l1'))).toEqual([]);
  });

  it('codes a vocabulary past one and two characters a word', () => {
    // 3000 words, each its own: the code's one-, two- and three-character numbers all in use
    const word = (/** @type {number} */ i) => 'q' + 'bcdfghjklmnpqrstvwxz'[i % 20] + 'bcdfghjklmnpqrstvwxz'[Math.floor(i / 20) % 20] + 'bcdfghjklmnpqrstvwxz'[Math.floor(i / 400) % 20] + 'o';
    const verses = Array.from({ length: 300 }, (_, v) => ({ n: v + 1, text: Array.from({ length: 10 }, (_, k) => word(v * 10 + k)).join(' ') + '.' }));
    const D = parseKjvTwin(JSON.parse(JSON.stringify(encodeKjvTwin({ gamma: { 1: verses } }, 'big'))));
    expect(D.words.length).toBeGreaterThan(2700);
    for (const v of [0, 150, 299]) {
      const x = /** @type {number} */ (D.keyOf.get('gamma:1:' + (v + 1)));
      const toks = Array.from(D.tok.subarray(D.vFrom[x], D.vFrom[x + 1]), (t) => D.words[t]);
      expect(toks).toEqual(kjvEncode(verses[v].text));
    }
  });

  it('refuses a Bible numbered out of order, and a file that is not one', () => {
    expect(() => encodeKjvTwin({ alpha: { 2: [{ n: 1, text: 'x y' }] } }, '')).toThrow(/chapter 2/);
    expect(() => encodeKjvTwin({ alpha: { 1: [{ n: 2, text: 'x y' }] } }, '')).toThrow(/out of order/);
    const good = encodeKjvTwin(BIBLE, 'fixture');
    expect(() => parseKjvTwin({ ...good, format: 9 })).toThrow();
    expect(() => parseKjvTwin({ ...good, verses: good.verses.slice(0, -1) })).toThrow(/verses/);
    expect(() => parseKjvTwin({ ...good, verses: good.verses + '"' })).toThrow();
    expect(() => parseKjvTwin(null)).toThrow();
  });

  it('reads no second wording for an index that holds the KJV itself', () => {
    expect(twinView(twin(), index(DOCS.map((d) => ({ ...d, translation: d.kind === 'verse' ? 'kjv' : 'nkjv' }))))).toBeNull();
  });
});

describe('a unit scored in the KJV wording', () => {
  it('scores a word only the KJV holds as MiniSearch scores the text field, on the index’s scale', () => {
    const ms = index();
    const V = /** @type {any} */ (twinView(twin(), ms));
    const opts = { prefix: false, fuzzy: false, combineWith: 'AND', boost: { title: 3, text: 1 } };
    // the KJV wordings alone, in an index of their own with the main index's text count and mean length: a word no
    // main text holds then has the same document count in both
    const kx = new MiniSearch({ ...buildMiniSearchOptions(), storeFields: ['kind'] });
    kx.addAll(DOCS.filter((d) => d.kind === 'verse').map((d) => {
      const book = d.bookId === 'matthew' ? 'matthew-plain' : d.bookId;
      return { id: d.id, kind: 'verse', title: '', text: /** @type {any} */ (BIBLE)[book][d.chapterNum].find((/** @type {any} */ v) => v.n === d.verseNum).text };
    }));
    kx._documentCount = ms._documentCount;
    kx._avgFieldLength = ms._avgFieldLength.slice();
    const cases = /** @type {Array<[string, string]>} */ ([
      ['burneth', 'AND'], ['whereof spake', 'AND'], ['fowls devoured', 'AND'], ['unto spake unto', 'AND'],
      ['burneth spake fowls', 'OR'], ['burneth fowls burneth', 'OR'], ['shut unto devoured wayside', 'OR'],
    ]);
    for (const [q, combineWith] of cases) {
      const o = { ...opts, combineWith };
      const want = kx.search(q, { ...o, fields: ['text'], bm25: BM25_PARAMS }).map((h) => [h.id, h.score, h.terms]);
      const got = twinHits(V, q, o, BM25_PARAMS).map((h) => [h.id, h.score, h.terms]);
      expect(got).toEqual(want);
      expect(got.length).toBeGreaterThan(0);
    }
  });

  it('counts a word’s texts once over both wordings: the index’s holders, and the verses holding it in the KJV alone', () => {
    const ms = index();
    const V = /** @type {any} */ (twinView(twin(), ms));
    // "porter": the letter and alpha 2:1 hold it in the index; alpha 1:2 in its KJV wording alone
    expect(twinOnly(V, 'porter')).toBe(1);
    /** @type {number[]} */ const held = [];
    twinHolders(V, 'porter', (sid) => held.push(sid));
    expect(held.sort()).toEqual([sidOf(ms, 'v2'), sidOf(ms, 'v3')].sort());
    const N = ms._documentCount;
    const df = 3;
    const len = new Set(kjvEncode(BIBLE.alpha[1][1].text)).size;
    const { k, b, d } = BM25_PARAMS;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const want = idf * (d + 1 * (k + 1) / (1 + k * (1 - b + b * len / ms._avgFieldLength[ms._fieldIds.text])));
    const hit = twinHits(V, 'porter', { combineWith: 'AND' }, BM25_PARAMS).find((h) => h.id === 'v2');
    expect(hit && hit.score).toBeCloseTo(want, 12);
  });

  it('answers the unit’s own words only: no prefix or fuzzy reach into the KJV wording', () => {
    const V = /** @type {any} */ (twinView(twin(), index()));
    expect(twinHits(V, 'where', { prefix: true, fuzzy: 0.2, combineWith: 'AND' }, BM25_PARAMS)).toEqual([]);
    expect(twinHits(V, 'burnet', { prefix: true, combineWith: 'AND' }, BM25_PARAMS)).toEqual([]);
    expect(twinHits(V, 'whereof', { prefix: true, combineWith: 'AND' }, BM25_PARAMS).map((h) => h.id)).toEqual(['v2']);
  });

  it('a unit of several words needs them all in one wording (AND), or any (OR)', () => {
    const V = /** @type {any} */ (twinView(twin(), index()));
    expect(twinHits(V, 'lamp spake', { combineWith: 'AND' }, BM25_PARAMS)).toEqual([]);
    expect(twinHits(V, 'lamp spake', { combineWith: 'OR' }, BM25_PARAMS).map((h) => h.id).sort()).toEqual(['v1', 'v2', 'v3']);
  });

  it('keeps a verse’s KJV reading apart from its own: each scored alone, the words of both its terms', () => {
    const V = /** @type {any} */ (twinView(twin(), index()));
    const opts = { combineWith: 'OR' };
    const kjv = Object.fromEntries(twinHits(V, 'lamp spake', opts, BM25_PARAMS).map((h) => [h.id, h.score]));
    const body = [{ id: 'v1', score: 5, terms: ['lamp'] }, { id: 'l1', score: 2, terms: ['lamp'] }, { id: 'v3', score: 2, terms: ['lamp'] }];
    const out = kjvReading(V, body, 'lamp spake', opts, BM25_PARAMS, (id) => ({ kind: 'verse', ref: 'ref ' + id }));
    const by = Object.fromEntries(out.map((h) => [h.id, h]));
    // its own reading's score stands as it was; the KJV reading's rides beside it
    expect(by.v1).toMatchObject({ score: 5, kjv: kjv.v1 });
    expect(by.v3).toMatchObject({ score: 2, kjv: kjv.v3 });
    // a letter has no KJV wording
    expect(by.l1.kjv).toBeUndefined();
    // a verse found in its KJV wording alone joins with its stored fields, as MiniSearch hands a hit, read in no other
    expect(by.v2).toMatchObject({ score: 0, kjv: kjv.v2, kjvOnly: true, kind: 'verse', ref: 'ref v2', terms: ['spake'] });
    expect(out.map((h) => h.id)).toEqual(['v1', 'l1', 'v3', 'v2']);
  });
});

describe('the file’s load', () => {
  const answer = (/** @type {any} */ init, /** @type {any} */ body) => vi.fn(async () => ({ ok: true, redirected: false, status: 200, json: async () => body, ...init }));
  afterEach(() => {
    setKjvTwin(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is read once, from the file the app names', async () => {
    const fetch = answer({}, encodeKjvTwin(BIBLE, 'fixture'));
    vi.stubGlobal('fetch', fetch);
    setKjvTwinSource('twin.json');
    expect(kjvTwinStatus()).toBe('none');
    loadKjvTwin(true);
    await kjvTwinReady();
    await kjvTwinReady();
    expect(kjvTwinStatus()).toBe('ready');
    expect(/** @type {any} */ (kjvTwin()).keyOf.get('alpha:1:2')).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual(['twin.json']);
  });

  it('a file that does not load is no wording: a 404, a redirect, a bad file, a throw; a build tries again', async () => {
    const fails = [
      answer({ ok: false, status: 404 }, encodeKjvTwin(BIBLE, 'fixture')),
      answer({ redirected: true }, encodeKjvTwin(BIBLE, 'fixture')),
      answer({}, { format: 1, words: 'x' }),
      vi.fn(async () => { throw new TypeError('offline'); }),
    ];
    for (const f of fails) {
      vi.stubGlobal('fetch', f);
      setKjvTwinSource('twin.json');
      await kjvTwinReady();
      expect(kjvTwin()).toBeNull();
      expect(kjvTwinStatus()).toBe('failed');
      expect(f).toHaveBeenCalledTimes(1);
      await kjvTwinReady();
      expect(f).toHaveBeenCalledTimes(1);
      loadKjvTwin(true);
      expect(f).toHaveBeenCalledTimes(2);
    }
  });

  it('a file still on its way is waited for at most KJV_TWIN_WAIT_MS, once', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    setKjvTwinSource('twin.json');
    let done = false;
    kjvTwinReady().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(KJV_TWIN_WAIT_MS - 100);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(true);
    let again = false;
    kjvTwinReady().then(() => { again = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(again).toBe(true);
    expect(kjvTwinStatus()).toBe('loading');
  });
});
