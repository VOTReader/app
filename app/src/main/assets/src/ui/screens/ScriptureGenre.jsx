/* ═══════════════════════════════════════════════════════════════════════
   ScriptureGenre — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { ListGroup, ListRow } from '../components/UiParts.jsx';
import { BarAction } from '../components/RootNav.jsx';

// A group of the Bible (Gospels, the Law, ...): the utility bar and one list of its books, the same one-line rows as
// the Bible index (W2i). Each row keeps .chapter-card-btn: the textzoom, contrast and restore walks tap it.
export function ScriptureGenre({ genreId, onSelect, onBack, onSearch }) {
  // Start the Bible download on arrival, as ScripturesHome does: this screen
  // can be the first one a reader sees (a restored tab), and every row on it
  // opens a book. A tap before the text lands opens its loading view.
  React.useEffect(() => {
    if (typeof window.__loadBibleCorpus === 'function') {
      window.__loadBibleCorpus().catch((e) => console.warn('Bible corpus pre-load failed', e));
    }
  }, []);
  const genre = [...SCRIPTURE_GENRES.ot, ...SCRIPTURE_GENRES.nt].find((g) => g.id === genreId);
  if (!genre) return null;
  const testament = SCRIPTURE_GENRES.nt.some((g) => g.id === genreId) ? "New Testament" : "Old Testament";
  const utility = {
    title: genre.label, onBack, backLabel: 'Back to Scriptures',
    actions: [onSearch ? <BarAction key="s" icon="search" label="Search" onClick={onSearch} /> : null],
  };
  return (
    <ScreenLayout utility={utility} className="rd-bindex-screen">
      <div className="home-screen rd-bindex rd-genre">
        <ListGroup label={testament}>
          {genre.books.map((b) => (
            <ListRow key={b.id} noLead one className="chapter-card-btn" title={b.title}
              value={String(b.detail || '').toLowerCase()} onClick={() => onSelect(b.id)} />
          ))}
        </ListGroup>
      </div>
    </ScreenLayout>
  );
}
