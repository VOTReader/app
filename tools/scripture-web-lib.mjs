/**
 * scripture-web-lib — pure helpers for the Scripture Web data generator.
 *
 * Everything here is deterministic and side-effect-free so
 * tools/gen-scripture-web.test.js can exercise the pipeline without
 * touching the filesystem. The CLI shell lives in tools/gen-scripture-web.mjs.
 *
 * Data source (vendored): tools/vendor/openbible-cross-references/
 *   cross_references.txt — OpenBible.info cross-reference dataset, CC-BY.
 *   Attribution is REQUIRED wherever the data is shown (see AboutScreen and
 *   the Scripture Web screen's info surface).
 */

/**
 * TSK book abbreviation → VOTReader book id. Explicit 66-entry table — no
 * prefix guessing. THE ALIAS TRAP: TSK `Matt` maps to `matthew-plain` (the
 * plain NKJV Matthew in matthew-plain.js); `matthew` is the Study Bible and
 * must never appear in graph data (see tools/extract-bible-verses.mjs header).
 */
export const TSK_BOOK_IDS = {
  Gen: 'genesis', Exod: 'exodus', Lev: 'leviticus', Num: 'numbers',
  Deut: 'deuteronomy', Josh: 'joshua', Judg: 'judges', Ruth: 'ruth',
  '1Sam': '1samuel', '2Sam': '2samuel', '1Kgs': '1kings', '2Kgs': '2kings',
  '1Chr': '1chronicles', '2Chr': '2chronicles', Ezra: 'ezra', Neh: 'nehemiah',
  Esth: 'esther', Job: 'job', Ps: 'psalms', Prov: 'proverbs',
  Eccl: 'ecclesiastes', Song: 'songofsolomon', Isa: 'isaiah', Jer: 'jeremiah',
  Lam: 'lamentations', Ezek: 'ezekiel', Dan: 'daniel', Hos: 'hosea',
  Joel: 'joel', Amos: 'amos', Obad: 'obadiah', Jonah: 'jonah', Mic: 'micah',
  Nah: 'nahum', Hab: 'habakkuk', Zeph: 'zephaniah', Hag: 'haggai',
  Zech: 'zechariah', Mal: 'malachi', Matt: 'matthew-plain', Mark: 'mark',
  Luke: 'luke', John: 'john', Acts: 'acts', Rom: 'romans',
  '1Cor': '1corinthians', '2Cor': '2corinthians', Gal: 'galatians',
  Eph: 'ephesians', Phil: 'philippians', Col: 'colossians',
  '1Thess': '1thessalonians', '2Thess': '2thessalonians', '1Tim': '1timothy',
  '2Tim': '2timothy', Titus: 'titus', Phlm: 'philemon', Heb: 'hebrews',
  Jas: 'james', '1Pet': '1peter', '2Pet': '2peter', '1John': '1john',
  '2John': '2john', '3John': '3john', Jude: 'jude', Rev: 'revelation',
};

/** Canonical 66-book order by VOTReader id (Matthew = matthew-plain). */
export const CANON_ORDER = [
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua',
  'judges', 'ruth', '1samuel', '2samuel', '1kings', '2kings', '1chronicles',
  '2chronicles', 'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'proverbs',
  'ecclesiastes', 'songofsolomon', 'isaiah', 'jeremiah', 'lamentations',
  'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah',
  'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi',
  'matthew-plain', 'mark', 'luke', 'john', 'acts', 'romans', '1corinthians',
  '2corinthians', 'galatians', 'ephesians', 'philippians', 'colossians',
  '1thessalonians', '2thessalonians', '1timothy', '2timothy', 'titus',
  'philemon', 'hebrews', 'james', '1peter', '2peter', '1john', '2john',
  '3john', 'jude', 'revelation',
];

/** Compact ruler abbreviations, index-aligned with CANON_ORDER. */
export const CANON_ABBREVS = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam',
  '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job',
  'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos',
  'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag',
  'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor',
  '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim',
  'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John',
  'Jude', 'Rev',
];

/** Span-bucket upper bounds (exclusive), in verses. Last bucket is open. */
export const SPAN_BUCKETS = [50, 500, 5000, Infinity];
/** Per-bucket ribbon segment counts (short arcs need few segments). */
export const BUCKET_SEGMENTS = [8, 16, 32, 48];
/** Density thresholds: Essential = votes >= 20, Classic = votes >= 10. */
export const DENSITY_TIERS = [20, 10];
/** Instances per culling chunk (extents recorded per chunk). */
export const CHUNK_SIZE = 256;

