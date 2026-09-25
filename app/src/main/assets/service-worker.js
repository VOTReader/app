/**
 * VOTReader Service Worker
 *
 * Cache strategy:
 *   CORE_CACHE (versioned) — critical-path assets cached on install.
 *     Cleared and rebuilt on every version bump.
 *   CORPUS_CACHE (stable) — lazy-loaded corpus bundles cached on first fetch.
 *     NOT cleared on version bump (corpus data rarely changes).
 *     Only cleared when CORPUS_VERSION changes.
 *   SONGS_CACHE (unversioned) — the Songs of the Letters catalog, covers and
 *     lyrics, stale-while-revalidate. The song mp3 shards are never cached here.
 *
 * Update lifecycle (fully automatic):
 *   New SW calls self.skipWaiting() on install → takes over immediately.
 *   'controllerchange' fires in sw-register.js → page reloads onto the
 *   new build, at a moment the user can't see it (boot window or backgrounded).
 *
 * STALE-CACHE RESILIENCE — two layers, because a fresh cache KEY does not prove
 * fresh BYTES:
 *
 *   1. Every precache fetch goes out as `cache: 'reload'` (see freshReq). A plain
 *      cache.add() may satisfy itself from the browser's HTTP cache, so a
 *      brand-new vot-core-<newhash> bucket could be filled with the PREVIOUS
 *      deploy's bytes and pinned there — nothing invalidates that bucket until the
 *      NEXT version bump, and coreFirst never revalidates. Asset URLs here are
 *      unhashed (./dist/bundle-a.js) and GitHub Pages serves them with a max-age,
 *      so this is a real failure mode, not a theoretical one.
 *
 *   2. `cache: 'reload'` only governs the LOCAL HTTP cache; it has no authority
 *      over the shared CDN in front of Pages (measured: Fastly serves X-Cache HIT
 *      even when the request carries Cache-Control: no-cache, and it strips the
 *      query string from its cache key, so query-string busting cannot work here
 *      either — only a new PATH or byte verification can). What closes the gap is
 *      ASSET_INTEGRITY: install verifies every CORE text asset against a
 *      sha256 generated from the same files that produced CACHE_VERSION, and
 *      REFUSES to install a build whose bytes disagree. See the block comment on
 *      ASSET_INTEGRITY for why that beats content-hashed filenames here.
 *
 * Pages does purge its edge atomically on publish (measured: every asset returns
 * age=0 / x-cache: MISS sharing one deploy-stamped ETag prefix), so layer 2 is
 * defence for the instant around a purge — and for truncated or rewritten
 * responses, which no URL scheme can detect.
 */

