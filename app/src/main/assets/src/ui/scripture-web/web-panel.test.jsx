// @ts-nocheck
/**
 * The docked panel (web-panel.jsx), mounted on the shipped asset and the whole public corpus:
 * every mode's words and rows, the actions each row hands back, the lit set it writes through
 * lightThreads, and the focus law (digest #46: a non-modal dialog, no trap). The screen's own
 * tests cover the panel inside the web; these cover what it draws.
 *
 * The verse text comes from the app's free-global resolver, stubbed per test ('TEXT book c:v').
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { decodeGraph } from '../../utils/scripture-web/decode.js';
import * as ds from '../../utils/scripture-web/describe.js';
import * as pm from '../../utils/scripture-web/panel-model.js';
import { WebPanel, modeOfDetail, subjectKey, strongestFirst, CITED_SHOWN, GO_ON_SHOWN, trailScroll } from './web-panel.jsx';
import { arrive, moveTo, stopOf, chainTo, pathOf, EMPTY_TRAIL } from './use-journey.js';
import * as geo from '../../utils/scripture-web/geometry.js';
import { frameSetAt } from '../../utils/scripture-web/frame-set.js';
import { webFrame } from '../../utils/scripture-web/web-frame.js';
import { exitCensus, exitIds, fanGroups, areaLabel } from '../../utils/scripture-web/exits.js';
import { hereLabel } from './goto.jsx';

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
beforeAll(() => {
  for (const f of CORPUS_FILES) runInNewContext(readFileSync(resolve(DATA, f), 'utf8'), globals, { filename: f });
  // the panel reads the Volumes off the window, as the app's corpus loader leaves them
  Object.assign(window, globals);
});

function vid(bookId, ch, v) {
  const bi = g.books.findIndex((b) => b.id === bookId);
  const row = g.chapters.find((c) => c[0] === bi && c[1] === ch);
  return row[2] + v - 1;
}
const ISA_7_14 = vid('isaiah', 7, 14);
const JOHN_3_16 = vid('john', 3, 16);
const ARC = 43830; // Isaiah 7:14 <-> Matthew 1:23
const ctx = { g, density: 'famous', v: {}, viewFor: () => null };
const found = (f) => ds.describeFound(f, ctx);
const arcOf = (i) => found({ kind: 'arc', hit: { index: i, from: g.from[i], to: g.to[i], votes: g.votes[i] } });

let saved;
beforeEach(() => {
  saved = { r: globalThis.resolveVerseText, t: globalThis.translateVerse };
  globalThis.resolveVerseText = (ep) => 'TEXT ' + ep.bookId + ' ' + ep.chapter + ':' + ep.verse;
  delete globalThis.translateVerse;
});
afterEach(() => {
  cleanup();
  globalThis.resolveVerseText = saved.r;
  globalThis.translateVerse = saved.t;
});

/** A journey as the panel reads it (use-journey.js): a real trail, every move a spy. */
function journeyOf(t) {
  return {
    trail: t, path: pathOf(t), here: stopOf(t, t.at), stack: chainTo(t, t.at),
    push() {}, clear: vi.fn(), back: vi.fn(() => null), forward: vi.fn(() => null), go: vi.fn(() => null), connect() {},
  };
}
/** A trail walked along threads: [verse, label, arc] steps, each from the one before. */
function walked(...steps) {
  const at = ([verse, label, arc]) => ({ verse, label, open: { mode: 'verse', verse }, via: arc >= 0 ? { arc } : undefined });
  let t = arrive(EMPTY_TRAIL, at(steps[1]), at(steps[0]));
  for (let k = 2; k < steps.length; k++) t = arrive(t, at(steps[k]), at(steps[k - 1]));
  return t;
}

function mount(over = {}) {
  const props = {
    graph: g, mode: 'canonical', density: 'famous', translation: undefined, compact: false,
    listOpen: false, listItems: [], lensOn: false, choices: null, detail: null,
    journey: { stack: [], push() {}, clear() {}, back: () => null },
    onClose: vi.fn(), onChoose: vi.fn(), openPanel: vi.fn(() => true), followThread: vi.fn(),
    followRow: vi.fn(), zoomTo: vi.fn(), onOpen: vi.fn(), lightThreads: vi.fn(), flyTo: vi.fn(), // flyTo: not WebPanel's (a guard: Back must not fly)
    ...over,
  };
  const r = render(<WebPanel {...props} />);
  const panel = r.container.querySelector('.sw-panel');
  const byLabel = (re) => [...panel.querySelectorAll('button')].filter((b) => re.test(b.getAttribute('aria-label') || ''));
  const byText = (re) => [...panel.querySelectorAll('button')].filter((b) => re.test(b.textContent));
  return { ...r, props, panel, byLabel, byText };
}

describe('the pieces', () => {
  it('modeOfDetail: each card kind to the panel mode that draws it', () => {
    expect(modeOfDetail(null)).toBeNull();
    expect(modeOfDetail({ kind: 'arc' })).toBe('connection');
    expect(modeOfDetail({ kind: 'verse' })).toBe('verse');
    expect(modeOfDetail({ kind: 'chapter' })).toBe('group');
    expect(modeOfDetail({ kind: 'bundle' })).toBe('group');
    expect(modeOfDetail({ kind: 'letter' })).toBe('letter');
    expect(modeOfDetail({ kind: 'link' })).toBe('myweb');
    expect(modeOfDetail({ kind: 'underlay' })).toBe('myweb');
  });

  it('subjectKey: one per subject, so a Follow along the same thread keeps its place', () => {
    const a = { kind: 'arc', index: 5, far: 'to' };
    expect(subjectKey('connection', a)).toBe(subjectKey('connection', { ...a, far: 'from' }));
    expect(subjectKey('connection', { kind: 'arc', index: -1, prophecyIndex: 3 })).toBe('arc:p3');
    expect(subjectKey('verse', { kind: 'verse', verse: 9 })).not.toBe(subjectKey('verse', { kind: 'verse', verse: 10 }));
    expect(subjectKey('list', null)).toBe('list');
    expect(subjectKey('chooser', null, [{ kind: 'arc', index: 1 }, { kind: 'arc', index: 2 }])).toBe('choose:arc1,arc2');
  });

  it('strongestFirst: votes, then the shorter thread, then the order given; My Web rows keep their place', () => {
    const rows = [
      { kind: 'arc', index: 1, votes: 4, span: 10 }, { kind: 'arc', index: 2, votes: 9, span: 50 },
      { kind: 'arc', index: 3, votes: 9, span: 20 }, { kind: 'arc', index: 4, votes: 4, span: 10 },
    ];
    expect(strongestFirst(rows).map((r) => r.index)).toEqual([3, 2, 1, 4]);
    const mine = [{ kind: 'link', index: 7 }, { kind: 'link', index: 3 }];
    expect(strongestFirst(mine).map((r) => r.index)).toEqual([7, 3]);
  });
});

