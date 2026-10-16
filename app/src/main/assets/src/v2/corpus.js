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

/** Asks for the VOT corpus once per mount (the loader retries after a failure) and re-renders when it lands or fails;
 *  with `ask` false it only listens (a journal entry asks once it holds a letter's card).
 *  @returns {'loading' | 'ready' | 'failed'} */
export function useVotCorpus(ask = true) {
  React.useSyncExternalStore(subscribe, version);
  React.useEffect(() => {
    if (ask) askVotCorpus().catch(() => { /* the loader flags the error and bumps its version */ });
  }, [ask]);
  return votCorpusStatus();
}

/* Answers Only God Can Give loads on its own: bundle-d's utils/sync-loaders.js publishes window.__answersCorpus and
   __loadAnswersCorpus (main's screen-routes gates its Answers routes on the same pair). */
const subscribeAnswers = (cb) => {
  const c = g.__answersCorpus;
  return c && typeof c.subscribe === 'function' ? c.subscribe(cb) : () => {};
};
const answersVersion = () => {
  const c = g.__answersCorpus;
  return c && typeof c.getVersion === 'function' ? c.getVersion() : 0;
};

/** Re-renders when the Answers corpus lands or fails; the number changes each time. @returns {number} */
export function useAnswersCorpusVersion() {
  return React.useSyncExternalStore(subscribeAnswers, answersVersion);
}

/** Asks for the Answers corpus unless it is here (the loader shares one fetch and retries after a failure). @returns {Promise<void>} */
export function askAnswersCorpus(gl = g) {
  const c = gl.__answersCorpus;
  if ((c && c.loaded) || typeof gl.__loadAnswersCorpus !== 'function') return Promise.resolve();
  return Promise.resolve(gl.__loadAnswersCorpus());
}

/* main's Bible loads on its own too (index.html's window.__bibleCorpus / __loadBibleCorpus): a verse in neither dictionary
   comes from it (lookupVersesFromBooks), so whatever shows such a verse redraws when it lands (main bc24368b9). */
const subscribeBible = (cb) => {
  const c = g.__bibleCorpus;
  return c && typeof c.subscribe === 'function' ? c.subscribe(cb) : () => {};
};
const bibleVersion = () => {
  const c = g.__bibleCorpus;
  return c && typeof c.getVersion === 'function' ? c.getVersion() : 0;
};

/** Re-renders when main's Bible lands or fails; with `ask` it also asks for it (main's loader shares one fetch and
 *  retries after a failure; main's Answers topics start it the same way). @returns {number} */
export function useBibleCorpus(ask = false) {
  const v = React.useSyncExternalStore(subscribeBible, bibleVersion);
  React.useEffect(() => {
    const c = g.__bibleCorpus;
    if (!ask || (c && c.loaded) || typeof g.__loadBibleCorpus !== 'function') return;
    Promise.resolve(g.__loadBibleCorpus()).catch(() => { /* the loader flags the error and bumps its version */ });
  }, [ask]);
  return v;
}

/* The Words To Live By compilations' timings (src/data/audio-sync-sections.js) name each compilation's first entry, and
   load on their own as well: main's AudioPlayer.sectionOpeningKey asks for them, and bundle-d's utils/sync-loaders.js
   publishes their store and loader as window.__audioSyncSectionsStore / __loadAudioSyncSections (v2g11b). */
const subscribeSections = (cb) => {
  const s = g.__audioSyncSectionsStore;
  return s && typeof s.subscribe === 'function' ? s.subscribe(cb) : () => {};
};
const sectionsVersion = () => {
  const s = g.__audioSyncSectionsStore;
  return s && typeof s.getVersion === 'function' ? s.getVersion() : 0;
};

/** Re-renders when the compilations' timings land; the number changes each time. @returns {number} */
export function useAudioSyncSectionsVersion() {
  return React.useSyncExternalStore(subscribeSections, sectionsVersion);
}

/** Asks for the compilations' timings unless they are here (one fetch per page; resolves on failure). @returns {Promise<void>} */
export function askAudioSyncSections(gl = g) {
  if (gl.AUDIO_SYNC_SECTIONS || typeof gl.__loadAudioSyncSections !== 'function') return Promise.resolve();
  return Promise.resolve(gl.__loadAudioSyncSections());
}
