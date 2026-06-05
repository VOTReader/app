/* ═══════════════════════════════════════════════════════════════════════
   useAndroidBack — the Android hardware/gesture back-navigation handler
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js. The LAST P6 hook.

   Wires window.handleAndroidBack — the function Kotlin's MainActivity
   calls via evaluateJavascript() on every hardware-back / predictive-back
   gesture. It returns "true" (JS consumed the event) or "false" (let
   Android handle it — i.e. exit the app). It is also called by the
   in-app back affordance on Letter/WTLB views (onBack prop).

   ┌─ ROUTING TABLE — what back does, in priority order ───────────────────┐
   │  1. an open sheet (window.__closeSheet)   → close it                  │
   │  2. the Tabs Overview overlay             → close it                  │
   │  3. a LETTER_SCREEN_SET screen with a     → pop the tap-through stack, │
   │     non-empty fromLetter stack              restore the source        │
   │  4. settings / history / about            → goNavOrigin (about also   │
   │                                             marks vot-about-seen)     │
   │  5. notes/links/bookmarks/highlights-index → library                  │
   │     · journal-home                        → library                  │
   │     · journal-viewer                      → journal-home              │
   │     · journal-editor                      → goJournalViewer           │
   │  6. library                               → goHome                   │
   │  7. search                                → goSearchOrigin            │
   │  8. scripture-genre                       → goScripturesHome          │
   │  9. scriptures-home / volumes-home        → goHome                    │
   │ 10. matthew-ch / -idx, bible-study-* ,     → context-aware (fromSearch │
   │     bible-ch / -idx                          / fromStudies / fromWtlb │
   │                                              / single-chapter book …) │
   │ 11. a letter screen (COL_BY_LETTER_SC)    → fromMatthew / fromSearch  │
   │                                             / fromStudies / index     │
   │ 12. an index screen / garden-view         → goVolumesHome             │
   │ 13. anything else                         → "false" (Android exits)   │
   └───────────────────────────────────────────────────────────────────────┘

   (1b) SCREEN-INTERNAL LEVEL — a screen with its own navigation level (e.g.
        NotesIndexScreen drilled into a notebook) registers a window.__screenBack
        interceptor while that level is active. The router calls it right after
        the sheet / tabs-overlay checks and BEFORE the per-screen routing, so an
        internal level is unwound (back to the notebooks list) before Back leaves
        the screen — no parent-level skip. Cross-bundle, so it is a window slot,
        the same shape as window.__closeSheet. The interceptor returns true when
        it consumed the press.

   OWNS:
     - window.handleAndroidBack    wired in a []-deps effect, with a
                                   `delete` cleanup (invariant 6).
     - 9 useRefMirror refs the handler reads at call time (screen, bookId,
       genreId, fromSearch, fromStudies, fromMatthewCh, studyId, fromWtlb,
       tabsOverviewOpen). They are created HERE from the value params —
       App() no longer carries the 8 that were handleAndroidBack-only;
       it keeps its own fromMatthewChRef (still used elsewhere) and this
       hook just makes a second, private mirror of the same value.

   DOES NOT OWN:
     - the nav-helper functions (goNavOrigin, goHome, goSearchOrigin,
       goScripturesHome, goStudiesHome, goVolumesHome, goJournalViewer) —
       App()-local glue that closes over many hook returns; received as
       params. This is why useAndroidBack has a deliberately WIDE param
       surface — it is the most-coupled handler in the app; a tidy
       narrow signature would be a lie.
     - cancelDwell (useReadingDwell), fromLetterRef + setFromLetterStack
       (useFromLetterStack), the nav setters (useTabs) — all params.
     - LETTER_SCREEN_SET / COL_BY_LETTER_SC / COL_BY_INDEX_SC / BOOKS /
       getStudyById — module globals, used by bare name.

   FIXED HERE — a pre-existing stale-closure bug, surfaced by the P6l
   recon and fixed in the immediate follow-up:
     `journalEntryId` was read by the handler directly from the param,
     captured by this hook's []-deps effect closure at mount — when
     journalEntryId is null. Back from `journal-editor` therefore ran
     goJournalViewer(null), which the `if (eid)` guard turned into a
     no-op. The bug predated P6l (the original App() effect had the
     same []-deps stale capture). Fix: journalEntryId is now mirrored
     via useRefMirror like the other 9 nav reads, and the handler reads
     journalEntryIdRef.current — fresh at every back-press.

   PARAMS — a deliberately WIDE bag (see DOES NOT OWN). Every key, by source:
     screen, bookId, genreId, studyId, fromSearch, fromStudies,
       fromMatthewCh, fromWtlb        — useTabs via tabField; mirrored here
                                        through useRefMirror for call-time
                                        reads (the []-deps effect closure
                                        would otherwise freeze them).
     tabsOverviewOpen                 — App()-local state; also mirrored.
     journalEntryId                   — App()-local useState; mirrored (the
                                        journalEntryIdRef fix — see above).
     fromLetterRef                    — useFromLetterStack (already a ref).
     setScreen, setBookId, setChapterNum, setLetterId, setStudyId,
       setStudyChapterId, setFromSearch, setFromStudies, setFromWtlb,
       setFromMatthewCh               — useTabs via tabField setters.
     setFromLetterStack               — useFromLetterStack.
     setTabsOverviewOpen              — App()-local state setter.
     cancelDwell                      — useReadingDwell.
     goNavOrigin, goHome, goSearchOrigin, goScripturesHome, goStudiesHome,
       goVolumesHome, goJournalViewer — App()-local nav-helper glue.

   RETURNS: nothing — pure side-effect hook.

   STORAGE: writes localStorage 'vot-about-seen' on back-from-about.

   WINDOW:
     handleAndroidBack — the Kotlin-callable back router; wired in a
       []-deps effect, cleanup `delete window.handleAndroidBack`.
     Reads but does NOT own: window.__closeSheet (calls it, then nulls it —
       owned by whichever sheet set it) and the navHandoff 'pendingHighlight'
       slot (clears it — a one-shot data slot, not a handler bridge).
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';
import { PlatformBridge } from '../utils/platform-bridge.js';
import {
  arm as _rootExitArm,
  disarm as _rootExitDisarm,
  isArmed as _rootExitIsArmed,
} from '../utils/root-exit-toast.js';

/**
 * Wire window.handleAndroidBack — the function Kotlin's MainActivity calls
 * via evaluateJavascript() on every hardware-back / predictive-back
 * gesture. The handler is wired ONCE at mount (the []-deps useEffect)
 * and reads every nav value through useRefMirror refs so the closure is
 * always call-time fresh. See the file header for the 13-rule routing
 * table and the "stable-by-construction" audit on the nav-helper params.
 *
 * Pure side-effect hook — returns nothing. The PARAMS object is the
 * widest in the project (see file header for per-key origins); see the
 * Q3.3e-android-back commit for the disable-rationale audit.
 *
 * @param {Record<string, any>} args  the deliberately-wide param bag
 * @returns {void}
 */
