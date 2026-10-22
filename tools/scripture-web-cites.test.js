/**
 * scripture-web-cites tests — the Volumes' own citations of scripture
 * (tools/scripture-web-cites.mjs), the generator half of the Scripture Web's
 * "Cited in the Volumes".
 *
 * What they pin: every place a verse is cited becomes one SITE carrying its
 * anchor (the block a reader lands on, plus the footnote number, the r-th
 * inline reference, or the span a Study Bible note quotes); sites group one
 * entry per letter and one edge per (verse, letter), so the edge count does
 * not move with how often a letter repeats itself; the shipped encodings
 * round-trip through the app's own decoder; Hidden Manna never appears; and
 * the shipped asset is exactly what the corpus generates (the freshness gate).
 *
 * Fixtures: the real verse table and the app's real reference parser for
 * every verse id, real letters for the quotation matcher (Living Sacrifices,
 * I Can Wait No Longer, the Words To Live By introduction, the whole Holy
 * Days album), small synthetic letters where a behaviour needs isolating.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVerseTable } from './scripture-web-lib.mjs';
import {
  KIND, formatABlocks, blockTexts, locateQuote, trailingRef, verseSpan, makeRefParts,
  extractCites, holyDaysMirrors, targetKey, groupCites, encodeCites, encodeStudyLinks,
  shortStudyTitle,
} from './scripture-web-cites.mjs';
import {
  expandCites, expandStudyLinks, excerptFor, siteCite, CITE_KINDS,
} from '../app/src/main/assets/src/utils/scripture-web/vot-citations.js';
import { COLLECTIONS, splitCompoundRef, findBook } from '../app/src/main/assets/src/data/scripture-resolution.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = resolve(ROOT, 'app', 'src', 'main', 'assets', 'src', 'data');

/** One data file's globals. */
function load(file) {
  const ctx = {};
  runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx, { filename: file });
  return ctx;
}

let _env = null;
/** The real verse table and reference parser, built once. */
function env() {
  if (_env) return _env;
  const { BOOKS } = load('books.js');
  const { MATTHEW_PLAIN } = load('matthew-plain.js');
  const byId = {};
  for (const [key, book] of Object.entries(BOOKS)) byId[book.id || key] = book;
  byId['matthew-plain'] = MATTHEW_PLAIN;
  // findBook reads window.__ALL_BOOKS at call time (the generator's shim too)
  window.__ALL_BOOKS = byId;
  const table = buildVerseTable(byId);
  const refParts = makeRefParts(splitCompoundRef, findBook);
  const vid = (bookId, ch, v) => table.chapterStart.get(`${bookId}:${ch}`).start + v - 1;
  _env = { table, refParts, vid };
  return _env;
}

/* ── the reference parser and verse spans ─────────────────────────────── */

describe('makeRefParts: the app parser, compound-aware', () => {
  it('reads a verse, a range, a compound list (book carried) and the Study Bible Matthew', () => {
    const { refParts } = env();
    expect(refParts('Psalm 2:12')).toEqual([{ bookId: 'psalms', chapter: 2, verse: 12, verseEnd: null }]);
    expect(refParts('John 3:16-17')).toEqual([{ bookId: 'john', chapter: 3, verse: 16, verseEnd: 17 }]);
    const compound = refParts('Matthew 11:7, 10');
    expect(compound.map((p) => [p.bookId, p.chapter, p.verse])).toEqual([['matthew-plain', 11, 7], ['matthew-plain', 11, 10]]);
  });

  it('trims a leading gloss and a bare translation tag, and gives [] for prose', () => {
    const { refParts } = env();
    expect(refParts('(which means "God with us") - Matthew 1:23').map((p) => [p.bookId, p.chapter, p.verse]))
      .toEqual([['matthew-plain', 1, 23]]);
    expect(refParts('Amos 3:7 CJB').map((p) => [p.bookId, p.chapter, p.verse])).toEqual([['amos', 3, 7]]);
    expect(refParts('not a reference at all')).toEqual([]);
  });
});

