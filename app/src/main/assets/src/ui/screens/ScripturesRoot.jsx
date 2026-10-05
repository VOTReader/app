/* ═══════════════════════════════════════════════════════════════════════
   ScripturesRoot — The Holy Bible in the new look (rs2c, overhaul review
   build, 2026-10-05). Cluster D (bundle-d.js).
   ═══════════════════════════════════════════════════════════════════════
   audit-ia.md §1 ("scriptures-home, scripture-genre: MERGE INTO The Holy
   Bible") and the design sheet 09: one page replaces the old Scriptures
   home, its four layouts and the genre screens. The translation in gold
   capitals, a display title, an Old / New Testament switch, then each
   genre as a gold capital heading over hairline book rows ("28 chapters").
   A book row opens the book (its chapter list, or the chapter itself for a
   one-chapter book), exactly as a book tile did.

   ScripturesHome renders this whenever the tab bar exists (BottomTabs);
   without it the classic layouts stay. Same props as ScripturesHome.
   The testament shown is remembered on this device ('vot-bible-testament').
   ═══════════════════════════════════════════════════════════════════════ */

import { translationName, translationLabel } from '../../data/translations.js';
import { RootRow } from './HomeRoot.jsx';

const TESTAMENT_KEY = 'vot-bible-testament';

function readTestament() {
  try { return localStorage.getItem(TESTAMENT_KEY) === 'nt' ? 'nt' : 'ot'; } catch (_e) { return 'ot'; }
}

/** "50 Chapters" -> "50 chapters"; Matthew also says its Study Bible is there. */
function bookLine(book) {
  const line = String(book.detail || '').toLowerCase();
  return book.id === 'matthew-plain' || book.id === 'matthew' ? line + ' · Study Bible available' : line;
}

export function ScripturesRoot({ onSelect, onBack, onSearch, translation }) {
  // The Bible text loads while the reader picks (same pre-load as the classic page).
  React.useEffect(() => {
    if (typeof window.__loadBibleCorpus === 'function') {
      window.__loadBibleCorpus().catch((e) => console.warn('Bible corpus pre-load failed', e));
    }
  }, []);
  const [testament, setTestamentState] = React.useState(readTestament);
  const setTestament = (t) => {
    setTestamentState(t);
    try { localStorage.setItem(TESTAMENT_KEY, t); } catch (_e) { /* private mode: this visit only */ }
  };
  const genres = (typeof SCRIPTURE_GENRES !== 'undefined' && SCRIPTURE_GENRES[testament]) || [];
  const label = translationLabel(translation);
  const name = translationName(translation);

  return (
    <ScreenLayout navChildren={LibraryNav({
      onBack, backLabel: 'Read', showHome: false, hide: ['settings', 'history', 'theme'],
      leftExtras: <span className="nav-app-name nav-screen-title">The Holy Bible</span>,
      onSearch,
    })}>
      <div className="root-page scriptures-root">
        <p className="caps-label root-eyebrow">{label && name && label !== name ? label + ' · ' + name : name || label}</p>
        <h1 className="root-display">The Scriptures of Truth</h1>
        <p className="root-sub">Genesis to Revelation</p>
        <div className="root-segment" role="tablist" aria-label="Testament">
          <button type="button" role="tab" aria-selected={testament === 'ot'} className={testament === 'ot' ? 'is-on' : ''} onClick={() => setTestament('ot')}>Old Testament</button>
          <button type="button" role="tab" aria-selected={testament === 'nt'} className={testament === 'nt' ? 'is-on' : ''} onClick={() => setTestament('nt')}>New Testament</button>
        </div>
        {genres.map((g) => (
          <section key={g.id} aria-label={g.label}>
            <h2 className="caps-label">{g.label}</h2>
            <ul className="root-list root-list-tight">
              {g.books.map((b) => (
                <RootRow key={b.id} title={b.title} sub={bookLine(b)} onClick={() => onSelect(b.id, true)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ScreenLayout>
  );
}
