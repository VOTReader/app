/* v2 notebooks (mw9d-e, design dz20 3i-3m): the gate pictures (the Notes chip's cards, a notebook's page, its ..., New
   notebook), and a real boot over stand-ins for main's NotebookStore and NoteStore: create with a colour, open, rename,
   share as main's text, delete at once and Undo with the notes' tags and dates put back. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { NoteEditor } from './NoteEditor.jsx';
import {
  swatchOf, swatchesFor, noteCount, canName, notebookCards, notesIn, emptyWords, deleteNotebook, UNCATEGORIZED,
} from '../notebook-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const byText = (root, sel, t) => [...root.querySelectorAll(sel)].find((n) => n.textContent === t);
const STORES = ['NotebookStore', 'NoteStore', 'composeNotesExport', 'noteSourceLabel', 'matchMedia', 'AnnotationStore', 'hlId',
  'COL_BY_KEY', 'LETTERS_V1'];

afterEach(() => {
  cleanup();
  for (const k of STORES) delete g[k];
  delete html.dataset.gate;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** main's NotebookStore and NoteStore in memory (their API as v2 calls it, CachedStore's subscribe + getVersion). */
function stores(notebooks, notes) {
  const subs = new Set();
  let v = 0;
  const bump = () => { v++; subs.forEach((f) => f()); };
  const reactive = { subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => v };
  const N = {
    ...reactive,
    map: Object.fromEntries(notes.map((n) => [n.groupId, { keys: [], fullText: '', body: '', created: n.updated, ...n }])),
    all() { return this.map; },
    get(id) { return this.map[id] || null; },
    list() { return Object.values(this.map); },
    pruneNotebook(id) {
      for (const k of Object.keys(this.map)) {
        const n = this.map[k];
        if ((n.notebookIds || []).includes(id)) this.map[k] = { ...n, notebookIds: n.notebookIds.filter((x) => x !== id), updated: n.updated + 1 };
      }
      bump();
    },
    replaceAll: vi.fn(function (m) { this.map = m; bump(); }),
    // main's set (a new note's defaults under its own fields) and toggleNotebook (stamps now)
    set: vi.fn(function (id, fields) {
      this.map = { ...this.map, [id]: { groupId: id, notebookIds: [], created: Date.now(), ...(this.map[id] || {}), ...fields, updated: Date.now() } };
      bump();
    }),
    toggleNotebook: vi.fn(function (id, nb) {
      const n = this.map[id];
      if (!n) return;
      const ids = (n.notebookIds || []).includes(nb) ? n.notebookIds.filter((x) => x !== nb) : [...(n.notebookIds || []), nb];
      this.map = { ...this.map, [id]: { ...n, notebookIds: ids, updated: Date.now() } };
      bump();
    }),
  };
  const B = {
    ...reactive,
    rows: notebooks.map((nb, i) => ({ sortIndex: i, created: i, updated: i, ...nb })),
    list() { return this.rows.slice().sort((a, b) => a.sortIndex - b.sortIndex); },
    get(id) { return this.rows.find((r) => r.id === id) || null; },
    add: vi.fn(function (name) {
      const had = this.rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());   // main dedupes by name
      if (had) return had;
      const nb = { id: 'nb' + (this.rows.length + 1), name: name.trim(), sortIndex: this.rows.length, created: 9, updated: 9 };
      this.rows.push(nb);
      bump();
      return nb;
    }),
    rename: vi.fn(function (id, name) { this.get(id).name = name; bump(); }),
    setColor: vi.fn(function (id, c) { const r = this.get(id); if (c) r.color = c; else delete r.color; bump(); }),
    remove: vi.fn(function (id) { this.rows = this.rows.filter((r) => r.id !== id); bump(); N.pruneNotebook(id); }),
    replaceAll: vi.fn(function (d) { this.rows = d.list.slice(); bump(); }),
  };
  g.NotebookStore = B;
  g.NoteStore = N;
  return { B, N };
}

