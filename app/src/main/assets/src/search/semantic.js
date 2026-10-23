/* ═══════════════════════════════════════════════════════════════════════
   src/search/semantic.js — MEANING SEARCH: the on-device model (path to 500,
   step 1, 2026-10-05)
   ═══════════════════════════════════════════════════════════════════════
   Corbin (2026-10-05): the 500/500 bar stands, and on-device AI is the DEFAULT
   "as long as users don't ever need to upgrade or run into limits". A reader
   often remembers what a passage SAYS, not its words ("god says he lives among
   israel and his people will never be ashamed"); the words search cannot see
   that. This runs bge-small-en-v1.5 (int8 ONNX, onnxruntime-web on wasm, one
   thread) on the query, and compares its vector with one vector per passage
   (semantic/units-<hash>.bin, built offline by tools/build-semantic.py from the same
   model file). Everything is on the device: no account, no key, no network
   once the files are in (the APK bundles them; the PWA fetches them once, in
   the background, and the service worker keeps them).

   Until the files are in (or on a device that cannot run them) search is the
   words engine alone: semanticDocs() answers null and nothing waits on it.

   A passage ("unit") is a verse, three sentences of any other text, or a title;
   it names its document by unitKey and where it starts in the document's
   indexed text, so a hit the meaning found can land on that passage.

   THE MODEL RUNS ON THE SEARCH WORKER (sr9, 2026-10-14). Loading it and
   embedding a query then scoring all 52,854 passages held the page's thread
   (69-143 ms a query on a desktop). In a page that can have the search worker
   (worker-client.js) it all runs there; the page asks for the best documents
   and gets them by unitKey. A worker that cannot load the model (or dies)
   hands it to this thread for the rest of the session, which loads it as
   before; one that cannot run a query is given up first, so the two never
   hold a copy each.
   ═══════════════════════════════════════════════════════════════════════ */

import { searchWorker } from './worker-client.js';

const SEM_DIR = 'semantic/';
const CLS = 101;
const SEP = 102;
const UNK = 100;
const MAX_LEN = 64; // a query is a sentence or two; the model's own limit is 512
/** A pack file that makes no progress for this long is a failed load (and tried again later). */
const FILE_STALL_MS = 45000;

/** A file of the pack, fetched. A redirected answer is a captive portal or a proxy, not the file (the worker
 *  never stores one either): a failed load, tried again later, never bytes that make a failure final (W35 refuter r2). */
export async function fetchSemanticFile(/** @type {string} */ p, stallMs = FILE_STALL_MS) {
  /* A DOWNLOAD THAT STOPS IS A FAILED LOAD (search200 bugcheck #10). A hung fetch held the model at 'loading' for
     good: the worker's alive beat kept the page waiting, nothing failed, so nothing was tried again. The fetch is
     aborted when no answer, or no bytes of it, arrive for `stallMs`; a slow line that keeps sending is a download. */
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  /** @type {any} */ let timer = 0;
  const arm = () => { if (ac) { clearTimeout(timer); timer = setTimeout(() => ac.abort(), stallMs); } };
  arm();
  try {
    const r = await fetch(io.url(p), ac ? { signal: ac.signal } : undefined);
    if (!r.ok || r.redirected) throw new Error('semantic: ' + p + ' ' + (r.redirected ? 'redirected' : r.status));
    if (!ac || !r.body || typeof r.body.getReader !== 'function') return await r.arrayBuffer();
    const rd = r.body.getReader();
    /** @type {Uint8Array[]} */ const parts = [];
    let n = 0;
    for (;;) {
      arm();
      const { done, value } = await rd.read();
      if (done) break;
      parts.push(value);
      n += value.length;
    }
    const out = new Uint8Array(n);
    let at = 0;
    for (const c of parts) { out.set(c, at); at += c.length; }
    return out.buffer;
  } finally {
    clearTimeout(timer);
  }
}

/** @type {{url: (p: string) => string, load: (p: string) => Promise<ArrayBuffer>, importModule: (p: string) => Promise<any>, worker: () => any}} */
const io = {
  // bundle-d is a classic script: a path resolves against the page, never the bundle
  url: (p) => String(new URL(p, document.baseURI)),
  load: fetchSemanticFile,
  importModule: (p) => import(/* @vite-ignore */ io.url(p)),
  // the search worker the model runs on, or null to run it on this thread
  worker: () => searchWorker(),
};

/** How the files are reached: the page's own base by default; node passes file loaders (the benchmark, tests). */
export function configureSemantic(/** @type {Partial<typeof io>} */ opts) {
  Object.assign(io, opts || {});
}

