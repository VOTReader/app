/**
 * VOTReader Service Worker
 *
 * Cache strategy:
 *   CORE_CACHE (versioned) — critical-path assets cached on install.
 *     Cleared and rebuilt on every version bump.
 *   CORPUS_CACHE (stable) — lazy-loaded corpus bundles cached on first fetch.
 *     NOT cleared on version bump (corpus data rarely changes).
 *     Only cleared when CORPUS_VERSION changes.
 *
 * Update lifecycle (no skipWaiting on install — user controls timing):
 *   New SW installs in background → goes to "waiting".
 *   Page detects the waiting worker → shows "update available" toast.
 *   User taps → page posts SKIP_WAITING → this SW skipWaiting()s → it
 *   activates → 'controllerchange' fires → page reloads on the new build.
 */

const CACHE_VERSION = 'v1.0.2-a6314060ec';
const CORPUS_VERSION = 'c5'; // c4→c5 (2026-05-31): footnote pile-strip — remaining "N." verse markers added to volume-two + wtlb-scriptures so every multi-verse footnote splits into gold sups (the marker-less guessing heuristics were deleted from scripture-parse); re-fetch the corrected corpus.

const CORE_CACHE = `vot-core-${CACHE_VERSION}`;
const CORPUS_CACHE = `vot-corpus-${CORPUS_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './app.css',
  './manifest.json',
  './dist/bundle-a.js',
  './dist/bundle-b.js',
  './dist/bundle-c.js',
  './dist/bundle-d.js',
  './react.min.js',
  './react-dom.min.js',
  './flexsearch.min.js',
  './html2canvas.min.js',
  './search.js',
  './search-data.js',
  './data-normalize.js',
  './fonts/cinzel-latin-400-normal.woff2',
  './fonts/cinzel-latin-700-normal.woff2',
  './fonts/cinzel-decorative-latin-400-normal.woff2',
  './fonts/cinzel-decorative-latin-700-normal.woff2',
  './fonts/eb-garamond-latin-wght-normal.woff2',
  './fonts/eb-garamond-latin-wght-italic.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './splash.jpg',
  './study-cover-mtam.jpg',
  './study-cover-lamb.jpg',
  './study-title-part-one-title.jpg',
  './study-title-part-two-title.jpg',
  './study-title-part-three-title.jpg',
  './study-chart-chronology.jpg',
  './offline.html',
];

const CORPUS_BUNDLES = new Set([
  'bundle-a-bible.js',
  'bundle-a-matthew.js',
  'bundle-a-vot.js',
]);

// Lazy corpus bundles pre-cached on install so the WHOLE reader works
// offline — not just the sections a user happened to open while online.
// Relative to scope; resolves identically to the page's lazy-loader
// script.src so the cached entry is hit on later offline loads.
const CORPUS_PRECACHE = [
  './dist/bundle-a-bible.js',
  './dist/bundle-a-matthew.js',
  './dist/bundle-a-vot.js',
];

// ── Install: pre-cache critical shell + full corpus ─────────────

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Core shell — must all succeed (small, the critical path).
    const core = await caches.open(CORE_CACHE);
    await core.addAll(CORE_ASSETS);

    // Full corpus into the STABLE corpus cache, so an app-version bump
    // won't re-download ~10 MB (only a CORPUS_VERSION bump will). Best-
    // effort: a miss (e.g. the user went offline mid-install) must NOT
    // fail the install — corpusFirst still caches it on first use. Skip-
    // if-present so a re-install never re-fetches what's already there.
    const corpus = await caches.open(CORPUS_CACHE);
    await Promise.allSettled(
      CORPUS_PRECACHE.map(async (url) => {
        if (!(await corpus.match(url))) await corpus.add(url);
      })
    );
  })());
});

// ── Activate: clean old versioned caches ────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => {
            if (key.startsWith('vot-core-') && key !== CORE_CACHE) return true;
            if (key.startsWith('vot-corpus-') && key !== CORPUS_CACHE) return true;
            return false;
          })
          .map((key) => caches.delete(key))
      );
    })
  );
});

// ── Message: page-triggered activation (one-tap update) ────────
// The page posts { type: 'SKIP_WAITING' } when the user taps the
// "update available" toast. We deliberately do NOT skipWaiting on
// install — the user opts in here, so they keep control of reload timing.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch: cache-first for core, cache-on-use for corpus ────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  // Same-origin only. Cross-origin requests (Garden images on github.com,
  // the connectivity ping) pass straight to the network — the SW caches
  // nothing for them and shouldn't proxy opaque cross-origin responses.
  if (url.origin !== self.location.origin) return;

  const filename = url.pathname.split('/').pop();
  if (CORPUS_BUNDLES.has(filename)) {
    event.respondWith(corpusFirst(event.request));
    return;
  }

  event.respondWith(coreFirst(event.request));
});

async function coreFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    return response;
  } catch (_e) {
    if (request.mode === 'navigate') {
      const offline = await caches.match('./offline.html');
      if (offline) return offline;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function corpusFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CORPUS_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_e) {
    return new Response('Corpus not available offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}
