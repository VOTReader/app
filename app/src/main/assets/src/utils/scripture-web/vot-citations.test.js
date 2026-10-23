// @ts-nocheck
/**
 * vot-citations — the Volumes' own citations of scripture, as a reader meets
 * them: for a verse, the letters that cite it (collection, title, the citing
 * sentence, a key that opens the letter AT that paragraph); for a letter, the
 * verses it cites.
 *
 * Real fixtures throughout: the shipped asset, decoded the way the app
 * decodes it, and the whole public corpus loaded into one global object the
 * way the reader's bundles load it (windowCorpus reads it from there). The
 * asset's anchors are only worth shipping if every one of them still opens
 * on words, so the last block checks all of them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { decodeGraph } from './decode.js';
import * as vc from './vot-citations.js';
import { COLLECTIONS } from '../../data/scripture-resolution.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../../data');
const data = runInNewContext(readFileSync(resolve(DATA, 'scripture-web-data.js'), 'utf8') + ';SCRIPTURE_WEB_DATA', {});
const graph = decodeGraph(data);

/** The public corpus in one global object, as the reader's bundles leave it. */
const CORPUS_FILES = [
  'volume-one.js', 'volume-two.js', 'volume-three.js', 'volume-four.js', 'volume-five.js',
  'volume-six.js', 'volume-seven.js', 'letters-timothy.js', 'letters-flock.js', 'lords-rebuke.js',
  'wtlb-one.js', 'wtlb-two.js', 'the-blessed.js', 'holy-days.js', 'bible-studies.js',
];
const globals = {};
for (const f of CORPUS_FILES) runInNewContext(readFileSync(resolve(DATA, f), 'utf8'), globals, { filename: f });
const corpus = vc.windowCorpus(globals);

/** Verse id of book / chapter / verse in the asset's own canon. */
function vid(bookId, ch, v) {
  const bi = graph.books.findIndex((b) => b.id === bookId);
  const row = graph.chapters.find((c) => c[0] === bi && c[1] === ch);
  return row[2] + v - 1;
}
const letter = (volKey, id) => corpus.letter(volKey, id);

/* ── the text domain ──────────────────────────────────────────────────── */

describe('formatAText / formatBText: the reader\'s text, citations lifted out', () => {
  it('a poetry block: lines joined by newlines, stanza breaks a space, each footnote where it stood', () => {
    const bt = vc.formatAText(letter('two', 'the-wide-path').blocks[3]);
    expect(bt.text).toMatch(/^Therefore, turn from this\nWicked way you have chosen!\nRepent, and kiss The Son,\nThat you may live and not die!\.\.\./);
    expect(bt.text).toContain('For I AM HE!...');
    expect(bt.fn.map(([n]) => n)).toEqual(['2', '3']);
    expect(bt.text.slice(0, bt.fn[0][1])).toMatch(/not die!$/);
    expect(bt.text.slice(0, bt.fn[1][1])).toMatch(/out of the dunghill$/);
  });

  it('a Bible Study block: {{ref:}} lifted out with its offset; a letter-link reads as its label', () => {
    const bt = vc.formatAText({ type: 'para', segments: [
      { t: 'text', v: 'Yah is my strength. - {{ref:Psalm 118:14}} See ' },
      { t: 'letter-link', letterId: 'x', label: '"The Wide Path"' },
      { t: 'fn', v: '4' },
    ] });
    expect(bt.text).toBe('Yah is my strength. -  See "The Wide Path"');
    expect(bt.refs).toEqual([['Psalm 118:14', 'Yah is my strength. - '.length]]);
    expect(bt.fn).toEqual([['4', bt.text.length]]);
    expect(vc.formatAText(null)).toEqual({ text: '', fn: [], refs: [] });
    expect(vc.formatAText({ type: 'closing', text: 'Says The Lord.' }).text).toBe('Says The Lord.');
  });

  it('a Format B paragraph: emphasis, nav tokens and the source line gone, refs recorded (real WTLB entry)', () => {
    const intro = letter('wtlb1', 'introduction');
    const bt = vc.formatBText(intro.paragraphs[2].text);
    expect(bt.text).not.toContain('{{');
    expect(bt.text).toContain('Man shall not live by bread alone,');
    expect(bt.refs).toEqual([['Matthew 4:4', bt.text.length]]);
    const synthetic = vc.formatBText('**Bold** and _soft_ {{nav:a|b}}[From “A Letter” ~ Volume 7] end {{ref:John 1:1}}');
    expect(synthetic.text).toBe('Bold and soft  end ');
    expect(synthetic.refs).toEqual([['John 1:1', 'Bold and soft  end '.length]]);
    expect(vc.formatBText(undefined).text).toBe('');
  });

  it('blockTextAt reaches a paragraph, a block, and a part of a prophecy group', () => {
    const ch6 = corpus.studyChapter('more-than-a-man', 'more-than-a-man-ch6');
    expect(vc.blockTextAt(ch6, 0, ['ot', 0]).text).toMatch(/^The voice of one crying in the wilderness/);
    expect(vc.blockTextAt(ch6, 0, ['nope', 0])).toBe(null);
    expect(vc.blockTextAt(letter('wtlb1', 'introduction'), 2).refs.length).toBe(1);
    expect(vc.blockTextAt(letter('two', 'the-wide-path'), 999)).toBe(null);
    expect(vc.blockTextAt(null, 0)).toBe(null);
  });
});

