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
   - warm (search200 h8 round 2): the originals' keys and the token store the
     first search waits for (warm-read.js), read here from the index this
     worker just built or restored, which it keeps until then (`key`, the
     page's name for it), with the KJV wording read from the page's own file.
   Every request is answered by one message with `done: true` (and `error` when
   it failed); a restore posts its parts before that, a meaning-start `alive`
   every ALIVE_MS (the page gives up a worker that goes quiet, worker-client.js).
   worker.js wires this to the worker's onmessage; tests call it directly. */

import MiniSearch from './vendor/minisearch.js';
import { buildMiniSearchOptions } from './search-config.js';
import { loadCached, saveCached } from './cache.js';
import { postIndexParts, postIndexMaps } from './index-transfer.js';
import { configureSemantic, startSemantic, semanticStatus, semanticKeys } from './semantic.js';
import { readWarm } from './warm-read.js';
import { parseKjvTwin, twinView } from './kjv-twin.js';

/** The index last built or restored here, kept for its warm read: what of it warm-read.js reads, under the page's key. */
/** @type {{key: string, ms: any}|null} */ let kept = null;
/** The KJV wording, by the file it was read from: a page reads one file a session. */
/** @type {{url: string, twin: any}|null} */ let twinRead = null;
/** Entries per part of the originals' and the runs' maps. */
const WARM_PART = 8000;
/** An object keyed by numbers as a Map, in its keys' order (MiniSearch's objectToNumericMap, as the page's index has it). */
function numericMap(/** @type {Record<string, any>} */ obj) {
  const m = new Map();
  for (const k of Object.keys(obj)) m.set(parseInt(k, 10), obj[k]);
  return m;
}
/** The KJV wording read from `url` (absolute), parsed as kjv-twin.js parses it on the page. */
async function twinFrom(/** @type {string} */ url) {
  if (twinRead && twinRead.url === url) return twinRead.twin;
  const r = await fetch(url);
  if (!r.ok || r.redirected) throw new Error('kjv twin: ' + url + ' ' + (r.redirected ? 'redirected' : r.status));
  const twin = parseKjvTwin(await r.json());
  twinRead = { url, twin };
  return twin;
}

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
      const js = JSON.parse(json);
      postIndexParts(js, reply);
      if (data.key) kept = { key: data.key, ms: { _storedFields: numericMap(js.storedFields), _documentIds: numericMap(js.documentIds), _nextId: js.nextId, _fieldIds: js.fieldIds } };
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
      kept = { key: data.key, ms: b.ms };
      reply({ done: true, insertMs: Math.round(b.addMs), docCount: b.ms.documentCount });
      // the warm cache for the next session, from here: the page never holds the JSON (`save` is its signature)
      if (data.save) await saveCached(data.save, JSON.stringify(b.ms));
      return undefined;
    }
    if (op === 'warm') {
      const k = kept;
      if (!k || k.key !== data.key) return reply({ done: true, error: 'search worker: no index ' + data.key });
      kept = null;
      const twin = data.twin ? await twinFrom(data.twin) : null;
      const t = clock();
      const { O, S, store } = readWarm(k.ms, twin ? twinView(twin, k.ms) : null);
      for (const [part, m] of /** @type {Array<[string, Map<any, any>]>} */ ([['originals', O], ['shingles', S]])) {
        let entries = [];
        for (const e of m) { entries.push(e); if (entries.length >= WARM_PART) { reply({ part, entries }); entries = []; } }
        if (entries.length) reply({ part, entries });
      }
      const { ms: _ms, ...rest } = store;
      reply({ part: 'store', store: rest });
      return reply({ done: true, readMs: Math.round(clock() - t) });
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
