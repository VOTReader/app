/* Generate src/data/bible-audio-manifest.js from a downloaded Bible-edition
   corpus inventory (tools outside the repo download the audio; see
   D:/BibleAudio/). Both shipped editions (brm-kjv, wop-nkjv) are PER-CHAPTER:
   one MP3 per chapter, 1,189 assets each, split OT/NT across two release tags
   because GitHub caps a release at 1,000 assets. Future editions append their
   own [volKey, assetPrefix] pair to the expansion loop.

   RELEASE POLICY — `audio-bible-v1` (the 66 whole-book brm-kjv_<bookId>.mp3
   tracks) is APPEND-ONLY FOREVER. It is no longer the source of any queue, but
   saved Listening Library recordings and pre-switch resume snapshots hold
   those immutable URLs; deleting an asset there breaks a user's own library.
   Never retarget, rename, or prune it — only ever add.

   Usage: node tools/gen-bible-audio-manifest.mjs
   Validates: 66/66 books in the inventory, every app book id present in
   src/data/books.js (a drifting id would silently hide that book's pill), and
   the OT/NT chapter split against the per-testament release asset counts. */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
/* THE edition declaration, imported rather than restated. The expansion loop
   below used to hold its own [volKey, assetPrefix] list, so an edition could
   exist in one place and not the other and nothing would say so. `books` now
   comes from the same object the app reads. */
import { BIBLE_AUDIO_EDITIONS } from '../app/src/main/assets/src/utils/audio-track.js';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const OUT = path.join(ROOT, 'app', 'src', 'main', 'assets', 'src', 'data', 'bible-audio-manifest.js');
const BOOKS_JS = path.join(ROOT, 'app', 'src', 'main', 'assets', 'src', 'data', 'books.js');
const INVENTORY = 'D:/BibleAudio/brministries-kjv/inventory.json';

/* Canonical 66-book order: [appBookId, downloadSlug]. Titles come from
   books.js so the queue names match the reading screens exactly. */
const BOOKS66 = [
  ['genesis', 'genesis'], ['exodus', 'exodus'], ['leviticus', 'leviticus'],
  ['numbers', 'numbers'], ['deuteronomy', 'deuteronomy'], ['joshua', 'joshua'],
  ['judges', 'judges'], ['ruth', 'ruth'], ['1samuel', '1-samuel'],
  ['2samuel', '2-samuel'], ['1kings', '1-kings'], ['2kings', '2-kings'],
  ['1chronicles', '1-chronicles'], ['2chronicles', '2-chronicles'], ['ezra', 'ezra'],
  ['nehemiah', 'nehemiah'], ['esther', 'esther'], ['job', 'job'],
  ['psalms', 'psalms'], ['proverbs', 'proverbs'], ['ecclesiastes', 'ecclesiastes'],
  ['songofsolomon', 'song-of-songs'], ['isaiah', 'isaiah'], ['jeremiah', 'jeremiah'],
  ['lamentations', 'lamentations'], ['ezekiel', 'ezekiel'], ['daniel', 'daniel'],
  ['hosea', 'hosea'], ['joel', 'joel'], ['amos', 'amos'],
  ['obadiah', 'obadiah'], ['jonah', 'jonah'], ['micah', 'micah'],
  ['nahum', 'nahum'], ['habakkuk', 'habakkuk'], ['zephaniah', 'zephaniah'],
  ['haggai', 'haggai'], ['zechariah', 'zechariah'], ['malachi', 'malachi'],
  ['matthew', 'matthew'], ['mark', 'mark'], ['luke', 'luke'],
  ['john', 'john'], ['acts', 'acts'], ['romans', 'romans'],
  ['1corinthians', '1-corinthians'], ['2corinthians', '2-corinthians'], ['galatians', 'galatians'],
  ['ephesians', 'ephesians'], ['philippians', 'philippians'], ['colossians', 'colossians'],
  ['1thessalonians', '1-thessalonians'], ['2thessalonians', '2-thessalonians'], ['1timothy', '1-timothy'],
  ['2timothy', '2-timothy'], ['titus', 'titus'], ['philemon', 'philemon'],
  ['hebrews', 'hebrews'], ['james', 'james'], ['1peter', '1-peter'],
  ['2peter', '2-peter'], ['1john', '1-john'], ['2john', '2-john'],
  ['3john', '3-john'], ['jude', 'jude'], ['revelation', 'revelation'],
];

