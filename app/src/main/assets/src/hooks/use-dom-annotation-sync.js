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
        failure can't trip the ErrorBoundary. Also reads two navHandoff slots:
          - 'pendingOpenNote'   → open the NoteSheet for a tapped Notes-index row
          - 'pendingScrollHlKey' → scroll a Library-opened mark into view (kept
            until the mark is found, so it survives a corpus still loading)
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

   NAV HAND-OFF (navHandoff, see utils/nav-handoff.js):
     - 'pendingOpenNote'     groupId stashed by the Notes index on tap-through;
                             taken (read+cleared) on the next pass.
     - 'pendingScrollHlKey'  hl-key stashed by Library to scroll-to on open;
                             peeked, and cleared once its mark is scrolled to
                             or the reader leaves the page it was awaited on.
   WINDOW:
     - __activeNoteGroup     written so the renderer knows which group is lit.
   ═══════════════════════════════════════════════════════════════════════ */

import { remapCorpusMarks } from '../stores/corpus-mark-remap.js';
import { AnnotationStore } from '../stores/annotation-store.js';
import { BookmarkStore } from '../stores/bookmark-store.js';
import { LinkStore } from '../stores/link-store.js';
import { NoteStore } from '../stores/note-store.js';
import { NotebookStore } from '../stores/notebook-store.js';

/**
 * Scroll a Library jump's mark into view and consume its hand-off slot
 * (navHandoff 'pendingScrollHlKey'), or keep the slot waiting for the mark
 * (sweep v010). navigateToLink stashes the key and navigates at once for every
 * non-Bible target, so when the destination's corpus is still loading (Matthew
 * or a study on a cold start) the first apply pass runs over the route's
 * "Loading…" placeholder. The old code took the slot on
 * that pass, the query found nothing, and the re-run the corpus load triggers
 * found the slot empty: the page opened unscrolled. Now the slot is cleared
 * only once the mark is found and scrolled to.
 *
 * Bound: a miss records the place it happened on; once the reader is on
 * another place (they left before the mark ever appeared) the key is dropped
 * instead of jumping a later page. goHome still clears the slot outright.
 *
 * @param {string} sk  the key the scheduling pass peeked
 * @param {{ current: string }} placeRef  the committed placeKey
 * @param {{ current: { key: string, place: string } | null }} missRef  the place this key first missed on
 * @returns {void}
 */
function scrollToPendingMark(sk, placeRef, missRef) {
  // Already scrolled by an earlier pass, cleared by goHome, or replaced by a
  // newer jump: this timer's key is no longer the pending one.
  if (window.navHandoff.peek('pendingScrollHlKey') !== sk) return;
  const here = placeRef.current;
  const miss = missRef.current;
  if (miss && miss.key === sk && miss.place !== here) {
    window.navHandoff.clear('pendingScrollHlKey');
    missRef.current = null;
    return;
  }
  let el = null;
  try {
    el = document.querySelector('[data-hl-key="' + sk.replace(/"/g, '\\"') + '"]');
    if (el) el.scrollIntoView({ block: 'center' });
  } catch (_e) { /* DOM access — selector or scrollIntoView unsupported */ }
  if (el) {
    window.navHandoff.clear('pendingScrollHlKey');
    missRef.current = null;
  } else if (!miss || miss.key !== sk) {
    missRef.current = { key: sk, place: here };
  }
}

/**
 * @param {{
 *   screen: string,
 *   letterId: string | null,
 *   placeKey: string,
 *   noteSheetTarget: { groupId: string } | null,
 *   setNoteSheetTarget: (v: any) => void
 * }} args
 * @returns {void}
 */
export function useDomAnnotationSync({ screen, letterId, placeKey, noteSheetTarget, setNoteSheetTarget }) {
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
  // [11b] notebook COLOR tags tint inline note icons, so a color change (or
  // notebook delete) must repaint the icon pass — same contract as the four
  // stores above.
  const nbV = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof NotebookStore !== 'undefined') ? NotebookStore.subscribe(cb) : () => {}, []),
    () => (typeof NotebookStore !== 'undefined') ? NotebookStore.getVersion() : 0
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
  // Answers is its own lazy file (sync-loaders.js): a topic opened cold by a
  // link mounted after the first pass and its marks stayed unpainted (n4-02).
  const answersCorpusV = React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__answersCorpus !== 'undefined') ? window.__answersCorpus.subscribe(cb) : () => {}, []),
    () => (typeof window.__answersCorpus !== 'undefined') ? window.__answersCorpus.getVersion() : 0
  );

  // The Library jump's scroll key waits for its mark (scrollToPendingMark).
  const placeRef = React.useRef(placeKey);
  const scrollMissRef = React.useRef(/** @type {{ key: string, place: string } | null} */ (null));

  React.useEffect(() => {
    placeRef.current = placeKey;
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
      // n4-02: a mark a corpus edit moved onto other words goes back to them;
      // the stores' bump re-runs this pass, which then paints it there.
      try { remapCorpusMarks(); } catch (e) { console.error('remapCorpusMarks failed', e); }
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
      // PEEKED, not taken: the slot is cleared only once the mark is found
      // (see scrollToPendingMark), so a pass over a "Loading…" placeholder
      // leaves it for the re-run the corpus load triggers (sweep v010).
      const sk = window.navHandoff.peek('pendingScrollHlKey');
      if (sk) setTimeout(() => scrollToPendingMark(sk, placeRef, scrollMissRef), 70);
      else scrollMissRef.current = null; // slot empty (scrolled, goHome, or a jump with no mark): forget any wait
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setNoteSheetTarget is a useState setter passed in as a param (identity-stable per React invariant; eslint can't trace it through the destructured hook-return at the call site).
  }, [annV, noteV, linkV, bkmV, nbV, screen, letterId, placeKey, bibleCorpusV, matthewCorpusV, votCorpusV, answersCorpusV]);

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
