/* BibleChapterScreen - one Bible chapter in v2 (zv1, for 5c-search-match; agreed with myweb 10-14: myweb's 2c-john3-playing
   adds the lit verse and the player on top, and 5a/5b route here).

   Route: { place: 'bible-chapter', book, chapter, verse?, match? } with book = main's BOOKS key ('john'). The chapter is
   read from main's Bible (bundle-a-bible.js, loaded on first use) in the reader's translation (main's translateVerse;
   NKJV until another edition has loaded). Opened from a search, `verse` is placed a third of the way down the page with
   `match` underlined in it (5c), and Back returns to the results. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { whenPainted } from '../gate.js';
import { bookTitle } from '../home-facts.js';
import { highlightSpans } from '../../search/snippet.js';

const g = /** @type {any} */ (globalThis);

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
  const [, setTick] = React.useState(0);
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
  };
}

/** The element that scrolls this page: the laptop's .main, or the phone's .content. */
function scrollerOf(el) {
  return el ? /** @type {HTMLElement | null} */ (el.closest('.main') || el.closest('.content')) : null;
}

/**
 * Scrolls the page so `el`'s line sits a third of the way down what shows between the top bar and the tab bar
 * (states.json 5c: "verse 3 a third of the way down"), on a whole-line row as the picture draws it (5c: line 6 of 16).
 * @param {HTMLElement | null} el
 */
export function placeAtThird(el) {
  const sc = scrollerOf(el);
  if (!el || !sc) return;
  const doc = el.ownerDocument;
  const s = sc.getBoundingClientRect();
  const bar = doc.querySelector('.tb');
  const tabs = doc.querySelector('.tabbar');
  const top = Math.max(s.top, bar ? bar.getBoundingClientRect().bottom : s.top);
  const bottom = Math.min(s.bottom, tabs ? tabs.getBoundingClientRect().top : s.bottom);
  const r = el.getBoundingClientRect();
  const mid = (r.top + r.bottom) / 2;
  const p = el.closest('p');
  const L = p ? parseFloat(getComputedStyle(p).lineHeight) : NaN;
  if (!p || !Number.isFinite(L) || L <= 0) { sc.scrollTop += mid - (top + (bottom - top) / 3); return; }
  // the match's line box (the mark's own box sits off its line's centre), moved to the whole-line row a third of the way down
  const pTop = p.getBoundingClientRect().top;
  const line = pTop + Math.floor((mid - pTop) / L) * L;
  sc.scrollTop += line - (top + Math.floor((bottom - top) / 3 / L) * L);
}

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
export function BibleChapterScreen({ route, facts, replace, onReady }) {
  const book = useBook(route.book);
  const tr = useTranslation((facts && facts.translation) || 'nkjv');
  const ch = book ? book.chapters.find((c) => c.num === route.chapter) || null : null;
  const matchRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const terms = route.match ? [].concat(route.match).filter(Boolean) : [];

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
      {ch ? <button type="button" className="pill play"><Icon name="playBig" />Listen</button> : null}
    </div>
  );
  // the heading at once; the verses when main's Bible has loaded
  if (book === undefined) return head;
  if (!book || !ch) return <>{head}<div className="g"><div className="empty"><div className="t">This chapter could not be opened.</div></div></div></>;
  const next = nextOf(book, ch.num);
  const verse = (v) => {
    const text = tr.text(book, ch, v);
    const hit = v.n === route.verse;
    let words = text;
    if (hit && terms.length) {
      let first = true;
      words = highlightSpans(text, terms).map((s, i) => {
        if (!s.hit) return <React.Fragment key={i}>{s.text}</React.Fragment>;
        const ref = first ? matchRef : undefined;
        first = false;
        return <mark key={i} ref={ref} className="qm">{s.text}</mark>;
      });
    }
    return (
      <React.Fragment key={v.n}>
        <span className={'v' + (hit ? ' hit-v' : '')} id={'v-' + v.n}>
          <span className="vn">{v.n}</span>{words}
        </span>{' '}
      </React.Fragment>
    );
  };
  return (
    <>
      {head}
      <div className="body g bible">
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
    </>
  );
}

const CHAPTER_ACTIONS = (
  <>
    <button type="button" className="ic" aria-label="Text and theme"><Icon name="aa" /></button>
    <button type="button" className="ic" aria-label="More"><Icon name="more" /></button>
  </>
);

/** A new chapter (the next-chapter card) is a new page: keyed so its book loads and it opens at its top. */
function ChapterPlace(props) {
  const r = props.route;
  return <BibleChapterScreen key={r.book + '/' + r.chapter} {...props} />;
}

definePlace('bible-chapter', {
  Screen: ChapterPlace,
  title: (r) => bookTitle({ book: r.book }) + ' ' + r.chapter,
  actions: () => CHAPTER_ACTIONS,
  contentClass: 'content reader',
});
