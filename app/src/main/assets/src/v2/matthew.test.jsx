// @ts-nocheck — reads main's Matthew data from disk (node fs and vm, no node types in this tsconfig).
/* v2's Matthew Study Bible (zones v2p5; design dz18 pictures 5h-5k), over main's real data (data/matthew.js and
   matthew-nkjv.js as the lazy bundle defines them): the index with main's minutes and notes weight, a chapter keyed as
   main keys it, Study notes PDF | Inline | Off on screen (three buttons, one pressed), Inline's notes under their verses
   and the pills back to them, and main's place, read marks, history entry and bookmark. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { V2App } from './App.jsx';
import { defineStart } from './places.js';
import { visitOf } from './reading-record.js';
import { votNoteVolLabel } from '../data/vot-note-label.js';
import {
  notesWeight, inlineRuns, noteVerse, noteRoute, votNote, rowLine, bookmarkOf, verseKey, resetMatthewSession,
} from './matthew-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const here = dirname(fileURLToPath(import.meta.url));
/** @type {any} */
const data = {};
runInNewContext(readFileSync(resolve(here, '../data/matthew.js'), 'utf8'), data, { filename: 'matthew.js' });
runInNewContext(readFileSync(resolve(here, '../data/matthew-nkjv.js'), 'utf8'), data, { filename: 'matthew-nkjv.js' });
const MATTHEW = data.MATTHEW;
const NKJV = data.MATTHEW_NKJV;
const CH5 = MATTHEW.chapters.find((c) => c.num === 5);
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

/** main's globals the pages read: the studies and Matthew (lazy), the note helpers, the word count and pace. */
function install({ dest = () => null } = {}) {
  g.ReactDOM = ReactDOM;   // index.html's global: the card portals into the shell's layer
  g.loadBibleStudies = vi.fn(() => { g.BIBLE_STUDIES = []; return Promise.resolve(true); });
  g.__loadMatthewCorpus = vi.fn(() => { g.MATTHEW = MATTHEW; g.MATTHEW_NKJV = NKJV; return Promise.resolve(); });
  g.resolveVotLetter = vi.fn(dest);
  g.votNoteVolLabel = votNoteVolLabel;
  g.isHiddenManna = (n) => n.letter === 'Hidden';
  g.countItemWords = (ch) => (ch.verses || []).reduce((n, v) => n + words(v.text), 0);
  g.readingMinutes = (w, wpm) => Math.max(1, Math.round(w / (wpm || 230)));
}

/** A real boot on Matthew 5 from its index, main's vot-state loaded with `settings`. */
function liveChapter(settings = {}) {
  install({ dest: () => ({ id: 'l1', screen: 'letter', volKey: 'two' }) });
  g.BIBLE_STUDIES = [];
  g.MATTHEW = MATTHEW;
  g.MATTHEW_NKJV = NKJV;
  let st = { settings };
  g.StateStore = { isReady: () => true, get: () => st, set: (next) => { st = next; } };
  undo.push(defineStart(() => [{ place: 'home' }, { place: 'studies' }, { place: 'study', study: 'matthew-study' },
    { place: 'study-chapter', study: 'matthew-study', chapter: '5' }]));
  return render(<V2App gateId={null} />);
}

const card = (c) => c.querySelector('.v2-layer > .msw');
const segs = (c) => [...card(c).querySelectorAll('.seg > button')];
const pressed = (c) => segs(c).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const seg = (c, label) => segs(c).find((b) => b.textContent === label);

/** @type {Array<() => void>} */
const undo = [];

afterEach(() => {
  cleanup();
  for (const k of ['BIBLE_STUDIES', 'MATTHEW', 'MATTHEW_NKJV', 'loadBibleStudies', '__loadMatthewCorpus', 'resolveVotLetter',
    'votNoteVolLabel', 'isHiddenManna', 'countItemWords', 'readingMinutes', 'StateStore', 'ReadingStatsStore', 'BookmarkStore',
    'ReactDOM']) delete g[k];
  while (undo.length) undo.pop()();
  delete html.dataset.gate;
  localStorage.clear();
  resetMatthewSession();
  vi.restoreAllMocks();
});

