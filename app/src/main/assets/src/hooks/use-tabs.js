/* ═══════════════════════════════════════════════════════════════════════
   useTabs — the per-tab reading-state machine (P6k, Commit A: the core)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Each tab owns its own reading state (screen, book/chapter, focus mode,
   search return-state, …). The active tab's fields are surfaced through
   `tabField(key)` so every `screen`/`setScreen`-style call site in App()
   keeps working unchanged. This hook is the STATE + accessor core; the
   tab open/close/switch OPERATIONS live in useTabActions (P6k Commit B) —
   they are a later composition point (they also consume useReadingDwell /
   useThumbnails / useScrollMemory), so they cannot live here, which runs
   near the very top of App().

   ┌─ CRITICAL INVARIANT 1 — cached per-key setter identity ───────────────┐
   │ `tabField('X')[1]` MUST return the SAME function instance for key X   │
   │ on every render, for the component's whole lifetime. A fresh setter   │
   │ each render churns the prop identity of every tab-state-consuming     │
   │ child → React tears down and rebuilds those subtrees (cascading       │
   │ re-mounts). The three-layer mechanism that guarantees it:             │
   │   1. updateActiveTab — a useCallback([activeTabIdx]); its identity    │
   │      DOES change when the active tab changes.                         │
   │   2. _uatRef — a useRefMirror of updateActiveTab; a stable ref whose  │
   │      .current always holds the latest updateActiveTab.                │
   │   3. _tabSetters — a useRef({}) cache keyed by field name. Each       │
   │      per-key setter closes over _uatRef (stable) + key (constant), so │
   │      the setter instance itself never changes, while still calling    │
   │      the current updateActiveTab via _uatRef.current.                 │
   │ The co-located stability probe (a dep-less useEffect) console.errors  │
   │ the moment any cached setter identity changes — the smoke harness     │
   │ monitors console.error, so an invariant-1 regression fails smoke.     │
   └───────────────────────────────────────────────────────────────────────┘

   OWNS:
     - DEFAULT_TAB              the 24-field tab shape (module const, also
                                  returned for the P6k Commit-A→B window —
                                  useTabActions imports it directly once B
                                  lands; App() drops it from the destructure)
     - tabs / activeTabIdx      the tab array + active index (useState)
     - activeTab                derived: tabs[activeTabIdx] || tabs[0] —
                                  the SOLE accessor; nothing reads tabs[idx]
     - updateActiveTab          patch-or-fn updater for the active tab
     - tabField(key)            → [activeTab[key], cachedStableSetter]
     - the stability probe      invariant-1 instrumentation

   DOES NOT OWN:
     - tab open/close/switch operations + the tab-UI state
       (tabsOverviewOpen, …) — useTabActions (P6k Commit B)
     - the vot-state PERSIST effect — stays in App(), becomes
       usePersistedState (P6k+1); it reads tabs/activeTabIdx among 8 deps
     - the per-screen scroll memory inside each tab's scrollPositions
       field — written by useScrollMemory (P6e) via updateActiveTab

   PARAMS:
     saved — the restored vot-state from useSavedState (P6a). CONSTRUCTOR-
       STYLE: consumed ONLY by the two useState lazy initializers, which
       run once on mount. Changes to `saved` after mount are ignored — do
       NOT add it to any dependency array.

   RETURNS: { DEFAULT_TAB, tabField, activeTab, tabs, activeTabIdx,
              setTabs, setActiveTabIdx, updateActiveTab }
     setTabs / setActiveTabIdx are returned because the still-in-App()
     management functions need them in the Commit-A→B window; after
     Commit B they move into useTabActions and App() stops destructuring
     setTabs (the Commit-B diff review must confirm that drop).

   STORAGE: none directly — tabs/activeTabIdx ride along in the vot-state
            persistence owned by usePersistedState (P6k+1).

   WINDOW: none.
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';

export const DEFAULT_TAB = {
  screen: 'home',
  bookId: null, chapterNum: null, letterId: null,
  studyId: null, studyChapterId: null,
  fromStudies: false, genreId: null,
  mode: 'pdf', showStudy: true,
  surpriseAnchor: null,
  fromLetterStack: [],
  titleFocusHidden: false, headingsFocusHidden: false,
  fromMatthewCh: null, fromWtlb: null, fromSearch: false,
  searchQuery: '', searchOrigin: null, searchScope: null, searchContext: null,
  navOrigin: null,
  gardenPage: 1,
  scrollPositions: {} // per-screen scroll memory: { [screenName]: px }
};

/**
 * Tab-state container hook (P6k-A). Owns the tabs[] array + activeTabIdx
 * cursor + the tabField factory that returns the [value, setter] tuple
 * for any tab-scoped key. Tab-state operations (open/close/switch) live
 * in useTabActions (P6k-B); only the state primitives live here.
 *
 * tabField setter identity is a HARD INVARIANT — re-renders with stable
 * setter identity across renders keep child components from cascading
 * re-mounts. A probe effect verifies the contract on every render and
 * console.errors if violated (smoke harness watches console.error).
 *
 * @param {{ saved: import('./use-saved-state.js').SavedState }} args
 * @returns {{
 *   DEFAULT_TAB: any,
 *   tabField: (key: string) => any[],
 *   activeTab: any,
 *   tabs: any[],
 *   activeTabIdx: number,
 *   setTabs: (updater: any) => void,
 *   setActiveTabIdx: (updater: any) => void,
 *   updateActiveTab: (patchOrFn: any) => void
 * }}
 */