/* ── excerpts ─────────────────────────────────────────────────────────── */

describe('cleanExcerpt / excerptAround / excerptSpan', () => {
  it('cleanExcerpt tidies what a removed reference leaves and reads verse lines as prose', () => {
    expect(vc.cleanExcerpt('Kiss The Son. - ')).toBe('Kiss The Son.');
    expect(vc.cleanExcerpt('He said () so')).toBe('He said so');
    expect(vc.cleanExcerpt('Repent, and kiss The Son,\nThat you may live')).toBe('Repent, and kiss The Son, That you may live');
    expect(vc.cleanExcerpt('Wicked way\nyou have chosen')).toBe('Wicked way / you have chosen');
    expect(vc.cleanExcerpt('  spaced   out , words  ')).toBe('spaced out, words');
  });

  it('excerptAround quotes the sentence a cite closes, borrowing a short one before it', () => {
    const t = 'An earlier sentence that sets the scene. The cited sentence. A later one.';
    const at = t.indexOf(' A later');
    expect(vc.excerptAround(t, at)).toBe('An earlier sentence that sets the scene. The cited sentence.');
    const long = 'Long sentence ' + 'word '.repeat(30) + 'ends here. The cited sentence that is itself quite long enough to stand alone on a card without help.';
    expect(vc.excerptAround(long, long.length)).toBe('The cited sentence that is itself quite long enough to stand alone on a card without help.');
    expect(vc.excerptAround('', 0)).toBe('');
  });

  it('excerptAround clips to EXCERPT_MAX on a word boundary, keeping the cite\'s side', () => {
    const sentence = 'Behold ' + 'and the words go on '.repeat(25) + 'to the cited end.';
    const atEnd = vc.excerptAround(sentence, sentence.length);
    expect(atEnd.length).toBeLessThanOrEqual(vc.EXCERPT_MAX);
    expect(atEnd.startsWith('…')).toBe(true);
    expect(atEnd.endsWith('to the cited end.')).toBe(true);
    const mid = sentence.indexOf('and the words', 60);
    const atMid = vc.excerptAround(sentence, mid);
    expect(atMid.length).toBeLessThanOrEqual(vc.EXCERPT_MAX);
    expect(atMid.startsWith('Behold')).toBe(true);
    expect(atMid.endsWith('…')).toBe(true);
  });

  it('excerptSpan quotes a span, with an ellipsis on a side that is cut mid-sentence', () => {
    const t = 'First. So then, walk in My ways and be for Me examples, letting your light shine.';
    const o = t.indexOf('So then');
    expect(vc.excerptSpan(t, o, t.length - o)).toBe('So then, walk in My ways and be for Me examples, letting your light shine.');
    const o2 = t.indexOf('walk');
    expect(vc.excerptSpan(t, o2, 'walk in My ways'.length)).toBe('…walk in My ways…');
    expect(vc.excerptSpan(t, -1, 4)).toBe('');
    expect(vc.excerptSpan(t, 0, 0)).toBe('');
  });
});