describe("the Matthew Study Bible's facts", () => {
  it("the notes weight is main's ratio to one place, none at 0; a row's line puts the minutes first", () => {
    expect(notesWeight(5)).toBe('1.2× notes');
    expect(notesWeight(24)).toBe('8.4× notes');
    expect(notesWeight(2)).toBe('');
    install();
    const n1 = Math.max(1, Math.round(g.countItemWords(MATTHEW.chapters[0]) / 230));
    expect(rowLine(MATTHEW.chapters[0], false)).toBe('~' + n1 + ' min · 0.5× notes');
    expect(rowLine(MATTHEW.chapters[1], false)).toMatch(/^~\d+ min$/);
    // begun: main's "n% · ~m min left" from the read tracker (never on a gate)
    g.ReadingStatsStore = { measuredWpm: () => null, getProgress: (k) => (k === 'v1:matthew:3' ? { b: 10, c: [1, 2, 3, 4] } : null) };
    const left = Math.max(1, Math.round(Math.round(g.countItemWords(MATTHEW.chapters[2]) * 0.6) / 230));
    expect(rowLine(MATTHEW.chapters[2], true)).toBe('40% · ~' + left + ' min left · 0.8× notes');
    expect(rowLine(MATTHEW.chapters[2], false)).toMatch(/^~\d+ min · 0.8× notes$/);
  });

  it("Inline: a note sits under the verse that ends its first range; later verses it covers point back to it", () => {
    const runs = inlineRuns(CH5, true);
    // the prose breaks after verse 4: Revelation 21:4 (5:4) and "Solace" (5:3-4, 6, 8)
    expect(runs[0].verses.map((x) => x.v.n)).toEqual([1, 2, 3, 4]);
    expect(runs[0].notes.scriptures.map((s) => s.cite)).toEqual(['Revelation 21:4']);
    expect(runs[0].notes.votNotes.map((n) => n.letter)).toEqual(['Solace']);
    expect(runs[1].verses.map((x) => x.v.n)).toEqual([5]);
    expect(runs[1].notes.scriptures.map((s) => s.cite)).toEqual(['Psalm 37:11']);
    const echo = (n) => runs.flatMap((r) => r.verses).find((x) => x.v.n === n).echo;
    expect(echo(6)).toEqual(['5:3-4, 6, 8']);
    expect(echo(8)).toContain('5:3-4, 6, 8');
    expect(echo(4)).toEqual([]);
    // every verse once, in order; with Reference echoes off, no pills
    expect(runs.flatMap((r) => r.verses).map((x) => x.v.n)).toEqual(CH5.verses.map((v) => v.n));
    expect(inlineRuns(CH5, false).flatMap((r) => r.verses).every((x) => x.echo.length === 0)).toBe(true);
    expect(noteVerse('5:3-4, 6, 8')).toBe(4);
  });

  it("a note's row: main's volume caption, where it goes, Hidden Manna; the route a tap opens", () => {
    install({ dest: (vol, letter) => (letter === 'Solace' ? { id: 'wtlb2-solace', screen: 'wtlb-entry' } : null) });
    const solace = CH5.votNotes.find((n) => n.letter === 'Solace');
    expect(votNote(solace)).toEqual({ vol: 'Words To Live By: Part Two', dest: { id: 'wtlb2-solace', screen: 'wtlb-entry' }, hm: false });
    expect(votNote(CH5.votNotes[0]).vol).toBe('');   // 5:1-11's vol is empty: no caption
    expect(votNote({ letter: 'Hidden', vol: 'Hidden' }).hm).toBe(true);
    const letterRoute = (t) => (t.id === 'wtlb2-solace' ? { place: 'letter', collection: 'wtlb2', n: 12 } : null);
    expect(noteRoute({ id: 'wtlb2-solace' }, 'I shall feed', letterRoute)).toEqual({ place: 'letter', collection: 'wtlb2', n: 12, excerpt: 'I shall feed' });
    expect(noteRoute({ id: 'gone' }, 'x', letterRoute)).toBe(null);
    const gl = { BIBLE_STUDIES: [{ id: 'purity', slug: 'purity' }] };
    expect(noteRoute({ isStudy: true, studyId: 'purity', studyChapterId: 'purity-ch1' }, 'x', letterRoute, gl))
      .toEqual({ place: 'study-chapter', study: 'purity', chapter: 'purity-ch1' });
  });

  it("main's reading record for a Matthew chapter: the place 'matthew', read marks v1:matthew:<n>, a chapter of the book", () => {
    expect(visitOf({ place: 'study-chapter', study: 'matthew-study', chapter: '5' }, { MATTHEW })).toEqual({
      key: 'mt:5', active: 'matthew', slot: 'lastReadChapters', at: 'matthew', value: 5, read: 'v1:matthew:5',
      entry: { type: 'chapter', bookId: 'matthew', bookTitle: 'Matthew', chapterNum: 5, chapterTitle: CH5.title } });
    expect(visitOf({ place: 'study-chapter', study: 'matthew-study', chapter: '29' }, { MATTHEW })).toBe(null);
    expect(verseKey(5, 3)).toBe('study:matthew-5:3');
    expect(bookmarkOf(5)).toEqual({ key: 'study:matthew-5', label: 'Matthew 5 (Study)' });
  });
});