describe('verseSpan: the verse ids a reference covers', () => {
  it('a verse, a range, a whole chapter', () => {
    const { table, vid } = env();
    expect(verseSpan({ bookId: 'psalms', chapter: 2, verse: 12, verseEnd: null }, table)).toEqual([vid('psalms', 2, 12), vid('psalms', 2, 12)]);
    expect(verseSpan({ bookId: 'john', chapter: 3, verse: 16, verseEnd: 17 }, table)).toEqual([vid('john', 3, 16), vid('john', 3, 17)]);
    expect(verseSpan({ bookId: 'psalms', chapter: 117, verse: null, verseEnd: null }, table)).toEqual([vid('psalms', 117, 1), vid('psalms', 117, 2)]);
  });

  it('clamps a verse or range end past the chapter, and knows no unknown chapter', () => {
    const { table, vid } = env();
    expect(verseSpan({ bookId: 'psalms', chapter: 117, verse: 9, verseEnd: null }, table)).toEqual([vid('psalms', 117, 2), vid('psalms', 117, 2)]);
    expect(verseSpan({ bookId: 'psalms', chapter: 117, verse: 1, verseEnd: 40 }, table)).toEqual([vid('psalms', 117, 1), vid('psalms', 117, 2)]);
    expect(verseSpan({ bookId: 'psalms', chapter: 151, verse: 1, verseEnd: null }, table)).toBe(null);
  });
});

/* ── blocks and quotations ────────────────────────────────────────────── */

const text = (v) => ({ t: 'text', v });
const fnm = (v) => ({ t: 'fn', v });
const para = (...segments) => ({ type: 'para', segments });

describe('formatABlocks / blockTexts', () => {
  it('walks blocks in order and reaches inside a prophecy group by [part, index]', () => {
    const entry = {
      blocks: [
        para(text('Before.')),
        { type: 'prophecy-group', label: 'G', intro: [para(text('Intro.'))],
          ot: { blocks: [para(text('Old one.')), para(text('Old two.'))] }, nt: { blocks: [para(text('New.'))] } },
        null,
        para(text('After.')),
      ],
    };
    expect([...formatABlocks(entry)].map((x) => [x.p, x.sub])).toEqual([
      [0, null], [1, ['intro', 0]], [1, ['ot', 0]], [1, ['ot', 1]], [1, ['nt', 0]], [3, null],
    ]);
    expect(blockTexts(entry).map((x) => x.text)).toEqual(['Before.', 'Intro.', 'Old one.', 'Old two.', 'New.', 'After.']);
    expect(blockTexts(entry)).toBe(blockTexts(entry)); // computed once per entry
  });

  it('reads a Format B entry paragraph by paragraph', () => {
    const entry = { paragraphs: [{ text: '**Bold** words.' }, { text: 'It is written. {{ref:Matthew 4:4}}' }] };
    expect(blockTexts(entry).map((x) => [x.p, x.sub, x.text])).toEqual([[0, null, 'Bold words.'], [1, null, 'It is written. ']]);
    expect(blockTexts(null)).toEqual([]);
  });
});