/** @type {'off'|'loading'|'ready'|'failed'} */
let status = 'off';
/** @type {Promise<boolean>|null} */
let starting = null;
/** @type {any} */ let session = null;
/** @type {any} */ let ort = null;
/** @type {Map<string, number>|null} */ let vocab = null;
/** @type {any} */ let man = null;
/** @type {Int8Array|null} */ let V = null;
/** @type {Float32Array|null} */ let SCALE = null;
/** @type {Uint32Array|null} */ let KEY = null;
/** @type {Int32Array|null} */ let START = null;
/** @type {string|null} */ let failure = null;
/** Where the model is: on the search worker, or on this thread. */
/** @type {'worker'|'page'} */ let where = 'page';
/** The worker could not hold it: this thread does, for the session. */
let pageOnly = false;
let workerUnits = 0;
/** The worker that holds the model; a worker started after it failed (worker-client.js) does not. @type {any} */
let onWorker = null;

export function semanticStatus() { return { status, failure, units: man ? man.count : workerUnits, where }; }

/* A FAILED START IS NOT FOR THE PAGE'S LIFE (sweep W35, 2026-10-13): a dropped download or a refused
   store used to turn meaning search off until the next boot. The next start (an index build, a search
   past the wait) tries again, after a wait that doubles from 30 s up to 10 min. A runtime that cannot
   make a session of files that all arrived (a device that cannot run them) is not asked again. */
const RETRY_FIRST_MS = 30 * 1000;
const RETRY_MAX_MS = 10 * 60 * 1000;
let retryMs = 0;
let retryAt = 0;

/* A WORKER THAT GOES QUIET IS GIVEN UP (sr9 refuter r1): a start is waited for while the worker says it is
   alive (every 5 s, worker-ops.js), however long the download; a query it has not answered in QUERY_WAIT_MS
   (a few hundred ms on the S22) is a worker that will not. Either way this thread takes the model. */
const START_QUIET_MS = 30 * 1000;
const QUERY_WAIT_MS = 10 * 1000;

/* A SEARCH CAN COME BEFORE THE MODEL (sr11 S22 look, 2026-10-15). The model starts when the page is idle, so a search
   in a session's first seconds runs on the words alone; the screen waits here to search again, starting nothing. */
/** @type {Array<(ok: boolean) => void>} */ let readyWaits = [];
/** Resolves true once meaning search is ready; never starts it. */
export function semanticReady() {
  if (status === 'ready') return Promise.resolve(true);
  return new Promise((res) => { readyWaits.push(res); });
}
function nowReady() {
  status = 'ready';
  const waits = readyWaits;
  readyWaits = [];
  for (const res of waits) res(true);
}

