/* ═══════════════════════════════════════════════════════════════════════
   idb-chunks — small values, small transactions, every write committed
   ═══════════════════════════════════════════════════════════════════════
   ES module. Depends only on DiagnosticLog. Used by idb-adapter.js (the 'votreader'
   database) and thumb-store.js ('vot-thumbs').

   Why (2026-10-11). The owner's WebView threw this origin's whole IndexedDB
   away three times in ten days; on the third it said why: "IndexedDB
   (database was corrupt): Unknown corruption", an inconsistency in Chromium's
   own records at open, not damage in the LevelDB files. Reading Chromium 154
   (the WebView he runs) for what can do that after a kill:
     - Blink stores any value over 65,536 serialized bytes compressed (Snappy)
       and, if it is still over, as a separate blob file
       (idb_value_wrapping.cc). Blob files survive kills by design, but they
       are the least travelled path, and the app made them constantly: each
       store's WHOLE value was one record (vot-history 77-400 KB, rewritten
       on every visit), each tab thumbnail a 150-400 KB data URL.
     - LevelDBScopes writes a transaction whose batch passes 1 MiB in several
       flushes with an undo log and its locks on disk; two such transactions
       killed before commit fail the lock check at the next open ("Invalid
       locks on disk"), which is exactly "Unknown corruption", and the store
       is destroyed. Splitting big values into one big transaction would walk
       straight into that.
   So, for every value the app writes through here:
     1. a value too big to be safely inline is stored as JSON text in pieces
        of at most CHUNK_CHARS characters (at most 32,000 bytes even when
        every character is two-byte, so never compressed, never a blob file);
     2. no transaction carries more than PIECES_PER_TX pieces (~512 KB at
        worst, half the 1 MiB flush line): a bigger value is written in
        several transactions under a NEW generation, then one small final
        transaction points the key at it and deletes every older generation,
        so a reader always sees one whole value, old or new;
     3. every readwrite transaction is committed explicitly (tx.commit()), so
        a page frozen in the background cannot leave one hanging;
     4. idb-adapter.js runs one write at a time per database.

   Layout for key K:
     K                          → the value itself (inline), OR
     K                          → { __votChunks: 1, gen, n, len }   (manifest)
     K#chunk:<gen>:00000 …      → that generation's n pieces, in order
   Pieces of any other generation under K are leftovers of a write a kill cut
   short: never read, deleted by K's next write.

   What is split: a value whose JSON passes INLINE_MAX_CHARS and that JSON
   carries exactly (plain objects, arrays, strings, finite numbers, booleans,
   null: every CachedStore record, which began as localStorage JSON). A Blob,
   File, ArrayBuffer, Date, Map, undefined, NaN or array hole anywhere in it
   keeps the old behaviour (stored as it is): song bytes and journal photos are
   files by nature, and JSON would lose them. A value kept inline is at most
   INLINE_MAX_CHARS of JSON, at most ~40 KB serialized even when made of small
   doubles (9 bytes against 3-4 characters of JSON).

   Reading. A manifest whose pieces do not add up (missing, extra, the wrong
   length) is never returned as a value: it throws a DataError, so a store
   meeting one goes 'degraded' and writes nothing, rather than loading an
   empty library and saving that over the real one. A final transaction that
   finds its own generation incomplete (another tab's write of the same key
   swept it) aborts instead of pointing the key at it; the caller retries.
   ═══════════════════════════════════════════════════════════════════════ */

import { DiagnosticLog } from '../utils/diagnostic-log.js';

/** The most JSON text a value may have and still be stored as it is. */
export const INLINE_MAX_CHARS = 16000;
/** The longest piece of JSON text in one record. */
export const CHUNK_CHARS = 16000;
/** The most pieces one transaction writes (~512 KB at two bytes a character). */
export const PIECES_PER_TX = 16;

const SEP = '#chunk:';
const MARK = '__votChunks';

/** @param {number} i */
const pad = (i) => String(i).padStart(5, '0');

let _genSeq = 0;
/** A generation id: never contains ':', unique per page, and with a random tail so two
 *  tabs writing the same key in the same millisecond never share one (refuter 10-11). */
function newGen() {
  _genSeq = (_genSeq + 1) % 1679616;
  return Date.now().toString(36) + _genSeq.toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 8);
}