const CACHE_VERSION = 'v1.0.2-66ce0c8334';
const CORPUS_VERSION = 'c61'; // c60->c61 (2026-09-22): the whisper witness learns to hear a Hebrew name list. The strict witness had read 162 Bible verses UNSPOKEN across the three whole-Bible editions with the recordings plainly speaking them ("pashur amariah malkijah" for "Pashhur, Amariah, Malchijah"), so tools/batch-align-bible.py grows a per-chapter --name-tolerant witness: a proper noun of the chapter (capitalised, five letters or more, off a stoplist) may match a near hearing by consonant skeleton or 80 % of its folded letters; ordinary words never ("there"/"three" sound alike and must not). Re-belted the 132 chapters carrying an UNSPOKEN verse (name lists: Joshua 15/18/19 border towns, Ezra 2/10, Nehemiah 7/10/12, 1 Chronicles genealogies, 2 Samuel 23): unproven verses fall 180 -> 115 (WOP 84 -> 57, BRM 41 -> 22, WEB 55 -> 36); Nehemiah 10 (WOP) goes 19/39 -> 38/39 and its GATE_PINS pin retires (the register is empty). 215 already-timed slots in those chapters move to a probe-verified onset (the strict belt had spread them between distant proven neighbours); 23 rows there are now interpolated between closer proven neighbours; 1 verse (WOP Ezra 10:35) goes dark, UNSPOKEN under both witnesses. The 28 tsot-matthew belts were re-cut under the prompt faa10620 changed (timings byte-identical). Totals: BRM 31,080 / WOP 31,045 / WEB 31,062 of 31,102; Matthew 1,071/1,071. Proof: validate-bible-sync --all-editions OK (FULL, 4 editions), test_batch_align_bible_ship 11/11 (2 new, RED on the old matcher). // PREVIOUS c59->c60 (2026-09-20): WTLB II Section 1 (Intro-28) joins the compilation read-along: audio-sync-sections.js now carries all 14 compilations, 347 letter timelines / 4,135 rows / 111,325 B (was 13 / 320 / 3,848 / 103,754 B at c59). The reader skips "The Bridegroom Approaches" and "I Am The Lord's" in that recording; tools/batch-align-sections.py now notices a skipped letter (unspoken share > 0.5) after the first belt, remembers it beside the belt (sections__<id>.large-v3.json.skipped.json) and belts again without it, so the 27 letters the reader does read sit where the transcript hears them (Splendor 180 s, Bitter 351 s, Sanctuary 408 s) instead of piled onto one instant; "Marriage" (0.500 coverage, a two-sentence letter half-read) is EXCLUDED by the letters' 0.60 gate and the page follows past it. Proof: check-audio-sync (30,821 rows / 815 timelines + 347 letters in 14 compilations, 96.1 %), validate:data 66,539 / 0, bundle budget, test_batch_align_sections 4/4. // PREVIOUS c58->c59 (2026-09-20): the WTLB compilations get their read-along: new lazy file src/data/audio-sync-sections.js (AUDIO_SYNC_SECTIONS[assetId][volKey:letterId] = rows in the AUDIO_SYNC shape on the compilation file's own clock; generator tools/batch-align-sections.py, gate leg in check-audio-sync.js, loader line lit in utils/sync-loaders.js) carries 13 of the 14 compilations: WTLB I Parts 1-7 (147 letters) and WTLB II Sections 2-7 (173 letters) = 320 letter timelines / 3,848 rows / 103,754 B, every one on a word boundary and in playback order. WTLB II Section 1 (Intro-28) is ABSENT on purpose: the recording skips "The Bridegroom Approaches" and "I Am The Lord's" (unspoken 0.95 / 1.00) and the forced-alignment leg dragged the ten letters after them onto one instant (Splendor .. Sanctuary all at 402.0 s); the generator now refuses an asset whose letters tie or whose recording skips a letter before ones it reads (asset_errors, tested), so Section 1 plays without the wash until a second belt without the skipped letters is run. Also this commit: 13 letters re-aligned on their recordings after the manifest moved (audio-sync.js 750 letters, 65 alternate timelines, 12 new): Benjamin-voice primaries for Regarding The Celebration Of Christmas (V1.012), Seek The Lord And He Will Open The Way (V1.017) and A Return To The Garden (WTLB2.125, misnumbered upstream = the wtlb1 letter), their TTS readings kept as alternates; Timothy's recording of My Anger Runs Deep (seven, num 67); and the nine trimmed re-uploads of WTLB II (The Only Truth, Splendor, The Almighty, The Riches Of Eden, A Trumpet And Alarm, The Perfect Reflection, The Prince Of Peace, Acquiesce, It Is Time - 1.4-2.8 s shorter, re-timed on the new bytes; the release archive (audio-v1) carries the new bytes as of this push). Manifest regenerated on the fresh Drive listing (730 letters, 831 assets; 4 primaries move). Proof: check-audio-sync (30,534 rows / 815 timelines + 320 letters in 13 compilations, 96.1 % of touched characters timed), check:audio-manifest, validate:data (66,539 items, 0 errors), bundle budget, runtime-src-assets 17, apk-assets 19, test_batch_align_ship 10/10 + test_batch_align_sections 4/4. // PREVIOUS c57->c58 (2026-09-20): read-along for The Word of Promise (WOP, dramatized NKJV) grows by the 26 Old Testament book(s) the 2026-09-20 01:22-06:08 CUDA window completed: Amos (9), Daniel (12), Ecclesiastes (12), Ezekiel (48), Habakkuk (3), Haggai (2), Hosea (14), Isaiah (66), Jeremiah (52), Job (42), Joel (3), Jonah (4), Joshua (24), Judges (21), Lamentations (5), Malachi (4), Micah (7), Nahum (3), Nehemiah (13), Obadiah (1), Proverbs (31), Psalms (150), Ruth (4), Song of Solomon (8), Zechariah (14), Zephaniah (3) = 555 chapters, so bible-sync-wop-nkjv.js now carries 1,189 chapters / 66 books / 31,102 verse slots / 30,999 timed / 103 unproven / 0 excluded by versification / 182,968 B (was 634 / 40 / 19,060 / 19,017 / 43 / 0 / 112,758 B at c57, the WOP numbers unchanged since c55). Held back, a book ships WHOLE OR NOT AT ALL (partial_books, mirrored in validate-bible-sync.py): none. Aligned on the RTX 5080 under the gate lock as a declared CUDA window (rc 0 at 06:08, 283.7 card-min this run, 0 memory kills under the 14 GB ceiling) against books.js's NKJV, settings 6f92bb1867 (family bible-wop-nkjv). Every new chapter cleared the 0.60 proven gate except ONE, shipped below it by GATE_PINS (tools/batch-align-bible.py, mirrored in validate-bible-sync.py): nehemiah 10 at 0.487 is a seal-list of names, 19/39 verses proven and shipped, the other 20 left dark (witness-deaf, not misaligned; a name-tolerant witness pass is a TODO) so Nehemiah ships whole with chapter 10 by ruling; 11 flagged REVIEW below the 0.90 silent-ship bar: haggai 1 (0.867); joshua 15 (0.794); joshua 19 (0.843); nehemiah 7 (0.795); nehemiah 10 (0.487); nehemiah 12 (0.872); psalms 101 (0.875); psalms 120 (0.857); psalms 123 (0.750); psalms 138 (0.875); zechariah 6 (0.867). The 60 new zero slots, by name: ezekiel 17:11; ezekiel 37:15; ezekiel 40:1; haggai 1:3; isaiah 8:5; jeremiah 33:23; job 3:2; job 12:4; job 14:1; job 27:1; job 29:1; job 35:1; job 40:1; job 42:1; joshua 13:18; joshua 15:29; joshua 15:31; joshua 15:34; joshua 15:35; joshua 15:36; joshua 15:50; joshua 18:27; joshua 19:3; joshua 19:20; joshua 19:42; joshua 19:43; joshua 19:44; joshua 19:45; joshua 19:46; judges 10:1; nehemiah 7:17; nehemiah 7:41; nehemiah 10:3; nehemiah 10:4; nehemiah 10:5; nehemiah 10:6; nehemiah 10:7; nehemiah 10:10; nehemiah 10:11; nehemiah 10:12; nehemiah 10:13; nehemiah 10:15; nehemiah 10:16; nehemiah 10:18; nehemiah 10:19; nehemiah 10:20; nehemiah 10:21; nehemiah 10:22; nehemiah 10:23; nehemiah 10:24; nehemiah 10:25; nehemiah 10:27; nehemiah 12:6; psalms 101:1; psalms 103:1; psalms 120:1; psalms 123:1; psalms 138:1; zechariah 4:2; zechariah 6:9 (the c57 43 unchanged). Proof: validate-bible-sync.py FULL (every chapter matches its corpus, its ffprobed audio and its belt; every current belt of a whole book is shipped) and the identities by name (shipped chapters == gate-clearing belts of whole books; zero slots == untimed rows + versification gaps). // PREVIOUS c56->c57 (2026-09-20): c56 put "My Anger Runs Deep" in date order at num 44 and reflowed nums 44-66, which broke a load-bearing invariant: for Volume Seven the corpus num IS the Drive file number (V7.044 Lost Sheep ... V7.066 The Last Trumpet), and Drive's own V7.045 is a different letter - the Anger recording is a Bonus Track in folder 7. Nums 44-66 are restored byte-for-byte and the letter is appended as num 67, last in the array so the index screen (which renders in array order and prints letter.num) and the number agree. Its id and audio key are unchanged: my-anger-runs-deep / seven:my-anger-runs-deep.

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
  // bundle-f (The Scripture Web). Same contract as bundle-e: precached so the
  // screen works offline, content-hashed into CACHE_VERSION, and deliberately
  // NOT in CRITICAL_ASSETS — boot never needs it.
  './dist/bundle-f.js',
  // bundle-g (the Personal Study screens). Same contract as bundle-e/-f:
  // precached so the route opens offline, non-fatal if the fetch fails.
  './dist/bundle-g.js',
  // bundle-h (the Listening Library). Same contract: precached so the library
  // opens offline, non-fatal if the fetch fails, never in CRITICAL_ASSETS.
  './dist/bundle-h.js',
  // U18: react.min.js / react-dom.min.js are NOT listed — they are
  // CONCATENATED into bundle-a.js (build.py) and never loaded standalone, so
  // precaching them was pure double-caching + extra install-failure surface
  // (addAll is all-or-nothing). search-data.js is in the same position for the
  // same reason, but since landing 27 (2026-09-22) it is bundled into
  // bundle-e.js instead — off the cold-boot path, still never fetched on its
  // own.
  // html2canvas.min.js STAYS: U13 moved it OUT of bundle-a to a lazy <script>,
  // so this precache is what keeps the first web screenshot instant + offline.
  './html2canvas.min.js',
  './fonts/cinzel-latin-400-normal.woff2',
  './fonts/cinzel-latin-700-normal.woff2',
  './fonts/cinzel-decorative-latin-400-normal.woff2',
  './fonts/cinzel-decorative-latin-700-normal.woff2',
  './fonts/eb-garamond-latin-wght-normal.woff2',
  './fonts/eb-garamond-latin-wght-italic.woff2',
  // (Reading Fonts are NOT here: fonts/reading/ lives in the STABLE
  //  corpus cache — see READING_FONT_PRECACHE — so an app-version bump
  //  doesn't re-download ~1.7 MB of never-changing font files.)
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
  // 2026-08-09: the seven Lamb of God narrative illustrations (owner call —
  // restored from the study PDF; study-image blocks in lamb-of-god ch3-ch12).
  './study-lamb-supper.jpg',
  './study-lamb-gethsemane.jpg',
  './study-lamb-thorns.jpg',
  './study-lamb-crucifixion.jpg',
  './study-lamb-burial.jpg',
  './study-lamb-resurrection.jpg',
  './study-lamb-emmaus.jpg',
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
  // The Scripture Web graph asset (2026-08-10) — raw-injected the same way,
  // ~2.5 MB of delta-encoded cross-reference arrays that change only when the
  // vendored dataset is refreshed. Stable corpus cache, never re-downloaded on
  // an app-version bump.
  './src/data/scripture-web-data.js',
  // Answers Only God Can Give (2026-09-22) — raw-injected by
  // utils/sync-loaders.js the first time a reader opens Answers, ~2.5 MB of
  // topic pages. Precached like Bible Studies: Answers is a Home card, and a
  // reader offline on the day they first open it should still get it. It
  // joined at c61 by --rebaseline, not a bump: a NEW file changes no byte a
  // client holds, and install() skips every entry the bucket already has, so
  // clients fetch only this file. Any later EDIT to it is a bump.
  './src/data/answers.js',
];