describe('locateQuote: where a Study Bible note\'s quotation sits in its letter (real letters)', () => {
  const { LETTERS } = load('volume-two.js');
  const { LETTERS_V7 } = load('volume-seven.js');
  const { WTLB_ONE } = load('wtlb-one.js');
  const livingSacrifices = LETTERS.find((l) => l.id === 'living-sacrifices');
  const canWait = LETTERS_V7.find((l) => l.id === 'i-can-wait-no-longer');
  const quoted = (entry, q) => blockTexts(entry).find((x) => x.p === q.p && !x.sub).text.slice(q.o, q.o + q.n);

  it('finds a whole quotation by its words, whatever its punctuation (Matthew 5:16 -> Living Sacrifices)', () => {
    // the note reads "So then walk in My ways, and be"; the letter "So then, walk in My ways and be"
    const q = locateQuote(livingSacrifices,
      'So then walk in My ways, and be for Me examples, letting your light so shine before men, that they may see your good works and glorify your Father in Heaven, as it is written.');
    expect(q).toMatchObject({ p: 2, sub: null, whole: true });
    expect(quoted(livingSacrifices, q)).toMatch(/^So then, walk in My ways and be for Me examples/);
    expect(quoted(livingSacrifices, q)).toMatch(/as it is written\.$/);
  });

  it('a quotation that runs past its paragraph lands on its opening words (Matthew 16:24-27)', () => {
    const q = locateQuote(livingSacrifices,
      'For I tell you the truth, to walk where The Son of God walks, you must become like Me–crucifying your lives of old, separating yourselves from the bitter enmity which is of this world and the churches of men, living sacrifices who seek to please The Father in all their ways. For it is written: If anyone desires to come after Me, let him deny himself and take up his cross, and follow Me. For whoever desires to save his life will lose it, but whoever loses his life for My sake will find it. For what profit is it to a man if he gains the whole world, and loses his own soul? Or what will a man give in exchange for his soul? Therefore those who strive to hold onto their life in this world will lose it, having already become dead men’s bones in a wasteland of many sorrows, leading and following others on the wide path to destruction.');
    expect(q).toMatchObject({ p: 2, whole: false });
    expect(quoted(livingSacrifices, q)).toMatch(/^For I tell you the truth, to walk where The Son of God walks/);
  });

  it('a quotation that runs across blocks is found by its first sentence (Matthew 24:7-9 -> I Can Wait No Longer)', () => {
    const q = locateQuote(canWait,
      'I CAN WAIT NO LONGER! For the cries of the oppressed and of the hungry and of every starving child have reached deep into the ears of The Lord of Hosts! For My beloved are murdered in every corner.');
    expect(q).toMatchObject({ p: 2, o: 0 });
    expect(quoted(canWait, q)).toMatch(/^I CAN WAIT NO LONGER!/);
  });

  it('works on Format B, across its line breaks (Words To Live By, Introduction)', () => {
    const intro = WTLB_ONE.find((e) => e.id === 'introduction');
    const q = locateQuote(intro, 'Man shall not live by bread alone, but by every word that proceeds from the mouth of God.');
    expect(q).toMatchObject({ p: 2, whole: true });
  });

  it('uses the first passage of an ellipsis-joined quotation; gives null for words not there or too few', () => {
    const q = locateQuote(livingSacrifices, 'letting your light so shine before men … words that this letter does not hold');
    expect(q).toMatchObject({ p: 2 });
    expect(quoted(livingSacrifices, q)).toMatch(/^letting your light so shine before men/);
    expect(locateQuote(livingSacrifices, 'these particular words are not anywhere in that letter')).toBe(null);
    expect(locateQuote(livingSacrifices, 'So then')).toBe(null);
    expect(locateQuote(null, 'So then, walk in My ways')).toBe(null);
  });
});

describe('trailingRef: a Bible Study quotation\'s plain " - Book C:V" source line', () => {
  it('reads the reference and spans the quotation before the dash', () => {
    const { refParts } = env();
    const t = 'Kiss The Son, lest He be angry. - Psalm 2:12';
    expect(trailingRef(t, refParts)).toEqual({ raw: 'Psalm 2:12', o: 0, n: t.indexOf(' - ') });
    expect(trailingRef('Prepare the way of The Lord. - Isaiah 40:3-5 (NKJV)', refParts)).toMatchObject({ raw: 'Isaiah 40:3-5' });
    expect(trailingRef('What did you go out to see? - Matthew 11:7, 10', refParts)).toMatchObject({ raw: 'Matthew 11:7, 10' });
  });

  it('is not fooled by prose after a dash, a label, or a line without one', () => {
    const { refParts } = env();
    expect(trailingRef('He is risen - and death is beaten 3 times', refParts)).toBe(null);
    expect(trailingRef('From the letter - Volume Two', refParts)).toBe(null);
    expect(trailingRef('Kiss The Son, lest He be angry.', refParts)).toBe(null);
    expect(trailingRef('', refParts)).toBe(null);
  });
});

/* ── extracting every site ────────────────────────────────────────────── */