describe('excerptFor: the words around one shipped anchor (real letters)', () => {
  it('a footnote: Psalm 2:12 in The Wide Path', () => {
    expect(vc.excerptFor(corpus, 'two/the-wide-path', 3, { fn: '2' })).toMatch(/kiss The Son, That you may live and not die!/);
  });

  it('a block of no words (a closing footnote line) quotes the end of the block before it', () => {
    const p = letter('two', 'i-am-the-passover').blocks.findIndex((b) => b.type === 'closing-fn');
    expect(vc.excerptFor(corpus, 'two/i-am-the-passover', p, { fn: '12' }))
      .toBe('Says He who is, and was, and is to come, YahuShua, The Salvation of God.');
  });

  it('a quoted span: the Study Bible note on Matthew 5:16 in Living Sacrifices', () => {
    const ex = vc.excerptFor(corpus, 'two/living-sacrifices', 2, { o: 0, n: 175 });
    expect(ex).toMatch(/^So then, walk in My ways/);
    expect(ex.length).toBeLessThanOrEqual(vc.EXCERPT_MAX);
  });

  it('an inline reference by ordinal, in a Words To Live By entry and a Bible Study part', () => {
    expect(vc.excerptFor(corpus, 'wtlb1/introduction', 2, { r: 0 })).toMatch(/Man shall not live by bread alone/);
    expect(vc.excerptFor(corpus, 'study:more-than-a-man/more-than-a-man-ch6', 0, { o: 0, n: 'The voice of one crying in the wilderness:'.length, sub: ['ot', 0] }))
      .toMatch(/^The voice of one crying in the wilderness/);
  });

  it('no cite opens on the block\'s first words', () => {
    expect(vc.excerptFor(corpus, 'two/the-wide-path', 3)).toMatch(/^Therefore, turn from this \/ Wicked way/);
  });

  it('degrades to \'\' without a corpus, a letter, a block, a matching anchor, or a working lookup', () => {
    expect(vc.excerptFor(null, 'two/the-wide-path', 3, { fn: '2' })).toBe('');
    expect(vc.excerptFor({}, 'two/the-wide-path', 3, { fn: '2' })).toBe('');
    expect(vc.excerptFor(corpus, 'two/no-such-letter', 3, { fn: '2' })).toBe('');
    expect(vc.excerptFor(corpus, 'two/the-wide-path', 99, { fn: '2' })).toBe('');
    expect(vc.excerptFor(corpus, 'two/the-wide-path', 3, { fn: '99' })).toBe('');
    expect(vc.excerptFor(corpus, 'two/the-wide-path', 3, { r: 5 })).toBe('');
    expect(vc.excerptFor(corpus, 'not a key', 0)).toBe('');
    expect(vc.excerptFor({ letter() { throw new Error('not loaded'); } }, 'two/the-wide-path', 3)).toBe('');
  });
});

/* ── keys ─────────────────────────────────────────────────────────────── */

describe('parseLetterKey / letterKeyOf / collectionName', () => {
  it('round-trip the three key shapes', () => {
    expect(vc.parseLetterKey('two/the-wide-path')).toEqual({ volKey: 'two', id: 'the-wide-path' });
    expect(vc.parseLetterKey('study:more-than-a-man/more-than-a-man-ch6')).toEqual({ studyId: 'more-than-a-man', chapterId: 'more-than-a-man-ch6' });
    expect(vc.parseLetterKey('two/')).toBe(null);
    expect(vc.parseLetterKey('')).toBe(null);
    expect(vc.letterKeyOf({ volKey: 'two', letterId: 'a' })).toBe('two/a');
    expect(vc.letterKeyOf({ volKey: 'wtlb1', entryId: 'b' })).toBe('wtlb1/b');
    expect(vc.letterKeyOf({ studyId: 's', chapterId: 'c' })).toBe('study:s/c');
    expect(vc.letterKeyOf({ volKey: 'two' })).toBe('');
    expect(vc.letterKeyOf(null)).toBe('');
  });

  it('names every collection as COLLECTIONS labels it, and nothing else', () => {
    for (const col of COLLECTIONS) {
      if (col.volKey === 'answers') continue;
      expect(vc.collectionName(col.volKey), col.volKey).toBe(col.label);
    }
    expect(vc.collectionName('studies')).toBe('Bible Studies');
    expect(vc.collectionName('toString')).toBe('');
  });
});

