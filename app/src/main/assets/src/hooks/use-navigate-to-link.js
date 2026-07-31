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

   PARAMS:
     closeLinkSidebar — useSheetOrchestration; closes the sidebar before nav.
     pushFromLetter   — useFromLetterStack; records the back-stack entry.
     screen, bookId, chapterNum, letterId, studyId, studyChapterId,
     journalEntryId — current nav position; captured into the pushed
       back-stack entry (journalEntryId is the 7th tracked field, so a
       link tapped INSIDE a journal entry can restore it).
     setScreen, setBookId, setChapterNum, setLetterId, setStudyId,
       setStudyChapterId — nav setters; the jump.
     setSurpriseAnchor — tabField setter; scroll-to-verse highlight on
       bible / study endpoints.
     setJournalEntryId — App useState setter; journal endpoints.

   RETURNS: { navigateToLink }   (the stable shell only — _navToLinkRef is
            fully internal; App() consumes navigateToLink, nothing else.)

   STORAGE: none.

   NAV HAND-OFF (navHandoff, see utils/nav-handoff.js): no handler bridges
     wired (nothing to clean up). The body only SETS the 'pendingScrollHlKey'
     slot, which use-dom-annotation-sync takes post-render to scroll the mark
     into view. (D2 removed the write-only-dead 'pendingLinkExcerpt' slot.)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Build the surpriseAnchor for a bible/matthew endpoint's verse target.
 * A ref with a range ("John 3:16-18" → verse 16, verseEnd 18) highlights
 * EVERY verse in the span, not just the first — the destination chapter
 * views flash all of `verses` and scroll to verses[0]. Span capped at 176
 * (the longest chapter, Psalm 119) so a malformed range can't build an
 * absurd array.
 *
 * @param {{ verse?: number|null, verseEnd?: number|null }} endpoint
 * @returns {{ type: 'verse', verses: number[] } | null}
 */
export function verseAnchorFor(endpoint) {
  if (!endpoint || endpoint.verse == null) return null;
  const start = endpoint.verse;
  const end = (typeof endpoint.verseEnd === 'number' && endpoint.verseEnd > start)
    ? Math.min(endpoint.verseEnd, start + 175)
    : start;
  const verses = [];
  for (let v = start; v <= end; v++) verses.push(v);
  return { type: 'verse', verses };
}

/* Endpoint kinds whose navigation is driven by a resolved `screen` (set from
   findEntryContext). Without one there is no branch to take — see the guard at
   the top of the deferred body. */
const _NEEDS_SCREEN = { letter: 1, wtlb: 1, blessed: 1, 'holy-days': 1 };

/**
 * Cross-screen navigation handler. Returns a stable `navigateToLink`
 * function (identity-fresh closure refreshed every render via ref) that
 * routes a LinkPicker-resolved endpoint to the right screen and pushes
 * the source context onto the from-letter stack so the back-pill works.
 *
 * @param {{
 *   closeLinkSidebar: () => void,
 *   pushFromLetter: (entry: any) => void,
 *   screen: string,
 *   bookId: string | null,
 *   chapterNum: number | null,
 *   letterId: string | null,
 *   studyId: string | null,
 *   studyChapterId: string | null,
 *   journalEntryId: string | null,
 *   setScreen: (val: any) => void,
 *   setBookId: (val: any) => void,
 *   setChapterNum: (val: any) => void,
 *   setLetterId: (val: any) => void,
 *   setStudyId: (val: any) => void,
 *   setStudyChapterId: (val: any) => void,
 *   setSurpriseAnchor: (val: any) => void,
 *   setJournalEntryId: (val: any) => void
 * }} args
 * @returns {{ navigateToLink: (endpoint: any, meta?: any) => void }}
 */
