/* ═══════════════════════════════════════════════════════════════════════
   MilestonesScreen — Cluster G (esbuild bundle-g.js, lazy)
   ═══════════════════════════════════════════════════════════════════════
   The full achievements surface (owner directive 2026-08-09). Definitions
   and computation live in utils/achievements.js — this screen renders the
   categorized result and subscribes to every contributing store so counts
   move live. It persists nothing: earned-ness is a fact about the data.
   My Progress keeps its compact 10-row strip; this is the fleshed-out view
   reachable from Library.

   Lazy since 2026-09-22 (landing 23): a reader opens this on purpose, never
   on the way to a chapter. Like the other bundle-g screens it reads the laws
   it shares with bundle-d — ACHIEVEMENT_STORE_NAMES, buildAchievements,
   collectAchievementSnapshot, scrollBehavior — from the window slots
   _entry-d.js fills, because a second bundled copy of achievements.js would
   be two module states of one table. */

import { useStoreVersionByName } from '../../hooks/use-store-version.js';


export function MilestonesScreen({ onBack, backLabel = 'Library', readItems, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  // Fixed list → stable hook order. The joined versions are the memo key
  // below: every one of these stores can change an achievement, and none of
  // them can change one without bumping its version.
  const storeVersions = ACHIEVEMENT_STORE_NAMES.map(useStoreVersionByName).join('|');

  // Rebuilding all ~84 achievements means re-reading ten stores and walking
  // the whole readItems map. Unmemoized, that ran on EVERY render — including
  // the ones caused by this screen's own filter toggle, and by any one of the
  // ten stores ticking for a reason no achievement depends on. The inputs are
  // exactly the store versions and readItems, so those are the deps.
  const built = React.useMemo(
    () => buildAchievements(collectAchievementSnapshot(readItems)),
    // storeVersions reads as "unnecessary" to the linter because the snapshot
    // reaches the stores as cross-bundle GLOBALS, not as values closed over
    // here — but it is the load-bearing dep: without it this never recomputes
    // when a store changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [storeVersions, readItems]
  );
  /* The nearest milestone leads (the redesign, 2026-09-25, Codex mockup r5
     take 1): of everything not yet reached, the one with the most of its way
     covered, and on a tie the one with the least left to go (so a new reader
     is pointed at "First reading finished, 0 of 1", not at 10,000 words). It
     replaced a gold-bordered box whose bar said only what the header's
     "4 of 89 reached" already says. Progress picks its "Next" the same way. */
  const next = React.useMemo(() => built.categories
    .flatMap((cat) => cat.items)
    .filter((item) => !item.earned)
    .reduce((best, item) => (!best || item.fraction > best.fraction
      || (item.fraction === best.fraction && item.threshold - item.value < best.threshold - best.value) ? item : best),
    /** @type {any} */ (null)),
  [built]);

  /* "Hide reached" (2026-08-09). 84 rows is a long scroll once most of the
     early tiers are earned; hiding them turns the screen into what is LEFT.
     A category that empties out disappears with its jump chip — an empty
     heading would read as a category with nothing in it. */
  const [hideReached, setHideReached] = React.useState(false);
  const categories = React.useMemo(() => (
    hideReached
      ? built.categories
        .map((cat) => ({ ...cat, items: cat.items.filter((item) => !item.earned) }))
        .filter((cat) => cat.items.length > 0)
      : built.categories
  ), [built, hideReached]);

  /** Jump to a category heading. Same scrollIntoView the index screens use. */
  const jumpTo = (id) => {
    const el = (typeof document !== 'undefined') ? document.getElementById('ms-cat-' + id) : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  };

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}
    >
      <div className="milestones-screen">
        <header className="study-head">
          <h1 className="study-head-title">Milestones</h1>
          <span className="study-head-count milestones-summary-count"><strong>{built.earned}</strong> of {built.total} reached</span>
          <p className="study-head-sub">
            Every mark here reflects the reading, listening, and study record you keep on this device — no account or sign-up required.
          </p>
        </header>

        {next && (
          <section className="milestones-next" aria-label="The nearest milestone">
            <div className="milestones-next-head">
              <span className="milestones-next-label">Next: {next.label}</span>
              <span className="milestones-next-tally">{next.value.toLocaleString('en-US')} of {next.threshold.toLocaleString('en-US')}</span>
            </div>
            <div className="milestones-next-bar" aria-hidden="true">
              <div style={{ width: Math.round(next.fraction * 100) + '%' }} />
            </div>
          </section>
        )}

        <div className="milestones-controls">
          <button
            type="button"
            className={'milestones-filter' + (hideReached ? ' is-on' : '')}
            aria-pressed={hideReached}
            onClick={() => setHideReached((v) => !v)}
          >Hide reached</button>
          <span className="milestones-controls-note" aria-hidden="true">
            {hideReached ? `${built.total - built.earned} still to reach` : `${built.total} milestones`}
          </span>
        </div>

        {categories.length > 1 && (
          <nav className="milestones-jump" aria-label="Jump to a category">
            {categories.map((cat) => (
              <button key={cat.id} type="button" className="milestones-jump-chip" onClick={() => jumpTo(cat.id)}>
                {cat.label}
              </button>
            ))}
          </nav>
        )}

        {categories.length === 0 && (
          <p className="milestones-allclear">Every milestone here has been reached.</p>
        )}

        {categories.map((cat) => (
          <section key={cat.id} className="milestones-cat" aria-labelledby={'ms-cat-' + cat.id}>
            <div className="milestones-cat-head">
              <div>
                <span>{cat.eyebrow}</span>
                <h2 id={'ms-cat-' + cat.id}>{cat.label}</h2>
              </div>
              <strong>{cat.earned}/{cat.total}</strong>
            </div>
            <ol className="milestones-list">
              {cat.items.map((item) => (
                <li key={item.key} className={item.earned ? 'is-earned' : ''}>
                  <span className="milestones-mark" aria-hidden="true">{item.earned ? '✦' : '·'}</span>
                  <span className="milestones-copy">
                    <span className="milestones-label">{item.label}</span>
                    {!item.earned && (
                      <span className="milestones-bar" aria-hidden="true">
                        <span style={{ width: Math.round(item.fraction * 100) + '%' }} />
                      </span>
                    )}
                  </span>
                  <span className={'milestones-value' + (item.earned ? ' is-earned' : '')}>
                    {item.earned ? 'Reached' : item.value.toLocaleString('en-US') + ' / ' + item.threshold.toLocaleString('en-US')}
                  </span>
                  <span className="sr-only">{item.earned ? ' — reached' : ' — ' + item.value + ' of ' + item.threshold}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </ScreenLayout>
  );
}