/** A small corpus that exercises every pass of extractCites. */
function fixture() {
  const { table, refParts } = env();
  const alpha = {
    id: 'alpha', title: 'Alpha',
    blocks: [
      para(text('The opening of the letter.'), fnm('5')),
      para(text('Kiss The Son, lest He be angry.'), fnm('1'), text(' For God so loved the world.'), fnm('2')),
      { type: 'closing-fn', segments: [fnm('3')] },
    ],
    footnotes: {
      1: { type: 'scripture', ref: 'Psalm 2:12' },
      2: { type: 'scripture', ref: 'John 3:16-17' },
      3: { type: 'scripture', ref: 'Revelation 1:8' },
      4: { type: 'scripture', ref: 'Genesis 1:1' },     // no block marks it
      5: { type: 'scripture', ref: 'Nowhere 9:9' },     // marked, unreadable
      6: { type: 'note', text: 'An aside, not scripture.' },
    },
  };
  const beta = {
    id: 'beta', title: 'Beta',
    blocks: [
      para(text('First words of beta.')),
      para(text('So then, walk in My ways and be for Me examples, letting your light so shine before men.'), fnm('1')),
    ],
    footnotes: { 1: { type: 'scripture', ref: 'Matthew 5:16' } },
  };
  const gamma = { id: 'gamma', title: 'Gamma', blocks: [para(text('Blessed are the poor in spirit, says The Lord.'))] };
  const secret = { id: 'secret', title: 'Secret', blocks: [para(text('Hidden words.'), fnm('1'))], footnotes: { 1: { type: 'scripture', ref: 'Psalm 23:1' } } };
  const devotion = {
    id: 'devotion', title: 'Devotion',
    paragraphs: [
      { text: 'It is written: Man shall not live by bread alone. {{ref:Matthew 4:4}} And again: {{ref:Deuteronomy 8:3}}' },
      { text: 'No references here.' },
      { text: 'A bad one {{ref:Nowhere 1:1}}' },
    ],
  };
  const link = (letterId, screen, collection, letterTitle) => ({
    t: 'letter-link', ...(letterId ? { letterId } : {}), screen, label: `"${letterTitle}" - ${collection}`,
    link: { collection, letterTitle },
  });
  const studies = [{
    id: 'st', title: 'A Study: Its Subtitle',
    chapters: [{
      id: 'st-ch1', title: 'Chapter One',
      blocks: [
        para(text('Your throne, O God, is forever. - {{ref:Psalm 45:6}}'), fnm('1')),
        para(text('Prepare the way of The Lord. - Isaiah 40:3-5')),
        { type: 'prophecy-group', label: 'The Forerunner', intro: [para(text('Intro words.'))],
          ot: { blocks: [para(text('Behold, I send My messenger. - Malachi 3:1'))] },
          nt: { blocks: [para(text('This is he who was spoken of. - {{ref:Matthew 3:3}}'))] } },
        para(text('An excerpt from '), link('alpha', 'vot-letter', 'Volume Two', 'Alpha'), text(' and again '), link('alpha', 'vot-letter', 'Volume Two', 'Alpha')),
        para(text('And '), link('gamma', 'vot-seven-letter', 'Volume Two', 'Gamma')),
        para(text('And '), link(null, 'vot-letter', 'Volume Two', 'Beta')),
        para(text('And '), link('nowhere', 'vot-letter', 'Volume Two', 'Nowhere')),
        { type: 'prophecy-group', label: 'Half', ot: { blocks: [para(text('Only an Old Testament part. - Psalm 22:1'))] } },
      ],
      footnotes: { 1: { type: 'scripture', ref: 'Hebrews 1:8' } },
    }],
  }];
  const matthew = {
    chapters: [{
      num: 5,
      votNotes: [
        { ref: '5:14', vol: 'Volume Two', letter: 'Beta', excerpt: 'letting your light so shine before men' },
        { ref: '5:16', vol: 'Volume Two', letter: 'Beta', excerpt: 'these particular words are nowhere in that letter' },
        { ref: '5:3-5', vol: null, letter: 'Gamma', excerpt: 'Blessed are the poor in spirit' },
        { ref: '5:7', vol: 'Volume Two', letter: 'Absent Letter', excerpt: 'Blessed are the merciful' },
        { ref: '5:8', vol: 'Hidden Manna', letter: 'Secret', excerpt: 'Hidden words here' },
      ],
    }],
  };
  const collections = new Map([
    ['two', { letters: [alpha, beta] }],
    ['seven', { letters: [gamma] }],
    ['wtlb1', { letters: [devotion] }],
    ['hm', { letters: [secret] }],
  ]);
  const calls = [];
  const resolveLetter = (vol, title) => {
    calls.push([vol, title]);
    for (const [volKey, { letters }] of collections) {
      const hit = letters.find((l) => l.title === title);
      if (hit) return { volKey, letterId: hit.id };
    }
    return null;
  };
  const resolveCollection = (label) => ({ 'Volume Two': 'two', 'Volume Seven': 'seven' })[label] || null;
  const resolveScreen = (screen) => ({ 'vot-letter': 'two', 'vot-seven-letter': 'seven' })[screen] || null;
  const out = extractCites({
    collections, studies, matthew, table, refParts, resolveLetter, resolveCollection, resolveScreen, skip: new Set(['hm']),
  });
  return { out, calls, collections, studies };
}

