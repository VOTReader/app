/**
 * gen-scripture-web — builds the Scripture Web graph asset.
 *
 *   node tools/gen-scripture-web.mjs
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
 * The pure pipeline lives in tools/scripture-web-lib.mjs (unit-tested by
 * tools/gen-scripture-web.test.js). This shell only does I/O + corpus loading.
 */
import { readFileSync, writeFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  buildVerseTable, parseTsk, layoutPairs, deltaEncode, toBase64,
  extractVotNotes, extractInlineRefs,
  CANON_ABBREVS, SPAN_BUCKETS, DENSITY_TIERS, CHUNK_SIZE,
} from './scripture-web-lib.mjs';
import { COLLECTIONS, parseRefStr, splitCompoundRef, findBook }
  from '../app/src/main/assets/src/data/scripture-resolution.js';

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
/** parseRefStr output + findBook → {bookId, chapter, verse|null} or null. */
const resolveParsed = (p) => {
  if (!p) return null;
  const key = findBook(p.rawBook);        // returns the BOOK KEY string
  if (!key) return null;
  const bookId = key === 'matthew' ? 'matthew-plain' : key;
  return { bookId, chapter: p.chapter, verse: p.verse == null ? null : p.verse };
};
/**
 * Ref strings in the corpus occasionally carry prose the parser can't eat:
 * a leading gloss ("(which means \"God with us\") - Matthew 1:23") or a bare
 * translation tag with no parentheses ("Amos 3:7 CJB"). Yield the raw string
 * first, then progressively-trimmed candidates. parseRefStr stays untouched —
 * its single-object return is a pinned contract.
 */
function refCandidates(raw) {
  const s = String(raw).trim();
  const out = [s];
  const dash = s.lastIndexOf(' - ');
  if (dash > 0) out.push(s.slice(dash + 3).trim());
  const bareTag = /^(.*?)[\s]+[A-Z]{2,6}$/.exec(s);
  if (bareTag) out.push(bareTag[1].trim());
  return out;
}
/** Compound-aware parse: one entry per passage, book carried across parts. */
function parseAppRefAll(raw) {
  for (const cand of refCandidates(raw)) {
    const parts = splitCompoundRef(cand).map((p) => resolveParsed(p.parsed)).filter(Boolean);
    if (parts.length) return parts;
  }
  return [];
}

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

// ── 3. VOT corpus edges ──────────────────────────────────────────────────────
const COLLECTION_FILES = {
  one: 'volume-one.js', two: 'volume-two.js', three: 'volume-three.js',
  four: 'volume-four.js', five: 'volume-five.js', six: 'volume-six.js',
  seven: 'volume-seven.js', timothy: 'letters-timothy.js',
  flock: 'letters-flock.js', rebuke: 'lords-rebuke.js',
  wtlb1: 'wtlb-one.js', wtlb2: 'wtlb-two.js', blessed: 'the-blessed.js',
  holydays: 'holy-days.js', hm: 'hidden-manna.js',
};
const collections = new Map();               // volKey -> { col, letters }
const titleIndex = new Map();                // "<label norm>::<title norm>" -> {volKey, letterId}
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
  if (col.prefaceGlobal && ctx[col.prefaceGlobal]) letters.push(ctx[col.prefaceGlobal]);
  collections.set(col.volKey, { col, letters });
  for (const label of [col.registryLabel, col.label]) {
    if (label) labelToVolKey.set(norm(label), col.volKey);
  }
  for (const letter of letters) {
    if (letter && letter.id && letter.title) {
      titleIndex.set(`${col.volKey}::${norm(letter.title)}`, { volKey: col.volKey, letterId: letter.id });
    }
  }
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

const bibleEdges = [];
const votLinks = [];
const prophecy = [];
const problems = [];

// 3a. Matthew Study Bible votNotes (Bible→VOT)
{
  const { value: MATTHEW } = loadGlobal('matthew.js', 'MATTHEW');
  const { edges, unresolved } = extractVotNotes(MATTHEW, table, resolveLetter);
  bibleEdges.push(...edges);
  problems.push(...unresolved.map((u) => `matthew: ${u}`));
  console.log(`votNotes: ${edges.length} edges, ${unresolved.length} unresolved`);
}

// 3b. Format A scripture footnotes (VOT→Bible) — compound refs decomposed so
// a "Psalm 2:12; Isaiah 8:13-14" footnote yields one edge per passage.
function require_vid(p) {
  const ch = table.chapterStart.get(`${p.bookId}:${p.chapter}`);
  if (!ch) return -1;
  const v = p.verse == null ? 1 : Math.min(p.verse, ch.verses);
  return ch.start + (v - 1);
}
{
  let total = 0;
  for (const [volKey, { letters }] of collections) {
    for (const letter of letters || []) {
      if (!letter || !letter.footnotes) continue;
      for (const fn of Object.values(letter.footnotes)) {
        if (!fn || fn.type !== 'scripture' || !fn.ref) continue;
        const parts = parseAppRefAll(fn.ref);
        if (!parts.length) { problems.push(`${volKey}/${letter.id}: ${fn.ref}`); continue; }
        for (const p of parts) {
          const vid = require_vid(p);
          if (vid >= 0) { bibleEdges.push({ v: vid, kind: 'footnote', volKey, letterId: letter.id }); total++; }
          else problems.push(`${volKey}/${letter.id}: ${fn.ref}`);
        }
      }
    }
  }
  console.log(`footnotes: ${total} edges`);
}

