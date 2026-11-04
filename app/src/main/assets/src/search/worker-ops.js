/* ═══════════════════════════════════════════════════════════════════════
   search/worker-ops.js — what the search worker does (sr9, 2026-10-14)
   ═══════════════════════════════════════════════════════════════════════
   Two jobs that held the page's thread for a long task each, off it:
   - restore: read the warm index from the Cache API, parse it, and post it in
     parts (index-transfer.js); the page assembles it part by part.
   - meaning: load the on-device model and the passage vectors (semantic.js),
     embed a query and score it against every passage; the page gets the best
     documents by unitKey, each with its passages' scores.
   - build (search200 h8, 2026-11-04): a cold build, the page's ~10 s of
     MiniSearch inserts, off it. The page sends the docs it collected a part at
     a time (build-add), then build-end posts the index in parts of its own maps
     (postIndexMaps) and writes it to the warm cache here, where the 21 MB of
     JSON holds no page.
   Every request is answered by one message with `done: true` (and `error` when
   it failed); a restore posts its parts before that, a meaning-start `alive`
   every ALIVE_MS (the page gives up a worker that goes quiet, worker-client.js).
   worker.js wires this to the worker's onmessage; tests call it directly. */

import MiniSearch from './vendor/minisearch.js';
import { buildMiniSearchOptions } from './search-config.js';
import { loadCached, saveCached } from './cache.js';
import { postIndexParts, postIndexMaps } from './index-transfer.js';
import { configureSemantic, startSemantic, semanticStatus, semanticKeys } from './semantic.js';

/** The build under way, by the page's key: one at a time (a build-add marked `first` drops any other). */
/** @type {Map<string, {ms: any, addMs: number}>} */ const builds = new Map();
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** How often a meaning-start says it is alive; semantic.js gives up after several of these go missing. */
const ALIVE_MS = 5000;

/**
 * @param {any} data  {id, op, ...}
 * @param {(m: any) => void} post
 */
export async function handleWorkerMessage(data, post) {
  const { id, op } = data || {};
  const reply = (/** @type {any} */ m) => post({ id, ...m });
  try {
    if (op === 'hello') return reply({ done: true });
    if (op === 'restore') {
      const json = await loadCached(data.sig);
      if (!json) return reply({ done: true, miss: true });
      postIndexParts(JSON.parse(json), reply);
      return reply({ done: true });
    }
    if (op === 'build-add') {
      if (data.first) builds.clear();
      let b = builds.get(data.key);
      if (!b) { b = { ms: new MiniSearch(buildMiniSearchOptions()), addMs: 0 }; builds.set(data.key, b); }
      const t = clock();
      b.ms.addAll(data.docs || []);
      b.addMs += clock() - t;
      return reply({ done: true, count: b.ms.documentCount });
    }
    if (op === 'build-end') {
      const b = builds.get(data.key);
      builds.delete(data.key);
      if (!b) return reply({ done: true, error: 'search worker: no build ' + data.key });
      // the index's own maps (index-transfer.js postIndexMaps): the page builds none from an object
      postIndexMaps(b.ms, reply);
      reply({ done: true, insertMs: Math.round(b.addMs), docCount: b.ms.documentCount });
      // the warm cache for the next session, from here: the page never holds the JSON (`save` is its signature)
      if (data.save) await saveCached(data.save, JSON.stringify(b.ms));
      return undefined;
    }
    if (op === 'meaning-start') {
      // the files resolve against the page's base; this worker never starts another
      configureSemantic({ url: (p) => String(new URL(p, data.base)), worker: () => null });
      // a download on a slow line can take minutes: the page waits while this says it is alive
      const beat = setInterval(() => reply({ alive: true }), ALIVE_MS);
      let ok = false;
      try { ok = await startSemantic(); } finally { clearInterval(beat); }
      return reply({ done: true, ok, ...semanticStatus() });
    }
    if (op === 'meaning') return reply({ done: true, docs: await semanticKeys(data.query, data.limit) });
    return reply({ done: true, error: 'search worker: unknown op ' + op });
  } catch (e) {
    return reply({ done: true, error: String((e && /** @type {any} */ (e).message) || e) });
  }
}
