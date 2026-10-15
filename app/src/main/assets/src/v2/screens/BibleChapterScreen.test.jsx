/* v2 Bible chapter (zv1, 5c-search-match): John 3 opened from a search, the match marked in its verse only, Back to
   Search; the next-chapter card; the Bible loaded on first use; a chapter that is not there says so. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { BibleChapterScreen as Screen } from './BibleChapterScreen.jsx';
import { applyDOMHighlights } from '../../renderer/annotation-engine.jsx';

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
/** main's Bible audio manifest with John in its default edition (brm-kjv): chapterAudio('john') finds a recording. */
const JOHN_AUDIO = { 'bible-brm-kjv:john': [['a', '', 'Chapter 3']] };
const ACTS = { id: 'acts', title: 'Acts', chapters: [{ num: 1, sections: [{ verses: [v(1, 'The former account.')] }] }] };

afterEach(() => {
  cleanup();
  for (const k of ['BOOKS', 'BIBLE_BOOK_LIST', '__loadBibleCorpus', 'translateVerse', 'translationLabel', 'loadTranslation', 'ReadAlongHighlight', 'AudioPlayer', 'BIBLE_AUDIO_MANIFEST',
    'AnnotationStore', 'applyDOMHighlights']) delete g[k];
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

/** main's AnnotationStore as far as its painter and useMainMarks read it (get + version), holding `data`. */
function fakeAnnotations(/** @type {Record<string, any[]>} */ data) {
  const ls = new Set();
  let ver = 0;
  return {
    get: (k) => data[k] || [],
    add: (k, a) => { (data[k] = data[k] || []).push(a); ver += 1; ls.forEach((cb) => cb()); },
    subscribe: (cb) => { ls.add(cb); return () => ls.delete(cb); },
    getVersion: () => ver,
  };
}
const hl = (id, start, end, text) => ({ id, groupId: id, kind: 'highlight', start, end, color: 'yellow', text, created: 1 });

describe("main's marks on a chapter (v2g11 gap d)", () => {
  it("a verse main's reader highlighted shows it on the verse's words, by main's painter; the number stays out of it", async () => {
    g.BOOKS = { john: JOHN };
    // main anchors a verse's marks to its words alone (BibleChapterView's HighlightableText): offsets count from 'D'
    g.AnnotationStore = fakeAnnotations({ 'bible:john:3:7': [hl('h7', 0, 13, 'Do not marvel')] });
    g.applyDOMHighlights = vi.fn(applyDOMHighlights);
    const { container } = render(
      <BibleChapterScreen route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={{}} replace={() => {}} onReady={() => {}} />,
    );
    await waitFor(() => expect(texts(container, 'mark.hl-dom')).toEqual(['Do not marvel']));
    expect(container.querySelector('mark.hl-dom').closest('.v').id).toBe('v-7');
    expect(container.querySelector('#v-7 .vn').textContent).toBe('7');
    // one made later (in either app) shows at once
    act(() => { g.AnnotationStore.add('bible:john:3:2', hl('h2', 5, 8, 'man')); });
    await waitFor(() => expect(texts(container, 'mark.hl-dom')).toEqual(['man', 'Do not marvel']));
  });

  it('a gate boot never paints (the picture is the gate)', () => {
    g.BOOKS = { john: JOHN };
    g.AnnotationStore = fakeAnnotations({ 'bible:john:3:7': [hl('h7', 0, 13, 'Do not marvel')] });
    g.applyDOMHighlights = vi.fn(applyDOMHighlights);
    const { container } = render(
      <BibleChapterScreen route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={{}} gate={{}} replace={() => {}} onReady={() => {}} />,
    );
    expect(g.applyDOMHighlights).not.toHaveBeenCalled();
    expect(container.querySelector('mark.hl-dom')).toBe(null);
  });
});

describe('2c-john3-playing', () => {
  it('each verse carries main\'s verse key beside its read segment, so the read-along and read marks key it as main does', () => {
    g.BOOKS = { john: JOHN };
    const { container } = render(
      <BibleChapterScreen route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={{}} replace={() => {}} onReady={() => {}} />,
    );
    const v7 = container.querySelector('#v-7');
    expect(v7.getAttribute('data-hl-key')).toBe('bible:john:3:7');
    expect(v7.getAttribute('data-read-seg')).toBe('v7');
    expect([...container.querySelectorAll('.bible .v')].map((n) => n.getAttribute('data-hl-key')))
      .toEqual(['bible:john:3:1', 'bible:john:3:2', 'bible:john:3:3', 'bible:john:3:7']);
    // the read-along finds a verse by its key and lights it whole, number in (2c's picture): the first element keyed so
    expect(container.querySelector('[data-hl-key="bible:john:3:7"]')).toBe(v7);
    // main's marks live on the words alone, inside the verse (the read tracker counts the outer one, once per verse)
    const words = v7.querySelector('[data-hl-dom]');
    expect(words.getAttribute('data-hl-key')).toBe('bible:john:3:7');
    expect(words.textContent).toBe('Do not marvel that I said to you, You must be born again.');
    expect(container.querySelectorAll('.bible [data-hl-dom]').length).toBe(4);
  });

  it('the gate picture: John 3 from Home > The Bible > John at its top; Back says John, Home stays lit', async () => {
    g.BOOKS = { john: JOHN };
    g.BIBLE_AUDIO_MANIFEST = JOHN_AUDIO;
    const { container } = render(<V2App gateId="2c-john3-playing" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tb .title').textContent).toBe('John');
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Home');
    expect(container.querySelector('.reader-head h1').textContent).toBe('John 3');
    expect(container.querySelector('.reader-head .eyebrow').textContent).toBe('The Scriptures of Truth · NKJV');
    expect(container.querySelector('mark.qm')).toBe(null);
    // readalong's chapter pill in the head, saying Pause (John 3 plays): the static Listen is gone
    expect(texts(container, '.reader-head .pill')).toEqual(['Pause']);
  });

  it('live: main\'s read-along gets the chapter body, this chapter and its verse keys; the pill plays this chapter', () => {
    g.BOOKS = { john: JOHN };
    g.BIBLE_AUDIO_MANIFEST = JOHN_AUDIO;
    const seen = [];
    g.ReadAlongHighlight = (p) => { seen.push(p); return null; };
    g.AudioPlayer = {
      subscribe: () => () => {}, getVersion: () => 0, getState: () => ({ status: 'idle', queue: [], qi: 0 }),
      bibleChapterOfTrack: () => null, hasAudio: () => true, playableNow: () => true, listenResume: () => null,
      toggle: vi.fn(), playBibleBook: vi.fn(),
    };
    const { container } = render(
      <BibleChapterScreen route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={{}} gate={null} replace={() => {}} onReady={() => {}} />,
    );
    const p = seen[seen.length - 1];
    expect(p.mainRef.current).toBe(container.querySelector('.body.bible'));
    expect(p.letterId).toBe('john');
    expect(p.chapter).toBe(3);
    expect(p.hlKeyFn('john', 2)).toBe('bible:john:3:2');
    expect(p.readAlongOn).toBe(true);
    click(container.querySelector('.reader-head .pill'));
    expect(g.AudioPlayer.playBibleBook).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'john', chapterNum: 3 }));
  });

  it('a book with no recording has no pill and no read-along', () => {
    g.BOOKS = { john: JOHN };
    g.ReadAlongHighlight = vi.fn(() => null);
    const { container } = render(
      <BibleChapterScreen route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={{}} gate={null} replace={() => {}} onReady={() => {}} />,
    );
    expect(container.querySelector('.reader-head .pill')).toBe(null);
    expect(g.ReadAlongHighlight).not.toHaveBeenCalled();
  });
});

