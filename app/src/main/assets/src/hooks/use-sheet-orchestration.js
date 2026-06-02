/* ═══════════════════════════════════════════════════════════════════════
   useSheetOrchestration — modal/sheet/overlay open-state + window bridges
   + auto-dismiss-on-navigation
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - annChip state             { x, y, hlKey, groupId } | null
     - noteSheetTarget state     { groupId, startInEditMode } | null
     - notebookPickerTarget state  groupId | null
     - multiNotePayload state    { groupIds, x, y } | null
     - bookmarkPopoverPayload state  { bkmIds, x, y, hlKey } | null
     - bookmarkCreatePending state   { hlKey, sourceLabel, excerpt,
                                       defaultLabel, ... } | null
     - inboundJournalPayload state   { refKey, label } | null
     - openNoteSheet / closeNoteSheet           (useCallback)
     - 7 window.__open* / __show* bridge effects (all with delete cleanup)
     - auto-dismiss effect (clears note/chip/multi/bookmark on nav change)

   DELEGATES (spread into the return; App()'s destructure is unchanged):
     - the link-picker / link-sidebar sub-domain → useLinkPickerOrchestration
       (use-link-picker-orchestration.js) — linkSidebarKey, linkPickerSource /
       linkPickerMode / linkRefineRequest, lastLinkCreated, linkPickerOnPickRef
       + their openers/closers + the __openLinkPicker / __openLinkPickerForTarget
       / __openLinkSidebar bridges.

   DOES NOT OWN:
     - _navToLinkRef + navigateToLink — P6j territory; not touched here
     - visualViewport keyboard-height effect — owns no sheet state
     - apply-DOM effects (applyDOMHighlights, applyDOMLinks, etc.) — fenced
     - _allBooks, findEntryContext, JournalStore, JournalHelpers,
       BookmarkStore, _bookmarkSourceLabel — bare-name window globals from
       other bundles; accessed by bare name inside callbacks (no imports,
       no params)

   PARAMS:
     screen, letterId, bookId, chapterNum, studyId, studyChapterId —
       navigation position (useTabs via tabField) — deps of the
       auto-dismiss effect so floating overlays clear whenever the active
       reading position changes.

   RETURNS: {
     annChip, setAnnChip,
     linkSidebarKey, openLinkSidebar, closeLinkSidebar,
     linkPickerSource, openLinkPicker, openLinkPickerForTarget, closeLinkPicker,
     linkRefineRequest, setLinkRefineRequest,
     lastLinkCreated, setLastLinkCreated,
     linkPickerMode, linkPickerOnPickRef,
     noteSheetTarget, openNoteSheet, closeNoteSheet,
     notebookPickerTarget, setNotebookPickerTarget,
     multiNotePayload, setMultiNotePayload,
     bookmarkPopoverPayload, setBookmarkPopoverPayload,
     bookmarkCreatePending, setBookmarkCreatePending,
     inboundJournalPayload, setInboundJournalPayload,
   }

   STORAGE:
     None. All state is in-memory React state; nothing persisted to
     localStorage directly. The render tree consumes the returned values.

   WINDOW: 7 handler bridges, each wired in its own effect and torn down
     with `delete` in that effect's cleanup (the 3 link-picker bridges moved to
     useLinkPickerOrchestration) —
       __openNote                → openNoteSheet
       __showAnnChip             → inline setAnnChip(x,y,hlKey,groupId)
       __showMultiNote           → inline setMultiNotePayload(groupIds,x,y)
       __openBookmarkPopover     → inline setBookmarkPopoverPayload(...)
       __bookmarkCreate          → inline setBookmarkCreatePending(info)
       __openJournalInbound      → inline setInboundJournalPayload(...)
       __bookmarkEdit            → inline BookmarkStore lookup + setter
     Reads but does NOT own: window.__hideSelectionToolbar (called in the
     auto-dismiss effect — owned by SelectionToolbar).
   ═══════════════════════════════════════════════════════════════════════ */

