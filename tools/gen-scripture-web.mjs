/**
 * gen-scripture-web — builds the Scripture Web graph asset.
 *
 *   node tools/gen-scripture-web.mjs              write the asset
 *   node tools/gen-scripture-web.mjs --check      fail when the shipped asset is stale
 *   node tools/gen-scripture-web.mjs --measure    also print the citation encodings' sizes
 *   node tools/gen-scripture-web.mjs --verbose    list every corpus problem
 *
 * Inputs:
 *   tools/vendor/openbible-cross-references/cross_references.txt
 *     OpenBible.info cross-reference dataset (Treasury of Scripture Knowledge
 *     et al.), CC-BY — in-app attribution REQUIRED (AboutScreen + the
 *     Scripture Web screen). 344,799 rows "From<TAB>To<TAB>Votes".
 *   src/data/books.js + matthew-plain.js      — THE canonical verse table
 *   src/data/matthew.js                       — votNotes (Bible→VOT)
 *   src/data/<all Format A collections>       — scripture footnotes (VOT→Bible)
 *   src/data/bible-studies.js                 — {{ref:}} + prophecy-groups + letter-links
 *   src/data/wtlb-*.js, the-blessed.js, holy-days.js — Format B {{ref:}} tokens
 *
 * Output: src/data/scripture-web-data.js — `var SCRIPTURE_WEB_DATA = {...}`,
 *   base64-encoded little-endian typed arrays pre-sorted into the LOD/density
 *   layout (span bucket → votes tier → x). GENERATED FILE — never hand-edit.
 *
 * The pure pipeline lives in tools/scripture-web-lib.mjs (the verse table and
 * the TSK layout) and tools/scripture-web-cites.mjs (the Volumes' citations),
 * unit-tested by tools/gen-scripture-web.test.js and
 * tools/scripture-web-cites.test.js. This shell only does I/O + corpus loading.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { gzipSync } from 'zlib';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  buildVerseTable, parseTsk, layoutPairs, deltaEncode, toBase64,
  CANON_ABBREVS, SPAN_BUCKETS, DENSITY_TIERS, CHUNK_SIZE,
} from './scripture-web-lib.mjs';
import {
  extractCites, groupCites, encodeCites, encodeStudyLinks, holyDaysMirrors, shortStudyTitle,
  makeRefParts, ENTRY_COLLECTIONS,
} from './scripture-web-cites.mjs';
import {
  excerptFor, siteCite, CITE_KINDS, COLLECTION_ORDER,
} from '../app/src/main/assets/src/utils/scripture-web/vot-citations.js';
import { COLLECTIONS, splitCompoundRef, findBook }
  from '../app/src/main/assets/src/data/scripture-resolution.js';

const CHECK = process.argv.includes('--check');       // regenerate in memory, compare, write nothing
const MEASURE = process.argv.includes('--measure');   // print the citation encodings' sizes
const VERBOSE = process.argv.includes('--verbose');   // list every corpus problem
const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const DATA = resolve(ASSETS, 'src', 'data');
const VENDOR = resolve(HERE, 'vendor', 'openbible-cross-references');

const loadGlobal = (file, name) => {
  const ctx = {};
  runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx, { filename: file });
  const value = ctx[name];
  if (!value) throw new Error(`${name} not found in ${file}`);
  return { value, ctx };
};

// ── 1. canonical verse table ─────────────────────────────────────────────────
const { value: BOOKS } = loadGlobal('books.js', 'BOOKS');
const { value: MATTHEW_PLAIN } = loadGlobal('matthew-plain.js', 'MATTHEW_PLAIN');
const booksById = {};
for (const [key, book] of Object.entries(BOOKS)) booksById[book.id || key] = book;
booksById['matthew-plain'] = MATTHEW_PLAIN;
const table = buildVerseTable(booksById);
console.log(`canon: ${table.books.length} books, ${table.chapters.length} chapters, ${table.total} verses`);

// findBook (inside parseRefStr) reads window.__ALL_BOOKS at call time — the
// same shim validate-schemas.js uses for its corpus-wide ref resolution pass.
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
globalThis.window.__ALL_BOOKS = booksById;
const parseAppRefAll = makeRefParts(splitCompoundRef, findBook);

// ── 2. TSK cross-references ──────────────────────────────────────────────────
const tskText = readFileSync(resolve(VENDOR, 'cross_references.txt'), 'utf8');
const { pairs, stats } = parseTsk(tskText, table);
console.log(`tsk: ${stats.rows} rows → ${pairs.length} unique pairs ` +
  `(${stats.clamped} clamped, ${stats.dropped.length} dropped)`);
if (stats.dropped.length) {
  console.log('  dropped rows (first 10):');
  for (const d of stats.dropped.slice(0, 10)) console.log(`    ${d}`);
}
// Ship the famous ~64k-link view, not the weak 300k tail. The tail adds
// lag and visual noise without improving the useful cross-reference map.
const webPairs = pairs.filter((pair) => pair[2] >= DENSITY_TIERS[1]);
console.log(`web: ${webPairs.length} shipped pairs (votes >= ${DENSITY_TIERS[1]})`);
const layout = layoutPairs(webPairs);
const delta = deltaEncode(layout);
for (const [i, b] of layout.buckets.entries()) {
  console.log(`  bucket[${i}] span<${SPAN_BUCKETS[i]}: len=${b.len} ` +
    `essential=${b.off20} famous=${b.off10} segs=${b.segments} chunks=${b.chunks.length}`);
}

// ── 3. the Volumes' citations ────────────────────────────────────────────────
const COLLECTION_FILES = {
  one: 'volume-one.js', two: 'volume-two.js', three: 'volume-three.js',
  four: 'volume-four.js', five: 'volume-five.js', six: 'volume-six.js',
  seven: 'volume-seven.js', timothy: 'letters-timothy.js',
  flock: 'letters-flock.js', rebuke: 'lords-rebuke.js',
  wtlb1: 'wtlb-one.js', wtlb2: 'wtlb-two.js', blessed: 'the-blessed.js',
  holydays: 'holy-days.js', hm: 'hidden-manna.js',
};
const collections = new Map();               // volKey -> { col, letters }
const letterOrder = new Map();               // "volKey/id" -> reading position in its collection
const titleIndex = new Map();                // "<volKey>::<title norm>" -> {volKey, letterId}
const labelToVolKey = new Map();
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
for (const col of COLLECTIONS) {
  const file = COLLECTION_FILES[col.volKey];
  if (!file) continue;
  const ctx = {};
  runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx, { filename: file });
  const letters = [];
  const main = ctx[col.globalName];
  if (Array.isArray(main)) letters.push(...main);
  const preface = col.prefaceGlobal ? ctx[col.prefaceGlobal] : null;
  if (preface) letters.push(preface);
  collections.set(col.volKey, { col, letters });
  for (const label of [col.registryLabel, col.label]) {
    if (label) labelToVolKey.set(norm(label), col.volKey);
  }
  // a preface is read first; the letters follow in their array order
  letters.forEach((letter, i) => {
    if (!letter || !letter.id) return;
    letterOrder.set(`${col.volKey}/${letter.id}`, letter === preface ? 0 : i + 1);
    if (letter.title) titleIndex.set(`${col.volKey}::${norm(letter.title)}`, { volKey: col.volKey, letterId: letter.id });
  });
}
/**
 * Mirror the app's own votNote resolution (index.html __finishVotInit +
 * data/letter-linking.js resolveVotLetter), including its two special cases,
 * so this generator's edge count matches what a reader can actually tap:
 *
 *   · Hidden Manna registers `title::title`, because the Study Bible PDF
 *     cites those letters with no volume (they are not in a published one).
 *   · The one note that points at The Blessed as an ALBUM rather than an
 *     entry is registered under its `null::<title>` key, aimed at the
 *     collection's introduction.
 */
