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

const CACHE_VERSION = 'v1.0.2-c3316be339';
const CORPUS_VERSION = 'c12'; // c11→c12 (2026-06-12): WTLB/Blessed faithfulness audit — all 360 entries verified present + complete; included the one editorial clarification footnote ("The Letters" refers to The Volumes of Truth) on WTLB One "YAHUWAH Is One", the only footnote across the collection. (c10→c11: restored 14 blank Timothy headers + Recompense's lost dream. c9→c10: restored the "(Regarding …)" occasion header line to ~40 letters. c8→c9: SW1 corpus-cache. c7→c8: CORP-2. c6→c7: CORP-1. c5→c6: PF1 minify.)

const CORE_CACHE = `vot-core-${CACHE_VERSION}`;
const CORPUS_CACHE = `vot-corpus-${CORPUS_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './dist/app.min.css',
  './manifest.json',
  './dist/bundle-a.js',
  './dist/bundle-b.js',
  './dist/bundle-c.js',
  './dist/bundle-d.js',
  // PF6: bundle-e (lazy Settings/Search/Garden screens, split out of bundle-d).
  // Precached so those screens work OFFLINE, and content-hashed into
  // CACHE_VERSION (sync-sw-version reads this list) so a code change busts it
  // like any other bundle. Deliberately NOT in CRITICAL_ASSETS: boot does not
  // need it (it loads lazily on first navigation), so a deploy hiccup on
  // bundle-e must not abort the whole SW install — the route degrades to the
  // _corpusView "Try again" affordance instead.
  './dist/bundle-e.js',
  // U18: react.min.js / react-dom.min.js / flexsearch.min.js / search.js /
  // search-data.js are NOT listed — they are CONCATENATED into bundle-a.js
  // (build.py) and never loaded standalone, so precaching them was pure
  // double-caching + extra install-failure surface (addAll is all-or-nothing).
  // html2canvas.min.js STAYS: U13 moved it OUT of bundle-a to a lazy <script>,
  // so this precache is what keeps the first web screenshot instant + offline.
  './html2canvas.min.js',
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
  // P4pwa: the <head> apple-touch-icon (180) + favicons (32/16) were referenced
  // but NOT precached → 503 offline AND outside the content-hash (editing them
  // wouldn't bump CACHE_VERSION). Best-effort (not in CRITICAL_ASSETS).
  './icons/icon-180.png',
  './icons/icon-32.png',
  './icons/icon-16.png',
  './splash.jpg',
  './study-cover-mtam.jpg',
  './study-cover-lamb.jpg',
  './study-title-part-one-title.jpg',
  './study-title-part-two-title.jpg',
  './study-title-part-three-title.jpg',
  './study-chart-chronology.jpg',
  './offline.html',
];

// P2pwa: the CRITICAL shell — the directory index, index.html, the minified
// CSS, and the four eager bundles. A partial boot is useless, so these stay
// all-or-nothing on install. Everything ELSE in CORE_ASSETS (fonts, icons,
// images, offline page, html2canvas) caches best-effort: a single 404 there
// must NOT abort the install, or the SW never reaches 'installed' → the
// update-available prompt never fires → the client is silently pinned to the
// old version. (Keep this subset of the CORE_ASSETS literal above.)
const CRITICAL_ASSETS = new Set([
  './',
  './index.html',
  './dist/app.min.css',
  './dist/bundle-a.js',
  './dist/bundle-b.js',
  './dist/bundle-c.js',
  './dist/bundle-d.js',
]);

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
  // SW1: Bible Studies is raw-injected as src/data/bible-studies.js (not a dist
  // bundle), so the reader's "works fully offline" promise used to miss it.
  // Precache it into the stable corpus cache. (The 7 alt-translation
  // bible-<code>.js are ~32 MB total — too much to precache — so they
  // cache-on-use via corpusFirst when the user actually opens one.)
  './src/data/bible-studies.js',
];

// ── Install: pre-cache critical shell + full corpus ─────────────

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const core = await caches.open(CORE_CACHE);
    // Critical shell — all-or-nothing; a miss here SHOULD fail install.
    await core.addAll(CORE_ASSETS.filter((a) => CRITICAL_ASSETS.has(a)));
    // Everything else — best-effort, so a single 404 (e.g. a partial deploy or
    // a renamed asset) doesn't abort the install and silently pin the old SW.
    const bestEffort = CORE_ASSETS.filter((a) => !CRITICAL_ASSETS.has(a));
    const results = await Promise.allSettled(bestEffort.map((u) => core.add(u)));
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? bestEffort[i] : null))
      .filter(Boolean);
    if (failed.length) {
      console.warn('[sw] install: ' + failed.length + ' best-effort asset(s) not cached:', failed);
    }

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
  // Same-origin only. Cross-origin requests (Garden images on github.com /
  // *.githubusercontent.com) pass straight to the network — the SW caches
  // nothing for them and shouldn't proxy opaque cross-origin responses. (This
  // is why the Garden is the one online-only feature on web; see offline.html.)
  if (url.origin !== self.location.origin) return;

  const filename = url.pathname.split('/').pop();
  // SW1: the dist corpus bundles AND the raw-injected corpus DATA files
  // (src/data/bible-studies.js + the bible-<code>.js alt-translations) are served
  // from the stable corpus cache, so Studies + alt-translations work offline like
  // the rest of the reader (studies precached on install; translations on use).
  const isCorpusData = /\/src\/data\/bible-[a-z-]+\.js$/.test(url.pathname);
  if (CORPUS_BUNDLES.has(filename) || isCorpusData) {
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
      // SW-2: a deep link carrying a query string (…/index.html?x=1, …/?utm=…) misses
      // the exact-match cache; fall back to the precached shell (ignoreSearch) so the
      // app still boots offline, before serving the offline page.
      const shell = await caches.match('./index.html', { ignoreSearch: true });
      if (shell) return shell;
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
    // SW-4: don't cache a REDIRECTED response — corpus URLs are exact same-origin
    // file paths with no expected redirect, so a redirect signals something unusual
    // (a captive portal / proxy); caching it would pin the wrong bytes under the
    // corpus URL. response.ok already excludes 4xx/5xx.
    if (response.ok && !response.redirected) {
      const cache = await caches.open(CORPUS_CACHE);
      // SW2: await the put so respondWith keeps the SW alive until the corpus
      // bytes are committed — a fire-and-forget put can be killed mid-write,
      // forcing a re-fetch. Guard it so a cache-write failure (e.g. quota) still
      // serves the response we already hold.
      try { await cache.put(request, response.clone()); } catch (_e) { /* still serve */ }
    }
    return response;
  } catch (_e) {
    return new Response('Corpus not available offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}