describe('the facts', () => {
  it('main\'s colours as v2 draws them: the five swatches, main\'s own as a sixth; counts; a name needs a letter', () => {
    expect([null, 'green', 'pink', 'blue', 'purple'].map((c) => swatchOf(c).id)).toEqual(['gold', 'sage', 'rose', 'blue', 'plum']);
    expect(swatchOf('teal')).toMatchObject({ id: 'teal', label: 'Teal', main: 'teal', hex: '#00bcd4' });
    expect(swatchesFor('green').map((s) => s.id)).toEqual(['gold', 'sage', 'rose', 'blue', 'plum']);
    expect(swatchesFor('red').map((s) => s.id)).toEqual(['gold', 'sage', 'rose', 'blue', 'plum', 'red']);
    expect([noteCount(1), noteCount(4), noteCount(0)]).toEqual(['1 note', '4 notes', '0 notes']);
    expect([canName(''), canName('  '), canName('123'), canName('Q'), canName('Ä1')]).toEqual([false, false, false, true, true]);
  });

  it('the cards: none without a notebook; Uncategorized first, counting notes in none; a note counts in each of its notebooks', () => {
    expect(notebookCards([], [[], []])).toEqual([]);
    const cards = notebookCards([{ id: 'a', name: 'A', color: null }, { id: 'b', name: 'B', color: 'blue' }], [['a', 'b'], ['a'], [], []]);
    expect(cards.map((c) => c.name + ':' + c.count)).toEqual(['Uncategorized:2', 'A:2', 'B:1']);
  });

  it('a notebook\'s notes newest first by default, or oldest; Uncategorized holds those in none; the empty words', () => {
    const marks = [{ at: 1, nb: ['a'] }, { at: 3, nb: ['a', 'b'] }, { at: 2, nb: [] }];
    expect(notesIn(marks, 'a').map((m) => m.at)).toEqual([3, 1]);
    expect(notesIn(marks, 'a', 'oldest').map((m) => m.at)).toEqual([1, 3]);
    expect(notesIn(marks, UNCATEGORIZED).map((m) => m.at)).toEqual([2]);
    expect(emptyWords('a')).toBe('Nothing here yet. Add a note from the note itself: Add to a notebook.');
    expect(emptyWords(UNCATEGORIZED)).toBe('Notes that aren\'t in any notebook will appear here.');
  });

  it('Delete notebook at once; Undo puts it back with its own id, and its tag back on the same notes, their dates unmoved', () => {
    const { B, N } = stores([{ id: 'a', name: 'A', color: 'green' }, { id: 'b', name: 'B' }],
      [{ groupId: 'n1', notebookIds: ['a'], updated: 1000 }, { groupId: 'n2', notebookIds: ['a', 'b'], updated: 2000 },
        { groupId: 'n3', notebookIds: ['b'], updated: 3000 }]);
    const undo = deleteNotebook('a');
    expect(B.list().map((n) => n.id)).toEqual(['b']);
    expect(N.get('n1').notebookIds).toEqual([]);
    undo();
    expect(B.get('a')).toMatchObject({ id: 'a', name: 'A', color: 'green', sortIndex: 0 });
    expect(B.list().map((n) => n.id)).toEqual(['a', 'b']);
    expect(N.get('n1')).toMatchObject({ notebookIds: ['a'], updated: 1002 });
    expect(N.get('n2')).toMatchObject({ notebookIds: ['b', 'a'], updated: 2002 });
    expect(N.get('n3')).toMatchObject({ notebookIds: ['b'], updated: 3000 });
    expect(deleteNotebook('gone')).toBe(null);
  });
});