/**
 * Build the canonical verse table from loaded Format C corpora.
 * @param {Record<string, any>} booksById — BOOKS map (+ matthew-plain merged)
 * @returns {{ total:number, books:Array<{id:string,title:string,start:number}>,
 *   chapters:Array<[bookIdx:number, chapterNum:number, start:number, verses:number]>,
 *   chapterStart:Map<string, {start:number, verses:number}> }}
 */
export function buildVerseTable(booksById) {
  const books = [];
  const chapters = [];
  const chapterStart = new Map();
  let cursor = 0;
  for (let bi = 0; bi < CANON_ORDER.length; bi++) {
    const id = CANON_ORDER[bi];
    const book = booksById[id];
    if (!book) throw new Error(`canon book missing from corpus: ${id}`);
    books.push({ id, title: book.title || id, start: cursor });
    for (const ch of book.chapters || []) {
      let count = 0;
      let maxN = 0;
      for (const s of ch.sections || []) {
        for (const v of s.verses || []) { count++; if (v.n > maxN) maxN = v.n; }
      }
      // Verse ids are 1..maxN positional; a numbering gap still reserves its slot.
      const verses = Math.max(count, maxN);
      chapters.push([bi, ch.num, cursor, verses]);
      chapterStart.set(`${id}:${ch.num}`, { start: cursor, verses });
      cursor += verses;
    }
  }
  return { total: cursor, books, chapters, chapterStart };
}

/**
 * Parse one TSK ref like "Gen.1.1" → { bookId, chapter, verse } or null.
 * Range refs ("Gen.1.1-Gen.1.3") resolve to their START verse.
 */
export function parseTskRef(raw) {
  const first = String(raw).split('-')[0];
  const parts = first.split('.');
  if (parts.length !== 3) return null;
  const bookId = TSK_BOOK_IDS[parts[0]];
  const chapter = Number(parts[1]);
  const verse = Number(parts[2]);
  if (!bookId || !Number.isInteger(chapter) || !Number.isInteger(verse) || verse < 1) return null;
  return { bookId, chapter, verse };
}

/**
 * Resolve a parsed ref to a dense verse id against the canon table.
 * Verse numbers beyond the chapter's count (KJV vs NKJV versification edges)
 * clamp to the last verse and are reported via onClamp.
 * @returns {number} verse id, or -1 if the chapter doesn't exist.
 */
export function verseIdOf(ref, table, onClamp) {
  const ch = table.chapterStart.get(`${ref.bookId}:${ref.chapter}`);
  if (!ch) return -1;
  let v = ref.verse;
  if (v > ch.verses) { if (onClamp) onClamp(ref, ch.verses); v = ch.verses; }
  return ch.start + (v - 1);
}

/**
 * Parse the whole TSK TSV into deduped unordered verse pairs with max votes.
 * @param {string} text — cross_references.txt contents (header row included)
 * @param {object} table — buildVerseTable output
 * @returns {{ pairs: Array<[a:number,b:number,votes:number]>,
 *   stats: {rows:number, resolved:number, clamped:number, dropped:string[]} }}
 */
export function parseTsk(text, table) {
  const lines = text.split('\n');
  const stats = { rows: 0, resolved: 0, clamped: 0, dropped: [] };
  const onClamp = () => { stats.clamped++; };
  /** @type {Map<number, number>} packed pair key -> max votes */
  const seen = new Map();
  const PACK = table.total + 1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    stats.rows++;
    const fromRef = parseTskRef(cols[0]);
    const toRef = parseTskRef(cols[1]);
    const votes = Number(cols[2]);
    if (!fromRef || !toRef || !Number.isFinite(votes)) {
      stats.dropped.push(line.slice(0, 60));
      continue;
    }
    const a = verseIdOf(fromRef, table, onClamp);
    const b = verseIdOf(toRef, table, onClamp);
    if (a < 0 || b < 0 || a === b) {
      stats.dropped.push(line.slice(0, 60));
      continue;
    }
    stats.resolved++;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = lo * PACK + hi;
    const prev = seen.get(key);
    if (prev === undefined || votes > prev) seen.set(key, votes);
  }
  const pairs = [];
  for (const [key, votes] of seen) {
    pairs.push([Math.floor(key / PACK), key % PACK, votes]);
  }
  return { pairs, stats };
}

