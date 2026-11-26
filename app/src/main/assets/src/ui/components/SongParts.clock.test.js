/* Fix list 46: a song missing its length in the catalog showed 'Collection · 0:00' in its menu (and '0:00' in the
   Versions sheet and song lists). A length that is not there prints nothing. */
import { describe, it, expect } from 'vitest';
import { songClock } from './SongParts.jsx';

describe('songClock', () => {
  it('prints a length as the pictures do', () => {
    expect(songClock(125)).toBe('2:05');
    expect(songClock(3725)).toBe('1:02:05');
  });

  it('prints nothing for a missing or zero length, never 0:00', () => {
    expect(songClock(undefined)).toBe('');
    expect(songClock(null)).toBe('');
    expect(songClock(0)).toBe('');
    expect(songClock('x')).toBe('');
  });
});
