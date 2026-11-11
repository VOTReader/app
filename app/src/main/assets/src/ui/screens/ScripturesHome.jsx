/* ═══════════════════════════════════════════════════════════════════════
   ScripturesHome — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   r-bindex (W2h, mock v2 readers.html): the utility bar (Back, "The Scriptures of Truth", Search; no gear, rule 11), then the
   translation pill (code + name, opens "Bible translation") and a Groups | All books switch, then grouped lists. The
   switch writes settings.scriptureLayout: Groups = 'genre'; All books = 'canon' (the old 'compact' and 'grid' read as
   All books). */

import { TranslationPill } from '../components/TranslationPill.jsx';
import { ListGroup, ListRow, Segmented } from '../components/UiParts.jsx';
import { BarAction } from '../components/RootNav.jsx';
import { countOf } from '../../utils/download-tree.js';

export function ScripturesHome({ onSelect, onGenre, onBack, onSearch, layout, onCycleLayout, translation, onTranslation }) {
  // Q8: pre-trigger the Bible corpus load when this screen mounts so the
  // user's likely next action (tap a genre tile or book) doesn't pay the
  // full ~7 MB download wait. The subscription re-renders this component
  // when BOOKS becomes defined, replacing skeleton "—" counts with real
  // chapter totals. Idempotent — second mount returns the cached Promise.
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__bibleCorpus !== 'undefined' ? window.__bibleCorpus.subscribe(cb) : () => {}), []),
    () => (typeof window.__bibleCorpus !== 'undefined' ? window.__bibleCorpus.getVersion() : 0)
  );
  React.useEffect(() => {
    if (typeof window.__loadBibleCorpus === 'function') {
      window.__loadBibleCorpus().catch((e) => console.warn('Bible corpus pre-load failed', e));
    }
    // (s22.2: the Matthew Study Bible loads when it is opened, from plain Matthew's "Read with study notes" or
    // Studies; this screen no longer offers it, so it no longer downloads it on every visit.)
  }, []);
  const bibleLoaded = typeof window.__bibleCorpus !== 'undefined' && window.__bibleCorpus.loaded;

  // Every row answers at once, loaded or not. A genre needs no BOOKS; a book
  // goes through onSelect (useReadingPositionNav's selectScriptureBook), which
  // opens the "Loading Bible…" view until the text lands.
  const handleTile = (group) => {
    if (group.single) {onSelect(group.books[0].id, true);} else
    onGenre(group.id);
  };
  const handleBook = (id) => onSelect(id);

  const canPick = typeof onTranslation === 'function'
    && typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS) && TRANSLATION_OPTIONS.length > 1;
  const allBooks = layout && layout !== 'genre';
  const utility = {
    title: 'The Scriptures of Truth', onBack, backLabel: 'Back to Home',
    actions: [
      onSearch ? <BarAction key="s" icon="search" label="Search" onClick={onSearch} /> : null,
    ],
  };

  const tools = (
    <div className="rd-bindex-tools">
      <TranslationPill translation={translation} onTranslation={canPick ? onTranslation : null} />
      {typeof onCycleLayout === 'function' ? (
        <Segmented label="Show" options={[{ id: 'genre', label: 'Groups' }, { id: 'canon', label: 'All books' }]}
          value={allBooks ? 'canon' : 'genre'} onChange={(v) => onCycleLayout(v)} />
      ) : null}
    </div>
  );

  const chapters = (books) => (bibleLoaded
    ? countOf(books.reduce((s, b) => s + (BOOKS[b.id]?.chapters.length || 0), 0), 'chapter')
    : '— chapters');
  const sections = [
    { label: 'Old Testament', genres: SCRIPTURE_GENRES.ot },
    { label: 'New Testament', genres: SCRIPTURE_GENRES.nt },
  ];

  return (
    <ScreenLayout utility={utility} className="rd-bindex-screen">
      <div className="home-screen scriptures-landing rd-bindex">
        {tools}
        {sections.map((sec) => (
          <ListGroup key={sec.label} label={sec.label}>
            {allBooks
              ? sec.genres.flatMap((g) => g.books).map((b) => (
                <ListRow key={b.id} noLead one title={b.title} value={String(b.detail || '').toLowerCase()} onClick={() => handleBook(b.id)} />
              ))
              : sec.genres.map((g) => (
                <ListRow key={g.id} noLead one title={g.label} value={countOf(g.books.length, 'book') + ' · ' + chapters(g.books)}
                  onClick={() => handleTile(g)} />
              ))}
          </ListGroup>
        ))}
      </div>
    </ScreenLayout>
  );
}
