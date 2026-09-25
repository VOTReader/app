/* ═══════════════════════════════════════════════════════════════════════
   MyProgressScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The Progress dashboard — one read-only screen unifying data that all
   already exists elsewhere (zero new persistence). Since the redesign
   (2026-09-25) it reads top to bottom as:
   - one summary sentence (read, reading streak, journal entries)
   - last-14-days words-read mini bars (ReadingStatsStore.wordsForDays)
   - Reading: chapters/letters read (mark-as-read), reading streak, words
     read, measured pace, time, re-reads (ReadingStatsStore), then the
     per-collection progress (shared buildProgressGroups table)
   - Milestones: the nearest one as "Next", then the featured ten
   - Journal: entries, streak, words written (journal text blocks) and
     voice-memo minutes (JournalMediaStore durations)
   - Listening, Your library (notes / marks / bookmarks / links), and
     the most-annotated books & letters (AnnotationStore, Hidden Manna
     filtered by progress-stats — never surfaces here)
   Each section is label / value rows on hairlines; no boxes.

   History-derived rows honor historyEnabled=false. The reading table
   honors settings.markAsRead the same way Settings does (hidden behind
   an explanatory line while the toggle is off).

   The Milestones strip is the FEATURED subset of utils/achievements.js
   (2026-08-10) — the same ten items MilestonesScreen shows among its full
   set, not a second table. See that module's FEATURED block.
   ═══════════════════════════════════════════════════════════════════════ */

import { isMarkKind } from '../../utils/mark-kinds.js';

/* Free globals, not imports: this screen ships in bundle-g (the lazy Personal
   Study bundle) and reads buildAchievements / collectAchievementSnapshot / onIdle from the window slots
   bundle-d fills — one copy of each law, and no second module state. */

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

/** "3h 24m" / "48 min" — lifetime reading-time display. @param {number} ms */
export function _fmtDuration(ms) {
  const min = Math.round(Math.max(0, ms || 0) / 60000);
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
}