const BLESSED_ALBUM_TITLE =
  'The Blessed: More Declarations of Blessedness From The Lord, Our God and Savior';

const resolveLetter = (volLabel, letterTitle) => {
  const volKey = labelToVolKey.get(norm(volLabel));
  if (volKey) {
    const hit = titleIndex.get(`${volKey}::${norm(letterTitle)}`);
    if (hit) return hit;
  }
  if (norm(letterTitle) === norm(BLESSED_ALBUM_TITLE)) {
    const intro = titleIndex.get('blessed::introduction');
    if (intro) return intro;
  }
  // A votNote whose `vol` is just the letter title again is the importer
  // recording a PDF row that named no volume — search the corpus by title.
  const want = `::${norm(letterTitle)}`;
  for (const [key, hit] of titleIndex) if (key.endsWith(want)) return hit;
  return null;
};
const resolveCollection = (label) => labelToVolKey.get(norm(label)) || null;
const resolveScreen = (screen) => (COLLECTIONS.find((c) => c.letterScreen === screen) || {}).volKey || null;

const { value: MATTHEW } = loadGlobal('matthew.js', 'MATTHEW');
const { value: BIBLE_STUDIES } = loadGlobal('bible-studies.js', 'BIBLE_STUDIES');

// Hidden Manna is reachable only through the Matthew study chain, never from
// a public index (CLAUDE.md): the Web's "Cited in the Volumes" is one, so its
// letters are left out here, not filtered later.
const cites = extractCites({
  collections, studies: BIBLE_STUDIES, matthew: MATTHEW, table,
  refParts: parseAppRefAll, resolveLetter, resolveCollection, resolveScreen, skip: new Set(['hm']),
});
const c = cites.counts;
console.log(`sites: ${cites.sites.length} (votNote ${c.votNote}, footnote ${c.footnote}, ` +
  `study ${c.study} incl. ${c.studyPlain} plain source lines, wtlb ${c.wtlb}; ` +
  `${c.skipped} Hidden Manna notes left out)`);