// Reading Fonts (2026-07-31) — all vendored locally, @font-face'd in
// app.css, served corpusFirst from the STABLE corpus cache: they never
// change, so they must not be re-downloaded on every app-version bump
// like CORE assets are. Precached best-effort + skip-if-present on
// install (same discipline as CORPUS_PRECACHE) so EVERY font choice
// works offline, not just ones the user tried while online. Keep in
// sync with fonts/reading/ (tools/gen-reading-fonts.mjs prints this
// list; reading-fonts.test.js gates registry ↔ disk ↔ app.css).
const READING_FONT_PRECACHE = [
  './fonts/reading/cormorant-garamond-latin-400-normal.woff2',
  './fonts/reading/cormorant-garamond-latin-700-normal.woff2',
  './fonts/reading/cormorant-garamond-latin-400-italic.woff2',
  './fonts/reading/cardo-latin-400-normal.woff2',
  './fonts/reading/cardo-latin-700-normal.woff2',
  './fonts/reading/cardo-latin-400-italic.woff2',
  './fonts/reading/gentium-book-plus-latin-400-normal.woff2',
  './fonts/reading/gentium-book-plus-latin-700-normal.woff2',
  './fonts/reading/gentium-book-plus-latin-400-italic.woff2',
  './fonts/reading/gentium-book-plus-latin-700-italic.woff2',
  './fonts/reading/rosarivo-latin-400-normal.woff2',
  './fonts/reading/rosarivo-latin-400-italic.woff2',
  './fonts/reading/crimson-pro-latin-wght-normal.woff2',
  './fonts/reading/crimson-pro-latin-wght-italic.woff2',
  './fonts/reading/sorts-mill-goudy-latin-400-normal.woff2',
  './fonts/reading/sorts-mill-goudy-latin-400-italic.woff2',
  './fonts/reading/old-standard-tt-latin-400-normal.woff2',
  './fonts/reading/old-standard-tt-latin-700-normal.woff2',
  './fonts/reading/old-standard-tt-latin-400-italic.woff2',
  './fonts/reading/im-fell-english-latin-400-normal.woff2',
  './fonts/reading/im-fell-english-latin-400-italic.woff2',
  './fonts/reading/libre-baskerville-latin-400-normal.woff2',
  './fonts/reading/libre-baskerville-latin-700-normal.woff2',
  './fonts/reading/libre-baskerville-latin-400-italic.woff2',
  './fonts/reading/lora-latin-wght-normal.woff2',
  './fonts/reading/lora-latin-wght-italic.woff2',
  './fonts/reading/literata-latin-wght-normal.woff2',
  './fonts/reading/literata-latin-wght-italic.woff2',
  './fonts/reading/merriweather-latin-400-normal.woff2',
  './fonts/reading/merriweather-latin-700-normal.woff2',
  './fonts/reading/merriweather-latin-400-italic.woff2',
  './fonts/reading/gelasio-latin-400-normal.woff2',
  './fonts/reading/gelasio-latin-700-normal.woff2',
  './fonts/reading/gelasio-latin-400-italic.woff2',
  './fonts/reading/gelasio-latin-700-italic.woff2',
  './fonts/reading/source-serif-4-latin-wght-normal.woff2',
  './fonts/reading/source-serif-4-latin-wght-italic.woff2',
  './fonts/reading/noto-serif-latin-wght-normal.woff2',
  './fonts/reading/noto-serif-latin-wght-italic.woff2',
  './fonts/reading/spectral-latin-400-normal.woff2',
  './fonts/reading/spectral-latin-600-normal.woff2',
  './fonts/reading/spectral-latin-400-italic.woff2',
  './fonts/reading/vollkorn-latin-wght-normal.woff2',
  './fonts/reading/vollkorn-latin-wght-italic.woff2',
  './fonts/reading/alegreya-latin-wght-normal.woff2',
  './fonts/reading/alegreya-latin-wght-italic.woff2',
  './fonts/reading/bitter-latin-wght-normal.woff2',
  './fonts/reading/bitter-latin-wght-italic.woff2',
  './fonts/reading/neuton-latin-400-normal.woff2',
  './fonts/reading/neuton-latin-700-normal.woff2',
  './fonts/reading/neuton-latin-400-italic.woff2',
  './fonts/reading/playfair-display-latin-wght-normal.woff2',
  './fonts/reading/playfair-display-latin-wght-italic.woff2',
  './fonts/reading/atkinson-hyperlegible-latin-400-normal.woff2',
  './fonts/reading/atkinson-hyperlegible-latin-700-normal.woff2',
  './fonts/reading/atkinson-hyperlegible-latin-400-italic.woff2',
  './fonts/reading/atkinson-hyperlegible-latin-700-italic.woff2',
  './fonts/reading/lexend-latin-wght-normal.woff2',
];