describe('connection mode: Isaiah 7:14 <-> Matthew 1:23', () => {
  const detail = () => ({ ...arcOf(ARC), far: 'to' });

  it('is a non-modal dialog with the overline, the "A <-> B" title and the votes and distance', () => {
    const { panel } = mount({ detail: detail() });
    expect(panel.classList.contains('sw-sheet')).toBe(true);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('false');
    expect(panel.getAttribute('data-mode')).toBe('connection');
    expect(panel.querySelector('.sw-panel-over').textContent).toBe('Connection');
    expect(panel.querySelector('.sw-panel-title').textContent).toBe('Isaiah 7:14 ↔ Matthew 1:23');
    expect(panel.querySelector('.sw-panel-meta').textContent).toMatch(/^183 votes · [\d,]+ verses apart$/);
  });

  /* w4 quality hunt: the screen's root is role="application" (the web's own keys), and in it
     NVDA and JAWS stop the virtual cursor, so the verse text the panel exists to show could not
     be read without forcing browse mode. The panel's body is a document: it reads as one. */
  it('its body is a document, so a screen reader reads the verses in browse mode', () => {
    const { panel } = mount({ detail: detail() });
    const body = panel.querySelector('.sw-panel-body');
    expect(body.getAttribute('role')).toBe('document');
    expect(body.textContent).toContain('TEXT isaiah 7:14');
  });

  /* w4 (the phone): a 24 px title in a 333 px panel read "Isaiah 11:1 ↔ Revelation" / "22:16".
     Each end is its own box, so the line breaks at the arrow and a reference stays whole (a
     reference wider than the line still wraps in its own box). The text reads as before. */
  it('the title breaks at the arrow, never inside a reference; its text reads as before', () => {
    const { panel } = mount({ detail: detail(), compact: true });
    const title = panel.querySelector('.sw-panel-title');
    expect([...title.querySelectorAll('.sw-title-end')].map((e) => e.textContent)).toEqual(['Isaiah 7:14 ↔', 'Matthew 1:23']);
    expect(title.textContent).toBe('Isaiah 7:14 ↔ Matthew 1:23');
  });

  it('shows both verses in full, each with "Open in reader", and Follow names the far end', () => {
    const { panel, byLabel, props } = mount({ detail: detail() });
    const refs = [...panel.querySelectorAll('.sw-verse-ref')].map((e) => e.textContent);
    expect(refs).toEqual(['Isaiah 7:14', 'Matthew 1:23']);
    expect([...panel.querySelectorAll('.sw-verse-text')].map((e) => e.textContent))
      .toEqual(['TEXT isaiah 7:14', 'TEXT matthew-plain 1:23']);
    const open = byLabel(/^Open in reader: Isaiah 7:14$/);
    expect(open).toHaveLength(1);
    fireEvent.click(open[0]);
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ type: 'bible', bookId: 'isaiah', chapter: 7, verse: 14 }));
    // the far end named, its name the words it shows (w3 review), one wording on PC and phone (w4)
    const follow = byLabel(/^Follow to Matthew 1:23$/);
    expect(follow).toHaveLength(1);
    expect(follow[0].textContent).toBe('Follow to Matthew 1:23 ›');
    expect(panel.textContent).not.toContain('Follow to the other end');
    fireEvent.click(follow[0]);
    expect(props.followThread).toHaveBeenCalledWith(expect.objectContaining({ index: ARC, far: 'to' }));
  });

  it('compact, Follow is the same words, its name the words it shows, on the row with "Open in reader" (w4)', () => {
    const { panel, byLabel, props } = mount({ detail: detail(), compact: true });
    const follow = byLabel(/^Follow to Matthew 1:23$/);
    expect(follow).toHaveLength(1);
    expect(follow[0].textContent).toBe('Follow to Matthew 1:23 ›');
    expect(follow[0].parentElement.querySelector('.sw-link').textContent).toMatch(/^Open in reader/);
    fireEvent.click(follow[0]);
    expect(props.followThread).toHaveBeenCalledWith(expect.objectContaining({ index: ARC, far: 'to' }));
    expect(panel.textContent).not.toContain('Follow to the other end');
  });

  it('two citations show before "Show n more", as r2-02 shows them, so More from begins on the first screen (w4)', () => {
    expect(CITED_SHOWN).toBe(2);
    const { panel } = mount({ detail: detail() });
    const n = Number(/· (\d+)$/.exec(panel.querySelector('.sw-sec-cited .sw-sec-title').textContent)[1]);
    expect(n).toBeGreaterThan(2);
    expect(panel.querySelector('.sw-sec-cited .sw-more').textContent).toBe('Show ' + (n - 2) + ' more');
  });

  /* w4: the quote clamps at two lines (r2-02), and "more" asked the text's length (180), not the
     clamp: on a phone two lines hold about 100 characters, so a 150-character quote was cut with
     no way to read the rest. Where there is layout, "more" is offered when the clamp cuts. */
  it('a quote the clamp cuts offers "more", and one it does not cut does not', () => {
    const dims = { client: 44, scroll: 88 };
    const own = (k) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
    const saved = { c: own('clientHeight'), s: own('scrollHeight') };
    const quoteOnly = (v) => function () { return this.classList && this.classList.contains('sw-cite-quote') ? v() : 0; };
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: quoteOnly(() => dims.client) });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: quoteOnly(() => dims.scroll) });
    try {
      let { panel } = mount({ detail: detail() });
      const quotes = panel.querySelectorAll('.sw-cite-quote');
      expect(quotes.length).toBeGreaterThan(0);
      for (const q of quotes) expect(q.classList.contains('is-clamped')).toBe(true);
      expect(panel.querySelectorAll('.sw-quote-more').length, 'cut: more').toBe(quotes.length);
      // the row's quiet link, as "Verses it cites" is (w4 review: an underlined grey third look)
      for (const b of panel.querySelectorAll('.sw-quote-more')) expect(b.className).toMatch(/\bsw-link\b.*\bsw-link-quiet\b/);
      // each more names its passage, and flips with it (s27.1)
      const more = panel.querySelector('.sw-quote-more');
      expect(more.getAttribute('aria-label')).toMatch(/^more of \S/);
      fireEvent.click(more);
      expect(more.getAttribute('aria-label')).toMatch(/^less of \S/);
      cleanup();
      dims.scroll = 44;
      ({ panel } = mount({ detail: detail() }));
      expect(panel.querySelectorAll('.sw-quote-more').length, 'not cut: no more').toBe(0);
    } finally {
      for (const [k, d] of [['clientHeight', saved.c], ['scrollHeight', saved.s]]) {
        if (d) Object.defineProperty(HTMLElement.prototype, k, d); else delete HTMLElement.prototype[k];
      }
    }
  });

  it('CITED IN THE VOLUMES: each entry with its letter, collection and "Open letter" at the citing place', () => {
    const { panel, byLabel, props } = mount({ detail: detail() });
    const head = panel.querySelector('.sw-sec-cited .sw-sec-title').textContent;
    const n = Number(/· (\d+)$/.exec(head)[1]);
    expect(n).toBeGreaterThan(0);
    const cites = panel.querySelectorAll('.sw-cite');
    expect(cites.length).toBe(Math.min(n, CITED_SHOWN));
    for (const c of cites) {
      expect(c.querySelector('.sw-cite-title').textContent.length).toBeGreaterThan(0);
      expect(c.querySelector('.sw-cite-source').textContent).toMatch(/ · (Isaiah 7:14|Matthew 1:23)/);
    }
    const letters = byLabel(/ where it cites /);
    expect(letters.length).toBe(cites.length);
    fireEvent.click(letters[0]);
    expect(props.onOpen).toHaveBeenCalledTimes(1);
    expect(props.onOpen.mock.calls[0][0]).toBeTruthy();
  });

  it('MORE FROM each end: the first open, grouped by book, each row a way on, the sort said', () => {
    const { panel, props } = mount({ detail: detail() });
    const more = [...panel.querySelectorAll('.sw-sec-more')];
    expect(more).toHaveLength(2);
    expect(more[0].querySelector('.sw-sec-title').textContent).toMatch(/^More from Isaiah 7:14 · \d+ connections?$/);
    expect(more[1].querySelector('.sw-sec-title').textContent).toMatch(/^More from Matthew 1:23 · /);
    expect(more[0].querySelector('.sw-sec-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(more[1].querySelector('.sw-sec-toggle').getAttribute('aria-expanded')).toBe('false');
    // w4 screen-reader hunt: the CSS capitals went into the name ("MORE FROM GENESIS 3:6"); the
    // head is named in the title's own case
    expect(more[0].querySelector('.sw-sec-toggle').getAttribute('aria-label')).toBe(more[0].querySelector('.sw-sec-title').textContent);
    expect(more[0].querySelector('.sw-sec-toggle').getAttribute('aria-label')).toMatch(/^More from Isaiah 7:14 · /);
    expect(more[0].querySelector('.sw-sort-note').textContent).toBe('Strongest first in each book.');
    // the first book is open; its rows never list the chosen thread
    const rows = more[0].querySelectorAll('.sw-group .sw-row');
    expect(rows.length).toBeGreaterThan(0);
    // each row is a way on (2026-11-03): the whole row is one control, and it goes there
    const ways = [...more[0].querySelectorAll('.sw-group .sw-row-go .sw-row-main')];
    expect(ways.length).toBe(rows.length);
    for (const w of ways) expect(w.getAttribute('aria-label')).toMatch(/^Go to .+, \d+ votes?$/);
    expect(more[0].querySelectorAll('.sw-row-follow, .sw-row-open').length, 'no second and third button on a row').toBe(0);
    fireEvent.click(ways[0]);
    expect(props.followRow).toHaveBeenCalledWith(expect.objectContaining({ hereVerse: ISA_7_14 }));
    expect(props.followRow.mock.calls[0][0].index).not.toBe(ARC);
    // a closed book opens on its header; the second end opens on its own
    fireEvent.click(more[1].querySelector('.sw-sec-toggle'));
    expect(more[1].querySelectorAll('.sw-group').length).toBeGreaterThan(0);
  });

  // Corbin, 2026-10-22: "More from Nehemiah 1:5 · 8 connections" opened with its rows under the
  // panel's edge, so the toggle seemed to do nothing.
  // the dead-control hunt, 2026-10-22: "Deuteronomy · 46" opened with every row under the edge
  it('a book group opened by its header brings itself into view; the first, open at mount, does not', () => {
    const seen = [];
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (o) { seen.push([this.className, o && o.block]); };
    try {
      const { panel } = mount({ detail: detail() });
      const heads = [...panel.querySelectorAll('.sw-sec-more')[0].querySelectorAll('.sw-group-head')];
      expect(heads.length).toBeGreaterThan(1);
      expect(seen).toEqual([]);
      fireEvent.click(heads[1]);
      expect(heads[1].getAttribute('aria-expanded')).toBe('true');
      expect(seen).toEqual([['sw-group', 'nearest']]);
      fireEvent.click(heads[1]);
      expect(seen, 'closing moves nothing').toHaveLength(1);
    } finally {
      Element.prototype.scrollIntoView = was;
    }
  });

  it('a section opened by its toggle brings itself into view; mounting open or closing does not', () => {
    const seen = [];
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (o) { seen.push([this.className, o && o.block]); };
    try {
      const { panel } = mount({ detail: detail() });
      expect(seen, 'the first end opens on its own, unscrolled').toEqual([]);
      const more = [...panel.querySelectorAll('.sw-sec-more')];
      fireEvent.click(more[1].querySelector('.sw-sec-toggle'));
      expect(seen).toEqual([['sw-sec sw-sec-more', 'nearest']]);
      fireEvent.click(more[1].querySelector('.sw-sec-toggle'));
      expect(seen, 'closing moves nothing').toHaveLength(1);
    } finally {
      Element.prototype.scrollIntoView = was;
    }
  });

  it('a row under the pointer lights its thread, and lets go when the pointer leaves', () => {
    const { panel, props } = mount({ detail: detail() });
    const row = panel.querySelector('.sw-sec-more .sw-row');
    fireEvent.mouseEnter(row);
    const lit = props.lightThreads.mock.calls.at(-1)[0];
    expect(lit).toHaveLength(1);
    fireEvent.mouseLeave(row);
    expect(props.lightThreads).toHaveBeenLastCalledWith(null);
    // a book's header lights its group
    const headBtn = panel.querySelector('.sw-group-head');
    fireEvent.focus(headBtn);
    expect(props.lightThreads.mock.calls.at(-1)[0].length).toBe(panel.querySelector('.sw-group .sw-rows').children.length);
  });

  // Corbin, 2026-10-29: "We don't need huge credit lines about OpenBible really anywhere except for
  // a small spot in sweb": the legend's tail is that spot, so the panel carries none
  it('carries no credit line: the legend\'s small one is the web\'s', () => {
    for (const compact of [false, true]) {
      const { panel } = mount({ detail: detail(), compact });
      expect(panel.querySelector('.sw-panel-credit')).toBeNull();
      expect(panel.textContent).not.toContain(g.attribution);
      cleanup();
    }
  });

  /* w4 review (s04b phone): scrolled, the pinned close X sat over the Cited head's chevron and left
     a sliver of it showing under its box. Once the body is scrolled the panel says so, and app.css
     lays a full-width band under the X, so what scrolls up passes under one clean edge. */
  it('the panel says when its body is scrolled, and says so no more back at the top or on a new card', () => {
    const { panel, rerender, props } = mount({ detail: detail(), compact: true });
    const body = panel.querySelector('.sw-panel-body');
    const scrollTo = (y) => {
      Object.defineProperty(body, 'scrollTop', { configurable: true, writable: true, value: y });
      fireEvent.scroll(body);
    };
    expect(panel.hasAttribute('data-scrolled')).toBe(false);
    scrollTo(120);
    expect(panel.getAttribute('data-scrolled')).toBe('1');
    scrollTo(0);
    expect(panel.hasAttribute('data-scrolled')).toBe(false);
    scrollTo(120);
    // a new card starts at its top
    rerender(<WebPanel {...props} detail={found({ kind: 'verse', verse: JOHN_3_16 })} />);
    expect(panel.hasAttribute('data-scrolled')).toBe(false);
  });

  /* w4 review round 2 (major): the band came on whole at 2 px of scroll, and its solid top (about
     50 px) is where the trail stands, so a 3 px nudge hid "Whole web › Isa 7:14" and its Back at
     once, still live under it. The band comes in with the scroll (--sw-scrolled, 0 to 1, for
     app.css's opacity): next to nothing while the head is still there, whole once the head has
     scrolled the band's own height (60 px on PC, 54 compact), back to nothing at the top. */
  it('the band comes in with the scroll: next to nothing at 3 px, whole at the band\'s height, gone at the top or on a new card', () => {
    for (const [compact, h] of /** @type {[boolean, number][]} */ ([[false, 60], [true, 54]])) {
      const { panel, rerender, props } = mount({ detail: detail(), compact });
      const body = panel.querySelector('.sw-panel-body');
      const scrollTo = (y) => {
        Object.defineProperty(body, 'scrollTop', { configurable: true, writable: true, value: y });
        fireEvent.scroll(body);
      };
      const band = () => Number(panel.style.getPropertyValue('--sw-scrolled') || 0);
      scrollTo(3);
      expect(band(), (compact ? 'compact' : 'PC') + ': a 3 px nudge leaves the trail in view').toBeLessThanOrEqual(0.06);
      scrollTo(h / 2);
      expect(band()).toBeCloseTo(0.5, 6);
      scrollTo(h);
      expect(band(), 'the head scrolled the band\'s height: whole').toBe(1);
      scrollTo(400);
      expect(band()).toBe(1);
      scrollTo(0);
      expect(band(), 'back at the top').toBe(0);
      scrollTo(400);
      rerender(<WebPanel {...props} detail={found({ kind: 'verse', verse: JOHN_3_16 })} />);
      expect(band(), 'a new card starts at its top').toBe(0);
      cleanup();
    }
  });

  /* w4 (the s04 phone shot read "Ps 103:2 › Isa 7:14"): each crumb named the verse under the
     centre when the step was taken, so the whole web read as whatever verse sat mid-canon (Psalm
     103:2) and a book or a chapter read as its first verse. A crumb names the place the trail
     holds, its book abbreviated as the verse crumbs are. */
  it('a crumb names the place it holds: the whole web, a book, a chapter, a verse', () => {
    // one name for the whole web, the go-to's and the trail's (w4 review: two literals had to agree)
    expect(hereLabel(g, [0, g.total], 15551, true)).toBe(ds.WHOLE_WEB);
    const places = [
      [vid('psalms', 103, 2), ds.WHOLE_WEB], [vid('romans', 1, 1), 'Romans'], [vid('john', 3, 1), 'John 3'],
      [vid('1corinthians', 13, 1), '1 Corinthians 13'], [ISA_7_14, 'Isaiah 7:14'], [g.to[ARC], 'Matthew 1:23'],
    ];
    let t = arrive(EMPTY_TRAIL, { verse: places[1][0], label: places[1][1] }, { verse: places[0][0], label: places[0][1] });
    for (const [verse, label] of places.slice(2)) t = arrive(t, { verse, label });
    const { panel } = mount({ detail: detail(), journey: journeyOf(t) });
    expect([...panel.querySelectorAll('.sw-trail-stops li')].map(shownText))
      .toEqual(['Whole web', 'Romans', 'John 3', '1Cor 13', 'Isa 7:14', 'Matt 1:23']);
    // a crumb that shortens its stop's name is named in full for a screen reader
    const romans = [...panel.querySelectorAll('.sw-trail-stops .sw-crumb')].find((b) => b.textContent === '1Cor 13');
    expect(romans.getAttribute('aria-label')).toBe('1 Corinthians 13');
  });

  /* THE TRAIL BAR (2026-11-03): pinned over the scroll, so the way back never scrolls away. */
  it('the trail bar: pinned over the scroll, where the reader is marked, the way ahead dimmer', () => {
    const MATT = g.to[ARC];
    let t = walked([ISA_7_14, 'Isaiah 7:14'], [MATT, 'Matthew 1:23', ARC], [JOHN_3_16, 'John 3:16', 7]);
    t = moveTo(t, chainTo(t, t.at)[1].id);   // back one: at Matthew 1:23, John 3:16 ahead
    const journey = journeyOf(t);
    const { panel, byLabel, props } = mount({ detail: found({ kind: 'verse', verse: MATT }), journey });
    const bar = panel.querySelector('.sw-trail');
    expect(bar.parentElement, 'outside the scroll: pinned').toBe(panel);
    expect(bar.getAttribute('aria-label')).toBe('Your path');
    expect(panel.getAttribute('data-trail')).toBe('1');
    const crumbs = [...bar.querySelectorAll('.sw-trail-stops li')];
    expect(crumbs.map(shownText)).toEqual(['Isa 7:14', 'Matt 1:23', 'John 3:16']);
    expect(crumbs[1].classList.contains('is-here')).toBe(true);
    const at = crumbs[1].querySelector('[aria-current="location"]');
    expect(at).toBeTruthy();
    // h1104-7: an aria-label on a plain span goes unread; the full name is said in words a screen
    // reader reads, the short one hidden from it
    expect(at.getAttribute('aria-label')).toBeNull();
    expect(at.querySelector('.sw-sr-only').textContent).toBe('Matthew 1:23');
    expect(crumbs[1].querySelector('.sw-crumb'), 'where the reader stands is no button').toBeNull();
    expect(crumbs[2].classList.contains('is-ahead')).toBe(true);
    // Back and Forward name where they go, and hand the move to the trail: it flies (never the panel)
    fireEvent.click(byLabel(/^Back to Isaiah 7:14$/)[0]);
    expect(journey.back).toHaveBeenCalledTimes(1);
    fireEvent.click(byLabel(/^Forward to John 3:16$/)[0]);
    expect(journey.forward).toHaveBeenCalledTimes(1);
    fireEvent.click(crumbs[0].querySelector('.sw-crumb'));
    expect(journey.go).toHaveBeenCalledWith(chainTo(t, t.at)[0].id);
    fireEvent.click(crumbs[2].querySelector('.sw-crumb'));
    expect(journey.go).toHaveBeenLastCalledWith(t.stops.find((x) => x.verse === JOHN_3_16).id);
    expect(props.flyTo).not.toHaveBeenCalled();
    // at the start of the trail there is no Back, and with nothing gone on to no Forward
    const home = journeyOf(moveTo(t, chainTo(t, t.at)[0].id));
    cleanup();
    const first = mount({ detail: found({ kind: 'verse', verse: ISA_7_14 }), journey: home });
    expect(first.panel.querySelectorAll('.sw-trail-btn')[0].disabled).toBe(true);
    expect(first.panel.querySelectorAll('.sw-trail-btn')[1].disabled).toBe(false);
  });

  it('no trail bar on a lone stop, nor on My Web', () => {
    const one = journeyOf(arrive(EMPTY_TRAIL, { verse: ISA_7_14, label: 'Isaiah 7:14' }));
    expect(mount({ detail: detail(), journey: one }).panel.querySelector('.sw-trail')).toBeNull();
    cleanup();
    const two = journeyOf(walked([ISA_7_14, 'Isaiah 7:14'], [g.to[ARC], 'Matthew 1:23', ARC]));
    expect(mount({ detail: detail(), journey: two, mode: 'personal' }).panel.querySelector('.sw-trail')).toBeNull();
  });

  it('away from the stop (a line tapped on the way), Back names the stop and its crumb goes back there', () => {
    const MATT = g.to[ARC];
    const journey = journeyOf(walked([ISA_7_14, 'Isaiah 7:14'], [MATT, 'Matthew 1:23', ARC]));
    // the stop is Matthew 1:23's verse; the panel shows the line instead
    const { panel, byLabel } = mount({ detail: detail(), journey });
    expect(byLabel(/^Back to Matthew 1:23$/)).toHaveLength(1);
    const here = panel.querySelector('.sw-trail-stops li.is-here .sw-crumb');
    expect(here, "the stop's crumb is a button while the panel is elsewhere").toBeTruthy();
    fireEvent.click(here);
    expect(journey.go).toHaveBeenCalledWith(journey.here.id);
  });

  it('each end of a line is a way on: Follow to it, on both ends; the end the reader stands on has none', () => {
    const d = detail();
    const { panel, props } = mount({ detail: d });
    const follows = [...panel.querySelectorAll('.sw-verses .sw-follow')];
    expect(follows.map((f) => f.getAttribute('aria-label'))).toEqual(['Follow to Isaiah 7:14', 'Follow to Matthew 1:23']);
    fireEvent.click(follows[0]);
    const asked = props.followThread.mock.calls[0][0];
    expect(asked.far === 'to' ? asked.to : asked.from, 'the end the button names').toBe(ISA_7_14);
    cleanup();
    const atIsaiah = journeyOf(walked([g.to[ARC], 'Matthew 1:23'], [ISA_7_14, 'Isaiah 7:14', ARC]));
    const two = mount({ detail: d, journey: atIsaiah });
    expect([...two.panel.querySelectorAll('.sw-verses .sw-follow')].map((f) => f.getAttribute('aria-label')))
      .toEqual(['Follow to Matthew 1:23']);
  });

  it('a card opened from another card shows its Back link', () => {
    const { panel } = mount({ detail: Object.assign(detail(), { parent: found({ kind: 'verse', verse: ISA_7_14 }) }) });
    expect(panel.querySelector('.sw-back-link').textContent).toMatch(/Back to Isaiah 7:14/);
  });

  /* YOUR PATHS (2026-11-03): back a couple and another way is a path of its own; every one stays. */
  it('your paths: the button counts them; the view lists each from its fork, says where the reader is, goes to a stop, and clears on a second tap', () => {
    const MATT = g.to[ARC];
    const J = JOHN_3_16;
    let t = walked([ISA_7_14, 'Isaiah 7:14'], [MATT, 'Matthew 1:23', ARC], [J, 'John 3:16', 7]);
    t = moveTo(t, chainTo(t, t.at)[0].id);
    t = arrive(t, { verse: vid('luke', 1, 31), label: 'Luke 1:31', open: { mode: 'verse', verse: vid('luke', 1, 31) }, via: { arc: 9 } },
      { verse: ISA_7_14, label: 'Isaiah 7:14' });
    const journey = journeyOf(t);
    const { panel, byLabel } = mount({ detail: found({ kind: 'verse', verse: vid('luke', 1, 31) }), journey });
    const btn = byLabel(/^Your paths, 2$/)[0];
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    const seen = vi.fn();
    HTMLElement.prototype.scrollIntoView = seen;
    fireEvent.click(btn);
    expect(panel.getAttribute('aria-label')).toBe('Your paths');
    // h1104-7: on a phone the verse card's rule hid the view's "Your paths" over its own head
    expect(panel.getAttribute('data-mode'), 'its own mode, not the card under it').toBe('paths');
    // and the stop where the reader is, at a later path's foot, is brought into sight
    expect(seen.mock.contexts.some((el) => el.classList && el.classList.contains('is-here') && el.classList.contains('sw-path-stop'))).toBe(true);
    delete HTMLElement.prototype.scrollIntoView;
    expect(panel.querySelector('.sw-panel-meta').textContent).toBe('2 paths · 4 stops');
    const paths = [...panel.querySelectorAll('.sw-path')];
    expect(paths).toHaveLength(2);
    expect([...paths[0].querySelectorAll('.sw-path-ref')].map((x) => x.textContent)).toEqual(['Isaiah 7:14', 'Matthew 1:23', 'John 3:16']);
    expect(paths[1].querySelector('.sw-path-stop.is-from .sw-path-ref').textContent, 'the path begins at its fork').toBe('From Isaiah 7:14');
    expect(paths[1].classList.contains('is-current')).toBe(true);
    const here = paths[1].querySelector('.sw-path-stop.is-here');
    expect(here.querySelector('.sw-path-here').textContent).toBe('You are here');
    expect(here.querySelector('.sw-path-go').getAttribute('aria-current')).toBe('location');
    expect(paths[0].querySelector('.sw-path-text').textContent, 'a stop in its own words').toBe('TEXT isaiah 7:14');
    // a stop goes there, and the view gives way to the panel
    fireEvent.click(paths[0].querySelectorAll('.sw-path-go')[2]);
    expect(journey.go).toHaveBeenCalledWith(t.stops.find((x) => x.verse === J).id);
    expect(panel.querySelector('.sw-paths')).toBeNull();
    // Clear asks a second tap
    fireEvent.click(byLabel(/^Your paths, 2$/)[0]);
    const clear = panel.querySelector('.sw-paths-clear');
    fireEvent.click(clear);
    expect(journey.clear).not.toHaveBeenCalled();
    expect(clear.textContent).toBe('Tap again to clear your paths');
    fireEvent.click(clear);
    expect(journey.clear).toHaveBeenCalledTimes(1);
  });
});