/** Load the model and the passage vectors, once. Resolves true when meaning search is ready. */
export function startSemantic() {
  if (starting) return starting;
  if (status === 'failed' && Date.now() < retryAt) return Promise.resolve(false);
  const w = pageOnly ? null : io.worker();
  if (w) {
    status = 'loading';
    const run = w.request('meaning-start', { base: io.url('') }, undefined, START_QUIET_MS).then((/** @type {any} */ r) => {
      if (!r.ok) throw new Error(r.failure || 'semantic: the worker could not load the model');
      where = 'worker';
      onWorker = w;
      failure = null;
      workerUnits = r.units || 0;
      nowReady();
      return true;
    }).catch(() => toPage());
    starting = run;
    void run.then((ok) => { if (!ok && starting === run) starting = null; });
    return run;
  }
  status = 'loading';
  let arrived = false;
  const run = (async () => {
    try {
      const [manBuf, vocabBuf] = await Promise.all([io.load(SEM_DIR + 'manifest.json'), io.load(SEM_DIR + 'vocab.txt')]);
      man = JSON.parse(new TextDecoder().decode(manBuf));
      const words = new TextDecoder().decode(vocabBuf).split('\n');
      vocab = new Map();
      words.forEach((w, i) => { if (w) vocab.set(w, i); });
      const [unitsBuf, modelBuf] = await Promise.all([io.load(SEM_DIR + man.units), io.load(SEM_DIR + man.model)]);
      const n = man.count;
      const d = man.dim;
      if (unitsBuf.byteLength !== n * d + n * 12) throw new Error('semantic: ' + man.units + ' size');
      V = new Int8Array(unitsBuf, 0, n * d);
      SCALE = new Float32Array(unitsBuf.slice(n * d, n * d + n * 4));
      KEY = new Uint32Array(unitsBuf.slice(n * d + n * 4, n * d + n * 8));
      START = new Int32Array(unitsBuf.slice(n * d + n * 8, n * d + n * 12));
      // stored bytes that are not the files the manifest names (a proxy, a cut-off download) are
      // dropped, so the next start fetches them again instead of failing on them for good
      const [unitsOk, modelOk] = await Promise.all([sha256(unitsBuf, man.unitsSha256), sha256(modelBuf, man.modelSha256)]);
      if (!unitsOk || !modelOk) {
        await forget([!unitsOk && man.units, !modelOk && man.model]);
        throw new Error('semantic: stored files do not match the manifest');
      }
      const ortDir = SEM_DIR + man.ort;
      ort = await io.importModule(ortDir + 'ort.wasm.min.mjs');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmBinary = await io.load(ortDir + 'ort-wasm-simd-threaded.wasm');
      ort.env.wasm.wasmPaths = { mjs: io.url(ortDir + 'ort-wasm-simd-threaded.mjs') };
      // the runtime imports this glue inside create(): read first, a failed download of it is a load
      // that is tried again, not a device that cannot run the model (W35 refuter r1)
      await io.load(ortDir + 'ort-wasm-simd-threaded.mjs');
      arrived = true;
      session = await ort.InferenceSession.create(new Uint8Array(modelBuf), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      nowReady();
      retryMs = 0;
      pruneStored();
      return true;
    } catch (e) {
      status = 'failed';
      failure = String((e && /** @type {any} */ (e).message) || e);
      session = null;
      retryMs = Math.min(RETRY_MAX_MS, retryMs ? retryMs * 2 : RETRY_FIRST_MS);
      retryAt = arrived ? Infinity : Date.now() + retryMs;
      return false;
    }
  })();
  starting = run;
  void run.then((ok) => { if (!ok && starting === run) starting = null; });
  return run;
}

/** The worker could not load the model, or died: this thread loads it, from now on. Once: every search waiting
 *  on a worker that went quiet comes here, and each one starting its own load held a copy of the model per
 *  search (sweep 2026-10-14 v017). */
function toPage() {
  if (pageOnly && starting) return starting;
  pageOnly = true;
  where = 'page';
  status = 'off';
  starting = null;
  return startSemantic();
}

/** True when the bytes are the ones named (no Web Crypto: trusted, as the APK's own assets are). */
async function sha256(/** @type {ArrayBuffer} */ buf, /** @type {string} */ want) {
  const subtle = typeof crypto !== 'undefined' && crypto.subtle;
  if (!subtle || !want) return true;
  const h = new Uint8Array(await subtle.digest('SHA-256', buf));
  let hex = '';
  for (const b of h) hex += b.toString(16).padStart(2, '0');
  return hex === want;
}

/** The service worker's stored copy of the meaning files (vot-semantic-v1), when there is one (the page or the search worker). */
async function storedCache() {
  try { return typeof caches !== 'undefined' ? await caches.open('vot-semantic-v1') : null; } catch { return null; }
}

/** Drop stored files by name (bad bytes). */
async function forget(/** @type {Array<string|false>} */ names) {
  const c = await storedCache();
  if (!c) return;
  for (const n of names) if (n) await c.delete(io.url(SEM_DIR + n)).catch(() => {});
}

/** Drop stored files the manifest no longer names (an older units pack, an older runtime). */
async function pruneStored() {
  const c = await storedCache();
  if (!c) return;
  try {
    const keep = new Set(['manifest.json'].concat(man.files || []).map((f) => io.url(SEM_DIR + f)));
    for (const req of await c.keys()) if (!keep.has(req.url)) await c.delete(req);
  } catch { /* storage refused: the old files only cost space */ }
}

// ── tokenizer: BERT's (lowercase, accents off, punctuation split) + WordPiece ──
const isPunct = (/** @type {string} */ c) => {
  const o = /** @type {number} */ (c.codePointAt(0));
  return (o >= 33 && o <= 47) || (o >= 58 && o <= 64) || (o >= 91 && o <= 96) || (o >= 123 && o <= 126) || /\p{P}/u.test(c);
};
const isCjk = (/** @type {number} */ o) => (o >= 0x4e00 && o <= 0x9fff) || (o >= 0x3400 && o <= 0x4dbf) || (o >= 0x20000 && o <= 0x2a6df) ||
  (o >= 0x2a700 && o <= 0x2b73f) || (o >= 0x2b740 && o <= 0x2b81f) || (o >= 0x2b820 && o <= 0x2ceaf) || (o >= 0xf900 && o <= 0xfaff) || (o >= 0x2f800 && o <= 0x2fa1f);

/** WordPiece ids of a text, without [CLS]/[SEP]. */
export function wordPieceIds(/** @type {string} */ text, /** @type {Map<string, number>} */ vocabMap = /** @type {any} */ (vocab)) {
  let s = '';
  for (const c of String(text)) {
    const o = /** @type {number} */ (c.codePointAt(0));
    if (o === 0 || o === 0xfffd || (/\p{Cc}/u.test(c) && !/\s/.test(c))) continue;
    s += /\s/.test(c) ? ' ' : isCjk(o) ? ' ' + c + ' ' : c;
  }
  s = s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  const words = [];
  for (const chunk of s.split(' ')) {
    let w = '';
    for (const c of chunk) { if (isPunct(c)) { if (w) words.push(w); words.push(c); w = ''; } else w += c; }
    if (w) words.push(w);
  }
  const out = [];
  for (const w of words) {
    if ([...w].length > 100) { out.push(UNK); continue; }
    const pieces = [];
    let start = 0;
    let bad = false;
    while (start < w.length) {
      let end = w.length;
      let cur = -1;
      while (start < end) {
        const id = vocabMap.get((start > 0 ? '##' : '') + w.slice(start, end));
        if (id != null) { cur = id; break; }
        end--;
      }
      if (cur < 0) { bad = true; break; }
      pieces.push(cur);
      start = end;
    }
    if (bad) out.push(UNK); else out.push(...pieces);
  }
  return out;
}

/* The model learned His name as "Jesus"; the Volumes and the readers write it restored
   ("yahushua was left alone" is John 8:9). For the model only, the name reads as it learned it,
   on the query and on every passage alike (tools/build-semantic.py does the same). */
const NAME_RESTORED = /\b(?:yahushua|yeshua|yahshua|yahusha|yeshu)\b/gi;
export const meaningText = (/** @type {string} */ s) => String(s).replace(NAME_RESTORED, 'Jesus');

/** The query's unit-length vector. */
async function embed(/** @type {string} */ query) {
  const ids = [CLS].concat(wordPieceIds(man.queryPrefix + meaningText(query)).slice(0, MAX_LEN - 2), [SEP]);
  const L = ids.length;
  const big = (/** @type {number[]} */ a) => BigInt64Array.from(a, (x) => BigInt(x));
  const feeds = /** @type {any} */ ({
    input_ids: new ort.Tensor('int64', big(ids), [1, L]),
    attention_mask: new ort.Tensor('int64', big(ids.map(() => 1)), [1, L]),
  });
  if (session.inputNames.includes('token_type_ids')) feeds.token_type_ids = new ort.Tensor('int64', big(ids.map(() => 0)), [1, L]);
  const res = await session.run(feeds);
  const h = /** @type {Float32Array} */ (res[session.outputNames[0]].data);
  const v = new Float32Array(man.dim);
  let n = 0;
  for (let k = 0; k < man.dim; k++) { v[k] = h[k]; n += h[k] * h[k]; }
  n = Math.sqrt(n) || 1;
  for (let k = 0; k < man.dim; k++) v[k] /= n;
  return v;
}

/** The `limit` documents (key indexes) whose passages mean most nearly the query, best first, with every passage's score. */
async function nearest(/** @type {string} */ query, /** @type {number} */ limit) {
  const q = await embed(query);
  const vec = /** @type {Int8Array} */ (V);
  const scale = /** @type {Float32Array} */ (SCALE);
  const keyOf = /** @type {Uint32Array} */ (KEY);
  const n = man.count;
  const d = man.dim;
  const nk = man.keys.length;
  const best = new Float32Array(nk).fill(-2);
  const bestUnit = new Int32Array(nk).fill(-1);
  const scores = new Float32Array(n);
  for (let u = 0, b = 0; u < n; u++, b += d) {
    let s = 0;
    for (let k = 0; k < d; k++) s += vec[b + k] * q[k];
    s *= scale[u];
    scores[u] = s;
    const key = keyOf[u];
    if (s > best[key]) { best[key] = s; bestUnit[key] = u; }
  }
  // the `limit` best documents: a bounded insertion list (limit << documents)
  /** @type {number[]} */ const top = [];
  for (let k = 0; k < nk; k++) {
    const s = best[k];
    if (top.length === limit && s <= best[top[limit - 1]]) continue;
    let i = top.length < limit ? top.length : limit - 1;
    if (top.length < limit) top.push(k);
    while (i > 0 && best[top[i - 1]] < s) { top[i] = top[i - 1]; i--; }
    top[i] = k;
  }
  return { top, best, bestUnit, scores };
}

/** The model is loaded here, on this thread. */
const loadedHere = () => status === 'ready' && !!session && !!V && !!SCALE && !!KEY && !!START;

/**
 * The documents whose passages mean most nearly what the query says, best first.
 * `idOfKey` maps a unitKey to the engine's document id. Null while the model is not ready.
 * @returns {Promise<Array<{id: string, score: number, start: number, passages: () => Array<[number, number]>}>|null>}
 */
export async function semanticDocs(/** @type {string} */ query, /** @type {(key: string) => string|undefined} */ idOfKey, limit = 60) {
  if (where === 'worker') {
    const w = io.worker();
    /** @type {any} */ let r = null;
    try {
      if (!w || w !== onWorker) throw new Error('search worker gone');
      r = await w.request('meaning', { query, limit }, undefined, QUERY_WAIT_MS);
    } catch {
      // the worker died, went quiet, or answered that it could not run the model. One that answered is alive and still
      // holds its copy: it is given up first, so this thread's copy never sits beside it (sweep 2026-10-14 v017)
      if (w && w === onWorker && w.close) w.close('search worker: could not run the meaning model');
      void toPage(); // this thread loads the model, behind this search
      return null;
    }
    if (!r.docs) return null;
    const out = [];
    for (const doc of r.docs) {
      const id = idOfKey(doc.key);
      if (id == null) continue;
      out.push({ id, score: doc.score, start: doc.start, passages: () => doc.passages });
    }
    return out;
  }
  if (status === 'failed' && Date.now() >= retryAt) void startSemantic(); // behind this search, never in its way
  if (!loadedHere()) return null;
  /** @type {Awaited<ReturnType<typeof nearest>>} */ let r;
  try { r = await nearest(query, limit); } catch { return null; }
  const { top, best, bestUnit, scores } = r;
  const n = man.count;
  const keyOf = /** @type {Uint32Array} */ (KEY);
  const startOf = /** @type {Int32Array} */ (START);
  const out = [];
  for (const k of top) {
    const id = idOfKey(man.keys[k]);
    if (id == null) continue;
    // every passage of the document with how near it means the query, in text order
    const passages = () => {
      /** @type {Array<[number, number]>} */ const p = [];
      for (let u = 0; u < n; u++) if (keyOf[u] === k && startOf[u] >= 0) p.push([startOf[u], scores[u]]);
      return p.sort((a, b) => a[0] - b[0]);
    };
    out.push({ id, score: best[k], start: startOf[bestUnit[k]], passages });
  }
  return out;
}

/**
 * semanticDocs as the search worker answers it: the documents by unitKey, each with its passages read now
 * (a function does not cross to the page). Null while the model is not ready.
 * @returns {Promise<Array<{key: string, score: number, start: number, passages: Array<[number, number]>}>|null>}
 */
export async function semanticKeys(/** @type {string} */ query, limit = 60) {
  if (status === 'failed' && Date.now() >= retryAt) void startSemantic();
  if (!loadedHere()) return null;
  const { top, best, bestUnit, scores } = await nearest(query, limit);
  const n = man.count;
  const keyOf = /** @type {Uint32Array} */ (KEY);
  const startOf = /** @type {Int32Array} */ (START);
  /** @type {Map<number, Array<[number, number]>>} */ const passagesOf = new Map(top.map((k) => [k, []]));
  for (let u = 0; u < n; u++) {
    const list = passagesOf.get(keyOf[u]);
    if (list && startOf[u] >= 0) list.push([startOf[u], scores[u]]);
  }
  return top.map((k) => ({
    key: man.keys[k], score: best[k], start: startOf[bestUnit[k]],
    passages: /** @type {Array<[number, number]>} */ (passagesOf.get(k)).sort((a, b) => a[0] - b[0]),
  }));
}

/** The unitKey of an engine document: what the pack names documents by (tools/search-bench/corpus.mjs unitKey). */
export function docUnitKey(/** @type {any} */ doc) {
  if (!doc) return '';
  if (doc.kind === 'verse') return (doc.volumeId || 'bible') + '/' + doc.bookId + ':' + doc.chapterNum + ':' + doc.verseNum;
  if (doc.kind === 'bible-study') return 'bible-studies/' + (doc.studyChapterId || doc.letterId);
  return doc.volumeId + '/' + doc.letterId;
}

/** For tests: forget everything loaded. */
export function resetSemantic() {
  status = 'off'; starting = null; session = null; ort = null; vocab = null; man = null;
  V = null; SCALE = null; KEY = null; START = null; failure = null; retryMs = 0; retryAt = 0;
  where = 'page'; pageOnly = false; workerUnits = 0; onWorker = null; readyWaits = [];
}