/** Span-bucket index for a pair. */
export function bucketOf(a, b) {
  const span = Math.abs(b - a);
  for (let i = 0; i < SPAN_BUCKETS.length; i++) if (span < SPAN_BUCKETS[i]) return i;
  return SPAN_BUCKETS.length - 1;
}

/**
 * Order pairs into the baked LOD/density layout:
 *   bucket asc → density tier (>=20, >=10, rest) → min verse asc.
 * Returns typed arrays plus per-bucket metadata: [off, len, off20, off10,
 * segments] where off20/off10 are counts (draw [off, off+off20) etc.), and
 * per-CHUNK_SIZE extents [minA, maxB] for viewport culling.
 */
export function layoutPairs(pairs) {
  const tierOf = (v) => (v >= DENSITY_TIERS[0] ? 0 : v >= DENSITY_TIERS[1] ? 1 : 2);
  const sorted = pairs.slice().sort((p, q) => {
    const bp = bucketOf(p[0], p[1]), bq = bucketOf(q[0], q[1]);
    if (bp !== bq) return bp - bq;
    const tp = tierOf(p[2]), tq = tierOf(q[2]);
    if (tp !== tq) return tp - tq;
    if (p[0] !== q[0]) return p[0] - q[0];
    if (p[1] !== q[1]) return p[1] - q[1];
    return p[2] - q[2];
  });
  const n = sorted.length;
  const from = new Uint16Array(n);
  const to = new Uint16Array(n);
  const votes = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    from[i] = sorted[i][0];
    to[i] = sorted[i][1];
    votes[i] = Math.max(-32768, Math.min(32767, sorted[i][2]));
  }
  const buckets = [];
  let i = 0;
  for (let bIdx = 0; bIdx < SPAN_BUCKETS.length; bIdx++) {
    const off = i;
    let off20 = 0, off10 = 0;
    while (i < n && bucketOf(from[i], to[i]) === bIdx) {
      const t = tierOf(votes[i]);
      if (t === 0) off20++;
      if (t <= 1) off10++;
      i++;
    }
    const len = i - off;
    const chunks = [];
    for (let c = off; c < off + len; c += CHUNK_SIZE) {
      const end = Math.min(c + CHUNK_SIZE, off + len);
      let mn = Infinity, mx = -Infinity;
      for (let k = c; k < end; k++) {
        if (from[k] < mn) mn = from[k];
        if (to[k] > mx) mx = to[k];
      }
      chunks.push([mn, mx]);
    }
    buckets.push({ off, len, off20, off10, segments: BUCKET_SEGMENTS[bIdx], chunks });
  }
  return { from, to, votes, buckets };
}

/**
 * Delta-encode a laid-out set for shipping: `from` becomes a per-bucket
 * running delta and `to` becomes a span. Both collapse to small integers with
 * low entropy, which gzip eats — measured 1.04 MB → 0.78 MB gz over raw ids.
 * Rendering is unaffected: the app prefix-sums once at load and draws the
 * reconstructed arrays (density filtering only ever draws sub-ranges).
 */
export function deltaEncode(layout) {
  const n = layout.from.length;
  const dfrom = new Uint16Array(n);
  const span = new Uint16Array(n);
  for (const b of layout.buckets) {
    for (const [start, len] of deltaRuns(b)) {
      let prev = 0;
      for (let i = start; i < start + len; i++) {
        dfrom[i] = layout.from[i] - prev;   // ascending within a run — never negative
        prev = layout.from[i];
        span[i] = layout.to[i] - layout.from[i];
      }
    }
  }
  return { dfrom, span };
}

/**
 * The runs `from` ascends within: one per DENSITY TIER inside each bucket.
 * `from` restarts at every tier boundary (the layout sorts bucket → tier → x),
 * so a per-bucket delta would go negative there and wrap in Uint16 — the bug
 * the schema gate caught. Emitted as [start, len] pairs.
 */
export function deltaRuns(bucket) {
  const { off, len, off20, off10 } = bucket;
  return [
    [off, off20],
    [off + off20, off10 - off20],
    [off + off10, len - off10],
  ].filter(([, l]) => l > 0);
}

