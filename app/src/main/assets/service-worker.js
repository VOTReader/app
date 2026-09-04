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

const CACHE_VERSION = 'v1.0.2-9cc4b1277b';
const CORPUS_VERSION = 'c44'; // c43->c44 (2026-09-04): every reader rendition reaches the app. gen-audio-manifest.mjs used to drop a reader's rendition of a letter whenever it carried fewer tracks than the primary, and to skip a file in the "0. ALL LETTERS" folder outright once the collection folder had supplied a primary -- so a reading the flock actually made could be invisible in the app with nothing failing and no number to diff. A rendition is now suppressed for exactly ONE reason, its asset-ID set being exactly the primary's; a shorter rendition ships with a completeness note ("2 of 5 sections") as an additive third element that existing consumers ignore; and a fill-folder file is a rendition candidate even when it cannot win a primary slot. The composition rules moved to tools/audio-renditions-lib.mjs so the generator, the new gate and the tests share one definition, and tools/check-audio-manifest.js (pre-commit + CI, offline) now FAILS when a reader who recorded a letter is not offered on it -- checked against tools/audio-manifest-coverage.json, which the generator writes from its MAPPING stage so a loss in the COMPOSITION stage is visible. Measured effect on the 2026-09-01 Drive listing: 729 letters, 731 primary tracks (B 36, T 66, V 629) and 48 alternate renditions (B 1, V 35, M 15), up from 47 -- one letter's Benjamin reading became its primary and its text-to-speech reading became a choice. Small, because that listing has no mixed-reader primary for the old discard to have hidden; the rules are correct now and the gate holds them. audio-manifest.js rides bundle-a-vot, which is corpus-cached, so cached clients would keep the old manifest without this bump. NOTE FOR RELEASE OPS: this branch is numbered assuming review-corpus-c43 lands first. If c43 is dropped, renumber this to c43. ( c41->c42 (2026-09-02): the WHOLE BIBLE joins Bible read-along. src/data/bible-sync-brm-kjv.js goes from 26 chapters / 995 verses to all 1,189 chapters / 31,061 of 31,102 verses timed (99.87%), 6,358 B -> ~176 KB. Aligned in one 10 h 27 m GPU campaign (whisper large-v3 x MMS forced alignment, probe-adjudicated) over 76.1 h of BR Ministries KJV audio; mean proven share 0.9954, zero chapters below the 60% ship gate, zero dropped for any reason. That file matches the corpus-version glob, so the regeneration forces this bump; it is fetched lazily and only while a BRM-KJV recording is actually playing with read-along on, so nothing else pays for it. Shipped WITH a re-cut of the source audio: 42 chapter boundaries that resolve-manuals.py had placed by text-alignment were wrong by 5-240 s, so 82 chapter mp3s were re-cut and re-uploaded to audio-brm-v1/v2. The shipper now refuses any belt whose recorded audioSize differs from the mp3 on disk, which is the guarantee that shipped timings match shipped audio -- the 82 re-cut chapters could not have shipped against stale audio even by accident. Two instruments found what the original +-60 s transcript audit structurally could not: tools/audit-bible-belts.py (leading/trailing UNSPOKEN runs read off the belts themselves) and a seconds-per-verse outlier scan. Final belt audit over all 1,189: trailing UNSPOKEN 0, leading UNSPOKEN 2 (jeremiah 38, revelation 22 -- both verified against the raw audio as correct cuts where the chapter announcement abuts verse 1 with no silence, an attribution artifact, not a cut error). New gate tools/validate-bible-sync.py checks the data file the way a gate would: one slot per verse of a FRESH corpus extract, non-negative monotonic ints, last onset inside the local audio, belt current on settings + verses + audioSize, and arrays byte-equal to what ship() rebuilds -- plus nothing silently dropped. check-audio-sync covers the letters and validate-schemas never looked at this file; that gap is why c40 shipped ungated. ( c40->c41 (2026-09-01): the letter read-along timings LEAVE bundle-a-vot. src/data/audio-sync.js (497,951 B raw, 401,579 B minified inside the bundle) is now its own lazy file, fetched by src/utils/sync-loaders.js the first time a letter recording plays with the wash on -- every reader who opened ANY letter was parsing ~400 KB of timings whether or not they ever pressed Play, and the bundle sat 140 KB from its ceiling with flock/rebuke/holydays still to align. Membership changed, so bundle-a-vot's bytes changed (2,657,855 -> 2,256,281) and the file itself joins the corpus fingerprint through check-corpus-version's union with the runtime-loader scan; a BUMP, not a rebaseline, because clients hold a heavier bundle than the one replacing it. The Bible timings loader moved out of index.html into the same module so both path literals live where the deploy and APK derivation gates can see them. ( c39->c40 (2026-08-28): the whole gospel of JOHN joins Bible read-along -- 21/21 chapters, 879 verses, 2 unproven; weakest chapter 0.974 proven, zero verses on REVIEW. src/data/bible-sync-brm-kjv.js now carries 26 chapters / 995-of-999 verses timed. That file matches the corpus-version glob, so every regeneration forces this bump; it is fetched lazily and only while a BRM-KJV recording is actually playing with read-along on, so nothing else pays for it. ( c38->c39 (2026-08-27): WTLB One and Two join read-along -- 352 entries, 368 OK / 2 REVIEW / 0 EXCLUDED, zero errors. With The Blessed that is ALL 360 Format B items aligned, 4,656 rows, and not one legacy -1 whole-paragraph sentinel left in the shipped data. AUDIO_SYNC 265 -> 617 keys / 17,634 rows. Half the letter corpus had never had a wash at all, and the half that did could only hold a whole paragraph. ( c37->c38 (2026-08-27): The Blessed joins read-along -- the FIRST Format B timings ever shipped, and the first with real character offsets rather than the whole-paragraph -1 sentinel. 8 entries + 6 alternate renditions, 419 rows, all 14 jobs OK. Offsets are in the CORPUS domain and utils/format-b-dom-text.js projects them onto the render at paint time, so the wash tracks a LINE instead of holding a whole paragraph. ( c36->c37 (2026-08-27): the read-along re-align finished. Volumes three/four/six/seven/timothy regenerated on the corrected character domain -- 172/172 letters, 169 OK / 1 REVIEW / 0 EXCLUDED, AUDIO_SYNC 235 -> 257 keys and 98.2% of touched characters timed. Volume Seven is complete at 67/67 and Letters from Timothy went from ONE aligned letter to all 15. tools/audio-sync-stale.allow is deleted: the gate is unconditional again. Three letters that errored in the first pass are recovered -- two to a locale-decode trap (ffmpeg stderr read with text=True dies on a byte cp1252 cannot map, inside subprocess's reader thread, leaving stderr None while returncode stays 0) and one to an upstream faster-whisper find_alignment IndexError that leg B now survives with a truncated transcript. ( c35->c36 (2026-08-26): read-along correctness pass. Volume Five REGENERATED on the corrected character domain (29/29 letters ship, up from 26 - the three previously EXCLUDED now clear the gate), and the sentence scanner no longer breaks a sentence at a terminator that is not followed by whitespace: 'the U.S.A. still' used to split into 'Is the' | 'A.' with 'U.S.' painted by nobody, and 'who cry, "Immanu El!", then' left 'El!' unhighlighted entirely. Unproven-but-spoken clauses now SHIP with an onset spread across the gap by token weight instead of being dropped (owner directive - a clause that never paints reads as the feature being broken); UNSPOKEN text is still never painted. NEW src/data/bible-sync-brm-kjv.js - Bible verse-level read-along, pilot tranche (6 chapters, 169/171 verses timed); it matches the corpus-version glob, so every regeneration forces a bump from here on. ( c34->c35 (2026-08-12): Volume One read-along REGENERATED on corrected character offsets. tools/extract-audio-fragments.mjs measured a block by joining segments with '', but Segments.jsx injects a collision-guard space between them, so every segment boundary pushed the DOM one char past the timings — 623 of 1,041 Format A blocks off by up to 13 chars, the highlight visibly lagging into the previous clause and resnapping each block (owner report). Extractor and renderer now share utils/segment-dom-text.js. ( c33->c34 (2026-08-12): Volume One read-along regenerated by tools/batch-align.py — clause-level onsets from the dual-leg belt (MMS forced alignment x whisper large-v3, probe-adjudicated), replacing the 25 old align-audio.py rows with 30 letters, plus the new AUDIO_SYNC_ALT map (20 alternate-rendition timelines keyed by release asset id, so a second reader no longer paints the primary recording's clock). audio-sync.js rides bundle-a-vot, which IS corpus-gated. ( c32->c33 (2026-08-11): the Scripture Web graph asset now ships only the Essential (votes >=20) and Famous (votes >=7, 63,418 links) tiers - the obsolete 300k Complete surface is gone, so scripture-web-data.js is a SMALLER, differently-tiered asset. It is raw-injected and pinned in the STABLE corpus cache, so cached clients would keep the old 301,539-link graph forever without this bump. (Note text reconstructed 2026-08-11 from the s13 entry in CLAUDE.md after the original line was lost resolving a pull; the VERSION and its reason are accurate, the wording is not the author's own.) ( c31->c32 (2026-08-11): Scripture Web graph asset regenerated — the Matthew votNote whose `vol` is null (5:1-11, pointing at The Blessed as an album) now resolves, mirroring the app's own registry special cases; +1 VOT edge (2,097 -> 2,098). ( c30->c31 (2026-08-10): the Scripture Web graph asset — scripture-web-data.js joins the stable corpus cache (301,539 OpenBible/TSK verse-pair cross-references, CC-BY, delta-encoded; generated by tools/gen-scripture-web.mjs). ( c29->c30 (2026-08-10): flock audio sync — new recordings joined audio-manifest. ( c28->c29 (2026-08-10): WEB (World English Bible, ebible.org) joins as the third per-chapter edition (audio-web-v1/v2). ( c27->c28 (2026-08-10): BRM edition switches to per-chapter tracks (manifest expansion loop; audio-brm-v1/v2). (c26->c27 (2026-08-09): the seven Lamb of God narrative illustrations join bible-studies.js as study-image blocks (owner call — restored from THELAMBOFGODstudy.pdf; Last Supper/Gethsemane/Thorns/Crucifixion/Burial/Resurrection/Emmaus in ch3/4/6/7/8/11/12). ( c25->c26 (2026-08-09): Word of Promise per-chapter edition rows join the bible-audio manifest (expansion loop). ( c24->c25 (2026-08-09): BIBLE_AUDIO_CHAPTERS 1,189-row chapter-seek index joins bundle-a's bible-audio-manifest (whisper-scanned + belt-verified). ( c23→c24 (2026-08-09): AUDIO_ALTERNATES joins audio-manifest.js — 45 letters carry a second reader's complete rendition (48 assets, V×32 M×15 B×1, all on audio-v1); lets the listener choose who reads a letter. (c22→c23 (2026-08-09): whole-book Bible audiobooks — bible-audio-manifest.js (66 BRM-KJV tracks on the audio-bible-v1 release) joins bundle-a; corpus bundles re-minified in the bible-audio worktree. (c21→c22 (2026-08-06 overnight): read-along sync data for the seven main volumes — 230 of 245 letters shipped (188 at ≥90% coverage, 41 partial on the REVIEW list, 16 excluded pending the intro-music anchor fix; tools/_align-work/report.txt). (c20→c21 (2026-08-06): audio-sync.js added to bundle-a-vot — read-along sentence timings (forced-alignment proof batch: 3 letters). (c19→c20 (2026-08-05): audio-manifest.js added to bundle-a-vot — streaming audio-letter manifest (Drive file ids for all 729 letters/prefaces + WTLB part/section compilations; generated by tools/gen-audio-manifest.mjs). (c18→c19 (2026-08-02): bundle-a-bible now also carries books-restored.js + matthew-plain.js (moved off bundle-a's cold-boot path, −353 KB raw; content unchanged, membership changed ⇒ bundle bytes changed). (c17→c18 (2026-07-20): full body-text audit findings — Vol2 "Woe to the Church Called Roman and Catholic" wrong clause corrected ("Thus says The Lord God, The Holy One of Israel…"→"…to the deceptive harlot, to the mother of all fornications:", confirmed vs LIVE site); Flock "Obedience" missing "(Addendum to Abide in the Doctrine of The Messiah)" restored as metaAddendum (header extractor left it out of the earlier header audit). (c16→c17 (2026-07-20): Restored-Name TITLE re-audit — every Jesus/Christ instance in bible-rnkjv.js + bible-rkjv.js re-adjudicated per instance against the Greek + restored-name translations; unified rule (printed "the Christ"→HaMashiach, every other Christ→bare Mashiach; full-Name pairs stay YahuShua HaMashiach) kills the stranded-article defect class ("the very HaMashiach"→"the very Mashiach") and renders the title name-like ("in Mashiach", "gospel of Mashiach"). See RESTORED-NAMES-PLAN.txt. (c15→c16 (2026-07-19): studies sweep — 7 eaten-word/doubled-ref fixes beside {{ref}} chips in bible-studies.js (trinity "comes"/"The", state-of-the-dead "is"/"tells"/"have"/"reads" + de-duped Colossians 1:16-17); line-by-line site diff proved all 648 doctrine-study content lines present. (c14→c15 (2026-07-19): header-line restoration — Deliverance's 3 lost opening paragraphs; 11 missing "Addendum to …" header links (metaAddendum) across V4/V6/Flock; 7 forLine tails ("and For All Those Who Have Ears to Hear" class); Aged Shepherd's "A Parable Given to Timothy" attribution; Obey-The-Commandments occasion noteLine. (c13→c14 (2026-07-19): blank-footnote fix — Vol6 "Freedom Comes By Sacrifice" fn1 + Vol7 "Who Among You…" fn7 converted note→scripture ("1 Kings 22"/"Leviticus 23"); bible-studies more-than-a-man-ch5 typo "Matthew 19:36"→"Matthew 19:16" + its NKJV dict value filled. (c12→c13 (2026-07-12): Restored-Name NT — new sparse overlay translations bible-rnkjv.js + bible-rkjv.js (NKJV-R / KJV-R: YahuShua HaMashiach restored across the New Testament; generated by tools/gen-restored-nt.mjs, ruleset in RESTORED-NAMES-PLAN.txt). (c11→c12: WTLB/Blessed faithfulness audit — all 360 entries verified present + complete; included the one editorial clarification footnote on WTLB One "YAHUWAH Is One". c10→c11: restored 14 blank Timothy headers + Recompense's lost dream. c9→c10: restored the "(Regarding …)" occasion header line to ~40 letters. c8→c9: SW1 corpus-cache. c7→c8: CORP-2. c6→c7: CORP-1. c5→c6: PF1 minify.)

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
  // U18: react.min.js / react-dom.min.js /
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
  './': '356216c6f7b242cb675830faf9bff486d7d615f052474a4810f8fc66bb0926b6',
  './dist/app.min.css': '2fe4056764d85a27f92901febc5e4df20735c4e69a92f54b39814611efe1055d',
  './dist/bundle-a.js': 'cc04f8f0f536a71831ebda404bf17934f84238b223260dba0ba580f6556aa7db',
  './dist/bundle-b.js': '463af6bc486d67030d639674ba1848363a3d2390bfff46b1e91e61080dfe570b',
  './dist/bundle-c.js': 'bff22d74a82a8fddf2da2c7a89dd47df02292646634d184870ba6486fca1547f',
  './dist/bundle-d.js': '906eb47f5dcae05df2f6fc1dd76f3547c6c46a2f42098243ebda53004dc6014a',
  './dist/bundle-e.js': 'fc58f4c9e152c4663ee2602028be101d9754d9aa93eac90cf7167036a7205c8c',
  './dist/bundle-f.js': '793d8c732ff2fe62718d28fe07d976c1f69cad3b7b58c6e033ca032ecd99d63c',
  './html2canvas.min.js': 'e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb',
  './index.html': '356216c6f7b242cb675830faf9bff486d7d615f052474a4810f8fc66bb0926b6',
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(freshReq(url));
    if (!res.ok) throw new Error('[sw] ' + url + ' HTTP ' + res.status);
    // clone() BEFORE reading: a Response body is single-use, and cache.put must
    // receive the original so the stored entry keeps its real headers
    // (Content-Type especially — a bundle served as octet-stream will not run).
    const actual = await sha256Stripped(await res.clone().arrayBuffer());
    if (actual === expected) {
      await cache.put(url, res);
      return;
    }
    console.warn('[sw] integrity mismatch on ' + url
      + ' (expected ' + expected.slice(0, 12) + ', got ' + actual.slice(0, 12) + ')'
      + (attempt === 0 ? ' — refetching once' : ''));
  }
  throw new Error('[sw] integrity check failed for ' + url
    + ' after a refetch — refusing to install this build so the previous one keeps serving.');
}

self.addEventListener('install', (event) => {
  // Take over immediately — don't wait for the old SW's tabs to close.
  // controllerchange fires in sw-register.js, which reloads the page.
  self.skipWaiting();
  event.waitUntil((async () => {
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
    await Promise.allSettled(Array.from({ length: 4 }, async () => {
      while (precacheIdx < precacheQueue.length) {
        const url = precacheQueue[precacheIdx++];
        try {
          if (!(await corpus.match(url))) await corpus.add(freshReq(url));
        } catch (_e) { /* best-effort — corpusFirst still caches on first use */ }
      }
    }));
  })());
});

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