/** True for a record that holds a piece of some other key's value. @param {IDBValidKey} key */
export function isChunkKey(key) {
  return typeof key === 'string' && key.indexOf(SEP) > 0;
}

/** The key whose value a piece belongs to. @param {string} key */
export function chunkOwner(key) {
  return key.slice(0, key.indexOf(SEP));
}

/** The generation a piece belongs to. @param {string} key */
function chunkGen(key) {
  const rest = key.slice(key.indexOf(SEP) + SEP.length);
  return rest.slice(0, rest.indexOf(':'));
}

/** @param {string} key @param {string} gen @param {number} i */
export function chunkKey(key, gen, i) {
  return key + SEP + gen + ':' + pad(i);
}

/** Every piece of `key`, any generation. @param {string} key */
function allPieces(key) {
  return IDBKeyRange.bound(key + SEP, key + SEP + '￿');
}

/** One generation's pieces. @param {string} key @param {string} gen */
function genPieces(key, gen) {
  return IDBKeyRange.bound(key + SEP + gen + ':', key + SEP + gen + ':￿');
}

/** @param {any} v */
export function isManifest(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && v[MARK] === 1 &&
    typeof v.gen === 'string' && typeof v.n === 'number' && typeof v.len === 'number';
}

/**
 * True when JSON carries `v` exactly: plain objects and arrays of strings,
 * finite numbers, booleans and null, and nothing else (header). An object
 * property whose value is `undefined` counts as absent, as JSON writes it (the
 * stores' merges can leave one; it means "no record" either way); in an array
 * it would come back as null, so it refuses.
 * @param {any} v
 * @returns {boolean}
 */
export function jsonExact(v) {
  /** @type {any[]} */ const stack = [v];
  while (stack.length) {
    const x = stack.pop();
    if (x === null) continue;
    const t = typeof x;
    if (t === 'string' || t === 'boolean') continue;
    if (t === 'number') { if (!isFinite(x)) return false; continue; }
    if (t !== 'object') return false;                        // undefined, function, symbol, bigint
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length; i++) {
        if (!(i in x)) return false;                         // a hole would come back as null
        stack.push(x[i]);
      }
      continue;
    }
    const proto = Object.getPrototypeOf(x);
    if (proto !== Object.prototype && proto !== null) return false;   // Blob, Date, Map, ArrayBuffer, a class
    for (const k of Object.keys(x)) if (x[k] !== undefined) stack.push(x[k]);
  }
  return true;
}

/**
 * How to store `value`: `text` is the JSON to put in pieces, or null to store
 * the value as it is; `inexact` says a value over the line had to stay whole
 * because JSON would not carry it exactly.
 * @param {any} value
 * @returns {{ text: string | null, inexact: boolean }}
 */
function plan(value) {
  let json;
  try { json = JSON.stringify(value); } catch (_e) { return { text: null, inexact: true }; }
  if (typeof json !== 'string' || json.length <= INLINE_MAX_CHARS) return { text: null, inexact: false };
  return jsonExact(value) ? { text: json, inexact: false } : { text: null, inexact: true };
}

/**
 * The JSON text to store in pieces, or null to store `value` as it is (small,
 * or something JSON would not carry exactly).
 * @param {any} value
 * @returns {string | null}
 */
export function chunkText(value) {
  return plan(value).text;
}

/** Keys already reported as too big but not plain JSON (once a page each). */
const _toldInexact = new Set();

/** A synthetic AbortError for a transaction that aborted without saying why. */
function abortError() {
  if (typeof DOMException === 'function') {
    try { return new DOMException('Transaction aborted', 'AbortError'); } catch (_e) { /* fall through */ }
  }
  const e = new Error('Transaction aborted');
  e.name = 'AbortError';
  return e;
}

/**
 * Commit now when the host can (header, 3); otherwise IndexedDB auto-commits.
 * Call it once the transaction's last request is queued: nothing can be added
 * after it. Exported for the stores that run their own transactions
 * (journal-media-store.js).
 * @param {IDBTransaction} tx
 */
export function commitNow(tx) {
  if (typeof (/** @type {any} */ (tx)).commit === 'function') { try { /** @type {any} */ (tx).commit(); } catch (_e) { /* already finishing */ } }
}

