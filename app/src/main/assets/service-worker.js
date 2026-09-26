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

const CACHE_VERSION = 'v1.0.2-5d5493ad9f';
const CORPUS_VERSION = 'c65'; // c64->c65 (2026-09-26): sweep-2 corpus rows (align s6a). (1) Two WOP NKJV verses never lit: 1 Samuel 30:15 and Isaiah 52:4 shipped the SAME onset as the verse above them (leg B had heard the verse before them and the shipper clamped the early onset up to its neighbour, a tie the binary search resolves to the later verse). ship() now leaves a row at or before the onset above it dark (0 = unproven) and validate-bible-sync refuses a tie as well as a backwards step: WOP timed 31,047 -> 31,045, no other slot moves in any edition (v14-corpus-03). (2) The Bible Studies lose 57 spaces before punctuation ('not a person , nor', 'Volume 4 )') and 3 doubled cites ('{{ref:Acts 2:27}} ({{ref:Acts 2:27}})'), import artifacts the site does not have; validate-schemas STUDY1 now refuses both (v14-corpus-02). (3) segmentRenderText no longer puts a space after an opening quote or before a closing one at a segment seam: 187 quote marks in the Studies sat a space away from their words (v14-corpus-01; no letter changes). The Purity study's six read-along timelines were re-aligned on the new text (check:audio-sync OK, coverage 0.973-0.996). // PREVIOUS c63->c64 (2026-09-25): Bible read-along, whisper holes filled (align tx-fill fill1 + tol3 re-belt of 128 planned chapters, 15 of them held back after a refuter found name-list onsets anchored on the second name and guessed REVIEW onsets in filled holes): 35 chapters change, net +28 verses lit (wop +2 in 5 chapters, web +10 in 13, brm +16 in 17), 56 onsets moved, mostly the verse just after a hole whose onset had stuck at the transcriber's 30 s seek point (e.g. web Ecclesiastes 9:2 31.12 -> 23.56 s, 'All things' heard at 22.9). Timed now wop 31,047 / web 31,072 / brm 31,096 of 31,102; validate-bible-sync --all-editions OK. Plus V5 'Do Not Look Back; Escape to The Father's House' gets its apostrophe (sweep-2 n8-05). // PREVIOUS c62->c63 (2026-09-25): six Answers source lines named The Blessed's Introduction for passages it does not hold (improvement sweep n5-04): a bare The_Blessed link resolved to the Introduction every time. tools/fetch-answers.py now picks the entry holding the passage's lines, so The Coming of The Lord @223 and Regarding the Gathering Up @27 / @182 name "Blessed Are Those Who Believe in Me", Regarding Patience @38 / @89 "Blessed Are Those Who Serve Me as I Have Loved Them" and Regarding Obedience @138 "Blessed Are Those Who Walk in My Ways", and their source taps open those entries. Those six paragraphs change in place; no paragraph moves (the converter's new shift gate passes), so every reader's marks stay put. // PREVIOUS c61->c62 (2026-09-25): Answers Only God Can Give loses its leaked wiki markup. tools/fetch-answers.py only split sections on `==Heading==`, so the six topics written with single-`=` headings (The Coming of The Lord, The One Who Stays Lets, Visions, Regarding the Day of The Lord, Regarding Spiritual Gifts, Regarding the Holidays of Men) shipped 37 raw "=Heading=" lines as body text, their Related Topics links as prose and their Navigation boilerplate; they now convert like every other heading, and those six topics gain their Related Topics cards. The site's "Videos" section (a YouTube playlist link the app does not carry, a dead line on 11 pages) is dropped like Navigation. answers.js 10,104 -> 10,009 paragraphs, 1,636 attributions unchanged; 105 of 121 topics byte-identical; 15 lose only trailing sections, and one (Regarding Spiritual Gifts) moves its paragraphs from 88 on by one, where a raw heading had shared a paragraph with the text under it. // PREVIOUS c60->c61 (2026-09-22): the whisper witness learns to hear a Hebrew name list. The strict witness had read 162 Bible verses UNSPOKEN across the three whole-Bible editions with the recordings plainly speaking them ("pashur amariah malkijah" for "Pashhur, Amariah, Malchijah"), so tools/batch-align-bible.py grows a per-chapter --name-tolerant witness: a proper noun of the chapter (capitalised, five letters or more, off a stoplist) may match a near hearing by consonant skeleton or 80 % of its folded letters; ordinary words never ("there"/"three" sound alike and must not). Re-belted the 132 chapters carrying an UNSPOKEN verse (name lists: Joshua 15/18/19 border towns, Ezra 2/10, Nehemiah 7/10/12, 1 Chronicles genealogies, 2 Samuel 23): unproven verses fall 180 -> 115 (WOP 84 -> 57, BRM 41 -> 22, WEB 55 -> 36); Nehemiah 10 (WOP) goes 19/39 -> 38/39 and its GATE_PINS pin retires (the register is empty). 215 already-timed slots in those chapters move to a probe-verified onset (the strict belt had spread them between distant proven neighbours); 23 rows there are now interpolated between closer proven neighbours; 1 verse (WOP Ezra 10:35) goes dark, UNSPOKEN under both witnesses. The 28 tsot-matthew belts were re-cut under the prompt faa10620 changed (timings byte-identical). Totals: BRM 31,080 / WOP 31,045 / WEB 31,062 of 31,102; Matthew 1,071/1,071. Proof: validate-bible-sync --all-editions OK (FULL, 4 editions), test_batch_align_bible_ship 11/11 (2 new, RED on the old matcher). // PREVIOUS c59->c60 (2026-09-20): WTLB II Section 1 (Intro-28) joins the compilation read-along: audio-sync-sections.js now carries all 14 compilations, 347 letter timelines / 4,135 rows / 111,325 B (was 13 / 320 / 3,848 / 103,754 B at c59). The reader skips "The Bridegroom Approaches" and "I Am The Lord's" in that recording; tools/batch-align-sections.py now notices a skipped letter (unspoken share > 0.5) after the first belt, remembers it beside the belt (sections__<id>.large-v3.json.skipped.json) and belts again without it, so the 27 letters the reader does read sit where the transcript hears them (Splendor 180 s, Bitter 351 s, Sanctuary 408 s) instead of piled onto one instant; "Marriage" (0.500 coverage, a two-sentence letter half-read) is EXCLUDED by the letters' 0.60 gate and the page follows past it. Proof: check-audio-sync (30,821 rows / 815 timelines + 347 letters in 14 compilations, 96.1 %), validate:data 66,539 / 0, bundle budget, test_batch_align_sections 4/4. // PREVIOUS c58->c59 (2026-09-20): the WTLB compilations get their read-along: new lazy file src/data/audio-sync-sections.js (AUDIO_SYNC_SECTIONS[assetId][volKey:letterId] = rows in the AUDIO_SYNC shape on the compilation file's own clock; generator tools/batch-align-sections.py, gate leg in check-audio-sync.js, loader line lit in utils/sync-loaders.js) carries 13 of the 14 compilations: WTLB I Parts 1-7 (147 letters) and WTLB II Sections 2-7 (173 letters) = 320 letter timelines / 3,848 rows / 103,754 B, every one on a word boundary and in playback order. WTLB II Section 1 (Intro-28) is ABSENT on purpose: the recording skips "The Bridegroom Approaches" and "I Am The Lord's" (unspoken 0.95 / 1.00) and the forced-alignment leg dragged the ten letters after them onto one instant (Splendor .. Sanctuary all at 402.0 s); the generator now refuses an asset whose letters tie or whose recording skips a letter before ones it reads (asset_errors, tested), so Section 1 plays without the wash until a second belt without the skipped letters is run. Also this commit: 13 letters re-aligned on their recordings after the manifest moved (audio-sync.js 750 letters, 65 alternate timelines, 12 new): Benjamin-voice primaries for Regarding The Celebration Of Christmas (V1.012), Seek The Lord And He Will Open The Way (V1.017) and A Return To The Garden (WTLB2.125, misnumbered upstream = the wtlb1 letter), their TTS readings kept as alternates; Timothy's recording of My Anger Runs Deep (seven, num 67); and the nine trimmed re-uploads of WTLB II (The Only Truth, Splendor, The Almighty, The Riches Of Eden, A Trumpet And Alarm, The Perfect Reflection, The Prince Of Peace, Acquiesce, It Is Time - 1.4-2.8 s shorter, re-timed on the new bytes; the release archive (audio-v1) carries the new bytes as of this push). Manifest regenerated on the fresh Drive listing (730 letters, 831 assets; 4 primaries move). Proof: check-audio-sync (30,534 rows / 815 timelines + 320 letters in 13 compilations, 96.1 % of touched characters timed), check:audio-manifest, validate:data (66,539 items, 0 errors), bundle budget, runtime-src-assets 17, apk-assets 19, test_batch_align_ship 10/10 + test_batch_align_sections 4/4. // PREVIOUS c57->c58 (2026-09-20): read-along for The Word of Promise (WOP, dramatized NKJV) grows by the 26 Old Testament book(s) the 2026-09-20 01:22-06:08 CUDA window completed: Amos (9), Daniel (12), Ecclesiastes (12), Ezekiel (48), Habakkuk (3), Haggai (2), Hosea (14), Isaiah (66), Jeremiah (52), Job (42), Joel (3), Jonah (4), Joshua (24), Judges (21), Lamentations (5), Malachi (4), Micah (7), Nahum (3), Nehemiah (13), Obadiah (1), Proverbs (31), Psalms (150), Ruth (4), Song of Solomon (8), Zechariah (14), Zephaniah (3) = 555 chapters, so bible-sync-wop-nkjv.js now carries 1,189 chapters / 66 books / 31,102 verse slots / 30,999 timed / 103 unproven / 0 excluded by versification / 182,968 B (was 634 / 40 / 19,060 / 19,017 / 43 / 0 / 112,758 B at c57, the WOP numbers unchanged since c55). Held back, a book ships WHOLE OR NOT AT ALL (partial_books, mirrored in validate-bible-sync.py): none. Aligned on the RTX 5080 under the gate lock as a declared CUDA window (rc 0 at 06:08, 283.7 card-min this run, 0 memory kills under the 14 GB ceiling) against books.js's NKJV, settings 6f92bb1867 (family bible-wop-nkjv). Every new chapter cleared the 0.60 proven gate except ONE, shipped below it by GATE_PINS (tools/batch-align-bible.py, mirrored in validate-bible-sync.py): nehemiah 10 at 0.487 is a seal-list of names, 19/39 verses proven and shipped, the other 20 left dark (witness-deaf, not misaligned; a name-tolerant witness pass is a TODO) so Nehemiah ships whole with chapter 10 by ruling; 11 flagged REVIEW below the 0.90 silent-ship bar: haggai 1 (0.867); joshua 15 (0.794); joshua 19 (0.843); nehemiah 7 (0.795); nehemiah 10 (0.487); nehemiah 12 (0.872); psalms 101 (0.875); psalms 120 (0.857); psalms 123 (0.750); psalms 138 (0.875); zechariah 6 (0.867). The 60 new zero slots, by name: ezekiel 17:11; ezekiel 37:15; ezekiel 40:1; haggai 1:3; isaiah 8:5; jeremiah 33:23; job 3:2; job 12:4; job 14:1; job 27:1; job 29:1; job 35:1; job 40:1; job 42:1; joshua 13:18; joshua 15:29; joshua 15:31; joshua 15:34; joshua 15:35; joshua 15:36; joshua 15:50; joshua 18:27; joshua 19:3; joshua 19:20; joshua 19:42; joshua 19:43; joshua 19:44; joshua 19:45; joshua 19:46; judges 10:1; nehemiah 7:17; nehemiah 7:41; nehemiah 10:3; nehemiah 10:4; nehemiah 10:5; nehemiah 10:6; nehemiah 10:7; nehemiah 10:10; nehemiah 10:11; nehemiah 10:12; nehemiah 10:13; nehemiah 10:15; nehemiah 10:16; nehemiah 10:18; nehemiah 10:19; nehemiah 10:20; nehemiah 10:21; nehemiah 10:22; nehemiah 10:23; nehemiah 10:24; nehemiah 10:25; nehemiah 10:27; nehemiah 12:6; psalms 101:1; psalms 103:1; psalms 120:1; psalms 123:1; psalms 138:1; zechariah 4:2; zechariah 6:9 (the c57 43 unchanged). Proof: validate-bible-sync.py FULL (every chapter matches its corpus, its ffprobed audio and its belt; every current belt of a whole book is shipped) and the identities by name (shipped chapters == gate-clearing belts of whole books; zero slots == untimed rows + versification gaps). // PREVIOUS c56->c57 (2026-09-20): c56 put "My Anger Runs Deep" in date order at num 44 and reflowed nums 44-66, which broke a load-bearing invariant: for Volume Seven the corpus num IS the Drive file number (V7.044 Lost Sheep ... V7.066 The Last Trumpet), and Drive's own V7.045 is a different letter - the Anger recording is a Bonus Track in folder 7. Nums 44-66 are restored byte-for-byte and the letter is appended as num 67, last in the array so the index screen (which renders in array order and prints letter.num) and the number agree. Its id and audio key are unchanged: my-anger-runs-deep / seven:my-anger-runs-deep.

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
  // The lazy screens' own stylesheets (n7-08, tools/split-lazy-css.mjs): the
  // rules of app.css only bundle-e/-f/-g/-h use, loaded beside each bundle.
  // Same contract as the bundles: precached so the screens open offline
  // styled, hashed into CACHE_VERSION, never in CRITICAL_ASSETS.
  './dist/screens-e.min.css',
  './dist/screens-f.min.css',
  './dist/screens-g.min.css',
  './dist/screens-h.min.css',
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
  './': '2cfbb58ac1c277744f6d9472b572ce64278b8f8f0457deff1e436c426d9842a3',
  './dist/app.min.css': '5845a4a637a7ff00bfa4ff9979dc18ee85efa6af9651c90170fb28b87b9b5bd6',
  './dist/bundle-a.js': '08f2491b82005339ac23e82132d9b7d5fcf59d41df3ae0f8972c613ba750aeca',
  './dist/bundle-b.js': 'a60246a091664d10fd4918e7529fd36744dc40b8c39ee9e52c2602ae9adb2ee8',
  './dist/bundle-c.js': 'd63d87e8fdb5e61adf34032b171734c026813b3f3eb1fc8689774661540b369b',
  './dist/bundle-d.js': '5b8ecc30571326dc087f43bf70312cfddc0b251ba9c2fab5bd334f9c12a302e9',
  './dist/bundle-e.js': '54d84bcacf07ec49b43c89fe57f0ecb1f0dd1abbbd4fa93b5c31ca49d2f21c73',
  './dist/bundle-f.js': '5a7a9c8785875d48c221317955b31e0c01ab93d6becee5bf1669782365886a4e',
  './dist/bundle-g.js': 'b9ef92ddbdebc25e694e5d3ff3a377c668c2d8d59ced9e2367aab952dd2546e1',
  './dist/bundle-h.js': '2e4af9732adcac20a14ec2cc50ced42e41f2845cfbc18cc8bf9f28f2b200b6c0',
  './dist/screens-e.min.css': '270514e648ff0229ad1368c4b0c6f44dd2b519a3570fec1b9db818a5f132aafb',
  './dist/screens-f.min.css': 'b1d28186da4cfac4d81a655ee25645c076dac5e3aac023c6a73882408a1adf85',
  './dist/screens-g.min.css': '5310b4444dfb0e88ba91606435af7d1c8511b36643cc7040f0cdf1eac6341dc6',
  './dist/screens-h.min.css': '9822b2abe9b40bff4ecc241f696ba4a63cb321e656421af2d5158a29bfcbe352',
  './html2canvas.min.js': 'e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb',
  './index.html': '2cfbb58ac1c277744f6d9472b572ce64278b8f8f0457deff1e436c426d9842a3',
  './manifest.json': '5483690fc42f1d3738c0fbc96cd41b04eb3ce26ad15d9e5684a71c9e75745052',
  './offline.html': '2503259b6f277a3dc6c3952617a712794f0cc84c5437469941124d3562a4e116',
};
// ── END GENERATED: ASSET_INTEGRITY ──