console.log(`votNote quotes located: ${c.quoteWhole} whole + ${c.quoteHead} by their opening words` +
  (c.quoteMissing ? `, ${c.quoteMissing} not found (${c.quoteTwin} open where the letter cites the verse ` +
    'itself, the rest at the letter\'s first block)' : ''));

const studyOrder = new Map();               // "studyId/chapterId" -> {order, title, studyTitle}
BIBLE_STUDIES.forEach((study, si) => (study.chapters || []).forEach((ch, ci) => {
  studyOrder.set(`${study.id}/${ch.id}`, {
    order: si * 1000 + ci, title: ch.title || study.title, studyTitle: shortStudyTitle(study.title),
  });
}));
const COLLECTION_RANK = (volKey) => {
  const i = COLLECTION_ORDER.indexOf(volKey);
  return (i < 0 ? COLLECTION_ORDER.length : i) * 1e6;
};
const describe = (key, t) => {
  if (t.studyId) {
    const s = studyOrder.get(`${t.studyId}/${t.chapterId}`);
    return s ? { order: COLLECTION_RANK('studies') + s.order, title: s.title } : null;
  }
  const id = t.letterId || t.entryId;
  const pos = letterOrder.get(`${t.volKey}/${id}`);
  if (pos == null) return null;
  const entry = collections.get(t.volKey).letters.find((l) => l && l.id === id);
  return { order: COLLECTION_RANK(t.volKey) + pos, title: String(entry.title || '') };
};
const grouped = groupCites(cites.sites, describe);
const votCites = encodeCites(grouped.entries);
for (const row of votCites) if (row.c === 'studies') row.st = studyOrder.get(`${row.sid}/${row.id}`).studyTitle;
{
  const distinct = cites.sites.length - grouped.duplicateSites;
  console.log(`citations: ${grouped.entries.length} letters/chapters, ${grouped.edges} edges, one per ` +
    `verse and letter (${distinct} distinct sites, ${distinct - grouped.edges} of them a letter's second ` +
    `or later cite of a verse; ${grouped.duplicateSites} identical sites folded)`);
}

const hd = holyDaysMirrors(collections.get('holydays').letters, collections, resolveCollection);
console.log(`holy days: ${Object.keys(hd.mirrors).length} entries mirror their source, ${hd.missing.length} unmatched`);
for (const m of hd.missing) console.log(`  unmatched ${m}`);

