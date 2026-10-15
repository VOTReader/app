/* BibleChapterScreen - one Bible chapter in v2 (zv1, for 5c-search-match; agreed with myweb 10-14: myweb's 2c-john3-playing
   adds the lit verse and the player on top, and 5a/5b route here).

   Route: { place: 'bible-chapter', book, chapter, verse?, match? } with book = main's BOOKS key ('john'). The chapter is
   read from main's Bible (bundle-a-bible.js, loaded on first use) in the reader's translation (main's translateVerse;
   NKJV until another edition has loaded). Opened from a search, `verse` is placed a third of the way down the page with
   `match` underlined in it (5c), and Back returns to the results. A verse main's reader highlighted (bible:<book>:<c>:<v>)
   shows it here, painted by main's own painter as a letter's are (v2g11: saved data shows up in the new places). */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { whenPainted } from '../gate.js';
import { bookTitle } from '../home-facts.js';
import { highlightSpans } from '../../search/snippet.js';
import { placeAtThird } from '../search-landing.js';
import { bibleHlKey } from '../../utils/hl-keys.js';
import { LayerToast } from '../Sheet.jsx';
import { TOAST_MS, useMainMarks } from './LetterScreen.jsx';
import { ChapterListenPill, chapterAudio, startChapter } from '../player/listen.jsx';
import { ChapterReadAlong } from '../player/read-along.jsx';

const g = /** @type {any} */ (globalThis);
/** @type {string[]} */
const NO_TERMS = [];

/** main's Bible when it has loaded, else null. */
function booksNow() {
  return g.BOOKS && typeof g.BOOKS === 'object' ? g.BOOKS : null;
}

/** The book (undefined while the Bible loads; null when there is no such book or it failed to load). @param {string} id */
export function useBook(id) {
  const [book, setBook] = React.useState(() => { const B = booksNow(); return B ? B[id] || null : undefined; });
  const loading = book === undefined;
  React.useEffect(() => {
    if (!loading) return undefined;
    let live = true;
    const load = g.__loadBibleCorpus;
    const settle = () => { if (live) { const B = booksNow(); setBook(B ? B[id] || null : null); } };
    Promise.resolve(typeof load === 'function' ? load() : null).then(settle, settle);
    return () => { live = false; };
  }, [id, loading]);
  return book;
}

/** The reader's translation for verse text: held while shown, and the page redrawn once it has loaded (main's pattern). */
function useTranslation(tr) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!tr || tr === 'nkjv' || typeof g.loadTranslation !== 'function') return undefined;
    let live = true;
    const letGo = typeof g.holdTranslation === 'function' ? g.holdTranslation(tr) : null;
    Promise.resolve(g.loadTranslation(tr)).then(() => { if (live) setTick((n) => n + 1); }, () => {});
    return () => { live = false; if (typeof letGo === 'function') letGo(); };
  }, [tr]);
  return {
    text: (book, ch, v) => (tr && tr !== 'nkjv' && typeof g.translateVerse === 'function' ? g.translateVerse(book.id, ch.num, v, tr) : v.text),
    label: typeof g.translationLabel === 'function' ? g.translationLabel(tr || 'nkjv') : String(tr || 'nkjv').toUpperCase(),
    /** changes whenever the words on the page do */
    words: (tr || 'nkjv') + ':' + tick,
  };
}

/**
 * A verse's words, the box main's painter marks (data-hl-key + data-hl-dom over the words alone, as main's
 * HighlightableText holds them). Keyed by the words' version where it is used, so new words are a new box and React
 * never rewrites text the painter has split; memoised against the page's other renders.
 * @param {{ hlKey: string, text: string, terms: string[], matchRef: { current: HTMLElement | null } | null }} props
 */
function Words({ hlKey, text, terms, matchRef }) {
  /** @type {any} */
  let words = text;
  if (terms.length) {
    let first = true;
    words = highlightSpans(text, terms).map((s, i) => {
      if (!s.hit) return <React.Fragment key={i}>{s.text}</React.Fragment>;
      const ref = first ? matchRef : undefined;
      first = false;
      return <mark key={i} ref={ref} className="qm">{s.text}</mark>;
    });
  }
  return <span className="vt" data-hl-key={hlKey} data-hl-dom="true">{words}</span>;
}
const VerseWords = React.memo(Words, (a, b) => a.hlKey === b.hlKey && a.text === b.text && a.terms.join('\u0001') === b.terms.join('\u0001'));

/** The chapter after this one: the next in the book, else the next book's first (main's BIBLE_BOOK_LIST order). */
function nextOf(book, n) {
  const i = book.chapters.findIndex((c) => c.num === n);
  if (i >= 0 && i + 1 < book.chapters.length) return { book, chapter: book.chapters[i + 1].num, label: 'Next · Chapter ' + book.chapters[i + 1].num };
  const list = Array.isArray(g.BIBLE_BOOK_LIST) ? g.BIBLE_BOOK_LIST : [];
  const at = list.indexOf(book);
  const nb = at >= 0 ? list[at + 1] : null;
  return nb && nb.chapters && nb.chapters.length ? { book: nb, chapter: nb.chapters[0].num, label: 'Next book' } : null;
}