/**
 * Run one readwrite transaction. `body` queues its requests synchronously and
 * returns true when it will commit later itself (from a request callback);
 * otherwise it is committed at once. Settles once: complete → resolve,
 * error/abort → reject.
 * @param {IDBDatabase} db @param {string[]} stores
 * @param {(tx: IDBTransaction) => boolean | void} body
 * @returns {Promise<void>}
 */
function runTx(db, stores, body) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (/** @type {() => void} */ f) => { if (!settled) { settled = true; f(); } };
    let tx;
    try { tx = db.transaction(stores, 'readwrite'); } catch (e) { reject(e); return; }
    const t = tx;
    t.oncomplete = () => settle(() => resolve(undefined));
    t.onerror = () => settle(() => reject(t.error || abortError()));
    t.onabort = () => settle(() => reject(t.error || abortError()));
    try {
      if (!body(t)) commitNow(t);
    } catch (e) {
      try { t.abort(); } catch (_e) { /* already done */ }
      settle(() => reject(e));
    }
  });
}

/**
 * Store `value` under `key` (header). `opts.extraStores` and `opts.inFinal`
 * add writes to the transaction that makes the value current (the schema
 * version a migration commits with its data). Resolves once committed.
 * @param {IDBDatabase} db @param {string} storeName @param {IDBValidKey} key @param {any} value
 * @param {{ extraStores?: string[], inFinal?: (tx: IDBTransaction) => void }} [opts]
 * @returns {Promise<void>}
 */
export async function writeValue(db, storeName, key, value, opts) {
  const stores = [storeName].concat((opts && opts.extraStores) || []);
  const inFinal = (opts && opts.inFinal) || (() => {});
  const p = typeof key === 'string' ? plan(value) : { text: null, inexact: false };
  const text = p.text;
  if (p.inexact && !_toldInexact.has(storeName + '/' + String(key))) {
    _toldInexact.add(storeName + '/' + String(key));
    try { DiagnosticLog.warn('store', storeName + '/' + String(key) + ' is too big to keep inline but is not plain JSON: stored whole'); } catch (_e) { /* logging never breaks a write */ }
  }
  if (text === null) {
    await runTx(db, stores, (tx) => {
      const os = tx.objectStore(storeName);
      if (typeof key === 'string') os.delete(allPieces(key));
      os.put(value, key);
      inFinal(tx);
    });
    return;
  }
  const k = /** @type {string} */ (key);
  const gen = newGen();
  const n = Math.ceil(text.length / CHUNK_CHARS);
  const piece = (/** @type {number} */ i) => text.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS);
  let i = 0;
  while (n - i > PIECES_PER_TX) {
    const from = i;
    i += PIECES_PER_TX;
    await runTx(db, [storeName], (tx) => {
      const os = tx.objectStore(storeName);
      for (let j = from; j < from + PIECES_PER_TX; j++) os.put(piece(j), chunkKey(k, gen, j));
    });
  }
  const last = i;
  /** This generation's last pieces, the other generations gone, the key pointed at it. @param {IDBObjectStore} os @param {IDBTransaction} tx */
  const finish = (os, tx) => {
    for (let j = last; j < n; j++) os.put(piece(j), chunkKey(k, gen, j));
    os.delete(IDBKeyRange.bound(k + SEP, k + SEP + gen + ':', false, true));
    os.delete(IDBKeyRange.bound(k + SEP + gen + ':￿', k + SEP + '￿', true, false));
    os.put({ [MARK]: 1, gen, n, len: text.length }, k);
    inFinal(tx);
  };
  await runTx(db, stores, (tx) => {
    const os = tx.objectStore(storeName);
    if (last === 0) { finish(os, tx); return false; }   // every piece is in this transaction
    // Earlier transactions wrote the rest: point the key at this generation only if
    // they are all still there (another tab's write of this key would have swept them).
    // The check runs FIRST and every write follows it in one go, then the commit: no
    // write of this transaction waits on a callback a stalled page may never run.
    const count = os.count(genPieces(k, gen));
    count.onsuccess = () => {
      if (count.result !== last) { try { tx.abort(); } catch (_e) { /* settling */ } return; }
      finish(os, tx);
      commitNow(tx);
    };
    return true;
  });
}

