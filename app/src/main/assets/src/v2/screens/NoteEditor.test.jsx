/* The note page's ... (dz26 3q): the gate picture (Share, Delete note, titled with the passage), and over stand-ins for
   main's AnnotationStore and NoteStore: Share sends main's text (the passage, the note, the reference and its ?p= link)
   with the words just typed; Delete note removes the note and its highlight at once, goes Back, and the page there says
   "Note deleted." with Undo, which puts the highlight and the note (its notebooks and dates) back; nothing is written
   after the delete. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { placeFor, OVERLAYS } from '../places.js';
import { NoteEditor } from './NoteEditor.jsx';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const GLOBALS = ['AnnotationStore', 'NoteStore', 'NotebookStore', 'hlId', 'COL_BY_KEY', 'LETTERS_V1', '_bookmarkSourceLabel'];
const KEY = 'letter:chosen-by-god:0';
const ROUTE = { place: 'note', key: KEY, start: 0, end: 9, text: 'Thus says', groupId: 'n1' };

afterEach(() => {
  cleanup();
  for (const k of GLOBALS) delete g[k];
  delete html.dataset.gate;
  delete /** @type {any} */ (navigator).share;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** main's AnnotationStore and NoteStore as far as the note page uses them. */
function stores(notes, anns) {
  let v = 0;
  const subs = new Set();
  const bump = () => { v++; subs.forEach((f) => f()); };
  const reactive = { subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => v };
  const A = {
    ...reactive,
    data: /** @type {Record<string, any[]>} */ (JSON.parse(JSON.stringify(anns))),
    get(k) { return this.data[k] || []; },
    add: vi.fn(function (k, a) { (this.data[k] = this.data[k] || []).push({ ...a }); bump(); }),
    removeGroup: vi.fn(function (gid) {
      for (const k of Object.keys(this.data)) { this.data[k] = this.data[k].filter((a) => a.groupId !== gid); if (!this.data[k].length) delete this.data[k]; }
      bump();
    }),
    getByGroup(gid) { return Object.entries(this.data).flatMap(([k, arr]) => arr.filter((a) => a.groupId === gid).map((a) => ({ key: k, ann: a }))); },
  };
  const N = {
    ...reactive,
    map: /** @type {Record<string, any>} */ (JSON.parse(JSON.stringify(notes))),
    all() { return this.map; },
    get(id) { return this.map[id] || null; },
    set: vi.fn(function (id, f) { this.map = { ...this.map, [id]: { notebookIds: [], ...(this.map[id] || {}), ...f, updated: 99 } }; bump(); }),
    remove: vi.fn(function (id) { const m = { ...this.map }; delete m[id]; this.map = m; bump(); }),
    replaceAll: vi.fn(function (m) { this.map = m; bump(); }),
  };
  g.AnnotationStore = A;
  g.NoteStore = N;
  g.NotebookStore = { ...reactive, list: () => [{ id: 'a', name: 'Sabbath study' }], get: (id) => (id === 'a' ? { id, name: 'Sabbath study' } : null) };
  g._bookmarkSourceLabel = (k) => (k === KEY ? 'Chosen by God · Volume One, Letter 1' : null);
  return { A, N };
}

const NOTE = { n1: { groupId: 'n1', body: 'Be steadfast', fullText: 'Thus says', keys: [KEY], notebookIds: ['a'], created: 5, updated: 7 } };
const ANNS = { [KEY]: [{ id: 'n1', groupId: 'n1', kind: 'highlight', start: 0, end: 9, color: 'green', text: 'Thus says', created: 5 }] };

/** The note page, its top bar's ... (the place's actions) and the shell's overlays, as V2App draws them for a note. */
function notePage(route = ROUTE) {
  const pop = vi.fn();
  const def = placeFor('note');
  const Overlay = OVERLAYS['note-deleted'];
  const page = render(<NoteEditor route={route} gate={null} onReady={vi.fn()} />);
  const bar = render(<>{def.actions({ route, go: vi.fn(), pop, desktop: false, device: 'phone' })}</>);
  const shell = render(<Overlay route={route} gate={null} desktop={false} go={vi.fn()} openTab={vi.fn()} />);
  return { page, bar, shell, pop };
}
const more = (bar) => click(bar.container.querySelector('[aria-label="More"]'));
const row = (t) => [...document.querySelectorAll('.sheet.mor .srow')].find((r) => r.querySelector('.t').textContent === t);