const { prophecy, votLinks, problems } = cites;
const studyLinks = encodeStudyLinks(prophecy, votLinks, (sid, id) => studyOrder.get(`${sid}/${id}`).order);
console.log(`prophecy pairs: ${prophecy.length}; study letter-links: ${votLinks.length}; problems: ${problems.length}`);
/** What each problem kind means (they are corpus facts, not generator failures). */
const PROBLEM_KINDS = {
  'votNote-letter': 'Study Bible note cites a letter absent from the corpus',
  'votNote-ref': 'Study Bible note with an unreadable verse ref',
  'votNote-quote': 'Study Bible note whose quotation is not in its letter',
  'footnote-ref': 'scripture footnote whose ref does not parse',
  'footnote-orphan': 'scripture footnote no block marks',
  'study-ref': 'study {{ref:}} that does not parse',
  'study-letter-link': 'study letter-link to a letter not in the corpus',
  'study-letter-link-label': 'study letter-link labelled with the wrong collection',
  'prophecy-incomplete': 'prophecy group without an Old or New Testament passage',
  'wtlb-ref': 'Format B {{ref:}} that does not parse',
};
if (problems.length) {
  const byKind = {};
  for (const p of problems) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  for (const [k, n] of Object.entries(byKind)) console.log(`  ${n} x ${PROBLEM_KINDS[k] || k}`);
  if (VERBOSE) for (const p of problems) console.log(`    ${p.kind}: ${p.where}: ${p.what}`);
  else console.log('  (--verbose lists them)');
}

// Every anchor must open on words: an empty excerpt means the anchor and the
// text domain disagree, a generator bug (never ship it).
const corpusFor = {
  letter: (volKey, id) => ((collections.get(volKey) || {}).letters || []).find((l) => l && l.id === id) || null,
  studyChapter: (studyId, chapterId) => {
    const s = BIBLE_STUDIES.find((x) => x.id === studyId);
    return (s && (s.chapters || []).find((ch) => ch.id === chapterId)) || null;
  },
};
let emptyExcerpts = 0;
const excerptOf = (row, site) => {
  const key = row.c === 'studies' ? `study:${row.sid}/${row.id}` : `${row.c}/${row.id}`;
  return excerptFor(corpusFor, key, site[2], siteCite(site));
};
for (const row of votCites) {
  for (const site of row.s) {
    if (!excerptOf(row, site)) {
      emptyExcerpts++;
      console.log(`  EMPTY excerpt: ${row.c}/${row.id} ${JSON.stringify(site)}`);
    }
  }
}
if (emptyExcerpts) { console.error(`${emptyExcerpts} citation anchors resolve to no text`); process.exit(1); }

// ── 4. emit ──────────────────────────────────────────────────────────────────
const out = {
  version: 2,
  attribution: 'Cross-reference data © OpenBible.info (CC-BY)',
  total: table.total,
  count: layout.from.length,
  densityTiers: DENSITY_TIERS,
  chunkSize: CHUNK_SIZE,
  books: table.books.map((b, i) => ({ id: b.id, title: b.title, abbr: CANON_ABBREVS[i], start: b.start })),
  chapters: table.chapters,
  buckets: layout.buckets.map((b) => ({
    off: b.off, len: b.len, off20: b.off20, off10: b.off10,
    segments: b.segments, chunks: b.chunks,
  })),
  dfrom64: toBase64(delta.dfrom),
  span64: toBase64(delta.span),
  votes64: toBase64(layout.votes),
  votCites,
  mirrors: hd.mirrors,
  studyLinks,
};

