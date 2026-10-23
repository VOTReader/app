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
import { windowCorpus, endpointFor, letterKeyOf } from './vot-citations.js';
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

  // s37.3: a bundle over a run of chapters was named with an en dash ("Genesis 1 – 3")
  it('a bundle over a run of chapters is named with an ASCII hyphen, across a book end too', () => {
    const cellOf = (c0, c1) => ({ lo: g.chapters[c0][2], hi: g.chapters[c1][2] + g.chapters[c1][3] - 1, chapterLo: c0, chapterHi: c1 });
    const label = (cell) => ds.describeFound({ kind: 'bundle', cell }, { g, density: 'famous' }).label;
    expect(label(cellOf(0, 2))).toBe('Genesis 1-3');
    expect(label(cellOf(49, 50))).toBe('Genesis 50-Exodus 1');
    expect(label(cellOf(0, 0))).toBe('Genesis 1');
  });

  it('a letter opens as its own mode: its title, its collection, the verses it cites', () => {
    const info = ds.describeFound({ kind: 'letter', letterKey: 'two/the-lord-comes-nigh' }, { g, density: 'famous' });
    expect(info.kind).toBe('letter');
    expect(ds.sheetEyebrow(info)).toBe('In the Volumes');
    expect(ds.sheetMeta(info)).toBe('Volume Two');
    expect(info.verses.length).toBeGreaterThan(0);
    expect(info.endpoint && info.endpoint.type).toBeTruthy();
  });

  it('says one count of what a letter cites: the live region and the list header agree (w3 review)', () => {
    const keys = [...new Set(g.votEdges.map((e) => e.key || letterKeyOf(e)))];
    let differed = 0;
    for (const key of keys) {
      const info = ds.describeFound({ kind: 'letter', letterKey: key }, { g, density: 'famous' });
      if (!info) continue;
      const n = pm.letterRows(g, key).length;
      if (info.verses.length !== n) differed++;
      expect(ds.summaryOf(info), key).toBe(info.title + ', ' + ds.plural(n, 'verse', 'verses') + ' it cites.');
    }
    // the review's case is real: counting distinct first verses undercounts the passages listed
    expect(differed).toBeGreaterThan(0);
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

  it('the chapter under a tap, which the chooser zooms to (w3 review: not the lowest of a tie)', () => {
    const W = 1280;
    const cam = { x: g.total / 2, ppv: W / g.total, total: g.total, y: 0 };
    // a tap at the middle of the overview: the chapter of the canon's middle verse
    expect(pm.chapterAtX(g, cam, W, W / 2)).toBe(g.chapterOfVerse[Math.floor(g.total / 2)]);
    expect(pm.chapterAtX(g, cam, W, 0)).toBe(0);
    expect(pm.chapterAtX(g, cam, W, W - 0.01)).toBe(g.chapters.length - 1);
    // zoomed on Isaiah 7:14: the tap's own verse
    const near = { x: ISA_7_14 + 0.5, ppv: 8, total: g.total, y: 0 };
    expect(pm.chapterAtX(g, near, W, W / 2)).toBe(g.chapterOfVerse[ISA_7_14]);
    // off the canon, and no graph: no chapter
    expect(pm.chapterAtX(g, cam, W, -5)).toBe(-1);
    expect(pm.chapterAtX(g, cam, W, W + 5)).toBe(-1);
    expect(pm.chapterAtX(null, cam, W, 10)).toBe(-1);
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

/* w3 review, round 2: "Zoom to" took the chapter on the baseline under the tap's x. A tap high on
   long arcs (the usual chooser at the overview) is over a chapter none of its threads touches, and
   zooming there sent every one of them off screen: the PC shot's four long threads offered
   "Zoom to Psalms 103". */
describe("the chooser's Zoom to: the tap's chapter only where its threads stand", () => {
  const chapterIndex = (bookId, ch) => g.chapterOfVerse[vid(bookId, ch, 1)];
  // the review's PC chooser: Gen 49:18 - Isa 25:9, 1 Sam 15:3 and 15:9 - Jer 48:10, 1 Chr 5:2 - Mic 5:2
  const IDS = [47313, 51165, 51166, 52185];
  const PS_103 = chapterIndex('psalms', 103), SAM_15 = chapterIndex('1samuel', 15);
  const JER_48 = chapterIndex('jeremiah', 48), GEN_49 = chapterIndex('genesis', 49);

  it("the fixture is the review's four threads", () => {
    expect(pm.chooserRows(g, IDS).map((r) => r.a.label + ' - ' + r.b.label)).toEqual(expect.arrayContaining([
      'Genesis 49:18 - Isaiah 25:9', '1 Samuel 15:3 - Jeremiah 48:10', '1 Samuel 15:9 - Jeremiah 48:10',
      '1 Chronicles 5:2 - Micah 5:2',
    ]));
  });

  it('a high tap over a chapter none of them touches goes where most feet stand, the nearer of a tie', () => {
    // 1 Samuel 15 and Jeremiah 48 hold two feet each; Jeremiah 48 is the nearer to Psalms 103
    expect(pm.chooserChapter(g, IDS, PS_103, false)).toBe(JER_48);
    // with no tap known, the lower of the tie, as before
    expect(pm.chooserChapter(g, IDS, -1, false)).toBe(SAM_15);
    expect(pm.zoomChapterOf(g, IDS)).toBe(SAM_15);
  });

  it("the tap's own chapter when a listed thread stands in it, or the tap is down among the feet", () => {
    expect(pm.chooserChapter(g, IDS, GEN_49, false)).toBe(GEN_49);
    expect(pm.chooserChapter(g, IDS, PS_103, true)).toBe(PS_103);
    expect(pm.chooserChapter(g, [], -1, false)).toBe(-1);
  });
});

/* The camera's clamp once kept the VIEW inside the canon, so near its end a verse centred at the
   reader's zoom stayed under the docked panel (w3 review), and the panel dived (zoomed in, up to
   the reader's x 4) to bring it out. The clamp now leaves the panel room: its slack lets the canon's
   end stop the outer tenth inside the CANVAS AREA's right edge (geometry.clampCamera's `right` and
   END_MARGIN), the area is the view, and nothing dives. These pin the area-as-view law the dive tests (centreTarget, diveLimit) stood
   in for: what the panel opens stands in the area at the reader's own zoom. PC 1600x900 at DPR 1,
   panel 640. */
describe('framing under the camera clamp: landingOf and frameHolds, with the panel\'s slack', () => {
  const W = 1600, RIGHT = 640, AREA = W - RIGHT;
  const T = g.total;
  const fit = W / T;
  const cap = 44 * T / W; // web-frame maxZoomOf at DPR 1
  const land = (cam, target) => pm.landingOf(cam, W, RIGHT, target, cap);
  const at = (cam, target, x) => verseToX(land(cam, target), W, x);

  it('landingOf is flyTo\'s maths: the canvas area\'s centre, the zoom held to [fit, cap], then the clamp', () => {
    const cam = { x: 15000, ppv: 1, total: T };
    expect(at(cam, { x: 15000 }, 15000)).toBeCloseTo(AREA / 2, 6);
    expect(land(cam, { x: 15000, zoom: 0.5 }).ppv).toBeCloseTo(fit, 9);
    expect(land(cam, { x: 15000, zoom: cap * 2 }).ppv).toBeCloseTo(fit * cap, 6);
    expect(cam).toEqual({ x: 15000, ppv: 1, total: T }); // a copy: the camera is not moved
  });

  it('at the canon\'s end its last verse stops the outer tenth inside the area: x stands in the area, not under the panel', () => {
    const cam = { x: 15000, ppv: 1, total: T };
    const x = at(cam, { x: T - 100 }, T - 100);
    expect(x).toBeGreaterThan(AREA / 2);
    expect(x).toBeLessThan(0.9 * AREA);
    expect(at(cam, { x: T - 100 }, T)).toBeCloseTo(0.9 * AREA, 6);
    // Revelation's last verse, at the reader's zoom: just inside the area's outer tenth, clear of the
    // panel's border (w4 phone review), its threads all inward
    const last = at(cam, { x: T - 0.5 }, T - 0.5);
    expect(last).toBeGreaterThan(0.85 * AREA);
    expect(last).toBeLessThanOrEqual(0.9 * AREA);
    expect(land(cam, { x: T - 0.5 }).ppv).toBe(1);
    // the canon's start: Genesis stands in the area, its first verse no nearer the left edge than
    // the area's outer tenth (END_MARGIN, w4 phone review round 2)
    expect(at({ x: T / 2, ppv: fit, total: T }, { x: 70.5 }, 70.5)).toBeGreaterThan(0);
    expect(at(cam, { x: 0.5 }, 0)).toBeCloseTo(0.1 * AREA, 6);
    // no panel, no slack: the view's own edges, as before
    expect(verseToX(pm.landingOf(cam, W, 0, { x: T - 100 }, cap), W, T)).toBeCloseTo(W, 6);
  });

  /* w3 review, round 2 (major): the dive that brought Revelation 21:4 out from the overview went to
     489x, a curtain of vertical legs; bounded at the reader's x 4 it still changed the reader's
     zoom to open a verse. With the slack nothing needs a dive. */
  it('what the panel opens from the overview keeps the overview\'s zoom and stands in the area', () => {
    const over = { x: T / 2, ppv: fit, total: T };
    for (const v of [JOHN_3_16, vid('revelation', 17, 1), vid('revelation', 21, 4), T - 1]) {
      const c = land(over, { x: v + 0.5 });
      expect(c.ppv).toBeCloseTo(fit, 12);
      const x = verseToX(c, W, v + 0.5);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(AREA);
    }
    // John 3:16 deep in: centred at the reader's zoom
    const deep = { x: JOHN_3_16, ppv: 0.286, total: T };
    expect(at(deep, { x: JOHN_3_16 + 0.5 }, JOHN_3_16 + 0.5)).toBeCloseTo(AREA / 2, 6);
  });

  it('frameHolds: Isaiah 7:14 to Matthew 1:23 and Isaiah to Revelation 22 frame whole; Genesis to Revelation cannot', () => {
    const cam = { x: T / 2, ppv: fit, total: T };
    const holds = (a, b) => pm.frameHolds(cam, W, RIGHT, pm.connectionFrame(a, b), a, b, cap);
    expect(holds(ISA_7_14, MATT_1_23)).toBe(true);
    expect(holds(ISA_7_14, T - 30)).toBe(true); // the clamp's slack lets its frame reach the canon's end
    expect(holds(60, T - 200)).toBe(false); // wider than the area at fit
    expect(pm.frameHolds(cam, W, 0, pm.connectionFrame(60, T - 200), 60, T - 200, cap)).toBe(true); // no panel
  });

  /* w4 phone review (major): the clamp stopped the canon's last verse exactly at the area's right
     edge, eating the outer tenth connectionFrame asks for, so Revelation 22:16's foot stood on the
     panel's border, its dot half under the panel (PC 959.68 of 960, phone 516.9 of 517). */
  /* w4 phone review round 2 (minor): the same at the canon's start. The clamp held Genesis 1:1 at
     the view's left edge, so Genesis 1:1 <-> John 1:1 (wider than the area at fit, so its near foot
     is brought in) left the foot at x 6 to 8 at 12 px a verse on PC, its dot against the screen's
     edge (the line above pins that case). With the panel docked the start stands the outer tenth
     inside the area too, so a thread that fits frames with its margin; no panel, as before. */
  it('Genesis 1:1 to Job 38:4 frames with both feet the outer tenth inside the area, PC and phone', () => {
    const GEN_1_1 = vid('genesis', 1, 1), JOB_38_4 = vid('job', 38, 4);
    for (const [w, right] of [[W, RIGHT], [891 * 2.6, 374 * 2.6]]) {
      const area = w - right, capW = 44 * T / w;
      const cam = { x: T / 2, ppv: w / T, total: T };
      const frame = pm.connectionFrame(GEN_1_1, JOB_38_4);
      expect(pm.frameHolds(cam, w, right, frame, GEN_1_1, JOB_38_4, capW)).toBe(true);
      const c = pm.landingOf(cam, w, right, frame, capW);
      for (const v of [GEN_1_1, JOB_38_4]) {
        const f = verseToX(c, w, v + 0.5) / area;
        expect(f, w + ': verse ' + v).toBeGreaterThanOrEqual(0.1 - 1e-6);
        expect(f, w + ': verse ' + v).toBeLessThanOrEqual(0.9 + 1e-6);
      }
    }
  });

  it('Isaiah 11:1 to Revelation 22:16 frames with both feet the outer tenth inside the area, PC and phone', () => {
    const ISA_11_1 = vid('isaiah', 11, 1), REV_22_16 = vid('revelation', 22, 16);
    // PC 1600 wide at DPR 1, panel 640; phone landscape 891 at DPR 2.6, panel 374 CSS px
    for (const [w, right] of [[W, RIGHT], [891 * 2.6, 374 * 2.6]]) {
      const area = w - right, capW = 44 * T / w;
      const cam = { x: T / 2, ppv: w / T, total: T };
      const frame = pm.connectionFrame(ISA_11_1, REV_22_16);
      expect(pm.frameHolds(cam, w, right, frame, ISA_11_1, REV_22_16, capW)).toBe(true);
      const c = pm.landingOf(cam, w, right, frame, capW);
      for (const v of [ISA_11_1, REV_22_16]) {
        const f = verseToX(c, w, v + 0.5) / area;
        expect(f).toBeGreaterThanOrEqual(0.1 - 1e-6);
        expect(f).toBeLessThanOrEqual(0.9 + 1e-6);
      }
    }
  });
});
