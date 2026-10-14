/* search/worker.js — the search worker's entry (dist/bundle-w.js, a module worker; sr9, 2026-10-14).
   What it does: worker-ops.js. Who starts it: worker-client.js. */
import { handleWorkerMessage } from './worker-ops.js';

const scope = /** @type {any} */ (self);
scope.onmessage = (/** @type {MessageEvent} */ e) => { void handleWorkerMessage(e.data, (m) => scope.postMessage(m)); };