// ── Install: pre-cache critical shell + full corpus ─────────────

// Force every precache fetch past the browser's HTTP cache. `reload` still
// WRITES the fresh response back into the HTTP cache, so this costs one
// revalidation-free fetch per asset on a version bump — the same bytes we
// were going to download anyway — and buys the guarantee that a new cache
// bucket holds new bytes. (Wrapping in a Request is the only way to set a
// cache mode on cache.add/addAll, which take no init.)
const freshReq = (url) => new Request(url, { cache: 'reload' });

/**
 * INTEGRITY-VERIFIED PRECACHE (2026-08-11).
 *
 * CACHE_VERSION busting the Cache-API key proves the KEY is new. It does not
 * prove the BYTES are. The one gap left after this session's measurements is a
 * service worker whose install straddles a deploy: GitHub Pages purges its edge
 * atomically (measured — every asset returns age=0 / x-cache: MISS sharing one
 * deploy-stamped ETag), so a mixed set is only reachable in the instant around
 * that purge. Reachable is not zero, and the consequence is the worst kind:
 * coreFirst is unconditional cache-first with no revalidation, so wrong bytes
 * committed to vot-core-<newhash> are pinned until the NEXT deploy.
 *
 * The alternative fix was content-hashed filenames, so a URL implies its bytes.
 * That is a permanent tax (committed dist/ churns a new name per build, orphans
 * need pruning, ~45 references across 11 files) to fix a one-time race, and it
 * only proves the URL is new — not that the response was not truncated or
 * rewritten in transit. Verifying the bytes is strictly stronger and local.
 *
 * ASSET_INTEGRITY below is GENERATED by tools/sync-sw-version.js from the same
 * files, read the same way, in the same loop that produces CACHE_VERSION — so the
 * expectation and the version cannot describe different builds.
 *
 * SCOPE, stated exactly, because an overclaim here is how a gap hides:
 *   COVERED — the CORE text assets (.js/.css/.html/.json), plus './' which borrows
 *     index.html's hash. './' is the document that BOOTS the app on every
 *     navigation to /app/ and was the one CRITICAL asset originally left
 *     unverified; sync-sw-version now fails the build if any CRITICAL asset has no
 *     hash, so that hole cannot reopen.
 *   NOT COVERED — fonts, icons and images (cosmetic if stale, and the bulk of the
 *     bytes), and the ~10 MB corpus: CORPUS_PRECACHE, the lazy corpus bundles and
 *     fonts/reading all live in the STABLE bucket that CACHE_VERSION has no
 *     authority over. Their staleness contract is CORPUS_VERSION, enforced by
 *     tools/check-corpus-version.js — which is also what covers them being pinned
 *     the LONGEST of anything here.
 *
 * FAILURE DIRECTION IS THE POINT. On a mismatch we refetch once, and if it still
 * disagrees we THROW, which fails the install. The old service worker stays in
 * control, the reader keeps a working app, and the browser retries the update on
 * its next check. "Retry in an hour" replaces "pinned to broken bytes until the
 * next deploy". A permanent mismatch would mean the published bundles genuinely
 * disagree with the published SW — a broken deploy that SHOULD be refused, and
 * one the deploy's own committed-dist diff gate makes near-impossible.
 */
