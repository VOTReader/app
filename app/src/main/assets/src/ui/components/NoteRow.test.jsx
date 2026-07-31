/* NoteRow — notebook-chip suppression inside a drilled notebook.
   ─────────────────────────────────────────────────────────────────
   Inside a drilled notebook every row belongs to that notebook, so its own
   chip is pure noise; NotesIndexScreen passes hideNotebookId to suppress
   exactly that one while chips for the note's OTHER notebooks still show.
   NoteRow reads bare globals (noteSourceLabel/relativeDate/NotebookStore),
   so we stub them. */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { NoteRow } from './NoteRow.jsx';
import { noteSourceSegments } from '../../utils/note-source.js';

const NBS = {
  nb1: { id: 'nb1', name: 'Strength' },
  nb2: { id: 'nb2', name: 'Devotional' },
};

function setupGlobals() {
  window.noteSourceLabel = () => 'Psalms 144:2';
  // The REAL segmenter — the row's tap targets must match what the notes
  // index actually resolves, not a hand-rolled shape.
  window.noteSourceSegments = noteSourceSegments;
  window.relativeDate = () => '1w ago';
  window.NotebookStore = { get: (id) => NBS[id] || null };
}

afterEach(() => {
  cleanup();
  delete window.noteSourceLabel;
  delete window.noteSourceSegments;
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

/* Per-segment tap-through on the source line.
   ────────────────────────────────────────────
   The source line used to be one inert string over a row that always navigated
   to keys[0], so on "John 3:16 · John 4:1-2" the second passage was dead text.
   Each chapter-group is now its own tap target with its own endpoint — and it
   must NOT also fire the row tap (the row wrapper is role=button). */
describe('NoteRow source segments', () => {
  const multi = {
    ...note,
    keys: ['bible:john:3:16', 'bible:john:4:1', 'bible:john:4:2'],
    notebookIds: [],
  };

  it('renders one tappable element per chapter-group, joined by the same " · "', () => {
    setupGlobals();
    const { container } = render(<NoteRow note={multi} onTap={() => {}} onTapSegment={() => {}} />);
    const segs = [...container.querySelectorAll('.note-row-source-seg')];
    expect(segs.map(s => s.textContent)).toEqual(['John 3:16', 'John 4:1-2']);
    expect(container.querySelector('.note-row-source').textContent).toBe('John 3:16 · John 4:1-2');
  });

  it('a segment tap fires onTapSegment with THAT segment\'s endpoint — and not the row tap', () => {
    setupGlobals();
    const onTap = vi.fn();
    const onTapSegment = vi.fn();
    const { container } = render(<NoteRow note={multi} onTap={onTap} onTapSegment={onTapSegment} />);
    const segs = [...container.querySelectorAll('.note-row-source-seg')];

    segs[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onTapSegment).toHaveBeenCalledTimes(1);
    expect(onTapSegment).toHaveBeenCalledWith(multi, {
      type: 'bible', key: 'bible:john:4:1', bookId: 'john', chapter: 4, verse: 1, verseEnd: 2,
    });
    expect(onTap).not.toHaveBeenCalled();   // stopPropagation — no double-nav

    segs[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onTapSegment).toHaveBeenLastCalledWith(multi, {
      type: 'bible', key: 'bible:john:3:16', bookId: 'john', chapter: 3, verse: 16,
    });
    expect(onTap).not.toHaveBeenCalled();
  });

  it('the row itself still opens the whole note (behavior unchanged)', () => {
    setupGlobals();
    const onTap = vi.fn();
    const onTapSegment = vi.fn();
    const { container } = render(<NoteRow note={multi} onTap={onTap} onTapSegment={onTapSegment} />);
    container.querySelector('.note-row').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onTap).toHaveBeenCalledWith(multi);
    expect(onTapSegment).not.toHaveBeenCalled();
  });

  it('falls back to the flat inert label when no onTapSegment is wired', () => {
    setupGlobals();
    const { container } = render(<NoteRow note={multi} onTap={() => {}} />);
    expect(container.querySelector('.note-row-source-seg')).toBeNull();
    expect(container.querySelector('.note-row-source').textContent).toBe('Psalms 144:2');
  });
});
