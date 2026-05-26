# Bundle-a.js lazy-load — design plan (post-Q7)

**Status:** ANALYSIS COMPLETE — implementation deferred.

This document records the prerequisite analysis for Q8 (bundle-a lazy-load)
done after Q7's useSyncExternalStore migration. The analysis surfaces
enough cross-cutting concerns that the implementation should be its own
discrete sprint with smoke tests at each step, not rushed in alongside
other quality phases.

---

## Why lazy-load is the biggest UX win

Current bundle-a.js cold-boot cost on every WebView mount:

| File | Size | Cumulative |
|---|---|---|
| react.min.js + react-dom.min.js + html2canvas.min.js | 341 KB | 341 KB |
| `src/data/books.js` (NKJV, all 66 books) | **6.9 MB** | 7.3 MB |
| `src/data/books-restored.js` (sacred-names variants) | 277 KB | 7.6 MB |
| `src/data/matthew.js` (Matthew Study Bible) | 618 KB | 8.2 MB |
| `src/data/matthew-plain.js` | 229 KB | 8.4 MB |
| `src/data/matthew-nkjv.js` | 54 KB | 8.5 MB |
| 9 Volume / WTLB / letters files | ~2.6 MB | 11.1 MB |
| the-blessed / holy-days / hidden-manna | 85 KB | 11.2 MB |
| flexsearch + search-data + search | 125 KB | **11.3 MB** |

Mid-range Android WebView: ~3-5 seconds of parse time before any UI paints.
`books.js` alone is **60% of the bundle**. Splitting it off is the single
highest-leverage performance win available.

## The hard part: every screen touches BOOKS

`grep -rEn "BOOKS\[|_allBooks\[|MATTHEW\.chapters"` across `src/` surfaces:

- **ScripturesHome** — renders chapter counts per genre on the Scriptures
  landing screen. `g.books.reduce((s, b) => s + (BOOKS[b.id]?.chapters.length || 0), 0)`.
- **SettingsScreen** — translation toggle list reads `BOOKS["matthew-plain"]`,
  `BOOKS["1corinthians"]`, etc. for chapter counts.
- **handleScriptureSelect** (App-local nav) — `if (BOOKS[id]) { setBookId(id);
  if (BOOKS[id].chapters.length === 1) { ... } else { ... } }`.
- **useAndroidBack** — back-nav depends on `BOOKS[bid]?.chapters.length` to
  decide whether single-chapter books bypass `bible-idx`.
- **useBibleStudies** — Matthew chain uses `MATTHEW.chapters[MATTHEW.chapters.length - 1].num`.
- **useNavHistoryTracking** — records `book.chapters.find(...).title` for
  history entries.
- **useNavigateToLink** — resolves Bible refs via `BOOKS[endpoint.bookId]`.
- **useSearch** — Bible result handling looks up `BOOKS[bookId]` to validate.
- **useSurprise** — `MATTHEW.chapters.map((ch) => ({ ... }))` for random verse.
- **MatthewChapterView** — chain-aware boundary uses `MATTHEW.chapters`.

So even the *first paint of the Home screen* needs BOOKS (because the
Scriptures tile shows chapter counts). Without BOOKS in the critical path,
the Home screen would render with placeholder "—" counts that fill in once
the corpus loads.

## Implementation strategy (recommended)

**Phase A — build pipeline split:**

1. `tools/build.py` emits a SECOND file `bundle-a-bible.js` containing
   `books.js + books-restored.js + matthew.js + matthew-plain.js +
   matthew-nkjv.js` (the 5 Bible corpus files, ~7.5 MB).
2. `bundle-a.js` keeps everything else (vendor, search infra, VOT
   collections, ~3.8 MB).

**Phase B — async load with placeholder counts:**

Two sub-options for execution; pick one before implementing.

**B1 — Defer, no access changes (the safe MVP):**
- Both scripts loaded with `<script defer>` so they download in parallel.
- Browser executes in document order; BOOKS is defined before React mounts.
- Cold-boot wall time: shorter (parallel download), but parse cost
  unchanged.
- Effort: ~1 hour (build.py change + index.html script tag change).
- Risk: very low (no access pattern changes).
- Win: ~40% reduction in time-to-first-paint on networks where transfer
  dominates. NO win on parse-bound mid-range Android.

**B2 — True lazy with skeleton state (the bigger win):**
- `<script defer src="dist/bundle-a.js">` loads first.
- `bundle-a-bible.js` is NOT in index.html — it's injected by a
  `window.__loadBibleCorpus()` helper.
- ScripturesHome / SettingsScreen render with skeleton counts (e.g.
  "—" or animated placeholder) while BOOKS is undefined.
- First navigation toward Bible content triggers `__loadBibleCorpus()`;
  the screen shows a "Loading Bible..." centered card until the corpus
  loads + `setHasBible(true)` re-renders.
- Effort: ~1 day (every BOOKS access site needs a `typeof BOOKS !==
  'undefined'` guard + skeleton render).
- Risk: medium (silent regression if any access site misses the guard).
- Win: cold-boot drops from 11.3 MB → 3.8 MB parse + ~2 sec saved on
  mid-range Android.

**Phase C — search index handling:**

`search-data.js` (42 KB) is named-passages / synonyms / stop-words —
NO verse text. Search index lookup still works without BOOKS loaded, but
clicking a Bible search result navigates to a verse that needs BOOKS to
render. So search results pre-trigger `__loadBibleCorpus()` if the
selected result is a Bible reference.

Keep `search-data.js` + `flexsearch.min.js` + `search.js` in the critical
path (the user's directive: "search is a core feature").

**Phase D (optional) — per-Volume splits:**

After Phase B succeeds, splits like `volume-seven.js` (708 KB) out of
the critical path. Risk goes up because every Volume index/letter
screen would need its own load guard. Defer until usage data shows
which volumes users actually open.

## Why this is deferred

The recommended implementation is option B2 with phases A+B+C. That's a
day of careful work with smoke tests at every access site. Doing it
properly requires:

- A live preview cold-boot before/after timing measurement to validate
  the win.
- A skeleton-state design that doesn't look broken (vs the current
  always-populated tiles).
- A "Bible is loading" UI affordance distinct from the existing loading
  spinners (which are scoped to async data like Bible Studies).
- Smoke walks through every BOOKS access site: Home → Scriptures →
  every genre → every book → first chapter; Settings → translation
  toggle; History → Bible chapter entry; Search → Bible result;
  Surprise Me → random verse.

The smoke matrix alone is ~30 screens. This is a phase, not a commit.

## Exit criteria

When this work lands:
- `dist/bundle-a.js` is < 4 MB.
- Cold-boot time to first paint is measurable improvement (target: < 2 sec
  on mid-range Android).
- All Bible access sites have either a guard OR await the loader.
- Smoke walk through every screen renders identically post-load.
- The Bible-loading UI affordance is consistent with the app's existing
  loading patterns (Bible Studies pattern is the precedent).

When all of the above hold, replace this document with a HISTORY.md entry
and delete it.
