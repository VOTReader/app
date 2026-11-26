// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* NotesIndexScreen — the "Share as text" affordances.
   ─────────────────────────────────────────────────────
   A drilled notebook's bar menu offers Share next to Rename/Delete (and on
   Uncategorized, which has no Rename/Delete); the All Notes tab offers
   "Share as Text" in the controls row. Both hand the VISIBLE list to the
   notes-export composer with noteSourceLabel as the resolver and deliver
   via shareNotesExport (mocked here — the composer runs for real so the
   handed-off document is asserted, not stubbed). The screen reads bare
   globals (NoteStore/NotebookStore/ScreenLayout/…), so we stub those. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';

vi.mock('../../utils/notes-export.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), shareNotesExport: vi.fn() };
});
import { shareNotesExport } from '../../utils/notes-export.js';
import { NotesIndexScreen } from './NotesIndexScreen.jsx';
import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';

const NOTES = [
  { groupId: 'g1', keys: ['letter:the-wide-path:0'], color: 'yellow', body: 'thought one', fullText: 'anchor one', created: 1, updated: 2, notebookIds: ['nb1'] },
  { groupId: 'g2', keys: ['bible:genesis:1:1'], color: 'green', body: 'thought two', fullText: 'anchor two', created: 3, updated: 4, notebookIds: ['nb1'] },
];

const GLOBALS = {
  NoteStore: { subscribe: () => () => {}, getVersion: () => 1, list: () => NOTES },
  NotebookStore: {
    subscribe: () => () => {}, getVersion: () => 1,
    list: () => [{ id: 'nb1', name: 'Devotional' }],
    get: (id) => (id === 'nb1' ? { id: 'nb1', name: 'Devotional' } : null),
  },
  ScreenLayout: ({ children, utility }) => <div>{utility && utility.menu}{children}</div>,
  LibraryNav: () => null,
  ConfirmStrip: () => null,
  NoteRow: ({ note }) => <div className="note-row-stub">{note.groupId}</div>,
  noteSourceLabel: (n) => (n.keys && n.keys[0]) || 'Note',
  normalizeExcerptDisplay,   // the search filter reads it (ds5 s21.1 tests type a query)
};

beforeEach(() => { Object.assign(window, GLOBALS); globalThis.ReactDOM = ReactDOM; localStorage.removeItem('vot-notes-tab'); });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.keys(GLOBALS).forEach(k => { delete window[k]; });
});

const renderScreen = () => render(
  <NotesIndexScreen onBack={() => {}} onHome={() => {}} onOpenNote={() => {}} onNavigateToSource={() => {}} theme="dark" onThemeChange={() => {}} onSearch={() => {}} onHistory={() => {}} onSettings={() => {}} historyEnabled={false} />
);

const drillInto = (utils, name) => {
  const row = [...utils.container.querySelectorAll('.ui-row-press')].find(c => c.textContent.includes(name));
  fireEvent.click(row);
};
/** Open the bar's menu and pick a row by its words. */
const fromMenu = (utils, menuName, label) => {
  fireEvent.click(utils.getByRole('button', { name: menuName }));
  const row = [...document.querySelectorAll('.ui-sheet .ui-row-press')].find((r) => r.querySelector('.ui-row-title').textContent === label);
  fireEvent.click(row);
};
const menuLabels = () => [...document.querySelectorAll('.ui-sheet .ui-row-title')].map((t) => t.textContent);

describe('NotesIndexScreen Share as text', () => {
  it('a notebook’s bar menu offers Share as text (with Rename, Colour, Delete) and exports that notebook', () => {
    const utils = renderScreen();
    drillInto(utils, 'Devotional');
    fireEvent.click(utils.getByRole('button', { name: 'Notebook options' }));
    expect(menuLabels()).toEqual(['Share as text', 'Rename', 'Colour', 'Delete notebook']);
    fireEvent.click([...document.querySelectorAll('.ui-sheet .ui-row-press')][0]);
    expect(shareNotesExport).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(shareNotesExport).mock.calls[0][0];
    expect(arg.title).toBe('Devotional');
    expect(arg.filename).toMatch(/^Devotional notes \d{4}-\d{2}-\d{2}\.md$/);
    expect(arg.text).toContain('# Devotional');
    expect(arg.text).toContain('2 notes');
    expect(arg.text).toContain('## letter:the-wide-path:0');
    expect(arg.text).toContain('> “anchor one”');
    expect(arg.text).toContain('thought one');
  });

  it('All notes: the bar menu offers "Share all as text" and exports every note as My Notes', () => {
    const utils = renderScreen();
    fireEvent.click(utils.getByRole('radio', { name: 'All notes' }));
    fromMenu(utils, 'Notes options', 'Share all as text');
    expect(shareNotesExport).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(shareNotesExport).mock.calls[0][0];
    expect(arg.title).toBe('My Notes');
    expect(arg.filename).toMatch(/^My Notes \d{4}-\d{2}-\d{2}\.md$/);
    expect(arg.text).toContain('## bible:genesis:1:1');
  });

  // ds5 s21.1: a search narrows what Share sends to what the reader sees.
  it('All Notes Share sends only the notes a search shows', () => {
    const utils = renderScreen();
    fireEvent.click(utils.getByRole('radio', { name: 'All notes' }));
    fireEvent.change(utils.getByPlaceholderText('Search notes'), { target: { value: 'thought two' } });
    fromMenu(utils, 'Notes options', 'Share these as text');
    const arg = vi.mocked(shareNotesExport).mock.calls[0][0];
    expect(arg.text).toContain('thought two');
    expect(arg.text).not.toContain('thought one');
  });

  it('a drilled notebook Share sends only the notes a search shows', () => {
    const utils = renderScreen();
    drillInto(utils, 'Devotional');
    fireEvent.change(utils.getByPlaceholderText('Search this notebook'), { target: { value: 'thought one' } });
    fromMenu(utils, 'Notebook options', 'Share these as text');
    const arg = vi.mocked(shareNotesExport).mock.calls[0][0];
    expect(arg.text).toContain('thought one');
    expect(arg.text).not.toContain('thought two');
  });

  it('a view with nothing to export has no Share, and no menu at all when the menu would be empty', () => {
    const utils = renderScreen();
    drillInto(utils, 'Not in a notebook');
    expect(utils.queryByRole('button', { name: 'Notebook options' })).toBeNull();
  });
});
