// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* NotesIndexScreen — full-text search over the Notes index.
   ──────────────────────────────────────────────────────────
   filterNotesByQuery matches a note's body, its anchor excerpt (fullText,
   display-normalized like NoteRow renders it), and its source label — the
   same surface the Bookmarks/Links/Highlights indexes already filter on.
   The screen renders the shared search pill (ListSearch, an input type=search)
   on the All Notes tab AND inside a drilled notebook; a query with zero hits shows the
   "No Matches" empty state. NotesIndexScreen reads bare globals
   (NoteStore/NotebookStore/ScreenLayout/LibraryNav/NoteRow/noteSourceLabel),
   so we stub them; NoteRow is the REAL component. */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { NotesIndexScreen, filterNotesByQuery } from './NotesIndexScreen.jsx';
import { NoteRow } from '../components/NoteRow.jsx';
import { noteSourceSegments } from '../../utils/note-source.js';
import { _resetToasts } from '../../utils/toast.js';

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
  globalThis.ReactDOM = ReactDOM;   // the sheets portal to <body>
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
  // The utility bar's title and menu, as the real bar draws them (title text, the menu button).
  window.ScreenLayout = ({ children, utility }) => (
    <div><h1 className="t-bar-title">{utility && utility.title}</h1>{utility && utility.menu}{children}</div>
  );
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
      expect(container.querySelector('.t-bar-title').textContent).toBe('Faith');
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

/* The UI pass (mock v2 library.html l-notes ... l-notebook): the title is the bar's, All notes | Notebooks is one
   segmented control, every list has a search pill and the line "N notes · Newest first", a note's menu holds
   Open, Edit, Move to a notebook, Share and Delete, and the bar's menu holds the rare things. */
const seg = (c, name) => [...c.querySelectorAll('.ui-seg-item')].find((b) => b.textContent === name);
const chosen = (c) => c.querySelector('.ui-seg-item[aria-checked="true"]').textContent;
const rowNamed = (c, name) => [...c.querySelectorAll('.ui-row-main, .ui-row-press')].find((b) => b.querySelector('.ui-row-title').textContent === name);

describe('NotesIndexScreen bar and notebooks', () => {
  it('titles the bar Notes at the top, and the notebook inside one', () => {
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(container.querySelector('.t-bar-title').textContent).toBe('Notes');
    fireEvent.click(rowNamed(container, 'Faith'));
    expect(container.querySelector('.t-bar-title').textContent).toBe('Faith');
    expect(container.querySelector('.ui-seg')).toBeNull();
  });

  it('counts the notebook’s notes, not the whole index', () => {
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(rowNamed(container, 'Faith').querySelector('.ui-row-value').textContent).toBe('2 notes');
    expect(rowNamed(container, 'Not in a notebook').querySelector('.ui-row-value').textContent).toBe('1 note');
    fireEvent.click(rowNamed(container, 'Faith'));
    expect(container.querySelector('.lib-qline-count').textContent).toBe('2 notes');
  });

  it('calls the unfiled notes "Not in a notebook", with the line on how to file them', () => {
    const { container, getByText } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(rowNamed(container, 'Not in a notebook'));
    expect(container.querySelector('.t-bar-title').textContent).toBe('Not in a notebook');
    expect(getByText(/Notes you have not filed stay here/)).toBeTruthy();
  });

  it('New notebook: a name and a colour in one sheet, Create disabled until named', () => {
    const add = vi.fn(() => ({ id: 'nb2', name: 'Hope' }));
    const setColor = vi.fn();
    window.NotebookStore = { ...window.NotebookStore, add, setColor };
    window.HL_COLORS = ['yellow', 'green'];
    const { container, getByRole } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(getByRole('button', { name: 'New notebook' }));
    const create = getByRole('button', { name: 'Create' });
    expect(create.disabled).toBe(true);
    fireEvent.change(getByRole('textbox', { name: 'Notebook name' }), { target: { value: 'Hope' } });
    fireEvent.click(getByRole('radio', { name: 'Green' }));
    fireEvent.click(getByRole('button', { name: 'Create' }));
    expect(add).toHaveBeenCalledWith('Hope');
    expect(setColor).toHaveBeenCalledWith('nb2', 'green');
    expect(container.querySelector('.ui-sheet')).toBeNull();
    delete window.HL_COLORS;
  });

  it('the notebook menu renames, and a taken name keeps the sheet open and says so', () => {
    const rename = vi.fn(() => false);
    window.NotebookStore = { ...window.NotebookStore, rename };
    const { container, getByRole, getByText } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(rowNamed(container, 'Faith'));
    fireEvent.click(getByRole('button', { name: 'Notebook options' }));
    fireEvent.click(rowNamed(document.body, 'Rename'));
    fireEvent.change(getByRole('textbox', { name: 'Notebook name' }), { target: { value: 'Hope' } });
    fireEvent.click(getByRole('button', { name: 'Save' }));
    expect(rename).toHaveBeenCalledWith('nb1', 'Hope');
    expect(getByText('Another notebook is already called Hope.')).toBeTruthy();
  });
});

