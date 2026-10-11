// @ts-nocheck
/* idb-chunks (2026-10-11): small values, small transactions, every write committed.
   The owner's WebView destroyed this origin's IndexedDB three times ("Unknown
   corruption" at open). These pin the defenses: no record holds more than a piece
   far under Chromium's 64 KiB wrap threshold, no transaction carries more than
   PIECES_PER_TX pieces (under LevelDBScopes' 1 MiB flush), a reader only ever sees
   one whole value, and a value JSON would not carry exactly is left alone. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  INLINE_MAX_CHARS, CHUNK_CHARS, PIECES_PER_TX, isChunkKey, chunkOwner, isManifest, jsonExact, chunkText,
  writeValue, deleteValue, getValue, assemble, foldRows, writeQueue,
} from './idb-chunks.js';

const DB = 'idb-chunks-test';
let db;

beforeEach(async () => {
  await new Promise((r) => { const q = indexedDB.deleteDatabase(DB); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  db = await new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore('s'); rq.result.createObjectStore('meta'); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
});
afterEach(() => { vi.restoreAllMocks(); db.close(); });

/** The records as IndexedDB holds them. */
function rows(store = 's') {
  return new Promise((res) => {
    const out = [];
    const rq = db.transaction(store).objectStore(store).openCursor();
    rq.onsuccess = () => { const c = rq.result; if (!c) { res(out); return; } out.push([c.key, c.value]); c.continue(); };
  });
}
const read = (key, store = 's') => getValue(db.transaction(store).objectStore(store), key);

/** A history-shaped value: ~`n` entries with a two-byte character in each (as real titles have). */
const history = (n) => Array.from({ length: n }, (_, i) => ({ key: 'bible:john:' + i, ts: 1791749447996 + i, title: 'John ' + i + ' — “In the beginning was the Word”', volumeScreen: null }));

describe('what is split', () => {
  it('jsonExact: plain JSON data only', () => {
    expect(jsonExact({ a: [1, 'x', true, null, { b: 2.5 }] })).toBe(true);
    expect(jsonExact({ a: new Blob(['x']) })).toBe(false);
    expect(jsonExact({ a: new Date(0) })).toBe(false);
    expect(jsonExact({ a: new Map() })).toBe(false);
    expect(jsonExact({ a: undefined })).toBe(true);                    // absent, as JSON writes it
    expect(jsonExact({ a: () => 1 })).toBe(false);
    expect(jsonExact({ a: NaN })).toBe(false);
    expect(jsonExact([1, , 3])).toBe(false);                           // eslint-disable-line no-sparse-arrays
    expect(jsonExact(Object.create(null))).toBe(true);
  });

  it('chunkText: only a big value JSON carries exactly', () => {
    expect(chunkText({ small: 'x' })).toBeNull();
    expect(chunkText('x'.repeat(INLINE_MAX_CHARS - 2))).toBeNull();     // exactly at the line (quotes count)
    expect(typeof chunkText(history(500))).toBe('string');
    expect(chunkText({ big: 'x'.repeat(INLINE_MAX_CHARS * 2), when: new Date(0) })).toBeNull();
  });
});

