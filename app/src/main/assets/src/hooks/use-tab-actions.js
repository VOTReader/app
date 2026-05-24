/* ═══════════════════════════════════════════════════════════════════════
   useTabActions — tab open/close/switch operations (P6k Commit B)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   The OPERATIONS on the tab state machine — the counterpart to useTabs
   (P6k Commit A), which owns the STATE. This is a LATE hook: it must be
   called after useReadingDwell (it needs cancelDwell) and useThumbnails
   (setTabThumbnails). useTabs runs near the top of App() to provide
   tabField; useTabActions runs ~480 lines later, once its cross-hook
   deps exist — which is why these operations are a separate hook, not
   part of useTabs. They receive their deps as plain params; no ref
   plumbing, no two-phase init.

   OWNS:
     - openNewTab / switchToTab / closeTab / closeOtherTabs /
       closeTabsToTheRight / closeAllTabs / deduplicateTabs
     - tabActionIdx        long-press target for TabActionSheet
     - disableTabsPromptOpen   the "disable tabs?" dialog gate (raised by
                                the closeTab 3-strike path)
     - clearAllStage       0/1/2 — the TabsOverview "Clear All Tabs"
                            three-tap confirm
     - lastTabCloseStrikes ref — 3-strike counter; the render resets it
                            on normal tab use, so the ref is RETURNED

   DOES NOT OWN:
     - tabs / activeTabIdx / setTabs / setActiveTabIdx — useTabs (Commit
       A); received here inside the `tabState` param.
     - DEFAULT_TAB — imported directly from use-tabs.js.
     - tabsOverviewOpen + goTabs — stay in App(). tabsOverviewOpen is
       consumed by useThumbnails (a param) which runs BEFORE this hook
       could be called, so it cannot live here; goTabs only touches
       App()-available values (tabsOverviewOpen, flushScrollToActiveTab,
       captureActiveTabThumbnail, settings.tabsEnabled) so it stays
       inline next to that state.
     - tabContentKey — module global from src/utils/tabs.js; bare name.

   PARAMS:
     tabState — the whole useTabs() return; tabs / activeTabIdx /
       setTabs / setActiveTabIdx are pulled from it.
     cancelDwell — useReadingDwell (P6f); switchToTab cancels an in-flight
       dwell timer BEFORE flipping tabs so a "90% read" commit can't land
       on the wrong (newly-active) tab.
     setTabThumbnails — useThumbnails (P6d); closeAllTabs clears them.

   RETURNS: { openNewTab, switchToTab, closeTab, closeOtherTabs,
              closeTabsToTheRight, closeAllTabs, deduplicateTabs,
              tabActionIdx, setTabActionIdx,
              disableTabsPromptOpen, setDisableTabsPromptOpen,
              clearAllStage, setClearAllStage, lastTabCloseStrikes }

   STORAGE: none.

   WINDOW: none.
   ═══════════════════════════════════════════════════════════════════════ */

import { DEFAULT_TAB } from './use-tabs.js';

const MAX_TABS = 999;

