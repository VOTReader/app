/* ═══════════════════════════════════════════════════════════════════════
   useDomAnnotationSync — re-apply the imperative annotation DOM layer (P11)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   The annotation layers (highlights, links, bookmarks, note icons, the
   active-note tint) are painted onto the rendered DOM imperatively AFTER
   React commits, via the renderer-cluster apply* functions (bundle-c
   globals). This hook owns the two effects that drive that pass — extracted
   verbatim from App() so the composition root stays under its line budget.

   OWNS:
     1. The post-render re-apply effect (deps: hlTick, screen, letterId).
        Runs the five apply* passes inside a 0ms timeout (so it fires after
        React's commit), each guarded so one layer's failure can't trip the
        ErrorBoundary. Also drains two window hand-offs:
          - __pendingOpenNote   → open the NoteSheet for a tapped Notes-index row
          - __pendingScrollHlKey → scroll a Library-opened mark into view
     2. The active-note toggle effect (deps: noteSheetTarget, hlTick).
        Sets window.__activeNoteGroup + re-runs applyActiveNoteState so the
        open note's anchored text lights up (and reverts on close).

   DOES NOT OWN:
     - hlTick / screen / letterId / noteSheetTarget — App-local nav + sheet
       state, passed in.
     - The apply* functions themselves — renderer cluster (bundle-c globals).
     - NoteStore — global store (bundle-b), read bare as elsewhere.

   PARAMS:
     hlTick             cache-bust counter; bumps re-run the apply pass.
     screen, letterId   nav keys; a screen/letter change re-applies.
     noteSheetTarget    the open note ({ groupId } | null) for the active toggle.
     setNoteSheetTarget useState setter (from useSheetOrchestration) used to
                        open the NoteSheet when __pendingOpenNote is drained.

   RETURNS: nothing — pure effects.

   WINDOW (read + cleared):
     - __pendingOpenNote     groupId stashed by the Notes index on tap-through.
     - __pendingScrollHlKey  hl-key stashed by Library to scroll-to on open.
     - __activeNoteGroup     written so the renderer knows which group is lit.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   hlTick: number,
 *   screen: string,
 *   letterId: string | null,
 *   noteSheetTarget: { groupId: string } | null,
 *   setNoteSheetTarget: (v: any) => void
 * }} args
 * @returns {void}
 */
export function useDomAnnotationSync({ hlTick, screen, letterId, noteSheetTarget, setNoteSheetTarget }) {
  React.useEffect(() => {
    const t = setTimeout(() => {
      // Each annotation layer is isolated: this pipeline mutates the DOM
      // imperatively AFTER React renders, so rapid prev/next on a heavily
      // annotated page can leave stale/detached nodes mid-pass. A throw
      // here would propagate to React and trip the ErrorBoundary, forcing
      // a full reload. Degrade gracefully instead — a missed icon recovers
      // on the next hlTick; a crash does not.
      try { applyDOMHighlights(); } catch (e) { console.error('applyDOMHighlights failed', e); }
      try { applyDOMLinks(); } catch (e) { console.error('applyDOMLinks failed', e); }
      try { applyDOMBookmarks(); } catch (e) { console.error('applyDOMBookmarks failed', e); }
      try { applyNoteIcons(); } catch (e) { console.error('applyNoteIcons failed', e); }
      try { applyActiveNoteState(); } catch (e) { console.error('applyActiveNoteState failed', e); }
      // If we navigated here from the Notes index by tapping a row, the
      // groupId of the note to open was stashed on the window. Consume it
      // and open the NoteSheet now that the source page is rendered.
      if (window.__pendingOpenNote) {
        const gid = window.__pendingOpenNote;
        window.__pendingOpenNote = null;
        // Defer one more tick so DOM marks are in place for the active-state
        setTimeout(() => {
          if (NoteStore.get(gid)) setNoteSheetTarget({ groupId: gid, startInEditMode: false });
        }, 60);
      }
      // Opened from Library (bookmark/note/highlight/underline) → jump
      // straight to that mark's block. Instant (no smooth behavior) so the
      // page opens already at the position rather than animating there.
      if (window.__pendingScrollHlKey) {
        const sk = window.__pendingScrollHlKey;
        window.__pendingScrollHlKey = null;
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
  }, [hlTick, screen, letterId]);

  // Toggle .is-active on every mark/icon belonging to the open note's group.
  // Default state: notes show only the trailing 📝 icon (no tint, no ribbon).
  // When NoteSheet opens, the anchored text lights up; closing reverts.
  React.useEffect(() => {
    window.__activeNoteGroup = noteSheetTarget ? noteSheetTarget.groupId : null;
    applyActiveNoteState();
  }, [noteSheetTarget, hlTick]);
}
