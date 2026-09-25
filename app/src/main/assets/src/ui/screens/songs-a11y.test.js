// @ts-nocheck — reads the song screens' source (node:fs).
/* n3-11 (sweep 2, 09-25): accessibility gaps on the song screens - the Find box
   was a plain text field with no name of its own, the results count changed with
   nothing announced, the focusable lyrics box had no role, the song page's Play
   button said "pressed" while its label already switched Play/Pause, and the
   lyrics follow-along scrolled smoothly even for readers who ask for less motion. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(resolve(here, p), 'utf8');
/** the source line holding `needle` (a JSX tag here sits on one line) */
const line = (s, needle) => s.split(/\r?\n/).find((l) => l.includes(needle)) || '';

describe('song screens: accessibility (n3-11)', () => {
  it('the Find box is a named search field and the count is announced', () => {
    const s = src('AudioSongsScreen.jsx');
    const input = line(s, 'placeholder="Find a song');
    expect(input).toMatch(/type="search"/);
    expect(input).toMatch(/aria-label="Find a song"/);
    expect(s).toMatch(/<span className="songs-section-count" aria-live="polite">/);
  });

  it('the lyrics box is a region and follows along without smooth motion when asked', () => {
    const s = src('../components/SongDeskParts.jsx');
    expect(s).toMatch(/className="song-lyrics-lines"[^>]*role="region"/);
    expect(s).not.toMatch(/behavior: 'smooth'/);
    expect(s).toMatch(/behavior: scrollBehavior\(\)/);
  });

  it('the song page Play button is a command, not a toggle', () => {
    const play = line(src('SongPage.jsx'), 'className="songs-shuffle song-page-play"');
    expect(play).not.toMatch(/aria-pressed/);
  });
});
