/* v2 notebooks (mw9d, design dz20 3i-3l): the gate pictures (the Notes chip's cards, a notebook's page, its ..., New
   notebook), and a real boot over stand-ins for main's NotebookStore and NoteStore: create with a colour, open, rename,
   share as main's text, delete at once and Undo with the notes' tags and dates put back. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App } from '../App.jsx';
import {
  swatchOf, swatchesFor, noteCount, canName, notebookCards, notesIn, emptyWords, deleteNotebook, UNCATEGORIZED,
} from '../notebook-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const byText = (root, sel, t) => [...root.querySelectorAll(sel)].find((n) => n.textContent === t);
const STORES = ['NotebookStore', 'NoteStore', 'composeNotesExport', 'noteSourceLabel', 'matchMedia'];

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
  };
  const B = {
    ...reactive,
    rows: notebooks.map((nb, i) => ({ sortIndex: i, created: i, updated: i, ...nb })),
    list() { return this.rows.slice().sort((a, b) => a.sortIndex - b.sortIndex); },
    get(id) { return this.rows.find((r) => r.id === id) || null; },
    add: vi.fn(function (name) {
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