describe('writeValue / getValue', () => {
  it('a small value is stored as it is, with no pieces', async () => {
    await writeValue(db, 's', 'v', { a: 1 });
    expect(await rows()).toEqual([['v', { a: 1 }]]);
    expect(await read('v')).toEqual({ a: 1 });
  });

  it('a big value round-trips, and every record is a piece far under the wrap threshold', async () => {
    const v = history(500);
    await writeValue(db, 's', 'v', v);
    expect(await read('v')).toEqual(v);
    const r = await rows();
    expect(isManifest(r[0][1])).toBe(true);
    const gen = r[0][1].gen;
    expect(r.length).toBe(1 + r[0][1].n);
    for (const [k, val] of r.slice(1)) {
      expect(isChunkKey(k) && chunkOwner(k) === 'v' && k.includes(':' + gen + ':')).toBe(true);
      expect(typeof val).toBe('string');
      expect(val.length).toBeLessThanOrEqual(CHUNK_CHARS);         // <= 32,000 bytes even two-byte
    }
  });

  it('a value over PIECES_PER_TX pieces is written across transactions, none carrying more', async () => {
    const v = history(4000);                                          // ~ 330,000 chars of JSON
    const n = Math.ceil(JSON.stringify(v).length / CHUNK_CHARS);
    expect(n).toBeGreaterThan(PIECES_PER_TX * 1.5);
    const puts = [];
    const orig = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((stores, mode) => {
      const tx = orig(stores, mode);
      if (mode === 'readwrite') {
        const os = tx.objectStore('s');
        const put = os.put.bind(os);
        let count = 0;
        os.put = (...a) => { count++; return put(...a); };
        puts.push(() => count);
      }
      return tx;
    });
    await writeValue(db, 's', 'v', v);
    expect(puts.length).toBe(Math.ceil(n / PIECES_PER_TX));
    for (const c of puts) expect(c()).toBeLessThanOrEqual(PIECES_PER_TX + 1);   // + the manifest
    vi.restoreAllMocks();
    expect(await read('v')).toEqual(v);
  });

  it('rewriting leaves exactly one generation; shrinking back under the line leaves no pieces', async () => {
    await writeValue(db, 's', 'v', history(4000));
    await writeValue(db, 's', 'v', history(600));
    const r = await rows();
    expect(r.length).toBe(1 + r[0][1].n);                           // the old generation is gone
    expect(await read('v')).toEqual(history(600));
    await writeValue(db, 's', 'v', { a: 1 });
    expect(await rows()).toEqual([['v', { a: 1 }]]);
  });

  it('pieces a kill left behind (another generation) are never read and go with the next write', async () => {
    await writeValue(db, 's', 'v', history(600));
    await new Promise((res) => { const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').put('stray', 'v#chunk:0zzzzzzz:00000'); tx.oncomplete = res; });
    expect(await read('v')).toEqual(history(600));
    expect(Object.keys(foldRows(await rows()))).toEqual(['v']);
    await writeValue(db, 's', 'v', history(700));
    expect((await rows()).some(([k]) => k.includes('0zzzzzzz'))).toBe(false);
  });

  it('a final transaction that finds its own generation incomplete aborts, and the old value stays', async () => {
    await writeValue(db, 's', 'v', { old: true });
    const orig = db.transaction.bind(db);
    let rw = 0;
    vi.spyOn(db, 'transaction').mockImplementation((stores, mode) => {
      if (mode === 'readwrite' && ++rw === 2) {                      // before the final one: another tab sweeps the pieces
        const t = orig(['s'], 'readwrite');
        t.objectStore('s').delete(IDBKeyRange.bound('v#chunk:', 'v#chunk:￿'));
      }
      return orig(stores, mode);
    });
    await expect(writeValue(db, 's', 'v', history(4000))).rejects.toMatchObject({ name: 'AbortError' });
    vi.restoreAllMocks();
    expect(await read('v')).toEqual({ old: true });
  });

  it('a value JSON would not carry exactly is stored as it is, even when big', async () => {
    const v = { big: 'x'.repeat(INLINE_MAX_CHARS * 2), when: new Date(5) };
    await writeValue(db, 's', 'v', v);
    expect((await rows()).length).toBe(1);
    const back = await read('v');
    expect(back.when instanceof Date).toBe(true);
    expect(back.big.length).toBe(INLINE_MAX_CHARS * 2);
  });

  it('extra writes ride the transaction that makes the value current', async () => {
    await writeValue(db, 's', 'v', history(4000), { extraStores: ['meta'], inFinal: (tx) => tx.objectStore('meta').put(7, 'schema:s') });
    expect(await read('schema:s', 'meta')).toBe(7);
    expect(await read('v')).toEqual(history(4000));
  });

  it('every readwrite transaction is committed explicitly when the host can', async () => {
    const proto = Object.getPrototypeOf(db.transaction('s', 'readonly'));
    if (typeof proto.commit !== 'function') return;                 // this IndexedDB has no commit(): auto-commit only
    const spy = vi.spyOn(proto, 'commit');
    await writeValue(db, 's', 'v', history(4000));
    await writeValue(db, 's', 'w', { a: 1 });
    await deleteValue(db, 's', 'w');
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(Math.ceil(Math.ceil(JSON.stringify(history(4000)).length / CHUNK_CHARS) / PIECES_PER_TX) + 2);
  });

  it('deleteValue removes the key and every piece', async () => {
    await writeValue(db, 's', 'v', history(600));
    await deleteValue(db, 's', 'v');
    expect(await rows()).toEqual([]);
  });
});

describe('refuter findings (10-11)', () => {
  it('an undefined property (a merge can leave one) does not keep a big value whole', async () => {
    const v = history(600).map((e, i) => (i === 3 ? { ...e, stray: undefined } : e));
    expect(jsonExact(v)).toBe(true);
    await writeValue(db, 's', 'v', v);
    const r = await rows();
    expect(isManifest(r[0][1])).toBe(true);
    expect(await read('v')).toEqual(JSON.parse(JSON.stringify(v)));    // the property reads as absent
    expect(jsonExact([1, undefined])).toBe(false);                     // in an array it would be null
  });

  it('a big value JSON would not carry exactly is logged once, then stored whole', async () => {
    const { DiagnosticLog } = await import('../utils/diagnostic-log.js');
    const warn = vi.spyOn(DiagnosticLog, 'warn');
    const v = { big: 'x'.repeat(INLINE_MAX_CHARS * 2), when: new Date(5) };
    await writeValue(db, 's', 'odd', v);
    await writeValue(db, 's', 'odd', v);
    expect(warn.mock.calls.filter((c) => /s\/odd is too big to keep inline but is not plain JSON/.test(c[1]))).toHaveLength(1);
  });

  it('two pages writing the same key in the same millisecond never share a generation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1791749447996);
    vi.resetModules();
    const a = await import('./idb-chunks.js');
    vi.resetModules();
    const b = await import('./idb-chunks.js');
    await a.writeValue(db, 's', 'v', history(600));
    const genA = (await rows())[0][1].gen;
    await b.writeValue(db, 's', 'v', history(601));
    const genB = (await rows())[0][1].gen;
    expect(genA).not.toBe(genB);
  });

  it('the final transaction checks first, then writes everything at once', async () => {
    const orig = db.transaction.bind(db);
    const calls = [];
    vi.spyOn(db, 'transaction').mockImplementation((stores, mode) => {
      const tx = orig(stores, mode);
      if (mode === 'readwrite') {
        const order = [];
        calls.push(order);
        const os = tx.objectStore('s');
        for (const m of ['put', 'delete', 'count']) { const f = os[m].bind(os); os[m] = (...x) => { order.push(m); return f(...x); }; }
      }
      return tx;
    });
    await writeValue(db, 's', 'v', history(4000));
    vi.restoreAllMocks();
    const final = calls[calls.length - 1];
    expect(final[0]).toBe('count');
    expect(final.slice(1).includes('count')).toBe(false);
    expect(await read('v')).toEqual(history(4000));
  });
});

describe('reading what does not add up', () => {
  it('assemble refuses missing pieces or a wrong length (DataError)', () => {
    const m = { __votChunks: 1, gen: 'g', n: 2, len: 4 };
    expect(assemble('v', m, ['"a', 'b"'])).toBe('ab');
    expect(() => assemble('v', m, ['"a'])).toThrow(expect.objectContaining({ name: 'DataError' }));
    expect(() => assemble('v', m, ['"a', 'bc"'])).toThrow(expect.objectContaining({ name: 'DataError' }));
  });

  it('getValue rejects a manifest whose pieces are gone, never resolving to nothing', async () => {
    await writeValue(db, 's', 'v', history(600));
    await new Promise((res) => { const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').delete(IDBKeyRange.bound('v#chunk:', 'v#chunk:￿')); tx.oncomplete = res; });
    await expect(read('v')).rejects.toMatchObject({ name: 'DataError' });
  });

  it('foldRows joins pieces, hides them, and hands a bad key to onBad', async () => {
    await writeValue(db, 's', 'v', history(600));
    await writeValue(db, 's', 'w', { a: 1 });
    expect(foldRows(await rows())).toEqual({ v: history(600), w: { a: 1 } });
    const r = (await rows()).filter(([k]) => !String(k).endsWith(':00001'));
    const bad = vi.fn();
    expect(foldRows(r, bad)).toEqual({ w: { a: 1 } });
    expect(bad).toHaveBeenCalledWith('v', expect.objectContaining({ name: 'DataError' }));
    expect(() => foldRows(r)).toThrow(expect.objectContaining({ name: 'DataError' }));
  });
});

describe('writeQueue', () => {
  it('runs one task at a time, in order, and a failure does not stop it', async () => {
    const q = writeQueue();
    const seen = [];
    let active = 0;
    let maxActive = 0;
    const task = (name, fail) => async () => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(name);
      active--;
      if (fail) throw new Error(name);
    };
    const all = [q(task('a')), q(task('b', true)), q(task('c'))];
    await expect(all[1]).rejects.toThrow('b');
    await Promise.allSettled(all);
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(maxActive).toBe(1);
  });
});