describe('extractCites: one site per place a verse is cited', () => {
  const { vid } = env();
  const { out, calls } = fixture();
  const at = (key, pred) => out.sites.filter((s) => targetKey(s.target) === key && pred(s));

  it('a Format A footnote records its block and number; a range keeps its last verse', () => {
    expect(at('two/alpha', (s) => s.k === KIND.footnote && s.fn === '1')).toEqual([
      { v: vid('psalms', 2, 12), ve: vid('psalms', 2, 12), target: { volKey: 'two', letterId: 'alpha' }, k: KIND.footnote, p: 1, fn: '1' },
    ]);
    expect(at('two/alpha', (s) => s.fn === '2')).toMatchObject([{ v: vid('john', 3, 16), ve: vid('john', 3, 17), p: 1 }]);
    // a closing footnote line is a block of its own
    expect(at('two/alpha', (s) => s.fn === '3')).toMatchObject([{ v: vid('revelation', 1, 8), p: 2 }]);
  });

  it('reports a footnote no block marks and one whose ref will not parse; ignores a non-scripture note', () => {
    expect(out.problems).toContainEqual({ kind: 'footnote-orphan', where: 'two/alpha fn 4', what: 'Genesis 1:1' });
    expect(out.problems).toContainEqual({ kind: 'footnote-ref', where: 'two/alpha fn 5', what: 'Nowhere 9:9' });
    expect(at('two/alpha', (s) => s.fn === '6')).toEqual([]);
  });

  it('a Study Bible note anchors on the words it quotes', () => {
    const [s] = at('two/beta', (x) => x.k === KIND.votNote && x.v === vid('matthew-plain', 5, 14));
    expect(s).toMatchObject({ p: 1, o: 'So then, walk in My ways and be for Me examples, '.length, n: 'letting your light so shine before men.'.length });
    expect(out.counts.quoteWhole).toBe(2); // Beta 5:14 and Gamma 5:3-5
  });

  it('a note whose quotation is not in the letter opens where the letter cites the same verse itself', () => {
    const [s] = at('two/beta', (x) => x.k === KIND.votNote && x.v === vid('matthew-plain', 5, 16));
    expect(s).toMatchObject({ p: 1, fn: '1' });
    expect(out.counts.quoteMissing).toBe(1);
    expect(out.counts.quoteTwin).toBe(1);
    expect(out.problems.map((p) => p.kind)).toContain('votNote-quote');
  });

  it('a note with no volume consults the resolver with null and keeps its verse range', () => {
    expect(calls).toContainEqual([null, 'Gamma']);
    expect(at('seven/gamma', (x) => x.k === KIND.votNote)).toMatchObject([{ v: vid('matthew-plain', 5, 3), ve: vid('matthew-plain', 5, 5), p: 0 }]);
  });

  it('names a letter absent from the corpus by its Matthew ref', () => {
    expect(out.problems).toContainEqual({ kind: 'votNote-letter', where: 'Matthew 5:7', what: 'Absent Letter' });
  });

  it('leaves Hidden Manna out entirely: no site, no link, its note only counted', () => {
    expect(out.sites.some((s) => s.target.volKey === 'hm')).toBe(false);
    expect(out.votLinks.some((l) => l.volKey === 'hm')).toBe(false);
    expect(out.counts.skipped).toBe(1);
  });

  it('a Format B {{ref:}} records its paragraph and its ordinal r', () => {
    expect(at('wtlb1/devotion', () => true).map((s) => [s.k, s.p, s.r, s.v])).toEqual([
      [KIND.wtlb, 0, 0, vid('matthew-plain', 4, 4)], [KIND.wtlb, 0, 1, vid('deuteronomy', 8, 3)],
    ]);
    expect(at('wtlb1/devotion', () => true)[0].target).toEqual({ volKey: 'wtlb1', entryId: 'devotion' });
    expect(out.problems).toContainEqual({ kind: 'wtlb-ref', where: 'wtlb1/devotion para 2', what: 'Nowhere 1:1' });
  });

  it('a Bible Study: inline refs by r, plain source lines by span, footnotes, prophecy-group parts by sub', () => {
    const key = 'study:st/st-ch1';
    expect(at(key, (s) => s.p === 0 && s.r === 0)).toMatchObject([{ k: KIND.study, v: vid('psalms', 45, 6) }]);
    expect(at(key, (s) => s.p === 0 && s.fn === '1')).toMatchObject([{ k: KIND.study, v: vid('hebrews', 1, 8) }]);
    expect(at(key, (s) => s.p === 1)).toEqual([{
      v: vid('isaiah', 40, 3), ve: vid('isaiah', 40, 5), target: { studyId: 'st', chapterId: 'st-ch1' },
      k: KIND.study, p: 1, o: 0, n: 'Prepare the way of The Lord.'.length,
    }]);
    expect(at(key, (s) => s.p === 2).map((s) => [s.sub, s.v])).toEqual([
      [['ot', 0], vid('malachi', 3, 1)], [['nt', 0], vid('matthew-plain', 3, 3)],
    ]);
    expect(out.counts.studyPlain).toBe(3); // Isaiah 40:3-5, Malachi 3:1, Psalm 22:1
  });

  it('pairs a prophecy group\'s first Old and New Testament passages, and reports a group missing one', () => {
    expect(out.prophecy).toEqual([{ a: vid('malachi', 3, 1), b: vid('matthew-plain', 3, 3), studyId: 'st', chapterId: 'st-ch1', p: 2 }]);
    expect(out.problems).toContainEqual(expect.objectContaining({ kind: 'prophecy-incomplete', where: 'study st/st-ch1 block 7' }));
  });

  it('resolves letter-links by id or by title, deduped, the collection that holds the letter winning', () => {
    expect(out.votLinks).toEqual([
      { studyId: 'st', chapterId: 'st-ch1', volKey: 'two', letterId: 'alpha', p: 3 },
      { studyId: 'st', chapterId: 'st-ch1', volKey: 'seven', letterId: 'gamma', p: 4 },
      { studyId: 'st', chapterId: 'st-ch1', volKey: 'two', letterId: 'beta', p: 5 },
    ]);
    expect(out.problems).toContainEqual({
      kind: 'study-letter-link-label', where: 'study st/st-ch1', what: 'gamma: labelled Volume Two, opens seven, found in seven',
    });
    expect(out.problems).toContainEqual(expect.objectContaining({ kind: 'study-letter-link', what: 'two / nowhere' }));
  });

  it('every site carries a kind and an integer block', () => {
    for (const s of out.sites) {
      expect(CITE_KINDS[s.k]).toBeTruthy();
      expect(Number.isInteger(s.p) && s.p >= 0).toBe(true);
      expect(s.ve >= s.v).toBe(true);
    }
  });
});