describe('gate pictures', () => {
  it('3i: the Notes chip leads with Notebooks: Uncategorized, the three in main\'s order, + New notebook; then All notes', async () => {
    const { container: c } = render(<V2App gateId="3i-notes-notebooks" />);
    expect(c.querySelector('.lede').textContent).toBe('Your notes and their notebooks');
    expect(texts(c, '.chips.kinds .chip.on')).toEqual(['Notes']);
    expect(texts(c, '.label.nbl')).toEqual(['Notebooks', 'All notes · newest first']);
    expect(texts(c, '.nbg .nbc .nbn')).toEqual(['Uncategorized', 'Sabbath study', 'Prophecy', 'For the family']);
    expect(texts(c, '.nbg .nbc .nbk')).toEqual(['2 notes', '4 notes', '3 notes', '1 note']);
    expect([...c.querySelectorAll('.nbg .nbdot')].map((d) => d.className)).toEqual(['nbdot un', 'nbdot sage', 'nbdot blue', 'nbdot rose']);
    expect(c.querySelector('.nbg .nbnew').textContent).toBe('New notebook');
    expect(c.querySelector('.marks').className).toBe('g marks nbm');
    expect(texts(c, '.marks .mark .mm').slice(0, 2)).toEqual(['Note · Volume One · Letter 5 · Today', 'Note · Volume One · Letter 3 · Yesterday']);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('3j: Sabbath study\'s page: its dot and Notebook, the name, 4 notes, Newest first; the order turns', async () => {
    const { container: c } = render(<V2App gateId="3j-notebook" />);
    expect(c.querySelector('.tb .title').textContent).toBe('Notes');
    expect(c.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Back to Notes');
    expect(c.querySelector('.overline.nbo').textContent).toBe('Notebook');
    expect(c.querySelector('.overline.nbo .nbdot').className).toBe('nbdot sage');
    expect(c.querySelector('h1.display').textContent).toBe('Sabbath study');
    expect(texts(c, '.nbbar .nbct, .nbbar .nbsort')).toEqual(['4 notes', 'Newest first']);
    const days = () => texts(c, '.marks .mark .mm').map((t) => t.split(' · ').pop());
    expect(days()).toEqual(['Today', 'Yesterday', 'Sunday', 'Oct 9']);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await click(c.querySelector('.nbsort'));
    expect(c.querySelector('.nbsort').textContent).toBe('Oldest first');
    expect(c.querySelector('.nbsort').getAttribute('aria-label')).toBe('Order: tap for newest first');
    expect(days()).toEqual(['Oct 9', 'Sunday', 'Yesterday', 'Today']);
  });

  it('3k: its ... holds Share as text, Rename or recolour, Delete notebook, with their lines; a gate boot does nothing', async () => {
    render(<V2App gateId="3k-notebook-more" />);
    const more = document.querySelector('.sheet.mor');
    expect(more.querySelector('.sh').textContent).toBe('Sabbath study');
    expect(texts(more, '.srow .t')).toEqual(['Share as text', 'Rename or recolour', 'Delete notebook']);
    expect(texts(more, '.srow .s')).toEqual(['Its 4 notes as one message', 'Its 4 notes move to Uncategorized']);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('3l: New notebook over 3i: "Questions", Plum chosen, Create notebook on', async () => {
    render(<V2App gateId="3l-notebook-new" />);
    const s = document.querySelector('[role="dialog"][aria-label="New notebook"]');
    expect(s.className).toBe('sheet nbs');
    expect(/** @type {HTMLInputElement} */ (s.querySelector('input.q')).value).toBe('Questions');
    expect(s.querySelector('.field').className).toBe('field focus');
    expect(texts(s, '.label.nbl2')).toEqual(['Colour']);
    expect([...s.querySelectorAll('.swatch')].map((b) => b.getAttribute('aria-label') + ':' + b.getAttribute('aria-checked')))
      .toEqual(['Gold:false', 'Sage:false', 'Rose:false', 'Blue:false', 'Plum:true']);
    expect(s.querySelector('.pill.block').textContent).toBe('Create notebook');
    expect(s.querySelector('.pill.block').hasAttribute('disabled')).toBe(false);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('3m: Letter 5\'s note, its place over the words, "In Sabbath study, Prophecy", Add to a notebook open; it writes nothing', async () => {
    g.COL_BY_KEY = new Map([['one', { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1', letterScreen: 'vot-volume-one' }]]);
    g.LETTERS_V1 = [{ id: 'humility-and-the-word-of-god', num: 5, title: 'Humility and The Word of God', blocks: [] }];
    const { container: c } = render(<V2App gateId="3m-note-notebooks" />);
    expect(c.querySelector('.tb .title').textContent).toBe('Note');
    expect(c.querySelector('.jed .jdate').textContent).toBe('Volume One · Letter 5 · Humility and The Word of God');
    expect(c.querySelector('.jed blockquote.nq').textContent).toBe('For I AM, and My Word the same.');
    expect(/** @type {HTMLTextAreaElement} */ (c.querySelector('.jed textarea.jp')).value).toBe('Malachi 3:6 says the same.');
    expect(c.querySelector('.jed .nbin').textContent).toBe('In Sabbath study, Prophecy');
    const s = document.querySelector('[role="dialog"][aria-label="Add to a notebook"]');
    expect(s.className).toBe('sheet nbp');
    expect(s.querySelector('.sh').textContent).toBe('Add to a notebook');
    expect(s.querySelector('.nbpn').textContent).toBe('A note can sit in more than one.');
    const rows = [...s.querySelectorAll('.srow.nbr:not(.nbadd)')];
    expect(rows.map((r) => r.querySelector('.t').textContent + ' · ' + r.querySelector('.s').textContent + ' · ' + r.getAttribute('aria-checked')))
      .toEqual(['Sabbath study · 4 notes · true', 'Prophecy · 3 notes · true', 'For the family · 1 note · false']);
    expect(rows.map((r) => r.getAttribute('role'))).toEqual(['checkbox', 'checkbox', 'checkbox']);
    expect(rows.map((r) => r.querySelector('.nbdot').className)).toEqual(['nbdot sage', 'nbdot blue', 'nbdot rose']);
    expect(rows.map((r) => r.querySelector('.cbx').className)).toEqual(['cbx on', 'cbx on', 'cbx']);
    expect(s.querySelector('.nbadd').textContent).toBe('New notebook');
    expect(s.querySelector('.pill.block.done').textContent).toBe('Done');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await click(rows[2]);
    await click(s.querySelector('.nbadd'));
    expect(rows[2].getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('[aria-label="New notebook"]')).toBe(null);
  });
});

describe('a note\'s notebooks, from the note (3m) over main\'s stores', () => {
  const ROUTE = { place: 'note', key: 'letter:x:0', start: 0, end: 4, text: 'Thus', groupId: 'n1' };
  const rowsOf = () => [...document.querySelectorAll('.sheet.nbp .srow.nbr:not(.nbadd)')];
  const ticks = () => rowsOf().map((r) => r.querySelector('.t').textContent + ':' + r.getAttribute('aria-checked'));

  it('a tick saves at once through main\'s toggle, in more than one; the row names them in main\'s order; no Uncategorized', async () => {
    const { N } = stores([{ id: 'a', name: 'Sabbath study', color: 'green' }, { id: 'b', name: 'Prophecy', color: 'blue' }],
      [{ groupId: 'n1', notebookIds: [], updated: 1, body: 'Words' }, { groupId: 'n2', notebookIds: ['a'], updated: 2 }]);
    const { container: c } = render(<NoteEditor route={ROUTE} gate={null} onReady={vi.fn()} />);
    expect(c.querySelector('.nbin').textContent).toBe('Add to a notebook');
    await click(c.querySelector('.nbin'));
    expect(ticks()).toEqual(['Sabbath study:false', 'Prophecy:false']);
    expect(texts(document, '.sheet.nbp .srow.nbr .s')).toEqual(['1 note', '0 notes']);
    await click(rowsOf()[1]);
    expect(N.toggleNotebook).toHaveBeenLastCalledWith('n1', 'b');
    expect(N.map.n1.notebookIds).toEqual(['b']);
    expect(ticks()).toEqual(['Sabbath study:false', 'Prophecy:true']);
    expect(texts(document, '.sheet.nbp .srow.nbr .s')).toEqual(['1 note', '1 note']);
    expect(c.querySelector('.nbin').textContent).toBe('In Prophecy');
    await click(rowsOf()[0]);
    expect(c.querySelector('.nbin').textContent).toBe('In Sabbath study, Prophecy');
    await click(rowsOf()[0]);
    expect(N.map.n1.notebookIds).toEqual(['b']);
    expect(c.querySelector('.nbin').textContent).toBe('In Prophecy');
    await click(document.querySelector('.sheet.nbp .done'));
    expect(document.querySelector('.sheet.nbp')).toBe(null);
    expect(N.set).not.toHaveBeenCalled();
  });

  it('+ New notebook: 3l\'s sheet, then back here with it ticked; closing it comes back unticked', async () => {
    const { B, N } = stores([{ id: 'a', name: 'Sabbath study' }], [{ groupId: 'n1', notebookIds: ['a'], updated: 1, body: 'Words' }]);
    const { container: c } = render(<NoteEditor route={ROUTE} gate={null} onReady={vi.fn()} />);
    await click(c.querySelector('.nbin'));
    await click(document.querySelector('.sheet.nbp .nbadd'));
    expect(document.querySelector('.sheet.nbp')).toBe(null);
    const s = document.querySelector('[aria-label="New notebook"]');
    fireEvent.change(s.querySelector('input.q'), { target: { value: 'Questions' } });
    await click(s.querySelector('.pill.block'));
    expect(B.add).toHaveBeenCalledWith('Questions');
    expect(N.toggleNotebook).toHaveBeenLastCalledWith('n1', 'nb2');
    expect(ticks()).toEqual(['Sabbath study:true', 'Questions:true']);
    expect(c.querySelector('.nbin').textContent).toBe('In Sabbath study, Questions');
    // main's add returns the notebook a name already has: ticked already, it stays ticked
    await click(document.querySelector('.sheet.nbp .nbadd'));
    fireEvent.change(document.querySelector('[aria-label="New notebook"] input.q'), { target: { value: 'Questions' } });
    await click(document.querySelector('[aria-label="New notebook"] .pill.block'));
    expect(ticks()).toEqual(['Sabbath study:true', 'Questions:true']);
    await click(document.querySelector('.sheet.nbp .nbadd'));
    await click(document.querySelector('.scrim'));
    expect(ticks()).toEqual(['Sabbath study:true', 'Questions:true']);
    expect(N.toggleNotebook).toHaveBeenCalledTimes(1);
  });

  it('a new note: no row until it has words; opening the sheet saves them first, and the last save keeps its notebooks', async () => {
    vi.useFakeTimers();
    const { N } = stores([{ id: 'a', name: 'Sabbath study' }], []);
    const rows = [];
    g.AnnotationStore = { add: vi.fn((key, ann) => rows.push({ key, ann })), getByGroup: (id) => rows.filter((r) => r.ann.groupId === id) };
    g.hlId = () => 'hl1';
    const { container: c, unmount } = render(<NoteEditor route={{ ...ROUTE, groupId: null }} gate={null} onReady={vi.fn()} />);
    expect(c.querySelector('.nbin')).toBe(null);
    fireEvent.change(c.querySelector('textarea.jp'), { target: { value: '  ' } });
    expect(c.querySelector('.nbin')).toBe(null);
    fireEvent.change(c.querySelector('textarea.jp'), { target: { value: 'Be steadfast' } });
    expect(c.querySelector('.nbin').textContent).toBe('Add to a notebook');
    expect(N.set).not.toHaveBeenCalled();
    await click(c.querySelector('.nbin'));
    expect(N.set).toHaveBeenCalledTimes(1);
    expect(N.map.hl1.body).toBe('Be steadfast');
    await click(rowsOf()[0]);
    expect(N.map.hl1.notebookIds).toEqual(['a']);
    fireEvent.change(c.querySelector('textarea.jp'), { target: { value: 'Be steadfast, My son' } });
    unmount();
    expect(N.map.hl1).toMatchObject({ body: 'Be steadfast, My son', notebookIds: ['a'] });
    expect(g.AnnotationStore.add).toHaveBeenCalledTimes(1);
  });
});

describe('a real boot over main\'s stores', () => {
  function notesChip() {
    const r = render(<V2App gateId={null} />);
    act(() => { [...r.container.querySelectorAll('.tabbar .tab')][2].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { byText(r.container, '.chips.kinds .chip', 'Notes').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    return r.container;
  }

  it('no notebooks yet: only New notebook; Create waits for a letter, then makes it in main\'s store with its colour', async () => {
    const { B } = stores([], [{ groupId: 'n1', notebookIds: [], updated: Date.now(), body: 'One' }]);
    const c = notesChip();
    expect(texts(c, '.nbg .nbc')).toEqual(['New notebook']);
    await click(c.querySelector('.nbnew'));
    const s = document.querySelector('[aria-label="New notebook"]');
    const input = /** @type {HTMLInputElement} */ (s.querySelector('input.q'));
    expect(input.maxLength).toBe(60);
    fireEvent.change(input, { target: { value: '2026' } });
    expect(s.querySelector('.pill.block').hasAttribute('disabled')).toBe(true);
    fireEvent.change(input, { target: { value: 'Questions ' } });
    await click(s.querySelector('.swatch.plum'));
    await click(s.querySelector('.pill.block'));
    expect(B.add).toHaveBeenCalledWith('Questions');
    expect(B.setColor).toHaveBeenCalledWith('nb1', 'purple');
    expect(document.querySelector('[aria-label="New notebook"]')).toBe(null);
    expect(texts(c, '.nbg .nbc .nbn')).toEqual(['Uncategorized', 'Questions']);
    expect(texts(c, '.nbg .nbc .nbk')).toEqual(['1 note', '0 notes']);
    expect(c.querySelectorAll('.nbg .nbdot')[1].className).toBe('nbdot plum');
  });

  it('a notebook main coloured teal keeps it: its dot in main\'s hex, a sixth swatch chosen in Rename or recolour', async () => {
    stores([{ id: 'a', name: 'Prophecy', color: 'teal' }], []);
    const c = notesChip();
    expect(/** @type {HTMLElement} */ (c.querySelectorAll('.nbg .nbdot')[1]).style.getPropertyValue('--nbc')).toBe('#00bcd4');
    await click(c.querySelectorAll('.nbg .nbc')[1]);
    await click(document.querySelector('.tb [aria-label="More"]'));
    await click(byText(document.querySelector('.sheet.mor'), '.srow', 'Rename or recolour'));
    const s = document.querySelector('[aria-label="Rename or recolour"]');
    expect([...s.querySelectorAll('.swatch')].map((b) => b.getAttribute('aria-label') + ':' + b.getAttribute('aria-checked')))
      .toEqual(['Gold:false', 'Sage:false', 'Rose:false', 'Blue:false', 'Plum:false', 'Teal:true']);
    expect(s.querySelector('.pill.block').textContent).toBe('Save');
  });

  it('a notebook\'s page: Rename or recolour saves to main\'s store and the page follows; Share as text is main\'s text', async () => {
    const now = Date.now();
    const { B } = stores([{ id: 'a', name: 'Sabbath study', color: 'green' }],
      [{ groupId: 'n1', notebookIds: ['a'], updated: now - 1000, body: 'Older' }, { groupId: 'n2', notebookIds: ['a'], updated: now, body: 'Newer' }]);
    g.composeNotesExport = vi.fn(({ title, notes }) => '# ' + title + '\n' + notes.map((n) => n.body).join('\n'));
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const c = notesChip();
    await click(c.querySelectorAll('.nbg .nbc')[1]);
    expect(c.querySelector('h1.display').textContent).toBe('Sabbath study');
    expect(texts(c, '.marks .mark .mn')).toEqual(['Newer', 'Older']);
    await click(document.querySelector('.tb [aria-label="More"]'));
    await click(byText(document.querySelector('.sheet.mor'), '.srow', 'Share as textIts 2 notes as one message'));
    expect(share).toHaveBeenCalledWith({ text: '# Sabbath study\nNewer\nOlder' });
    await click(document.querySelector('.tb [aria-label="More"]'));
    await click(byText(document.querySelector('.sheet.mor'), '.srow', 'Rename or recolour'));
    const s = document.querySelector('[aria-label="Rename or recolour"]');
    fireEvent.change(s.querySelector('input.q'), { target: { value: 'Sabbath' } });
    await click(s.querySelector('.swatch.gold'));
    await click(s.querySelector('.pill.block'));
    expect(B.rename).toHaveBeenCalledWith('a', 'Sabbath');
    expect(B.setColor).toHaveBeenCalledWith('a', null);
    expect(c.querySelector('h1.display').textContent).toBe('Sabbath');
    expect(c.querySelector('.overline.nbo .nbdot').className).toBe('nbdot gold');
    delete (/** @type {any} */ (navigator)).share;
  });

  it('Delete notebook: at once, back to Notes with main\'s words and Undo; Undo puts it back', async () => {
    const { B } = stores([{ id: 'a', name: 'Sabbath study', color: 'green' }],
      [{ groupId: 'n1', notebookIds: ['a'], updated: Date.now(), body: 'One' }]);
    const c = notesChip();
    await click(c.querySelectorAll('.nbg .nbc')[1]);
    await click(document.querySelector('.tb [aria-label="More"]'));
    expect(texts(document.querySelector('.sheet.mor'), '.srow .s')).toEqual(['Its note as one message', 'Its note moves to Uncategorized']);
    await click(byText(document.querySelector('.sheet.mor'), '.srow .t', 'Delete notebook').closest('.srow'));
    expect(B.remove).toHaveBeenCalledWith('a');
    expect(c.querySelector('h1.display').textContent).toBe('Notes');
    expect(document.querySelector('.toast').textContent).toBe('Deleted Sabbath study. Its notes are in Uncategorized.Undo');
    expect(texts(c, '.nbg .nbc')).toEqual(['New notebook']);
    await click(document.querySelector('.toast .act'));
    expect(document.querySelector('.toast')).toBe(null);
    expect(texts(c, '.nbg .nbc .nbn')).toEqual(['Uncategorized', 'Sabbath study']);
    expect(texts(c, '.nbg .nbc .nbk')).toEqual(['0 notes', '1 note']);
  });

  it('Uncategorized: its page lists the notes in no notebook, its ... shares only; empty, main\'s words', async () => {
    stores([{ id: 'a', name: 'A' }], [{ groupId: 'n1', notebookIds: ['a'], updated: Date.now(), body: 'In A' }]);
    const c = notesChip();
    await click(c.querySelector('.nbg .nbc'));
    expect(c.querySelector('h1.display').textContent).toBe('Uncategorized');
    expect(c.querySelector('.overline.nbo .nbdot').className).toBe('nbdot un');
    expect(c.querySelector('.empty .t').textContent).toBe('Notes that aren\'t in any notebook will appear here.');
    await click(document.querySelector('.tb [aria-label="More"]'));
    expect(texts(document.querySelector('.sheet.mor'), '.srow .t')).toEqual(['Share as text']);
  });
});
