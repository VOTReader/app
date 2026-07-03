/* NoteRow — notebook-chip suppression inside a drilled notebook.
   ─────────────────────────────────────────────────────────────────
   Inside a drilled notebook every row belongs to that notebook, so its own
   chip is pure noise; NotesIndexScreen passes hideNotebookId to suppress
   exactly that one while chips for the note's OTHER notebooks still show.
   NoteRow reads bare globals (noteSourceLabel/relativeDate/NotebookStore),
   so we stub them. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { NoteRow } from './NoteRow.jsx';

const NBS = {
  nb1: { id: 'nb1', name: 'Strength' },
  nb2: { id: 'nb2', name: 'Devotional' },
};

function setupGlobals() {
  window.noteSourceLabel = () => 'Psalms 144:2';
  window.relativeDate = () => '1w ago';
  window.NotebookStore = { get: (id) => NBS[id] || null };
}

afterEach(() => {
  cleanup();
  delete window.noteSourceLabel;
  delete window.relativeDate;
  delete window.NotebookStore;
});

const note = {
  groupId: 'g1', color: 'yellow', body: 'a thought', fullText: 'anchor text',
  created: 1, updated: 2, notebookIds: ['nb1', 'nb2'],
};

describe('NoteRow notebook chips', () => {
  it('shows every notebook chip by default', () => {
    setupGlobals();
    const { container } = render(<NoteRow note={note} onTap={() => {}} />);
    const chips = [...container.querySelectorAll('.note-row-nb')].map(c => c.textContent);
    expect(chips).toEqual(['Strength', 'Devotional']);
  });

  it('hides ONLY the drilled notebook chip when hideNotebookId is passed', () => {
    setupGlobals();
    const { container } = render(<NoteRow note={note} onTap={() => {}} hideNotebookId="nb1" />);
    const chips = [...container.querySelectorAll('.note-row-nb')].map(c => c.textContent);
    expect(chips).toEqual(['Devotional']);
  });

  it('renders no chip strip at all when the drilled notebook was the only one', () => {
    setupGlobals();
    const solo = { ...note, notebookIds: ['nb1'] };
    const { container } = render(<NoteRow note={solo} onTap={() => {}} hideNotebookId="nb1" />);
    expect(container.querySelector('.note-row-tags')).toBeNull();
  });
});
