/* BibleScreen - The Bible (picture 5a-bible: the testament switch, the books, "Reading" on the book being read) and a
   book (picture 5b-book: its chapters, read ones dotted, the reader's place ringed). Laptop D5: the books in three
   columns, ten chapters to a row (screens.css). Both read only: main's read record, places and history (bible-facts.js);
   a gate boot reads its facts instead. A chapter opens zones' bible-chapter reader. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { testamentBooks, bookOf, readingBook, bookProgress, savedBible, translationName } from '../bible-facts.js';

const TESTAMENTS = [{ id: 'old', label: 'Old Testament' }, { id: 'new', label: 'New Testament' }];

/** The eyebrow both pages share: "The Scriptures of Truth · NKJV". */
function Eyebrow({ facts }) {
  return <span className="overline eyebrow">The Scriptures of Truth · {translationName(facts && facts.translation)}</span>;
}

/** The reader's Bible facts: the gate's, else main's saved state (read once per page). */
function useBibleFacts(gate) {
  return React.useMemo(() => (gate ? null : savedBible()), [gate]);
}

/** @param {import('../places.js').PlaceProps} props */
export function BibleScreen({ route, facts, gate, desktop, go, onReady }) {
  const saved = useBibleFacts(gate);
  const gateBible = (gate && gate.facts && gate.facts.bible) || {};
  const reading = gate ? gateBible.reading || null : readingBook(saved && saved.state, saved && saved.entries);
  const readingBookInfo = reading ? bookOf(reading) : null;
  const [testament, setTestament] = React.useState(() => route.testament
    || (readingBookInfo ? readingBookInfo.testament : 'old'));
  React.useEffect(() => { onReady(); }, [onReady]);
  const books = testamentBooks(/** @type {'old' | 'new'} */ (testament));
  const rows = Math.ceil(books.length / 3);
  const pick = (id) => ({
    role: 'radio', 'aria-checked': id === testament, tabIndex: 0,
    onClick: () => setTestament(id),
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTestament(id); } },
  });
  return (
    <>
      <div className="page-head g">
        <Eyebrow facts={facts} />
        <h1 className="display">The Bible</h1>
        <div className="seg tst" role="radiogroup" aria-label="Testament">
          {TESTAMENTS.map((t) => <span key={t.id} className={t.id === testament ? 'on' : undefined} {...pick(t.id)}>{t.label}</span>)}
        </div>
      </div>
      <div className="rows bks" style={desktop ? /** @type {any} */ ({ '--n': rows }) : undefined}>
        {books.map((b, i) => {
          const cur = b.id === reading;
          return (
            <button key={b.id} type="button" className={'row single bk' + (cur ? ' cur' : '') + (desktop && i % rows === 0 ? ' top' : '')}
              onClick={() => go({ place: 'bible-book', book: b.id })}>
              <span className="tx"><span className="t">{b.title}</span></span>
              {cur && <span className="here">Reading</span>}
              <span className="chev"><Icon name="chev" /></span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function BookScreen({ route, facts, gate, go, onReady }) {
  const saved = useBibleFacts(gate);
  const book = bookOf(route.book);
  React.useEffect(() => { onReady(); }, [onReady]);
  if (!book) return <div className="empty"><div className="t">This book could not be opened.</div></div>;
  const gateBible = (gate && gate.facts && gate.facts.bible) || {};
  const progress = gate
    ? { read: (gateBible.read && gateBible.read[book.id]) || [], place: (gateBible.place && gateBible.place[book.id]) || null }
    : bookProgress(saved && saved.state, book);
  const chapters = Array.from({ length: book.chapters }, (_x, i) => i + 1);
  return (
    <>
      <div className="page-head g">
        <Eyebrow facts={facts} />
        <h1 className="display">{book.title}</h1>
        <p className="lede">{book.chapters === 1 ? '1 chapter' : book.chapters + ' chapters'}</p>
      </div>
      <div className="g">
        <div className="chgrid num">
          {chapters.map((c) => {
            const read = progress.read.includes(c);
            const cur = c === progress.place;
            return (
              <button key={c} type="button" className={'ch' + (read ? ' read' : '') + (cur ? ' cur' : '')}
                aria-label={book.title + ' ' + c + (read ? ', read' : '') + (cur ? ', where you are' : '')}
                onClick={() => go({ place: 'bible-chapter', book: book.id, chapter: c })}>{c}</button>
            );
          })}
        </div>
      </div>
    </>
  );
}

definePlace('bible', {
  Screen: BibleScreen,
  title: () => 'The Bible',
});

definePlace('bible-book', {
  Screen: BookScreen,
  title: (r) => { const b = bookOf(r.book); return b ? b.title : String(r.book || ''); },
});
