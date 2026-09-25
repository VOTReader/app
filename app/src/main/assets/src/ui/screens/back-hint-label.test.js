// @ts-nocheck — reads the four views' source (node:fs).
/* n6-07 (sweep 2, 09-25): the "Back to <place>" pill on a tap-through named
   itself "Back to source" (or "Back to source letter") to a screen reader, while
   the screen shows where it goes. Four reading views draw the same pill; each
   must name the place it shows. BibleStudyIndex / JournalViewer / NotesIndex
   already did ('Back to ' + title). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const VIEWS = ['BibleChapterView.jsx', 'ChapterView.jsx', 'LetterView.jsx', 'WtlbEntryView.jsx'];

describe('the Back-to pill names its place (n6-07)', () => {
  for (const f of VIEWS) {
    it(f, () => {
      const src = readFileSync(resolve(here, f), 'utf8');
      const pills = src.match(/<button className="back-hint-pill"[^>]*>/g) || [];
      expect(pills.length, 'one pill').toBe(1);
      expect(pills[0]).not.toMatch(/aria-label="Back to source/);
      expect(pills[0]).toMatch(/aria-label=\{'Back to ' \+ .*backHint\.title\}/);
    });
  }
});