/* ASSET_REVISIONS (REPORT #10, v06-02/04, 2026-09-25), generated beside ASSET_INTEGRITY: the sha256 of every
   other file an update would download again although it did not change (core pictures and fonts, the
   precached corpus, the reading fonts, the runtime src/data files cached on use). copyForward puts the
   previous bucket's copy into the new bucket when it hashes to this revision (or to ASSET_INTEGRITY for a
   text asset), so an update fetches only what changed. A copy that does not match is never used. */
// ── BEGIN GENERATED: ASSET_REVISIONS (tools/sync-sw-version.js) ──
const ASSET_REVISIONS = {
  './dist/bundle-a-bible.js': 'e811e8814a927e0447a3aebca8a7c751ad5e3b8923715840e285259586c73e52',
  './dist/bundle-a-matthew.js': '8f8ecc3930db7adc1aa21c413f46cd5cff37cc9d4886873246fd972a1d602599',
  './dist/bundle-a-vot.js': '60eae399915084ad6673d6811724a9664837317912f8df0af8654212a51d94ee',
  './fonts/cinzel-decorative-latin-400-normal.woff2': '6faa34360509b8554ed4448e331401ece5ff179fbfabc76e20697490f775f1f1',
  './fonts/cinzel-decorative-latin-700-normal.woff2': 'ccf78826a008161e97125f965d4e358e53b1921e852f76716e395724363f54fd',
  './fonts/cinzel-latin-400-normal.woff2': 'd06f54fe8b6aa20e6ca62f7d7c143a56677e771a2f643c7a9f501643e26f6c62',
  './fonts/cinzel-latin-700-normal.woff2': '0118ff4ce04337ce18138feaada5a78595dd36bd0aae4463bed9e840e8ebf78f',
  './fonts/eb-garamond-latin-wght-italic.woff2': 'db33b9782c179176a605f32f73f570d2d2d248336b158751563d269da44dcc68',
  './fonts/eb-garamond-latin-wght-normal.woff2': '06a500fa681930a277281821b8b30e3af9ecd882e933ffe7c851cae410f6579d',
  './fonts/reading/alegreya-latin-wght-italic.woff2': 'd59e0fe386637fa9111ab7d7d4879b6592d3b53ad127b2f9ac1c38ceeae99bb8',
  './fonts/reading/alegreya-latin-wght-normal.woff2': 'b72ff9c3962ff2712ded8ec852fa5575a83dfe02179e91e0f2411e4c8188b49e',
  './fonts/reading/atkinson-hyperlegible-latin-400-italic.woff2': '9d46524b8ad2cb5e5714cd9d24e7bf52da24f1729bb01491b3e475a003d4dd9b',
  './fonts/reading/atkinson-hyperlegible-latin-400-normal.woff2': '645d82bf357be70b39921da967c074d4f1221cb6bf5c695ac429a6afad33bf3c',
  './fonts/reading/atkinson-hyperlegible-latin-700-italic.woff2': '7993f885e5819902c2c771b5c69a11b5d6122f0ff302cfaade13aab0a7aaae69',
  './fonts/reading/atkinson-hyperlegible-latin-700-normal.woff2': '1043ede4be7500f61cec1b0862d1a5058cfe6bb37c4e6c1416c3275f0fdf1573',
  './fonts/reading/bitter-latin-wght-italic.woff2': 'fc4f4b86e5e535f9de1e9001b432a30a4ad2505c0d148c0fbc6acebd23bf1819',
  './fonts/reading/bitter-latin-wght-normal.woff2': '0fab60d8d9645bb1245523ef9e864fed9a5fa43900109f4ec768ad65a307d086',
  './fonts/reading/cardo-latin-400-italic.woff2': '8efcf101e8fa376d47caf01891d0934b7661d21c42db191349448ec974c5e8df',
  './fonts/reading/cardo-latin-400-normal.woff2': '04950239ced77fbea758148b42cda09525fb660438f280a579078252989666ed',
  './fonts/reading/cardo-latin-700-normal.woff2': 'd80599658e1cb34bb3945a5ba8e928a6ec446895d8c41f4672d99566e6de021e',
  './fonts/reading/cormorant-garamond-latin-400-italic.woff2': '9908516c1af1c7bc9228f40f99176246075a33f86439d8ff7957bef8bf2d4f7b',
  './fonts/reading/cormorant-garamond-latin-400-normal.woff2': 'ce2e075eb435f7fa9ce71b495547cc3323e956a9ab5201245ae826932529ccba',
  './fonts/reading/cormorant-garamond-latin-700-normal.woff2': '0e51a3c5daab6ca4ce175c20770da433d4f8466e41671349d1ad0899727e81f7',
  './fonts/reading/crimson-pro-latin-wght-italic.woff2': 'd6a081fc792c0a872cdb5f19e8a8e087adc3fdf3f805e02e53b98bbec1a896aa',
  './fonts/reading/crimson-pro-latin-wght-normal.woff2': 'bcf19c6a089c084c297aaefc94516f664dd72483583ab75c96c89cdad8c48ef0',
  './fonts/reading/gelasio-latin-400-italic.woff2': '7f76df2558019b63ddcca34af1e1a080298e6813e4ceb8ac1845b4a4d0e4f151',
  './fonts/reading/gelasio-latin-400-normal.woff2': 'ded17a925295abb128fdb1c5931a5684d7c38fcc019041a85a38b0e803e68571',
  './fonts/reading/gelasio-latin-700-italic.woff2': '7727d750264579ff822169b600520275f4aaf53b555e1cf0cdb15d1b09abb6bd',
  './fonts/reading/gelasio-latin-700-normal.woff2': 'dc84fb2335b1e76995db761c9f3229936efbe185a09a5507bf51cffd62ae4d8d',
  './fonts/reading/gentium-book-plus-latin-400-italic.woff2': '427b5ed58ee687ddf065c6120a796ea15047c82715a1e806262b001b1ac511dd',
  './fonts/reading/gentium-book-plus-latin-400-normal.woff2': 'fc467f342768153e33a1c93a65c9e81001e0ce8ed59563af9bb5d98f8c2f752e',
  './fonts/reading/gentium-book-plus-latin-700-italic.woff2': 'bd97d26488d379db53005de3b8b879cadda5e693b9519a3f29dbf3738c276abf',
  './fonts/reading/gentium-book-plus-latin-700-normal.woff2': 'df44bb3e61a46ae3dd1b8f4f1bd7b7faae6b4f46c83a1b2d9807e49b2d810b9f',
  './fonts/reading/im-fell-english-latin-400-italic.woff2': '67794b617522c749fa4aaeb921425f20a1042127f797cd60a531645e921f379d',
  './fonts/reading/im-fell-english-latin-400-normal.woff2': '7eaa08b6ab21143928e67676cdbec84a5ba1867d9552b442d4e9577d9516ff12',
  './fonts/reading/lexend-latin-wght-normal.woff2': 'fd9e1879939db0539a7a184f8855e46217fba95bd805e12755b710ae10320806',
  './fonts/reading/libre-baskerville-latin-400-italic.woff2': '602b4be4ce6e87a75b58a975616cf10bdbd8f690e9d2f8492d15df792aa88572',
  './fonts/reading/libre-baskerville-latin-400-normal.woff2': 'b9da19c1728dccf755403001a2a9211e5e8007bcd87e312ed8a70c1780d82520',
  './fonts/reading/libre-baskerville-latin-700-normal.woff2': '8aef3341680aa2157320460bd44f74c4ca629af1bf41b53fbbc28bfb6e6be5c2',
  './fonts/reading/literata-latin-wght-italic.woff2': 'fc0b62b72a6da72c95116f8ae569470a33d0e859ff6eb4b4c96c21a61277744a',
  './fonts/reading/literata-latin-wght-normal.woff2': 'a138ca8f81705ada6ec9956e99ff9ebaf3e46677007d3143b9af27b4c01762df',
  './fonts/reading/lora-latin-wght-italic.woff2': '5c90e5e8de6d6d8870c4b2bc3bc5358b3b8c9fe7480a9d13de7bb0dba123aa9c',
  './fonts/reading/lora-latin-wght-normal.woff2': 'b4f4c81206ad576fec510d17aef49a4350487620a6367f30dd15921d8df89a58',
  './fonts/reading/merriweather-latin-400-italic.woff2': 'e36d4ea5fdc37567392e825ecd470324619e0b1ef3af733f1e29b6c7fd79dd7a',
  './fonts/reading/merriweather-latin-400-normal.woff2': 'd37803ac79e20a50ec999b087dd56019dd4de3e71bd19379d0b97c0428f3d80e',
  './fonts/reading/merriweather-latin-700-normal.woff2': '771dfae77e4c6476a4e1940ebe494e45720aa105a968a4e8145f385f956b997e',
  './fonts/reading/neuton-latin-400-italic.woff2': '087e53c8eb688af3c1008515d35e762a80f108761523ebdd35666149ddda62b5',
  './fonts/reading/neuton-latin-400-normal.woff2': '4ba2c19d59b04f66c65d03dc4b02d58fe385a41bab4b0d1e43ae368ef130cdfa',
  './fonts/reading/neuton-latin-700-normal.woff2': '5bd03ac6b77f680604f036e4d8e5f25c8316f75202e43a944663d35a3b8e78b7',
  './fonts/reading/noto-serif-latin-wght-italic.woff2': 'c1d24dc1e18878a44640e8b21b9e8eab5f281554aabc8e97ec84bfea87379219',
  './fonts/reading/noto-serif-latin-wght-normal.woff2': '764b9acf65e84ed77eaa239d4367e174e2f51e4b94ef3fe470a14fb488744d73',
  './fonts/reading/old-standard-tt-latin-400-italic.woff2': '82500030e59bf287b9e231461ffd700b6cdf2d10fb473a531b8ec7bf216eaad2',
  './fonts/reading/old-standard-tt-latin-400-normal.woff2': '45180992dfa5d7a440a3e445b7d708af17e8b7dc98a99359e3a457dc60a462de',
  './fonts/reading/old-standard-tt-latin-700-normal.woff2': '651abbfdbeb8c668be1ed1d5501902c9633c94bda52e68761cc19b25233e6ace',
  './fonts/reading/playfair-display-latin-wght-italic.woff2': 'dcbe4e958b8ed22563fbc3ddff571be68aa7b01c849c8c1654d1dabe1a67ead6',
  './fonts/reading/playfair-display-latin-wght-normal.woff2': '09fa5a6200b1ac78ac3551b4872b81d0618089d67495c4ab2bf4cbab89e7b3b5',
  './fonts/reading/rosarivo-latin-400-italic.woff2': 'd8675a20d3676096ccf0397cd61911c591dbcbb37e0de979f6b2e9f7aad7326b',
  './fonts/reading/rosarivo-latin-400-normal.woff2': 'adc2ade93c8fc4af678d8130399d30a533be7daab6bf474079cb97c5ce2a37ad',
  './fonts/reading/sorts-mill-goudy-latin-400-italic.woff2': '9c5b9529a1fd63b8bfed0b21652efcc83393d6a2c556df4dfb84eb620ded237c',
  './fonts/reading/sorts-mill-goudy-latin-400-normal.woff2': 'fb191d85e7020b238606ed1341549f7977b77202ebc68051871ed38fdf7b71b4',
  './fonts/reading/source-serif-4-latin-wght-italic.woff2': '68e834b9c19811c711a145be68f690a4441dc603811dcc38be284c72ef6080c5',
  './fonts/reading/source-serif-4-latin-wght-normal.woff2': 'a4788060054b8098f2e9ed76c38d8ae19ccbd19c7687c2f5ee3fbeecf4d8777b',
  './fonts/reading/spectral-latin-400-italic.woff2': '74a6785ace78ef7b67c1f127cd5eb0e03f2439b98f819b2fad019e4c00ffdc7e',
  './fonts/reading/spectral-latin-400-normal.woff2': '7c683b1f910d159f9f315f9c909332180ec18f0b2cfa5142423f21dd0a30f1ac',
  './fonts/reading/spectral-latin-600-normal.woff2': 'a07d6ee59b6000b0f26b3fccce9c5865629a38a70956641f39e9e509cf47cd0d',
  './fonts/reading/vollkorn-latin-wght-italic.woff2': '9994058df2f712d8a46363ec5d99d5eaa71736a5773b5d85aa5a248652d3a0cd',
  './fonts/reading/vollkorn-latin-wght-normal.woff2': '40a805a97fee6022c92d8e8741da3a229c70fcc59babe427603604e640e4bc4f',
  './icons/icon-16.png': '8c9f83d5da3cee54f284a9f795b89c038b57b17ec80e2f03e14154ae8064fb41',
  './icons/icon-180.png': 'e070c45a8419afda414dceb5dc040438701c74b7e4fdc6c499b015257ad25a7d',
  './icons/icon-192-maskable.png': '17a386a6187cc94d053c8e8ea6dfb2169c7cec7688cae856c82a09cbdf0229af',
  './icons/icon-192.png': 'd35b9959211446da8f0630c2f5f2950b25c2aa85c882395e3262a410ec3fca98',
  './icons/icon-32.png': '815a14ffef714e966f88ffbcc13d43a724f96680f6e2f47aa50761108dac355c',
  './icons/icon-512-maskable.png': '63553a846fc3d0650c53fd87ef9735139a40e270c9c3d4b1a9b2de24348c5b54',
  './icons/icon-512.png': 'e0fe65283e78ae7b5e6d36471b8e39a01107736c868266649c06d7c70402c54f',
  './src/data/answers.js': 'acaed0d13363e9b3b37e7c67c26337ce95e7501467fe3224503e7e4f9bc13ea4',
  './src/data/audio-sync-sections.js': 'a48bd0c2f2352ca5ef21b903fe0f5dc9a6048f0b0492b6cf15d845edd54547ac',
  './src/data/audio-sync.js': 'dfd9681c9548756e71b6516d73fe54f0c5d58d44d8bff833aad2227cf4b2768b',
  './src/data/bible-asv.js': '552b7ae92a206f103f53f51f33cc8b90365156244aab6b7c47f8da5d16d6a34b',
  './src/data/bible-bsb.js': 'c6298eeaaba6bf491a0cbfe6f22ba3d19357ad29c6c88acd6f5bf4791347a6bd',
  './src/data/bible-hnv.js': '582c866ccba90aa63170c958bda79d554f32dc5749a6949bb289aa51f96eeead',
  './src/data/bible-kjv.js': '7aa0b3b47411894814df1d735f42eae82edc4727ed9fc6c05255fed46537bd5f',
  './src/data/bible-lsv.js': '6678117eba2a0633c3ef7f912a406183fbcbe7a64597517fcac50b1862cb6256',
  './src/data/bible-rkjv.js': '8aff1bbb50beaee6f9e6e215ca1de0dcaef61ce75fb637522c43aa6c3f94ed57',
  './src/data/bible-rnkjv.js': 'fba44c03cc99eb2532009df85f41bddb8a587972090915bd2776c7734fa61c5e',
  './src/data/bible-studies.js': 'c0b4f7e3281aa9a33899d9e9830e1f044a8bd0a5e7d87d5e73601e0081282cc1',
  './src/data/bible-sync-brm-kjv.js': '3ee23f654c1053e575e2755fc3c7c2b76e5281df643a3dd714d1739f9927a6be',
  './src/data/bible-sync-tsot-matthew.js': 'cb5f612b25cdca8c1d2cc4bc713377fe754fca989d00ed8e53220b3ac5309444',
  './src/data/bible-sync-web-ebible.js': 'c6907e70347e3ac8d8480a89c6f30338d7bf985a6a0824d090493f06b9d5cd5d',
  './src/data/bible-sync-wop-nkjv.js': 'f5469b35c22ecf16b3b675e8d3436324aaa02995a1ee71e8e49a7ebe5d0fb007',
  './src/data/bible-web.js': '22b119d895aa329b2f62e6ba7b1b5978f1fbcf13fc474d1de5d9b72c9a3558c2',
  './src/data/bible-ylt.js': 'b6069acf40f8a8cc847390d7e8ee1af7c5b5d83d7e77c40c4bf612715c1acdf8',
  './src/data/scripture-web-data.js': '7200af796f9ea64f7832f470dec48b9ab51e55fb1ee81e9b58b162f3b0bef86c',
  './study-chart-chronology.jpg': 'd8991646f54d4b9861ce85bb7ff59517623307b9c7c851a592bd48b7b5b854a8',
  './study-cover-lamb.jpg': 'dcb877b4ac506318d971b1d3f772862ad84cb5efb701dbf6387b42d3c1f31b58',
  './study-cover-mtam.jpg': 'b0775896d907f7f8302b02d6f2ecdb6db9bfa0ed09715bda954f96b71c0d65ce',
  './study-lamb-burial.jpg': '528f25d503522430628846b74987b3b559371e09e6c43e9b9233d009332a9114',
  './study-lamb-crucifixion.jpg': '37996acaa07035a4dfd494ac81b409008992d4bf038d3d7f1356af667f51f97b',
  './study-lamb-emmaus.jpg': 'f04e8f601b81b058a0a8d42797cbb86d331e585c9abb064df6329d555f5ad009',
  './study-lamb-gethsemane.jpg': '5ea99c3ff507c3833e9633dee2df2d26ae1307820d79e890c3be0eee1ac26294',
  './study-lamb-resurrection.jpg': '47637098274acf305c4bd990c953df72489f323e27b3140a673e539e27c25618',
  './study-lamb-supper.jpg': 'af6822f8b843e573f822626a998addd734eee2851b6407cd2ab9bb252468e87c',
  './study-lamb-thorns.jpg': 'a8f2336fb30ba2a3b01df50ee2c82ebc518e6572b827ba3b2d2507e57a7447bf',
  './study-title-part-one-title.jpg': 'd4be10f90adb126192164b006c69a14046f8a7b79183ffa8c118fc892f5915e5',
  './study-title-part-three-title.jpg': '98fb470fff471b7aa53a1a1a7f84286f2ee7e3b558e7951fc829c88a1e98fd26',
  './study-title-part-two-title.jpg': '1e17c45b43b46fce7828f5474da16ee8af84ffc820bb443393b819efdb2640d7',
};
// ── END GENERATED: ASSET_REVISIONS ──

