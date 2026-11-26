// Fix list #9: with a search typed, 'Share all as text' shared only the matching notes.
import { describe, it, expect } from 'vitest';
import { notesShareLabel } from './NotesIndexScreen.jsx';

describe('notes share label', () => {
  it('says all only when nothing filters the list', () => {
    expect(notesShareLabel(false, '')).toBe('Share all as text');
    expect(notesShareLabel(true, '  ')).toBe('Share as text');
  });
  it('says these while a search is typed', () => {
    expect(notesShareLabel(false, 'grace')).toBe('Share these as text');
    expect(notesShareLabel(true, 'grace')).toBe('Share these as text');
  });
});
