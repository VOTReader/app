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

// Track D: the four now draw one shared pill (ui/components/BackHintPill.jsx), which names
// the place it shows; BackHintPill.test.jsx renders it. Here: each view hands it its own hint.
describe('the Back-to pill names its place (n6-07)', () => {
  for (const f of VIEWS) {
    it(f, () => {
      const src = readFileSync(resolve(here, f), 'utf8');
      const pills = src.match(/<BackHintPill [^>]*>/g) || [];
      expect(pills.length, 'one pill').toBe(1);
      expect(pills[0]).toMatch(/backHint=\{backHint\}/);
      expect(src, 'no copy of the pill markup').not.toMatch(/className="back-hint-pill"/);
    });
  }
  it('the shared pill names the place it shows, never "source"', () => {
    const src = readFileSync(resolve(here, '../components/BackHintPill.jsx'), 'utf8');
    expect(src).not.toMatch(/Back to source/);
    expect(src).toMatch(/aria-label=\{'Back to ' \+ place\}/);
  });
});