describe('NotesIndexScreen search box', () => {
  it('filters All notes live and says when nothing matches', () => {
    localStorage.setItem('vot-notes-tab', 'all-notes');
    const { container, getByRole } = render(<NotesIndexScreen {...props} />);
    const input = getByRole('searchbox', { name: 'Search notes' });
    expect(container.querySelectorAll('.note-row').length).toBe(3);
    fireEvent.change(input, { target: { value: 'covenant' } });
    expect(container.querySelectorAll('.note-row').length).toBe(2);
    expect(container.querySelector('.lib-qline-count').textContent).toBe('2 of 3 notes');
    fireEvent.change(input, { target: { value: 'grafted in' } });
    expect(container.querySelectorAll('.note-row').length).toBe(1);
    fireEvent.change(input, { target: { value: 'zzqxjv' } });
    expect(container.querySelectorAll('.note-row').length).toBe(0);
    expect(container.querySelector('.lib-none').textContent).toBe('No notes match “zzqxjv”.');
    fireEvent.change(input, { target: { value: '' } });
    expect(container.querySelectorAll('.note-row').length).toBe(3);
  });

  it('filters a drilled notebook view too', () => {
    const { container, getByRole } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(rowNamed(container, 'Faith'));
    const input = getByRole('searchbox', { name: 'Search this notebook' });
    expect(container.querySelectorAll('.note-row').length).toBe(2);
    fireEvent.change(input, { target: { value: 'covenant' } });
    expect(container.querySelectorAll('.note-row').length).toBe(1);
  });

  it('an empty notebook shows no search box and says how it fills, with a way to All notes', () => {
    window.NoteStore.list = () => [];
    window.NotebookStore = { ...window.NotebookStore, list: () => NBS };
    const { container, getByRole } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(rowNamed(container, 'Faith'));
    expect(container.querySelector('input[type="search"]')).toBeNull();
    expect(container.querySelector('.ui-empty-title').textContent).toBe('Nothing here yet');
    fireEvent.click(getByRole('button', { name: 'All notes' }));
    expect(container.querySelector('.t-bar-title').textContent).toBe('Notes');
    expect(chosen(container)).toBe('All notes');
  });

  it('sorts oldest first from the sort sheet', () => {
    localStorage.setItem('vot-notes-tab', 'all-notes');
    const { container, getByRole } = render(<NotesIndexScreen {...props} />);
    expect(container.querySelector('.note-row .note-row-preview').textContent).toBe('The covenant of peace');
    fireEvent.click(getByRole('button', { name: 'Sort: Newest first' }));
    fireEvent.click(getByRole('radio', { name: 'Oldest first' }));
    expect(container.querySelector('.note-row .note-row-preview').textContent).toBe('Unrelated musing');
    expect(getByRole('button', { name: 'Sort: Oldest first' })).toBeTruthy();
  });
});