describe('verse mode: John 3:16', () => {
  const detail = () => found({ kind: 'verse', verse: JOHN_3_16 });

  it('its text, its citations, its ways on strongest first, every thread by book under them, and the base lit set back when a row lets go', () => {
    const { panel, props } = mount({ detail: detail() });
    expect(panel.getAttribute('data-mode')).toBe('verse');
    expect(panel.querySelector('.sw-panel-title').textContent).toBe('John 3:16');
    expect(panel.querySelector('.sw-panel-meta').textContent).toBe('48 connections · cited in the Volumes 5 times');
    // each item whole, so the line breaks only at a separator (the phone shot left "times" alone),
    // and the separator rides at the head of the item after it, so a wrap carries it to the start
    // of the next line, where the line's clip hides it (w4: the same shot then read
    // "48 connections ·" / "cited in the Volumes 5 times")
    const meta = panel.querySelector('.sw-panel-meta');
    const items = [...meta.querySelectorAll('.sw-dots > .sw-dot-item')];
    expect(items.map((s) => s.lastChild.textContent)).toEqual(['48 connections', 'cited in the Volumes 5 times']);
    expect(items.map((s) => !!s.querySelector(':scope > .sw-dot-sep'))).toEqual([false, true]);
    expect(meta.querySelector('.sw-dot-sep').textContent).toBe(' · ');
    expect(panel.querySelector('.sw-verse-text').textContent).toBe('TEXT john 3:16');
    expect(panel.querySelector('.sw-sec-go .sw-sec-title').textContent).toBe('Go on from here · 48');
    // every line with a " · " in it (the section titles, the cite sources) wraps the same way
    for (const line of panel.querySelectorAll('.sw-sec-title, .sw-cite-source')) {
      if (line.textContent.includes(' · ')) expect(line.querySelector('.sw-dots'), line.textContent).toBeTruthy();
    }
    // the strongest ways on first, across the books
    const want = pm.waysOn(pm.threadsFrom(g, JOHN_3_16, JOHN_3_16, 'famous')).slice(0, GO_ON_SHOWN).map((r) => r.other.label);
    const rows = [...panel.querySelectorAll('.sw-go-list .sw-row')];
    expect(rows.map((r) => r.querySelector('.sw-row-ref').textContent)).toEqual(want);
    for (let k = 1; k < rows.length; k++) {
      const v = (r) => Number(/(\d+) votes?/.exec(r.querySelector('.sw-row-tag').textContent)[1]);
      expect(v(rows[k])).toBeLessThanOrEqual(v(rows[k - 1]));
    }
    // every thread, by book, a tap away under them
    const all = panel.querySelector('.sw-sec-all .sw-sec-toggle');
    expect(all.getAttribute('aria-label')).toBe('All 48 by book');
    expect(all.getAttribute('aria-expanded')).toBe('false');
    expect(panel.querySelector('.sw-sec-all .sw-group')).toBeNull();
    fireEvent.click(all);
    expect(panel.querySelectorAll('.sw-sec-all .sw-group').length).toBeGreaterThan(1);
    const row = rows[0];
    fireEvent.mouseEnter(row);
    expect(props.lightThreads.mock.calls.at(-1)[0]).toHaveLength(1);
    fireEvent.mouseLeave(row);
    const base = props.lightThreads.mock.calls.at(-1)[0];
    expect(base.length).toBe(48);
  });

  it('a change of density lights the threads it now lists, never the stale set (w3 review)', () => {
    const { panel, props, rerender } = mount({ detail: detail() });
    rerender(<WebPanel {...props} density="essential" />);
    const n = Number(/· (\d+)$/.exec(panel.querySelector('.sw-sec-go .sw-sec-title').textContent)[1]);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(48);
    const lit = props.lightThreads.mock.calls.at(-1)[0];
    expect([...lit].sort((a, b) => a - b)).toEqual([...pm.threadsFrom(g, JOHN_3_16, JOHN_3_16, 'essential').ids].sort((a, b) => a - b));
    expect(lit.length).toBe(n);
  });

  it('on My Web a change of density lights nothing (no lit set there)', () => {
    const { props, rerender } = mount({ detail: detail(), mode: 'personal' });
    rerender(<WebPanel {...props} density="essential" />);
    expect(props.lightThreads).not.toHaveBeenCalled();
  });

  it('a way on is one tap: it follows its thread there; its tag is its votes; a verse stood at is marked visited', () => {
    const { panel, props } = mount({ detail: detail() });
    expect(panel.querySelector('.sw-go-list .sw-row-tag').textContent).toMatch(/^\d+ votes?$/);
    const first = panel.querySelector('.sw-go-list .sw-row-main');
    fireEvent.click(first);
    expect(props.followRow).toHaveBeenCalledWith(expect.objectContaining({ hereVerse: JOHN_3_16 }));
    expect(props.openPanel).not.toHaveBeenCalled();
    expect(panel.querySelector('.sw-row-visited'), 'nothing stood at yet').toBeNull();
    cleanup();
    // a trail that has stood at the first way's verse
    const way = pm.waysOn(pm.threadsFrom(g, JOHN_3_16, JOHN_3_16, 'famous'))[0];
    const t = walked([way.otherVerse, way.other.label], [vid('genesis', 1, 1), 'Genesis 1:1', 3]);
    const again = mount({ detail: detail(), journey: journeyOf(t) });
    const seen = again.panel.querySelector('.sw-go-list .sw-row');
    expect(seen.querySelector('.sw-row-visited')).toBeTruthy();
    expect(seen.querySelector('.sw-row-main').getAttribute('aria-label')).toMatch(/, visited$/);
  });

  it('a stop the reader came to along a thread: where they came from, its thread no way on, only the first ways lit', () => {
    const ways = pm.waysOn(pm.threadsFrom(g, JOHN_3_16, JOHN_3_16, 'famous'));
    const via = ways[0];
    const t = walked([via.otherVerse, via.other.label], [JOHN_3_16, 'John 3:16', via.index]);
    const journey = journeyOf(t);
    const { panel, props } = mount({ detail: detail(), journey });
    const came = panel.querySelector('.sw-came');
    expect(came.querySelector('.sw-came-ref').textContent).toBe('From ' + via.other.label);
    expect(came.querySelector('.sw-came-votes').textContent).toBe(via.votes + ' votes');
    expect(came.querySelector('.sw-came-text').textContent).toBe('TEXT ' + via.other.bookId + ' ' + via.other.chapter + ':' + via.other.verse);
    expect(came.getAttribute('aria-label')).toBe('Back to ' + via.other.label);
    fireEvent.click(came);
    expect(journey.back).toHaveBeenCalledTimes(1);
    // the verse still counts its thread in; the ways on leave it out
    expect(panel.querySelector('.sw-panel-meta').textContent).toMatch(/^48 connections/);
    expect(panel.querySelector('.sw-sec-go .sw-sec-title').textContent).toBe('Go on from here · 47');
    const listed = [...panel.querySelectorAll('.sw-go-list .sw-row-ref')].map((x) => x.textContent);
    expect(listed).toEqual(ways.slice(1, 1 + GO_ON_SHOWN).map((r) => r.other.label));
    // the web lights only the ways the panel offers first, not the verse's every thread over the path
    const lit = props.lightThreads.mock.calls.at(-1)[0];
    expect([...lit]).toEqual(ways.slice(1, 1 + GO_ON_SHOWN).map((r) => r.index));
    cleanup();
    // on the phone the way in is one quiet link beside Open in reader
    const phone = mount({ detail: detail(), journey, compact: true });
    expect(phone.panel.querySelector('.sw-came')).toBeNull();
    const link = phone.panel.querySelector('.sw-verses .sw-came-link');
    expect(link.textContent).toMatch(/^From \S.* · \d+ votes$/);
    expect(phone.panel.querySelectorAll('.sw-go-list .sw-row')).toHaveLength(4);
  });
});

