/**
 * Which build is actually running?
 *
 * WHY THIS EXISTS
 * On 2026-08-11 the owner spent several attempts fixing a "stale PWA cache" that
 * was not a cache problem at all: the newest work had never been pushed, so the
 * live site had nothing new to serve. Those two situations are observationally
 * IDENTICAL from the reader's chair — old content on screen — and the instinctive
 * response (clear the cache, reinstall the PWA) cannot fix an unpushed branch. The
 * app reported no build identity anywhere, so there was no way to tell them apart.
 *
 * The version cannot simply be baked into a bundle or index.html: CACHE_VERSION is
 * a sha256 hash OVER those very files (tools/sync-sw-version.js), so writing it
 * into one would be circular. The service worker is the only artifact that both
 * knows the version and sits outside the hashed set — so the page asks it, via the
 * GET_VERSION message handler in service-worker.js.
 *
 * Returns null when there is no service worker to ask: inside the Android WebView
 * (registration is skipped there — the APK bundles its own assets) and on a first
 * visit before the SW has taken control.
 */

/** @typedef {{ cacheVersion: string, corpusVersion: string }} BuildVersion */

const ASK_TIMEOUT_MS = 3000;

/**
 * Ask the controlling service worker which build it is serving.
 *
 * @returns {Promise<BuildVersion|null>} null when uncontrolled, unsupported, or
 *   the SW does not answer (e.g. a deployed SW older than the GET_VERSION handler).
 */
export function getBuildVersion() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return resolve(null);
    const ctrl = navigator.serviceWorker.controller;
    if (!ctrl) return resolve(null);

    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };

    // A MessageChannel keeps the reply private to THIS request, so two concurrent
    // callers can't consume each other's answer.
    let channel;
    try {
      channel = new MessageChannel();
    } catch (_e) {
      return resolve(null);
    }
    // Never hang a Settings render on the SW: an old deployed SW has no
    // GET_VERSION handler and will simply never reply.
    const timer = setTimeout(() => done(null), ASK_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      const d = event && event.data;
      if (d && d.type === 'VERSION' && typeof d.cacheVersion === 'string') {
        done({ cacheVersion: d.cacheVersion, corpusVersion: String(d.corpusVersion || '') });
      } else {
        done(null);
      }
    };
    try {
      ctrl.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch (_e) {
      clearTimeout(timer);
      done(null);
    }
  });
}

/**
 * Ask the SERVER what the newest build is, without disturbing any cache.
 *
 * Reads the deployed service-worker.js as plain text with cache:'no-store' and
 * scrapes its version literals. This never registers, installs, or activates
 * anything — it is a read-only "what does the server have?" probe, so Settings
 * can say "you are current" vs "an update is available" honestly.
 *
 * @returns {Promise<BuildVersion|null>} null when offline or the fetch fails.
 */
export async function fetchServerBuildVersion() {
  try {
    const res = await fetch('./service-worker.js', { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const cache = text.match(/const CACHE_VERSION = '([^']*)';/);
    const corpus = text.match(/const CORPUS_VERSION = '([^']*)'/);
    if (!cache) return null;
    return { cacheVersion: cache[1], corpusVersion: corpus ? corpus[1] : '' };
  } catch (_e) {
    return null;
  }
}

/**
 * Short, human-readable form of a CACHE_VERSION for a settings row.
 * 'v1.0.2-6ace992e72' -> 'v1.0.2 · 6ace992e72'
 *
 * @param {string} v
 * @returns {string}
 */
export function formatBuildVersion(v) {
  if (!v) return 'unknown';
  const m = /^(v[\d.]+)-([0-9a-f]+)$/.exec(v);
  return m ? `${m[1]} · ${m[2]}` : v;
}