/* ── citations for a verse ────────────────────────────────────────────── */

describe('citationsForVerse (the shipped asset + the real corpus)', () => {
  it('Psalm 2:12 is cited by The Wide Path at its third block: kiss The Son', () => {
    const cs = vc.citationsForVerse(graph, vid('psalms', 2, 12), corpus);
    const wide = cs.find((c) => c.letterKey === 'two/the-wide-path');
    expect(wide).toMatchObject({
      title: 'The Wide Path', collection: 'two', collectionName: 'Volume Two', paragraph: 3, sub: null,
      kind: 'footnote', kinds: ['footnote'], volKey: 'two', letterId: 'the-wide-path', cite: { fn: '2' },
    });
    expect(wide.excerpt).toMatch(/kiss The Son/);
    expect(cs.map((c) => c.collection)).toContain('rebuke');
    expect(cs.map((c) => c.collection)).toContain('studies');
  });

  it('lists in reading order: collection, then letter, then paragraph', () => {
    const rank = (c) => vc.COLLECTION_ORDER.indexOf(c.collection);
    for (const v of [vid('psalms', 2, 12), vid('john', 3, 16), vid('matthew-plain', 5, 16), vid('isaiah', 53, 5)]) {
      const cs = vc.citationsForVerse(graph, v, corpus);
      for (let i = 1; i < cs.length; i++) expect(rank(cs[i]) >= rank(cs[i - 1]), `${v} #${i}`).toBe(true);
      const ords = cs.map((c) => graph.votEdges.find((e) => e.key === c.letterKey && e.v === c.verse).ord);
      for (let i = 1; i < cs.length; i++) {
        if (cs[i].collection === cs[i - 1].collection) expect(ords[i] >= ords[i - 1]).toBe(true);
      }
    }
  });

  it('a footnote and a Study Bible note on the same words are one citation of both kinds', () => {
    const [ls] = vc.citationsForVerse(graph, vid('matthew-plain', 5, 16), corpus).filter((c) => c.letterKey === 'two/living-sacrifices');
    expect(ls.paragraph).toBe(2);
    expect(ls.kinds.sort()).toEqual(['footnote', 'votNote']);
  });

  it('a Bible Study citation names its study and its prophecy-group part', () => {
    const cs = vc.citationsForVerse(graph, vid('john', 3, 16), corpus).filter((c) => c.collection === 'studies');
    expect(cs.length).toBeGreaterThan(0);
    const mtm = cs.find((c) => c.studyId === 'more-than-a-man' && c.sub);
    expect(mtm.collectionName).toBe('YAHUSHUA More Than a Man');
    expect(mtm.letterKey).toBe(`study:more-than-a-man/${mtm.chapterId}`);
    expect(mtm.excerpt).toMatch(/For God so loved the world/);
  });

  it('a range counts for every verse it covers', () => {
    const e = graph.votEdges.find((x) => x.ve > x.v && x.at.some((a) => a.ve > x.v));
    expect(e).toBeTruthy();
    const last = Math.max(...e.at.map((a) => a.ve));
    const keys = (v) => vc.citationsForVerse(graph, v).map((c) => c.letterKey);
    expect(keys(e.v)).toContain(e.key);
    expect(keys(last)).toContain(e.key);
    const c = vc.citationsForVerse(graph, last).find((x) => x.letterKey === e.key);
    expect(c.verse).toBe(e.v);
    expect(c.verseEnd).toBeGreaterThanOrEqual(last);
  });

  it('a Holy Days entry is left out when the letter it re-presents is listed (John 1:29)', () => {
    const v = vid('john', 1, 29);
    const hd = 'holydays/i-am-the-passover-and-the-lamb-the-new-covenant-with-men';
    expect(graph.mirrors[hd]).toBe('two/i-am-the-passover');
    expect(graph.votEdges.some((e) => e.key === hd && e.v === v)).toBe(true);
    const keys = vc.citationsForVerse(graph, v, corpus).map((c) => c.letterKey);
    expect(keys).toContain('two/i-am-the-passover');
    expect(keys).not.toContain(hd);
  });

  it('without the corpus every citation still comes back, titled, with no excerpt', () => {
    const v = vid('psalms', 2, 12);
    const withCorpus = vc.citationsForVerse(graph, v, corpus);
    const without = vc.citationsForVerse(graph, v);
    expect(without.map((c) => c.letterKey)).toEqual(withCorpus.map((c) => c.letterKey));
    for (const c of without) {
      expect(c.excerpt).toBe('');
      expect(c.title).not.toBe('');
      expect(c.collectionName).not.toBe('');
    }
  });

  it('gives [] for no verse, no graph, or a graph without citations', () => {
    expect(vc.citationsForVerse(graph, -1, corpus)).toEqual([]);
    expect(vc.citationsForVerse(null, 5, corpus)).toEqual([]);
    expect(vc.citationsForVerse({ votEdges: [] }, 5)).toEqual([]);
  });

  it('reads a pre-anchor edge (no `at`) as a citation at the letter\'s top', () => {
    const g = { votEdges: [{ v: 7, kind: 'footnote', volKey: 'two', letterId: 'the-wide-path' }] };
    expect(vc.citationsForVerse(g, 7)).toMatchObject([{ letterKey: 'two/the-wide-path', paragraph: 0, verse: 7, verseEnd: 7 }]);
  });
});

