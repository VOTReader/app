/* NotesIndexScreen — full-text search over the Notes index.
   ──────────────────────────────────────────────────────────
   filterNotesByQuery matches a note's body, its anchor excerpt (fullText,
   display-normalized like NoteRow renders it), and its source label — the
   same surface the Bookmarks/Links/Highlights indexes already filter on.
   The screen renders the shared .notes-index-search box on the All Notes
   tab AND inside a drilled notebook; a query with zero hits shows the
   "No Matches" empty state. NotesIndexScreen reads bare globals
   (NoteStore/NotebookStore/ScreenLayout/LibraryNav/NoteRow/noteSourceLabel),
   so we stub them; NoteRow is the REAL component. */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { NotesIndexScreen, filterNotesByQuery } from './NotesIndexScreen.jsx';
import { NoteRow } from '../components/NoteRow.jsx';
import { noteSourceSegments } from '../../utils/note-source.js';

const SRC = {
  'bible:genesis:1:1': 'Genesis 1:1',
  'bible:psalms:23:1': 'Psalms 23:1',
  'letter:grafted-in:0': 'Grafted In',
};

const NOTES = [
  { groupId: 'g1', color: 'yellow', body: 'The covenant of peace', fullText: 'my anchor text', keys: ['bible:genesis:1:1'], created: 1, updated: 6, notebookIds: ['nb1'] },
  { groupId: 'g2', color: 'green', body: 'A different thought', fullText: 'an everlasting covenant with them', keys: ['bible:psalms:23:1'], created: 2, updated: 5, notebookIds: [] },
  { groupId: 'g3', color: 'pink', body: 'Unrelated musing', fullText: 'plain words', keys: ['letter:grafted-in:0'], created: 3, updated: 4, notebookIds: ['nb1'] },
];

const NBS = [{ id: 'nb1', name: 'Faith' }];

function setupGlobals() {
  window.noteSourceLabel = (n) => SRC[(n.keys || [])[0]] || 'Note';
  // NoteRow is the REAL component and renders one tap target per source
  // segment, so the segmenter it reads has to be here too.
  window.noteSourceSegments = noteSourceSegments;
  window.relativeDate = () => '1w ago';
  window.NoteStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    list: () => NOTES,
  };
  window.NotebookStore = {
    subscribe: () => () => {},
    getVersion: () => 1,
    list: () => NBS,
    get: (id) => NBS.find(nb => nb.id === id) || null,
  };
  window.ScreenLayout = ({ children }) => <div>{children}</div>;
  window.LibraryNav = () => null;
  // Cross-bundle: the screen ships in bundle-g and reads this from bundle-d's
  // window slot (src/ui/_entry-g.js) rather than importing a second copy.
  window.normalizeExcerptDisplay = normalizeExcerptDisplay;
  window.NoteRow = NoteRow;
}

const GLOBALS = ['noteSourceLabel', 'noteSourceSegments', 'relativeDate', 'NoteStore', 'NotebookStore', 'ScreenLayout', 'LibraryNav', 'NoteRow'];

beforeEach(() => { setupGlobals(); localStorage.removeItem('vot-notes-tab'); });
afterEach(() => {
  cleanup();
  GLOBALS.forEach(g => { delete window[g]; });
});

const props = {
  onBack: () => {}, onHome: () => {}, onOpenNote: () => {}, onNavigateToSource: () => {},
  theme: 'dark', onThemeChange: () => {}, onSearch: () => {}, onHistory: () => {},
  onSettings: () => {}, historyEnabled: true,
};

