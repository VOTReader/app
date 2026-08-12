/**
 * gen-scripture-web tests — the pure pipeline in tools/scripture-web-lib.mjs.
 *
 * These pin the contracts the renderer and the app-side decoder depend on:
 * the 66-book map (including the matthew-plain alias trap), verse-id round
 * trips against the real corpus, unordered dedupe with max-votes, the baked
 * bucket/density layout, and the delta encode/decode inverse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  TSK_BOOK_IDS, CANON_ORDER, CANON_ABBREVS, SPAN_BUCKETS, BUCKET_SEGMENTS,
  DENSITY_TIERS, CHUNK_SIZE, buildVerseTable, parseTskRef, verseIdOf,
  parseTsk, bucketOf, layoutPairs, deltaEncode, deltaDecode,
  toBase64, fromBase64, extractInlineRefs, extractVotNotes,
} from './scripture-web-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '..', 'app', 'src', 'main', 'assets', 'src', 'data');

let _table = null;
function corpusTable() {
  if (_table) return _table;
  const load = (file, name) => {
    const ctx = {};
    runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx, { filename: file });
    return ctx[name];
  };
  const BOOKS = load('books.js', 'BOOKS');
  const MATTHEW_PLAIN = load('matthew-plain.js', 'MATTHEW_PLAIN');
  const byId = {};
  for (const [key, book] of Object.entries(BOOKS)) byId[book.id || key] = book;
  byId['matthew-plain'] = MATTHEW_PLAIN;
  _table = buildVerseTable(byId);
  return _table;
}

describe('TSK book map', () => {
  it('covers all 66 books exactly once', () => {
    const ids = Object.values(TSK_BOOK_IDS);
    expect(ids).toHaveLength(66);
    expect(new Set(ids).size).toBe(66);
  });

  it('maps onto the canonical order with no strays', () => {
    expect(CANON_ORDER).toHaveLength(66);
    expect(new Set(Object.values(TSK_BOOK_IDS))).toEqual(new Set(CANON_ORDER));
  });

  it('pins the matthew alias trap: Matt -> matthew-plain, never matthew', () => {
    // `matthew` is the Study Bible, a different book object entirely. A graph
    // node addressed as `matthew` would route the reader to matthew-ch instead
    // of bible-ch. See tools/extract-bible-verses.mjs.
    expect(TSK_BOOK_IDS.Matt).toBe('matthew-plain');
    expect(Object.values(TSK_BOOK_IDS)).not.toContain('matthew');
    expect(CANON_ORDER).not.toContain('matthew');
  });

  it('keeps abbreviations index-aligned with the canon', () => {
    expect(CANON_ABBREVS).toHaveLength(CANON_ORDER.length);
    expect(CANON_ABBREVS[0]).toBe('Gen');
    expect(CANON_ABBREVS[39]).toBe('Matt');
    expect(CANON_ABBREVS[65]).toBe('Rev');
  });

  it('disambiguates the numbered books', () => {
    expect(TSK_BOOK_IDS['1Cor']).toBe('1corinthians');
    expect(TSK_BOOK_IDS['2Cor']).toBe('2corinthians');
    expect(TSK_BOOK_IDS['1John']).toBe('1john');
    expect(TSK_BOOK_IDS['3John']).toBe('3john');
    expect(TSK_BOOK_IDS.Song).toBe('songofsolomon');
  });
});

describe('parseTskRef', () => {
  it('parses a plain ref', () => {
    expect(parseTskRef('Gen.1.1')).toEqual({ bookId: 'genesis', chapter: 1, verse: 1 });
  });
  it('resolves a range to its START verse', () => {
    expect(parseTskRef('Gen.1.1-Gen.1.3')).toEqual({ bookId: 'genesis', chapter: 1, verse: 1 });
    expect(parseTskRef('Matt.5.3-Matt.5.12')).toEqual({ bookId: 'matthew-plain', chapter: 5, verse: 3 });
  });
  it('rejects malformed and unknown-book refs', () => {
    expect(parseTskRef('Gen.1')).toBeNull();
    expect(parseTskRef('Nope.1.1')).toBeNull();
    expect(parseTskRef('Gen.1.0')).toBeNull();
    expect(parseTskRef('')).toBeNull();
  });
});

describe('verse table (real corpus)', () => {
  it('is the whole canon: 66 books, 1189 chapters, 31102 verses', () => {
    const t = corpusTable();
    expect(t.books).toHaveLength(66);
    expect(t.chapters).toHaveLength(1189);
    expect(t.total).toBe(31102);
  });

  it('round-trips the canon endpoints and a deep interior verse', () => {
    const t = corpusTable();
    const id = (bookId, chapter, verse) => verseIdOf({ bookId, chapter, verse }, t, null);
    expect(id('genesis', 1, 1)).toBe(0);
    expect(id('revelation', 22, 21)).toBe(31101);
    // Psalm 119:176 — the longest chapter's last verse, a real interior probe
    const ps119 = t.chapterStart.get('psalms:119');
    expect(ps119.verses).toBe(176);
    expect(id('psalms', 119, 176)).toBe(ps119.start + 175);
  });

  it('clamps a verse past the chapter end and reports it', () => {
    const t = corpusTable();
    const clamps = [];
    const id = verseIdOf({ bookId: 'genesis', chapter: 1, verse: 999 }, t,
      (ref, max) => clamps.push(max));
    const gen1 = t.chapterStart.get('genesis:1');
    expect(id).toBe(gen1.start + gen1.verses - 1);
    expect(clamps).toEqual([gen1.verses]);
  });

  it('returns -1 for a chapter that does not exist', () => {
    const t = corpusTable();
    expect(verseIdOf({ bookId: 'jude', chapter: 2, verse: 1 }, t, null)).toBe(-1);
  });

  it('places Matthew at the New Testament boundary', () => {
    const t = corpusTable();
    const matt = t.books.find((b) => b.id === 'matthew-plain');
    const mal = t.books.find((b) => b.id === 'malachi');
    const malChapters = t.chapters.filter((c) => t.books[c[0]].id === 'malachi');
    const last = malChapters[malChapters.length - 1];
    expect(matt.start).toBe(last[2] + last[3]);
    expect(matt.start).toBeGreaterThan(mal.start);
  });
});

describe('parseTsk dedupe', () => {
  const t = () => corpusTable();

  it('collapses both directions of a pair and keeps the MAX votes', () => {
    const tsv = 'From Verse\tTo Verse\tVotes\n' +
      'Gen.1.1\tJohn.1.1\t5\n' +
      'John.1.1\tGen.1.1\t42\n';
    const { pairs, stats } = parseTsk(tsv, t());
    expect(pairs).toHaveLength(1);
    expect(pairs[0][2]).toBe(42);
    expect(stats.rows).toBe(2);
    expect(stats.resolved).toBe(2);
  });

  it('stores pairs low-id first regardless of source direction', () => {
    const tsv = 'h\n' + 'Rev.22.21\tGen.1.1\t3\n';
    const { pairs } = parseTsk(tsv, t());
    expect(pairs[0][0]).toBe(0);
    expect(pairs[0][1]).toBe(31101);
  });

  it('drops self-references and unparseable rows without throwing', () => {
    const tsv = 'h\n' +
      'Gen.1.1\tGen.1.1\t9\n' +
      'Bogus.1.1\tGen.1.2\t9\n' +
      'Gen.1.1\t\t9\n' +
      'Gen.1.1\tGen.1.2\tnotanumber\n';
    const { pairs, stats } = parseTsk(tsv, t());
    expect(pairs).toHaveLength(0);
    expect(stats.dropped).toHaveLength(4);
  });

  it('keeps negative votes intact (they are real signal, not corruption)', () => {
    const tsv = 'h\n' + 'Gen.1.1\tJohn.1.1\t-12\n';
    const { pairs } = parseTsk(tsv, t());
    expect(pairs[0][2]).toBe(-12);
  });
});

describe('bucket + density layout', () => {
  it('assigns span buckets at the documented boundaries', () => {
    expect(bucketOf(0, 49)).toBe(0);
    expect(bucketOf(0, 50)).toBe(1);
    expect(bucketOf(0, 499)).toBe(1);
    expect(bucketOf(0, 500)).toBe(2);
    expect(bucketOf(0, 4999)).toBe(2);
    expect(bucketOf(0, 5000)).toBe(3);
    expect(bucketOf(31101, 0)).toBe(3);   // order-independent
  });

  it('orders by bucket, then density tier, and records tier counts', () => {
    const pairs = [
      [0, 10, 1],      // bucket 0, tier 2 (rest)
      [0, 11, 25],     // bucket 0, tier 0 (>=20)
      [0, 12, 12],     // bucket 0, tier 1 (>=10)
      [0, 9000, 30],   // bucket 3, tier 0
    ];
    const out = layoutPairs(pairs);
    const b0 = out.buckets[0];
    expect(b0.len).toBe(3);
    expect(b0.off20).toBe(1);
    expect(b0.off10).toBe(2);          // cumulative: tier0 + tier1
    expect(out.votes[b0.off]).toBe(25);
    expect(out.votes[b0.off + 1]).toBe(12);
    expect(out.votes[b0.off + 2]).toBe(1);
    expect(out.buckets[3].len).toBe(1);
  });

  it('gives every bucket its segment count and chunk extents', () => {
    const pairs = Array.from({ length: CHUNK_SIZE + 5 }, (_, i) => [i, i + 5, 1]);
    const out = layoutPairs(pairs);
    expect(out.buckets.map((b) => b.segments)).toEqual(BUCKET_SEGMENTS);
    expect(out.buckets[0].chunks).toHaveLength(2);
    for (const [mn, mx] of out.buckets[0].chunks) expect(mx).toBeGreaterThanOrEqual(mn);
  });

  it('exposes the density thresholds the UI advertises', () => {
    expect(DENSITY_TIERS).toEqual([20, 7]);
    expect(SPAN_BUCKETS).toHaveLength(BUCKET_SEGMENTS.length);
  });
});

describe('delta encoding', () => {
  it('round-trips exactly through deltaEncode/deltaDecode', () => {
    const pairs = [
      [0, 10, 1], [3, 20, 5], [3, 400, 2], [100, 9000, 30], [12000, 30000, 7],
    ];
    const layout = layoutPairs(pairs);
    const { dfrom, span } = deltaEncode(layout);
    const back = deltaDecode(dfrom, span, layout.buckets);
    expect(Array.from(back.from)).toEqual(Array.from(layout.from));
    expect(Array.from(back.to)).toEqual(Array.from(layout.to));
  });

  it('survives base64 transit (the shipping path)', () => {
    const pairs = [[0, 10, 1], [5, 600, 22], [900, 20000, 3]];
    const layout = layoutPairs(pairs);
    const { dfrom, span } = deltaEncode(layout);
    const rt = (typed, Ctor) => {
      const bytes = fromBase64(toBase64(typed));
      return new Ctor(bytes.buffer, bytes.byteOffset, typed.length);
    };
    const back = deltaDecode(
      rt(dfrom, Uint16Array), rt(span, Uint16Array), layout.buckets
    );
    expect(Array.from(back.from)).toEqual(Array.from(layout.from));
    expect(Array.from(back.to)).toEqual(Array.from(layout.to));
    expect(Array.from(rt(layout.votes, Int16Array))).toEqual(Array.from(layout.votes));
  });

  it('round-trips across DENSITY-TIER boundaries inside one bucket', () => {
    // `from` restarts at each tier boundary, so a per-bucket delta goes
    // negative there and wraps in Uint16 — this is the bug the schema gate
    // caught after the per-bucket version passed the naive round-trip.
    const pairs = [
      [9000, 9010, 50], [9500, 9510, 30],     // tier 0 (>=20), high x
      [10, 20, 15], [30, 40, 11],             // tier 1 (>=10), x RESTARTS low
      [5, 15, 1], [7, 17, 2],                 // tier 2 (rest), x restarts again
    ];
    const layout = layoutPairs(pairs);
    const { dfrom, span } = deltaEncode(layout);
    const back = deltaDecode(dfrom, span, layout.buckets);
    expect(Array.from(back.from)).toEqual(Array.from(layout.from));
    expect(Array.from(back.to)).toEqual(Array.from(layout.to));
    // and no delta silently wrapped on the way
    for (let i = 0; i < dfrom.length; i++) expect(dfrom[i]).toBeLessThan(0x8000);
  });

  it('keeps every delta inside Uint16 range on the real layout', () => {
    // A delta that overflowed would silently corrupt every later arc in its
    // bucket, so this is the guard that makes the encoding safe.
    const pairs = [[0, 31101, 1], [31000, 31101, 1], [1, 2, 1]];
    const layout = layoutPairs(pairs);
    const { dfrom, span } = deltaEncode(layout);
    for (let i = 0; i < dfrom.length; i++) {
      expect(dfrom[i]).toBeLessThanOrEqual(0xffff);
      expect(span[i]).toBeLessThanOrEqual(0xffff);
    }
  });
});

describe('corpus edge extraction', () => {
  it('pulls every {{ref:}} token out of Format B text', () => {
    const text = 'Plain {{ref:Matthew 4:4}} and {{ref:Isaiah 40:13; Romans 11:34}} end.';
    expect(extractInlineRefs(text)).toEqual(['Matthew 4:4', 'Isaiah 40:13; Romans 11:34']);
    expect(extractInlineRefs('no refs here')).toEqual([]);
  });

  it('anchors a votNote to its chapter-relative ref and resolves the letter', () => {
    const t = corpusTable();
    const matthew = { chapters: [{ num: 1, votNotes: [
      { ref: '1:18-21', vol: 'Volume Two', letter: 'Some Letter' },
    ] }] };
    const { edges } = extractVotNotes(matthew, t,
      () => ({ volKey: 'two', letterId: 'some-letter' }));
    expect(edges).toHaveLength(1);
    expect(edges[0].volKey).toBe('two');
    expect(edges[0].kind).toBe('votNote');
    expect(edges[0].v).toBe(verseIdOf({ bookId: 'matthew-plain', chapter: 1, verse: 18 }, t, null));
  });

  it('consults the resolver for a note whose vol is null (the album row)', () => {
    // ch5's note points at The Blessed as an ALBUM, so the PDF gives it no
    // volume and the importer stored `vol: null`. Requiring `vol` here made
    // the generator drop an edge the app itself resolves.
    const t = corpusTable();
    const matthew = { chapters: [{ num: 5, votNotes: [
      { ref: '5:1-11', vol: null, letter: 'The Blessed: More Declarations…' },
    ] }] };
    const seen = [];
    const { edges, unresolved } = extractVotNotes(matthew, t, (vol, letter) => {
      seen.push([vol, letter]);
      return { volKey: 'blessed', letterId: 'introduction' };
    });
    expect(seen).toEqual([[null, 'The Blessed: More Declarations…']]);
    expect(edges).toHaveLength(1);
    expect(edges[0].letterId).toBe('introduction');
    expect(unresolved).toHaveLength(0);
  });

  it('names the letter when a note cites one the corpus does not carry', () => {
    // These are real: the Study Bible cites letters that were never imported.
    // The message must say so, not read like data corruption.
    const t = corpusTable();
    const matthew = { chapters: [{ num: 26, votNotes: [
      { ref: '26:28', vol: 'The Promise', letter: 'The Promise' },
    ] }] };
    const { edges, unresolved } = extractVotNotes(matthew, t, () => null);
    expect(edges).toHaveLength(0);
    expect(unresolved[0]).toContain('absent from the corpus');
    expect(unresolved[0]).toContain('The Promise');
    expect(unresolved[0]).toContain('26:28');
  });

  it('reports an unresolvable votNote instead of inventing a target', () => {
    const t = corpusTable();
    const matthew = { chapters: [{ num: 10, votNotes: [
      { ref: '10:9', vol: 'Nowhere', letter: 'Nothing' },
    ] }] };
    const { edges, unresolved } = extractVotNotes(matthew, t, () => null);
    expect(edges).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
  });
});