/* ── citations of a letter ────────────────────────────────────────────── */

describe('citationsForLetter / letterCiteSites', () => {
  it('The Wide Path cites Psalm 2:12, ascending and unique', () => {
    const vs = vc.citationsForLetter(graph, 'two/the-wide-path');
    expect(vs).toContain(vid('psalms', 2, 12));
    expect(vs).toEqual([...new Set(vs)].sort((a, b) => a - b));
    expect(vc.citationsForLetter(graph, 'two/no-such-letter')).toEqual([]);
    expect(vc.citationsForLetter(null, 'two/the-wide-path')).toEqual([]);
  });

  it('every site of a study chapter, in reading order, each able to open its paragraph', () => {
    const key = 'study:more-than-a-man/more-than-a-man-ch6';
    const rows = vc.letterCiteSites(graph, key);
    expect(rows.length).toBeGreaterThan(20);
    for (let i = 1; i < rows.length; i++) expect(rows[i].paragraph >= rows[i - 1].paragraph).toBe(true);
    expect(rows.some((r) => r.sub && r.sub[0] === 'nt')).toBe(true);
    expect(new Set(rows.map((r) => r.verse))).toEqual(new Set(vc.citationsForLetter(graph, key)));
    expect(vc.letterCiteSites(graph, 'nope/nope')).toEqual([]);
  });
});

/* ── opening a citation ───────────────────────────────────────────────── */

