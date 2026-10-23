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
import { POETIC_BOOKS } from '../bible-facts.js';
import { highlightSpans } from '../../search/snippet.js';
import { placeAtThird } from '../search-landing.js';
import { bibleHlKey } from '../../utils/hl-keys.js';
import { LayerToast } from '../Sheet.jsx';
import { CouldNotOpen } from './CouldNotOpen.jsx';
import { TOAST_MS, useMainMarks } from './LetterScreen.jsx';
import { ChapterListenPill, chapterAudio, startChapter } from '../player/listen.jsx';
import { ChapterReadAlong } from '../player/read-along.jsx';
import { translationOptions, translationRow } from '../reading-settings.js';
import { MoreButton, findItem, autoScrollItem, webItem } from '../more-menu.jsx';
import { webDoor } from '../web-facts.js';

const g = /** @type {any} */ (globalThis);
/** @type {string[]} */
const NO_TERMS = [];

/** main's Bible when it has loaded, else null. */
function booksNow() {
  return g.BOOKS && typeof g.BOOKS === 'object' ? g.BOOKS : null;
}

/** The book (undefined while the Bible loads; null when there is no such book, none is asked for or it failed to load).
 *  `failed` says the Bible did not load (a book was asked for, main's BOOKS is not here); `retry` asks again (v2-gaps 39).
 *  @param {string | null} id @returns {{ book: any, failed: boolean, retry: () => void }} */
export function useBookLoad(id) {
  const [book, setBook] = React.useState(() => { if (!id) return null; const B = booksNow(); return B ? B[id] || null : undefined; });
  const loading = book === undefined;
  React.useEffect(() => {
    if (!loading) return undefined;
    let live = true;
    const load = g.__loadBibleCorpus;
    const settle = () => { if (live) { const B = booksNow(); setBook(B ? B[id] || null : null); } };
    Promise.resolve(typeof load === 'function' ? load() : null).then(settle, settle);
    return () => { live = false; };
  }, [id, loading]);
  const failed = !!id && book === null && !booksNow();
  const retry = React.useCallback(() => setBook(undefined), []);
  return { book, failed, retry };
}