// ── BEGIN GENERATED: ASSET_INTEGRITY (tools/sync-sw-version.js) ──
const ASSET_INTEGRITY = {
  './': '87e0a06590b8f8eb98d1c3a0b2e6abb707a7818eb8a99c0de7426251f76bf1de',
  './dist/app.min.css': '9f21d078ee376a68356e340c33fc8928cd2e13d71b9723892c8574b665eaacaa',
  './dist/bundle-a.js': '08f2491b82005339ac23e82132d9b7d5fcf59d41df3ae0f8972c613ba750aeca',
  './dist/bundle-b.js': 'c363d941dd83e4f4e4934feed229472382a6a1177705009e147cbab121035f98',
  './dist/bundle-c.js': 'bff22d74a82a8fddf2da2c7a89dd47df02292646634d184870ba6486fca1547f',
  './dist/bundle-d.js': 'af9bf5524da866ab4f88b7436b1b05d9c1e6a7edd70877e5bb40a38b7451bf7b',
  './dist/bundle-e.js': 'd7fcb3d0692a2855ee501654b7d1e87cdf2ab5b64fe5d5607cd3914a427a7934',
  './dist/bundle-f.js': 'd3585d392ee388abcbe2eab0d341fa2e27a3c311caa5bd9ca59488c1351b42de',
  './dist/bundle-g.js': '3b2ef5b7bb9270169179da31be3232d00a8463b7fd80366adf60fd7cc0b6f03c',
  './dist/bundle-h.js': 'cea92c1203dd84cdd3a64f5a12ab1d3ce7df69c7e53a2924e1b5ab96ccb6a934',
  './html2canvas.min.js': 'e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb',
  './index.html': 'f2d1a3160ab23a8fb2a060c60235de5e5f502c851008d5b0bd4565fcb3804c30',
  './manifest.json': '5483690fc42f1d3738c0fbc96cd41b04eb3ce26ad15d9e5684a71c9e75745052',
  './offline.html': '9967acba6d8c0ec99a176ed1505e6298b0094208b1d6ad767567222bf736f8d1',
};
// ── END GENERATED: ASSET_INTEGRITY ──

/**
 * sha256 of a body, with CR bytes stripped.
 *
 * The strip mirrors sync-sw-version.js, which hashes local files CR-stripped so
 * a Windows working tree (CRLF) and a CI checkout (LF) agree. On GitHub Pages the
 * served text is already LF and this is a no-op; it is what makes verification
 * also hold when the local preview server serves a CRLF working tree.
 *
 * @param {ArrayBuffer} buf
 * @returns {Promise<string>} lowercase hex
 */
async function sha256Stripped(buf) {
  const bytes = new Uint8Array(buf);
  let cr = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0x0d) cr++;
  let payload = bytes;
  if (cr) {
    payload = new Uint8Array(bytes.length - cr);
    let j = 0;
    for (let i = 0; i < bytes.length; i++) if (bytes[i] !== 0x0d) payload[j++] = bytes[i];
  }
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fetch one core asset, verify it against ASSET_INTEGRITY when we have an
 * expectation for it, and put it in the cache. Returns nothing; THROWS if the
 * bytes cannot be made to match (see FAILURE DIRECTION above).
 *
 * @param {Cache} cache
 * @param {string} url
 * @returns {Promise<void>}
 */