/* s27.2 (idea sweep 2026-10-22): a study citation on show loads the Bible Studies for its quote; a
   failed load (loadBibleStudies resolves false) left the quote missing for good, with no way to ask
   again. It now says so and offers Try again, which loads them again and clears the note. */
describe('a study citation whose Bible Studies fail to load', () => {
  let savedStudies;
  beforeEach(() => { savedStudies = window.BIBLE_STUDIES; delete window.BIBLE_STUDIES; });
  afterEach(() => { window.BIBLE_STUDIES = savedStudies; delete window.loadBibleStudies; });

  it('says the study text did not load, and Try again loads it again', async () => {
    const edge = g.votEdges.find((e) => e.studyId);
    expect(edge, 'the graph carries a study citation').toBeTruthy();
    const load = vi.fn(async () => false);
    window.loadBibleStudies = load;
    const { panel } = mount({ detail: found({ kind: 'verse', verse: edge.v }) });
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    const retry = [...panel.querySelectorAll('.sw-cite-failed button')];
    expect(retry.map((b) => b.textContent)).toEqual(['Try again']);
    load.mockImplementation(async () => { window.BIBLE_STUDIES = savedStudies; return true; });
    await act(async () => { fireEvent.click(retry[0]); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(panel.querySelector('.sw-cite-failed')).toBeNull();
  });
});

describe('group mode: a chapter', () => {
  it('its threads by the book they go to, tagged by where they start, then "Zoom to <chapter>"', () => {
    const ci = g.chapterOfVerse[ISA_7_14];
    const { panel, byText, props } = mount({ detail: found({ kind: 'chapter', chapterIndex: ci }) });
    expect(panel.getAttribute('data-mode')).toBe('group');
    expect(panel.querySelector('.sw-panel-over').textContent).toBe('Chapter');
    expect(panel.querySelector('.sw-panel-title').textContent).toBe('Isaiah 7');
    expect(panel.querySelector('.sw-sec-more .sw-sec-title').textContent).toBe('Connections · 65');
    expect(panel.querySelector('.sw-group .sw-row-tag').textContent).toMatch(/^from Isa 7:\d+$/);
    const zoom = byText(/^Zoom to Isaiah 7$/);
    expect(zoom).toHaveLength(1);
    fireEvent.click(zoom[0]);
    expect(props.zoomTo).toHaveBeenCalledWith(ci);
  });
});

describe('the chooser at overview', () => {
  it('rows strongest first, each lighting its thread, then the zoom row', () => {
    const ids = [ARC, ...pm.threadsFrom(g, ISA_7_14, ISA_7_14, 'famous').ids.slice(0, 4)];
    const choices = ids.map(arcOf).reverse();
    const { panel, byText, props } = mount({ choices });
    expect(panel.classList.contains('sw-choice')).toBe(true);
    expect(panel.querySelector('.sw-panel-title').textContent).toBe('5 threads close together');
    expect(panel.querySelector('.sw-panel-meta').textContent).toMatch(/Strongest first/);
    const rows = [...panel.querySelectorAll('.sw-choice-row')];
    expect(rows).toHaveLength(5);
    const votes = rows.map((r) => Number(/^([\d,]+) votes?/.exec(r.querySelector('.sw-row-text').textContent)[1].replace(/,/g, '')));
    for (let i = 1; i < votes.length; i++) expect(votes[i - 1]).toBeGreaterThanOrEqual(votes[i]);
    fireEvent.focus(rows[0]);
    const strongest = strongestFirst(choices)[0];
    expect(props.lightThreads).toHaveBeenLastCalledWith([strongest.index]);
    fireEvent.click(rows[0]);
    expect(props.onChoose).toHaveBeenCalledWith(strongest);
    expect(byText(/^Zoom to Isaiah 7$/)).toHaveLength(1);
  });

  // ideas audit A10.6: close threads tell apart by their far end's words, not a reference alone
  it('each row quotes its far end: the end away from the tapped chapter, else the later end', () => {
    const ids = [ARC, ...pm.threadsFrom(g, ISA_7_14, ISA_7_14, 'famous').ids.slice(0, 4)];
    const choices = ids.map(arcOf);
    const quotes = (p) => [...p.querySelectorAll('.sw-choice-row .sw-row-quote')].map((q) => q.textContent);
    const isaiah7 = g.chapterOfVerse[ISA_7_14];
    const tapped = mount({ choices, choiceChapter: isaiah7 });
    expect(quotes(tapped.panel)).toHaveLength(5);
    for (const q of quotes(tapped.panel)) expect(q, 'the end away from Isaiah 7').not.toMatch(/^Isaiah 7:/);
    for (const q of quotes(tapped.panel)) expect(q).toMatch(/^\S.* TEXT \S+ \d+:\d+$/);
    cleanup();
    const untapped = mount({ choices });
    const later = strongestFirst(choices).map((c) => (c.from <= c.to ? c.b : c.a).label);
    expect(quotes(untapped.panel).map((q) => q.split(' TEXT ')[0])).toEqual(later);
  });

  it('"Zoom to" names the chapter the reader tapped when the tap is known (w3 review)', () => {
    const ids = [ARC, ...pm.threadsFrom(g, ISA_7_14, ISA_7_14, 'famous').ids.slice(0, 4)];
    const { byText, props } = mount({ choices: ids.map(arcOf), choiceChapter: g.chapterOfVerse[JOHN_3_16] });
    expect(byText(/^Zoom to Isaiah 7$/)).toHaveLength(0);
    const zoom = byText(/^Zoom to John 3$/);
    expect(zoom).toHaveLength(1);
    fireEvent.click(zoom[0]);
    expect(props.zoomTo).toHaveBeenCalledWith(g.chapterOfVerse[JOHN_3_16]);
  });

  // w3 review, round 2: a dense crossing listed 4 and read "4 threads close together"
  it('a tap that found more threads than it lists says these are the nearest', () => {
    const ids = [ARC, ...pm.threadsFrom(g, ISA_7_14, ISA_7_14, 'famous').ids.slice(0, 7)];
    const { panel } = mount({ choices: ids.map(arcOf), choiceCut: true });
    expect(panel.querySelectorAll('.sw-choice-row')).toHaveLength(8);
    expect(panel.querySelector('.sw-panel-title').textContent).toBe('The 8 nearest threads');
    expect(panel.querySelector('.sw-panel-meta').textContent).toBe('Choose the one you meant. Strongest first, by readers’ votes.');
  });

  it('lights nothing on My Web (the reader\'s own links have no lit set)', () => {
    const choices = [arcOf(ARC), arcOf(ARC + 1)];
    const { panel, props } = mount({ choices, mode: 'personal' });
    fireEvent.mouseEnter(panel.querySelector('.sw-row'));
    expect(props.lightThreads).not.toHaveBeenCalled();
    expect(panel.querySelector('.sw-zoom-row')).toBeNull();
  });

  /* My Web's legend ends on the credit as the canon's does (w4); its panel, like the canon's,
     carries none since 2026-10-29 (one small spot, the legend's). */
  it('My Web\'s panel carries no credit line either', () => {
    const choices = [arcOf(ARC), arcOf(ARC + 1)];
    const { panel } = mount({ choices, mode: 'personal' });
    expect(panel.querySelector('.sw-panel-credit')).toBeNull();
  });
});

describe('letter mode', () => {
  it('the verses a letter cites, each with its text, opening its verse in the panel and the reader', () => {
    const d = found({ kind: 'letter', letterKey: 'two/the-lord-comes-nigh' });
    const { panel, byLabel, props } = mount({ detail: d });
    expect(panel.getAttribute('data-mode')).toBe('letter');
    expect(panel.querySelector('.sw-panel-over').textContent).toBe('In the Volumes');
    expect(panel.querySelector('.sw-panel-title').textContent).toBe(d.title);
    const rows = [...panel.querySelectorAll('.sw-row')];
    expect(rows.length).toBe(pm.letterRows(g, 'two/the-lord-comes-nigh').length);
    const matt = rows.find((r) => r.querySelector('.sw-row-ref').textContent === 'Matthew 1:23');
    expect(matt.querySelector('.sw-row-text').textContent).toBe('TEXT matthew-plain 1:23');
    fireEvent.click(matt.querySelector('.sw-row-main'));
    expect(props.openPanel).toHaveBeenCalledWith({ mode: 'verse', verse: expect.any(Number) }, { back: true });
    fireEvent.click(byLabel(/^Open in reader: Matthew 1:23$/)[0]);
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'matthew-plain', chapter: 1, verse: 23 }));
  });

  it('a card opened from another offers the way back to it, without moving the camera', () => {
    const parent = { ...arcOf(ARC), far: 'to' };
    const d = { ...found({ kind: 'letter', letterKey: 'two/the-lord-comes-nigh' }), parent };
    const { byText, props } = mount({ detail: d });
    const back = byText(/Back to Isaiah 7:14 ↔ Matthew 1:23/);
    expect(back).toHaveLength(1);
    fireEvent.click(back[0]);
    expect(props.onChoose).toHaveBeenCalledWith(parent, { frame: false });
  });
});

