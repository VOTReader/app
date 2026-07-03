/* ═══════════════════════════════════════════════════════════════════════
   MyProgressScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   "My Progress" dashboard — one read-only screen unifying data that all
   already exists elsewhere (zero new persistence):
   - hero: chapters/letters read (mark-as-read), journal streak, entries
   - per-collection reading progress (shared buildProgressGroups table)
   - library counts (notes / marks / bookmarks / links)
   - most-annotated books & letters (AnnotationStore, Hidden Manna
     filtered by progress-stats — never surfaces here)

   History-derived rows honor historyEnabled=false. The reading table
   honors settings.markAsRead the same way Settings does (hidden behind
   an explanatory line while the toggle is off).
   ═══════════════════════════════════════════════════════════════════════ */

export function MyProgressScreen({ onBack, onSearch, onHistory, onSettings, theme, onThemeChange, settings, readItems, historyCount, historyEnabled }) {
  // The reading table + most-annotated titles read the lazy corpora
  // (BOOKS for NT/OT totals, VOT for volume totals + letter titles,
  // MATTHEW + BIBLE_STUDIES for the Studies group). Pre-fire every
  // loader on mount and subscribe so rows fill in as each corpus lands
  // (same contract as SettingsScreen's Mark-as-Read table).
  React.useEffect(() => {
    if (typeof window.__loadBibleCorpus === 'function') {
      window.__loadBibleCorpus().catch((e) => console.warn('Bible corpus pre-load failed', e));
    }
    if (typeof window.__loadVotCorpus === 'function') {
      window.__loadVotCorpus().catch((e) => console.warn('VOT corpus pre-load failed', e));
    }
    if (typeof window.__loadMatthewCorpus === 'function') {
      window.__loadMatthewCorpus().catch((e) => console.warn('Matthew corpus pre-load failed', e));
    }
  }, []);
  const [, setStudiesTick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    if (typeof loadBibleStudies === 'function') {
      Promise.resolve(loadBibleStudies())
        .then(() => { if (alive) setStudiesTick((t) => t + 1); })
        .catch((e) => console.warn('Bible studies pre-load failed', e));
    }
    return () => { alive = false; };
  }, []);
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__matthewCorpus !== 'undefined') ? window.__matthewCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__matthewCorpus !== 'undefined') ? window.__matthewCorpus.getVersion() : 0
  );

  // Store subscriptions — counts re-render live on any mutation.
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof NoteStore !== 'undefined') ? NoteStore.subscribe(cb) : () => {}, []),
    () => (typeof NoteStore !== 'undefined') ? NoteStore.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof LinkStore !== 'undefined') ? LinkStore.subscribe(cb) : () => {}, []),
    () => (typeof LinkStore !== 'undefined') ? LinkStore.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof BookmarkStore !== 'undefined') ? BookmarkStore.subscribe(cb) : () => {}, []),
    () => (typeof BookmarkStore !== 'undefined') ? BookmarkStore.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof JournalStore !== 'undefined') ? JournalStore.subscribe(cb) : () => {}, []),
    () => (typeof JournalStore !== 'undefined') ? JournalStore.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof JournalStatsStore !== 'undefined') ? JournalStatsStore.subscribe(cb) : () => {}, []),
    () => (typeof JournalStatsStore !== 'undefined') ? JournalStatsStore.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof AnnotationStore !== 'undefined') ? AnnotationStore.subscribe(cb) : () => {}, []),
    () => (typeof AnnotationStore !== 'undefined') ? AnnotationStore.getVersion() : 0
  );

  // ── Aggregate ─────────────────────────────────────────────────────────
  const totalRead = readItems ? Object.keys(readItems).length : 0;
  const jrnStats = (typeof JournalStatsStore !== 'undefined') ? JournalStatsStore.get() : { currentStreak: 0 };
  const streak = jrnStats.currentStreak || 0;
  const journalCount = (typeof JournalStore !== 'undefined') ? JournalStore.count() : 0;
  const noteCount = (typeof NoteStore !== 'undefined') ? NoteStore.count() : 0;
  const linkCount = (typeof LinkStore !== 'undefined') ? LinkStore.all().length : 0;
  const bookmarkCount = (typeof BookmarkStore !== 'undefined') ? BookmarkStore.count() : 0;
  const annData = (typeof AnnotationStore !== 'undefined') ? (AnnotationStore.all() || {}) : {};
  const markCount = (() => {
    const seen = {};
    Object.keys(annData).forEach((k) => (annData[k] || []).forEach((a) => {
      if (a.kind === 'highlight' || a.kind === 'underline') seen[a.groupId || a.id] = 1;
    }));
    return Object.keys(seen).length;
  })();
  const groups = buildProgressGroups();
  const topSources = mostAnnotatedSources(annData, 5);
  const markAsReadOn = !settings || settings.markAsRead !== false;

  const heroStats = [
    { num: totalRead, label: 'Read', sub: totalRead === 1 ? 'chapter or letter' : 'chapters & letters' },
    { num: streak, label: 'Streak', sub: streak === 1 ? 'day of journaling' : 'days of journaling' },
    { num: journalCount, label: journalCount === 1 ? 'Entry' : 'Entries', sub: 'in your journal' },
  ];
  const libraryRows = [
    { label: 'Notes', count: noteCount },
    { label: 'Highlights & Underlines', count: markCount },
    { label: 'Bookmarks', count: bookmarkCount },
    { label: 'Links', count: linkCount },
  ];

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack: onBack, onSearch: onSearch, onHistory: onHistory, onSettings: onSettings, theme: theme, onThemeChange: onThemeChange })}
    >
      <div className="prg-screen">
        <div className="library-eyebrow">Personal Study</div>
        <h1 className="library-title">My Progress</h1>
        <p className="library-sub">Your reading, journaling, and study at a glance.</p>

        <div className="prg-hero">
          {heroStats.map((s) => (
            <div key={s.label} className="prg-stat">
              <span className="prg-stat-num">{s.num}</span>
              <span className="prg-stat-label">{s.label}</span>
              <span className="prg-stat-sub">{s.sub}</span>
            </div>
          ))}
        </div>

        <div className="settings-section prg-section">
          <div className="settings-section-label">Reading</div>
          <div className="settings-card">
            {!markAsReadOn ? (
              <div className="prg-note">Mark as Read is off — reading progress isn’t being recorded. You can turn it on in Settings.</div>
            ) : groups.length === 0 ? (
              <div className="prg-note">Loading your library…</div>
            ) : (
              groups.map((grp) => {
                const t = tallyGroup(readItems, grp);
                if (t.total === 0) return null;
                const pct = Math.min(100, Math.round((t.read / t.total) * 100));
                return (
                  <div key={grp.id} className="prg-row">
                    <div className="prg-row-head">
                      <span className="prg-row-label">{grp.label}</span>
                      <span className="prg-row-tally">{t.read} / {t.total}</span>
                    </div>
                    <div className="prg-bar" aria-hidden="true">
                      <div className="prg-bar-fill" style={{ width: pct + '%' }} />
                    </div>
                  </div>
                );
              })
            )}
            {historyEnabled && (
              <div className="prg-history-row">
                <span className="prg-history-label">Reading history</span>
                <span className="prg-row-tally">{historyCount} {historyCount === 1 ? 'entry' : 'entries'}</span>
              </div>
            )}
          </div>
        </div>

        <div className="settings-section prg-section">
          <div className="settings-section-label">My Library</div>
          <div className="settings-card">
            {libraryRows.map((r) => (
              <div key={r.label} className="progress-row">
                <span className="progress-row-label">{r.label}</span>
                <span className="progress-row-tally">{r.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section prg-section">
          <div className="settings-section-label">Most Annotated</div>
          <div className="settings-card">
            {topSources.length === 0 ? (
              <div className="prg-note">Nothing marked yet — press and hold any text while reading to highlight it.</div>
            ) : (
              topSources.map((s) => (
                <div key={s.key} className="prg-src-row">
                  <div className="prg-src-main">
                    <span className="prg-src-title">{s.label}</span>
                    <span className="prg-src-col">{s.collection}</span>
                  </div>
                  <span className="prg-row-tally">{s.count} {s.count === 1 ? 'mark' : 'marks'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
}
