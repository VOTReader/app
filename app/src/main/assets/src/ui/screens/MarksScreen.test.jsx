// @ts-nocheck — free-var globals stubbed per test (bundle-g screen contract)
/* rs3 (overhaul): Library in the new look and Marks & notes, the one list over
   highlights, notes and bookmarks. Fake stores; the real row shapes. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MarksScreen, collectMarksAndNotes } from './MarksScreen.jsx';
import { LibraryRoot, recentLine } from './LibraryRoot.jsx';

const DAY = 86400000;
const NOW = Date.now();
const store = (extra) => ({ subscribe: () => () => {}, getVersion: () => 0, ...extra });
const GLOBALS = ['ScreenLayout', 'LibraryNav', 'AnnotationStore', 'NoteStore', 'NotebookStore', 'BookmarkStore', 'LinkStore', 'JournalStore',
  '_bookmarkSourceLabel', '_bookmarkSourceEndpoint', 'noteSourceLabel', 'noteSourceNav', 'normalizeExcerptDisplay'];

function setup() {
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.LibraryNav = () => null;
  globalThis.AnnotationStore = store({ all: () => ({
    'john-3': [{ id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'For God so loved the world', created: NOW - 2 * DAY }],
    'v1-l15': [{ id: 'a2', groupId: 'g2', kind: 'note', text: 'not a mark', created: NOW }],
  }) });
  globalThis.NoteStore = store({ list: () => [{ groupId: 'n1', body: 'Pray first, then call him.', fullText: 'the humble, penitent man', keys: ['v1-l15'], notebookIds: ['nb1'], created: NOW - DAY }], count: () => 1 });
  globalThis.NotebookStore = store({ get: (id) => (id === 'nb1' ? { id: 'nb1', name: 'Prayer' } : null) });
  globalThis.BookmarkStore = store({ all: () => [{ id: 'b1', hlKey: 'v1-l1', label: 'For the hard years', created: NOW - 3 * DAY }], count: () => 1 });
  globalThis.LinkStore = store({ all: () => [{}, {}] });
  globalThis.JournalStore = store({ count: () => 4 });
  globalThis._bookmarkSourceLabel = (k) => ({ 'john-3': 'John 3', 'v1-l1': 'Volume One · Letter 1' }[k] || k);
  globalThis._bookmarkSourceEndpoint = (k) => ({ key: k });
  globalThis.noteSourceLabel = () => 'Volume One · Letter 15';
  globalThis.noteSourceNav = (n) => ({ key: n.keys[0] });
  globalThis.normalizeExcerptDisplay = (s) => s;   // HighlightsScreen's _collectMarks reads it as a bundle-d global
  window.navHandoff = { _m: new Map(), set(k, v) { this._m.set(k, v); }, take(k) { const v = this._m.has(k) ? this._m.get(k) : null; this._m.delete(k); return v; } };
}
afterEach(() => { cleanup(); GLOBALS.forEach((k) => { delete globalThis[k]; }); delete window.navHandoff; });

const renderMarks = (props = {}) => {
  setup();
  const p = { onBack: vi.fn(), onNavigateToSource: vi.fn(), onOpenHighlights: vi.fn(), onOpenNotes: vi.fn(), onOpenNotebooks: vi.fn(), onOpenBookmarks: vi.fn(), ...props };
  render(<MarksScreen {...p} />);
  return p;
};
const rows = () => [...document.querySelectorAll('.marks-row')];

describe('Marks & notes (rs3)', () => {
  it('collects one row per highlight group, note and bookmark (a note annotation is not a highlight)', () => {
    setup();
    const all = collectMarksAndNotes();
    expect(all.map((r) => r.kind).sort()).toEqual(['bookmark', 'highlight', 'note']);
  });

  it('lists them newest first, and Newest flips to oldest first', () => {
    renderMarks();
    expect(rows().map((r) => r.className.match(/marks-(\w+)$/)[1])).toEqual(['note', 'highlight', 'bookmark']);
    fireEvent.click(screen.getByRole('button', { name: /Newest first/ }));
    expect(rows().map((r) => r.className.match(/marks-(\w+)$/)[1])).toEqual(['bookmark', 'highlight', 'note']);
  });

  it('the chips narrow the list, and a filtered view offers its full screen', () => {
    const p = renderMarks();
    fireEvent.click(screen.getByRole('button', { name: /^Bookmarks/ }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('For the hard years');
    fireEvent.click(screen.getByRole('button', { name: /Bookmarks: all tools/ }));
    expect(p.onOpenBookmarks).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Notebooks' }));
    expect(p.onOpenNotebooks).toHaveBeenCalledTimes(1);
  });

  it('a note row names its place and notebook and opens the note on arrival', () => {
    const p = renderMarks();
    const note = rows().find((r) => r.classList.contains('marks-note'));
    expect(note.textContent).toContain('Volume One · Letter 15');
    expect(note.textContent).toContain('Pray first, then call him.');
    expect(note.textContent).toContain('Note · Prayer');
    fireEvent.click(note);
    expect(p.onNavigateToSource).toHaveBeenCalledWith({ key: 'v1-l15' }, { sourceLetterTitle: 'Marks & notes' });
    expect(window.navHandoff.take('pendingOpenNote')).toBe('n1');
  });

  it('a highlight opens its passage; search narrows across kinds', () => {
    const p = renderMarks();
    fireEvent.click(rows().find((r) => r.classList.contains('marks-highlight')));
    expect(p.onNavigateToSource).toHaveBeenCalledWith({ key: 'john-3' }, { sourceLetterTitle: 'Marks & notes' });
    fireEvent.change(screen.getByLabelText('Search your marks and notes'), { target: { value: 'loved' } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search your marks and notes'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nothing matches "zzz".')).toBeTruthy();
  });
});

describe('Library root (rs3)', () => {
  const renderLib = (props = {}) => {
    setup();
    const p = { onOpenLinks: vi.fn(), onOpenJournal: vi.fn(), onOpenProgress: vi.fn(), onOpenPlans: vi.fn(), onHistory: vi.fn(), onSettings: vi.fn(),
      onOpenMarks: vi.fn(), onOpenSettingsPage: vi.fn(), readingPlanCount: 0, totalReadCount: 212, history: [], ...props };
    render(<LibraryRoot {...p} />);
    return p;
  };
  const rowSub = (title) => within(screen.getByText(title).closest('button')).getByText((_, el) => el.classList.contains('root-row-sub')).textContent;

  it('says what each row holds now', () => {
    renderLib({ history: [{ type: 'letter', letterTitle: 'Christmas', ts: NOW }] });
    expect(rowSub('Marks & notes')).toBe('1 highlight · 1 note · 1 bookmark');
    expect(rowSub('Links')).toBe('2 links');
    expect(rowSub('Journal')).toBe('4 entries');
    expect(rowSub('Recent')).toMatch(/^Christmas · /);
    expect(rowSub('Progress')).toBe('212 chapters and letters read');
    expect(rowSub('Backup & restore')).toBe('Not backed up from this device yet');
  });

  it('the search field opens Marks & notes ready to type; Backup & restore and Help & about open their Settings pages', () => {
    const p = renderLib();
    fireEvent.click(screen.getByText('Search your marks and notes…'));
    expect(p.onOpenMarks).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText('Backup & restore'));
    expect(p.onOpenSettingsPage).toHaveBeenCalledWith('data');
    fireEvent.click(screen.getByText('Help & about'));
    expect(p.onOpenSettingsPage).toHaveBeenCalledWith('help');
  });

  it('recentLine names a chapter, a letter or a study part', () => {
    expect(recentLine([{ type: 'chapter', bookTitle: 'Psalms', chapterNum: 23 }])).toBe('Psalms 23');
    expect(recentLine([{ type: 'study-chapter', chapterTitle: 'The Sower', studyTitle: 'Matthew' }])).toBe('The Sower');
    expect(recentLine([])).toBeNull();
  });
});
