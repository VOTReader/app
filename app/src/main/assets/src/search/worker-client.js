/* ═══════════════════════════════════════════════════════════════════════
   search/worker-client.js — the page's side of the search worker (sr9, 2026-10-14)
   ═══════════════════════════════════════════════════════════════════════
   One module worker (dist/bundle-w.js, built from worker.js) reads the warm
   index and runs the meaning model off the page's thread (worker-ops.js).

   A page that cannot have it gets null and does the work itself, as before:
   node and jsdom (no Worker), a worker that fails to load (an engine without
   module workers, a WebView that does not hand a worker the app's files) or
   that does not answer its first message within HELLO_TIMEOUT_MS, or one that
   dies or goes quiet on a request past that request's limit. Every request it
   had open is refused then, so each caller falls back at once instead of
   waiting on an answer that will not come.

   A WORKER THAT RAN COMES BACK (search200 audit n48, L3.6). One error used to keep every search on the page's
   thread for the rest of the session. A worker that answered its hello and then failed is started again on the
   next use after a cooldown (30 s, doubling), at most COMEBACK_MAX times a session. One that never ran (it cannot
   load here) stays off. The meaning model is still held once: semantic.js keeps it on the page for the session
   once the page has taken it, and never asks a worker that came back to run it. */

const WORKER_URL = 'dist/bundle-w.js';
const HELLO_TIMEOUT_MS = 8000;
const COMEBACK_FIRST_MS = 30 * 1000;
const COMEBACK_MAX = 3;

/** @type {Worker|null} */ let worker = null;
let broken = false;
/** The worker now running answered its hello. */
let ran = false;
/** While broken: when the next use may start a worker again (Infinity: not this session). */
let downUntil = Infinity;
let comebacks = 0;
let seq = 0;
/** @type {Map<number, {resolve: (m: any) => void, reject: (e: Error) => void, onPart: (m: any) => void, heard: () => void}>} */
const pending = new Map();

function fail(/** @type {string} */ why) {
  broken = true;
  downUntil = ran && comebacks < COMEBACK_MAX ? Date.now() + COMEBACK_FIRST_MS * 2 ** comebacks : Infinity;
  ran = false;
  for (const p of pending.values()) p.reject(new Error(why));
  pending.clear();
  if (worker) { try { worker.terminate(); } catch { /* gone already */ } }
  worker = null;
}

/**
 * Send a request; resolves with its `done` message. `onPart` receives what comes before it (a restore's parts).
 * @param {string} op
 * @param {Record<string, any>} [data]
 * @param {(m: any) => void} [onPart]
 * @param {number} [quietMs]  refuse it (and give up the worker) when the worker has sent nothing for it this
 *   long: every part, and every `alive` a long job sends (worker-ops.js), starts the wait again, so a slow
 *   phone's restore or a slow line's model download is not cut off while it is still coming (sr9 refuter r1)
 * @returns {Promise<any>}
 */
function request(op, data, onPart, quietMs) {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new Error('search worker gone')); return; }
    const id = ++seq;
    let timer = 0;
    const heard = () => {
      if (!quietMs) return;
      if (timer) clearTimeout(timer);
      timer = /** @type {any} */ (setTimeout(() => { if (pending.has(id)) fail('search worker: no answer to ' + op); }, quietMs));
    };
    const settle = (/** @type {Function} */ f) => (/** @type {any} */ v) => { if (timer) clearTimeout(timer); f(v); };
    pending.set(id, { resolve: settle(resolve), reject: settle(reject), onPart: onPart || (() => {}), heard });
    heard();
    worker.postMessage({ id, op, ...(data || {}) });
  });
}

/** Give the worker up: what it held is done on the page from now on, and its open requests are refused. */
const close = (/** @type {string} */ why) => fail(why);

/** One per worker started, so a caller can tell a worker that came back from the one it used before. */
let client = { request, close };

/** The search worker, started on first use; null where this page cannot have one (or while one that failed cools down). */
export function searchWorker() {
  if (typeof document === 'undefined' || typeof Worker !== 'function') return null;
  if (broken) {
    if (Date.now() < downUntil) return null;
    broken = false;
    comebacks++;
  }
  if (!worker) {
    try {
      worker = new Worker(new URL(WORKER_URL, document.baseURI), { type: 'module' });
    } catch {
      broken = true;
      downUntil = Infinity;
      return null;
    }
    const w = worker;
    client = { request, close };
    worker.onmessage = (e) => {
      const m = e.data || {};
      const p = pending.get(m.id);
      if (!p) return;
      if (!m.done) {
        p.heard();
        if (m.alive) return;
        // a part the caller cannot take ends its request: it must not finish on a half-built index
        try { p.onPart(m); } catch (err) { pending.delete(m.id); p.reject(/** @type {Error} */ (err)); }
        return;
      }
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(m);
    };
    worker.onerror = () => fail('search worker failed');
    worker.onmessageerror = () => fail('search worker: a message could not be read');
    // a worker whose script never loads raises nothing: its first answer is the proof it runs
    request('hello', {}, undefined, HELLO_TIMEOUT_MS).then(() => { if (worker === w) ran = true; }, () => {});
  }
  return client;
}

/** For tests: forget the worker (and that one failed). */
export function resetSearchWorker() {
  if (worker) { try { worker.terminate(); } catch { /* gone already */ } }
  worker = null;
  broken = false;
  ran = false;
  downUntil = Infinity;
  comebacks = 0;
  pending.clear();
}