describe('endpointFor: the navigateToLink endpoint that opens the paragraph', () => {
  const first = (key) => vc.citationsForVerse(graph, graph.votEdges.find((e) => e.key === key).v, corpus).find((c) => c.letterKey === key);

  it('a letter: its block key, its screen, its collection by name', () => {
    const [c] = vc.citationsForVerse(graph, vid('psalms', 2, 12), corpus).filter((x) => x.letterKey === 'two/the-wide-path');
    expect(vc.endpointFor(c)).toEqual({
      type: 'letter', key: 'letter:the-wide-path:3', letterId: 'the-wide-path', screen: 'vot-letter',
      volKey: 'two', collection: 'Volume Two', label: 'The Wide Path',
      surpriseAnchor: { type: 'excerpt', text: c.excerpt.replace(/^…|…$/g, ''), letterId: 'the-wide-path', para: 3 },
    });
    expect(c.excerpt.length, 'the citing sentence rides along').toBeGreaterThan(20);
  });

  // The hub's seam walk F1 (2026-10-22): Open letter landed a screen early, the citing sentence unmarked.
  it('lands as a search hit does: the citation’s own block, its sentence without the cut marks', () => {
    const ep = vc.endpointFor({ volKey: 'two', letterId: 'x', paragraph: 7, excerpt: '…the penalty of sin is death…' });
    expect(ep.surpriseAnchor).toEqual({ type: 'excerpt', text: 'the penalty of sin is death', letterId: 'x', para: 7 });
    const w = vc.endpointFor({ volKey: 'wtlb1', entryId: 'e', paragraph: 2 });
    expect(w.surpriseAnchor).toEqual({ type: 'excerpt', text: '', letterId: 'e', para: 2 });
    expect('surpriseAnchor' in vc.endpointFor({ studyId: 's', chapterId: 'c', paragraph: 2 }), 'a study chapter lands by its key').toBe(false);
  });

  it('a Words To Live By entry, a Blessed entry, and both kinds of Holy Days entry', () => {
    const w = first(graph.votEdges.find((e) => e.volKey === 'wtlb1').key);
    expect(vc.endpointFor(w)).toMatchObject({ type: 'wtlb', key: `wtlb:${w.entryId}:${w.paragraph}`, screen: 'wtlb-one-entry', collection: 'Words To Live By: Part One' });
    const b = first(graph.votEdges.find((e) => e.volKey === 'blessed').key);
    expect(vc.endpointFor(b)).toMatchObject({ type: 'blessed', key: `wtlb:${b.entryId}:${b.paragraph}`, screen: 'blessed-entry' });
    // a Format A Holy Days entry is read by LetterView, keyed letter:<id>:<block>
    const hdA = vc.endpointFor({ volKey: 'holydays', entryId: 'i-am-the-passover-and-the-lamb-the-new-covenant-with-men', paragraph: 4, title: 'T' });
    expect(hdA).toMatchObject({ type: 'holy-days', key: 'letter:i-am-the-passover-and-the-lamb-the-new-covenant-with-men:4', screen: 'holy-days-entry', collection: 'Regarding The Holy Days' });
    const hdB = vc.endpointFor({ volKey: 'holydays', entryId: 'the-holy-days', paragraph: 1 });
    expect(hdB.key).toBe('wtlb:the-holy-days:1');
  });

  it('a Bible Study chapter, inside a prophecy group', () => {
    const c = vc.citationsForVerse(graph, vid('john', 3, 16), corpus).find((x) => x.studyId === 'more-than-a-man' && x.sub);
    expect(vc.endpointFor(c)).toEqual({
      type: 'study-letter', key: `letter:${c.chapterId}:${c.paragraph}:${c.sub[0]}:${c.sub[1]}`,
      studyId: 'more-than-a-man', studyChapterId: c.chapterId, screen: 'bible-study-chapter',
      label: c.title, collection: 'YAHUSHUA More Than a Man',
    });
    expect(vc.endpointFor({ studyId: 's', chapterId: 'c', paragraph: 2 })).toMatchObject({ key: 'letter:c:2', collection: 'Bible Studies' });
  });

  it('opens every collection on the screen COLLECTIONS names', () => {
    for (const col of COLLECTIONS) {
      if (col.volKey === 'answers') continue;
      const addr = vc.ENTRY_COLLECTIONS.has(col.volKey) ? { entryId: 'x' } : { letterId: 'x' };
      const ep = vc.endpointFor({ volKey: col.volKey, paragraph: 0, ...addr });
      expect(ep.screen, col.volKey).toBe(col.letterScreen);
      expect(ep.collection, col.volKey).toBe(col.label);
    }
    expect(vc.endpointFor(null)).toBe(null);
    expect(vc.endpointFor({ volKey: 'two' })).toBe(null);
  });
});

/* ── the reader's corpus ──────────────────────────────────────────────── */

describe('CORPUS_GLOBALS / windowCorpus', () => {
  it('names each public collection\'s globals as COLLECTIONS does, and never Hidden Manna', () => {
    for (const col of COLLECTIONS) {
      if (col.volKey === 'answers' || col.volKey === 'hm') continue;
      expect(vc.CORPUS_GLOBALS[col.volKey], col.volKey).toEqual([col.globalName, col.prefaceGlobal]);
    }
    expect(Object.keys(vc.CORPUS_GLOBALS)).not.toContain('hm');
  });

  it('finds letters, prefaces, entries and study chapters among the globals', () => {
    for (const [volKey, [main, pre]] of Object.entries(vc.CORPUS_GLOBALS)) {
      expect(Array.isArray(globals[main]), main).toBe(true);
      const firstLetter = globals[main].find((l) => l && l.id);
      expect(corpus.letter(volKey, firstLetter.id)).toBe(firstLetter);
      if (pre && globals[pre]) expect(corpus.letter(volKey, globals[pre].id)).toBe(globals[pre]);
    }
    expect(corpus.studyChapter('more-than-a-man', 'more-than-a-man-ch6').id).toBe('more-than-a-man-ch6');
    expect(corpus.studyChapter('no-study', 'x')).toBe(null);
    expect(corpus.letter('hm', 'anything')).toBe(null);
    expect(corpus.letter('two', 'no-such-letter')).toBe(null);
    const empty = vc.windowCorpus({});
    expect(empty.letter('two', 'the-wide-path')).toBe(null);
    expect(empty.studyChapter('more-than-a-man', 'more-than-a-man-ch6')).toBe(null);
  });
});

