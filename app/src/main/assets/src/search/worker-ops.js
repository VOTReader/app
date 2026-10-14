/* ═══════════════════════════════════════════════════════════════════════
   search/worker-ops.js — what the search worker does (sr9, 2026-10-14)
   ═══════════════════════════════════════════════════════════════════════
   Two jobs that held the page's thread for a long task each, off it:
   - restore: read the warm index from the Cache API, parse it, and post it in
     parts (index-transfer.js); the page assembles it part by part.
   - meaning: load the on-device model and the passage vectors (semantic.js),
     embed a query and score it against every passage; the page gets the best
     documents by unitKey, each with its passages' scores.
   Every request is answered by one message with `done: true` (and `error` when
   it failed); a restore posts its parts before that. worker.js wires this to
   the worker's onmessage; tests call it directly. */

import { loadCached } from './cache.js';
import { postIndexParts } from './index-transfer.js';
import { configureSemantic, startSemantic, semanticStatus, semanticKeys } from './semantic.js';

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
    if (op === 'meaning-start') {
      // the files resolve against the page's base; this worker never starts another
      configureSemantic({ url: (p) => String(new URL(p, data.base)), worker: () => null });
      const ok = await startSemantic();
      return reply({ done: true, ok, ...semanticStatus() });
    }
    if (op === 'meaning') return reply({ done: true, docs: await semanticKeys(data.query, data.limit) });
    return reply({ done: true, error: 'search worker: unknown op ' + op });
  } catch (e) {
    return reply({ done: true, error: String((e && /** @type {any} */ (e).message) || e) });
  }
}