async function addVerified(cache, url) {
  const expected = ASSET_INTEGRITY[url];
  if (!expected) {
    // No expectation (binary asset, or an older SW's map): behave as before.
    await cache.add(freshReq(url));
    return;
  }
  // service-worker-5 (2026-09-04): swUrl/swExpected/swActual ride the thrown
  // Error so a CRITICAL-asset failure (below) can report exactly which asset
  // and hashes refused the install, without re-deriving them from the
  // message string. lastActual survives past the loop for the final throw.
  let lastActual = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(freshReq(url));
    if (!res.ok) {
      throw Object.assign(new Error('[sw] ' + url + ' HTTP ' + res.status), { swUrl: url });
    }
    // clone() BEFORE reading: a Response body is single-use, and cache.put must
    // receive the original so the stored entry keeps its real headers
    // (Content-Type especially — a bundle served as octet-stream will not run).
    const actual = await sha256Stripped(await res.clone().arrayBuffer());
    lastActual = actual;
    if (actual === expected) {
      await cache.put(url, res);
      return;
    }
    console.warn('[sw] integrity mismatch on ' + url
      + ' (expected ' + expected.slice(0, 12) + ', got ' + actual.slice(0, 12) + ')'
      + (attempt === 0 ? ' — refetching once' : ''));
  }
  throw Object.assign(
    new Error('[sw] integrity check failed for ' + url
      + ' after a refetch — refusing to install this build so the previous one keeps serving.'),
    { swUrl: url, swExpected: expected, swActual: lastActual }
  );
}

self.addEventListener('install', (event) => {
  // Take over immediately — don't wait for the old SW's tabs to close.
  // controllerchange fires in sw-register.js, which reloads the page.
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      await installCore();
    } catch (err) {
      // service-worker-5 (2026-09-04): a refused install (a bad deploy, a
      // partially purged edge, a truncated upload — see ASSET_INTEGRITY above)
      // used to pin every client on the OLD build with ZERO signal reaching the
      // page: the only trace was this console.warn, in a devtools panel a phone
      // cannot open. Failing the install is still the right call (the previous
      // worker keeps serving) — but the page should get to say SOMETHING.
      console.warn('[sw] install refused:', err && err.message);
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      const payload = {
        type: 'INSTALL_REFUSED',
        message: String((err && err.message) || err),
        url: (err && err.swUrl) || null,
        expected: (err && err.swExpected) ? err.swExpected.slice(0, 12) : null,
        actual: (err && err.swActual) ? err.swActual.slice(0, 12) : null,
      };
      for (const client of clientsList) client.postMessage(payload);
      throw err; // still fail the install — the previous worker keeps serving
    }
  })());
});

/** The install body, split out so the try/catch above stays a thin wrapper. */
async function installCore() {
  const core = await caches.open(CORE_CACHE);
  // Critical shell — all-or-nothing; a miss here SHOULD fail install.
  await Promise.all(
    CORE_ASSETS.filter((a) => CRITICAL_ASSETS.has(a)).map((u) => addVerified(core, u))
  );
  // Everything else — best-effort, so a single 404 (e.g. a partial deploy or
  // a renamed asset) doesn't abort the install and silently pin the old SW.
  // NOTE: an integrity failure here does NOT fail the install — addVerified
  // throws and allSettled turns it into the warning below. Deliberate: bundle-e/-f
  // and offline.html are not needed to boot, so refusing a whole good update over
  // one of them would trade a working new build for a broken screen.
  //
  // BE HONEST ABOUT THE COST, because it is not "no consequence": coreFirst is
  // cache-first with NO cache-on-use, so an asset skipped here stays uncached for
  // the ENTIRE life of this CACHE_VERSION. Online it is refetched from the network
  // every time (slower, but correct). OFFLINE it is simply unavailable, so the
  // lazy screens degrade to the _corpusView "Try again" affordance and
  // offline.html falls back to the 503 branch in coreFirst. The next deploy
  // re-attempts it. That is the right trade for a non-boot asset, but it is a real
  // degradation and not a silent no-op — which is why it is warned, loudly.
  const bestEffort = CORE_ASSETS.filter((a) => !CRITICAL_ASSETS.has(a));
  const results = await Promise.allSettled(bestEffort.map((u) => addVerified(core, u)));
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
  // Bounded concurrency (4 workers), not one flat allSettled: the list is
  // ~60 URLs / ~9 MB, and firing them all at once saturates the link on
  // the very visit that installs the SW — racing the page's own bundle
  // fetches for first paint. 4 stays under the browser's per-host limit.
  const precacheQueue = CORPUS_PRECACHE.concat(READING_FONT_PRECACHE);
  let precacheIdx = 0;
  // service-worker-4 (2026-09-04): this loop used to swallow every failure
  // with no counter, no console.warn, no client message — install still
  // resolved, the worker activated, and Settings reported the new
  // CACHE_VERSION as if everything were healthy while the reader was
  // silently NOT offline-capable (corpusFirst's miss branch 503s later, on
  // a plane, with no earlier signal at all). Mirror the CORE best-effort
  // path above: collect what failed, warn with the count and list, and
  // additionally tell every open client — corpus misses have no other
  // surface (unlike CORE, corpusFirst never revalidates a hit, so a miss
  // here can stay invisible for the CORPUS_VERSION's entire lifetime).
  const corpusFailed = [];
  await Promise.allSettled(Array.from({ length: 4 }, async () => {
    while (precacheIdx < precacheQueue.length) {
      const url = precacheQueue[precacheIdx++];
      try {
        if (!(await corpus.match(url))) await corpus.add(freshReq(url));
      } catch (_e) {
        corpusFailed.push(url); // best-effort — corpusFirst still caches on first use
      }
    }
  }));
  if (corpusFailed.length) {
    console.warn('[sw] install: ' + corpusFailed.length + ' corpus asset(s) not precached:', corpusFailed);
    const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({ type: 'PRECACHE_INCOMPLETE', count: corpusFailed.length, urls: corpusFailed });
    }
  }
}