/* ── the shipped asset ────────────────────────────────────────────────── */

describe('the shipped asset, decoded', () => {
  const sites = data.votCites.reduce((n, r) => n + r.s.length, 0);

  it('one edge per (verse, letter), carrying every site; the study links in full', () => {
    const pairs = new Set();
    for (const r of data.votCites) for (const s of r.s) pairs.add(`${r.c}/${r.sid || ''}/${r.id}#${s[0]}`);
    expect(graph.votEdges.length).toBe(pairs.size);
    expect(graph.votEdges.reduce((n, e) => n + e.at.length, 0)).toBe(sites);
    expect(new Set(graph.votEdges.map((e) => e.key + '#' + e.v)).size).toBe(graph.votEdges.length);
    expect(graph.prophecy.length).toBe(data.studyLinks.reduce((n, r) => n + (r.pr || []).length, 0));
    expect(graph.votLinks.length).toBe(data.studyLinks.reduce((n, r) => n + (r.l || []).length, 0));
    expect(graph.prophecy.length).toBeGreaterThan(100);
    for (const e of graph.votEdges) expect(vc.parseLetterKey(e.key), e.key).not.toBe(null);
  });

  it('never names Hidden Manna', () => {
    expect(data.votCites.some((r) => r.c === 'hm')).toBe(false);
    expect(graph.votLinks.some((l) => l.volKey === 'hm')).toBe(false);
    expect(Object.values(graph.mirrors).some((to) => to.startsWith('hm/'))).toBe(false);
  });

  it('every anchor opens on words, at most EXCERPT_MAX of them', () => {
    let n = 0;
    for (const e of graph.votEdges) {
      for (const at of e.at) {
        const ex = vc.excerptFor(corpus, e.key, at.p, at);
        if (!ex || ex.length > vc.EXCERPT_MAX) expect.fail(`${e.key} ${JSON.stringify(at)} -> ${JSON.stringify(ex)}`);
        n++;
      }
    }
    expect(n).toBe(sites);
  });

  it('a legacy asset (flat votEdges / prophecy) still decodes as it did', () => {
    const { votCites: _c, studyLinks: _s, mirrors: _m, ...rest } = data;
    const legacy = decodeGraph({
      ...rest,
      votEdges: [{ v: 1, kind: 'footnote', volKey: 'two', letterId: 'x' }],
      prophecy: [{ a: 1, b: 2, studyId: 's', chapterId: 'c' }],
      votLinks: [{ kind: 'studyLetter', studyId: 's', chapterId: 'c', volKey: 'two', letterId: 'x' }],
    });
    expect(legacy.votEdges).toEqual([{ v: 1, kind: 'footnote', volKey: 'two', letterId: 'x' }]);
    expect(legacy.prophecy).toEqual([{ a: 1, b: 2, studyId: 's', chapterId: 'c' }]);
    expect(legacy.votLinks.length).toBe(1);
    expect(legacy.mirrors).toEqual({});
    expect(decodeGraph(rest).votEdges).toEqual([]);
  });

  it('expandCites skips a row it cannot read', () => {
    expect(vc.expandCites([null, { c: 'two' }, { c: 'studies', id: 'c', t: 'T', s: [[1, 3, 0]] }, { c: 'two', id: 'a', t: 'A', s: [[4, 0, 2, '1'], 'junk'] }]))
      .toEqual([{ v: 4, ve: 4, kind: 'footnote', volKey: 'two', letterId: 'a', key: 'two/a', title: 'A', ord: 3, at: [{ kind: 'footnote', p: 2, ve: 4, fn: '1' }] }]);
    expect(vc.expandCites(undefined)).toEqual([]);
    expect(vc.expandStudyLinks(null)).toEqual({ prophecy: [], votLinks: [] });
  });
});