describe("the poetic books (v2-gaps 10: main's is-poetry)", () => {
  const PSALMS = { id: 'psalms', title: 'Psalms', chapters: [{ num: 23, sections: [{ heading: 'The Lord the Shepherd of His People', verses: [
    v(1, 'The Lord is my shepherd; I shall not want.'), v(2, 'He makes me to lie down in green pastures.')] }] }] };
  const open = (book, chapter) => render(
    <BibleChapterScreen route={{ place: 'bible-chapter', book, chapter }} facts={{}} gate={null} replace={() => {}} onReady={() => {}} />);

  it("Psalms, Proverbs, Ecclesiastes, Song of Solomon and Lamentations set each verse on its own line; John stays prose", () => {
    for (const id of ['psalms', 'proverbs', 'ecclesiastes', 'songofsolomon', 'lamentations']) {
      g.BOOKS = { [id]: { ...PSALMS, id } };
      const { container, unmount } = open(id, 23);
      expect(container.querySelector('.body.bible').classList.contains('poetry')).toBe(true);
      expect(texts(container, '.body .v .vn')).toEqual(['1', '2']);
      unmount();
    }
    g.BOOKS = { john: JOHN };
    const { container } = open('john', 3);
    expect(container.querySelector('.body.bible').classList.contains('poetry')).toBe(false);
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

describe("main's Bible chrome settings (Settings > Reading, v2-gaps 14; design dz21)", () => {
  const TITLED = { id: 'john', title: 'John', chapters: [{ num: 3, title: "Nicodemus and the New Birth · John the Baptist's Final Witness", sections: [
    { heading: 'Nicodemus and the New Birth', verses: [v(1, 'There was a man.'), v(16, 'For God so loved the world.')] },
    { heading: 'Jesus Christ Is Lord', verses: [v(22, 'After these things.')] },
  ] }] };
  const RESTORED = { john: { chapters: [{ num: 3, title: 'Nicodemus and the New Birth · YahuShua Is Lord', sections: [{}, { heading: 'YahuShua HaMashiach Is Lord' }] }] } };
  const open = (facts) => render(
    <BibleChapterScreen route={{ place: 'bible-chapter', book: 'john', chapter: 3 }} facts={facts} gate={null} replace={() => {}} onReady={() => {}} />);
  afterEach(() => { delete g.BOOKS_RESTORED; delete g.TRANSLATION_OPTIONS; });

  it('the chapter title is the lede under the number, above the pill (2c, 5g: on unless turned off); off, it is gone', async () => {
    g.BOOKS = { john: TITLED };
    g.BIBLE_AUDIO_MANIFEST = JOHN_AUDIO;
    const { container, unmount } = render(<V2App gateId="2c-john3-playing" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const lede = container.querySelector('.reader-head h1 + p.lede');
    expect(lede.textContent).toBe("Nicodemus and the New Birth · John the Baptist's Final Witness");
    expect(lede.nextElementSibling.classList.contains('play')).toBe(true);
    unmount();
    const off = open({ showChapterTitle: false });
    expect(off.container.querySelector('.reader-head .lede')).toBe(null);
    expect(off.container.querySelector('.reader-head h1').textContent).toBe('John 3');
  });

  it("Restored Names (on by default) put books-restored's title and headings in place of the standard ones; the verses never change", () => {
    g.BOOKS = { john: TITLED };
    g.BOOKS_RESTORED = RESTORED;
    const { container, unmount } = open({});
    expect(container.querySelector('.reader-head .lede').textContent).toBe('Nicodemus and the New Birth · YahuShua Is Lord');
    // a section the restored chrome has no heading for keeps its own
    expect(texts(container, '.bible .sec-h')).toEqual(['Nicodemus and the New Birth', 'YahuShua HaMashiach Is Lord']);
    expect(container.querySelector('#v-16').textContent).toBe('16For God so loved the world.');
    unmount();
    const off = open({ restoredNames: false });
    expect(off.container.querySelector('.reader-head .lede').textContent).toBe("Nicodemus and the New Birth · John the Baptist's Final Witness");
    expect(texts(off.container, '.bible .sec-h')).toEqual(['Nicodemus and the New Birth', 'Jesus Christ Is Lord']);
  });

  it('Section headings off: no headings, the verses run on as one paragraph (main\'s flat render)', () => {
    g.BOOKS = { john: TITLED };
    const { container } = open({ showSectionHeadings: false });
    expect(container.querySelector('.bible .sec-h')).toBe(null);
    expect(container.querySelectorAll('.bible p').length).toBe(1);
    expect(texts(container, '.bible .v .vn')).toEqual(['1', '16', '22']);
  });

  it('a Spanish edition\'s verses carry lang="es" once its words have loaded; English ones carry none', async () => {
    g.BOOKS = { john: TITLED };
    g.TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV', desc: 'New King James Version — default' },
      { id: 'rvr', label: 'RVR1960', lang: 'es', desc: 'Reina-Valera 1960 (Español) — the Spanish Bible' }];
    g.loadTranslation = vi.fn(() => Promise.resolve());
    g.translateVerse = (book, ch, verse) => 'ES ' + verse.text;
    const { container, unmount } = open({ translation: 'rvr' });
    await waitFor(() => expect(container.querySelector('#v-1').getAttribute('lang')).toBe('es'));
    unmount();
    const en = open({ translation: 'nkjv' });
    expect(en.container.querySelector('#v-1').hasAttribute('lang')).toBe(false);
  });
});
