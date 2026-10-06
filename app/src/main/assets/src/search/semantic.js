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
   ═══════════════════════════════════════════════════════════════════════ */

const SEM_DIR = 'semantic/';
const CLS = 101;
const SEP = 102;
const UNK = 100;
const MAX_LEN = 64; // a query is a sentence or two; the model's own limit is 512

/** @type {{url: (p: string) => string, load: (p: string) => Promise<ArrayBuffer>, importModule: (p: string) => Promise<any>}} */
const io = {
  // bundle-e is a classic script: a path resolves against the page, never the bundle
  url: (p) => String(new URL(p, document.baseURI)),
  load: async (p) => {
    const r = await fetch(io.url(p));
    if (!r.ok) throw new Error('semantic: ' + p + ' ' + r.status);
    return r.arrayBuffer();
  },
  importModule: (p) => import(/* @vite-ignore */ io.url(p)),
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

export function semanticStatus() { return { status, failure, units: man ? man.count : 0 }; }

/** Load the model and the passage vectors, once. Resolves true when meaning search is ready. */
export function startSemantic() {
  if (starting) return starting;
  status = 'loading';
  starting = (async () => {
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
      session = await ort.InferenceSession.create(new Uint8Array(modelBuf), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      status = 'ready';
      pruneStored();
      return true;
    } catch (e) {
      status = 'failed';
      failure = String((e && /** @type {any} */ (e).message) || e);
      session = null;
      return false;
    }
  })();
  return starting;
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

/** The service worker's stored copy of the meaning files (vot-semantic-v1), when there is one. */
async function storedCache() {
  try { return typeof caches !== 'undefined' && typeof document !== 'undefined' ? await caches.open('vot-semantic-v1') : null; } catch { return null; }
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

/** The query's unit-length vector. */
async function embed(/** @type {string} */ query) {
  const ids = [CLS].concat(wordPieceIds(man.queryPrefix + query).slice(0, MAX_LEN - 2), [SEP]);
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

/**
 * The documents whose passages mean most nearly what the query says, best first.
 * `idOfKey` maps a unitKey to the engine's document id. Null while the model is not ready.
 * @returns {Promise<Array<{id: string, score: number, start: number}>|null>}
 */
export async function semanticDocs(/** @type {string} */ query, /** @type {(key: string) => string|undefined} */ idOfKey, limit = 60) {
  if (status !== 'ready' || !session || !V || !SCALE || !KEY || !START) return null;
  let q;
  try { q = await embed(query); } catch { return null; }
  const n = man.count;
  const d = man.dim;
  const nk = man.keys.length;
  const best = new Float32Array(nk).fill(-2);
  const bestUnit = new Int32Array(nk).fill(-1);
  for (let u = 0, b = 0; u < n; u++, b += d) {
    let s = 0;
    for (let k = 0; k < d; k++) s += V[b + k] * q[k];
    s *= SCALE[u];
    const key = KEY[u];
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
  const out = [];
  for (const k of top) {
    const id = idOfKey(man.keys[k]);
    if (id != null) out.push({ id, score: best[k], start: START[bestUnit[k]] });
  }
  return out;
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
  V = null; SCALE = null; KEY = null; START = null; failure = null;
}
