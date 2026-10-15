/* v2 Notes (zv1): the three gate pictures (3c-notes, 3d-notes-journal, 8c-notes-empty), the chips, "+ Journal entry"
   in the top bar, a real boot re-showing main's stores, and the journal editor writing through JournalStore only
   (never on a gate boot). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App } from '../App.jsx';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);

afterEach(() => {
  cleanup();
  for (const k of ['JournalStore', 'NoteStore', 'BookmarkStore', 'LinkStore', '_collectMarks', 'COLLECTIONS', 'COL_BY_KEY', 'LETTERS_V1', 'JournalHelpers', 'StorageHealth']) delete g[k];
  delete html.dataset.gate;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('gate pictures', () => {
  it('3c-notes: All lit, the five kinds in the picture order with their meta lines; "+ Journal entry" in the top bar', async () => {
    const { container } = render(<V2App gateId="3c-notes" />);
    expect(container.querySelector('.tb .appname').textContent).toBe('VOTReader');
    expect(container.querySelector('.tb .btn2.tbj').textContent).toBe('Journal entry');
    expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('More');
    expect(container.querySelector('.page-head.tabroot h1.display').textContent).toBe('Notes');
    expect(container.querySelector('.lede').textContent).toBe('Everything you marked, newest first');
    expect(texts(container, '.chips.kinds .chip')).toEqual(['All', 'Journal', 'Highlights', 'Notes', 'Bookmarks', 'Links']);
    expect(texts(container, '.chips.kinds .chip.on')).toEqual(['All']);
    expect(texts(container, '.marks .mark .mm')).toEqual([
      'Journal · Today',
      'Highlight · Volume One · Letter 1 · Today',
      'Note · Volume One · Letter 1 · Yesterday',
      'Bookmark · Volume One · Letter 2 · Sunday',
      'Link · Volume One · Letter 1 · Oct 9',
    ]);
    const [j, h, n] = container.querySelectorAll('.marks .mark');
    expect(j.querySelector('.mt').textContent).toBe('On being set apart');
    expect(j.querySelector('.mx').textContent).toBe('What “set apart for My glory” asks of me this week.');
    expect(h.querySelector('.mq .hl.gold').textContent).toMatch(/^Many things you must overcome/);
    expect(n.querySelector('.mq').textContent).toBe('“Timothy, write as I speak.”');
    expect(n.querySelector('.mn').textContent).toBe('Read this again on Sunday.');
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Notes');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('3d-notes-journal: Journal lit, only the three entries, newest first', async () => {
    const { container } = render(<V2App gateId="3d-notes-journal" />);
    expect(container.querySelector('.lede').textContent).toBe('Your own entries, newest first');
    expect(texts(container, '.chips.kinds .chip.on')).toEqual(['Journal']);
    expect(texts(container, '.marks .mark .mt')).toEqual(['On being set apart', 'Sunday with the family', 'Questions for this month']);
    expect(texts(container, '.marks .mark .mm')).toEqual(['Journal · Today', 'Journal · Sunday', 'Journal · Oct 2']);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('8c-notes-empty: no chips, says where journal entries go, New journal entry', async () => {
    const { container } = render(<V2App gateId="8c-notes-empty" />);
    expect(container.querySelector('.chips')).toBe(null);
    expect(container.querySelector('.empty .t').textContent).toBe('Nothing marked yet');
    expect(container.querySelector('.empty .s').textContent).toMatch(/Journal entries and links gather here too\.$/);
    expect(container.querySelector('.empty .btn2').textContent).toBe('New journal entry');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });
});

describe('using Notes', () => {
  it('a chip shows its kind (and says when it has none); Back stays absent on the tab root', async () => {
    const { container } = render(<V2App gateId="3c-notes" />);
    click([...container.querySelectorAll('.chips .chip')][2]);
    expect(texts(container, '.chips .chip.on')).toEqual(['Highlights']);
    expect(container.querySelectorAll('.marks .mark').length).toBe(1);
    expect(container.querySelector('.tb .appname')).not.toBe(null);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const { container: c2 } = render(<V2App gateId="8c-notes-empty" />);
    expect(c2.querySelector('.empty')).not.toBe(null);
  });

  it('+ Journal entry opens the editor under Notes; a gate boot never writes', () => {
    g.JournalStore = { add: vi.fn(), update: vi.fn(), get: vi.fn() };
    const { container } = render(<V2App gateId="3c-notes" />);
    click(container.querySelector('.tb .btn2.tbj'));
    expect(container.querySelector('.tb .title').textContent).toBe('Notes');
    const ta = container.querySelector('.jed textarea.jb');
    expect(ta).not.toBe(null);
    fireEvent.change(container.querySelector('.jed input.jt'), { target: { value: 'A title' } });
    fireEvent.change(ta, { target: { value: 'Words' } });
    click(container.querySelector('.tb button'));
    expect(g.JournalStore.add).not.toHaveBeenCalled();
    expect(g.JournalStore.update).not.toHaveBeenCalled();
    expect(container.querySelector('.lede').textContent).toBe('Everything you marked, newest first');
  });

  it('a real boot lists main stores and a mark opens its letter', () => {
    g.COLLECTIONS = [{ volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1', letterScreen: 'vot-one-letter' }];
    g.LETTERS_V1 = [{ id: 'chosen', num: 1, title: 'Chosen by God', blocks: [] }];
    g.COL_BY_KEY = new Map([['one', g.COLLECTIONS[0]]]);
    g.BookmarkStore = { all: () => [{ id: 'k', hlKey: 'letter:chosen:0', label: '', created: Date.now() }] };
    const { container } = render(<V2App gateId={null} />);
    click([...container.querySelectorAll('.tabbar .tab')][2]);
    expect(texts(container, '.marks .mark .mt')).toEqual(['Chosen by God']);
    expect(container.querySelector('.marks .mark .mm').textContent).toBe('Bookmark · Volume One · Letter 1 · Today');
    click(container.querySelector('.marks .mark[role="button"]'));
    expect(container.querySelector('.tb .title').textContent).toBe('Notes');
    expect(container.querySelector('h1').textContent).toBe('Chosen by God');
  });
});

describe('the journal editor (real boot)', () => {
  function openEditor() {
    const { container } = render(<V2App gateId={null} />);
    click([...container.querySelectorAll('.tabbar .tab')][2]);
    click(container.querySelector('.tb .btn2.tbj'));
    return container;
  }

  it('adds the entry on the first words, then updates it; leaving saves what is unsaved', () => {
    vi.useFakeTimers();
    let n = 0;
    g.JournalStore = { all: () => [], get: () => null, add: vi.fn((seed) => ({ ...seed, id: 'new' + (++n) })), update: vi.fn() };
    const c = openEditor();
    expect(c.querySelector('.tb .title').textContent).toBe('Notes');
    fireEvent.change(c.querySelector('.jed textarea.jb'), { target: { value: 'First words' } });
    act(() => { vi.advanceTimersByTime(600); });
    expect(g.JournalStore.add).toHaveBeenCalledTimes(1);
    expect(g.JournalStore.add.mock.calls[0][0].blocks.map((b) => b.text)).toEqual(['First words']);
    fireEvent.change(c.querySelector('.jed input.jt'), { target: { value: 'My title' } });
    click(c.querySelector('.tb button'));   // Back before the half second
    expect(g.JournalStore.add).toHaveBeenCalledTimes(1);
    expect(g.JournalStore.update).toHaveBeenCalledWith('new1', expect.objectContaining({ title: 'My title' }));
  });

  it('an empty new entry is never saved', () => {
    vi.useFakeTimers();
    g.JournalStore = { all: () => [], get: () => null, add: vi.fn(), update: vi.fn() };
    const c = openEditor();
    fireEvent.change(c.querySelector('.jed input.jt'), { target: { value: '  ' } });
    act(() => { vi.advanceTimersByTime(600); });
    click(c.querySelector('.tb button'));
    expect(g.JournalStore.add).not.toHaveBeenCalled();
  });

  it('editing an entry keeps its picture and verse blocks where they are', () => {
    vi.useFakeTimers();
    const entry = { id: 'j1', title: 'Old', created: Date.now(), blocks: [
      { id: 'b1', type: 'p', text: 'One' }, { id: 'b2', type: 'image', mediaId: 'm1' }, { id: 'b3', type: 'p', text: 'Two' }] };
    g.JournalStore = { all: () => [entry], get: (id) => (id === 'j1' ? entry : null), add: vi.fn(), update: vi.fn() };
    g.JournalHelpers = { describeBlock: (b) => (b.type === 'image' ? '[Image]' : ''), newBlock: (t, x) => ({ id: 'nb', type: t, ...x }) };
    const { container: c } = render(<V2App gateId={null} />);
    click([...c.querySelectorAll('.tabbar .tab')][2]);
    click(c.querySelector('.marks .mark[role="button"]'));
    expect(/** @type {HTMLInputElement} */ (c.querySelector('.jed input.jt')).value).toBe('Old');
    expect(texts(c, '.jed .jother')).toEqual(['[Image]']);
    fireEvent.change(c.querySelectorAll('.jed textarea.jb')[1], { target: { value: 'Two, edited' } });
    act(() => { vi.advanceTimersByTime(600); });
    expect(g.JournalStore.add).not.toHaveBeenCalled();
    const [id, patch] = g.JournalStore.update.mock.calls[0];
    expect(id).toBe('j1');
    expect(patch.blocks).toEqual([{ id: 'b1', type: 'p', text: 'One' }, { id: 'b2', type: 'image', mediaId: 'm1' }, { id: 'b3', type: 'p', text: 'Two, edited' }]);
  });
});