export function MyProgressScreen({ onBack, onSearch, onHistory, onSettings, onOpenMilestones, theme, onThemeChange, settings, readItems, historyCount, historyEnabled }) {
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
    // "Most annotated" counts an Answers topic's words from its entry.
    if (typeof window.__loadAnswersCorpus === 'function') {
      window.__loadAnswersCorpus().catch((e) => console.warn('Answers corpus pre-load failed', e));
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
  // The Listening Library was the one store this dashboard never watched —
  // reading, journaling and annotation all reported here while the hours
  // spent listening went uncounted.
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof AudioLibraryStore !== 'undefined') ? AudioLibraryStore.subscribe(cb) : () => {}, []),
    () => (typeof AudioLibraryStore !== 'undefined') ? AudioLibraryStore.getVersion() : 0
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
      if (isMarkKind(a.kind)) seen[a.groupId || a.id] = 1;
    }));
    return Object.keys(seen).length;
  })();
  const groups = buildProgressGroups();
  const groupShape = groups
    .flatMap((g) => g.genres.flatMap((genre) => genre.books.map((b) => `${b.id}:${b.total}`)))
    .join('|');
  // Words-based bars (2026-08-03): item counts lie by omission (a 16-word
  // verse and a 5,034-word letter both score 1), so the bar FILL weighs
  // words. The first full pass tokenizes the library — deferred to idle so
  // opening Progress never janks; bars upgrade in place when ready.
  const [wordStats, setWordStats] = React.useState(/** @type {any} */ (null));
  React.useEffect(() => {
    if (groups.length === 0 || typeof groupWordStats !== 'function') return undefined;
    let cancelled = false;
    const compute = () => {
      const out = {};
      for (const g of groups) { out[g.id] = groupWordStats(readItems, g); }
      if (!cancelled) setWordStats(out);
    };
    // onIdle, not a bare requestIdleCallback: WebKit has never shipped that
    // API, so every iOS reader takes the timer path.
    //
    // It also removes a coincidence this cleanup was resting on. Both
    // requestIdleCallback and setTimeout return a NUMBER in a browser, so the
    // `typeof tok === 'number'` test that used to sit here could not tell the
    // two apart; it was correct only because the two idle APIs have always
    // shipped together. onIdle closes over which branch it took.
    const stop = onIdle(compute, { timeout: 3000, fallbackDelay: 50 });
    return () => {
      cancelled = true;
      stop();
    };
    // readItems identity changes on every mark; groupShape changes when a
    // lazy corpus adds sources or items. `groups` itself is rebuilt every
    // render, so depending on its identity would re-tokenize every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [groupShape, readItems]);
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

  /* ── The redesign (2026-09-25, Codex mockup r5 take 1) ─────────────────
     This was a grid of up to eight gold-outlined stat boxes, then boxed cards
     under spaced-capital labels: the busiest screen in the app. It now reads
     as one sentence ("27 chapters and letters read, a 4-day reading streak and
     5 journal entries."), the 14-day chart, and plain sections of label /
     value rows on hairlines, each fact in the section it belongs to. The
     guards are the ones the boxes had: a store that cannot answer hides its
     row, it never reports 0. */
  const plural = (n, one, many) => n.toLocaleString('en-US') + ' ' + (n === 1 ? one : many);
  const summary = (() => {
    const bits = [];
    if (totalRead > 0) bits.push(plural(totalRead, 'chapter or letter read', 'chapters and letters read'));
    if (readStreak >= 2) bits.push('a ' + readStreak + '-day reading streak');
    if (journalCount > 0) bits.push(plural(journalCount, 'journal entry', 'journal entries'));
    if (bits.length === 0) return 'Nothing read yet. The chapters and letters you read are counted here.';
    const s = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1];
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  })();

  const readingFacts = [
    { label: 'Chapters & letters read', value: totalRead.toLocaleString('en-US') },
    { label: 'Reading streak', value: plural(readStreak, 'day', 'days') },
    ...(readingStats ? [{ label: 'Words read', value: _fmtWords(readingStats.totalWordsRead || 0) }] : []),
    ...(measuredWpm ? [{ label: 'Reading pace', value: measuredWpm + ' words a minute' }] : []),
    // Lifetime reading time — the ledger's visibility-honest activeMs sum.
    ...(readingStats && readingStats.totalActiveMs > 60000
      ? [{ label: 'Time spent reading', value: _fmtDuration(readingStats.totalActiveMs) }] : []),
    // Re-reads only appear once one exists — a zero here would just be noise.
    ...(readingStats && readingStats.rereads > 0
      ? [{ label: 'Re-reads', value: readingStats.rereads.toLocaleString('en-US') }] : []),
  ];
  const journalFacts = [
    { label: 'Entries', value: journalCount.toLocaleString('en-US') },
    { label: 'Journal streak', value: plural(streak, 'day', 'days') },
    ...(journalWords !== null ? [{ label: 'Words written', value: _fmtWords(journalWords) }] : []),
    ...(voiceMins > 0 ? [{ label: 'Voice memos', value: voiceMins + ' min' }] : []),
  ];
  /* Listening (2026-08-09). Three facts the Listening Library already keeps,
     each a DIFFERENT act: pressing play, finishing what you started, and
     keeping a recording. Every guard is independent — a store that cannot
     answer a question contributes null and its row is omitted rather than
     reported as 0. The whole section hides while all three are zero: a reader
     who has never opened a recording is shown nothing, not three zeros. */
  const listenFacts = (() => {
    if (typeof AudioLibraryStore === 'undefined') return [];
    const num = (fn) => (typeof fn === 'function' ? Math.max(0, Math.floor(Number(fn()) || 0)) : null);
    const plays = num(AudioLibraryStore.getPlays && AudioLibraryStore.getPlays.bind(AudioLibraryStore));
    const done = num(AudioLibraryStore.getCompletions && AudioLibraryStore.getCompletions.bind(AudioLibraryStore));
    const savedCount = typeof AudioLibraryStore.saved === 'function'
      ? (AudioLibraryStore.saved() || []).length : null;
    if (!plays && !done && !savedCount) return [];
    return [
      ...(plays === null ? [] : [{ label: 'Recordings played', value: plays.toLocaleString('en-US') }]),
      ...(done === null ? [] : [{ label: 'Heard to the end', value: done.toLocaleString('en-US') }]),
      ...(savedCount === null ? [] : [{ label: 'Saved', value: savedCount.toLocaleString('en-US') }]),
    ];
  })();

  const libraryFacts = [
    { label: 'Notes', value: noteCount.toLocaleString('en-US') },
    { label: 'Highlights & Underlines', value: markCount.toLocaleString('en-US') },
    { label: 'Bookmarks', value: bookmarkCount.toLocaleString('en-US') },
    { label: 'Links', value: linkCount.toLocaleString('en-US') },
  ];

  /* BACKLOG [23] — reading milestones. ONE ENGINE since 2026-08-10: the rows
     are the FEATURED subset of utils/achievements.js, the same items the
     Milestones screen renders, so the two cannot disagree about what has been
     earned. Locked rows are still shown — a milestone you cannot see is not a
     goal — and since 2026-09-25 the nearest one leads as "Next". Unmemoized:
     this screen already subscribes to every contributing store, and it
     renders rarely enough that the snapshot walk is not worth a memo key. */
  const built = buildAchievements(collectAchievementSnapshot(readItems));
  const ms = built.featured || [];
  const msEarned = ms.filter((m) => m.earned);
  const next = ms.filter((m) => !m.earned)
    .reduce((best, m) => (!best || m.fraction > best.fraction ? m : best), /** @type {any} */ (null));

  /** Label / value rows on hairlines. @param {Array<{ label: string, value: string }>} rows */
  const facts = (rows) => (
    <dl className="prg-facts">
      {rows.map((r) => (
        <div key={r.label} className="prg-fact">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
  /** A section's small-capitals name, with an optional figure at the right. */
  const head = (id, name, meta) => (
    <div className="prg-section-head">
      <h2 id={id}>{name}</h2>
      {meta ? <span className="prg-section-meta">{meta}</span> : null}
    </div>
  );

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack: onBack, onSearch: onSearch, onHistory: onHistory, onSettings: onSettings, theme: theme, onThemeChange: onThemeChange })}
    >
      <div className="prg-screen">
        <header className="study-head">
          <h1 className="study-head-title">Progress</h1>
          <p className="study-head-sub">Your reading, journaling and study at a glance.</p>
        </header>

        <p className="prg-summary">{summary}</p>

        {wordDays ? (() => {
          const max = Math.max(0, ...wordDays.map((d) => d.words));
          const weekWords = wordDays.slice(-7).reduce((n, d) => n + d.words, 0);
          return (
            <div className="prg-days-wrap" role="group" aria-label="Words read, last 14 days">
              <span className="sr-only">{_fmtWords(weekWords)} words this week</span>
              <span className="sr-only">
                {wordDays.map((d) => `${d.date}: ${_fmtWords(d.words)} words`).join('; ')}
              </span>
              <div className="prg-days-head" aria-hidden="true">
                <span>Last 14 days</span>
                <span>{_fmtWords(weekWords)} {weekWords === 1 ? 'word' : 'words'} this week</span>
              </div>
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

        <section className="prg-section" aria-labelledby="prg-h-reading">
          {head('prg-h-reading', 'Reading')}
          {facts(readingFacts)}
          {!markAsReadOn ? (
            <div className="prg-note">Mark as Read is off — reading progress isn’t being recorded. You can turn it on in Settings.</div>
          ) : groups.length === 0 ? (
            <div className="prg-note">Loading your library…</div>
          ) : (
            groups.map((grp) => {
              const t = tallyGroup(readItems, grp);
              if (t.total === 0) return null;
              const w = wordStats && wordStats[grp.id];
              // Bar fill weighs WORDS once computed; item fraction until then.
              const frac = (w && w.wordsTotal > 0) ? w.wordsRead / w.wordsTotal : t.read / t.total;
              const pct = Math.min(100, Math.round(frac * 100));
              return (
                <div key={grp.id} className="prg-row">
                  <div className="prg-row-head">
                    <span className="prg-row-label">{grp.label}</span>
                    <span className="prg-row-tally">
                      {t.read.toLocaleString('en-US')} of {t.total.toLocaleString('en-US')}
                      {w && w.wordsTotal > 0 && (
                        <>{' · '}<span className="prg-words-note">{_fmtWords(w.wordsRead)} of {_fmtWords(w.wordsTotal)} words</span></>
                      )}
                    </span>
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
              <span className="prg-row-tally">{plural(historyCount, 'entry', 'entries')}</span>
            </div>
          )}
        </section>

        {ms.length > 0 && (
          <section className="prg-section" aria-labelledby="prg-h-milestones">
            {head('prg-h-milestones', 'Milestones', built.earned + ' of ' + built.total + ' reached')}
            {next && (
              <div className="prg-next">
                <div className="prg-row-head">
                  <span className="prg-row-label">Next: {next.label}</span>
                  <span className="prg-row-tally">{next.value.toLocaleString('en-US')} of {next.threshold.toLocaleString('en-US')}</span>
                </div>
                <div className="prg-next-bar" aria-hidden="true">
                  <div className="prg-next-fill" style={{ width: Math.round(next.fraction * 100) + '%' }} />
                </div>
              </div>
            )}
            <span className="sr-only">{msEarned.length} of {ms.length} reading milestones reached.</span>
            <div className="prg-milestones">
              {ms.map((m) => (
                <div key={m.key} className={'prg-milestone' + (m.earned ? ' is-unlocked' : '')}>
                  <span className="prg-milestone-mark" aria-hidden="true">{m.earned ? '✦' : '·'}</span>
                  <span className="prg-milestone-label">{m.label}</span>
                  <span className="sr-only">{m.earned ? ' — reached' : ' — not yet reached'}</span>
                </div>
              ))}
            </div>
            {/* These are the featured ten; the full journey (chapters, letters,
                streaks, listening, …) lives one tap away. */}
            {onOpenMilestones && (
              <button type="button" className="prg-milestones-all" onClick={onOpenMilestones}>
                View all milestones ›
              </button>
            )}
          </section>
        )}

        <section className="prg-section" aria-labelledby="prg-h-journal">
          {head('prg-h-journal', 'Journal')}
          {facts(journalFacts)}
        </section>

        {listenFacts.length > 0 && (
          <section className="prg-section prg-listening" aria-labelledby="prg-h-listening">
            {head('prg-h-listening', 'Listening')}
            {facts(listenFacts)}
          </section>
        )}

        <section className="prg-section" aria-labelledby="prg-h-library">
          {head('prg-h-library', 'Your library')}
          {facts(libraryFacts)}
        </section>

        <section className="prg-section" aria-labelledby="prg-h-annotated">
          {head('prg-h-annotated', 'Most annotated')}
          {topSources.length === 0 ? (
            <div className="prg-note">Nothing marked yet — press and hold any text while reading to highlight it.</div>
          ) : (
            topSources.map((s) => (
              <div key={s.key} className="prg-src-row">
                <div className="prg-src-main">
                  <span className="prg-src-title">{s.label}</span>
                  <span className="prg-src-col">{s.collection}</span>
                </div>
                <span className="prg-row-tally">{plural(s.count, 'mark', 'marks')}{s.per1k > 0 ? ' · ' + s.per1k + '/1k words' : ''}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </ScreenLayout>
  );
}