export function useTabs({ saved }) {
  const [tabs, setTabs] = React.useState(() => {
    if (Array.isArray(saved.tabs) && saved.tabs.length > 0) {
      return saved.tabs.map((t) => ({ ...DEFAULT_TAB, ...t }));
    }
    // Migration: seed tab 0 from legacy single-screen state
    return [{
      ...DEFAULT_TAB,
      screen: saved.screen || 'home',
      bookId: saved.bookId || null,
      chapterNum: saved.chapterNum != null ? saved.chapterNum : null,
      letterId: saved.letterId || null,
      studyId: saved.studyId || null,
      studyChapterId: saved.studyChapterId || null,
      fromStudies: saved.fromStudies || false,
      genreId: saved.genreId || null,
      mode: saved.mode || 'pdf',
      showStudy: saved.showStudy !== false,
      gardenPage: saved.gardenPage || 1
    }];
  });
  const [activeTabIdx, setActiveTabIdx] = React.useState(() => {
    const idx = typeof saved.activeTabIdx === 'number' ? saved.activeTabIdx : 0;
    return Math.max(0, Math.min(idx, 998));
  });
  const activeTab = tabs[activeTabIdx] || tabs[0];
  const updateActiveTab = React.useCallback((patchOrFn) => {
    setTabs((prev) => prev.map((t, i) => {
      if (i !== activeTabIdx) return t;
      const patch = typeof patchOrFn === 'function' ? patchOrFn(t) : patchOrFn;
      return { ...t, ...patch };
    }));
  }, [activeTabIdx]);
  const _uatRef = useRefMirror(updateActiveTab);
  const _tabSetters = React.useRef({});
  const tabField = (key) => {
    if (!_tabSetters.current[key]) {
      _tabSetters.current[key] = (val) => _uatRef.current((cur) => ({
        [key]: typeof val === 'function' ? val(cur[key]) : val
      }));
    }
    return [activeTab[key], _tabSetters.current[key]];
  };
  // tabField identity stability probe — foundational instrumentation that
  // surfaces a contract violation immediately via console.error (which the
  // smoke harness already monitors). The CONTRACT: tabField('X')[1] returns
  // the SAME function instance for the same key across every render.
  // Violating it causes cascading re-mounts in every tab-state-consuming
  // child component (the props change identity each render → React tears
  // down and rebuilds the subtree). The cache lives in _tabSetters.current.
  // If a future refactor accidentally returns a fresh setter each render,
  // this probe catches it within a single render cycle instead of letting
  // it land silently.
  const _tabSettersPrevRef = React.useRef({});
  React.useEffect(() => {
    var cur = _tabSetters.current;
    var prev = _tabSettersPrevRef.current;
    for (var key in cur) {
      if (prev[key] && prev[key] !== cur[key]) {
        console.error('[tabField stability] setter identity changed for key=' + key +
          ' across renders — this breaks child component stability and triggers cascading re-mounts.');
      }
      prev[key] = cur[key];
    }
  });

  return {
    DEFAULT_TAB, tabField, activeTab, tabs, activeTabIdx,
    setTabs, setActiveTabIdx, updateActiveTab,
  };
}
