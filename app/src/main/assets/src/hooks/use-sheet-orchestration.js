/* ═══════════════════════════════════════════════════════════════════════
   useSheetOrchestration — modal/sheet/overlay open-state + window bridges
   + auto-dismiss-on-navigation
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - annChip state             { x, y, hlKey, groupId } | null
     - linkSidebarKey state      hlKey | null
     - linkPickerSource state    { key, label, ... } | null
     - linkRefineRequest state   { kind, target, item } | null
     - lastLinkCreated state     most recently created link, for undo
     - linkPickerMode state      null | 'card' | 'excerpt'
     - linkPickerOnPickRef       useRef — callback for target-picker mode
     - noteSheetTarget state     { groupId, startInEditMode } | null
     - notebookPickerTarget state  groupId | null
     - multiNotePayload state    { groupIds, x, y } | null
     - bookmarkPopoverPayload state  { bkmIds, x, y, hlKey } | null
     - bookmarkCreatePending state   { hlKey, sourceLabel, excerpt,
                                       defaultLabel, ... } | null
     - inboundJournalPayload state   { refKey, label } | null
     - openLinkSidebar / closeLinkSidebar      (useCallback)
     - openLinkPicker / closeLinkPicker         (useCallback)
     - openLinkPickerForTarget                  (useCallback)
     - openNoteSheet / closeNoteSheet           (useCallback)
     - 10 window.__open* / __show* bridge effects (all with delete cleanup)
     - auto-dismiss effect (clears note/chip/multi/bookmark on nav change)

   DOES NOT OWN:
     - hlTick / setHlTick — stays in App(); setHlTick received as a param
       (closeLinkPicker calls setHlTick(t => t + 1) to re-trigger DOM apply)
     - _navToLinkRef + navigateToLink — P6j territory; not touched here
     - __bumpHlTick effect — belongs with hlTick in App()
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
     setHlTick — App()-local useState setter; closeLinkPicker calls
       setHlTick(t => t + 1) to force the apply-DOM effects to re-run
       after the picker closes.

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

   WINDOW: 10 handler bridges, each wired in its own effect and torn down
     with `delete` in that effect's cleanup —
       __openLinkPicker          → openLinkPicker
       __openLinkPickerForTarget → openLinkPickerForTarget
       __openNote                → openNoteSheet
       __openLinkSidebar         → openLinkSidebar
       __showAnnChip             → inline setAnnChip(x,y,hlKey,groupId)
       __showMultiNote           → inline setMultiNotePayload(groupIds,x,y)
       __openBookmarkPopover     → inline setBookmarkPopoverPayload(...)
       __bookmarkCreate          → inline setBookmarkCreatePending(info)
       __openJournalInbound      → inline setInboundJournalPayload(...)
       __bookmarkEdit            → inline BookmarkStore lookup + setter
     Reads but does NOT own: window.__hideSelectionToolbar (called in the
     auto-dismiss effect — owned by SelectionToolbar).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Sheet/overlay state container + window-bridge wirings. Owns ~9 sheet
 * state slots (annChip / linkSidebarKey / linkPickerSource /
 * linkRefineRequest / lastLinkCreated / linkPickerMode / noteSheetTarget /
 * notebookPickerTarget / multiNotePayload), every "open this sheet"
 * window bridge (__openLinkSidebar / __openNoteSheet / etc), and the
 * auto-dismiss effects that close sheets when nav state changes.
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
 *   setHlTick: (updater: any) => void
 * }} args
 * @returns {any}
 */
