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
  { file: 'bundle-a.js', measured: 196619, max: 226000 },   // react + bible-audio-manifest + search-data
  { file: 'bundle-b.js', measured: 318650, max: 367000 },   // stores/hooks/journal/bridge
  { file: 'bundle-c.js', measured: 19014, max: 22000 },    // renderer
  { file: 'bundle-d.js', measured: 522971, max: 602000 },   // most screens/sheets/utils
  { file: 'app.min.css', measured: 253510, max: 292000 },   // render-blocking <link> in index.html
  // ── lazy, but still fetched + parsed on the reader's device ──
  { file: 'bundle-e.js', measured: 114137, max: 132000 },   // Settings/Search/Garden
  // The Scripture Web. Re-baselined 32,447 -> 41,806 when My Web landed, then
  // 41,806 -> 57,610 for s13: Go to/Nearby, dense-line disambiguation,
  // navigable corpus underlay cards, focus-safe dialogs, and orientation UX.
  // Deliberate — this is the feature's lazy bundle, not the cold boot path.
  { file: 'bundle-f.js', measured: 57610, max: 66400 },
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
];

const kb = (n) => (n / 1000).toFixed(1) + ' KB';

const over = [];
const missing = [];
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
    console.error(`  ${o.file}  ${kb(o.size)}  >  ceiling ${kb(o.max)}   (+${growth}% vs the ${kb(o.measured)} baseline)`);
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

console.log(`[bundle-budget] OK — all ${BUDGETS.length} bundles inside their byte ceilings.`);