const booksSrc = fs.readFileSync(BOOKS_JS, 'utf8');
/* books.js file order is not canonical — extract id→title, order by BOOKS66. */
const titles = new Map();
for (const m of booksSrc.matchAll(/"id":\s*"([a-z0-9]+)",\s*"title":\s*"([^"]+)"/g)) {
  if (!titles.has(m[1])) titles.set(m[1], m[2]);
}
/* Matthew is its own corpus (matthew-plain.js / MatthewChapterView), not a
   books.js entry — its title is pinned here. */
if (!titles.has('matthew')) titles.set('matthew', 'Matthew');
const missingIds = BOOKS66.filter(([id]) => !titles.has(id)).map(([id]) => id);
if (missingIds.length) throw new Error('app book ids not found in books.js: ' + missingIds.join(', '));

const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
const missingAudio = BOOKS66.filter(([, slug]) => !inv[slug] || !(inv[slug].bytes > 0)).map(([, slug]) => slug);
if (missingAudio.length) throw new Error('incomplete corpus — missing from inventory: ' + missingAudio.join(', '));

/* Chapter-start index into the RETIRED whole-book BRM tracks
   (D:/BibleAudio/scan-chapters.py — narrator announcement detection,
   cross-validated against YouTube comment stamps). Nothing plays off it any
   more; it is kept for ONE release as whole-book -> per-chapter resume
   migration data (a pre-switch snapshot's clock is book-relative, and these
   offsets are what turn it into a chapter + an offset inside that chapter).
   Emitted only for books whose scan is complete AND monotonic; a book without
   rows migrates to its chapter 1 instead. Retire after the next release. */
const CHAPTERS_JSON = 'D:/BibleAudio/brm-kjv-chapters.json';
const chapterRows = [];
if (fs.existsSync(CHAPTERS_JSON)) {
  const scanned = JSON.parse(fs.readFileSync(CHAPTERS_JSON, 'utf8'));
  for (const [id, slug] of BOOKS66) {
    const book = scanned[slug];
    if (!book || book.status !== 'OK') continue;
    const secs = book.n.map(([, t]) => Math.max(0, Math.round(t)));
    const monotonic = secs.every((t, i) => i === 0 || t > secs[i - 1]);
    if (!monotonic) { console.warn(`SKIP ${slug}: non-monotonic chapter times`); continue; }
    chapterRows.push(`"bible-brm-kjv:${id}":[${secs.join(',')}]`);
  }
  console.log(`chapter index: ${chapterRows.length}/${BOOKS66.length} books`);
}

const booksLines = BOOKS66.map(([id]) => JSON.stringify([id, titles.get(id)])).join(',\n');

/* One row per edition, straight off the registry: [volKey, assetPrefix, books].
   `books` is 'all' or an explicit list of app book ids. An edition that declares
   neither is a HARD ERROR rather than a silently empty one — a partial edition
   that shipped no rows would look exactly like a book that failed to map. */
const ALL_IDS = new Set(BOOKS66.map(([id]) => id));
const EDITION_ROWS = Object.entries(BIBLE_AUDIO_EDITIONS).map(([id, e]) => {
  if (!e.assetPrefix) throw new Error(`edition ${id} declares no assetPrefix`);
  if (e.books !== 'all' && !Array.isArray(e.books)) {
    throw new Error(`edition ${id} declares no books — say 'all' or list the app book ids`);
  }
  if (Array.isArray(e.books)) {
    if (!e.books.length) throw new Error(`edition ${id} declares an EMPTY book list`);
    const unknown = e.books.filter((b) => !ALL_IDS.has(b));
    if (unknown.length) throw new Error(`edition ${id} lists unknown book id(s): ${unknown.join(', ')}`);
  }
  return [e.volKey, e.assetPrefix, e.books === 'all' ? 'all' : e.books];
});
console.log('editions: ' + EDITION_ROWS
  .map(([v, , b]) => `${v} (${b === 'all' ? '66 books' : b.length + ': ' + b.join(',')})`).join('; '));

