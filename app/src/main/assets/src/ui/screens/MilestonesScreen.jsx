/* ═══════════════════════════════════════════════════════════════════════
   MilestonesScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The full achievements surface (owner directive 2026-08-09). Definitions
   and computation live in utils/achievements.js — this screen renders the
   categorized result and subscribes to every contributing store so counts
   move live. It persists nothing: earned-ness is a fact about the data.
   My Progress keeps its compact 10-row strip; this is the fleshed-out view
   reachable from Library. */

import { ACHIEVEMENT_STORE_NAMES, buildAchievements, collectAchievementSnapshot } from '../../utils/achievements.js';

/** Subscribe to one cross-bundle store by name (absent store = inert).
 *  RETURNS the version so the caller can key work on it. */
function useStoreVersion(name) {
  const store = /** @type {any} */ (globalThis)[name];
  return React.useSyncExternalStore(
    React.useCallback((cb) => (store && typeof store.subscribe === 'function') ? store.subscribe(cb) : () => {}, [store]),
    () => (store && typeof store.getVersion === 'function') ? store.getVersion() : 0
  );
}

export function MilestonesScreen({ onBack, backLabel = 'Library', readItems, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  // Fixed list → stable hook order. The joined versions are the memo key
  // below: every one of these stores can change an achievement, and none of
  // them can change one without bumping its version.
  const storeVersions = ACHIEVEMENT_STORE_NAMES.map(useStoreVersion).join('|');

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
  const pct = built.total ? Math.round((built.earned / built.total) * 100) : 0;

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
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}
    >
      <div className="milestones-screen">
        <div className="milestones-eyebrow">Your journey</div>
        <h1>Milestones</h1>
        <p className="milestones-intro">
          Every mark here reflects the reading, listening, and study record you keep on this device — no account or sign-up required.
        </p>

        <section className="milestones-summary" aria-label="Overall progress">
          <div className="milestones-summary-count">
            <strong>{built.earned}</strong>
            <span>of {built.total} reached</span>
          </div>
          <div className="milestones-summary-bar" role="img" aria-label={pct + '% of milestones reached'}>
            <div style={{ width: pct + '%' }} />
          </div>
        </section>

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