// 3c. Bible Studies — {{ref:}} tokens, prophecy pairs, letter-links
{
  const { value: BIBLE_STUDIES } = loadGlobal('bible-studies.js', 'BIBLE_STUDIES');
  let refCount = 0, pairCount = 0, linkCount = 0;
  const refsIn = (blocks) => {
    const out = [];
    for (const b of blocks || []) {
      for (const seg of b.segments || []) out.push(...extractInlineRefs(seg.v || ''));
      for (const line of b.lines || []) for (const seg of line) out.push(...extractInlineRefs(seg.v || ''));
    }
    return out;
  };
  const vidsOfRef = (raw) => parseAppRefAll(raw).map(require_vid).filter((v) => v >= 0);
  const vidOfRef = (raw) => { const v = vidsOfRef(raw); return v.length ? v[0] : -1; };
  for (const study of BIBLE_STUDIES) {
    for (const ch of study.chapters || []) {
      const allRefs = [];
      allRefs.push(...refsIn(ch.blocks));
      for (const b of ch.blocks || []) {
        if (b.type === 'prophecy-group') {
          const ot = refsIn(b.ot && b.ot.blocks);
          const nt = refsIn(b.nt && b.nt.blocks);
          const vot = refsIn(b.vot && b.vot.blocks);
          allRefs.push(...ot, ...nt, ...vot);
          const a = ot.length ? vidOfRef(ot[0]) : -1;
          const c = nt.length ? vidOfRef(nt[0]) : -1;
          if (a >= 0 && c >= 0) { prophecy.push({ a, b: c, studyId: study.id, chapterId: ch.id }); pairCount++; }
        }
        for (const seg of b.segments || []) {
          if (seg.t === 'letter-link' && seg.link && seg.link.collection) {
            const volKey = labelToVolKey.get(norm(seg.link.collection));
            const letterId = seg.letterId
              || (seg.link.letterTitle && volKey
                  && (titleIndex.get(`${volKey}::${norm(seg.link.letterTitle)}`) || {}).letterId);
            if (volKey && letterId) {
              votLinks.push({ kind: 'studyLetter', studyId: study.id, chapterId: ch.id, volKey, letterId });
              linkCount++;
            } else problems.push(`study letter-link unresolved: ${study.id}/${ch.id} -> ${seg.link.collection}`);
          }
        }
      }
      for (const raw of allRefs) {
        const vids = vidsOfRef(raw);
        if (!vids.length) { problems.push(`study ref unresolved: ${study.id}/${ch.id}: ${raw}`); continue; }
        for (const vid of vids) {
          bibleEdges.push({ v: vid, kind: 'study', studyId: study.id, chapterId: ch.id });
          refCount++;
        }
      }
    }
  }
  console.log(`studies: ${refCount} refs, ${pairCount} prophecy pairs, ${linkCount} letter-links`);
}

// 3d. Format B inline {{ref:}} (WTLB One/Two, The Blessed, Holy Days)
{
  let count = 0;
  for (const volKey of ['wtlb1', 'wtlb2', 'blessed', 'holydays']) {
    const entry = collections.get(volKey);
    if (!entry) continue;
    for (const item of entry.letters) {
      if (!item || !item.id) continue;
      for (const para of item.paragraphs || []) {
        for (const raw of extractInlineRefs(para.text || '')) {
          const vids = parseAppRefAll(raw).map(require_vid).filter((v) => v >= 0);
          if (!vids.length) { problems.push(`${volKey}/${item.id}: ${raw}`); continue; }
          for (const vid of vids) { bibleEdges.push({ v: vid, kind: 'wtlb', volKey, entryId: item.id }); count++; }
        }
      }
    }
  }
  console.log(`format-b refs: ${count} edges`);
}

console.log(`VOT edges total: ${bibleEdges.length} bible-edges, ` +
  `${prophecy.length} prophecy pairs, ${votLinks.length} vot-links, ${problems.length} problems`);
if (problems.length) {
  console.log('problems (first 15):');
  for (const p of problems.slice(0, 15)) console.log(`  ${p}`);
}

// ── 4. emit ──────────────────────────────────────────────────────────────────
const out = {
  version: 1,
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
  votEdges: bibleEdges,
  prophecy,
  votLinks,
};

const header = `/* ═══════════════════════════════════════════════════════════════════════
   scripture-web-data.js — GENERATED by tools/gen-scripture-web.mjs. DO NOT EDIT.
   Regenerate: node tools/gen-scripture-web.mjs
   Cross-reference data © OpenBible.info (https://www.openbible.info/labs/
   cross-references/), Creative Commons Attribution (CC-BY). Attribution is
   REQUIRED wherever this data is displayed. Source vendored at
   tools/vendor/openbible-cross-references/ (row count + sha256 in its README).
   dfrom64/span64: Uint16Array LE, votes64: Int16Array LE — pre-sorted
   span-bucket -> votes-tier -> x layout, then delta-encoded per bucket
   (from = running sum of dfrom; to = from + span). See layoutPairs() and
   deltaDecode() in tools/scripture-web-lib.mjs — the app-side decoder in
   src/utils/scripture-web/decode.js must stay identical to deltaDecode().
   ═══════════════════════════════════════════════════════════════════════ */
`;
const outPath = resolve(DATA, 'scripture-web-data.js');
writeFileSync(outPath, header + 'var SCRIPTURE_WEB_DATA = ' + JSON.stringify(out) + ';\n');
const bytes = readFileSync(outPath).length;
console.log(`wrote ${outPath} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
