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
  { file: 'bundle-b.js', measured: 269918, max: 310500 },   // stores/hooks/journal machinery/bridge
  { file: 'bundle-c.js', measured: 19014, max: 22000 },    // renderer
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
  { file: 'bundle-d.js', measured: 624549, max: 718300 },   // most screens/sheets/utils
  // Re-baselined 2026-09-22 (292,190 B): the Answers landing's rules (~8 KB) and the
  // month's large-text / tap-target fixes, on top of 253,510 B measured 09-01.
  { file: 'app.min.css', measured: 292190, max: 336000 },   // render-blocking <link> in index.html
  // ── lazy, but still fetched + parsed on the reader's device ──
  // Re-baselined 114,137 -> 131,027 on 2026-09-11 (landing 89's tree): eight landings of
  // Settings/Search work since the last baseline had eaten the margin down to 973 bytes,
  // and a ceiling that fails the next honest change is a gate nobody can land under.
  // 2026-09-22, landing 27: search-data.js ARRIVES here (+29,263 minified; it
  // was 42,753 raw in bundle-a), with SearchScreen and the engine that read it.
  // This is the deliberate other side of a cold-boot saving, not growth:
  // 161,860 x 1.15 = 186,139 -> the hundred above.
  { file: 'bundle-e.js', measured: 161860, max: 186200 },   // Settings/Search/Garden + the search tables
  // The Scripture Web. Re-baselined 32,447 -> 41,806 when My Web landed, then
  // 41,806 -> 57,610 for s13: Go to/Nearby, dense-line disambiguation,
  // navigable corpus underlay cards, focus-safe dialogs, and orientation UX.
  // Deliberate — this is the feature's lazy bundle, not the cold boot path.
  //
  // 2026-09-10, landing 70: 66,400 -> 76,100, and `measured` to the size true at
  // that landing. THE CEILING WAS RAISED BECAUSE IT HAD 265 BYTES LEFT, not
  // because anything grew unexpectedly. Three Scripture Web landings walked the
  // margin down 1,272 -> 857 -> 694 -> 265 — 79% of the original headroom — and
  // 265 B is about three lines of minified JS, so the next ordinary change here
  // trips a COLLAPSE detector over something that is not a collapse.
  //   measured 66,135 x 1.15 = 76,055.25, rounded up to the hundred = 76,100.
  // The percentage this file prints never left +0.7% through any of those three,
  // because it is computed against `measured` and `measured` had drifted 7,933 B
  // stale. That is fixed here for this row and in the next commit for the
  // sentences; the OTHER rows' `measured` values are still stale and are left
  // alone deliberately, because the headroom line landing next prints size and
  // max directly and a stale baseline can no longer be the only number a reader
  // gets. `measured` is in no comparison in this file — the only test is
  // `size > b.max` — so nothing above can change a gate outcome except the
  // ceiling itself.
  // l8 (2026-09-22): the density law's table, level, stand-ins and "x n" badges deleted under the structure law; ceiling re-set to ~+15%.
  // l18 (2026-09-22 03:1x): 91,700 -> 101,200 with 3,715 B (4 %) left after landings 9-17 - the lens,
  // sky navigation (ruler + elevator), the counts under the lens, the how-to-read card, the Nearby
  // list - added 8,322 B in one night: the landing-70 rule (a ceiling that fails the next honest change
  // is a gate nobody can land under; measured x 1.15 rounded up to the hundred: 87,985 x 1.15 =
  // 101,182.75 -> 101,200). Lazy bundle, not cold boot; the 16-day trend of every bundle is in
  // D:\Swarm\lanes\myweb\out\perf-bundle-trend-2026-09-22.md (cold-boot path +1.8 % in 16 days).
  { file: 'bundle-f.js', measured: 87985, max: 101200 },
  // The Personal Study screens, split out of bundle-d on 2026-09-22 (landing
  // 21): opened on purpose, never on the way to a chapter, so they are fetched
  // and parsed only when one is. Landing 22 added the fifth, My Bookmarks
  // (+7,985 B), which is the whole point of the bundle rather than a collapse:
  // 54,571 x 1.15 = 62,757 -> the hundred above.
  // Landing 23 added Milestones and History — the same law, two more screens:
  // 65,601 x 1.15 = 75,441 -> the hundred above.
  // 2026-09-22, landing 28: the journal screens arrive (+78,397 B, almost
  // exactly what bundle-b lost — platform-bridge.js is read as a free global
  // by JournalRecordingSheet instead of imported, so no second copy of the
  // bridge came with them). 143,998 x 1.15 = 165,597.7 -> the hundred above.
  { file: 'bundle-g.js', measured: 143998, max: 165600 },   // Personal Study screens + the journal screens
  // The Listening Library, split out on 2026-09-22 (landing 24): the browsing
  // surface only. audio-player.js, AudioShelf, AudioSeekSlider and CoverageBadge
  // stay in bundle-d for the shell's player bar, so this stays SMALL - a jump
  // here means the player came along. 24,353 x 1.15 = 28,006 -> the hundred above.
  // 2026-09-22 (readalong, listening item 4): +4,578 B for a FIFTH screen, the
  // Bible/Letter Studies doorway (AudioStudiesScreen 3.0 KB minified) plus the hub
  // row and the collection screen's 'study:<id>' source; `esbuild --analyze` shows
  // the five screens and nothing else (the player did not come along).
  // 28,931 x 1.15 = 33,270.65 -> the hundred above.
  // 2026-09-24 (readalong, listening items 4b + 8): +11,849 B. 4b's honest Studies
  // copy and Back pill (+867 B, 29,798 on main), then item 8's SIXTH screen, "On this
  // phone" (AudioOfflineScreen), and the downloads controls on every recordings row
  // (OfflineAudioControls: the row line, Download all and its size confirm). The
  // downloads STORE stays in bundle-d beside the player (bundle-h-membership pins
  // '__votOfflineAudio' out of bundle-h). 40,780 x 1.15 = 46,897 -> the hundred above.
  // 2026-09-25 (ai-music, songs-U1 / L2): +16,178 B for a SEVENTH screen, Songs of the
  // Letters (AudioSongsScreen: the hub, its Find box and chips, the collection tiles and
  // shelves, the list screen). The catalog store, the song pieces (cover, round play,
  // choice sheet) and the route helpers stay in bundle-d beside the player that the bar
  // and desk share. 57,506 x 1.15 = 66,132 -> the hundred above.
  // 2026-09-25 (ai-music, songs-U2..U4): +8,934 B over U1 — the song page (U2) and the Letters read with music
  // screen (U4), both frames of the same Songs screen. The desk's song mode, the bar's song skin, the lyrics loader
  // and the song finder landed in bundle-d beside the player, not here. 66,440 x 1.15 = 76,406 -> the hundred above.
  { file: 'bundle-h.js', measured: 66440, max: 76500 },     // Listening Library hub / Volumes / Studies / collection / saved / on this phone / songs
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
  // Answers Only God Can Give (ANSWERS, tools/fetch-answers.py): 121 topic pages,
  // lazy — fetched the first time a reader opens Answers (utils/sync-loaders.js).
  // Served raw like the timings; the site is complete, so +15 %.
  { file: 'src/data/answers.js', measured: 2488915, max: 2862000 },
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
