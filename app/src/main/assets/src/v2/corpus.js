/* corpus.js - the letters' corpus for v2 screens that show many collections at once (mw5: Home's counts and titles).

   The fourteen VOT corpora load lazily as one bundle (index.html's window.__loadVotCorpus / __votCorpus). A screen asks
   for it once; the answer is 'loading', 'ready' or 'failed' (offline before it was ever cached): a failed load leaves the
   screen usable without the numbers and titles, never a spinner. */

const g = /** @type {any} */ (globalThis);

/** 'ready' when the corpus is in memory (or there is no lazy loader: the globals came with the page). */
export function votCorpusStatus(gl = g) {
  const c = gl.__votCorpus;
  if (!c || typeof gl.__loadVotCorpus !== 'function' || c.loaded) return 'ready';
  return c.error ? 'failed' : 'loading';
}

const subscribe = (cb) => {
  const c = g.__votCorpus;
  return c && typeof c.subscribe === 'function' ? c.subscribe(cb) : () => {};
};
const version = () => {
  const c = g.__votCorpus;
  return c && typeof c.getVersion === 'function' ? c.getVersion() : 0;
};

/** One ask in flight per corpus: a screen and the player (rv1) asking in the same commit share it. */
const inFlight = new WeakMap();

/** Asks for the VOT corpus unless it is here or already asked for; settles when it lands, rejects when it fails (a later
 *  ask retries). @returns {Promise<void>} */
export function askVotCorpus(gl = g) {
  const c = gl.__votCorpus;
  if (!c || c.loaded || typeof gl.__loadVotCorpus !== 'function') return Promise.resolve();
  if (inFlight.has(c)) return inFlight.get(c);
  const p = Promise.resolve(gl.__loadVotCorpus()).finally(() => { inFlight.delete(c); });
  inFlight.set(c, p);
  return p;
}

/** Asks for the VOT corpus once per mount (the loader retries after a failure) and re-renders when it lands or fails.
 *  @returns {'loading' | 'ready' | 'failed'} */
export function useVotCorpus() {
  React.useSyncExternalStore(subscribe, version);
  React.useEffect(() => {
    askVotCorpus().catch(() => { /* the loader flags the error and bumps its version */ });
  }, []);
  return votCorpusStatus();
}
