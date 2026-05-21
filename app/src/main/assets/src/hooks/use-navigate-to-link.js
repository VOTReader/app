/* ═══════════════════════════════════════════════════════════════════════
   useNavigateToLink — the cross-app deep-linking router
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   This is the single entry point for "jump to an arbitrary endpoint":
   LinkSidebar card taps, every Library row tap (Highlights / Journal /
   Notes / Links / Bookmarks), the BookmarkPopover / BookmarkCreateSheet
   "Open" actions. It resolves an endpoint object to a screen + nav-state
   change, records a back-stack entry, and stashes the pending-scroll /
   pending-excerpt window slots the destination view consumes.

   ┌─ THE THREE-PART DEFERRED-BODY PATTERN — LOAD-BEARING, DO NOT COLLAPSE ─┐
   │ 1. `_navToLinkRef = useRef(null)`   — a mutable cell.                  │
   │ 2. `navigateToLink = useCallback(shell, [])` — the shell merely       │
   │      forwards to `_navToLinkRef.current`. `[]` deps ⇒ its identity is │
   │      STABLE for the entire component lifetime.                        │
   │ 3. `_navToLinkRef.current = body` — REASSIGNED on EVERY render, so    │
   │      `body` always closes over this render's fresh params            │
   │      (pushFromLetter, screen, the setters …).                        │
   │                                                                       │
   │ WHY it must stay three parts: the body's real dependencies (screen,  │
   │ letterId, every nav setter, pushFromLetter) change across renders.    │
   │ If you "simplify" this into `useCallback(body, [those deps])`,        │
   │ navigateToLink's identity churns every render — and every consumer    │
   │ holding it (LinkSidebar's onNavigate prop today; hook params          │
   │ tomorrow) sees a new function each render, re-firing their effects.   │
   │ The ref-shell decouples: navigateToLink identity = forever stable;    │
   │ body freshness = via the ref. Do not merge the indirection away.      │
   └───────────────────────────────────────────────────────────────────────┘

   OWNS:
     - _navToLinkRef            useRef — the mutable body cell (internal)
     - navigateToLink           the stable useCallback([]) shell (returned)
     - the deferred body        reassigned every render; resolves 5 endpoint
                                kinds (bible / study|matthew / study-letter
                                / journal / generic-screen)

   DOES NOT OWN:
     - openInAppLetter / goToLetterFromMatthew — the footnote / Matthew
       tap-through builders. They call pushFromLetter directly and stay in
       App(); they are NOT routed through navigateToLink.
     - pushFromLetter — owned by useFromLetterStack (P6i); received as a param.
     - closeLinkSidebar — owned by useSheetOrchestration (P6h); param.
     - the navigation tabFields / journalEntryId / surpriseAnchor — owned by
       App() (tabs block P6k + App-local useState); received as params
       (values for the back-stack source capture, setters for the jump).

   WINDOW: no handler bridges wired (nothing to clean up). The body only
     WRITES two data slots — window.__pendingScrollHlKey and
     window.__pendingLinkExcerpt — which the destination view's post-render
     effect consumes. Plain assignments, not `window.__openX` handlers.

   PARAMS:
     closeLinkSidebar — useSheetOrchestration; closes the sidebar before nav.
     pushFromLetter   — useFromLetterStack; records the back-stack entry.
     screen, bookId, chapterNum, letterId, studyId, studyChapterId —
       current nav position; captured into the pushed back-stack entry.
     setScreen, setBookId, setChapterNum, setLetterId, setStudyId,
       setStudyChapterId — nav setters; the jump.
     setSurpriseAnchor — tabField setter; scroll-to-verse highlight on
       bible / study endpoints.
     setJournalEntryId — App useState setter; journal endpoints.

   RETURNS: { navigateToLink }   (the stable shell only — _navToLinkRef is
            fully internal; App() consumes navigateToLink, nothing else.)

   STORAGE: none.
   ═══════════════════════════════════════════════════════════════════════ */

