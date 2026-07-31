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
import { render, cleanup, fireEvent } from '@testing-library/react';
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
  window.NoteRow = NoteRow;
}

const GLOBALS = ['noteSourceLabel', 'noteSourceSegments', 'relativeDate', 'NoteStore', 'NotebookStore', 'ScreenLayout', 'LibraryNav', 'NoteRow'];

beforeEach(setupGlobals);
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
});

describe('NotesIndexScreen drilled header', () => {
  it('shows the "My Notes" index header at the top level', () => {
    const { container } = render(<NotesIndexScreen {...props} />);
    expect(container.querySelector('.notes-index-title').textContent).toBe('My Notes');
    expect(container.querySelector('.nb-drilled-title')).toBeNull();
  });

  it('replaces it with the notebook name as the drilled title (no stacked headers)', () => {
    const { container, getByText } = render(<NotesIndexScreen {...props} />);
    fireEvent.click(getByText('Faith'));
    expect(container.querySelector('.nb-drilled-title').textContent).toBe('Faith');
    expect(container.querySelector('.notes-index-title')).toBeNull();
  });

  it('counts the drilled notebook’s notes, not the whole index', () => {
    const { container, getByText } = render(<NotesIndexScreen {...props} />);
    // 3 notes total, 2 of them in Faith (g1 + g3).
    expect(container.querySelector('.notes-index-count').textContent).toBe('3 notes');
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