describe('NotesIndexScreen — a note’s menu', () => {
  afterEach(() => { delete window.noteSourceNav; delete window.AnnotationStore; });

  it('holds Open, Edit note, Move to a notebook (naming its notebook), Share and Delete note', () => {
    window.noteSourceNav = () => ({ type: 'letter', letterId: 'grafted-in' });
    localStorage.setItem('vot-notes-tab', 'all-notes');
    const onEditNote = vi.fn(), onMoveNote = vi.fn(), onNavigateToSource = vi.fn();
    window.navHandoff = { peek: () => null, set: () => {}, clear: () => {} };
    const { getAllByRole } = render(<NotesIndexScreen {...props} onEditNote={onEditNote} onMoveNote={onMoveNote} onNavigateToSource={onNavigateToSource} />);
    fireEvent.click(getAllByRole('button', { name: 'Note options' })[0]);
    const labels = [...document.querySelectorAll('.ui-sheet .ui-row-title')].map((t) => t.textContent);
    expect(labels).toEqual(['Open in the letter', 'Edit note', 'Move to a notebook', 'Share', 'Delete note']);
    expect(rowNamed(document.body, 'Move to a notebook').querySelector('.ui-row-value').textContent).toBe('Faith');
    fireEvent.click(rowNamed(document.body, 'Edit note'));
    expect(onEditNote).toHaveBeenCalledWith('g1');
    fireEvent.click(getAllByRole('button', { name: 'Note options' })[1]);
    expect(rowNamed(document.body, 'Move to a notebook').querySelector('.ui-row-value').textContent).toBe('Not in one');
    fireEvent.click(rowNamed(document.body, 'Move to a notebook'));
    expect(onMoveNote).toHaveBeenCalledWith('g2');
    delete window.navHandoff;
  });

  it('Delete note asks first, then removes the note and its mark', () => {
    localStorage.setItem('vot-notes-tab', 'all-notes');
    const remove = vi.fn(), removeGroup = vi.fn();
    window.NoteStore.remove = remove;
    window.AnnotationStore = { removeGroup, getByGroup: () => [] };
    const { getAllByRole, getByRole } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(getAllByRole('button', { name: 'Note options' })[0]);
    fireEvent.click(rowNamed(document.body, 'Delete note'));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: 'Delete' }));
    expect(removeGroup).toHaveBeenCalledWith('g1');
    expect(remove).toHaveBeenCalledWith('g1');
  });

  /* PL-SEARCH 5: the reader's own Remove offers Undo (AnnotationActionChip); this delete lost the note and its
     mark for good on one mistaken confirm. Undo puts back the very records the stores held. */
  it('Delete note offers Undo, which puts the mark and the note back as they were', () => {
    localStorage.setItem('vot-notes-tab', 'all-notes');
    // a highlight segment and its note record, shaped as main writes them
    const seg = { key: 'bible:genesis:1:1', ann: { kind: 'highlight', color: 'yellow', groupId: 'g1', start: 0, end: 14, text: 'my anchor text', created: 1 } };
    const rec = { body: 'The covenant of peace', created: 1, updated: 6, notebookIds: ['nb1'] };
    const marks = new Map([['g1', [seg]]]);
    const notes = new Map([['g1', rec]]);
    const add = vi.fn(), set = vi.fn();
    window.AnnotationStore = { getByGroup: (g) => marks.get(g) || [], removeGroup: (g) => marks.delete(g), add };
    window.NoteStore.get = (g) => notes.get(g) || null;
    window.NoteStore.remove = (g) => notes.delete(g);
    window.NoteStore.set = set;
    try {
      const { getAllByRole, getByRole } = render(<NotesIndexScreen {...props} />);
      fireEvent.click(getAllByRole('button', { name: 'Note options' })[0]);
      fireEvent.click(rowNamed(document.body, 'Delete note'));
      fireEvent.click(getByRole('button', { name: 'Delete' }));
      expect(marks.has('g1')).toBe(false);
      expect(notes.has('g1')).toBe(false);
      const toast = document.getElementById('vot-toast-mark-removed');
      expect(toast.textContent).toMatch(/^Note deleted/);
      fireEvent.click(toast.querySelector('.vot-undo-btn'));
      expect(add).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledWith('bible:genesis:1:1', seg.ann);
      expect(set).toHaveBeenCalledWith('g1', rec);
    } finally { _resetToasts(); }
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
    const { container, getByRole } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(seg(container, 'All notes'));
    const input = getByRole('searchbox', { name: 'Search notes' });
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

/* U03.8/U08.4: Notes opened on Notebooks, a lone row, a tap away from every note. */
describe('NotesIndexScreen opening tab', () => {
  it('opens on All notes while the reader has no notebook of their own', () => {
    window.NotebookStore = { ...window.NotebookStore, list: () => [] };
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(chosen(container)).toBe('All notes');
  });

  it('opens on Notebooks when there are notebooks, then on whichever tab the reader last chose', () => {
    const first = render(<NotesIndexScreen {...props} />);
    expect(chosen(first.container)).toBe('Notebooks');
    fireEvent.click(seg(first.container, 'All notes'));
    first.unmount();
    const again = render(<NotesIndexScreen {...props} />);
    expect(chosen(again.container)).toBe('All notes');
  });
});

/* Rule 15: an empty list says how it fills, with one button that goes there; no search box over nothing. */
describe('NotesIndexScreen empty states', () => {
  it('no notes and no notebooks: one empty state with Start reading, on either tab', () => {
    window.NoteStore.list = () => [];
    window.NotebookStore = { ...window.NotebookStore, list: () => [] };
    const onStartReading = vi.fn();
    const { container, getByRole } = render(<NotesIndexScreen {...props} onStartReading={onStartReading} />);
    expect(container.querySelector('.ui-empty-title').textContent).toBe('No notes yet');
    expect(container.querySelector('.ui-empty-text').textContent).toBe('Select some words while you read and tap Note. Every note you write collects here.');
    expect(container.querySelector('input[type="search"]')).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Start reading' }));
    expect(onStartReading).toHaveBeenCalledTimes(1);
    fireEvent.click(seg(container, 'Notebooks'));
    expect(container.querySelector('.ui-empty-title').textContent).toBe('No notes yet');
  });

  it('a full list shows no empty state', () => {
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(container.querySelector('.ui-empty')).toBeNull();
  });
});
