#!/usr/bin/env node
/* check-bundle-budget — nothing was watching dist/ bytes.
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS GATE EXISTS
 * Every other cost in this app has a gate: app.jsx has a line canary, the
 * corpus has CORPUS_VERSION, the type scale has its ladder check. The
 * SHIPPED BYTES had none — so bundle-d grew ~70% and bundle-e ~110% past
 * the figures written in CLAUDE.md without one commit noticing. bundle-a +
 * b + c + d + app.min.css are the cold-boot blocking path; a budget device
 * parses all of it before first paint, on every launch.
 *
 * The ceilings below sit ~15% above the size measured when this gate landed
 * (2026-08-10). That is deliberately loose: this is a COLLAPSE detector, not
 * a diet. Ordinary feature work must never trip it — a trip means either a
 * large new dependency landed or something is being bundled that shouldn't
 * be, and either way it deserves a look before it ships.
 *
 * RE-BASELINING is a deliberate, reviewed act: edit the number in BUDGETS
 * below, in the same commit as the growth, with a one-line reason. There is
 * no env var and no --update flag on purpose — a gate you can silence from
 * the command line is a gate that gets silenced.
 *
 * Run: node tools/check-bundle-budget.js   (exit 1 over budget)
 */
import { statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets');
const DIST = join(ASSETS, 'dist');

/* file → max bytes. Measured 2026-08-10 with `ls -la dist/`, ceiling ≈ +15%.
   `measured` is kept beside each ceiling so the next reader can see how much
   headroom is actually left without re-running anything. */
const BUDGETS = [
  // ── cold-boot blocking path (parsed before first paint, every launch) ──
  // c43 (2026-09-03): matthew-nkjv.js LEFT this bundle for bundle-a-matthew
  // (-53,976 B raw). Re-baselined DOWN so the collapse detector keeps its teeth.
  // 2026-09-22, landing 27: search-data.js LEFT this bundle for bundle-e
  // (-42,903 B off EVERY cold start). The window.VotSearchData tables are read
  // only by src/search/* and SearchScreen, all of which are reachable only from
  // _entry-e.js, which is lazy. Re-baselined DOWN by the c43 rule so the
  // collapse detector keeps its teeth: 155,404 x 1.15 = 178,714.6 -> the
  // hundred above.
  { file: 'bundle-a.js', measured: 155404, max: 178800 },   // react + react-dom + bible-audio-manifest
  // 2026-09-22, landing 28: the journal's three screens (hub, viewer, editor)
  // and the two sheets only the editor renders LEFT this bundle for the lazy
  // bundle-g, -78,341 B off every launch. What stayed is the machinery the
  // shell and the renderer need at boot: journal-styles.js (JournalChip is
  // painted into reading text and wears jrn- CSS), JournalInboundSheet,
  // JournalChip, JournalHelpers and every journal store. Re-baselined DOWN by
  // the c43 rule: 269,918 x 1.15 = 310,405.7 -> the hundred above.
  // 2026-10-11, dl-1011: main had grown to 304,415 by ordinary work; the
  // data-safety wipe-proofing (a snapshot on every leave, auto-restore after a
  // wiped database, idb-adapter's dataLoss record) added 6,333 B of real code,
  // nothing pulled in. Re-baselined UP by the same rule: 310,748 x 1.15 =
  // 357,360.2 -> the hundred above.
  // 2026-10-23, up1: main had grown to ~356.9 KB by ordinary work since 10-11 (12 days of lane landings); the
  // update wait (sw-register: take over only at open or after 10+ min away, never while playing) added ~1 KB of
  // real code, nothing pulled in, and tipped it 481 B over. Re-baselined UP by the same rule: 357,881 x 1.15 =
  // 411,563.2 -> the hundred above.
  { file: 'bundle-b.js', measured: 357881, max: 411600 },   // stores/hooks/journal machinery/bridge
  // 2026-10-23, pl-l0 batch C (RC.13): one box per highlight and the note icon kept with its word, on both
  // paint paths (React verses + the letters' DOM pass), added 1,865 B of real code; the delete-confirm
  // helper it shares (mark-overlap.js uncoveredLine) is tree-shaken out. Re-baselined UP by the same
  // rule: 23,103 x 1.15 = 26,568.5 -> the hundred above.
  { file: 'bundle-c.js', measured: 23103, max: 26600 },    // renderer
  // 2026-09-22, landing 21: the four Personal Study screens (My Progress,
  // Notes, Links, Highlights) LEFT this bundle for bundle-g, -46,043 B off the
  // cold-boot parse path. Re-baselined DOWN (510,376 x 1.15 = 586,932 -> the
  // hundred above) so the collapse detector keeps its teeth, exactly as c43 did
  // when matthew-nkjv.js left bundle-a.
  // Landing 22 (same night) freed the fifth: BookmarksScreen could not travel in
  // 21 because its file also held BookmarkPopover, which the app shell mounts on
  // every screen; the popover and the two hlKey derivations moved to their own
  // bundle-d modules and the screen followed the other four. -7,698 B more, and
  // the ceiling comes down again (502,678 x 1.15 = 578,079 -> the hundred above).
  // Landing 23: Milestones and History follow them (-10,660 B). About was tried
  // and sent back - use-tabs.js opens a FRESH INSTALL on it, so it is boot-path
  // weight. Landing 24: the Listening Library's four screens (-22,732 B) - the
  // PLAYER stayed, which is why bundle-h is only 24 KB. Ceiling down by the same
  // rule (469,286 x 1.15 = 539,679 -> the hundred above).
  // 2026-09-24, Songs of the Letters landing A: the songs engine joins the player
  // it rides (utils/song-catalog.js 3.7 KB + the player's songs arm ~3.5 KB +
  // audio-track's exact song pattern), deliberately in bundle-d because the bar
  // and the desk read it on every screen (README section 6.3). The rest of the
  // 469,286 -> 536,115 drift since landing 24 was the month's shell work. Re-
  // baselined UP by the same rule: 543,676 x 1.15 = 625,227.4 -> the hundred above.
  // 2026-09-25, Songs of the Letters K1 + K2 (ai-music): keeping songs on the phone (utils/song-keep.js, the
  // KEEP controls, the player's kept-song arm) and the tap-to-play song row, in bundle-d because the bar, the desk and
  // the letter page's songs card use them on every screen; with the day's shell work that left 751 B under the old
  // ceiling. Re-baselined UP by the same rule: 624,549 x 1.15 = 718,231.4 -> the hundred above.
  // 2026-09-28, Lighthouse item 5 (docs/perf/lighthouse-2026-09.md): StudiesHome, BibleStudyIndex,
  // BibleStudyChapterView and MatthewChapterView leave for bundle-g. Today's tree measured 675,690 before
  // the move and 663,792 after. The ceiling is NOT loosened to 663,792 x 1.15: the room stays unclaimed.
  // 2026-10-13, lz1 (D:/AgentBackbone/reports/lazy-loading-2026-10-13/REPORT.md): bundles e-h (Settings/Search/
  // Garden + the search tables, the Scripture Web, the Personal Study + journal + Studies screens, the
  // Listening Library) fold back into this bundle: 663,792 -> 1,313,034. The ceiling is the SUM of the five
  // old ceilings (718,300 + 357,600 + 101,200 + 193,600 + 88,100), so the merge claims no new room.
  // 2026-10-18, the Scripture Web w3 integration (branch sweb): six feature streams on one spine - the GL top pass,
  // prophecy class and frame set; the canvas label engine, wayfinding and cited strip; My Web's S-curve fans and
  // rails; the go-to, flyTo's ease, the journey and the doors; the docked panel and its modes. Measured per stream
  // on its own branch against the spine's 1,367,470: GL +25.9 KB, canvas +31.1 KB, My Web +13.0 KB, navigation
  // +28.0 KB (the panel's +35 KB lands next, inside this room). All of it is the feature's own code; nothing
  // pulled in a library. Re-baselined UP by the same rule: 1,460,091 x 1.15 = 1,679,104.7 -> the hundred above.
  // 2026-10-22, AOGCG Extras: build:d compiles every JSX element to one injected short factory
  // (src/ui/jsx-inject.js) instead of "React.createElement": 1,678,740 -> 1,599,529 (-79,211 B), no
  // behaviour change (smoke:ci PASS). The ceiling is not loosened and not lowered: the Answers stages spend
  // part of the room, and what is left stays unclaimed.
  { file: 'bundle-d.js', measured: 1460091, max: 1679200 },   // every screen/sheet/util (bundles e-h folded in by lz1)
  // 2026-10-14, sr9: the search worker (src/search/worker.js): the warm-index read and the meaning model, off the
  // page's thread. 7,967 B measured x 1.15. onnxruntime-web is not in it: the worker imports the vendored copy.
  { file: 'bundle-w.js', measured: 7967, max: 9200 },
  // Re-baselined 2026-09-22 (292,190 B): the Answers landing's rules (~8 KB) and the
  // month's large-text / tap-target fixes, on top of 253,510 B measured 09-01.
  // 2026-09-25 (n7-08): the tree had grown to 335,980 B, 20 under this ceiling. Measured first: 91.5 KB
  // of it styled only lazy screens. tools/split-lazy-css.mjs now moves the rules only bundle-e/-f/-g/-h
  // can use, whose move provably keeps the cascade, into dist/screens-X.min.css (50 KB), loaded
  // beside each bundle. Re-baselined DOWN to what stays render-blocking: 285,867 x 1.15 -> 328,800.
  // 2026-10-13, lz1: tools/split-lazy-css.mjs is retired and its four screens-X.min.css sheets come back here:
  // 370,199 B. Ceiling = the sum of the five old ceilings (328,800 + 9,400 + 17,700 + 17,600 + 13,200), no new room.
  // 2026-10-18, the Scripture Web w3 integration (branch sweb): the docked panel's .sw block (its modes, its
  // ink, the collapsed controls, the one-line legend) met the go-to's and My Web's rules and crossed the ceiling
  // by 1,000 B at 387,700 B. All of it is the web's own chrome; nothing new is imported. Re-baselined UP by
  // the bundle-d rule: 387,700 x 1.15 = 445,855 -> the hundred above. (Moving the .sw rules out of the
  // render-blocking sheet is the real saving, and a separate change.)
  { file: 'app.min.css', measured: 387700, max: 445900 },   // render-blocking <link> in index.html
  // Branch v2 (mw4, 2026-10-14): the v2 shell and the design kit's stylesheet (kit + screens + shell), which replaces
  // app.min.css as the render-blocking <link> on v2. Ceilings ~+15 % over the first build; they grow as screens land.
  // zv1 (Notes + journal editor + place registry) 40,619 B; mw5 (+ Home, 0a/0b): 49,926 B, nothing pulled in (icons
  // 14.4 KB, Home + its data 8.3 KB). While three builders land ~25 more screens at ~3-8 KB each, the ceiling covers
  // that build-out (~150 KB projected) instead of tripping on every screen; it still catches what this gate is for: a
  // corpus or a v1 bundle pulled in (each is MBs). Re-baseline to +15 % once v2's screens are all in.
  // mw5 2026-10-15 (reading record + read-along 1b part 2): 200,502 B, nothing pulled in (esbuild metafile: no store
  // module, no corpus; the largest inputs are main's backup-flow.js 17.9 KB for Your data, icons 14.4 KB, the player
  // 14.0 KB). About two thirds of the screens are in, so ~250 KB is projected at the end: ceiling 280 KB, still far under
  // a corpus or a v1 bundle.
  // zones v2p5 2026-10-15 (Studies 2d/2e, after v2lis 2f's ... menu): 283,568 B, nothing pulled in (esbuild metafile: the
  // largest inputs are still Player.jsx 18.6 KB, backup-flow.js 17.9 KB, icons 15.7 KB; Studies adds 3.9 KB + main's
  // audio-coverage.js 1.3 KB). Still to come: the study chapter, Matthew, Songs, the Garden, the Scripture Web host (~8 KB
  // each): ceiling 340 KB, far under a corpus or a v1 bundle (MBs).
  // myweb mw7 2026-10-15 (Settings > Reading + Bible translation 7d/7e, over zones' study chapter and readalong's coverage
  // mark): 340,478 B, nothing pulled in (esbuild metafile: Player.jsx 18.6 KB, backup-flow.js 17.9 KB, icons 17.8 KB the
  // largest; Reading 4.3 KB + its facts 3.9 KB). Still to come: the ... menus, Matthew, Songs, the Garden, the Scripture
  // Web host, notebooks (dz20), links (dz22), storage banners (~8 KB each): ceiling 400 KB, far under a corpus or a v1
  // bundle (MBs).
  // zones v2p6 2026-10-15 (Songs of the Letters 6d/6e: the hub, its lists, a song's page, Letters read with music, over
  // myweb's ... menus, search landing and letter foot): 407,721 B, nothing pulled in (esbuild metafile: SongsScreens.jsx
  // 23.8 KB, songs-facts.js 10.6 KB, the gate's pinned catalog views 4.4 KB; main's song-catalog / song-keep / SongParts
  // stay bundle-d globals, none bundled). Still to come: the Garden, the Scripture Web host, notebooks (dz20), links
  // (dz22), storage banners: ceiling 470 KB, far under a corpus or a v1 bundle (MBs).
  // myweb mw9a 2026-10-15 (the journal entry 3n with Insert 3o and the picker's card/excerpt modes 4g, over the Garden,
  // links and storage banners): 470,870 B, nothing pulled in (esbuild metafile, 117 inputs: JournalEditor.jsx 8.0 KB,
  // journal-blocks.js 4.9 KB, JournalBlocks.jsx 4.2 KB; main's journal stores stay bundle-b globals). Still to come:
  // the rest of the journal (pickers, voice memo), notebooks (dz20), the Scripture Web host: ceiling 540 KB, far under a
  // corpus or a v1 bundle (MBs).
  // zones zs26 2026-10-16 (Search after main's sr10-sr13: Best matches, Book order, places, notes line, Recent, one
  // volume; over myweb's notebooks, voice memo, a note's ... and the upkeep strip): 541,292 B, nothing pulled in (esbuild
  // metafile, 130 inputs: SongsScreens.jsx 23.8 KB, Player.jsx 18.6 KB, LinkPicker.jsx 18.6 KB the largest; Search adds
  // SearchScreen.jsx 15.2 KB + search-facts.js 9.4 KB, main's query-parse 0.2 KB and recent-searches 0.8 KB; the gate's
  // search rows are fetched, never bundled). Still to come: the gaps list's last pages: ceiling 620 KB, far under a corpus
  // or a v1 bundle (MBs).
  { file: 'bundle-v2.js', measured: 541292, max: 620000 },
  // v2.min.css the same way (zv1 group 8, Settings pages, 2026-10-14): 36458 B with Search, Notes, the player and Settings in
  // (+5.5 KB over the first kit build, nothing pulled in: each screen's own sheet is 1-3 KB); the ceiling covers the
  // rest of the build-out and still catches app.min.css (370 KB) or a font pulled in. Re-baseline with bundle-v2.js.
  // mw5 1c (dz12): the kit restates every token for Paper and Black ([data-page]) and the text steps: ~40 KB with both.
  // zones v2p5 2026-10-15: 60,957 B after syncing design's dz14 + dz15 recipes into screens.css (+232 lines: Studies,
  // songs, Garden, Scripture Web chrome, banners, the ... menu, Find, auto-scroll), nothing pulled in. The kit now holds
  // every drawn screen's recipe, so what is left is each screen's own small sheet: ceiling 76 KB, still far under
  // app.min.css (370 KB) or a font.
  // myweb mw7 2026-10-15: 75,818 B after syncing design's dz17-dz21 recipes (+185 lines: the Answers home, notebooks, the
  // chapter title lede), nothing pulled in. Notebooks (dz20) and links (dz22) recipes still to sync: ceiling 92 KB, still
  // far under app.min.css (370 KB) or a font.
  // zones v2p8 2026-10-15: 101,748 B. The Scripture Web hosts main's screen whole, and v2 does not load app.css, so main's
  // .sw-* rules (app.css 7612-7781, 7844-8160) come in as scripture-web.css: +15.9 KB minified, nothing else pulled in
  // (85,851 B before it, with mw7 banners, mw8 links and the Garden). Ceiling ~+15%: still far under app.min.css or a font.
  // myweb mw12 2026-10-16: 117,584 B. The build-out since (zones' search/notes sheets, mw10 answers.css, mw11's reading
  // fonts' @font-face list, mw12's journal heading + quote ~0.9 KB) is each screen's own small sheet, nothing pulled in
  // (no app.min.css rule, no font inlined: woff2 stay external). Ceiling ~+15%: 135 KB, still far under app.min.css.
  // myweb mw13 2026-10-22: 147,639 B. scripture-web.css takes main's whole current Scripture Web block (app.css
  // 7716-8738 after sweb W3-W5: the docked panel, go-to, trail, rows, compact density, the list without WebGL2): 15.9 KB
  // -> 42.9 KB minified; ~2.5 KB more came with the main merge's sheets. Nothing pulled in (no font, no app.min.css).
  // Ceiling ~+15%: 169 KB, still far under app.min.css (370 KB).
  // mw14 (2026-10-22): v2 hosts main's Answers redesign whole, so answers.css carries app.css's Answers block verbatim
  // (8891-9361, ~25 KB raw) with the kit sheet, SheetHandle, the switch and .sr-only; v2's old Answers rules went. Nothing
  // pulled in (no font, no app.min.css). Ceiling ~+15%: 195 KB.
  { file: 'v2.min.css', measured: 169146, max: 195000 },
  // ── lazy, but still fetched + parsed on the reader's device ──
  { file: 'bundle-a-bible.js', measured: 4995158, max: 5745000 },
  // c43 (2026-09-03): +matthew-nkjv.js (53,811 B minified); ceiling re-set to ~+15%.
  { file: 'bundle-a-matthew.js', measured: 546168, max: 628000 },
  // c41 (2026-09-01): audio-sync.js LEFT this bundle for a lazy src/data fetch
  // (−401,579 B minified). Re-baselined DOWN so the collapse detector keeps its
  // teeth; the old `measured` 2,432,537 was already stale against the
  // 2,657,855 on disk before the move.
  { file: 'bundle-a-vot.js', measured: 2256281, max: 2600000 },
  // ── raw src/data files the app fetches directly (never bundled) ──
  // Bible read-along verse timings, one per audio edition, loaded only while a
  // Bible recording is playing. The ceiling is set from the PROJECTED full
  // edition (31,102 verses at ~5.6 bytes each plus book/chapter keys ≈ 184 KB),
  // not from whatever tranche has shipped so far — otherwise the second and
  // third editions could quietly double it one book at a time.
  { file: 'src/data/bible-sync-brm-kjv.js', measured: 184000, max: 215000, optional: true },
  { file: 'src/data/bible-sync-wop-nkjv.js', measured: 184000, max: 215000, optional: true },
  { file: 'src/data/bible-sync-web-ebible.js', measured: 184000, max: 215000, optional: true },
  // One book, 28 chapters — two orders of magnitude smaller than a whole Bible.
  { file: 'src/data/bible-sync-tsot-matthew.js', measured: 6000, max: 20000, optional: true },
  // The letter read-along timings (AUDIO_SYNC / AUDIO_SYNC_ALT), lazy since c41:
  // loaded only while a letter recording plays with the wash on. The ceiling is
  // set from the PROJECTED full corpus, not today's tranche: 617 keys / 497,951 B
  // raw today; flock 62 + rebuke 31 + holydays 16 still unaligned at ~52 rows ×
  // ~20 B ≈ +113 KB, the Volume Two re-align ≈ +18 KB, alternates ≈ +10% →
  // ~630 KB raw, +15%. Served RAW on purpose: 156 KB vs 150 KB gzipped, and a
  // minify step would put a second copy of the bytes on disk.
  { file: 'src/data/audio-sync.js', measured: 497951, max: 730000 },
  // The WTLB compilation timelines (AUDIO_SYNC_SECTIONS, tools/batch-align-sections.py):
  // 352 letters x ~15 rows x ~28 B ≈ 150 KB projected, lazy like audio-sync.js and
  // loaded only while a Part/Section compilation plays. Optional until it lands.
  { file: 'src/data/audio-sync-sections.js', measured: 150000, max: 260000, optional: true },
  // Recording lengths (AUDIO_LENGTHS, tools/gen-audio-lengths.py, downloads brief 3d): [bytes, seconds] for
  // 4,515 recordings, 168,220 B raw / 66 KB gzipped, lazy (fetched the first time a size or a length is wanted).
  // +50 % for new editions and recordings.
  { file: 'src/data/audio-lengths.js', measured: 168220, max: 252000 },
  // Answers Only God Can Give (ANSWERS, tools/fetch-answers.py): 121 topic pages,
  // lazy — fetched the first time a reader opens Answers (utils/sync-loaders.js).
  // Served raw like the timings; the site is complete, so +15 %. `measured` was
  // 2,488,915 B when this row landed; c72 (2026-10-19, + the Main Page and the site
  // chrome) measures 2,507,577. The ceiling is unchanged.
  { file: 'src/data/answers.js', measured: 2507577, max: 2862000 },
  // The Answers sidecars (ANSWERS_META, same converter, c72 2026-10-19): what the
  // site shows beyond the words (sections, links, media, attributions, underlines),
  // keyed by entry id, lazy (utils/sync-loaders.js loadAnswersMeta). +15 % over the 359,363 B it measured when the row
  // landed; the shipped file (phase 1 complete) measures 367,773. The ceiling is unchanged.
  { file: 'src/data/answers-meta.js', measured: 367773, max: 413300 },
];

const kb = (n) => (n / 1000).toFixed(1) + ' KB';

const over = [];
const missing = [];
// Every row the loop did NOT `continue` past — i.e. every file it actually
// stat'ed. This is the set the success line may speak for, and it is the set
// the headroom line searches. BUDGETS.length is the set it USED to claim.
const seen = [];
for (const b of BUDGETS) {
  // A path with a separator is relative to the assets root (a raw src/data
  // file the app fetches directly); a bare name is a dist/ bundle.
  const path = b.file.includes('/') ? join(ASSETS, b.file) : join(DIST, b.file);
  let size;
  try { size = statSync(path).size; }
  catch (_e) {
    // `optional` covers editions that have not been aligned yet: a ceiling
    // should be in place BEFORE the first tranche lands, not after.
    if (!b.optional) missing.push(b.file);
    continue;
  }
  seen.push({ ...b, size });
  if (size > b.max) over.push({ ...b, size });
}

if (missing.length) {
  console.error('[bundle-budget] these bundles are missing from dist/ — run `npm run build`:');
  for (const f of missing) console.error('  ' + f);
  process.exit(1);
}

if (over.length) {
  console.error('[bundle-budget] a bundle grew past its byte ceiling:');
  for (const o of over) {
    const growth = ((o.size / o.measured - 1) * 100).toFixed(1);
    // The absolute overrun FIRST, because it is the number a reader uses to
    // decide whether this RED is real. The percentage is computed against
    // `measured`, which is in no comparison in this file and goes stale
    // silently; a bundle 256 bytes past its ceiling once reported "+1.7%".
    console.error(`  ${o.file}  ${kb(o.size)}  >  ceiling ${kb(o.max)}   over by ${o.size - o.max} bytes   (+${growth}% vs the ${kb(o.measured)} baseline)`);
  }
  console.error('');
  console.error('  This is a collapse detector, not a diet: the ceilings sit ~15% over the');
  console.error('  measured baseline, so ordinary work does not reach them. Find what got');
  console.error('  pulled in (`npx esbuild --analyze` on the entry, or diff the import graph)');
  console.error('  before assuming the number is just stale.');
  console.error('');
  console.error('  To re-baseline DELIBERATELY: edit `measured` + `max` for that file in');
  console.error('  tools/check-bundle-budget.js, in the same commit, with the reason in the');
  console.error('  commit message. There is no flag to skip this.');
  process.exit(1);
}

// `all ${BUDGETS.length}` was a CONSTANT, so it could only be right by coincidence
// — on a tree where every optional row's file happens to exist. Today 13 of 15 are
// present and it printed "all 15" on every green. A count that cannot be wrong
// because it cannot be right is the same defect as a stale `measured`: a number
// beside a verdict, describing nothing the verdict depended on.
const absent = BUDGETS.length - seen.length;
console.log(`[bundle-budget] OK — all ${seen.length} of ${BUDGETS.length} declared (${absent} optional absent) inside their byte ceilings.`);
// The tightest headroom in BYTES, over every row that was stat'ed — not a
// naming-convention subset. A `tightest:` line computed over the bare-filename
// bundles alone describes less than the gate measured while reading as though it
// describes all of it, and on the day a src/data row is genuinely tightest it
// cannot name it and names the runner-up instead.
if (seen.length) {
  const t = seen.reduce((a, b) => (b.max - b.size < a.max - a.size ? b : a));
  console.log(`  tightest: ${t.file} ${t.size} / ${t.max}, ${t.max - t.size} left`);
}
