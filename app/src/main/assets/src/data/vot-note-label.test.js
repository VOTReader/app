/**
 * votNoteVolLabel — the volume caption shown above a Matthew Study Bible note.
 *
 * The New Testament Study Bible PDF lists its Volumes-of-Truth notes as
 *
 *     10:1   Volume One, Humility and The Word of God, "…"
 *
 * but a handful of entries name NO volume, because the letter they cite is not
 * in any published volume:
 *
 *     10:9   I Have Purged; Behold, I Shall Wipe Away and Restore, "…"
 *     23:32  Woe to Dallas, "…"
 *
 * The importer recorded those faithfully by putting the title in BOTH fields
 * (and `null` in `vol` for the one that points at an album rather than a
 * letter). Rendering `n.vol` raw therefore printed the title twice, or left a
 * dangling em dash on the echo pill. These pin the display contract; the
 * corpus data stays exactly as the PDF has it.
 */
import { describe, it, expect } from 'vitest';
import { votNoteVolLabel } from './vot-note-label.js';

describe('votNoteVolLabel', () => {
  it('returns the volume when the note actually names one', () => {
    expect(votNoteVolLabel({ vol: 'Volume One', letter: 'Humility and The Word of God' }))
      .toBe('Volume One');
    expect(votNoteVolLabel({ vol: "Letters to The Lord's Little Flock", letter: 'Watchmen' }))
      .toBe("Letters to The Lord's Little Flock");
  });

  it('prints NOTHING when the volume is just the letter title again', () => {
    // The real rows: the reader was shown the title twice, once as the volume
    // caption and once as the quoted title.
    for (const title of [
      'I Have Purged; Behold, I Shall Wipe Away and Restore',
      'The Promise',
      'Woe to Dallas',
    ]) {
      expect(votNoteVolLabel({ vol: title, letter: title }), title).toBe('');
    }
  });

  it('ignores whitespace and case when deciding it is a duplicate', () => {
    expect(votNoteVolLabel({ vol: '  The Promise  ', letter: 'The Promise' })).toBe('');
    expect(votNoteVolLabel({ vol: 'THE PROMISE', letter: 'The Promise' })).toBe('');
  });

  it('prints nothing for a null volume rather than a stray separator', () => {
    // ch5's note points at The Blessed as an album; `vol` is deliberately null.
    expect(votNoteVolLabel({
      vol: null,
      letter: 'The Blessed: More Declarations of Blessedness From The Lord, Our God and Savior',
    })).toBe('');
    expect(votNoteVolLabel({ vol: undefined, letter: 'x' })).toBe('');
    expect(votNoteVolLabel({ vol: '   ', letter: 'x' })).toBe('');
  });

  it('survives a malformed note without throwing', () => {
    expect(votNoteVolLabel(null)).toBe('');
    expect(votNoteVolLabel({})).toBe('');
  });
});

describe('votNoteVolLabel — against the real corpus rows', () => {
  it('suppresses the caption on exactly the five volume-less notes', async () => {
    const { readFileSync } = await import('fs');
    const { runInNewContext } = await import('vm');
    const { resolve, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const here = dirname(fileURLToPath(import.meta.url));
    const ctx = {};
    runInNewContext(
      readFileSync(resolve(here, 'matthew.js'), 'utf8'), ctx, { filename: 'matthew.js' });

    const suppressed = [];
    for (const ch of ctx.MATTHEW.chapters || []) {
      const notes = Array.isArray(ch.votNotes) ? ch.votNotes : Object.values(ch.votNotes || {});
      for (const n of notes) {
        if (n && votNoteVolLabel(n) === '') suppressed.push(ch.num + ' ' + n.ref);
      }
    }
    // The PDF's volume-less rows, and only these. A sixth appearing here means
    // a new note landed with the vol field unfilled — worth a look, not a pass.
    expect(suppressed).toEqual([
      '5 5:1-11',
      '10 10:9',
      '10 10:19',
      '23 23:32, 36',
      '26 26:28',
    ]);
  });

  it('leaves every other note captioned by its real volume', () => {
    // Guards the inverse: the helper must not silently blank ordinary notes.
    expect(votNoteVolLabel({ vol: 'Volume Three', letter: 'Keep the Passover' }))
      .toBe('Volume Three');
  });
});