describe('3q: the note\'s ...', () => {
  it('the gate picture: titled with the passage; Share (its line) and Delete note; a gate boot does nothing', async () => {
    g.COL_BY_KEY = new Map([['one', { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1', letterScreen: 'vot-volume-one' }]]);
    g.LETTERS_V1 = [{ id: 'humility-and-the-word-of-god', num: 5, title: 'Humility and The Word of God', blocks: [] }];
    const { container: c } = render(<V2App gateId="3q-note-more" />);
    expect(c.querySelector('.tb .title').textContent).toBe('Note');
    expect(c.querySelector('.jed .nbin').textContent).toBe('In Sabbath study, Prophecy');
    const s = document.querySelector('.sheet.mor');
    expect(s.querySelector('.sh').textContent).toBe('Humility and The Word of God');
    expect(texts(s, '.srow .t')).toEqual(['Share', 'Delete note']);
    expect(texts(s, '.srow .s')).toEqual(['The passage, your note and a link']);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await click(row('Delete note'));
    expect(c.querySelector('.jed')).not.toBe(null);
    expect(document.querySelector('.toast')).toBe(null);
  });

  it('Share sends main\'s text: the passage, the note as just typed, the reference and its link', async () => {
    const share = vi.fn(() => Promise.resolve());
    /** @type {any} */ (navigator).share = share;
    const { N } = stores(NOTE, ANNS);
    const { page, bar } = notePage();
    fireEvent.change(page.container.querySelector('textarea.jp'), { target: { value: 'Be steadfast, My son' } });
    await more(bar);
    await click(row('Share'));
    expect(N.set).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ text: 'Thus says\n\nBe steadfast, My son\n\nChosen by God · Volume One, Letter 1\n'
      + 'https://votreader.github.io/app/?p=' + encodeURIComponent(KEY) });
  });

  it('Delete note: the note and its highlight at once, Back, "Note deleted." with Undo putting both back as they were', async () => {
    const { A, N } = stores(NOTE, ANNS);
    const { page, bar, shell, pop } = notePage();
    await more(bar);
    await click(row('Delete note'));
    expect(A.removeGroup).toHaveBeenCalledWith('n1');
    expect(N.remove).toHaveBeenCalledWith('n1');
    expect(pop).toHaveBeenCalledTimes(1);
    page.unmount();   // Back: the page goes; its last save writes nothing
    expect(N.set).not.toHaveBeenCalled();
    expect(N.map.n1).toBeUndefined();
    expect(shell.container.querySelector('.toast').textContent).toBe('Note deleted.Undo');
    await click(shell.container.querySelector('.toast .act'));
    expect(shell.container.querySelector('.toast')).toBe(null);
    expect(N.map.n1).toEqual(NOTE.n1);
    expect(A.data[KEY]).toEqual(ANNS[KEY]);
  });

  it('a new note: words not yet saved are deleted with Undo too; with no words, Back alone and nothing written', async () => {
    const { A, N } = stores({}, {});
    g.hlId = () => 'hl1';
    const first = notePage({ ...ROUTE, groupId: null });
    fireEvent.change(first.page.container.querySelector('textarea.jp'), { target: { value: 'Half a thought' } });
    await more(first.bar);
    await click(row('Delete note'));
    expect(N.set).toHaveBeenCalledTimes(1);
    expect(N.remove).toHaveBeenCalledWith('hl1');
    first.page.unmount();
    expect(N.set).toHaveBeenCalledTimes(1);
    expect(first.shell.container.querySelector('.toast').textContent).toBe('Note deleted.Undo');
    await click(first.shell.container.querySelector('.toast .act'));
    expect(N.map.hl1.body).toBe('Half a thought');
    cleanup();
    N.set.mockClear();
    A.add.mockClear();
    const second = notePage({ ...ROUTE, groupId: null });
    await more(second.bar);
    await click(row('Delete note'));
    expect(second.pop).toHaveBeenCalledTimes(1);
    second.page.unmount();
    expect(N.set).not.toHaveBeenCalled();
    expect(A.add).not.toHaveBeenCalled();
    expect(second.shell.container.querySelector('.toast')).toBe(null);
  });

  it('the toast goes by itself after the Undo time', async () => {
    vi.useFakeTimers();
    stores(NOTE, ANNS);
    const { bar, shell } = notePage();
    await more(bar);
    await click(row('Delete note'));
    expect(shell.container.querySelector('.toast')).not.toBe(null);
    act(() => { vi.advanceTimersByTime(6100); });
    expect(shell.container.querySelector('.toast')).toBe(null);
  });
});