/* ── grouping and the shipped encodings ───────────────────────────────── */

describe('groupCites: one entry per letter in reading order, one edge per (verse, letter)', () => {
  const T = { volKey: 'two', letterId: 'a' };
  const U = { volKey: 'one', letterId: 'b' };
  const describeKey = (key) => ({ 'two/a': { order: 20, title: 'A' }, 'one/b': { order: 10, title: 'B' } })[key] || null;

  it('orders entries, folds identical sites, counts edges by distinct verse', () => {
    const sites = [
      { v: 5, ve: 5, target: T, k: 0, p: 3, fn: '2' },
      { v: 5, ve: 5, target: T, k: 0, p: 3, fn: '2' },        // identical: folded
      { v: 5, ve: 5, target: T, k: 1, p: 1, o: 4, n: 10 },    // same verse, second site: same edge
      { v: 9, ve: 9, target: T, k: 0, p: 1, fn: '1' },
      { v: 2, ve: 2, target: U, k: 0, p: 0, fn: '1' },
      { v: 7, ve: 7, target: { volKey: 'two', letterId: 'gone' }, k: 0, p: 0, fn: '1' }, // describe() knows it not
    ];
    const g = groupCites(sites, describeKey);
    expect(g.entries.map((e) => [e.key, e.title])).toEqual([['one/b', 'B'], ['two/a', 'A']]);
    expect(g.duplicateSites).toBe(1);
    expect(g.edges).toBe(3); // one/b v2; two/a v5, v9
    // reading order inside a letter: block, then the place in it
    expect(g.entries[1].sites.map((s) => [s.p, s.v])).toEqual([[1, 9], [1, 5], [3, 5]]);
  });
});