// ── Offline library: status from the cache itself, repair of only what is missing (B5) ──
//
// B5 (2026-09-22). The install's best-effort passes (the non-critical CORE assets above, the
// corpus + reading-font precache below) can finish with files missing, and until now the only
// trace was a console warning and a DiagnosticLog line: the reader saw a healthy app until a
// book would not open offline. Two messages close that:
//
//   CHECK_OFFLINE   -> OFFLINE_STATUS { total, missing: [url], complete }
//   REPAIR_OFFLINE  -> fetches ONLY the missing files (same verified / fresh-request paths as
//                      install), then answers OFFLINE_STATUS
//
// The status is never a record of what an install believed it did: it is read back from the
// caches every time, so "complete" means every file is in its cache right now (an eviction
// under storage pressure shows up as incomplete too). CRITICAL assets are included: install
// already guarantees them, and counting them costs one match each and catches an eviction.

/** Every file the offline library needs, and the cache it belongs in. */
function offlineLibraryPlan() {
  return CORE_ASSETS.map((url) => ({ url, bucket: CORE_CACHE, verified: true }))
    .concat(CORPUS_PRECACHE.concat(READING_FONT_PRECACHE)
      .map((url) => ({ url, bucket: CORPUS_CACHE, verified: false })));
}

/** The plan entries whose cache does not hold them right now. */
async function offlineMissing() {
  const plan = offlineLibraryPlan();
  const open = {};
  const missing = [];
  for (const item of plan) {
    const cache = open[item.bucket] || (open[item.bucket] = await caches.open(item.bucket));
    if (!(await cache.match(item.url))) missing.push(item);
  }
  return missing;
}

/** @returns {Promise<{ type: 'OFFLINE_STATUS', total: number, missing: string[], complete: boolean }>} */
async function offlineStatus() {
  const missing = await offlineMissing();
  return {
    type: 'OFFLINE_STATUS',
    total: offlineLibraryPlan().length,
    missing: missing.map((m) => m.url),
    complete: missing.length === 0,
  };
}

/** A repair already running (two tabs, or a Retry after the page gave up waiting):
    later callers share it instead of downloading every missing file again. */
let _repairInFlight = null;

/** Fetch only the missing files (4 at a time, like install), then report from the caches. */
function repairOffline() {
  if (!_repairInFlight) {
    _repairInFlight = repairOfflineOnce().finally(() => { _repairInFlight = null; });
  }
  return _repairInFlight;
}

async function repairOfflineOnce() {
  const missing = await offlineMissing();
  let idx = 0;
  await Promise.allSettled(Array.from({ length: 4 }, async () => {
    while (idx < missing.length) {
      const item = missing[idx++];
      try {
        const cache = await caches.open(item.bucket);
        if (item.verified) await addVerified(cache, item.url);
        else await cache.add(freshReq(item.url));
      } catch (_e) {
        // Reported by the status below: a file that is still not in its cache is still missing.
      }
    }
  }));
  return offlineStatus();
}

// ── Activate: clean old versioned caches ────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Claim already-open tabs BEFORE deleting their old core cache:
    // skipWaiting() alone activates this SW but leaves existing tabs on the
    // old controller, so the 'controllerchange' reload in sw-register.js
    // never fires in them — and once the old cache is gone below, such a tab
    // would 503 offline. claim() is what moves those tabs onto this SW and
    // fires controllerchange.
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => {
          if (key.startsWith('vot-core-') && key !== CORE_CACHE) return true;
          if (key.startsWith('vot-corpus-') && key !== CORPUS_CACHE) return true;
          // One-day design (2026-07-31): the download-on-demand font bucket.
          // Fonts are all vendored + corpus-cached now; reclaim the space.
          if (key === 'vot-fonts-v1') return true;
          return false;
        })
        .map((key) => caches.delete(key))
    );
  })());
});