describe('the index (5h)', () => {
  it('the gate draws the picture: Back says Studies; 28 rows with minutes and notes; 1 and 2 read, 3 lit', async () => {
    install();
    const { container } = render(<V2App gateId="5h-matthew" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to Studies');
    expect(container.querySelector('.mtx .overline').textContent).toBe('New Testament Study Bible');
    expect(container.querySelector('.mtx h1.display').textContent).toBe('Matthew');
    expect(container.querySelector('.mtx .lede').textContent).toBe('The Gospel According to Matthew');
    const rows = [...container.querySelectorAll('.mti > .row.num-row')];
    expect(rows.length).toBe(28);
    expect(rows[0].querySelector('.t').textContent).toBe(MATTHEW.chapters[0].title);
    expect(rows[0].querySelector('.s').textContent).toMatch(/^~\d+ min · 0.5× notes$/);
    expect(rows[1].querySelector('.s').textContent).toMatch(/^~\d+ min$/);
    expect(rows.map((r) => !!r.querySelector('.rd')).slice(0, 4)).toEqual([true, true, false, false]);
    expect(rows.filter((r) => r.classList.contains('cur')).map((r) => r.querySelector('.no').textContent)).toEqual(['3']);
    // the index has no Study notes card and no ...
    expect(card(container)).toBe(null);
    expect(container.querySelector('.tb [aria-label="More"]')).toBe(null);
    expect(localStorage.length).toBe(0);
  });
});

describe('a chapter (5i-5k)', () => {
  it('5i from the gate: Matthew 5 under the overline, the summary, the verses keyed as main; Study notes on screen, PDF pressed', async () => {
    install({ dest: () => ({ id: 'x', screen: 'letter' }) });
    const { container } = render(<V2App gateId="5i-matthew-chapter" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to Matthew');
    expect(container.querySelector('.reader-head .overline').textContent).toBe('New Testament Study Bible');
    expect(container.querySelector('.reader-head h1').textContent).toBe('Matthew 5');
    expect(container.querySelector('.reader-head .lede').textContent).toBe(CH5.title);
    const verses = [...container.querySelectorAll('.body.mtb > p .v')];
    expect(verses.length).toBe(CH5.verses.length);
    expect(verses[0].querySelector('.vt').getAttribute('data-hl-key')).toBe('study:matthew-5:1');
    expect(container.querySelectorAll('.body.mtb > p').length).toBe(1);
    // the card: a group named by its caption, three buttons with main's tooltips, exactly one pressed
    const c = card(container);
    expect(c.getAttribute('role')).toBe('group');
    expect(document.getElementById(c.getAttribute('aria-labelledby')).textContent).toBe('Study notes');
    expect(segs(container).map((b) => [b.textContent, b.title])).toEqual([
      ['PDF', 'Study notes as the PDF page'], ['Inline', 'Study notes in the text'],
      ['Off', 'No study notes, references, or further reading']]);
    expect(pressed(container)).toEqual(['PDF']);
    // PDF: the panels after the verses; a reference with its verse is a button, the rest plain
    const refs = [...container.querySelectorAll('.sp-scr .spc > *')];
    expect(refs.length).toBe(CH5.scriptures.length);
    expect(refs.filter((r) => r.tagName === 'BUTTON').length).toBe(CH5.scriptures.filter((s) => !!NKJV[s.cite]).length);
    const plain = container.querySelector('.sp-scr .sref.pl');
    expect(plain.querySelector('.tag').textContent).toBe('5:22, 29, 30');
    expect(plain.getAttribute('data-hl-key')).toBe('study:matthew-5:panel-s' + CH5.scriptures.findIndex((s) => s.ref === '5:22, 29, 30'));
    const notes = [...container.querySelectorAll('.sp-vot .vnote')];
    expect(notes.length).toBe(CH5.votNotes.length);
    expect(notes[0].querySelector('.vt').textContent).toBe('“' + CH5.votNotes[0].letter + '”');
    expect(notes[0].querySelector('.vol')).toBe(null);
    expect(notes[1].querySelector('.vol').textContent).toBe('Volume Five');
    const links = [...container.querySelectorAll('.sp-fur a.slink')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')]))
      .toEqual(CH5.links.map((l) => [l.label, l.url, '_blank']));
    expect(localStorage.length).toBe(0);
  });

  it('5k from the gate: Inline pressed; each note under its verse, the prose broken there; pills back to Solace', async () => {
    install({ dest: () => ({ id: 'x', screen: 'letter' }) });
    const { container } = render(<V2App gateId="5k-matthew-inline" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(pressed(container)).toEqual(['Inline']);
    const body = container.querySelector('.body.mtb.inline');
    const first = body.querySelector('.inl');
    expect([...first.previousElementSibling.querySelectorAll('.v')].map((v) => v.id)).toEqual(['v-1', 'v-2', 'v-3', 'v-4']);
    expect(first.querySelector('.sref .ct').textContent).toBe('Revelation 21:4');
    expect(first.querySelector('.vnote .vt').textContent).toBe('“Solace”');
    for (const v of ['v-6', 'v-8']) {
      const pill = body.querySelector('#' + v + ' .echo');
      expect([pill.title, pill.getAttribute('aria-label'), pill.textContent])
        .toEqual(['See note at 5:3-4, 6, 8', 'See note at 5:3-4, 6, 8', '5:3-4, 6, 8']);
    }
    // the panels are not drawn in Inline; Further study is
    expect(container.querySelector('.sp-scr, .sp-vot')).toBe(null);
    expect(container.querySelector('.sp-fur')).not.toBe(null);
  });

  it('a real boot: Inline, then Off (the verses alone), then PDF; the choice holds on the next chapter', async () => {
    const { container } = liveChapter();
    await waitFor(() => expect(container.querySelector('.reader-head h1')).not.toBe(null));
    expect(pressed(container)).toEqual(['PDF']);
    await click(seg(container, 'Inline'));
    expect(pressed(container)).toEqual(['Inline']);
    expect(container.querySelectorAll('.body.mtb.inline .inl').length).toBeGreaterThan(5);
    // a pill scrolls back to its note's verse
    const into = vi.fn();
    Element.prototype.scrollIntoView = into;
    await click(container.querySelector('#v-6 .echo'));
    expect(into.mock.contexts[0].id).toBe('v-4');
    delete Element.prototype.scrollIntoView;
    await click(seg(container, 'Off'));
    expect(pressed(container)).toEqual(['Off']);
    expect(container.querySelector('.inl, .echo, .spn')).toBe(null);
    expect(container.querySelectorAll('.body.mtb > p .v').length).toBe(CH5.verses.length);
    expect(container.querySelector('.reading-end')).not.toBe(null);
    await click(seg(container, 'Inline'));
    await click(container.querySelector('.nextcard'));
    await waitFor(() => expect(container.querySelector('.reader-head h1').textContent).toBe('Matthew 6'));
    expect(pressed(container)).toEqual(['Inline']);
    expect(container.querySelector('.body.mtb.inline')).not.toBe(null);
    expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to Matthew');
    // chapter 6 has no Scripture references: that panel is not drawn, its 13 notes are
    await click(seg(container, 'PDF'));
    expect(container.querySelector('.sp-scr')).toBe(null);
    expect(container.querySelectorAll('.sp-vot .vnote').length).toBe(13);
    expect(localStorage.length).toBe(0);
  });

  it("the summary hides on a tap, then '+ Show summary'; main's Chapter titles off draws none", async () => {
    const { container } = liveChapter();
    await waitFor(() => expect(container.querySelector('.reader-head .lede .sum')).not.toBe(null));
    await click(container.querySelector('.reader-head .lede .sum'));
    expect(container.querySelector('.reader-head .lede')).toBe(null);
    const show = container.querySelector('.reader-head .sum-show');
    expect(show.textContent).toBe('+ Show summary');
    await click(show);
    expect(container.querySelector('.reader-head .lede').textContent).toBe(CH5.title);
    cleanup();
    const off = liveChapter({ showChapterTitle: false });
    await waitFor(() => expect(off.container.querySelector('.reader-head h1')).not.toBe(null));
    expect(off.container.querySelector('.reader-head .lede, .reader-head .sum-show')).toBe(null);
  });

  it("main's Reference echoes off: Inline has its notes but no pills", async () => {
    const { container } = liveChapter({ showInlineEchoes: false });
    await waitFor(() => expect(card(container)).not.toBe(null));
    await click(seg(container, 'Inline'));
    expect(container.querySelector('.inl')).not.toBe(null);
    expect(container.querySelector('.echo')).toBe(null);
  });

  it("Bookmark keeps main's own key and label for the chapter", async () => {
    let list = [];
    const subs = new Set();
    g.BookmarkStore = {
      all: () => list, get: (id) => list.find((b) => b.id === id) || null,
      add: vi.fn((b) => { list = [...list, b]; subs.forEach((f) => f()); }),
      remove: vi.fn((id) => { list = list.filter((b) => b.id !== id); subs.forEach((f) => f()); }),
      subscribe: (f) => { subs.add(f); return () => subs.delete(f); }, getVersion: () => list.length,
    };
    const { container } = liveChapter();
    await waitFor(() => expect(container.querySelector('.reader-head h1')).not.toBe(null));
    await click(container.querySelector('.tb [aria-label="Bookmark this chapter"]'));
    expect(g.BookmarkStore.add).toHaveBeenCalledTimes(1);
    expect(g.BookmarkStore.add.mock.calls[0][0]).toMatchObject({ hlKey: 'study:matthew-5', label: 'Matthew 5 (Study)' });
  });
});