/** The book (useBookLoad without its outcome). @param {string | null} id */
export function useBook(id) {
  return useBookLoad(id).book;
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
    /** a Spanish edition's verses say so once its words are on the page (main's translationLang; English until then) */
    lang: tick > 0 ? (translationOptions().find((o) => o.id === tr) || {}).lang : undefined,
    /** the edition whose words are on the page (NKJV until another has loaded), which a copied reference names (rs1;
        main's passage-copy reads it off the page) */
    shown: tr && tr !== 'nkjv' && tick === 0 ? 'nkjv' : (tr || 'nkjv'),
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

/** main's Restored-Name chrome for a chapter (books-restored.js, in main's Bible bundle: its title and section headings,
 *  never its verses), or null when the reader turned Restored Names off or the chapter has none. */
export function restoredChapter(bookId, num, on) {
  const b = on && g.BOOKS_RESTORED ? g.BOOKS_RESTORED[bookId] : null;
  return (b && Array.isArray(b.chapters) && b.chapters.find((c) => c.num === num)) || null;
}

/** @param {import('../places.js').PlaceProps} props */
export function BibleChapterScreen({ route, facts, gate = null, replace, onReady }) {
  const { book, failed: bibleFailed, retry: bibleRetry } = useBookLoad(route.book);
  const tr = useTranslation((facts && facts.translation) || 'nkjv');
  const ch = book ? book.chapters.find((c) => c.num === route.chapter) || null : null;
  // main's Bible chrome settings (Settings > Reading; each on unless the reader turned it off)
  const on = (k) => !facts || facts[k] !== false;
  const rch = book && ch ? restoredChapter(book.id, ch.num, on('restoredNames')) : null;
  const title = ch && on('showChapterTitle') ? (rch && rch.title) || ch.title || null : null;
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
      {title ? <p className="lede">{title}</p> : null}
      {ch && audio ? <ChapterListenPill gate={gate} book={book.id} chapter={ch.num} volKey={audio.volKey} label={audio.label} onToast={setToast} /> : null}
    </div>
  );
  // the heading at once; the verses when main's Bible has loaded
  if (book === undefined) return head;
  if (!book || !ch) return <>{head}<div className="g"><CouldNotOpen what="chapter" retry={bibleFailed ? bibleRetry : null} /></div></>;
  const next = nextOf(book, ch.num);
  const verse = (v) => {
    const hit = v.n === route.verse;
    const hlKey = bibleHlKey(book.id, ch.num, v.n);
    const vt = hit ? terms : NO_TERMS;
    // The verse keeps the key too: the read-along lights the first element keyed so, the whole verse with its number
    // (2c), and main's read tracker counts only the outermost keyed element, once per verse.
    return (
      <React.Fragment key={v.n}>
        <span className={'v' + (hit ? ' hit-v' : '')} id={'v-' + v.n} lang={tr.lang} data-read-seg={'v' + v.n} data-hl-key={hlKey}>
          {/* the space ends the number's word (rs1): "16For" was one word to a long-press */}
          <span className="vn">{v.n}</span>{' '}
          <VerseWords key={tr.words + (hit ? '|' + termsKey : '')} hlKey={hlKey} text={tr.text(book, ch, v)} terms={vt} matchRef={hit ? matchRef : null} />
        </span>{' '}
      </React.Fragment>
    );
  };
  return (
    <>
      {head}
      <div className={'body g bible' + (POETIC_BOOKS.has(book.id) ? ' poetry' : '')} ref={bodyRef} data-translation={tr.shown}>
        {on('showSectionHeadings') ? ch.sections.map((sec, si) => {
          const heading = (rch && rch.sections && rch.sections[si] && rch.sections[si].heading) || sec.heading;
          return (
            <React.Fragment key={si}>
              {heading || sec.letter ? <div className="sec-h">{[sec.letter, heading].filter(Boolean).join(' ')}</div> : null}
              <p>{sec.verses.map(verse)}</p>
            </React.Fragment>
          );
        }) : <p>{ch.sections.flatMap((sec) => sec.verses).map(verse)}</p>}
        <span className="reading-end" aria-hidden="true" />
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

/** Bible translation (5g): the reader's edition, "NKJV · New King James Version"; it opens 7e. @param {string} id @param {any} go */
export function translationItem(id, go) {
  const o = translationOptions().find((t) => t.id === id) || translationOptions()[0];
  const row = translationRow(o);
  return { id: 'translation', icon: 'book', t: 'Bible translation', s: row.code + ' · ' + row.name, chev: true,
    run: () => go({ place: 'settings/translation' }) };
}

/**
 * Aa opens the shell's Text and theme sheet (myweb 1c); the ... (5g; more-menu.jsx) holds Find in this chapter,
 * Auto-scroll and Bible translation (the site has no Bible pages: no Copy website link).
 * @param {{ route: any, go: (...routes: any[]) => void, desktop: boolean, gate?: any, facts?: Record<string, any>,
 *   open?: (sheet: string) => void }} ctx
 */
function chapterActions({ route, go, desktop, gate, facts, open }) {
  return (
    <>
      <button type="button" className="ic" aria-label="Text and theme" onClick={() => open && open('text-and-theme')}><Icon name="aa" /></button>
      <MoreButton title={bookTitle({ book: route.book }) + ' ' + route.chapter} desktop={desktop} gate={gate} items={[
        findItem('chapter', open),
        autoScrollItem(open, gate),
        translationItem((facts && facts.translation) || 'nkjv', go),
        webItem(webDoor({ book: route.book, chapter: Number(route.chapter) }), 'Show in Scripture Web', go, gate),
      ]} />
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
  find: () => 'chapter',
});