/**
 * Delete `key` and every piece of it. Resolves once committed.
 * @param {IDBDatabase} db @param {string} storeName @param {IDBValidKey} key
 * @returns {Promise<void>}
 */
export function deleteValue(db, storeName, key) {
  return runTx(db, [storeName], (tx) => {
    const os = tx.objectStore(storeName);
    if (typeof key === 'string') os.delete(allPieces(key));
    os.delete(key);
  });
}

/** @param {string} msg */
function chunkError(msg) {
  const e = new Error(msg);
  e.name = 'DataError';
  return e;
}

/**
 * The value a manifest and its pieces (in order) stand for. Throws a DataError
 * when they do not agree (header).
 * @param {string} key @param {any} manifest @param {any[]} parts
 */
export function assemble(key, manifest, parts) {
  if (parts.length !== manifest.n || !parts.every((p) => typeof p === 'string')) {
    throw chunkError('chunked value ' + key + ': ' + parts.length + ' of ' + manifest.n + ' pieces');
  }
  const text = parts.join('');
  if (text.length !== manifest.len) throw chunkError('chunked value ' + key + ': ' + text.length + ' of ' + manifest.len + ' characters');
  return JSON.parse(text);
}

/**
 * Read `key` through an object store (any transaction mode): its value, put
 * back together when it was stored in pieces; undefined when absent.
 * @param {IDBObjectStore} os @param {IDBValidKey} key
 * @returns {Promise<any>}
 */
export function getValue(os, key) {
  return new Promise((resolve, reject) => {
    const rq = os.get(key);
    rq.onerror = () => reject(rq.error || new Error('IDB get failed'));
    rq.onsuccess = () => {
      const v = rq.result;
      if (typeof key !== 'string' || !isManifest(v)) { resolve(v); return; }
      const all = os.getAll(genPieces(key, v.gen));
      all.onerror = () => reject(all.error || new Error('IDB getAll failed'));
      all.onsuccess = () => {
        try { resolve(assemble(key, v, all.result || [])); } catch (e) { reject(e); }
      };
    };
  });
}

/**
 * Fold the rows of a cursor walk over a whole store into key → value: pieces
 * join their manifest and never appear as keys of their own; leftover
 * generations are dropped. A manifest whose pieces do not add up throws a
 * DataError (header) unless `onBad` takes it (that key is then left out).
 * @param {Array<[IDBValidKey, any]>} rows in key order, as a cursor walks them
 * @param {(key: string, err: Error) => void} [onBad]
 * @returns {Record<string, any>}
 */
export function foldRows(rows, onBad) {
  /** @type {Record<string, any>} */ const out = {};
  /** @type {Map<string, any[]>} */ const parts = new Map();
  for (const [key, value] of rows) {
    if (isChunkKey(key)) {
      const id = chunkOwner(/** @type {string} */ (key)) + '\u0000' + chunkGen(/** @type {string} */ (key));
      if (!parts.has(id)) parts.set(id, []);
      /** @type {any[]} */ (parts.get(id)).push(value);
    } else out[String(key)] = value;
  }
  for (const key of Object.keys(out)) {
    const m = out[key];
    if (!isManifest(m)) continue;
    try { out[key] = assemble(key, m, parts.get(key + '\u0000' + m.gen) || []); } catch (e) {
      if (!onBad) throw e;
      delete out[key];
      onBad(key, /** @type {Error} */ (e));
    }
  }
  return out;
}

/**
 * Run `task` after every write queued before it (one write at a time per
 * database, header 4). Returns the task's own promise; a failure never stops
 * the queue.
 * @returns {<T>(task: () => Promise<T>) => Promise<T>}
 */
export function writeQueue() {
  /** @type {Promise<any>} */ let tail = Promise.resolve();
  return function (task) {
    const run = tail.then(task, task);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

export const IdbChunks = { INLINE_MAX_CHARS, CHUNK_CHARS, PIECES_PER_TX, isChunkKey, chunkOwner, chunkKey, isManifest, jsonExact, chunkText, writeValue, deleteValue, getValue, assemble, foldRows, writeQueue, commitNow };
