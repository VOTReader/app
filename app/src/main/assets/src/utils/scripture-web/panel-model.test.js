// @ts-nocheck
/**
 * panel-model + describe's words — what the docked panel lists, pinned on the
 * shipped asset and the whole public corpus (no mount): connection mode for
 * Isaiah 7:14 ↔ Matthew 1:23 (arc 43830, cited by the Volumes), John 3:16 in
 * verse mode, a chapter in group mode, a letter in letter mode, and the words
 * digest item 22 fixed (votes not "weight", "1 verse apart", the two-way
 * arrow, the prophecy line).
 *
 * The verse text comes from the app's free-global resolver (resolveVerseText)
 * at render time; it is stubbed per test so the "fills in when the Bible
 * lands" contract (digest B5) is visible: '' before, the words after.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { decodeGraph } from './decode.js';
import { windowCorpus, endpointFor } from './vot-citations.js';
import * as pm from './panel-model.js';
import * as ds from './describe.js';
import { verseToX } from './geometry.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../../data');
const data = runInNewContext(readFileSync(resolve(DATA, 'scripture-web-data.js'), 'utf8') + ';SCRIPTURE_WEB_DATA', {});
const g = decodeGraph(data);
const CORPUS_FILES = [
  'volume-one.js', 'volume-two.js', 'volume-three.js', 'volume-four.js', 'volume-five.js',
  'volume-six.js', 'volume-seven.js', 'letters-timothy.js', 'letters-flock.js', 'lords-rebuke.js',
  'wtlb-one.js', 'wtlb-two.js', 'the-blessed.js', 'holy-days.js', 'bible-studies.js',
];
const globals = {};
for (const f of CORPUS_FILES) runInNewContext(readFileSync(resolve(DATA, f), 'utf8'), globals, { filename: f });
const corpus = windowCorpus(globals);

function vid(bookId, ch, v) {
  const bi = g.books.findIndex((b) => b.id === bookId);
  const row = g.chapters.find((c) => c[0] === bi && c[1] === ch);
  return row[2] + v - 1;
}
const ISA_7_14 = vid('isaiah', 7, 14);
const MATT_1_23 = vid('matthew-plain', 1, 23);
const JOHN_3_16 = vid('john', 3, 16);
const ARC = 43830;

const arcInfo = () => ds.describeFound(
  { kind: 'arc', hit: { index: ARC, from: g.from[ARC], to: g.to[ARC], votes: g.votes[ARC] } },
  { g, density: 'famous', v: {}, viewFor: () => null },
);

let saved;
beforeEach(() => {
  saved = { r: globalThis.resolveVerseText, t: globalThis.translateVerse };
  globalThis.resolveVerseText = (ep) => 'TEXT ' + ep.bookId + ' ' + ep.chapter + ':' + ep.verse;
  delete globalThis.translateVerse;
});
afterEach(() => {
  globalThis.resolveVerseText = saved.r;
  globalThis.translateVerse = saved.t;
});

describe('the words (digest item 22)', () => {
  it('counts in the singular at exactly one', () => {
    expect(ds.plural(1, 'verse apart', 'verses apart')).toBe('1 verse apart');
    expect(ds.plural(5371, 'verse apart', 'verses apart')).toBe('5,371 verses apart');
    expect([1, 2, 3].map(ds.timesWord)).toEqual(['once', 'twice', '3 times']);
  });

  it('a connection reads "A ↔ B" with its votes and distance, never "weight"', () => {
    const info = arcInfo();
    expect(ARC >= 0 && [g.from[ARC], g.to[ARC]].sort((a, b) => a - b)).toEqual([ISA_7_14, MATT_1_23]);
    expect(ds.connectionTitle(info)).toBe('Isaiah 7:14 ↔ Matthew 1:23');
    expect(ds.sheetMeta(info)).toBe('183 votes · 5,371 verses apart');
    expect(ds.connectionMeta(info)).not.toMatch(/weight|↕/);
  });

  it('a prophecy pair opens as a connection with the prophecy line, votes or none', () => {
    const k = g.prophecy.findIndex((p) => Math.min(p.a, p.b) === ISA_7_14);
    expect(k).toBeGreaterThanOrEqual(0);
    const info = ds.describeFound({ kind: 'prophecy', prophecy: k }, { g, density: 'famous' });
    expect(info.kind).toBe('arc');
    expect(info.prophecy).toBe(true);
    expect(info.prophecyIndex).toBe(k);
    expect(ds.connectionTitle(info)).toBe('Isaiah 7:14 ↔ Matthew 1:22');
    // Isaiah 7:14 → Matthew 1:22 is not an OpenBible pair: no votes to quote, no arc index
    expect(info.index).toBe(-1);
    expect(ds.sheetMeta(info)).toBe('Prophecy fulfilled · 5,370 verses apart');
    expect(ds.summaryOf(info)).toMatch(/a prophecy fulfilled\.$/);
  });

  it('a letter opens as its own mode: its title, its collection, the verses it cites', () => {
    const info = ds.describeFound({ kind: 'letter', letterKey: 'two/the-lord-comes-nigh' }, { g, density: 'famous' });
    expect(info.kind).toBe('letter');
    expect(ds.sheetEyebrow(info)).toBe('In the Volumes');
    expect(ds.sheetMeta(info)).toBe('Volume Two');
    expect(info.verses.length).toBeGreaterThan(0);
    expect(info.endpoint && info.endpoint.type).toBeTruthy();
  });
});

describe('connection mode: Isaiah 7:14 ↔ Matthew 1:23', () => {
  it('both ends in canon order with their full text, read when asked', () => {
    globalThis.resolveVerseText = undefined;
    const before = pm.connectionModel(g, arcInfo(), { density: 'famous', corpus });
    expect(before.ends.map((e) => e.text)).toEqual(['', '']);
    globalThis.resolveVerseText = (ep) => 'TEXT ' + ep.bookId + ' ' + ep.chapter + ':' + ep.verse;
    const m = pm.connectionModel(g, arcInfo(), { density: 'famous', corpus });
    expect(m.ends.map((e) => e.ref.label)).toEqual(['Isaiah 7:14', 'Matthew 1:23']);
    expect(m.ends[0].text).toBe('TEXT isaiah 7:14');
    expect(m.ends[1].endpoint).toMatchObject({ type: 'bible', chapter: 1, verse: 23 });
  });

  it('CITED IN THE VOLUMES: one entry per place and per excerpt, each opening its letter', () => {
    const { cited } = pm.connectionModel(g, arcInfo(), { density: 'famous', corpus });
    expect(cited.length).toBe(12);
    const keys = cited.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const words = cited.filter((c) => c.excerpt).map((c) => c.letterKey + '|' + c.excerpt);
    expect(new Set(words).size).toBe(words.length);
    for (const c of cited) {
      expect(c.title).toBeTruthy();
      expect(c.collectionName).toBeTruthy();
      expect(c.cites).toMatch(/^(Isaiah 7:14|Matthew 1:23|Matthew 1:2\d-\d+|Isaiah 7:\d+-\d+)/);
      expect(c.endpoint).toBeTruthy();
    }
  });

  it('MORE FROM each end leaves the chosen thread out, grouped by book in canon order', () => {
    const { more } = pm.connectionModel(g, arcInfo(), { density: 'famous', corpus });
    expect(more.map((x) => x.ref.label)).toEqual(['Isaiah 7:14', 'Matthew 1:23']);
    for (const end of more) {
      expect(end.ids).not.toContain(ARC);
      expect(end.total).toBe(end.ids.length);
      const books = end.groups.map((gr) => gr.book);
      expect(books).toEqual([...books].sort((a, b) => a - b));
      for (const gr of end.groups) {
        for (let i = 1; i < gr.rows.length; i++) expect(gr.rows[i - 1].votes).toBeGreaterThanOrEqual(gr.rows[i].votes);
        for (const r of gr.rows) expect(r.here.label).toBe(end.ref.label);
      }
    }
    expect(more[0].total).toBe(29);
    expect(more[1].total).toBe(34);
  });

  it('frames both feet across 80 % of the canvas area', () => {
    const f = pm.connectionFrame(ISA_7_14, MATT_1_23);
    const span = MATT_1_23 + 1 - ISA_7_14;
    expect(f.x1 - f.x0).toBeCloseTo(span / 0.8, 6);
    expect((f.x0 + f.x1) / 2).toBeCloseTo((ISA_7_14 + MATT_1_23 + 1) / 2, 6);
    // neighbours keep their chapter's context instead of driving to the zoom ceiling
    const n = pm.connectionFrame(100, 101);
    expect(n.x1 - n.x0).toBeCloseTo(pm.MIN_FRAME / 0.8, 6);
  });
});

describe('verse mode: John 3:16', () => {
  it('lists every thread it carries, grouped by book, and the Volumes that cite it', () => {
    const m = pm.verseModel(g, JOHN_3_16, { density: 'famous', corpus });
    expect(m.ref.label).toBe('John 3:16');
    expect(m.text).toBe('TEXT john 3:16');
    expect(m.threads.total).toBe(48);
    expect(m.threads.total).toBe(pm.connectionsAt(g, JOHN_3_16, 'famous'));
    expect(m.cited.length).toBe(5);
    expect(m.threads.groups.reduce((n, gr) => n + gr.rows.length, 0)).toBe(48);
  });
});

describe('group mode', () => {
  it('a chapter lists its threads by the book they go to and zooms to itself', () => {
    const ci = g.chapterOfVerse[ISA_7_14];
    const [lo, hi] = [g.chapters[ci][2], g.chapters[ci][2] + g.chapters[ci][3] - 1];
    const m = pm.rangeModel(g, lo, hi, 'famous');
    expect(m.threads.total).toBe(65);
    expect(m.threads.groups.length).toBe(25);
    expect(m.zoom).toBe(ci);
    expect(pm.chapterName(g, ci)).toBe('Isaiah 7');
    const f = pm.chapterFrame(g, ci);
    expect((hi + 1 - lo) / (f.x1 - f.x0)).toBeCloseTo(0.7, 6);
  });

  it('the chooser lists strongest first and zooms to where most feet stand', () => {
    const ids = [ARC, ...pm.threadsFrom(g, ISA_7_14, ISA_7_14, 'famous').ids.slice(0, 5)];
    const rows = pm.chooserRows(g, ids);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].votes).toBeGreaterThanOrEqual(rows[i].votes);
    expect(rows.find((r) => r.index === ARC)).toMatchObject({ votes: 183, span: MATT_1_23 - ISA_7_14 });
    expect(rows.find((r) => r.index === ARC).a.label).toBe('Isaiah 7:14');
    expect(pm.zoomChapterOf(g, ids)).toBe(g.chapterOfVerse[ISA_7_14]);
    expect(pm.zoomChapterOf(g, [])).toBe(-1);
  });
});

describe('letter mode', () => {
  it('lists the verses a letter cites, each with its text and reader endpoint', () => {
    const rows = pm.letterRows(g, 'two/the-lord-comes-nigh');
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((r) => r.label)).toContain('Matthew 1:23');
    for (const r of rows) {
      expect(r.text).toMatch(/^TEXT /);
      expect(r.endpoint.type).toBe('bible');
      expect(r.label).not.toMatch(/[–—]/);
    }
  });
});

describe('a corpus thread opens its letter AT the citing paragraph (B4, item 15)', () => {
  it('names the collection as a reader knows it and keys the paragraph of the citing site', () => {
    const edge = g.votEdges.find((e) => e.key === 'two/the-lord-comes-nigh' && e.at && e.at[0] && e.at[0].p > 0)
      || g.votEdges.find((e) => e.letterId && e.at && e.at[0] && e.at[0].p > 0);
    const cite = ds.citationOfEdge(edge, null);
    expect(cite.collectionName).not.toBe(edge.volKey);
    expect(cite.paragraph).toBe(edge.at[0].p);
    const ep = endpointFor(cite);
    expect(ep.key).toBe('letter:' + edge.letterId + ':' + edge.at[0].p);
    expect(ep.collection).toBe(cite.collectionName);
  });
});

describe('shared pieces', () => {
  it('short references for crumbs and ASCII-hyphen passage labels', () => {
    expect(pm.shortRef(g, ISA_7_14)).toBe('Isa 7:14');
    expect(pm.passageLabel(g, JOHN_3_16, JOHN_3_16 + 2)).toBe('John 3:16-18');
    expect(pm.passageLabel(g, JOHN_3_16)).toBe('John 3:16');
  });

  it('the panel credits the cross-reference data (CC-BY)', () => {
    expect(g.attribution).toMatch(/OpenBible\.info/);
    expect(g.attribution).toMatch(/CC-BY/);
  });

  it('reads the chosen translation when it has the verse, the base when it does not', () => {
    globalThis.translateVerse = (bookId, ch, v, tr) => (tr === 'kjv' ? 'KJV ' + v.text : null);
    const ref = { bookId: 'john', chapter: 3, verse: 16 };
    expect(pm.verseText(ref, 'kjv')).toBe('KJV TEXT john 3:16');
    expect(pm.verseText(ref, 'web')).toBe('TEXT john 3:16');
    expect(pm.verseText(ref, 'nkjv')).toBe('TEXT john 3:16');
  });
});

/* The camera's clamp keeps the VIEW inside the canon, so near its end a verse centred at the
   reader's zoom stayed under the docked panel (w3 review). PC 1600x900 at DPR 1, panel 640. */