/** @param {import('../places.js').PlaceProps} props */
export function BibleChapterScreen({ route, facts, gate = null, replace, onReady }) {
  const book = useBook(route.book);
  const tr = useTranslation((facts && facts.translation) || 'nkjv');
  const ch = book ? book.chapters.find((c) => c.num === route.chapter) || null : null;
  const matchRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const bodyRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const terms = route.match ? [].concat(route.match).filter(Boolean) : [];
  const termsKey = terms.join('\u0001');
  // main's highlights on the verses, painted again when the words, the match or main's marks change (never on a gate boot)
  useMainMarks(!gate, book && ch ? [book.id, ch.num, tr.words, route.verse || '', termsKey].join('|') : null);
  // the reader's Bible audio for this book (readalong rv1 2c); null = no recording, so no pill and no read-along
  const audio = React.useMemo(() => chapterAudio(route.book, gate), [route.book, gate]);
  // Listen's offline line, as the letter's (a gate's stays: it is the picture)
  const [toast, setToast] = React.useState(/** @type {import('../player/listen.jsx').Toast | null} */ (null));
  React.useEffect(() => {
    if (!toast || gate) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, gate]);

  React.useEffect(() => {
    if (book === undefined) return undefined;
    let live = true;
    if (!ch || !route.verse) { onReady(); return undefined; }
    // the match's line depends on the faces: place it once they have loaded and painted
    whenPainted().then(() => {
      if (!live) return;
      placeAtThird(matchRef.current || g.document.getElementById('v-' + route.verse));
      onReady();
    });
    return () => { live = false; };
  }, [book, ch, route.verse, onReady]);

  const head = (
    <div className="page-head g reader-head">
      <span className="overline eyebrow">The Scriptures of Truth · {tr.label}</span>
      <h1 className="display">{book ? book.title : bookTitle({ book: route.book })} {route.chapter}</h1>
      {ch && audio ? <ChapterListenPill gate={gate} book={book.id} chapter={ch.num} volKey={audio.volKey} label={audio.label} onToast={setToast} /> : null}
    </div>
  );
  // the heading at once; the verses when main's Bible has loaded
  if (book === undefined) return head;
  if (!book || !ch) return <>{head}<div className="g"><div className="empty"><div className="t">This chapter could not be opened.</div></div></div></>;
  const next = nextOf(book, ch.num);
  const verse = (v) => {
    const hit = v.n === route.verse;
    const hlKey = bibleHlKey(book.id, ch.num, v.n);
    const vt = hit ? terms : NO_TERMS;
    // The verse keeps the key too: the read-along lights the first element keyed so, the whole verse with its number
    // (2c), and main's read tracker counts only the outermost keyed element, once per verse.
    return (
      <React.Fragment key={v.n}>
        <span className={'v' + (hit ? ' hit-v' : '')} id={'v-' + v.n} data-read-seg={'v' + v.n} data-hl-key={hlKey}>
          <span className="vn">{v.n}</span>
          <VerseWords key={tr.words + (hit ? '|' + termsKey : '')} hlKey={hlKey} text={tr.text(book, ch, v)} terms={vt} matchRef={hit ? matchRef : null} />
        </span>{' '}
      </React.Fragment>
    );
  };
  return (
    <>
      {head}
      <div className="body g bible" ref={bodyRef}>
        {ch.sections.map((sec, si) => (
          <React.Fragment key={si}>
            {sec.heading || sec.letter ? <div className="sec-h">{[sec.letter, sec.heading].filter(Boolean).join(' ')}</div> : null}
            <p>{sec.verses.map(verse)}</p>
          </React.Fragment>
        ))}
        {next && (
          <button type="button" className="nextcard" onClick={() => replace({ place: 'bible-chapter', book: next.book.id, chapter: next.chapter })}>
            <span className="tx"><span className="k">{next.label}</span><span className="t">{next.book.title} {next.chapter}</span></span>
            <span className="chev"><Icon name="chev" /></span>
          </button>
        )}
      </div>
      {/* the verse being read, lit (readalong rv1 2c): main's read-along over the verses' [data-hl-key] */}
      {audio && (
        <ChapterReadAlong gate={gate} book={book.id} chapter={ch.num} volKey={audio.volKey} bodyRef={bodyRef}
          on={facts.readAlong !== false} follow={facts.readAlongFollow !== false} textKey={tr.label}
          onListen={gate ? null : () => startChapter(g.AudioPlayer, { volKey: audio.volKey, book: book.id, chapter: ch.num, label: audio.label }, setToast)} />
      )}
      <LayerToast text={toast && toast.text} icon={toast && toast.icon} />
    </>
  );
}

/** Aa opens the shell's Text and theme sheet (myweb 1c). @param {{ open?: (sheet: string) => void }} ctx */
function chapterActions({ open }) {
  return (
    <>
      <button type="button" className="ic" aria-label="Text and theme" onClick={() => open && open('text-and-theme')}><Icon name="aa" /></button>
      <button type="button" className="ic" aria-label="More"><Icon name="more" /></button>
    </>
  );
}

/** A new chapter (the next-chapter card) is a new page: keyed so its book loads and it opens at its top. */
function ChapterPlace(props) {
  const r = props.route;
  return <BibleChapterScreen key={r.book + '/' + r.chapter} {...props} />;
}

definePlace('bible-chapter', {
  Screen: ChapterPlace,
  title: (r) => bookTitle({ book: r.book }) + ' ' + r.chapter,
  actions: chapterActions,
  contentClass: 'content reader',
});