describe('filterNotesByQuery', () => {
  it('returns the list unchanged for a blank or whitespace-only query', () => {
    expect(filterNotesByQuery(NOTES, '')).toBe(NOTES);
    expect(filterNotesByQuery(NOTES, '   ')).toBe(NOTES);
  });

  it('matches the note body case-insensitively', () => {
    const out = filterNotesByQuery(NOTES, 'COVENANT OF PEACE');
    expect(out.map(n => n.groupId)).toEqual(['g1']);
  });

  it('matches the anchor excerpt (fullText)', () => {
    const out = filterNotesByQuery(NOTES, 'everlasting');
    expect(out.map(n => n.groupId)).toEqual(['g2']);
  });

  it('matches the display-normalized form of a legacy collapsed-line excerpt', () => {
    const legacy = [{ groupId: 'gx', body: '', fullText: 'thought captive,And become', keys: [] }];
    const out = filterNotesByQuery(legacy, 'captive, and');
    expect(out.map(n => n.groupId)).toEqual(['gx']);
  });

  it('matches the source label', () => {
    const out = filterNotesByQuery(NOTES, 'grafted');
    expect(out.map(n => n.groupId)).toEqual(['g3']);
  });

  it('returns [] on no match and tolerates missing body/fullText', () => {
    expect(filterNotesByQuery(NOTES, 'zzqxjv')).toEqual([]);
    expect(filterNotesByQuery([{ groupId: 'g0', keys: [] }], 'anything')).toEqual([]);
  });
});