describe("Safari's 7-day notice before a first journal entry (myweb's ask; main's createAndEditJournal)", () => {
  /** main's StorageHealth gate, in memory: the first save of the session in a Safari tab trips it (as RefSheet.test). */
  function health() {
    let blocked = false, dismissed = false, version = 0, first = true;
    const subs = new Set();
    const bump = () => { version++; subs.forEach((cb) => cb()); };
    return {
      checkFirstDataCreation: vi.fn(() => {
        if (!first || dismissed) return { shouldBlock: false };
        first = false; blocked = true; bump();
        return { shouldBlock: true, reason: 'safari-7day' };
      }),
      getReport: () => ({ safariGateBlocked: blocked }),
      isDismissed: () => dismissed,
      dismissScenario: vi.fn(() => { dismissed = true; blocked = false; bump(); }),
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
      getVersion: () => version,
    };
  }

  for (const [where, find] of /** @type {Array<[string, (c: any) => any]>} */ ([
    ['the top bar', (c) => c.querySelector('.tb .btn2.tbj')],
    ['the empty Notes page', (c) => [...c.querySelectorAll('button.btn2')].find((b) => b.textContent === 'New journal entry')],
  ])) {
    it(`+ Journal entry from ${where}: the first tap of a Safari session shows the notice and opens nothing; after Got it the next tap opens the editor`, async () => {
      g.StorageHealth = health();
      g.JournalStore = { all: () => [], add: vi.fn(), update: vi.fn(), get: vi.fn() };
      const { container } = render(<V2App gateId={null} />);
      await click([...container.querySelectorAll('.tabbar .tab')][2]);
      await click(find(container));
      expect(g.StorageHealth.checkFirstDataCreation).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.jed')).toBe(null);
      const notice = document.querySelector('.sheet.safari');
      expect(notice && notice.querySelector('.sh').textContent).toBe('Keep your notes safe');
      await click(notice.querySelector('button.done'));
      expect(document.querySelector('.sheet.safari')).toBe(null);
      await click(find(container));
      expect(container.querySelector('.jed textarea.jb')).not.toBe(null);
      expect(g.JournalStore.add).not.toHaveBeenCalled();   // nothing is written before words
    });
  }
});