export function useAndroidBack({
  screen, bookId, genreId, fromSearch, fromStudies, fromMatthewCh, studyId, fromWtlb, fromSurprise,
  tabsOverviewOpen, journalEntryId, fromLetterRef,
  setScreen, setBookId, setChapterNum, setLetterId, setStudyId, setStudyChapterId,
  setFromLetterStack, setFromSearch, setFromStudies, setFromWtlb, setFromMatthewCh, setFromSurprise,
  setTabsOverviewOpen, setSurpriseAnchor,
  cancelDwell, goNavOrigin, goHome, goSearchOrigin, goScripturesHome,
  goStudiesHome, goVolumesHome, goJournalViewer,
  getStudyById,  // App()-local helper; threaded so the bible-study-chapter
                 // back path can introspect the current study's chapter count.
                 // (Pre-fix this was a bare reference inside the handler that
                 // would throw ReferenceError if ever hit — lint caught it.)
}) {
  // Call-time mirrors — handleAndroidBack reads the LATEST nav state when
  // the user presses back, not the value frozen into its []-deps closure.
  const screenRef = useRefMirror(screen);
  const bookIdRef = useRefMirror(bookId);
  const genreIdRef = useRefMirror(genreId);
  const fromSearchRef = useRefMirror(fromSearch);
  const fromStudiesRef = useRefMirror(fromStudies);
  const fromMatthewChRef = useRefMirror(fromMatthewCh);
  const studyIdRef = useRefMirror(studyId);
  const fromWtlbRef = useRefMirror(fromWtlb);
  const fromSurpriseRef = useRefMirror(fromSurprise);
  const tabsOverviewOpenRef = useRefMirror(tabsOverviewOpen);
  const journalEntryIdRef = useRefMirror(journalEntryId);

  // All letter-style screens that can be a tap-through destination. When
  // the user entered via an in-app footnote link, Android back pops the
  // top of the fromLetter stack and returns to the source. Includes
  // bible-study-chapter so tap-throughs INTO a study unwind correctly.
  React.useEffect(() => {
    window.handleAndroidBack = () => {
      if (window.__closeSheet) {window.__closeSheet();window.__closeSheet = null;return "true";}
      if (tabsOverviewOpenRef.current) {
        setTabsOverviewOpen(false);
        return "true";
      }
      cancelDwell();
      const s = screenRef.current;
      // A screen with an internal navigation level (e.g. NotesIndexScreen
      // drilled into a notebook) registers window.__screenBack while that level
      // is active. Unwind it FIRST so Back doesn't skip straight out to the
      // parent screen. Returns true when it consumed the press. Cross-bundle,
      // so it's a window slot — same pattern as window.__closeSheet above.
      if (typeof window.__screenBack === 'function' && window.__screenBack()) return "true";
      const stack = fromLetterRef.current;
      if (LETTER_SCREEN_SET.has(s) && stack && stack.length > 0) {
        const fl = stack[stack.length - 1];
        setFromLetterStack((prev) => prev.slice(0, -1));
        window.navHandoff.clear('pendingHighlight');
        if (fl.sourceBookId !== undefined) setBookId(fl.sourceBookId);
        if (fl.sourceChapterNum !== undefined) setChapterNum(fl.sourceChapterNum);
        if (fl.sourceLetterId !== undefined) setLetterId(fl.sourceLetterId);
        if (fl.sourceStudyId !== undefined) setStudyId(fl.sourceStudyId);
        if (fl.sourceStudyChapterId !== undefined) setStudyChapterId(fl.sourceStudyChapterId);
        setScreen(fl.sourceScreen);
        return "true";
      }
      if (s === "settings") {goNavOrigin();return "true";} else
      if (s === "history") {goNavOrigin();return "true";} else
      if (s === "about") {AboutSeenFlagStore.set();goNavOrigin();return "true";} else
      // UX3: index/hub screens (reached via goNotesIndex/etc., which _captureOrigin)
      // back through goNavOrigin — to the reading screen the user opened them from,
      // not a hardcoded Library. (goNavOrigin restores the captured origin, or
      // goHome() when none — matching settings/history/about above.)
      if (s === "notes-index") {goNavOrigin();return "true";} else
      if (s === "links-index") {goNavOrigin();return "true";} else
      if (s === "bookmarks-index") {goNavOrigin();return "true";} else
      if (s === "highlights-index") {goNavOrigin();return "true";} else
      if (s === "journal-home") {goNavOrigin();return "true";} else
      if (s === "journal-viewer") {setScreen("journal-home");return "true";} else
      if (s === "journal-editor") {goJournalViewer(journalEntryIdRef.current);return "true";} else
      if (s === "library") {goHome();return "true";} else
      if (s === "search") {goSearchOrigin();return "true";} else
      if (s === "scripture-genre") {goScripturesHome();return "true";} else
      if (s === "scriptures-home") {goHome();return "true";} else
      if (s === "volumes-home") {goHome();return "true";} else
      if (s === "matthew-ch") {if (fromSurpriseRef.current) {setFromSurprise(false);goHome();return "true";}if (fromSearchRef.current) {setFromSearch(false);setSurpriseAnchor(null);setScreen("search");} else {setChapterNum(null);setScreen("matthew-idx");}return "true";} else
      if (s === "matthew-idx") {if (fromStudiesRef.current) {setFromStudies(false);goStudiesHome();} else {goHome();}return "true";} else
      if (s === "studies-home") {goHome();return "true";} else
      if (s === "bible-study-index") {goStudiesHome();return "true";} else
      if (s === "bible-study-chapter") {if (fromSurpriseRef.current) {setFromSurprise(false);goHome();return "true";}if (fromSearchRef.current) {setFromSearch(false);setSurpriseAnchor(null);setScreen("search");return "true";}const cur = getStudyById(studyIdRef.current);if (cur && cur.chapters && cur.chapters.length > 1) {setStudyChapterId(null);setScreen("bible-study-index");} else {goStudiesHome();}return "true";} else
      if (s === "bible-ch") {if (fromSurpriseRef.current) {setFromSurprise(false);goHome();return "true";}if (fromWtlbRef.current) {const ret = fromWtlbRef.current;setFromWtlb(null);setScreen(ret);return "true";}if (fromSearchRef.current) {setFromSearch(false);setSurpriseAnchor(null);setScreen("search");} else {const bid = bookIdRef.current;
        /* Q8 lazy: BOOKS lives in bundle-a-bible. If the user is on bible-ch
           via saved-tab cold-boot before __loadBibleCorpus resolves, BOOKS
           is undeclared and a bare BOOKS[bid] throws ReferenceError (optional
           chaining doesn't save you from undeclared identifiers). Same guard
           pattern as App.jsx + W1.6 hardening (typeof BOOKS !== 'undefined').
           When BOOKS isn't loaded, fall through to the index-back path —
           single-chapter book detection just doesn't run until the corpus
           arrives. */
        const _BOOKS = (typeof BOOKS !== 'undefined') ? BOOKS : null;
        if (bid && _BOOKS && _BOOKS[bid]?.chapters.length === 1) {if (genreIdRef.current) {setScreen("scripture-genre");} else {goScripturesHome();}} else {setChapterNum(null);setScreen("bible-idx");}}return "true";} else
      if (s === "bible-idx") {if (genreIdRef.current) {setScreen("scripture-genre");} else {goScripturesHome();}return "true";} else
      // Letter screens: unified back via COLLECTIONS registry
      { const col = COL_BY_LETTER_SC.get(s);
      if (col) {
        if (fromSurpriseRef.current) {setFromSurprise(false);goHome();}
        else if (fromMatthewChRef.current) {setFromMatthewCh(null);setScreen("matthew-ch");}
        else if (fromSearchRef.current) {setFromSearch(false);setSurpriseAnchor(null);setScreen("search");}
        else if (fromStudiesRef.current) {setFromStudies(false);setScreen("bible-study-chapter");}
        else if (col.indexScreen) {setScreen(col.indexScreen);}
        else {goHome();}
        return "true";
      }}
      // Index screens + garden: all go back to volumes-home
      if (COL_BY_INDEX_SC.has(s) || s === "garden-view") {goVolumesHome();return "true";}
      // UX3: home is the only true root — return "false" so the platform handles
      // Back there (native finish() / web root-exit toast). Any OTHER unlisted
      // screen falls back to Home rather than exiting the app from a stray screen.
      if (s === "home") return "false";
      goHome();return "true";
    };
    return () => {delete window.handleAndroidBack;};
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: handler reads ALL nav state through useRefMirror refs (screenRef/bookIdRef/genreIdRef/fromSearchRef/fromStudiesRef/fromMatthewChRef/studyIdRef/fromWtlbRef/fromSurpriseRef/tabsOverviewOpenRef/journalEntryIdRef + fromLetterRef from useFromLetterStack — all 12 read via .current inside the handler, call-time fresh); useState setters are stable; nav-helper params (goHome/goNavOrigin/goSearchOrigin/goScripturesHome/goStudiesHome/goVolumesHome/goJournalViewer) close only over stable setters and refs (audited app.jsx:509-905); cancelDwell/getStudyById same shape. Re-running on dep changes would pointlessly re-wire window.handleAndroidBack. See file header §"Call-time mirrors".
  }, []);

  /* ═══════════════════════════════════════════════════════════════════════
     W1.5(c) — Escape key listener (the SOLE Escape dispatcher).
     ═══════════════════════════════════════════════════════════════════════
     Per PLAN.txt DISPATCHER CONTRACT, modals do NOT add their own keydown
     listeners. They register {id, dismiss} with useModalRegistry. This
     listener is the only path Escape goes through, ensuring exactly one
     decision per keypress: dismiss the topmost modal OR navigate back,
     never both.

     Gates, in priority order:
       1. Web-only: skip on Android (PlatformBridge.isAndroid). Android has its
          own back-button routing via Kotlin → window.handleAndroidBack;
          there's no Escape-key UX to gate.
       2. Not Escape: ignore. event.key === 'Escape' (the deprecated
          event.keyCode would also work but is on its way out).
       3. Composition in flight (IME / autocomplete): skip — Escape
          there cancels the composition; let the browser handle it.
       4. Fullscreen open: skip entirely. The browser exits fullscreen
          natively on Escape. Do NOT preventDefault — that would swallow
          the browser's own behavior.
       5. Modal registry isAnyOpen: call peek().dismiss(). Do NOT also
          fire handleAndroidBack — the dispatcher contract forbids it.
          The dismissed modal's unmount effect unregisters its entry;
          the next Escape will see the next entry (or empty registry).
          This MUST come before the activeElement check below: a sheet
          with an input inside (NoteSheet, BookmarkCreateSheet, the link
          picker's search box, etc.) should dismiss the SHEET on Escape,
          not just blur the input — even though the input is the active
          element. The active modal is the more user-meaningful unit.
       6. activeElement is editable: skip. document.activeElement is an
          input/textarea/contenteditable. The browser's default Escape
          behavior is to blur the field (or clear it on some inputs);
          letting that run is the right UX — navigating away because the
          user pressed Escape to dismiss a soft keyboard or unfocus a
          search box would be jarring. This gate runs AFTER the registry
          check (so sheets dismiss correctly) and BEFORE handleAndroidBack
          (so plain inputs blur without nav).
       7. Else: route to handleAndroidBack via the same suppress + clear
          pattern (d)'s popstate uses. handleAndroidBack mutates nav
          state synchronously; the suppress flag prevents
          useHistorySync's effect from pushing a redundant entry.

     This listener is REGISTERED ONCE at mount via a []-deps effect.
     handleAndroidBack is read by name through `window.handleAndroidBack`
     at keypress time (call-time fresh) — same pattern the rest of the
     file uses. modalRegistry / suppressNextHistoryPush /
     clearSuppressNextHistoryPush are module-level singletons; their
     identity is stable across the lifetime of the app.
     ═══════════════════════════════════════════════════════════════════════ */
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (PlatformBridge.isAndroid) return;  // U14: Android handles back via the OS button, not Escape (via the bridge, not a direct AndroidBridge probe).

    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (e.isComposing) return;  // IME composition cancel — browser handles.
      // Fullscreen exit: let the browser do its native thing. Do NOT
      // preventDefault; do NOT dismiss a modal underneath the fullscreen
      // view. The next Escape press (after fullscreen exits) will be a
      // normal one and the registry/handleAndroidBack path runs then.
      if (document.fullscreenElement) return;

      if (modalRegistry.isAnyOpen()) {
        const top = modalRegistry.peek();
        if (top && typeof top.dismiss === 'function') {
          // The modal dismisses itself; its unmount effect will
          // unregister. We do NOT also call handleAndroidBack — that
          // would dismiss-AND-navigate on a single press.
          e.preventDefault();
          top.dismiss();
        }
        return;
      }

      // activeElement gate. If a plain input is focused (search bar,
      // settings text field, journal title, etc.) with no modal open,
      // Escape should blur the field — browser default — not navigate
      // away. Runs AFTER the registry check above so a sheet with an
      // input inside still dismisses the sheet correctly.
      // isContentEditable lives on HTMLElement, not Element, so the
      // instanceof narrow is what makes tsc happy without a cast.
      const active = document.activeElement;
      if (active instanceof HTMLElement && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable
      )) {
        return;
      }

      // No modal open + not in fullscreen + not editing → route to
      // handleAndroidBack. Same suppress+clear handshake (d)'s popstate
      // uses so the back-induced state change doesn't trigger a
      // redundant pushState.
      suppressNextHistoryPush();
      const result = (typeof window.handleAndroidBack === 'function')
        ? window.handleAndroidBack()
        : 'false';
      if (result === 'false') {
        // Root of stack — handleAndroidBack didn't navigate. Clear the
        // suppress flag so the next legitimate user nav pushes normally.
        // (W1.5(d) is where root-of-stack double-tap-to-exit lives; this
        // path here is Escape-at-root, which is a no-op by design — the
        // PWA window stays put. Document this so future readers don't
        // think we're missing a toast: Escape-at-root is fine to
        // silently no-op since the user's keyboard didn't ask to exit
        // the browser tab; only the browser's back gesture has that
        // semantic.)
        clearSuppressNextHistoryPush();
      } else {
        // result === 'true' — navigation happened. preventDefault
        // because we consumed the Escape press.
        e.preventDefault();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); };
    // Mount-only — the closure reads window.handleAndroidBack + modalRegistry
    // + the suppress/clear helpers as call-time globals (no React state in
    // deps), so [] is honest here and eslint-react-hooks has nothing to
    // flag.
  }, []);

  /* ═══════════════════════════════════════════════════════════════════════
     W1.5(d) — popstate listener + root-of-stack double-tap-to-exit.
     ═══════════════════════════════════════════════════════════════════════
     The desktop counterpart of the Android system back button. When the
     user clicks the browser back button (or swipes back on a trackpad),
     popstate fires after the browser has already consumed one history
     entry. We route to handleAndroidBack for the in-app nav routing;
     at the root of the stack we run the "press back again to exit"
     double-tap pattern per [[root-of-history-pwa]].

     Three gates, in order:
       1. Web-only (skipped on Android via PlatformBridge.isAndroid — Android uses the
          system back button, never browser navigation).
       2. Firefox popstate-on-load — older HTML5 spec interpretation
          says popstate fires on initial page load; Chrome doesn't.
          window.__historyReady is set by useHistorySync after the
          first nav-key commit; we ignore any popstate that arrives
          before that flag goes true.
       3. handleAndroidBack returns "true" → navigation handled. We
          set suppressNextHistoryPush BEFORE handleAndroidBack so the
          state-change-triggered useHistorySync effect skips its push
          (otherwise back would require N+1 presses per nav step).
          handleAndroidBack returns "false" → root of stack. Run the
          double-tap-exit logic.

     Root-of-stack flow (per the contract in
     [[root-of-history-pwa]]):
       - First back at root (not armed):
           push REPLACEMENT entry (browser stack returns to one-deep
             so the next back has something to consume),
           arm root-exit-toast for 2 seconds,
           clearSuppressNextHistoryPush (handleAndroidBack didn't
             change state → useHistorySync effect won't fire → flag
             would strand).
       - Second back at root within 2s (armed):
           disarm root-exit-toast,
           DO NOT push a replacement — the popstate already consumed
             an entry; without our intervention the browser exits the
             PWA on the user's next gesture (or now, if the stack is
             empty).

     The TIMER-CLEAR-ON-FORWARD-NAV invariant is enforced inside
     useHistorySync.js's effect: every legitimate forward pushState
     calls disarm() on the root-exit-toast module, so an old "first
     back at root" press from a previous root visit cannot bleed into
     a future root-back and skip the toast.
     ═══════════════════════════════════════════════════════════════════════ */
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (PlatformBridge.isAndroid) return;  // U14: via the bridge, not a direct AndroidBridge probe.
    if (typeof window.addEventListener !== 'function') return;

    function onPopState() {
      // Firefox popstate-on-load guard. Chrome doesn't fire popstate
      // at page load; Firefox does (older HTML5 spec interpretation).
      // useHistorySync sets __historyReady after the first effect-run;
      // anything before that is a load-time spurious fire we must
      // ignore — calling handleAndroidBack at boot would jump the user
      // to home / library / wherever before the app finished mounting.
      if (!window.__historyReady) return;

      suppressNextHistoryPush();
      // handleAndroidBack returns the STRING "true" / "false" (not
      // boolean) — it's an @JavascriptInterface return value originally
      // shaped for Kotlin. Compare against 'false' as a string.
      const result = (typeof window.handleAndroidBack === 'function')
        ? window.handleAndroidBack()
        : 'false';
      if (result !== 'false') {
        // Navigation happened. handleAndroidBack already updated state;
        // useHistorySync's effect will fire next render, see suppress
        // set, no-op. Nothing more to do here.
        return;
      }

      // Root of stack. handleAndroidBack didn't change state; the
      // useHistorySync effect won't fire; clear the suppress flag now
      // so future legitimate user navs aren't accidentally suppressed.
      clearSuppressNextHistoryPush();

      if (_rootExitIsArmed()) {
        // Second back within 2-second window → let the exit happen.
        // The popstate that triggered THIS call already consumed an
        // entry from the browser stack; we deliberately do NOT push
        // a replacement. The user's next gesture exits naturally.
        _rootExitDisarm();
        return;
      }

      // First back at root → push replacement so the app stays mounted,
      // then arm the toast for 2 seconds.
      try {
        history.pushState({}, '', '');
      } catch (_e) {
        // Iframe sandbox / unusual hosting may block pushState; the
        // toast still arms (so a second back will exit cleanly). On
        // platforms where pushState is blocked, root-back exits on
        // first press — same as if this code didn't exist. Non-fatal.
      }
      _rootExitArm();
    }

    window.addEventListener('popstate', onPopState);
    return () => { window.removeEventListener('popstate', onPopState); };
    // Mount-only — same rationale as the Escape listener above. The
    // closure reads only module-level singletons + the call-time-fresh
    // window.handleAndroidBack global; no React state in deps.
  }, []);
}
