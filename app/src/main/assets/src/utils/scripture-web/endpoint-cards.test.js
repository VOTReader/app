/**
 * Scripture Web — the endpoint cards behind a tapped connection.
 *
 * Tapping a thread opens a sheet with a card per side. Each card is the tap
 * target that jumps into the reader, and the endpoint it carries is what
 * decides the brief highlight on arrival: `verseAnchorFor` (in
 * hooks/use-navigate-to-link.js) flashes verse..verseEnd, so a card must
 * carry the range when there is one and a single verse when there is not.
 *
 * These exercise the real verseAnchorFor, so a change to the highlight
 * contract fails here rather than silently flashing the wrong lines.
 */
import { describe, it, expect } from 'vitest';
import { verseAnchorFor } from '../../hooks/use-navigate-to-link.js';

/** The shapes ScriptureWebScreen builds. Kept in step by the tests below. */
const verseEndpoint = (bookId, chapter, verse, label) => ({
  type: 'bible', key: 'bible:' + bookId + ':' + chapter + ':' + verse,
  bookId, chapter, verse, label,
});
const chapterEndpoint = (bookId, chapter, verses, label) => ({
  type: 'bible', key: 'bible:' + bookId + ':' + chapter + ':1',
  bookId, chapter, verse: 1, verseEnd: verses, label,
});

describe('a single-verse card', () => {
  it('flashes exactly that verse', () => {
    const ep = verseEndpoint('john', 3, 16, 'John 3:16');
    expect(verseAnchorFor(ep)).toEqual({ type: 'verse', verses: [16] });
  });

  it('addresses the reader with a key the navigator understands', () => {
    expect(verseEndpoint('1kings', 18, 26, '1 Kings 18:26').key)
      .toBe('bible:1kings:18:26');
  });
});

describe('a whole-chapter card', () => {
  it('flashes EVERY verse of the chapter, not just the first', () => {
    // Tapping a chapter tick and landing on a single flashed line would read
    // as the wrong thing being highlighted.
    const ep = chapterEndpoint('psalms', 117, 2, 'Psalms 117');
    expect(verseAnchorFor(ep)).toEqual({ type: 'verse', verses: [1, 2] });
  });

  it('covers a long chapter up to the navigator cap', () => {
    const ep = chapterEndpoint('psalms', 119, 176, 'Psalms 119');
    const anchor = verseAnchorFor(ep);
    expect(anchor.verses[0]).toBe(1);
    // use-navigate-to-link caps the flash at 176 verses from the start.
    expect(anchor.verses.length).toBeLessThanOrEqual(176);
    expect(anchor.verses.length).toBeGreaterThan(100);
  });
});

describe('a card for a link the reader made', () => {
  it('flashes the whole range when the link was made over one', () => {
    // The user's stored endpoint is passed through untouched, so a link made
    // across John 3:16-18 highlights all three verses on arrival.
    const stored = {
      type: 'bible', key: 'bible:john:3:16-18', bookId: 'john',
      chapter: 3, verse: 16, verseEnd: 18, label: 'John 3:16-18',
    };
    expect(verseAnchorFor(stored)).toEqual({ type: 'verse', verses: [16, 17, 18] });
  });

  it('still flashes one verse when the link was made on one', () => {
    const stored = {
      type: 'bible', key: 'bible:john:3:16', bookId: 'john',
      chapter: 3, verse: 16, label: 'John 3:16',
    };
    expect(verseAnchorFor(stored)).toEqual({ type: 'verse', verses: [16] });
  });

  it('has no verse anchor for a non-scripture endpoint', () => {
    // A letter endpoint scrolls by hlKey instead; there is no verse to flash.
    expect(verseAnchorFor(/** @type {any} */ (
      { type: 'letter', letterId: 'the-wide-path', key: 'letter:the-wide-path:2' })))
      .toBeNull();
  });
});