/* KJV chapter counts, canonical order — drives the per-chapter expansion for
   BOTH editions (2,378 written rows would be ~80 KB; the loop is ~1 KB).
   The OT/NT totals are also the per-release asset counts, so a bad testament
   split here would point half an edition at the wrong tag: the first 39 books
   hold 929 chapters (…-v1) and the last 27 hold 260 (…-v2). */
const CHAPTER_COUNTS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
if (sum(CHAPTER_COUNTS) !== 1189) throw new Error('chapter counts drifted');
if (sum(CHAPTER_COUNTS.slice(0, 39)) !== 929) throw new Error('OT chapter total != the OT release asset count (929)');
if (sum(CHAPTER_COUNTS.slice(39)) !== 260) throw new Error('NT chapter total != the NT release asset count (260)');
const chapterBookRows = BOOKS66
  .map(([id], i) => `["${id}",${i < 39 ? 1 : 2},${CHAPTER_COUNTS[i]}]`)
  .join(',\n');

const out = `/* BIBLE AUDIO MANIFEST — auto-generated by tools/gen-bible-audio-manifest.mjs. DO NOT EDIT.
   BIBLE_AUDIO_BOOKS: canonical 66-book order, [appBookId, title] (titles from books.js).
   BIBLE_AUDIO_MANIFEST: "volKey:bookId" -> [[releaseAssetId, readerCode, partLabel]] —
   every shipped edition is PER-CHAPTER (one part per chapter), expanded by the loop
   at the bottom rather than written out.
   BIBLE_AUDIO_CHAPTERS: "volKey:bookId" -> [sec, ...] chapter-start offsets into the
   RETIRED whole-book BRM track (index i = chapter i+1; narrator-announcement scan,
   comment-validated). Retained as whole-book -> per-chapter RESUME MIGRATION data:
   a snapshot saved before the switch holds a book-relative clock, and this index is
   what turns it into (chapter, offset-within-chapter). Retire after the next release.
   Editions registry lives in src/utils/audio-track.js (BIBLE_AUDIO_EDITIONS).
   Regenerate: node tools/gen-bible-audio-manifest.mjs + npm run build. Rides
   bundle-a (critical path, ~4 KB minified), so DELIVERY is content-hash busted
   — but this filename matches the corpus gate's bible-*.js glob, so
   tools/check-corpus-version.js demands a CORPUS_VERSION bump on every edit
   anyway (it has fired for each of c25/c26/c27). Bump service-worker.js and
   src/search/cache.js together. */
var BIBLE_AUDIO_BOOKS = [
${booksLines}
];
var BIBLE_AUDIO_MANIFEST = {};
var BIBLE_AUDIO_CHAPTERS = {
${chapterRows.join(',\n')}
};
/* PER-CHAPTER expansion — one manifest part per chapter ("Chapter N" partLabel)
   for every edition, expanded here instead of written out (2,378 rows). Asset
   names are <prefix><testament>_<bookId>_<NNN>; the testament digit picks the
   release tag in bibleAudioAssetUrl (brm1_/wop1_ -> the OT tag, brm2_/wop2_ ->
   the NT tag) because 1,189 assets exceed one release's 1,000-asset cap. */
(function () {
  var books = [
${chapterBookRows}
  ];
  var editions = ${JSON.stringify(EDITION_ROWS)};
  for (var e = 0; e < editions.length; e++) {
    for (var b = 0; b < books.length; b++) {
      var id = books[b][0], testament = books[b][1], count = books[b][2];
      // A PARTIAL edition ships only the books it declares. Skipped here rather
      // than filtered afterwards, so the declaration stays the single source: a
      // book absent from the edition's book list never gets a row at all.
      var only = editions[e][2];
      if (only !== 'all' && only.indexOf(id) === -1) continue;
      var parts = [];
      for (var c = 1; c <= count; c++) {
        var num = c < 10 ? '00' + c : c < 100 ? '0' + c : '' + c;
        parts.push([editions[e][1] + testament + '_' + id + '_' + num, '', 'Chapter ' + c]);
      }
      BIBLE_AUDIO_MANIFEST[editions[e][0] + ':' + id] = parts;
    }
  }
})();
`;
fs.writeFileSync(OUT, out);
console.log(`wrote ${OUT}: ${BOOKS66.length} books`);