/** Inverse of deltaEncode — the reference the app-side decoder must match. */
export function deltaDecode(dfrom, span, buckets) {
  const n = dfrom.length;
  const from = new Uint16Array(n);
  const to = new Uint16Array(n);
  for (const b of buckets) {
    for (const [start, len] of deltaRuns(b)) {
      let acc = 0;
      for (let i = start; i < start + len; i++) {
        acc += dfrom[i];
        from[i] = acc;
        to[i] = acc + span[i];
      }
    }
  }
  return { from, to };
}

/** Typed array → base64 (little-endian byte view). Chrome108-safe decode side. */
export function toBase64(typed) {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  let bin = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return Buffer.from(bin, 'binary').toString('base64');
}

/** base64 → Uint8Array — mirror of the app-side decode (for round-trip tests). */
export function fromBase64(b64) {
  const bin = Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Extract Matthew Study Bible votNotes as Bible→VOT edges.
 * @param {any} matthew — MATTHEW global (the Study Bible)
 * @param {object} table — verse table
 * @param {(vol:string, letterTitle:string) => {volKey:string, letterId:string}|null} resolveLetter
 * @returns {{ edges: Array<object>, unresolved: string[] }}
 */
export function extractVotNotes(matthew, table, resolveLetter) {
  const edges = [];
  const unresolved = [];
  for (const ch of matthew.chapters || []) {
    for (const note of (Array.isArray(ch.votNotes) ? ch.votNotes : Object.values(ch.votNotes || {}))) {
      // Only the LETTER is required. A few PDF rows name no volume at all
      // (the letter is not in a published one), and one points at an album
      // rather than a letter with `vol: null` — the caller's resolver knows
      // how to place both, exactly as the app does.
      if (!note || !note.letter) { if (note) unresolved.push(`votNote has no letter (ch ${ch.num})`); continue; }
      // ref is chapter-relative: "1:18-21" → chapter 1 verse 18. Title-keyed
      // strays (no parsable ref) anchor to the chapter's first verse.
      let chapter = ch.num, verse = 1;
      const m = /^(\d+):(\d+)/.exec(String(note.ref || ''));
      if (m) { chapter = Number(m[1]); verse = Number(m[2]); }
      const vid = verseIdOf({ bookId: 'matthew-plain', chapter, verse }, table, null);
      if (vid < 0) { unresolved.push(`votNote bad ref ${note.ref} (ch ${ch.num})`); continue; }
      const target = resolveLetter(note.vol, note.letter);
      if (!target) {
        // Not corruption — the Study Bible cites letters that were never
        // imported. See app/src/main/assets/src/data/vot-note-label.js.
        unresolved.push(
          `votNote cites a letter absent from the corpus: "${note.letter}" (Matthew ${note.ref})`);
        continue;
      }
      edges.push({ v: vid, kind: 'votNote', volKey: target.volKey, letterId: target.letterId });
    }
  }
  return { edges, unresolved };
}

/**
 * Extract Format A scripture footnotes as VOT→Bible edges.
 * @param {Array<any>} letters — one collection's letter array (incl. preface)
 * @param {string} volKey
 * @param {(ref:string) => {bookId:string, chapter:number, verse:number|null}|null} parseRef
 */
export function extractFootnoteEdges(letters, volKey, table, parseRef) {
  const edges = [];
  const unresolved = [];
  for (const letter of letters || []) {
    if (!letter || !letter.footnotes) continue;
    for (const fn of Object.values(letter.footnotes)) {
      if (!fn || fn.type !== 'scripture' || !fn.ref) continue;
      const p = parseRef(String(fn.ref));
      if (!p || !p.bookId) { unresolved.push(`${volKey}/${letter.id}: ${fn.ref}`); continue; }
      const vid = verseIdOf(
        { bookId: p.bookId, chapter: p.chapter, verse: p.verse == null ? 1 : p.verse },
        table, null
      );
      if (vid < 0) { unresolved.push(`${volKey}/${letter.id}: ${fn.ref}`); continue; }
      edges.push({ v: vid, kind: 'footnote', volKey, letterId: letter.id });
    }
  }
  return { edges, unresolved };
}

/**
 * Extract {{ref:...}} tokens from Format B paragraph text.
 * @returns {string[]} raw ref strings
 */
export function extractInlineRefs(text) {
  const out = [];
  const re = /\{\{ref:([^}]+)\}\}/g;
  let m;
  while ((m = re.exec(String(text))) !== null) out.push(m[1].trim());
  return out;
}