/**
 * Put an older bucket's copy of `url` into `cache` when its bytes are this build's (its revision). Newest
 * older bucket first. False when there is no expectation, no older copy, or no copy that matches.
 * @param {Cache} cache  the new bucket
 * @param {string} url
 * @param {string} prefix  'vot-core-' or 'vot-corpus-'
 * @param {string} current  the new bucket's name (never copied from)
 * @returns {Promise<boolean>}
 */
async function copyForward(cache, url, prefix, current) {
  const want = ASSET_INTEGRITY[url] || ASSET_REVISIONS[url];
  if (!want) return false;
  try {
    const keys = (await caches.keys()).filter((k) => k.startsWith(prefix) && k !== current).reverse();
    for (const key of keys) {
      const old = await (await caches.open(key)).match(url);
      if (!old) continue;
      // Read once and store what was read (a clone read in full would make the browser buffer the original too:
      // two copies of a 5 MB Bible per worker, four workers).
      const buf = await old.arrayBuffer();
      if ((await sha256Stripped(buf)) !== want) continue;
      await cache.put(url, new Response(buf, { status: old.status, statusText: old.statusText, headers: old.headers }));
      return true;
    }
  } catch (_e) { /* a copy that cannot be read is fetched instead */ }
  return false;
}

/** addVerified, from the previous bucket when the bytes are unchanged. */
async function addCore(cache, url) {
  if (await copyForward(cache, url, 'vot-core-', CORE_CACHE)) return;
  await addVerified(cache, url);
}

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
      // An older worker (one that predates the 2026-09-25 pruning guard) may delete this worker's buckets while it
      // installs. The boot shell must be in its bucket when install resolves: install once more (unchanged files
      // come from the previous bucket, so it is cheap), and refuse the install if it is still not there, so the
      // previous worker keeps serving and the browser tries again later.
      if (!(await shellCached())) {
        await installCore();
        if (!(await shellCached())) throw new Error('[sw] the boot shell vanished from its cache during install');
      }
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

