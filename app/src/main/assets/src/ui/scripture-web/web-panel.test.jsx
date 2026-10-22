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
import { render, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { decodeGraph } from '../../utils/scripture-web/decode.js';
import * as ds from '../../utils/scripture-web/describe.js';
import * as pm from '../../utils/scripture-web/panel-model.js';
import { WebPanel, modeOfDetail, subjectKey, strongestFirst, CITED_SHOWN } from './web-panel.jsx';
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
    const open = byLabel(/^Open Isaiah 7:14 in the reader$/);
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

  it('MORE FROM each end: the first open, grouped by book, rows with Open and Follow, the sort said', () => {
    const { panel, byLabel, props } = mount({ detail: detail() });
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
    const follows = byLabel(/^Follow the line from Isaiah 7:14 to /);
    expect(follows.length).toBe(rows.length);
    fireEvent.click(follows[0]);
    expect(props.followRow).toHaveBeenCalledWith(expect.objectContaining({ hereVerse: ISA_7_14 }));
    expect(props.followRow.mock.calls[0][0].index).not.toBe(ARC);
    // a closed book opens on its header; the second end opens on its own
    fireEvent.click(more[1].querySelector('.sw-sec-toggle'));
    expect(more[1].querySelectorAll('.sw-group').length).toBeGreaterThan(0);
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

  it('credits the cross-reference data, pinned at the foot on PC and last in the scroll compact', () => {
    const pc = mount({ detail: detail() });
    const credit = pc.panel.querySelector('.sw-panel-credit');
    expect(credit.textContent).toBe(g.attribution);
    expect(credit.parentElement).toBe(pc.panel);
    cleanup();
    const phone = mount({ detail: detail(), compact: true });
    expect(phone.panel.querySelector('.sw-panel-credit').parentElement.classList.contains('sw-panel-body')).toBe(true);
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
    const journey = { stack: [
      { verse: vid('psalms', 103, 2), label: ds.WHOLE_WEB },
      { verse: vid('romans', 1, 1), label: 'Romans' },
      { verse: vid('john', 3, 1), label: 'John 3' },
      { verse: vid('1corinthians', 13, 1), label: '1 Corinthians 13' },
      { verse: ISA_7_14, label: 'Isaiah 7:14' },
      { verse: g.to[ARC], label: 'Matthew 1:23' },
    ], push() {}, clear() {}, back() { return null; } };
    const { panel } = mount({ detail: detail(), journey });
    expect([...panel.querySelectorAll('.sw-crumbs li')].map((c) => c.textContent))
      .toEqual(['Whole web', 'Romans', 'John 3', '1Cor 13', 'Isa 7:14', 'Matt 1:23']);
  });

  it('the trail shows once a Follow has steps, the current crumb marked, and Back walks it', () => {
    const back = vi.fn(() => ({ verse: ISA_7_14, label: 'Isaiah 7:14' }));
    const journey = { stack: [{ verse: ISA_7_14, label: 'Isaiah 7:14' }, { verse: g.to[ARC], label: 'Matthew 1:23' }], push() {}, clear() {}, back };
    const { panel, byLabel, props } = mount({ detail: detail(), journey });
    const crumbs = [...panel.querySelectorAll('.sw-crumbs li')];
    expect(crumbs.map((c) => c.textContent)).toEqual(['Isa 7:14', 'Matt 1:23']);
    expect(crumbs[1].classList.contains('is-here')).toBe(true);
    expect(crumbs[1].getAttribute('aria-current')).toBe('location');
    fireEvent.click(byLabel(/^Back along the trail$/)[0]);
    expect(back).toHaveBeenCalledTimes(1);
    // the journey flies home and reopens the line itself (use-journey.js): a fly of the panel's own
    // would take that one over (integration, w3)
    expect(props.flyTo).not.toHaveBeenCalled();
  });
});

describe('verse mode: John 3:16', () => {
  const detail = () => found({ kind: 'verse', verse: JOHN_3_16 });

  it('its text, its citations, its threads by book, and the base lit set back when a row lets go', () => {
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
    expect(panel.querySelector('.sw-sec-more .sw-sec-title').textContent).toBe('Connections · 48');
    // every line with a " · " in it (the section titles, the cite sources) wraps the same way
    for (const line of panel.querySelectorAll('.sw-sec-title, .sw-cite-source')) {
      if (line.textContent.includes(' · ')) expect(line.querySelector('.sw-dots'), line.textContent).toBeTruthy();
    }
    const row = panel.querySelector('.sw-group .sw-row');
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    const base = props.lightThreads.mock.calls.at(-1)[0];
    expect(base.length).toBe(48);
  });

  it('a change of density lights the threads it now lists, never the stale set (w3 review)', () => {
    const { panel, props, rerender } = mount({ detail: detail() });
    rerender(<WebPanel {...props} density="essential" />);
    const n = Number(/· (\d+)$/.exec(panel.querySelector('.sw-sec-more .sw-sec-title').textContent)[1]);
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

  it('a row shows that connection; its tag is its votes', () => {
    const { panel, props } = mount({ detail: detail() });
    expect(panel.querySelector('.sw-group .sw-row-tag').textContent).toMatch(/^\d+ votes?$/);
    fireEvent.click(panel.querySelector('.sw-group .sw-row-main'));
    expect(props.openPanel).toHaveBeenCalledWith({ mode: 'connection', arc: expect.any(Number) });
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
    expect(panel.querySelector('.sw-panel-meta').textContent).toBe('Choose the one you meant. Strongest first.');
  });

  it('lights nothing on My Web (the reader\'s own links have no lit set)', () => {
    const choices = [arcOf(ARC), arcOf(ARC + 1)];
    const { panel, props } = mount({ choices, mode: 'personal' });
    fireEvent.mouseEnter(panel.querySelector('.sw-row'));
    expect(props.lightThreads).not.toHaveBeenCalled();
    expect(panel.querySelector('.sw-zoom-row')).toBeNull();
  });

  /* w4 integration: through w3 My Web's panel had no credit, on the reading that My Web drew none
     of the OpenBible data; the My Web stream's w4 legend ends on the credit (its Bible rail is the
     graph asset's own), and the hub's call keeps it on screen wherever the web is. While a panel
     is open the legend hides, so on PC the panel's pinned foot is where it shows. The w3 pin
     (no credit on My Web) is rewritten to that intent. */
  it('My Web\'s panel carries the CC-BY credit too, pinned at its foot on PC', () => {
    const choices = [arcOf(ARC), arcOf(ARC + 1)];
    const { panel } = mount({ choices, mode: 'personal' });
    const credit = panel.querySelector('.sw-panel-credit');
    expect(credit && credit.textContent).toBe(g.attribution);
    expect(credit.parentElement).toBe(panel);
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
    fireEvent.click(byLabel(/^Open Matthew 1:23 in the reader$/)[0]);
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

  it('the panel: its head, "Connections · n" the chip\'s count, rows with Open and Follow, the lines lit as it opened', () => {
    const { panel, byLabel, props } = mount({ detail });
    expect(modeOfDetail(detail)).toBe('exits');
    expect(subjectKey('exits', detail, null)).toBe('x:' + detail.key);
    expect(panel.getAttribute('data-mode')).toBe('exits');
    expect(panel.querySelector('.sw-panel-over').textContent).toBe('Leaving the view');
    expect(panel.querySelector('.sw-panel-title').textContent).toBe(ds.exitsWords(detail).title);
    expect(panel.querySelector('.sw-sec-more .sw-sec-title').textContent).toBe('Connections · ' + grp.count);
    const rows = panel.querySelectorAll('.sw-group .sw-row');
    expect(rows.length).toBeGreaterThan(0);
    const follows = byLabel(/^Follow the line from Isaiah 54:/);
    expect(follows.length).toBe(rows.length);
    expect(panel.querySelectorAll('.sw-group .sw-row-open').length, 'each row has its Open').toBe(rows.length);
    fireEvent.click(follows[0]);
    expect(props.followRow).toHaveBeenCalledWith(expect.objectContaining({ hereVerse: expect.any(Number) }));
    expect(props.followRow.mock.calls[0][0].hereVerse).toBeGreaterThanOrEqual(cell.lo);
    expect(props.followRow.mock.calls[0][0].hereVerse).toBeLessThanOrEqual(cell.hi);
  });
});