export function useNavigateToLink({
  closeLinkSidebar, pushFromLetter,
  screen, bookId, chapterNum, letterId, studyId, studyChapterId,
  setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId,
  setSurpriseAnchor, setJournalEntryId,
}) {
  // Part 1 + 2 of the pattern (see header). The shell has [] deps — stable
  // for the component's lifetime.
  const _navToLinkRef = React.useRef(null);
  const navigateToLink = React.useCallback((endpoint, meta) => {
    if (_navToLinkRef.current) _navToLinkRef.current(endpoint, meta);
  }, []);

  // Part 3: the real body, reassigned EVERY render so it closes over the
  // latest params. The optional `meta` arg lets callers (e.g. the Notes
  // index) override the back-pill's title so the destination's "Back to …"
  // pill reads naturally. We also capture a destSnapshot (where this
  // navigation is going TO) so the back-pill can hide itself the moment the
  // user navigates away — the pill is single-shot, not persistent.
  _navToLinkRef.current = (endpoint, meta) => {
    closeLinkSidebar();
    // Library-origin endpoints (bookmark / note / highlight / underline)
    // carry the source hlKey. Stash the block-container key (strip any
    // trailing ":<start>-<end>" char range) so the destination opens
    // already scrolled to that mark — no animation, just there. The
    // post-render apply-DOM effect consumes this. Non-Library tap-throughs
    // (footnote letter-links etc.) have no hlKey → null → no behavior change.
    window.__pendingScrollHlKey = (endpoint && endpoint.key)
      ? String(endpoint.key).replace(/:\d+-\d+$/, '')
      : null;
    // Compute the destination snapshot based on the endpoint type. Used by
    // backHint + the pruning effect (useFromLetterStack) to detect "user
    // has moved on".
    let destSnapshot = null;
    if (endpoint.type === 'bible' && endpoint.bookId && BOOKS[endpoint.bookId]) {
      destSnapshot = { screen: 'bible-ch', bookId: endpoint.bookId, chapterNum: endpoint.chapter, letterId: null, studyId: null, studyChapterId: null };
    } else if (endpoint.type === 'study' || (endpoint.type === 'bible' && endpoint.bookId === 'matthew')) {
      destSnapshot = { screen: 'matthew-ch', bookId: 'matthew', chapterNum: endpoint.chapter, letterId: null, studyId: null, studyChapterId: null };
    } else if (endpoint.type === 'study-letter' && endpoint.studyId && endpoint.studyChapterId) {
      destSnapshot = { screen: 'bible-study-chapter', bookId: null, chapterNum: null, letterId: null, studyId: endpoint.studyId, studyChapterId: endpoint.studyChapterId };
    } else if (endpoint.screen) {
      destSnapshot = { screen: endpoint.screen, bookId: null, chapterNum: null, letterId: endpoint.letterId || endpoint.entryId || null, studyId: null, studyChapterId: null };
    }
    pushFromLetter({
      sourceScreen: screen, sourceLetterId: letterId,
      sourceBookId: bookId, sourceChapterNum: chapterNum,
      sourceStudyId: studyId, sourceStudyChapterId: studyChapterId,
      sourceLetterTitle: (meta && meta.sourceLetterTitle) || null,
      sourceVolumeLabel: (meta && meta.sourceVolumeLabel) || null,
      destSnapshot: destSnapshot
    });
    if (endpoint.type === 'bible' && endpoint.bookId && BOOKS[endpoint.bookId]) {
      setBookId(endpoint.bookId);
      setChapterNum(endpoint.chapter);
      setScreen('bible-ch');
      setSurpriseAnchor(endpoint.verse ? { type: 'verse', verses: [endpoint.verse] } : null);
    } else if (endpoint.type === 'study' || (endpoint.type === 'bible' && endpoint.bookId === 'matthew')) {
      setBookId('matthew');
      setChapterNum(endpoint.chapter);
      setScreen('matthew-ch');
      setSurpriseAnchor(endpoint.verse ? { type: 'verse', verses: [endpoint.verse] } : null);
    } else if (endpoint.type === 'study-letter' && endpoint.studyId && endpoint.studyChapterId) {
      setBookId(null); setChapterNum(null); setLetterId(null);
      setStudyId(endpoint.studyId);
      setStudyChapterId(endpoint.studyChapterId);
      setScreen('bible-study-chapter');
      window.__pendingLinkExcerpt = (endpoint.start != null) ? { start: endpoint.start, end: endpoint.end, text: endpoint.text, key: endpoint.key } : null;
    } else if (endpoint.type === 'journal' && endpoint.entryId) {
      // Journal entries live on a separate journalEntryId state, not on
      // letterId — route through the dedicated setter so the viewer can
      // resolve the entry.
      setBookId(null); setChapterNum(null);
      setStudyId(null); setStudyChapterId(null);
      setLetterId(null);
      setJournalEntryId(endpoint.entryId);
      setScreen('journal-viewer');
      window.__pendingLinkExcerpt = (endpoint.start != null) ? { start: endpoint.start, end: endpoint.end, text: endpoint.text, key: endpoint.key } : null;
    } else if (endpoint.screen) {
      setBookId(null); setChapterNum(null);
      setStudyId(null); setStudyChapterId(null);
      if (endpoint.letterId) setLetterId(endpoint.letterId);
      else if (endpoint.entryId) setLetterId(endpoint.entryId);
      setScreen(endpoint.screen);
      window.__pendingLinkExcerpt = (endpoint.start != null) ? { start: endpoint.start, end: endpoint.end, text: endpoint.text, key: endpoint.key } : null;
    }
  };

  return { navigateToLink };
}