export function useNavigateToLink({
  closeLinkSidebar, pushFromLetter,
  screen, bookId, chapterNum, letterId, studyId, studyChapterId, journalEntryId,
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
    // A letter/WTLB/Blessed/Holy-Days endpoint needs a resolved `screen` to
    // match any branch below — findEntryContext returns null (so screen null)
    // until the VOT corpus has loaded. Such an endpoint used to run the WHOLE
    // prologue (pendingScrollHlKey, destSnapshot, pushFromLetter) and then
    // match nothing: a silent dead tap that ALSO left a junk back-stack entry.
    // Bail before any of that and kick the corpus; a re-tap works once it lands
    // (note rows re-tap fine — no retry loop needed).
    if (endpoint && _NEEDS_SCREEN[endpoint.type] && !endpoint.screen) {
      if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus();
      return;
    }
    closeLinkSidebar();
    // Library-origin endpoints (bookmark / note / highlight / underline)
    // carry the source hlKey. Stash the block-container key (strip any
    // trailing ":<start>-<end>" char range) so the destination opens
    // already scrolled to that mark — no animation, just there. The
    // post-render apply-DOM effect consumes this. Non-Library tap-throughs
    // (footnote letter-links etc.) have no hlKey → null → no behavior change.
    window.navHandoff.set('pendingScrollHlKey', (endpoint && endpoint.key)
      ? String(endpoint.key).replace(/:\d+-\d+$/, '')
      : null);
    // Compute the destination snapshot based on the endpoint type. Used by
    // backHint + the pruning effect (useFromLetterStack) to detect "user
    // has moved on".
    // Q8 lazy: BOOKS lives in bundle-a-bible. The bare `BOOKS[endpoint.bookId]`
    // reads below would throw ReferenceError if the user taps an in-app
    // bible-link before __loadBibleCorpus resolves (e.g. cold-boot saved-tab
    // sitting in a letter that has scripture-ref tap-throughs). Match the
    // App.jsx + W1.6 hardening pattern. When BOOKS isn't loaded, the bible-
    // type branch is skipped and we fall through — the matthew + study + screen
    // branches don't need BOOKS, so they still work.
    const _BOOKS = (typeof BOOKS !== 'undefined') ? BOOKS : null;
    let destSnapshot = null;
    // The bible destSnapshot is pure nav metadata ({screen,bookId,chapterNum})
    // for the back-pill — it does NOT need the corpus loaded. The old
    // `_BOOKS[bookId]` guard here meant a direct bible jump made before
    // __loadBibleCorpus resolved built a null snapshot (back-pill couldn't
    // detect "moved on"); compute it from the endpoint alone instead. (matthew
    // is a bible-typed endpoint routed to matthew-ch, so it's excluded here and
    // handled by the next branch.)
    if (endpoint.type === 'bible' && endpoint.bookId && endpoint.bookId !== 'matthew') {
      destSnapshot = { screen: 'bible-ch', bookId: endpoint.bookId, chapterNum: endpoint.chapter, letterId: null, studyId: null, studyChapterId: null };
    } else if (endpoint.type === 'study' || (endpoint.type === 'bible' && endpoint.bookId === 'matthew')) {
      destSnapshot = { screen: 'matthew-ch', bookId: 'matthew', chapterNum: endpoint.chapter, letterId: null, studyId: null, studyChapterId: null };
    } else if (endpoint.type === 'study-letter' && endpoint.studyId && endpoint.studyChapterId) {
      destSnapshot = { screen: 'bible-study-chapter', bookId: null, chapterNum: null, letterId: null, studyId: endpoint.studyId, studyChapterId: endpoint.studyChapterId };
    } else if (endpoint.type === 'journal' && endpoint.entryId) {
      // Journal entries live on journalEntryId, and the nav branch below
      // NULLS letterId. Without this branch a journal endpoint fell into the
      // generic `endpoint.screen` case below and recorded letterId = entryId —
      // a snapshot that contradicted the nav it described, so _destMatches
      // failed and the prune effect popped the entry on the very next render
      // (the "no way back from a journal-sourced note" report).
      destSnapshot = { screen: 'journal-viewer', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null, journalEntryId: endpoint.entryId };
    } else if (endpoint.screen) {
      destSnapshot = { screen: endpoint.screen, bookId: null, chapterNum: null, letterId: endpoint.letterId || endpoint.entryId || null, studyId: null, studyChapterId: null };
    }
    pushFromLetter({
      sourceScreen: screen, sourceLetterId: letterId,
      sourceBookId: bookId, sourceChapterNum: chapterNum,
      sourceStudyId: studyId, sourceStudyChapterId: studyChapterId,
      sourceJournalEntryId: journalEntryId,
      sourceLetterTitle: (meta && meta.sourceLetterTitle) || null,
      sourceVolumeLabel: (meta && meta.sourceVolumeLabel) || null,
      // `silent` suppresses the pill but not the back target — History links
      // are the one path the owner wants pill-less (see useFromLetterStack).
      silent: !!(meta && meta.silent),
      destSnapshot: destSnapshot
    });
    if (endpoint.type === 'bible' && endpoint.bookId && endpoint.bookId !== 'matthew') {
      // The bible corpus (BOOKS, in bundle-a-bible) may not be loaded yet on a
      // direct entry — a Library/LinkSidebar tap straight after a cold boot,
      // before any hub pre-loaded it. The OLD code gated this branch on
      // `_BOOKS[bookId]`, so such a tap fell through EVERY branch and silently
      // did NOTHING (the user's "links don't work until the target's loaded"
      // report). Navigate immediately when the corpus is ready; otherwise kick
      // the loader and navigate when it resolves — never drop the intent.
      const goBible = () => {
        setBookId(endpoint.bookId);
        setChapterNum(endpoint.chapter);
        setScreen('bible-ch');
        setSurpriseAnchor(verseAnchorFor(endpoint));
      };
      if (_BOOKS && _BOOKS[endpoint.bookId]) {
        goBible();
      } else if (typeof window.__loadBibleCorpus === 'function') {
        window.__loadBibleCorpus().then(function () {
          // Re-check post-load: a real endpoint resolves; a stale/bogus bookId
          // no-ops with a trace rather than opening an empty chapter.
          if (typeof BOOKS !== 'undefined' && BOOKS && BOOKS[endpoint.bookId]) goBible();
          else console.warn('navigateToLink: bible book not found after corpus load', endpoint.bookId);
        }).catch(function (e) { console.warn('navigateToLink: bible corpus load failed', e); });
      }
    } else if (endpoint.type === 'study' || (endpoint.type === 'bible' && endpoint.bookId === 'matthew')) {
      // MATTHEW lives in bundle-a-matthew — same lazy-corpus race the bible
      // branch above guards. This branch never kicked the loader, so a
      // study-sourced tap made before the corpus resolved landed on the
      // "Loading Matthew…" view with nothing pulling it in. Idempotent kick;
      // the route's own _corpusView finishes the job when it resolves.
      if (typeof window.__loadMatthewCorpus === 'function') window.__loadMatthewCorpus();
      setBookId('matthew');
      setChapterNum(endpoint.chapter);
      setScreen('matthew-ch');
      setSurpriseAnchor(verseAnchorFor(endpoint));
    } else if (endpoint.type === 'study-letter' && endpoint.studyId && endpoint.studyChapterId) {
      setBookId(null); setChapterNum(null); setLetterId(null);
      setStudyId(endpoint.studyId);
      setStudyChapterId(endpoint.studyChapterId);
      setScreen('bible-study-chapter');
    } else if (endpoint.type === 'journal' && endpoint.entryId) {
      // Journal entries live on a separate journalEntryId state, not on
      // letterId — route through the dedicated setter so the viewer can
      // resolve the entry.
      setBookId(null); setChapterNum(null);
      setStudyId(null); setStudyChapterId(null);
      setLetterId(null);
      setJournalEntryId(endpoint.entryId);
      setScreen('journal-viewer');
    } else if (endpoint.screen) {
      setBookId(null); setChapterNum(null);
      setStudyId(null); setStudyChapterId(null);
      if (endpoint.letterId) setLetterId(endpoint.letterId);
      else if (endpoint.entryId) setLetterId(endpoint.entryId);
      setScreen(endpoint.screen);
    }
  };

  return { navigateToLink };
}