describe('Nearby (list mode) and the focus law', () => {
  it('the list keeps its hooks, and the panel takes focus without trapping it', () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    const items = [arcOf(ARC), arcOf(ARC + 1)];
    const r = mount({ listOpen: true, listItems: items, lensOn: true });
    const { panel } = r;
    expect(panel.classList.contains('sw-list')).toBe(true);
    expect(panel.getAttribute('data-lens-on')).toBe('1');
    expect(panel.querySelectorAll('.sw-choice-row')).toHaveLength(2);
    expect(document.activeElement).toBe(panel);
    const last = [...panel.querySelectorAll('button')].at(-1);
    last.focus();
    expect(fireEvent.keyDown(last, { key: 'Tab' }), 'no trap: Tab is not cancelled').toBe(true);
    r.unmount();
    expect(document.activeElement, 'closing hands focus back').toBe(before);
    before.remove();
  });

  it('an empty My Web list says so', () => {
    const { panel } = mount({ listOpen: true, listItems: [], mode: 'personal' });
    expect(panel.querySelector('.sw-list-empty').textContent).toBe('You have no links on the web yet.');
  });
});

/* Exits mode: a chip of a "+n" pill's fan (exits.js), on the Isaiah 53 deep frame (s06b, PC), its cell
   the first twelve verses of Isaiah 54. */
