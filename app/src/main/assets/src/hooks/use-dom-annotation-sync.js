/* ═══════════════════════════════════════════════════════════════════════
   useDomAnnotationSync — re-apply the imperative annotation DOM layer (P11)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   The annotation layers (highlights, links, bookmarks, note icons, the
   active-note tint) are painted onto the rendered DOM imperatively AFTER
   React commits, via the renderer-cluster apply* functions (bundle-c
   globals). This hook owns the two effects that drive that pass — extracted
   verbatim from App() so the composition root stays under its line budget.

   RE-APPLY TRIGGER (W7.3): the apply pass re-runs whenever any of the four
   stores it paints from changes. Each store exposes the React 18
   useSyncExternalStore contract (subscribe + getVersion) and calls _bump()
   from its own mutation methods, so subscribing here means a mutation
   anywhere — add a highlight, recolor a note, drop a link, toggle a bookmark
   — re-runs the apply pass with no manual signal. This REPLACES the old
   hlTick / window.__bumpHlTick cache-bust: the stores are now the single
   source of truth for "annotations changed," and consumers no longer poke a
   global counter after every mutation.

   OWNS:
     1. The post-render re-apply effect (deps: the four store versions +
        screen + letterId). Runs the five apply* passes inside a 0ms timeout
        (so it fires after React's commit), each guarded so one layer's
        failure can't trip the ErrorBoundary. Also takes two navHandoff slots:
          - 'pendingOpenNote'   → open the NoteSheet for a tapped Notes-index row
          - 'pendingScrollHlKey' → scroll a Library-opened mark into view
     2. The active-note toggle effect (deps: noteSheetTarget). Sets
        window.__activeNoteGroup + re-runs applyActiveNoteState so the open
        note's anchored text lights up (and reverts on close). Store-driven
        re-applies of the active tint are already covered by effect #1, which
        also calls applyActiveNoteState on every store change — so this effect
        only needs to fire when the OPEN note itself changes.

   DOES NOT OWN:
     - screen / letterId / noteSheetTarget — App-local nav + sheet state, in.
     - The apply* functions themselves — renderer cluster (bundle-c globals).
     - The stores — global singletons (bundle-b), subscribed to here.

   PARAMS:
     screen, letterId   nav keys; a screen/letter change re-applies.
     noteSheetTarget    the open note ({ groupId } | null) for the active toggle.
     setNoteSheetTarget useState setter (from useSheetOrchestration) used to
                        open the NoteSheet when the 'pendingOpenNote' slot is taken.

   RETURNS: nothing — pure effects.

   NAV HAND-OFF (navHandoff, see utils/nav-handoff.js) — taken (read+cleared):
     - 'pendingOpenNote'     groupId stashed by the Notes index on tap-through.
     - 'pendingScrollHlKey'  hl-key stashed by Library to scroll-to on open.
   WINDOW:
     - __activeNoteGroup     written so the renderer knows which group is lit.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   screen: string,
 *   letterId: string | null,
 *   noteSheetTarget: { groupId: string } | null,
 *   setNoteSheetTarget: (v: any) => void
 * }} args
 * @returns {void}
 */