const header = `/* ═══════════════════════════════════════════════════════════════════════
   scripture-web-data.js — GENERATED by tools/gen-scripture-web.mjs. DO NOT EDIT.
   Regenerate: node tools/gen-scripture-web.mjs   (freshness: --check)
   Cross-reference data © OpenBible.info (https://www.openbible.info/labs/
   cross-references/), Creative Commons Attribution (CC-BY). Attribution is
   REQUIRED wherever this data is displayed. Source vendored at
   tools/vendor/openbible-cross-references/ (row count + sha256 in its README).
   dfrom64/span64: Uint16Array LE, votes64: Int16Array LE — pre-sorted
   span-bucket -> votes-tier -> x layout, then delta-encoded per bucket
   (from = running sum of dfrom; to = from + span). See layoutPairs() and
   deltaDecode() in tools/scripture-web-lib.mjs — the app-side decoder in
   src/utils/scripture-web/decode.js must stay identical to deltaDecode().
   votCites: the Volumes' citations of scripture, one row per letter in
   reading order, each site an anchor (block, footnote / inline ref / quoted
   span), never text — the words are read from the loaded corpus at runtime.
   mirrors: Holy Days entry -> the letter it re-presents. studyLinks: the
   Bible Studies' prophecy pairs and letter-links. encodeCites() and
   encodeStudyLinks() in tools/scripture-web-cites.mjs document the shapes;
   src/utils/scripture-web/decode.js + vot-citations.js read them.
   ═══════════════════════════════════════════════════════════════════════ */
`;
const outPath = resolve(DATA, 'scripture-web-data.js');
const text = header + 'var SCRIPTURE_WEB_DATA = ' + JSON.stringify(out) + ';\n';

if (MEASURE) {
  const gz = (s) => gzipSync(Buffer.from(s), { level: 9 }).length;
  const size = (label, value) => {
    const json = JSON.stringify(value);
    console.log(`  ${label.padEnd(46)} ${String(json.length).padStart(8)} B raw ${String(gz(json)).padStart(7)} B gzip`);
  };
  console.log('measure (the citation field alone, JSON):');
  // E0: the 2026-08 shape — one flat object per site, no anchors
  const legacy = [];
  for (const row of votCites) {
    for (const site of row.s) {
      const kind = CITE_KINDS[site[1]];
      if (row.c === 'studies') legacy.push({ v: site[0], kind, studyId: row.sid, chapterId: row.id });
      else legacy.push(ENTRY_COLLECTIONS.has(row.c)
        ? { v: site[0], kind, volKey: row.c, entryId: row.id }
        : { v: site[0], kind, volKey: row.c, letterId: row.id });
    }
  }
  size(`E0 flat, no anchors (${legacy.length} objects)`, legacy);
  // E1: flat, deduped by (verse, letter), anchors in `at`
  const flat = [];
  for (const row of votCites) {
    const byV = new Map();
    for (const site of row.s) {
      if (!byV.has(site[0])) {
        const base = row.c === 'studies' ? { v: site[0], studyId: row.sid, chapterId: row.id }
          : { v: site[0], volKey: row.c, [ENTRY_COLLECTIONS.has(row.c) ? 'entryId' : 'letterId']: row.id };
        byV.set(site[0], { ...base, kind: CITE_KINDS[site[1]], at: [] });
        flat.push(byV.get(site[0]));
      }
      byV.get(site[0]).at.push(site.slice(1));
    }
  }
  size(`E1 flat per edge + anchors (${flat.length} objects)`, flat);
  size('E2 grouped by letter + anchors (shipped)', votCites);
  const withText = votCites.map((row) => ({ ...row, s: row.s.map((site) => [...site, excerptOf(row, site)]) }));
  size('E3 E2 + embedded excerpt text', withText);
  size('E2 without titles (t, st)', votCites.map(({ t: _t, st: _st, ...row }) => row));
  size('E1 + titles', flat.map((e) => ({ ...e, title: describe('', e).title })));
  console.log('  study links:');
  size(`prophecy + votLinks as objects (${prophecy.length} + ${votLinks.length})`, { prophecy, votLinks });
  size('studyLinks grouped (shipped)', studyLinks);
  const rawOld = existsSync(outPath) ? readFileSync(outPath) : null;
  if (rawOld) console.log(`  asset on disk: ${rawOld.length} B raw, ${gzipSync(rawOld, { level: 9 }).length} B gzip`);
  console.log(`  asset as generated: ${Buffer.byteLength(text)} B raw, ${gz(text)} B gzip`);
}

if (CHECK) {
  const onDisk = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (onDisk === text) { console.log(`fresh: ${outPath}`); process.exit(0); }
  console.error(`STALE: ${outPath} differs from what the corpus generates — run node tools/gen-scripture-web.mjs`);
  process.exit(1);
}
writeFileSync(outPath, text);
const bytes = readFileSync(outPath).length;
console.log(`wrote ${outPath} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
