/* NotesIndexScreen — the "Share as text" affordances.
   ─────────────────────────────────────────────────────
   A drilled notebook's header offers Share next to Rename/Delete (and on
   Uncategorized, which has no Rename/Delete); the All Notes tab offers
   "Share as Text" in the controls row. Both hand the VISIBLE list to the
   notes-export composer with noteSourceLabel as the resolver and deliver
   via shareNotesExport (mocked here — the composer runs for real so the
   handed-off document is asserted, not stubbed). The screen reads bare
   globals (NoteStore/NotebookStore/ScreenLayout/…), so we stub those. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../../utils/notes-export.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), shareNotesExport: vi.fn() };
});
import { shareNotesExport } from '../../utils/notes-export.js';
import { NotesIndexScreen } from './NotesIndexScreen.jsx';

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
  ScreenLayout: ({ children }) => <div>{children}</div>,
  LibraryNav: () => null,
  ConfirmStrip: () => null,
  NoteRow: ({ note }) => <div className="note-row-stub">{note.groupId}</div>,
  noteSourceLabel: (n) => (n.keys && n.keys[0]) || 'Note',
};

beforeEach(() => { Object.assign(window, GLOBALS); });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.keys(GLOBALS).forEach(k => { delete window[k]; });
});

const renderScreen = () => render(
  <NotesIndexScreen onBack={() => {}} onHome={() => {}} onOpenNote={() => {}} onNavigateToSource={() => {}} theme="dark" onThemeChange={() => {}} onSearch={() => {}} onHistory={() => {}} onSettings={() => {}} historyEnabled={false} />
);

const drillInto = (utils, name) => {
  const card = [...utils.container.querySelectorAll('.nb-card')].find(c => c.textContent.includes(name));
  fireEvent.click(card);
};

describe('NotesIndexScreen Share as text', () => {
  it('drilled notebook header offers Share (alongside Rename/Delete) and exports that notebook', () => {
    const utils = renderScreen();
    drillInto(utils, 'Devotional');
    expect(utils.getByTitle('Rename notebook')).toBeTruthy();
    expect(utils.getByTitle('Delete notebook')).toBeTruthy();
    fireEvent.click(utils.getByTitle('Share notebook as text'));
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

  it('All Notes tab offers "Share as Text" and exports every note as My Notes', () => {
    const utils = renderScreen();
    fireEvent.click(utils.getByText('All Notes'));
    fireEvent.click(utils.getByTitle('Share all notes as text'));
    expect(shareNotesExport).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(shareNotesExport).mock.calls[0][0];
    expect(arg.title).toBe('My Notes');
    expect(arg.filename).toMatch(/^My Notes \d{4}-\d{2}-\d{2}\.md$/);
    expect(arg.text).toContain('## bible:genesis:1:1');
  });

  it('hides Share in a drilled view with no notes (nothing to export)', () => {
    const utils = renderScreen();
    drillInto(utils, 'Uncategorized');
    expect(utils.queryByTitle('Share notebook as text')).toBeNull();
  });
});