/** Every CRITICAL asset is in this build's core bucket right now. */
async function shellCached() {
  if (!(await caches.keys()).includes(CORE_CACHE)) return false;
  const core = await caches.open(CORE_CACHE);
  for (const url of CRITICAL_ASSETS) if (!(await core.match(url))) return false;
  return true;
}

/** The install body, split out so the try/catch above stays a thin wrapper. */
async function installCore() {
  const core = await caches.open(CORE_CACHE);
  // Critical shell — all-or-nothing; a miss here SHOULD fail install.
  await Promise.all(
    CORE_ASSETS.filter((a) => CRITICAL_ASSETS.has(a)).map((u) => addCore(core, u))
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
  const results = await Promise.allSettled(bestEffort.map((u) => addCore(core, u)));
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
        if (!(await corpus.match(url)) && !(await copyForward(corpus, url, 'vot-corpus-', CORPUS_CACHE))) {
          await corpus.add(freshReq(url));
        }
      } catch (_e) {
        corpusFailed.push(url); // best-effort — corpusFirst still caches on first use
      }
    }
  }));
  // The files cached on use (alternate translations, timings) that a reader already had: carried over when
  // unchanged, so a corpus bump does not make them download again the next time they open. Never fetched here.
  const precached = new Set(precacheQueue);
  for (const url of Object.keys(ASSET_REVISIONS)) {
    if (!/^\.\/src\/data\//.test(url) || precached.has(url)) continue;   // a regex, not a quoted path: list-runtime-src-assets reads quoted ones as precache entries
    try {
      if (!(await corpus.match(url))) await copyForward(corpus, url, 'vot-corpus-', CORPUS_CACHE);
    } catch (_e) { /* fetched on use, as before */ }
  }
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
  const status = await repairMissing();
  if (status.complete) await pruneStale([]);   // the new library is whole: the old one can go
  return status;
}