describe("exits mode: a fan chip's lines, by the book they go to", () => {
  const V = { W: 1600, H: 900, DPR: 1 };
  const F = webFrame(V, false);
  const camX = vid('isaiah', 53, 1) + 13.3, ppv = (V.W / g.total) * 208.8;
  const set = frameSetAt(g, 'famous', V.W, F.base, geo.squashFactor(F.ceil, V.W), camX, 0, ppv, 1);
  const cell = { lo: vid('isaiah', 54, 1), hi: vid('isaiah', 54, 12) };
  const fan = fanGroups(g, exitCensus(g, set, V.W, cell), 5);
  const grp = fan.right.concat(fan.left).sort((a, b) => b.count - a.count)[0];
  const ids = exitIds(g, set, V.W, grp.side, grp.lo, grp.hi, cell);
  const detail = { kind: 'exits', key: 'c' + cell.lo + '-' + cell.hi + ':' + grp.side[0] + ':' + grp.lo + '-' + grp.hi,
    label: grp.title, side: grp.side, books: [grp.lo, grp.hi], cell, area: { label: areaLabel(g, cell.lo, cell.hi), ...cell }, ids };

  it("the words: 'Leaving the view', the books with the side's arrow, the count from the cell", () => {
    expect(grp.count).toBeGreaterThan(1);
    const w = ds.exitsWords(detail);
    expect(w.over).toBe('Leaving the view');
    expect(w.title).toBe(grp.side === 'left' ? '\u2039 ' + grp.title : grp.title + ' \u203a');
    expect(w.meta).toBe(ids.length + ' connections from Isaiah 54:1-12');
    expect(w.summary).toBe(ids.length + ' connections from Isaiah 54:1-12 go to ' + grp.title + '.');
    expect(w.title + w.meta, 'ASCII hyphens').not.toMatch(/[\u2013\u2014]/);
    expect(ds.sheetEyebrow(detail)).toBe('Leaving the view');
    expect(ds.summaryOf(detail)).toBe(w.summary);
    expect(ds.exitsWords({ ...detail, ids: [ids[0]] }).summary).toMatch(/^1 connection from .* goes to /);
  });

  it('exitsModel: by far book in canon order, strongest first in each, the near end the one in the cell', () => {
    const m = pm.exitsModel(g, detail);
    expect(m.threads.total, "the chip's count is the panel's").toBe(grp.count);
    expect(m.zoom).toBe(g.chapterOfVerse[cell.lo]);
    const books = m.threads.groups.map((x) => x.book);
    expect(books).toEqual([...books].sort((a, b) => a - b));
    for (const grpRows of m.threads.groups) {
      expect(grpRows.book >= grp.lo && grpRows.book <= grp.hi, grpRows.title + ' in the chip').toBe(true);
      for (let k = 1; k < grpRows.rows.length; k++) expect(grpRows.rows[k].votes).toBeLessThanOrEqual(grpRows.rows[k - 1].votes);
      for (const r of grpRows.rows) expect(r.hereVerse >= cell.lo && r.hereVerse <= cell.hi).toBe(true);
    }
  });

  it('the panel: its head, "Connections · n" the chip\'s count, each row a way on, the lines lit as it opened', () => {
    const { panel, props } = mount({ detail });
    expect(modeOfDetail(detail)).toBe('exits');
    expect(subjectKey('exits', detail, null)).toBe('x:' + detail.key);
    expect(panel.getAttribute('data-mode')).toBe('exits');
    expect(panel.querySelector('.sw-panel-over').textContent).toBe('Leaving the view');
    expect(panel.querySelector('.sw-panel-title').textContent).toBe(ds.exitsWords(detail).title);
    expect(panel.querySelector('.sw-sec-more .sw-sec-title').textContent).toBe('Connections · ' + grp.count);
    const rows = panel.querySelectorAll('.sw-group .sw-row');
    expect(rows.length).toBeGreaterThan(0);
    const follows = [...panel.querySelectorAll('.sw-group .sw-row-go .sw-row-main')];
    expect(follows.length).toBe(rows.length);
    for (const f of follows) expect(f.getAttribute('aria-label')).toMatch(/^Go to /);
    fireEvent.click(follows[0]);
    expect(props.followRow).toHaveBeenCalledWith(expect.objectContaining({ hereVerse: expect.any(Number) }));
    expect(props.followRow.mock.calls[0][0].hereVerse).toBeGreaterThanOrEqual(cell.lo);
    expect(props.followRow.mock.calls[0][0].hereVerse).toBeLessThanOrEqual(cell.hi);
  });

  // the curtain round's held pill tap (built 2026-10-29): a column's pill is "Where its lines go"
  it("a pill's column: 'Where its lines go', its label, its count; every line in the cell by far book", () => {
    const all = Int32Array.from(fan.right.concat(fan.left).flatMap((x) => Array.from(exitIds(g, set, V.W, x.side, x.lo, x.hi, cell))));
    const col = { kind: 'exits', key: 'cell:' + cell.lo + '-' + cell.hi, label: 'Isaiah 54:1-12', side: null, books: null,
      cell, area: { label: 'Isaiah 54:1-12', ...cell }, ids: all };
    const w = ds.exitsWords(col);
    expect(w).toEqual({ over: 'Where its lines go', title: 'Isaiah 54:1-12', meta: all.length + ' connections',
      summary: 'Isaiah 54:1-12, ' + all.length + ' connections, by where they go.' });
    const { panel } = mount({ detail: col });
    expect(panel.querySelector('.sw-panel-over').textContent).toBe('Where its lines go');
    expect(panel.querySelector('.sw-sec-more .sw-sec-title').textContent).toBe('Connections · ' + pm.exitsModel(g, col).threads.total.toLocaleString());
    const books = pm.exitsModel(g, col).threads.groups.map((x) => x.book);
    expect(books.length, 'its lines go to more than one book').toBeGreaterThan(1);
  });
});