export function useSheetOrchestration({
  screen, letterId, bookId, chapterNum, studyId, studyChapterId,
  setHlTick,
}) {
  // ── State slots ────────────────────────────────────────────────────────
  const [annChip, setAnnChip] = React.useState(null);                  // { x, y, hlKey, groupId } or null
  const [linkSidebarKey, setLinkSidebarKey] = React.useState(null);   // hlKey or null
  const [linkPickerSource, setLinkPickerSource] = React.useState(null); // { key, label } or null
  const [linkRefineRequest, setLinkRefineRequest] = React.useState(null); // { kind, target, item } or null
  const [lastLinkCreated, setLastLinkCreated] = React.useState(null); // most recently created link, for undo
  // Picker mode — when set, LinkPicker behaves as a target picker (no source,
  // no link persistence); the selected/refined target is handed back via
  // linkPickerOnPickRef.current. Used by Journal to drive the LinkPicker for
  // "Insert Card" (mode='card', no excerpt prompt) and "Insert Excerpt"
  // (mode='excerpt', always refine through verse/letter picker).
  const [linkPickerMode, setLinkPickerMode] = React.useState(null); // null | 'card' | 'excerpt'
  const linkPickerOnPickRef = React.useRef(null);
  const [noteSheetTarget, setNoteSheetTarget] = React.useState(null);  // { groupId, startInEditMode } or null
  const [notebookPickerTarget, setNotebookPickerTarget] = React.useState(null); // groupId or null
  const [multiNotePayload, setMultiNotePayload] = React.useState(null); // { groupIds, x, y } or null
  const [bookmarkPopoverPayload, setBookmarkPopoverPayload] = React.useState(null); // { bkmIds, x, y, hlKey } or null
  const [bookmarkCreatePending, setBookmarkCreatePending] = React.useState(null);   // { hlKey, sourceLabel, excerpt, defaultLabel } or null
  const [inboundJournalPayload, setInboundJournalPayload] = React.useState(null);

  // ── Opener / closer useCallbacks ───────────────────────────────────────
  const openLinkSidebar = React.useCallback((hlKey) => setLinkSidebarKey(hlKey), []);
  const closeLinkSidebar = React.useCallback(() => setLinkSidebarKey(null), []);
  const openLinkPicker = React.useCallback((selInfo) => {
    const hlKey = typeof selInfo === 'string' ? selInfo : selInfo.hlKey;
    if (!hlKey) return;
    const parts = hlKey.split(':');
    let label = hlKey;
    if (parts[0] === 'bible') {
      const b = _allBooks()[parts[1]];
      label = (b ? b.title : parts[1]) + ' ' + parts[2] + ':' + parts[3];
    } else if (parts[0] === 'study') {
      // study:bookId-chapter:verse  e.g. "study:matthew-4:7"
      const m = parts[1].match(/^(.+)-(\d+)$/);
      if (m) label = (m[1].charAt(0).toUpperCase() + m[1].slice(1)) + ' ' + m[2] + (parts[2] && parts[2] !== '0' ? ':' + parts[2] : '');
    } else if (parts[0] === 'letter' || parts[0] === 'wtlb' || parts[0] === 'blessed' || parts[0] === 'holy-days') {
      // Centralized lookup also covers Bible-Study chapters (whose source
      // hlKey shape is "letter:{chapterId}:N" because LetterView renders them).
      const ctx = findEntryContext(parts[1], parts[0]);
      if (ctx && ctx.title) label = ctx.title;
    } else if (parts[0] === 'journal') {
      // journal:<entryId>:<blockIdx>
      const eid = parts[1];
      const je = (typeof JournalStore !== 'undefined') ? JournalStore.get(eid) : null;
      if (je && typeof JournalHelpers !== 'undefined') {
        label = 'Journal · ' + (JournalHelpers.entryDisplayTitle(je) || 'Untitled');
      }
    }
    const src = typeof selInfo === 'string'
      ? { key: hlKey, label }
      : { key: hlKey, label, start: selInfo.start, end: selInfo.end, text: selInfo.text };
    setLinkPickerSource(src);
  }, []);
  const closeLinkPicker = React.useCallback(() => { setLinkPickerSource(null); setLinkRefineRequest(null); setLastLinkCreated(null); setLinkPickerMode(null); linkPickerOnPickRef.current = null; setHlTick(t => t + 1); }, [setHlTick]);
  // Picker mode — Journal calls this to open LinkPicker as a target picker.
  //   mode: 'card'    → return target after the first item is chosen (no
  //                     verse/excerpt prompt). Used for "Insert Card".
  //   mode: 'excerpt' → always run the verse/letter excerpt picker so the
  //                     user can pick a character-precise span. Used for
  //                     "Insert Excerpt".
  // onPick receives the chosen target endpoint (+ optional refinement data).
  const openLinkPickerForTarget = React.useCallback((mode, onPick) => {
    linkPickerOnPickRef.current = typeof onPick === 'function' ? onPick : null;
    // Use a sentinel source object so the render conditions ("source &&
    // !refine") still fire — but no real source key/label exists.
    setLinkPickerSource({ key: null, label: null, picker: true });
    setLinkPickerMode(mode || 'card');
    setLinkRefineRequest(null);
    setLastLinkCreated(null);
  }, []);
  const openNoteSheet = React.useCallback((groupId, startInEditMode) => {
    setNoteSheetTarget({ groupId, startInEditMode: !!startInEditMode });
    setAnnChip(null);
  }, []);
  const closeNoteSheet = React.useCallback(() => setNoteSheetTarget(null), []);

  // ── Window-bridge effects ──────────────────────────────────────────────
  // Expose openLinkPicker globally so the SelectionToolbar can invoke it
  // from anywhere (Bible/Letter/WTLB views), and so tests / hardware-back
  // handling can interact with it without prop-drilling.
  React.useEffect(() => {
    window.__openLinkPicker = openLinkPicker;
    window.__openLinkPickerForTarget = openLinkPickerForTarget;
    return () => {
      delete window.__openLinkPicker;
      delete window.__openLinkPickerForTarget;
    };
  }, [openLinkPicker, openLinkPickerForTarget]);
  React.useEffect(() => { window.__openNote = openNoteSheet; return () => { delete window.__openNote; }; }, [openNoteSheet]);
  // Apply DOM-based highlights + inline link icons to LetterView/WtlbEntryView
  // containers after React renders. HighlightableText handles BibleChapterView/
  // ChapterView. window.__openLinkSidebar is read by inline link icon clicks.
  React.useEffect(() => { window.__openLinkSidebar = openLinkSidebar; return () => { delete window.__openLinkSidebar; }; }, [openLinkSidebar]);
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
  // same reason. annChip + multiNote already had partial cleanup in
  // hlTick reset paths; this consolidates the policy in one place.
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
    linkSidebarKey, openLinkSidebar, closeLinkSidebar,
    linkPickerSource, openLinkPicker, openLinkPickerForTarget, closeLinkPicker,
    linkRefineRequest, setLinkRefineRequest,
    lastLinkCreated, setLastLinkCreated,
    linkPickerMode, linkPickerOnPickRef,
    noteSheetTarget, setNoteSheetTarget, openNoteSheet, closeNoteSheet,
    notebookPickerTarget, setNotebookPickerTarget,
    multiNotePayload, setMultiNotePayload,
    bookmarkPopoverPayload, setBookmarkPopoverPayload,
    bookmarkCreatePending, setBookmarkCreatePending,
    inboundJournalPayload, setInboundJournalPayload,
  };
}