import { useLinkPickerOrchestration } from './use-link-picker-orchestration.js';

/**
 * Sheet/overlay state container + window-bridge wirings. Owns the transient
 * overlay state slots (annChip / noteSheetTarget / notebookPickerTarget /
 * multiNotePayload / bookmarkPopoverPayload / bookmarkCreatePending /
 * inboundJournalPayload), their "open this sheet" window bridges, and the
 * auto-dismiss effects that close sheets when nav state changes. The
 * link-picker / link-sidebar sub-domain is delegated to
 * useLinkPickerOrchestration and spread into the return.
 *
 * The returned surface is wide on purpose — App() destructures every
 * sheet state slot + setter so render-tree branches can wire components
 * directly. (See file header for the full DOES NOT OWN / DOES OWN split.)
 *
 * @param {{
 *   screen: string,
 *   letterId: string | null,
 *   bookId: string | null,
 *   chapterNum: number | null,
 *   studyId: string | null,
 *   studyChapterId: string | null,
 * }} args
 * @returns {any}
 */
export function useSheetOrchestration({
  screen, letterId, bookId, chapterNum, studyId, studyChapterId,
}) {
  // ── State slots ────────────────────────────────────────────────────────
  const [annChip, setAnnChip] = React.useState(null);                  // { x, y, hlKey, groupId } or null
  // Link-picker / link-sidebar sub-domain — extracted to its own cohesive
  // hook (see use-link-picker-orchestration.js); spread into the return below
  // so App()'s destructure is unchanged.
  const linkPicker = useLinkPickerOrchestration();
  const [noteSheetTarget, setNoteSheetTarget] = React.useState(null);  // { groupId, startInEditMode } or null
  const [notebookPickerTarget, setNotebookPickerTarget] = React.useState(null); // groupId or null
  const [multiNotePayload, setMultiNotePayload] = React.useState(null); // { groupIds, x, y } or null
  const [bookmarkPopoverPayload, setBookmarkPopoverPayload] = React.useState(null); // { bkmIds, x, y, hlKey } or null
  const [bookmarkCreatePending, setBookmarkCreatePending] = React.useState(null);   // { hlKey, sourceLabel, excerpt, defaultLabel } or null
  const [inboundJournalPayload, setInboundJournalPayload] = React.useState(null);

  // ── Opener / closer useCallbacks ───────────────────────────────────────
  const openNoteSheet = React.useCallback((groupId, startInEditMode) => {
    setNoteSheetTarget({ groupId, startInEditMode: !!startInEditMode });
    setAnnChip(null);
  }, []);
  const closeNoteSheet = React.useCallback(() => setNoteSheetTarget(null), []);

  // ── Window-bridge effects ──────────────────────────────────────────────
  // (The link-picker / link-sidebar bridges — __openLinkPicker,
  // __openLinkPickerForTarget, __openLinkSidebar — live in
  // useLinkPickerOrchestration now.)
  React.useEffect(() => { window.__openNote = openNoteSheet; return () => { delete window.__openNote; }; }, [openNoteSheet]);
  React.useEffect(() => { window.__showAnnChip = (x, y, hlKey, groupId) => setAnnChip({ x, y, hlKey, groupId }); return () => { delete window.__showAnnChip; }; }, []);
  React.useEffect(() => { window.__showMultiNote = (groupIds, x, y) => setMultiNotePayload({ groupIds, x, y }); return () => { delete window.__showMultiNote; }; }, []);
  React.useEffect(() => { window.__openBookmarkPopover = (bkmIds, x, y, hlKey) => setBookmarkPopoverPayload({ bkmIds, x, y, hlKey }); return () => { delete window.__openBookmarkPopover; }; }, []);
  // Bridge for SelectionToolbar + ChapterBookmarkBtn to open the
  // pre-commit BookmarkCreateSheet instead of silently adding to the
  // store. `info` shape: { hlKey, sourceLabel, excerpt, defaultLabel }.
  React.useEffect(() => { window.__bookmarkCreate = (info) => setBookmarkCreatePending(info || null); return () => { delete window.__bookmarkCreate; }; }, []);
  // Journal inbound sheet bridge — opened from JournalChip in NavButtons.
  // payload: { refKey: 'letter:two/the-wide-path', label: 'The Wide Path' }
  React.useEffect(() => {
    window.__openJournalInbound = (refKey, label) => setInboundJournalPayload(refKey ? { refKey, label } : null);
    return () => { delete window.__openJournalInbound; };
  }, []);
  // Bridge for the inline bookmark icon (single-bookmark tap) and the
  // BookmarksScreen row's edit-from-action-sheet path to open the same
  // BookmarkCreateSheet in EDIT mode. Looks up the existing record and
  // builds the `pending` shape with editId + currentLabel/currentThought
  // populated so the sheet renders preloaded.
  React.useEffect(() => {
    window.__bookmarkEdit = (bkmId, opts) => {
      if (!bkmId || typeof BookmarkStore === 'undefined') return;
      const bkm = BookmarkStore.get(bkmId);
      if (!bkm) return;
      // Source label reuses the BookmarksScreen helper for consistency.
      const sourceLabel = (typeof _bookmarkSourceLabel === 'function')
        ? _bookmarkSourceLabel(bkm.hlKey)
        : '';
      // `atSource` lets callers signal that the user is already on the
      // bookmarked passage (set by the inline-icon tap in
      // dom-bookmarks.js). The sheet uses it to hide the "Open Source"
      // button, which would otherwise be a redundant no-op. Future
      // callers from a list surface (e.g. BookmarksScreen row's action
      // sheet) can omit it and the Open button is shown by default.
      setBookmarkCreatePending({
        editId: bkm.id,
        hlKey: bkm.hlKey,
        sourceLabel: sourceLabel,
        excerpt: '',
        defaultLabel: bkm.label || '',
        currentLabel: bkm.label || '',
        currentThought: bkm.thought || '',
        atSource: !!(opts && opts.atSource)
      });
    };
    return () => { delete window.__bookmarkEdit; };
  }, []);

  // ── Auto-dismiss effect ────────────────────────────────────────────────
  // Auto-dismiss floating overlays whenever the active screen, letter,
  // book, or study chapter changes. Without this the always-mounted
  // SelectionToolbar persists with a stale selInfo, and the
  // noteSheetTarget keeps the NoteSheet visible over an unrelated
  // page after the user navigates via letter arrows or hardware back.
  // Also clears the AnnotationActionChip and MultiNote popover for the
  // same reason — this consolidates the auto-dismiss-on-navigation
  // policy for all floating overlays in one place.
  React.useEffect(() => {
    if (typeof window.__hideSelectionToolbar === 'function') window.__hideSelectionToolbar();
    setNoteSheetTarget(null);
    setAnnChip(null);
    setMultiNotePayload(null);
    setBookmarkPopoverPayload(null);
  }, [screen, letterId, bookId, chapterNum, studyId, studyChapterId]);

  // ── Return ─────────────────────────────────────────────────────────────
  return {
    annChip, setAnnChip,
    ...linkPicker, // linkSidebarKey/openLinkSidebar/linkPickerSource/openLinkPicker/… (use-link-picker-orchestration.js)
    noteSheetTarget, setNoteSheetTarget, openNoteSheet, closeNoteSheet,
    notebookPickerTarget, setNotebookPickerTarget,
    multiNotePayload, setMultiNotePayload,
    bookmarkPopoverPayload, setBookmarkPopoverPayload,
    bookmarkCreatePending, setBookmarkCreatePending,
    inboundJournalPayload, setInboundJournalPayload,
  };
}