/* h1104-7, measured on a 915x412 phone: after a branch the paths button narrows the row to 185 px,
   and with the stop where the reader is the last, the row's end clamped the scroll at 113 px, so
   the row began inside "Isa 7:14" and showed "7:14 › Matt 1:23 › Isa 9:6". */
/** What a crumb shows on screen: its text without the words kept for a screen reader alone. */
function shownText(/** @type {Element} */ el) {
  const c = /** @type {Element} */ (el.cloneNode(true));
  c.querySelectorAll('.sw-sr-only').forEach((x) => x.remove());
  return c.textContent;
}

describe('the trail bar row (trailScroll)', () => {
  const branch = { starts: [11, 97, 163, 242], hereAt: 3, hereWidth: 37, pad: 10, width: 185, scrollWidth: 298 };
  it('begins at a stop’s own edge when the stop where the reader is ends the row', () => {
    const { scrollLeft, endRoom } = trailScroll(branch);
    expect(scrollLeft, 'from "Matt 1:23", less the padding').toBe(153);
    expect(endRoom, 'the room the end needs for that scroll').toBe(40);
  });
  it('asks only the room it needs, and none with the stop mid-row', () => {
    // hop 3 on the same phone, before the paths button: Isa 7:14 › Matt 1:23 › John 1:1 › Gen 1:1
    const r = trailScroll({ starts: [11, 97, 163, 242, 313], hereAt: 4, hereWidth: 46, pad: 10, width: 238, scrollWidth: 378 });
    expect(r).toEqual({ scrollLeft: 153, endRoom: 13 });
    const mid = trailScroll({ starts: [11, 97, 163, 242, 313], hereAt: 2, hereWidth: 57, pad: 10, width: 238, scrollWidth: 378 });
    expect(mid).toEqual({ scrollLeft: 0, endRoom: 0 });
  });
});