/** The status check; a library that has become whole (cache-on-use filled the gaps) lets the old one go. */
async function checkOffline() {
  const status = await offlineStatus();
  if (status.complete) await pruneStale([]);
  return status;
}

async function repairMissing() {
  const missing = await offlineMissing();
  let idx = 0;
  await Promise.allSettled(Array.from({ length: 4 }, async () => {
    while (idx < missing.length) {
      const item = missing[idx++];
      try {
        const cache = await caches.open(item.bucket);
        const prefix = item.bucket === CORE_CACHE ? 'vot-core-' : 'vot-corpus-';
        if (await copyForward(cache, item.url, prefix, item.bucket)) continue;
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
    await pruneStale(await offlineMissing());
  })());
});

/* ── THE OLD LIBRARY STAYS UNTIL THE NEW ONE IS WHOLE (REPORT #10, v06-03, 2026-09-25) ──
   Install is best-effort for everything but the CRITICAL shell: a phone that loses signal
   halfway through a new corpus (5 MB of Bible in one file) still installs, and activate used to
   delete the previous vot-corpus-* / vot-core-* at once. An offline reader was then left with
   neither copy: the Bible, Studies and Answers answered 503. Now a stale bucket is deleted only
   once its kind's new bucket holds every file the offline library needs (offlineMissing, read
   from the caches); until then the stale buckets holding what the new one misses stay
   (staleToDrop), and the fetch paths fall back to them only when a fetch fails: the current
   bucket or the network answers first. The fallback serves corpus files, pictures, fonts and
   offline.html, never an older build's code or shell (oldCopyServes). An old corpus next to
   new code is the trade: marks made offline on an older corpus whose paragraphs later moved
   could sit one paragraph off, against the Bible not opening at all. The repair and the
   status check (sent 9 s after every load, offline-library.js) prune once the new bucket is
   whole. */

/**
 * Delete the stale versioned buckets the new ones no longer need.
 * @param {{ bucket: string }[]} missing  offlineMissing() for the current buckets
 */
async function pruneStale(missing) {
  // A worker only ever prunes buckets OLDER than its own. The page sends CHECK_OFFLINE to the ACTIVE worker 9 s
  // after every load; during an update that is the old worker, whose "stale" buckets would include the ones the
  // new worker is installing into right then (the refutation of 2026-09-25, round 3). So: nothing is pruned while
  // a newer worker is installing or waiting, and a bucket created after this worker's own is never touched.
  const reg = self.registration;
  if (reg && (reg.installing || reg.waiting)) return;
  const keys = await caches.keys();
  const drop = []
    // An old core bucket is worth keeping only for what it may serve offline (oldCopyServes), never for code.
    .concat(await staleToDrop(keys, 'vot-core-', CORE_CACHE, missing.filter((m) => oldCopyServes(m.url))))
    .concat(await staleToDrop(keys, 'vot-corpus-', CORPUS_CACHE, missing));
  // One-day design (2026-07-31): the download-on-demand font bucket.
  // Fonts are all vendored + corpus-cached now; reclaim the space.
  if (keys.includes('vot-fonts-v1')) drop.push('vot-fonts-v1');
  await Promise.all(drop.map((key) => caches.delete(key)));
}

/**
 * The stale buckets of one kind that hold nothing the current one misses. Newest first (caches.keys()
 * lists buckets in creation order), a stale bucket is kept while it holds a missing file no bucket kept so
 * far holds: two short installs in a row (the 5 MB Bible failing twice on a weak signal) keep the bucket
 * that still has the Bible, not merely the newest one.
 */
async function staleToDrop(keys, prefix, current, missing) {
  // caches.keys() is in creation order: only the buckets created before this worker's own are its to judge.
  const own = keys.indexOf(current);
  if (own < 0) return [];
  const stale = keys.slice(0, own).filter((k) => k.startsWith(prefix));
  let need = missing.filter((m) => m.bucket === current).map((m) => m.url);
  const drop = [];
  for (const key of stale.slice().reverse()) {
    if (!need.length) { drop.push(key); continue; }
    const cache = await caches.open(key);
    const held = [];
    for (const url of need) if (await cache.match(url)) held.push(url);
    if (held.length) need = need.filter((u) => !held.includes(u));
    else drop.push(key);
  }
  return drop;
}

/** The current build's copy: this core bucket, then this corpus bucket. Never an older bucket. */
async function matchCurrent(request, opts) {
  return (await (await caches.open(CORE_CACHE)).match(request, opts))
    || (await (await caches.open(CORPUS_CACHE)).match(request, opts));
}

/** Files an older build's copy can stand in for offline: pictures, fonts, the offline page. Never code:
    an old bundle next to the new ones is a crash at best and old code writing new stores at worst (the
    hazard index.html's own reload guards). */
function oldCopyServes(url) {
  return /\.(jpe?g|png|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url) || /\/offline\.html$/.test(url);
}

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
    const work = (event.data.type === 'REPAIR_OFFLINE' ? repairOffline() : checkOffline())
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
  // The catalog itself is network-first (n3-06, networkFirstCatalog).
  if (/^\/songs-\d+\//.test(url.pathname)) return;
  if (url.pathname === '/songs/catalog.json') {
    event.respondWith(networkFirstCatalog(event));
    return;
  }
  if (url.pathname.startsWith('/songs/thumbs/') || url.pathname.startsWith('/songs/lyrics/')) {
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
  const cached = await matchCurrent(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    return response;
  } catch (_e) {
    // Offline: an older build's copy of a picture or font, kept while this build's library is
    // incomplete (pruneStale). Never an older build's code (oldCopyServes).
    if (request.mode !== 'navigate' && oldCopyServes(new URL(request.url, self.location.origin).pathname)) {
      const kept = await caches.match(request);
      if (kept) return kept;
    }
    if (request.mode === 'navigate') {
      // SW-2: a deep link carrying a query string (…/index.html?x=1, …/?utm=…) misses
      // the exact-match cache; fall back to the precached shell (ignoreSearch) so the
      // app still boots offline, before serving the offline page. THIS build's shell:
      // a kept older core bucket holds an older index.html, and it was created first.
      const shell = await matchCurrent('./index.html', { ignoreSearch: true });
      if (shell) return shell;
      const offline = (await matchCurrent('./offline.html')) || (await caches.match('./offline.html'));
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

/* n3-06: the catalog is the one songs file that changes in place (a takedown
   hides a song, a publish adds some), so the network's answer wins: stale-while-
   revalidate answered with the previous launch's copy and a takedown reached a
   web reader a launch late. The copy answers only when the network fails,
   answers badly (not ok, or redirected: a captive portal), or takes longer than
   SONGS_CATALOG_WAIT_MS; a slow answer still lands for the next ask. Covers
   and lyrics are named by song id and never change: they stay SWR. */
const SONGS_CATALOG_WAIT_MS = 4000;

/* The copy, marked X-VOT-Fallback: 1 so the page (song-catalog.js) knows it got
   no fresh answer and asks again when the link returns. */
function markedCopy(cached) {
  try {
    const headers = new Headers(cached.headers);
    headers.set('X-VOT-Fallback', '1');
    return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
  } catch (_e) {
    return cached;
  }
}

async function networkFirstCatalog(event) {
  const request = event.request;
  const cache = await caches.open(SONGS_CACHE);
  const network = fetch(request).then(async (response) => {
    if (response && response.ok && !response.redirected) {
      try { await cache.put(request, response.clone()); } catch (_e) { /* quota: still serve */ }
    }
    return response;
  }).catch(() => null);
  // The request outlives a copy answered after the wait: keep the worker alive until it lands.
  if (typeof event.waitUntil === 'function') event.waitUntil(network);
  let timer = null;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve('late'), SONGS_CATALOG_WAIT_MS); });
  const first = await Promise.race([network, late]);
  clearTimeout(timer);
  if (first !== 'late' && first && first.ok && !first.redirected) return first;
  const cached = await cache.match(request);
  if (cached) return markedCopy(cached);
  const response = first === 'late' ? await network : first;
  return response || new Response('Songs not available offline', { status: 503, statusText: 'Service Unavailable' });
}

async function corpusFirst(request) {
  const cached = await matchCurrent(request);
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
    // Offline: the previous corpus, kept while this one is incomplete (pruneStale), still reads.
    const kept = await caches.match(request);
    if (kept) return kept;
    return new Response('Corpus not available offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}
