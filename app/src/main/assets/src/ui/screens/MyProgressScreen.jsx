/* ═══════════════════════════════════════════════════════════════════════
   MyProgressScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   "My Progress" dashboard — one read-only screen unifying data that all
   already exists elsewhere (zero new persistence):
   - hero: chapters/letters read (mark-as-read), journal streak, entries,
     lifetime words read + measured pace (ReadingStatsStore)
   - last-14-days words-read mini bars (ReadingStatsStore.wordsForDays)
   - per-collection reading progress (shared buildProgressGroups table)
   - journaling: words written (journal text blocks) + voice-memo minutes
     (JournalMediaStore durations)
   - library counts (notes / marks / bookmarks / links)
   - most-annotated books & letters (AnnotationStore, Hidden Manna
     filtered by progress-stats — never surfaces here)

   History-derived rows honor historyEnabled=false. The reading table
   honors settings.markAsRead the same way Settings does (hidden behind
   an explanatory line while the toggle is off).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Compact count for the hero cells: exact with separators below 10k
 * ("9,999"), one-decimal k up to 1M ("12.4k"), one-decimal M beyond
 * ("1.2M"). Trailing .0 drops ("12k", not "12.0k").
 * @param {number} n
 * @returns {string}
 */
export function _fmtWords(n) {
  const v = Math.max(0, Math.round(n || 0));
  if (v >= 1e6) return (Math.round(v / 1e5) / 10) + 'M';
  if (v >= 1e4) return (Math.round(v / 100) / 10) + 'k';
  return v.toLocaleString('en-US');
}

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
    React.useCallback((cb) => (typeof ReadingStreakStore !== 'undefined') ? ReadingStreakStore.subscribe(cb) : () => {}, []),
    () => (typeof ReadingStreakStore !== 'undefined') ? ReadingStreakStore.getVersion() : 0
  );
  // Re-check the reading streak on every Progress open — an app left
  // running across midnight would otherwise show a stale unbroken streak
  // (the module-load recompute only runs once per boot).
  React.useEffect(() => {
    if (typeof ReadingStreakStore !== 'undefined') ReadingStreakStore.recomputeFromLoad();
  }, []);
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof AnnotationStore !== 'undefined') ? AnnotationStore.subscribe(cb) : () => {}, []),
    () => (typeof AnnotationStore !== 'undefined') ? AnnotationStore.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof ReadingStatsStore !== 'undefined') ? ReadingStatsStore.subscribe(cb) : () => {}, []),
    () => (typeof ReadingStatsStore !== 'undefined') ? ReadingStatsStore.getVersion() : 0
  );

  // Voice-memo minutes — JournalMediaStore.list() is async (IDB cursor);
  // resolved once on mount. The row is omitted entirely at 0.
  const [voiceMins, setVoiceMins] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    if (typeof JournalMediaStore === 'undefined' || typeof JournalMediaStore.list !== 'function') return undefined;
    JournalMediaStore.list()
      .then((recs) => {
        if (!alive) return;
        let secs = 0;
        (recs || []).forEach((r) => { if (r && r.type === 'audio' && r.duration > 0) secs += r.duration; });
        setVoiceMins(Math.round(secs / 60));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ── Aggregate ─────────────────────────────────────────────────────────
  const totalRead = readItems ? Object.keys(readItems).length : 0;
  const jrnStats = (typeof JournalStatsStore !== 'undefined') ? JournalStatsStore.get() : { currentStreak: 0 };
  const streak = jrnStats.currentStreak || 0;
  const readStreak = (typeof ReadingStreakStore !== 'undefined') ? (ReadingStreakStore.get().currentStreak || 0) : 0;
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

  // Reading-measurement surfaces (ReadingStatsStore, bundle-b). Each is
  // independently guarded — a missing store hides its element, never 0-lies.
  const readingStats = (typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.get === 'function') ? ReadingStatsStore.get() : null;
  const measuredWpm = (typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.measuredWpm === 'function') ? ReadingStatsStore.measuredWpm() : null;
  const wordDays = (typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.wordsForDays === 'function') ? ReadingStatsStore.wordsForDays(14) : null;

  // Words WRITTEN — every text-bearing journal block (p / h2 / quote);
  // card excerpts and captions are quoted content, not the user's writing.
  // null (not 0) when the counter or store is absent, so the row hides.
  let journalWords = null;
  if (typeof JournalStore !== 'undefined' && typeof JournalStore.all === 'function' && typeof countTextWords === 'function') {
    journalWords = 0;
    (JournalStore.all() || []).forEach((e) => {
      ((e && e.blocks) || []).forEach((b) => {
        if (b && (b.type === 'p' || b.type === 'h2' || b.type === 'quote')) journalWords += countTextWords(b.text);
      });
    });
  }

  const heroStats = [
    { num: totalRead, label: 'Read', sub: totalRead === 1 ? 'chapter or letter' : 'chapters & letters' },
    { num: readStreak, label: 'Reading Streak', sub: readStreak === 1 ? 'day of reading' : 'days of reading' },
    { num: streak, label: 'Journal Streak', sub: streak === 1 ? 'day of journaling' : 'days of journaling' },
    { num: journalCount, label: journalCount === 1 ? 'Entry' : 'Entries', sub: 'in your journal' },
    ...(readingStats ? [{ num: _fmtWords(readingStats.totalWordsRead || 0), label: 'Words Read', sub: 'across your reading' }] : []),
    ...(measuredWpm ? [{ num: measuredWpm, label: 'Reading Pace', sub: 'words per minute' }] : []),
    // Re-reads only appear once one exists — a zero here would just be noise.
    ...(readingStats && readingStats.rereads > 0
      ? [{ num: readingStats.rereads, label: 'Re-reads', sub: readingStats.rereads === 1 ? 'letter or chapter revisited' : 'letters & chapters revisited' }] : []),
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

        {wordDays ? (() => {
          const max = Math.max(0, ...wordDays.map((d) => d.words));
          const weekWords = wordDays.slice(-7).reduce((n, d) => n + d.words, 0);
          return (
            <div className="prg-days-wrap" role="group" aria-label="Words read, last 14 days">
              <span className="sr-only">{_fmtWords(weekWords)} words this week</span>
              <div className="prg-days-bars" aria-hidden="true">
                {wordDays.map((d) => (
                  <div
                    key={d.date}
                    className="prg-days-bar"
                    style={d.words > 0 ? { height: Math.max(8, Math.round((d.words / max) * 100)) + '%' } : null}
                  />
                ))}
              </div>
            </div>
          );
        })() : null}

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

        {(journalWords !== null || voiceMins > 0) && (
          <div className="settings-section prg-section">
            <div className="settings-section-label">Journaling</div>
            <div className="settings-card">
              {journalWords !== null && (
                <div className="progress-row">
                  <span className="progress-row-label">Words written</span>
                  <span className="progress-row-tally">{_fmtWords(journalWords)}</span>
                </div>
              )}
              {voiceMins > 0 && (
                <div className="progress-row">
                  <span className="progress-row-label">Voice memos</span>
                  <span className="progress-row-tally">{voiceMins} min</span>
                </div>
              )}
            </div>
          </div>
        )}

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