describe('framing under the camera clamp: landingOf, centreTarget, frameHolds', () => {
  const W = 1600, RIGHT = 640, AREA = W - RIGHT;
  const T = g.total;
  const fit = W / T;
  const cap = 44 * T / W; // web-frame maxZoomOf at DPR 1
  const at = (cam, target, x) => verseToX(pm.landingOf(cam, W, RIGHT, target, cap), W, x);

  it('landingOf is flyTo\'s maths: the canvas area\'s centre, the zoom held to [fit, cap], then the clamp', () => {
    const cam = { x: 15000, ppv: 1, total: T };
    expect(at(cam, { x: 15000 }, 15000)).toBeCloseTo(AREA / 2, 6);
    expect(pm.landingOf(cam, W, RIGHT, { x: 15000, zoom: 0.5 }, cap).ppv).toBeCloseTo(fit, 9);
    expect(pm.landingOf(cam, W, RIGHT, { x: 15000, zoom: cap * 2 }, cap).ppv).toBeCloseTo(fit * cap, 6);
    // at the canon's end the view stops at its last verse: x is left right of the area's centre
    expect(at(cam, { x: T - 100 }, T - 100)).toBeGreaterThan(AREA);
    expect(cam).toEqual({ x: 15000, ppv: 1, total: T }); // a copy: the camera is not moved
  });

  it('centreTarget keeps the reader\'s zoom wherever the clamp lets x be centred', () => {
    expect(pm.centreTarget({ x: 15000, ppv: 1, total: T }, W, RIGHT, 16000, cap)).toEqual({ x: 16000 });
    // the canon's start is in the area already: the clamp holds Genesis at the left edge
    expect(pm.centreTarget({ x: T / 2, ppv: fit, total: T }, W, RIGHT, 70.5, cap)).toEqual({ x: 70.5 });
    // no panel, nothing to keep out of
    expect(pm.centreTarget({ x: T / 2, ppv: fit, total: T }, W, 0, T - 40, cap)).toEqual({ x: T - 40 });
  });

  it('near the end it zooms in only as far as centring x needs, never out', () => {
    const cam = { x: T / 2, ppv: fit, total: T };
    const t = pm.centreTarget(cam, W, RIGHT, JOHN_3_16 + 0.5, cap);
    expect(t.zoom).toBeGreaterThan(1);
    expect(Math.abs(at(cam, t, JOHN_3_16 + 0.5) - AREA / 2)).toBeLessThanOrEqual(0.25);
    // a hair less zoom and the clamp would leave it right of centre
    expect(at(cam, { x: t.x, zoom: t.zoom * 0.98 }, JOHN_3_16 + 0.5)).toBeGreaterThan(AREA / 2 + 1);
    const deep = { x: T - 200, ppv: 30, total: T };
    expect(pm.centreTarget(deep, W, RIGHT, T - 300, cap)).toEqual({ x: T - 300 });
  });

  it('a verse the ceiling cannot bring out stays at the reader\'s zoom (a dive under the panel gains nothing)', () => {
    const cam = { x: T / 2, ppv: fit, total: T };
    expect(pm.centreTarget(cam, W, RIGHT, T - 0.5, cap)).toEqual({ x: T - 0.5 });
    // a few verses further in: the inner 90 % is reachable though the centre is not
    const near = pm.centreTarget(cam, W, RIGHT, T - 18.5, cap);
    expect(near.zoom).toBeGreaterThan(1);
    const x = at(cam, near, T - 18.5);
    expect(x).toBeGreaterThan(AREA / 2);
    expect(x).toBeLessThanOrEqual(0.9 * AREA + 0.01);
  });

  it('frameHolds: Isaiah 7:14 to Matthew 1:23 frames whole; Isaiah to Revelation and Genesis to Revelation cannot', () => {
    const cam = { x: T / 2, ppv: fit, total: T };
    const holds = (a, b) => pm.frameHolds(cam, W, RIGHT, pm.connectionFrame(a, b), a, b, cap);
    expect(holds(ISA_7_14, MATT_1_23)).toBe(true);
    expect(holds(ISA_7_14, T - 30)).toBe(false); // the clamp keeps its frame from the area's centre
    expect(holds(60, T - 200)).toBe(false); // wider than the area at fit
    expect(pm.frameHolds(cam, W, 0, pm.connectionFrame(60, T - 200), 60, T - 200, cap)).toBe(true); // no panel
  });
});