export function useDomAnnotationSync({ screen, letterId, noteSheetTarget, setNoteSheetTarget }) {
  // Reactive versions of the four stores the DOM layer paints from. Any
  // store's _bump() (fired by its own mutation methods) changes its version,
  // re-renders App, and re-runs the apply pass below — the W7.3 replacement
  // for the old hlTick/__bumpHlTick cache-bust. The typeof guards keep the
  // hook safe if a store global isn't defined yet (cold boot / test isolation).
  const annV = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof AnnotationStore !== 'undefined') ? AnnotationStore.subscribe(cb) : () => {}, []),
    () => (typeof AnnotationStore !== 'undefined') ? AnnotationStore.getVersion() : 0
  );
  const noteV = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof NoteStore !== 'undefined') ? NoteStore.subscribe(cb) : () => {}, []),
    () => (typeof NoteStore !== 'undefined') ? NoteStore.getVersion() : 0
  );
  const linkV = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof LinkStore !== 'undefined') ? LinkStore.subscribe(cb) : () => {}, []),
    () => (typeof LinkStore !== 'undefined') ? LinkStore.getVersion() : 0
  );
  const bkmV = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof BookmarkStore !== 'undefined') ? BookmarkStore.subscribe(cb) : () => {}, []),
    () => (typeof BookmarkStore !== 'undefined') ? BookmarkStore.getVersion() : 0
  );

  // Lazy-corpus readiness (bundle-a-bible / matthew / vot). A reading screen
  // renders a "Loading…" placeholder — NOT its [data-hl-key] verse DOM — until
  // its corpus loader resolves (see screen-routes.jsx _corpusView). On a DIRECT
  // entry to a chapter (cold-boot saved-tab resume, History, a Library/search
  // tap) that resolve lands AFTER the store-driven apply pass already ran over
  // the empty placeholder, and NO store mutation follows to re-trigger it — so
  // the marks/notes/icons stay unpainted until the user flips to an adjacent
  // page (which changes screen/letterId and re-applies). Subscribing to each
  // corpus version (same useSyncExternalStore contract as useLazyBundles) puts
  // corpus readiness in the apply deps below, so the pass re-runs the instant
  // the verses mount. The hub screens pre-load the corpus, which MASKS this on
  // a fast device — but a slow device loses that race; this fixes it at the
  // root. (The pendingScrollHlKey scroll in the same effect benefits too: a
  // Library/link jump now scrolls to its mark once the corpus DOM exists.)
  const bibleCorpusV = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__bibleCorpus !== 'undefined') ? window.__bibleCorpus.getVersion() : 0
  );
  const matthewCorpusV = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__matthewCorpus !== 'undefined') ? window.__matthewCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__matthewCorpus !== 'undefined') ? window.__matthewCorpus.getVersion() : 0
  );
  const votCorpusV = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__votCorpus !== 'undefined') ? window.__votCorpus.getVersion() : 0
  );

  React.useEffect(() => {
    const t = setTimeout(() => {
      // Each annotation layer is isolated: this pipeline mutates the DOM
      // imperatively AFTER React renders, so rapid prev/next on a heavily
      // annotated page can leave stale/detached nodes mid-pass. A throw
      // here would propagate to React and trip the ErrorBoundary, forcing
      // a full reload. Degrade gracefully instead — a missed icon recovers
      // on the next store mutation / re-render; a crash does not.
      try { applyDOMHighlights(); } catch (e) { console.error('applyDOMHighlights failed', e); }
      try { applyDOMLinks(); } catch (e) { console.error('applyDOMLinks failed', e); }
      try { applyDOMBookmarks(); } catch (e) { console.error('applyDOMBookmarks failed', e); }
      try { applyNoteIcons(); } catch (e) { console.error('applyNoteIcons failed', e); }
      try { applyActiveNoteState(); } catch (e) { console.error('applyActiveNoteState failed', e); }
      // If we navigated here from the Notes index by tapping a row, the
      // groupId of the note to open was stashed on the window. Consume it
      // and open the NoteSheet now that the source page is rendered.
      const gid = window.navHandoff.take('pendingOpenNote');
      if (gid) {
        // Defer one more tick so DOM marks are in place for the active-state
        setTimeout(() => {
          if (NoteStore.get(gid)) setNoteSheetTarget({ groupId: gid, startInEditMode: false });
        }, 60);
      }
      // Opened from Library (bookmark/note/highlight/underline) → jump
      // straight to that mark's block. Instant (no smooth behavior) so the
      // page opens already at the position rather than animating there.
      const sk = window.navHandoff.take('pendingScrollHlKey');
      if (sk) {
        setTimeout(() => {
          try {
            const el = document.querySelector('[data-hl-key="' + sk.replace(/"/g, '\\"') + '"]');
            if (el) el.scrollIntoView({ block: 'center' });
          } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
        }, 70);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setNoteSheetTarget is a useState setter passed in as a param (identity-stable per React invariant; eslint can't trace it through the destructured hook-return at the call site).
  }, [annV, noteV, linkV, bkmV, screen, letterId, bibleCorpusV, matthewCorpusV, votCorpusV]);

  // Toggle .is-active on every mark/icon belonging to the open note's group.
  // Default state: notes show only the trailing 📝 icon (no tint, no ribbon).
  // When NoteSheet opens, the anchored text lights up; closing reverts.
  // Keyed on noteSheetTarget alone — store-driven re-applies are handled by
  // the apply pass above (which also calls applyActiveNoteState).
  React.useEffect(() => {
    window.__activeNoteGroup = noteSheetTarget ? noteSheetTarget.groupId : null;
    applyActiveNoteState();
  }, [noteSheetTarget]);
}