describe('NotesIndexScreen — link-out back pill', () => {
  afterEach(() => { delete window.navHandoff; delete window.__screenBack; });

  it('renders the "Back to <source>" pill from notesReturnCtx.backPill and returns to source in one tap', () => {
    const store = { notesReturnCtx: { tab: 'notebooks', drilledNbId: 'nb1', backPill: { title: 'My Journal · Morning' } } };
    window.navHandoff = { peek: (k) => store[k] || null, set: (k, v) => { store[k] = v; }, clear: (k) => { delete store[k]; } };
    const onBack = vi.fn();
    const { container, getByText } = render(<NotesIndexScreen {...props} onBack={onBack} />);
    const pill = container.querySelector('.back-hint-pill');
    expect(pill).not.toBeNull();
    expect(getByText('My Journal · Morning')).toBeTruthy();
    fireEvent.click(pill);
    expect(onBack).toHaveBeenCalled();
  });

  it('shows no back pill on a normal open (no backPill in the return context)', () => {
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(container.querySelector('.back-hint-pill')).toBeNull();
  });

  /* Sweep v027: a note tap-through re-stashes notesReturnCtx so the reading screen's "Back to Faith" pill
     lands in the same notebook. That stash used to carry only {tab, drilledNbId}, so the remounted list
     came back without the journal pill and the one-tap way back to the entry was gone. */
  describe('across a note tap-through and back', () => {
    const ORIGIN = { screen: 'journal-viewer', returnOrigin: null };
    /** @type {Record<string, any>} */ let store;
    beforeEach(() => {
      store = { notesReturnCtx: { tab: 'notebooks', drilledNbId: 'nb1', backPill: { title: 'My Journal · Morning' } } };
      window.navHandoff = { peek: (k) => store[k] || null, set: (k, v) => { store[k] = v; }, clear: (k) => { delete store[k]; } };
      window.noteSourceNav = () => ({ type: 'bible', bookId: 'genesis', chapter: 1, verse: 1 });
    });
    afterEach(() => { delete window.noteSourceNav; });

    /** Open the notebook from the journal card, tap its first note, leave for the passage. */
    const tapThrough = () => {
      const onNavigateToSource = vi.fn();
      const first = render(<NotesIndexScreen {...props} navOrigin={ORIGIN} onNavigateToSource={onNavigateToSource} />);
      expect(first.getByText('My Journal · Morning')).toBeTruthy();
      fireEvent.click(first.container.querySelector('.note-row'));
      expect(onNavigateToSource).toHaveBeenCalledTimes(1);
      first.unmount();
    };

    it('comes back to the same notebook with the "Back to My Journal" pill still there', () => {
      tapThrough();
      const onBack = vi.fn();
      const { container, getByText } = render(<NotesIndexScreen {...props} navOrigin={ORIGIN} onBack={onBack} />);
      expect(container.querySelector('.nb-drilled-title').textContent).toBe('Faith');
      expect(getByText('My Journal · Morning')).toBeTruthy();
      fireEvent.click(container.querySelector('.back-hint-pill'));
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('drops the pill when Notes is reopened some other way (Back no longer leads to the journal)', () => {
      tapThrough();
      // Top-nav Notes from the passage captures a new origin; the pill would name a place Back skips.
      const { container } = render(<NotesIndexScreen {...props} navOrigin={{ screen: 'bible-ch', bookId: 'genesis', chapterNum: 1 }} />);
      expect(container.querySelector('.back-hint-pill')).toBeNull();
    });
  });
});

describe('NotesIndexScreen drilled header', () => {
  it('shows the Notes index header at the top level (the shared personal-study header)', () => {
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(container.querySelector('.study-head-title').textContent).toBe('Notes');
    expect(container.querySelector('.nb-drilled-title')).toBeNull();
  });

  it('replaces it with the notebook name as the drilled title (no stacked headers)', () => {
    const { container, getByText } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(getByText('Faith'));
    expect(container.querySelector('.nb-drilled-title').textContent).toBe('Faith');
    expect(container.querySelector('.study-head-title')).toBeNull();
  });

  it('counts the drilled notebook’s notes, not the whole index', () => {
    const { container, getByText } = render(<NotesIndexScreen {...props} />);
    // 3 notes total, 2 of them in Faith (g1 + g3).
    expect(container.querySelector('.study-head-count').textContent).toBe('3 notes');
    fireEvent.click(getByText('Faith'));
    expect(container.querySelector('.nb-drilled-count').textContent).toBe('2 notes');
  });
});

describe('NotesIndexScreen search box', () => {
  it('filters the All Notes tab live and shows No Matches on zero hits', () => {
    const { container, getByText } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(getByText('All Notes'));

    const input = container.querySelector('input.notes-index-search');
    expect(input).not.toBeNull();
    expect(container.querySelectorAll('.note-row').length).toBe(3);

    fireEvent.change(input, { target: { value: 'covenant' } });
    expect(container.querySelectorAll('.note-row').length).toBe(2);

    fireEvent.change(input, { target: { value: 'grafted in' } });
    expect(container.querySelectorAll('.note-row').length).toBe(1);

    fireEvent.change(input, { target: { value: 'zzqxjv' } });
    expect(container.querySelectorAll('.note-row').length).toBe(0);
    expect(container.querySelector('.notes-empty-title').textContent).toBe('No Matches');

    fireEvent.change(input, { target: { value: '' } });
    expect(container.querySelectorAll('.note-row').length).toBe(3);
  });

  it('filters a drilled notebook view too', () => {
    const { container, getByText } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(getByText('Faith'));

    const input = container.querySelector('input.notes-index-search');
    expect(input).not.toBeNull();
    expect(container.querySelectorAll('.note-row').length).toBe(2); // g1 + g3

    fireEvent.change(input, { target: { value: 'covenant' } });
    expect(container.querySelectorAll('.note-row').length).toBe(1);

    fireEvent.change(input, { target: { value: 'zzqxjv' } });
    expect(container.querySelector('.notes-empty-title').textContent).toBe('No Matches');
  });

  it('keeps the "Nothing here yet" empty state when the drilled notebook is truly empty', () => {
    window.NoteStore.list = () => [];
    const { container, getByText } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(getByText('Faith'));
    expect(container.querySelector('.notes-empty-title').textContent).toBe('Nothing here yet');
  });
});

/* Sweep W69: NoteStore.list() builds and sorts a fresh array per call, so memos keyed on its result
   missed on every keystroke and every row re-sorted and re-counted. The lists are keyed on the store
   versions now: one list per version, and a write still shows. */
describe('NotesIndexScreen — large libraries', () => {
  it('lists notes and notebooks once per store version, not once per keystroke', () => {
    let lists = 0, nbLists = 0, ver = 1;
    /** @type {null | (() => void)} */ let ping = null;
    let notes = NOTES.slice();
    window.NoteStore = {
      subscribe: (cb) => { ping = cb; return () => { ping = null; }; },
      getVersion: () => ver,
      list: () => { lists++; return notes.slice(); },
    };
    window.NotebookStore = { ...window.NotebookStore, list: () => { nbLists++; return NBS.slice(); } };
    const { container, getByText } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(getByText('All Notes'));
    const input = container.querySelector('input.notes-index-search');
    for (const q of ['c', 'co', 'cov', 'cove']) fireEvent.change(input, { target: { value: q } });
    expect(container.querySelectorAll('.note-row').length).toBe(2);
    expect(lists).toBe(1);
    expect(nbLists).toBe(1);
    // A write bumps the version: the list is read again and the new note is found.
    notes = notes.concat([{ groupId: 'g4', color: 'blue', body: 'covenant kept', fullText: '', keys: [], created: 7, updated: 7, notebookIds: [] }]);
    act(() => { ver = 2; if (ping) ping(); });
    expect(lists).toBe(2);
    expect(container.querySelectorAll('.note-row').length).toBe(3);
  });
});

/* U03.8/U08.4: Notes opened on Notebooks, a lone "Uncategorized" row, a tap away from every note. */
describe('NotesIndexScreen opening tab', () => {
  const active = (c) => c.querySelector('.notes-tab.active').textContent;
  it('opens on All notes while the reader has no notebook of their own', () => {
    window.NotebookStore = { ...window.NotebookStore, list: () => [] };
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(active(container)).toMatch(/All notes/i);
  });

  it('opens on Notebooks when there are notebooks, then on whichever tab the reader last chose', () => {
    const first = render(<NotesIndexScreen {...props} />);
    expect(active(first.container)).toMatch(/Notebooks/i);
    fireEvent.click([...first.container.querySelectorAll('.notes-tab')].find((b) => /All notes/i.test(b.textContent)));
    first.unmount();
    const again = render(<NotesIndexScreen {...props} />);
    expect(active(again.container)).toMatch(/All notes/i);
  });
});

/* n116 / n118 / n189: one empty-state pattern. An empty list shows its how-to and no search box; the
   Notebooks tab teaches how a note is made while there are none; every search box has a name. */
describe('NotesIndexScreen empty states and search names', () => {
  it('the Notebooks tab carries the how-to-make-a-note hint while there are no notes', () => {
    window.NoteStore.list = () => [];
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(container.querySelector('.notes-tab.active').textContent).toMatch(/Notebooks/i);
    expect(container.querySelector('.notes-empty-hint').textContent).toMatch(/Long-press text in any chapter, tap Note/);
  });

  it('the Notebooks tab shows no hint once a note exists', () => {
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(container.querySelector('.notes-empty')).toBeNull();
  });

  it('an empty All notes list shows no search box; a full one names its box', () => {
    localStorage.setItem('vot-notes-tab', 'all-notes');
    window.NoteStore.list = () => [];
    const empty = render(<NotesIndexScreen {...props} />);
    expect(empty.container.querySelector('input.notes-index-search')).toBeNull();
    empty.unmount();
    window.NoteStore.list = () => NOTES;
    const full = render(<NotesIndexScreen {...props} />);
    expect(full.getByRole('searchbox', { name: 'Search all notes' })).toBeTruthy();
  });

  it('an empty notebook shows no search box; a full one names its box', () => {
    const { container, getByText, getByRole } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(getByText('Faith'));
    expect(getByRole('searchbox', { name: 'Search notes in this notebook' })).toBeTruthy();
    cleanup();
    window.NoteStore.list = () => [];
    const again = render(<NotesIndexScreen {...props} />);
    fireEvent.click(again.getByText('Faith'));
    expect(again.container.querySelector('input.notes-index-search')).toBeNull();
    void container;
  });
});