describe('encodeCites <-> expandCites (the app decoder)', () => {
  const { out } = fixture();
  const describeKey = (key, t) => ({ order: t.studyId ? 100 : t.volKey === 'two' ? 1 : t.volKey === 'seven' ? 7 : 9, title: key.toUpperCase() });
  const grouped = groupCites(out.sites, describeKey);
  const rows = encodeCites(grouped.entries);

  it('ships compact tuples with trailing nulls dropped', () => {
    const alpha = rows.find((r) => r.c === 'two' && r.id === 'alpha');
    expect(alpha.t).toBe('TWO/ALPHA');
    for (const s of alpha.s) expect(s[s.length - 1]).not.toBe(null);
    const { vid } = env();
    expect(alpha.s).toContainEqual([vid('psalms', 2, 12), KIND.footnote, 1, '1']);
    expect(alpha.s).toContainEqual([vid('john', 3, 16), KIND.footnote, 1, '2', null, vid('john', 3, 17)]);
    const study = rows.find((r) => r.c === 'studies');
    expect(study).toMatchObject({ sid: 'st', id: 'st-ch1' });
    expect(study.s).toContainEqual([vid('matthew-plain', 3, 3), KIND.study, 2, 0, ['nt', 0]]);
  });

  it('expands back to one edge per (verse, letter) carrying every site', () => {
    const edges = expandCites(rows);
    expect(edges.length).toBe(grouped.edges);
    expect(edges.reduce((n, e) => n + e.at.length, 0)).toBe(grouped.entries.reduce((n, e) => n + e.sites.length, 0));
    for (const entry of grouped.entries) {
      for (const s of entry.sites) {
        const e = edges.find((x) => x.key === entry.key && x.v === s.v);
        expect(e, `${entry.key} v${s.v}`).toBeTruthy();
        const cite = siteCite([s.v, s.k, s.p, s.fn != null ? s.fn : s.r != null ? s.r : s.o != null ? [s.o, s.n] : null, s.sub || null]);
        expect(e.at).toContainEqual({ kind: CITE_KINDS[s.k], p: s.p, ve: s.ve, ...cite });
      }
    }
    // the edge's kind is the first of its sites' kinds in CITE_KINDS order
    const beta516 = edges.find((e) => e.key === 'two/beta' && e.at.length === 2);
    expect(beta516.kind).toBe('footnote');
    expect(edges.find((e) => e.key === 'wtlb1/devotion')).toMatchObject({ volKey: 'wtlb1', entryId: 'devotion' });
    expect(edges.find((e) => e.key === 'study:st/st-ch1')).toMatchObject({ studyId: 'st', chapterId: 'st-ch1' });
  });
});

describe('encodeStudyLinks <-> expandStudyLinks', () => {
  it('round-trips prophecy pairs and letter-links, rows in study order', () => {
    const prophecy = [{ a: 10, b: 900, studyId: 's', chapterId: 'c2', p: 4 }, { a: 11, b: 901, studyId: 's', chapterId: 'c1', p: 0 }];
    const votLinks = [
      { studyId: 's', chapterId: 'c1', volKey: 'two', letterId: 'x', p: 3 },
      { studyId: 's', chapterId: 'c1', volKey: 'seven', letterId: 'y', p: 2, sub: ['vot', 0] },
    ];
    const rows = encodeStudyLinks(prophecy, votLinks, (sid, id) => (id === 'c1' ? 1 : 2));
    expect(rows).toEqual([
      { sid: 's', id: 'c1', pr: [[0, 11, 901]], l: [[3, 'two', 'x'], [2, 'seven', 'y', ['vot', 0]]] },
      { sid: 's', id: 'c2', pr: [[4, 10, 900]] },
    ]);
    const back = expandStudyLinks(rows);
    expect(back.prophecy).toEqual([prophecy[1], prophecy[0]]);
    expect(back.votLinks).toEqual(votLinks.map((l) => ({ kind: 'studyLetter', ...l })));
  });
});

