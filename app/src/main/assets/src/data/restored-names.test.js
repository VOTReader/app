// @ts-nocheck — vm-loads the generated data files
/* Restored-Name NT overlays (bible-rnkjv.js / bible-rkjv.js) — data integrity.
   The overlays are GENERATED (tools/gen-restored-nt.mjs); this suite pins the
   contract the generator must keep: NT-only, sparse (changed verses only, every
   one a real change over its source), no un-restored Name token left behind,
   non-Lord bearers untouched, and the hand-adjudicated exception verses
   (RESTORED-NAMES-PLAN.txt) rendered exactly as decided. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const dataDir = dirname(fileURLToPath(import.meta.url));
function loadVar(file, varName) {
  const sb = {}; sb.window = sb;
  runInNewContext(readFileSync(resolve(dataDir, file), 'utf8'), sb, { filename: file });
  return sb[varName];
}

const rnkjvMap = loadVar('bible-rnkjv.js', 'BIBLE_RNKJV');
const rkjvMap = loadVar('bible-rkjv.js', 'BIBLE_RKJV');
const kjvRef = loadVar('bible-kjv.js', 'BIBLE_KJV');
const BOOKS = loadVar('books.js', 'BOOKS');
const MATTHEW_PLAIN = loadVar('matthew-plain.js', 'MATTHEW_PLAIN');

const ntBooks = new Set(['matthew-plain','mark','luke','john','acts','romans','1corinthians','2corinthians','galatians','ephesians','philippians','colossians','1thessalonians','2thessalonians','1timothy','2timothy','titus','philemon','hebrews','james','1peter','2peter','1john','2john','3john','jude','revelation']);

function verseOf(map, bookId, ch, n) {
  const arr = map[bookId] && map[bookId][ch];
  const v = arr && arr.find((x) => x.n === n);
  return v ? v.text : undefined;
}
function nkjvSource(bookId, ch, n) {
  const b = bookId === 'matthew-plain' ? MATTHEW_PLAIN : BOOKS[bookId];
  for (const c of b.chapters) {
    if (String(c.num) !== String(ch)) continue;
    for (const s of c.sections) { const v = s.verses.find((x) => x.n === n); if (v) return v.text; }
  }
  return undefined;
}
function* overlayVerses(map) {
  for (const bookId of Object.keys(map)) {
    for (const ch of Object.keys(map[bookId])) {
      for (const v of map[bookId][ch]) yield { bookId, ch, n: v.n, text: v.text };
    }
  }
}

describe('Restored-Name overlays — structure', () => {
  it('carry only New Testament books (OT untouched, out of scope)', () => {
    for (const k of Object.keys(rnkjvMap)) expect(ntBooks.has(k), `rnkjv book ${k}`).toBe(true);
    for (const k of Object.keys(rkjvMap)) expect(ntBooks.has(k), `rkjv book ${k}`).toBe(true);
  });

  it('every overlay verse exists in its source and really differs (no no-op entries)', () => {
    for (const v of overlayVerses(rnkjvMap)) {
      const src = nkjvSource(v.bookId, v.ch, v.n);
      expect(src, `rnkjv ${v.bookId} ${v.ch}:${v.n} missing in NKJV source`).toBeDefined();
      expect(v.text, `rnkjv ${v.bookId} ${v.ch}:${v.n} identical to source`).not.toBe(src);
    }
    for (const v of overlayVerses(rkjvMap)) {
      const src = verseOf(kjvRef, v.bookId, v.ch, v.n);
      expect(src, `rkjv ${v.bookId} ${v.ch}:${v.n} missing in KJV source`).toBeDefined();
      expect(v.text, `rkjv ${v.bookId} ${v.ch}:${v.n} identical to source`).not.toBe(src);
    }
  });

  it('changed-verse totals are exactly the generated set (a drift means: rerun the generator deliberately)', () => {
    let n1 = 0; for (const _ of overlayVerses(rnkjvMap)) n1++;
    let n2 = 0; for (const _ of overlayVerses(rkjvMap)) n2++;
    expect(n1).toBe(1212);
    expect(n2).toBe(1217);
  });
});

describe('Restored-Name overlays — no Name token left behind', () => {
  it('no un-protected Jesus/Christ/Messias/Messiah remains in any restored verse', () => {
    for (const [label, map] of [['rnkjv', rnkjvMap], ['rkjv', rkjvMap]]) {
      for (const v of overlayVerses(map)) {
        const stripped = v.text
          .replace(/Bar[-–][Jj]esus\b/g, '')
          .replace(/[Aa]ntichrists?\b/g, '')
          .replace(/Christians?\b/g, '')
          .replace(/false [Mm]essiahs\b/g, '');
        expect(
          /Jesus|JESUS|Christ|\bchrists?\b|Messias|Messiah/.test(stripped),
          `${label} ${v.bookId} ${v.ch}:${v.n} still carries a token: ${v.text}`
        ).toBe(false);
      }
    }
  });

  it('non-Lord bearers stay untouched: Bar-Jesus and Jesus-called-Justus verses are NOT in the overlays', () => {
    expect(verseOf(rnkjvMap, 'acts', '13', 6)).toBeUndefined();
    expect(verseOf(rkjvMap, 'acts', '13', 6)).toBeUndefined();
    expect(verseOf(rnkjvMap, 'colossians', '4', 11)).toBeUndefined();
    expect(verseOf(rkjvMap, 'colossians', '4', 11)).toBeUndefined();
  });
});

describe('Restored-Name overlays — golden verses', () => {
  it('the Name pair: Matthew 1:1', () => {
    expect(verseOf(rnkjvMap, 'matthew-plain', '1', 1)).toBe('The book of the genealogy of YahuShua HaMashiach, the Son of David, the Son of Abraham:');
    expect(verseOf(rkjvMap, 'matthew-plain', '1', 1)).toContain('YahuShua HaMashiach');
  });
  it('the naming verses keep their capitals: "call His name YAHUSHUA" (Matt 1:21)', () => {
    expect(verseOf(rnkjvMap, 'matthew-plain', '1', 21)).toContain('call His name YAHUSHUA');
    expect(verseOf(rkjvMap, 'matthew-plain', '1', 21)).toContain('call his name YAHUSHUA');
  });
  it('the cross inscription (John 19:19)', () => {
    expect(verseOf(rnkjvMap, 'john', '19', 19)).toContain('YAHUSHUA OF NAZARETH');
    expect(verseOf(rkjvMap, 'john', '19', 19)).toContain('YAHUSHUA OF NAZARETH');
  });
  it('articular title absorbs the article: "You are HaMashiach" (Matt 16:16)', () => {
    expect(verseOf(rnkjvMap, 'matthew-plain', '16', 16)).toContain('You are HaMashiach, the Son of the living God');
    expect(verseOf(rkjvMap, 'matthew-plain', '16', 16)).toContain('Thou art HaMashiach');
  });
  it('Hebrew possessive suffix takes NO article: "His Mashiach" (Acts 4:26; Rev 11:15, 12:10), "the Lord’s Mashiach" (Luke 2:26)', () => {
    expect(verseOf(rnkjvMap, 'acts', '4', 26)).toContain('His Mashiach');
    expect(verseOf(rkjvMap, 'acts', '4', 26)).toContain('his Mashiach');
    expect(verseOf(rnkjvMap, 'revelation', '12', 10)).toContain('His Mashiach');
    expect(verseOf(rnkjvMap, 'luke', '2', 26)).toMatch(/Lord['’]s Mashiach/);
    expect(verseOf(rkjvMap, 'luke', '2', 26)).toMatch(/Lord['’]s Mashiach/);
  });
  it('John’s glosses render by meaning, not circularly (John 1:41, 4:25)', () => {
    const j141 = verseOf(rnkjvMap, 'john', '1', 41);
    expect(j141).toContain('the Mashiach');
    expect(j141).toContain('the Anointed');
    expect(verseOf(rkjvMap, 'john', '1', 41)).toContain('being interpreted, the Anointed');
    expect(verseOf(rnkjvMap, 'john', '4', 25)).toContain('who is called the Anointed');
    expect(verseOf(rkjvMap, 'john', '4', 25)).toContain('Mashiach cometh');
  });
  it('anarthrous Hebrew predicate: "both Lord and Mashiach" (Acts 2:36)', () => {
    expect(verseOf(rnkjvMap, 'acts', '2', 36)).toContain('both Lord and Mashiach');
    expect(verseOf(rkjvMap, 'acts', '2', 36)).toContain('both Lord and Mashiach');
  });
  it('"who/which is called Mashiach" — bare after a naming verb (Matt 1:16, 27:17, 27:22)', () => {
    expect(verseOf(rnkjvMap, 'matthew-plain', '27', 17)).toContain('YahuShua who is called Mashiach');
    expect(verseOf(rkjvMap, 'matthew-plain', '27', 17)).toContain('YahuShua which is called Mashiach');
  });
  it('KJV’s Joshua-referent verses read Joshua, matching the NKJV (Acts 7:45, Heb 4:8)', () => {
    expect(verseOf(rkjvMap, 'acts', '7', 45)).toContain('with Joshua into');
    expect(verseOf(rkjvMap, 'hebrews', '4', 8)).toContain('if Joshua had');
    // NKJV already says Joshua — nothing to change, so the verses are absent
    expect(verseOf(rnkjvMap, 'acts', '7', 45)).toBeUndefined();
    expect(verseOf(rnkjvMap, 'hebrews', '4', 8)).toBeUndefined();
  });
  it('pseudochristoi are generic: "false messiahs" (Matt 24:24; Mark 13:22)', () => {
    expect(verseOf(rnkjvMap, 'matthew-plain', '24', 24)).toContain('false messiahs');
    expect(verseOf(rkjvMap, 'matthew-plain', '24', 24)).toContain('false Messiahs');
  });
  it('antichrist and Christian are NOT restored (VOT corpus uses both as-is)', () => {
    expect(verseOf(rnkjvMap, '1john', '2', 22)).toContain('antichrist');
    expect(verseOf(rnkjvMap, '1john', '2', 22)).toContain('YahuShua is HaMashiach');
    // Acts 11:26 "called Christians" — the verse contains "Christians" untouched
    const a1126 = verseOf(rnkjvMap, 'acts', '11', 26);
    if (a1126 !== undefined) expect(a1126).toContain('Christians');
  });
  it('possessive of the Name: "YahuShua’s feet" (Luke 8:41 kjvRef)', () => {
    expect(verseOf(rkjvMap, 'luke', '8', 41)).toMatch(/YahuShua['’]s? feet/);
  });
  it('Pauline "Christ Jesus" is rendered in the commanded order of the Name (Rom 8:39)', () => {
    expect(verseOf(rnkjvMap, 'romans', '8', 39)).toContain('YahuShua HaMashiach our Lord');
  });
});