export function useTabActions({ tabState, cancelDwell, setTabThumbnails }) {
  const { tabs, activeTabIdx, setTabs, setActiveTabIdx } = tabState;

  const [tabActionIdx, setTabActionIdx] = React.useState(null); // long-press target
  const [disableTabsPromptOpen, setDisableTabsPromptOpen] = React.useState(false);
  const [clearAllStage, setClearAllStage] = React.useState(0); // 0 = idle, 1 = "Are You Sure?", 2 = confirmed
  const lastTabCloseStrikes = React.useRef(0); // 3-strike counter for last-tab close

  // All 7 useCallbacks below intentionally omit setters from their deps. Rationale
  // (one disable per site so the rule still catches new non-setter deps):
  //   setTabs / setActiveTabIdx     useState setters via tabState param (useTabs)
  //   setTabThumbnails              useState setter param (useThumbnails)
  //   setDisableTabsPromptOpen      useState setter local to this hook
  //   cancelDwell                   ref-only function (use-reading-dwell.js:103)
  //                                  — body operates on .current writes, stale
  //                                  identity is safe
  // useState-setter identity stability is a React invariant; ref-only functions
  // are stale-safe by inspection. Including them in deps would either no-op
  // (setters) or destroy useCallback's referential stability (cancelDwell).
  const openNewTab = React.useCallback(() => {
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      const next = [...prev, { ...DEFAULT_TAB }];
      setActiveTabIdx(next.length - 1);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters from tabState (useState origin); see header above.
  }, []);
  const switchToTab = React.useCallback((idx) => {
    // Cancel any in-flight dwell timer BEFORE flipping tabs — otherwise
    // the previous tab's "read 90%, fire commit" timer would land on the
    // newly-active tab and mark the wrong letter as read.
    cancelDwell();
    setActiveTabIdx((_prev) => {
      if (idx < 0) return 0;
      return Math.min(idx, tabs.length - 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setActiveTabIdx is a useState setter (stable); cancelDwell is a ref-only function (stale-safe); see header above.
  }, [tabs.length]);
  const closeTab = React.useCallback((idx) => {
    setTabs((prev) => {
      if (prev.length <= 1) {
        // 3-strike: user keeps trying to close their last tab → offer to disable tabs entirely
        lastTabCloseStrikes.current += 1;
        if (lastTabCloseStrikes.current >= 3) {
          setDisableTabsPromptOpen(true);
          lastTabCloseStrikes.current = 0;
        }
        // Reset the last tab to home rather than actually closing it
        const reset = { ...DEFAULT_TAB };
        setActiveTabIdx(0);
        return [reset];
      }
      // Closing a non-last tab — reset the strike counter (user is using tabs normally)
      lastTabCloseStrikes.current = 0;
      const next = prev.filter((_, i) => i !== idx);
      // Keep activeTabIdx pointing at a valid tab
      setActiveTabIdx((prevIdx) => {
        if (idx < prevIdx) return prevIdx - 1; // shifted left
        if (idx === prevIdx) return Math.max(0, Math.min(prevIdx, next.length - 1));
        return prevIdx; // closed tab was to the right; idx unchanged
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters from tabState (useState origin); see header above.
  }, []);
  const closeOtherTabs = React.useCallback((keepIdx) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const kept = prev[keepIdx];
      if (!kept) return prev;
      setActiveTabIdx(0);
      return [kept];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters from tabState (useState origin); see header above.
  }, []);
  const closeTabsToTheRight = React.useCallback((keepIdx) => {
    setTabs((prev) => {
      if (keepIdx >= prev.length - 1) return prev;
      setActiveTabIdx((cur) => Math.min(cur, keepIdx));
      return prev.slice(0, keepIdx + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters from tabState (useState origin); see header above.
  }, []);
  const closeAllTabs = React.useCallback(() => {
    setTabs([{ ...DEFAULT_TAB }]);
    setActiveTabIdx(0);
    setTabThumbnails({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters from tabState + setTabThumbnails param (all useState origin); see header above.
  }, []);
  // Merge duplicates: if two tabs have the same content signature, drop later duplicates
  const deduplicateTabs = React.useCallback(() => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const seen = new Set();
      const keep = [];
      let activeStillInKept = false;
      let newActiveIdx = 0;
      prev.forEach((t, i) => {
        const k = tabContentKey(t);
        if (!seen.has(k)) {
          seen.add(k);
          if (i === activeTabIdx) {activeStillInKept = true;newActiveIdx = keep.length;}
          keep.push(t);
        } else if (i === activeTabIdx && !activeStillInKept) {
          // Active tab is a duplicate — point at the first kept instance
          let idx = keep.findIndex((x) => tabContentKey(x) === k);
          if (idx >= 0) newActiveIdx = idx;
        }
      });
      setActiveTabIdx(newActiveIdx);
      return keep;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters from tabState (useState origin); see header above.
  }, [activeTabIdx]);

  return {
    openNewTab, switchToTab, closeTab, closeOtherTabs,
    closeTabsToTheRight, closeAllTabs, deduplicateTabs,
    tabActionIdx, setTabActionIdx,
    disableTabsPromptOpen, setDisableTabsPromptOpen,
    clearAllStage, setClearAllStage, lastTabCloseStrikes,
    MAX_TABS,  // re-exported for the TabsOverview render (the cap badge)
  };
}