// ── Message: page-triggered activation (belt-and-suspenders) ────
// Install already calls skipWaiting(); this path exists for a SW left
// WAITING by an older page (installed before skipWaiting-on-install) —
// sw-register.js posts SKIP_WAITING at registration to unstick it.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // GET_VERSION — let the PAGE ask which build is actually serving it.
  //
  // Added 2026-08-11 after a long misdiagnosis: the owner could not distinguish
  // "my change is live but the cache is stale" from "my change was never
  // published", because nothing in the app reported a build identity. Both look
  // identical from the reader's chair (old content on screen), and the natural
  // response — clearing caches — cannot fix an unpushed branch, so the real cause
  // stayed hidden across several attempts.
  //
  // CACHE_VERSION cannot be baked into the page or a bundle: it is a hash OVER
  // those files (see tools/sync-sw-version.js), so writing it into one of them
  // would be circular. The service worker is the only place that both knows the
  // version and is excluded from the hashed set — so the page asks it.
  // B5: the offline library's status and repair (offlineStatus / repairOffline
  // above). Answered on the caller's MessageChannel port, like GET_VERSION.
  // waitUntil keeps the worker alive through a repair's downloads; a failure to
  // read the caches answers "not complete", never "complete".
  if (event.data && (event.data.type === 'CHECK_OFFLINE' || event.data.type === 'REPAIR_OFFLINE')) {
    const work = (event.data.type === 'REPAIR_OFFLINE' ? repairOffline() : offlineStatus())
      .catch((err) => ({
        type: 'OFFLINE_STATUS', total: 0, missing: [], complete: false,
        error: String((err && err.message) || err),
      }))
      .then((status) => {
        if (event.ports && event.ports[0]) event.ports[0].postMessage(status);
        else if (event.source) event.source.postMessage(status);
      });
    if (typeof event.waitUntil === 'function') event.waitUntil(work);
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    const reply = {
      type: 'VERSION',
      cacheVersion: CACHE_VERSION,
      corpusVersion: CORPUS_VERSION,
    };
    // Prefer the MessageChannel port the caller supplied; fall back to posting
    // back to the asking client so a portless caller still gets an answer.
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(reply);
    } else if (event.source) {
      event.source.postMessage(reply);
    }
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

  // Songs of the Letters (2026-09-24, catalog-schema.md "App side"). On the
  // PWA's own origin, beside /app/: the mp3 shards (/songs-<n>/) PASS THROUGH —
  // 3 MB range-requested media the SW must not proxy or pin — and the catalog,
  // covers and lyrics (/songs/) are stale-while-revalidate: shown at once from
  // the last copy, refreshed for next time. (The APK never registers this
  // worker; it reaches the same host cross-origin, straight to the network.)
  if (/^\/songs-\d+\//.test(url.pathname)) return;
  if (url.pathname === '/songs/catalog.json' || url.pathname.startsWith('/songs/thumbs/')
      || url.pathname.startsWith('/songs/lyrics/')) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  const filename = url.pathname.split('/').pop();
  // SW1: the dist corpus bundles AND the raw-injected corpus DATA files
  // (src/data/bible-studies.js + the bible-<code>.js alt-translations) are served
  // from the stable corpus cache, so Studies + alt-translations work offline like
  // the rest of the reader (studies precached on install; translations on use).
  // ANY runtime-injected src/data/*.js belongs in the STABLE corpus cache. This
  // was `/src/data/bible-[a-z-]+\.js$/` and therefore missed
  // src/data/scripture-web-data.js (2.6 MB, injected by ScriptureWebScreen), which
  // fell through to coreFirst — where it is not in CORE_ASSETS, so it was never
  // cached on use and the Scripture Web could not work offline at all. It only
  // appeared to work because CORPUS_PRECACHE lists it and coreFirst's
  // caches.match() searches EVERY bucket, so an install-time precache hit covered
  // for the miss; if that best-effort precache failed, the screen was
  // network-only forever. Every file this pattern can match is large,
  // version-stamped corpus data by nature (the alternate translations,
  // bible-studies, the cross-reference graph), so the general rule is correct and
  // survives the next data file landing here. Keep in sync with
  // tools/list-runtime-src-assets.js, which derives the same set for the deploy.
  const isCorpusData = /\/src\/data\/[a-z0-9-]+\.js$/.test(url.pathname);
  // Reading Fonts ride the stable corpus cache too (never change; must
  // not re-download on app-version bumps). corpusFirst also caches-on-use,
  // so a font missed by the best-effort install precache still becomes
  // offline-permanent the first time it renders.
  const isReadingFont = url.pathname.includes('/fonts/reading/');
  if (CORPUS_BUNDLES.has(filename) || isCorpusData || isReadingFont) {
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

/* The songs bucket. Not versioned by CACHE_VERSION or CORPUS_VERSION, so a
   deploy's activate leaves it alone (it deletes only stale vot-core-* /
   vot-corpus-*): the catalog and covers belong to the songs sites, which
   publish on their own day, not to this build. */
const SONGS_CACHE = 'vot-songs-v1';

async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(SONGS_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    // Only a clean answer replaces the copy: never a 404, a 5xx, or a redirect
    // (a captive portal's page would otherwise become "the catalog").
    if (response && response.ok && !response.redirected) {
      try { await cache.put(request, response.clone()); } catch (_e) { /* quota: still serve */ }
    }
    return response;
  }).catch(() => null);
  if (cached) {
    // The refresh outlives this response: keep the worker alive until it lands.
    if (typeof event.waitUntil === 'function') event.waitUntil(network);
    return cached;
  }
  const response = await network;
  return response || new Response('Songs not available offline', { status: 503, statusText: 'Service Unavailable' });
}

async function corpusFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    // cache:'reload' for the same reason the install precache uses it — this
    // response gets PINNED under the versioned corpus key until the next
    // CORPUS_VERSION bump, so it must not come from a stale HTTP-cache copy.
    const response = await fetch(request, { cache: 'reload' });
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