describe('holyDaysMirrors: each Holy Days entry and the letter it re-presents (real album)', () => {
  it('matches all sixteen by title, id or a title that opens the Holy Days one', () => {
    const FILES = {
      two: 'volume-two.js', three: 'volume-three.js', four: 'volume-four.js', six: 'volume-six.js',
      seven: 'volume-seven.js', timothy: 'letters-timothy.js', flock: 'letters-flock.js',
      wtlb1: 'wtlb-one.js', wtlb2: 'wtlb-two.js',
    };
    const collections = new Map();
    const labels = new Map();
    for (const col of COLLECTIONS) {
      labels.set(col.label, col.volKey);
      if (!FILES[col.volKey]) continue;
      const ctx = load(FILES[col.volKey]);
      collections.set(col.volKey, { letters: [...ctx[col.globalName], ...(col.prefaceGlobal && ctx[col.prefaceGlobal] ? [ctx[col.prefaceGlobal]] : [])] });
    }
    const { HOLY_DAYS } = load('holy-days.js');
    const { mirrors, missing } = holyDaysMirrors(HOLY_DAYS, collections, (label) => labels.get(label) || null);
    expect(missing).toEqual([]);
    expect(Object.keys(mirrors).length).toBe(HOLY_DAYS.length);
    expect(mirrors['holydays/i-am-the-passover-and-the-lamb-the-new-covenant-with-men']).toBe('two/i-am-the-passover');
    for (const [from, to] of Object.entries(mirrors)) {
      expect(from.startsWith('holydays/')).toBe(true);
      expect(collections.has(to.split('/')[0])).toBe(true);
    }
  });
});

describe('shortStudyTitle', () => {
  it('cuts a study title at its first subtitle break', () => {
    expect(shortStudyTitle('YAHUSHUA More Than a Man: YahuShua Is The Fulfillment')).toBe('YAHUSHUA More Than a Man');
    expect(shortStudyTitle('The State of the Dead - and The Fate of the Wicked')).toBe('The State of the Dead');
    expect(shortStudyTitle('Purity (A Study)')).toBe('Purity');
    expect(shortStudyTitle('The Sabbath')).toBe('The Sabbath');
    expect(shortStudyTitle('Q: A')).toBe('Q: A'); // a break too early is no subtitle
    expect(shortStudyTitle(null)).toBe('');
  });
});

/* ── the shipped asset ────────────────────────────────────────────────── */

describe('the shipped asset is what the corpus generates', () => {
  it('node tools/gen-scripture-web.mjs --check passes (regenerate after any corpus edit)', () => {
    const run = spawnSync(process.execPath, [resolve(HERE, 'gen-scripture-web.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(run.status, (run.stderr || '') + (run.stdout || '').slice(-600)).toBe(0);
    expect(run.stdout).toMatch(/^fresh: /m);
  }, 60000);

  it('Volume Two\'s anchors resolve to words through the runtime excerpt (all of them: vot-citations.test.js)', () => {
    const asset = runInNewContext(readFileSync(resolve(DATA, 'scripture-web-data.js'), 'utf8') + ';SCRIPTURE_WEB_DATA', {});
    expect(asset.version).toBe(2);
    const { LETTERS } = load('volume-two.js');
    const corpus = { letter: (volKey, id) => (volKey === 'two' ? LETTERS.find((l) => l.id === id) : null) };
    let n = 0;
    for (const row of asset.votCites.filter((r) => r.c === 'two')) {
      for (const site of row.s) {
        expect(excerptFor(corpus, `two/${row.id}`, site[2], siteCite(site)), `two/${row.id} ${JSON.stringify(site)}`).not.toBe('');
        n++;
      }
    }
    expect(n).toBeGreaterThan(150);
  });
});
