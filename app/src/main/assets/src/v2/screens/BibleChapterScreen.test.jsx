/* v2 Bible chapter (zv1, 5c-search-match): John 3 opened from a search, the match marked in its verse only, Back to
   Search; the next-chapter card; the Bible loaded on first use; a chapter that is not there says so. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { BibleChapterScreen as Screen } from './BibleChapterScreen.jsx';

/** The screen without the shell: the tests pass only the PlaceProps it reads. */
const BibleChapterScreen = /** @type {any} */ (Screen);

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);

const v = (n, text) => ({ n, text });
const JOHN = {
  id: 'john', title: 'John', chapters: [
    { num: 3, sections: [
      { heading: 'Nicodemus and the New Birth', verses: [
        v(1, 'There was a man of the Pharisees named Nicodemus.'),
        v(2, 'This man came to Jesus by night.'),
        v(3, 'Jesus answered, unless one is born again, he cannot see the kingdom of God.'),
        v(7, 'Do not marvel that I said to you, You must be born again.'),
      ] },
    ] },
    { num: 4, sections: [{ heading: '', verses: [v(1, 'When the Lord knew.')] }] },
  ],
};
const ACTS = { id: 'acts', title: 'Acts', chapters: [{ num: 1, sections: [{ verses: [v(1, 'The former account.')] }] }] };

afterEach(() => {
  cleanup();
  for (const k of ['BOOKS', 'BIBLE_BOOK_LIST', '__loadBibleCorpus', 'translateVerse', 'translationLabel', 'loadTranslation']) delete g[k];
  delete html.dataset.gate;
  vi.restoreAllMocks();
});

describe('5c-search-match', () => {
  it('John 3 under "The Scriptures of Truth · NKJV", "born again" marked in verse 3 only; Back says Search', async () => {
    g.BOOKS = { john: JOHN };
    const { container } = render(<V2App gateId="5c-search-match" />);
    expect(container.querySelector('.tb .title').textContent).toBe('Search');
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Search');
    expect(container.querySelector('.reader-head .eyebrow').textContent).toBe('The Scriptures of Truth · NKJV');
    expect(container.querySelector('.reader-head h1').textContent).toBe('John 3');
    expect(texts(container, '.bible .sec-h')).toEqual(['Nicodemus and the New Birth']);
    expect(texts(container, '.bible .v .vn')).toEqual(['1', '2', '3', '7']);
    expect(texts(container, 'mark.qm')).toEqual(['born again']);
    expect(container.querySelector('mark.qm').closest('.v').id).toBe('v-3');
    expect(container.querySelector('#v-3').classList.contains('hit-v')).toBe(true);
    expect(container.querySelector('.nextcard .k').textContent).toBe('Next · Chapter 4');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('the next-chapter card opens John 4 in place, at no verse; the book\'s last chapter leads to the next book', () => {
    g.BOOKS = { john: JOHN, acts: ACTS };
    g.BIBLE_BOOK_LIST = [JOHN, ACTS];
    const { container } = render(<V2App gateId="5c-search-match" />);
    click(container.querySelector('.nextcard'));
    expect(container.querySelector('.reader-head h1').textContent).toBe('John 4');
    expect(container.querySelector('mark.qm')).toBe(null);
    expect(texts(container, '.nextcard .tx > span')).toEqual(['Next book', 'Acts 1']);
    click(container.querySelector('.nextcard'));
    expect(container.querySelector('.reader-head h1').textContent).toBe('Acts 1');
    expect(container.querySelector('.nextcard')).toBe(null);
    expect(container.querySelector('.tb .title').textContent).toBe('Search');
  });

  it('another translation reads through main\'s translateVerse and names itself', () => {
    g.BOOKS = { john: JOHN };
    g.translateVerse = (book, ch, verse, tr) => tr.toUpperCase() + ' ' + verse.text;
    g.translationLabel = (tr) => tr.toUpperCase();
    const onReady = vi.fn();
    const { container } = render(
      <BibleChapterScreen route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={{ translation: 'kjv' }} replace={() => {}} onReady={onReady} />,
    );
    expect(container.querySelector('.eyebrow').textContent).toBe('The Scriptures of Truth · KJV');
    expect(container.querySelector('#v-1').textContent).toBe('1KJV There was a man of the Pharisees named Nicodemus.');
    expect(onReady).toHaveBeenCalled();
  });
});

describe('loading', () => {
  it('loads main\'s Bible on first use, then shows the chapter', async () => {
    g.__loadBibleCorpus = vi.fn(() => { g.BOOKS = { john: JOHN }; return Promise.resolve(); });
    const onReady = vi.fn();
    const { container } = render(
      <BibleChapterScreen route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={{}} replace={() => {}} onReady={onReady} />,
    );
    expect(container.querySelector('h1').textContent).toBe('John 3');
    expect(container.querySelector('.bible')).toBe(null);
    await waitFor(() => expect(container.querySelector('.bible .v')).not.toBe(null));
    expect(g.__loadBibleCorpus).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it('a book or chapter that is not there says the chapter could not be opened', async () => {
    g.BOOKS = { john: JOHN };
    const props = { facts: {}, replace: () => {}, onReady: vi.fn() };
    const a = render(<BibleChapterScreen route={{ place: 'bible-chapter', book: 'nope', chapter: 1 }} {...props} />);
    expect(a.container.querySelector('.empty .t').textContent).toBe('This chapter could not be opened.');
    expect(a.container.querySelector('h1').textContent).toBe('Nope 1');
    expect(a.container.querySelector('.pill.play')).toBe(null);
    const b = render(<BibleChapterScreen route={{ place: 'bible-chapter', book: 'john', chapter: 99 }} {...props} />);
    expect(b.container.querySelector('.empty .t').textContent).toBe('This chapter could not be opened.');
    expect(props.onReady).toHaveBeenCalled();
  });
});
