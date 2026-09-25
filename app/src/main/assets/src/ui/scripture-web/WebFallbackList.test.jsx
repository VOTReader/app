// @ts-nocheck - a small hand-made graph (the shape decode.js produces)
/* n6-05 (sweep 2, 09-25): the list fallback opened on the newest chapter in
   History. Following a connection reads a verse, which History records, so
   coming back (or pressing Try again, which remounts it) dropped the reader's
   place for the chapter they had just visited. The list now keeps its own place. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { WebFallbackList } from './WebFallbackList.jsx';

const graph = () => ({
  total: 30, count: 0, from: new Uint16Array(0), to: new Uint16Array(0), votes: new Int16Array(0),
  buckets: [{ off: 0, len: 0, off20: 0, off10: 0, segments: 8, chunks: [] }],
  books: [{ id: 'genesis', title: 'Genesis', abbr: 'Gen', start: 0 }],
  chapters: [[0, 1, 0, 10], [0, 2, 10, 10], [0, 3, 20, 10]],
  chapterOfVerse: new Uint16Array(30), densityTiers: [20, 7], votEdges: [], prophecy: [], votLinks: [],
});
const noop = () => {};
const list = (g, initialChapter) => render(<WebFallbackList graph={g} initialChapter={initialChapter}
  onOpen={noop} onRetry={noop} onBack={noop} verseText={() => ''} />);

afterEach(cleanup);

describe('WebFallbackList keeps its place (n6-05)', () => {
  it('opens where the reader left it, not on the chapter History saw last', () => {
    const g = graph();
    const first = list(g, 0);
    expect(first.container.querySelector('.sw-fallback-list').getAttribute('data-chapter')).toBe('Genesis 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));   // the screen remounts the list
    first.unmount();
    const again = list(g, 1);   // History's newest chapter: the one a followed connection visited
    expect(again.container.querySelector('.sw-fallback-list').getAttribute('data-chapter')).toBe('Genesis 3');
    again.unmount();
    // any other way in opens on History's chapter, as before
    expect(list(g, 1).container.querySelector('.sw-fallback-list').getAttribute('data-chapter')).toBe('Genesis 2');
  });
});
