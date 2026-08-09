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

/** Subscribe to one cross-bundle store by name (absent store = inert). */
function useStoreVersion(name) {
  const store = /** @type {any} */ (globalThis)[name];
  React.useSyncExternalStore(
    React.useCallback((cb) => (store && typeof store.subscribe === 'function') ? store.subscribe(cb) : () => {}, [store]),
    () => (store && typeof store.getVersion === 'function') ? store.getVersion() : 0
  );
}

export function MilestonesScreen({ onBack, backLabel = 'Library', readItems, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  ACHIEVEMENT_STORE_NAMES.forEach(useStoreVersion);   // fixed list — stable hook order

  const built = buildAchievements(collectAchievementSnapshot(readItems));
  const pct = built.total ? Math.round((built.earned / built.total) * 100) : 0;

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

        {built.categories.map((cat) => (
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
