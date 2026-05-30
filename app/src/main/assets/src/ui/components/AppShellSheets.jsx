/* ═══════════════════════════════════════════════════════════════════════
   AppShellSheets — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The 12 annotation / link / journal / bookmark sheets and popovers that
   sit at the BOTTOM of App's return JSX — extracted from app.jsx
   (Phase 2 P9e). All are always mounted at the App-shell level so they
   sit ABOVE every screen route.

     - SelectionToolbar       — text-selection action menu (always on)
     - AnnotationActionChip   — tap-existing-annotation menu (annChip)
     - LinkSidebar            — view links pointing here (linkSidebarKey)
     - LinkPicker             — pick a link target (linkPickerSource)
     - VersePickerScreen      — refine link target to a verse range
     - LetterExcerptPicker    — refine link target to a letter excerpt
     - NoteSheet              — read / edit a note group (noteSheetTarget)
     - NotebookPickerSheet    — assign a note to a notebook
     - MultiNotePopover       — disambiguate when a refKey has 2+ notes
     - BookmarkPopover        — tap-existing-bookmark menu
     - JournalInboundSheet    — open journal entries linked to this ref
     - BookmarkCreateSheet    — pre-commit form for a new bookmark

   Same closure-prop pattern as AppShellOverlays: explicit prop interface
   threading every dependency. Free-variable refs (BookmarkStore, bkmId,
   _bookmarkSourceEndpoint) resolve from window at call time.
   ═══════════════════════════════════════════════════════════════════════ */

export function AppShellSheets({
  // Selection toolbar handlers
  openLinkPicker, openNoteSheet, closeNoteSheet,
  // Annotation action chip
  annChip, setAnnChip,
  // Link sidebar
  linkSidebarKey, closeLinkSidebar, navigateToLink,
  // Link picker + refinement screens
  linkPickerSource, closeLinkPicker, linkPickerMode, linkPickerOnPickRef,
  linkRefineRequest, setLinkRefineRequest,
  lastLinkCreated, setLastLinkCreated,
  // Note sheet + notebook picker + multi-note popover
  noteSheetTarget, setNoteSheetTarget,
  notebookPickerTarget, setNotebookPickerTarget,
  multiNotePayload, setMultiNotePayload,
  // Bookmark popover + create sheet
  bookmarkPopoverPayload, setBookmarkPopoverPayload,
  bookmarkCreatePending, setBookmarkCreatePending,
  // Journal inbound sheet
  inboundJournalPayload, setInboundJournalPayload,
  goJournalViewer,
}) {
  // W1.5(a.2) — Escape-key dispatch registrations for the 11 conditionally-
  // rendered sheets here. SelectionToolbar is always-mounted with internal
  // visibility state (registers itself from inside its body, NOT here);
  // these 11 are gated externally by their App-level state slots.
  useModalRegistry({
    id: 'annotation-action-chip',
    dismiss: () => setAnnChip(null),
    active: !!annChip,
  });
  useModalRegistry({
    id: 'link-sidebar',
    dismiss: closeLinkSidebar,
    active: !!linkSidebarKey,
  });
  useModalRegistry({
    id: 'link-picker',
    dismiss: closeLinkPicker,
    // LinkPicker renders only when `linkPickerSource && !linkRefineRequest`.
    // Same gate here so the refine screens take dispatch precedence when
    // they're showing on top.
    active: !!(linkPickerSource && !linkRefineRequest),
  });
  useModalRegistry({
    id: 'verse-picker-screen',
    // VersePickerScreen's onClose(result) expects a result arg; pass null
    // to indicate cancellation (matches the back-button code path).
    dismiss: () => setLinkRefineRequest(null),
    active: !!(linkRefineRequest && linkRefineRequest.kind === 'verse' && linkPickerSource),
  });
  useModalRegistry({
    id: 'letter-excerpt-picker',
    dismiss: () => setLinkRefineRequest(null),
    active: !!(linkRefineRequest && linkRefineRequest.kind === 'excerpt' && linkPickerSource),
  });
  useModalRegistry({
    id: 'note-sheet',
    dismiss: closeNoteSheet,
    active: !!noteSheetTarget,
  });
  useModalRegistry({
    id: 'notebook-picker-sheet',
    dismiss: () => setNotebookPickerTarget(null),
    active: !!notebookPickerTarget,
  });
  useModalRegistry({
    id: 'multi-note-popover',
    dismiss: () => setMultiNotePayload(null),
    active: !!multiNotePayload,
  });
  useModalRegistry({
    id: 'bookmark-popover',
    dismiss: () => setBookmarkPopoverPayload(null),
    active: !!bookmarkPopoverPayload,
  });
  useModalRegistry({
    id: 'journal-inbound-sheet',
    dismiss: () => setInboundJournalPayload(null),
    active: !!inboundJournalPayload,
  });
  useModalRegistry({
    id: 'bookmark-create-sheet',
    dismiss: () => setBookmarkCreatePending(null),
    active: !!bookmarkCreatePending,
  });

  return (
    <>
      <SelectionToolbar
        onLinkRequest={openLinkPicker}
        onNoteRequest={openNoteSheet}
        onBookmarkRequest={function(_bkm) { /* bookmark created; icon injected via applyDOMBookmarks */ }}
      />
      {annChip && (
        <AnnotationActionChip
          chip={annChip}
          onClose={() => setAnnChip(null)}
          onNoteRequest={openNoteSheet}
        />
      )}
      {linkSidebarKey && (
        <LinkSidebar
          hlKey={linkSidebarKey}
          onClose={closeLinkSidebar} onNavigate={navigateToLink}
        />
      )}
      {linkPickerSource && !linkRefineRequest && (
        <LinkPicker
          sourceKey={linkPickerSource.key} sourceLabel={linkPickerSource.label}
          sourceStart={linkPickerSource.start} sourceEnd={linkPickerSource.end}
          sourceText={linkPickerSource.text}
          onClose={closeLinkPicker}
          onRequestRefine={setLinkRefineRequest}
          lastCreatedLink={lastLinkCreated} onLinkCreated={setLastLinkCreated}
          mode={linkPickerMode}
          onPickTarget={linkPickerMode ? (target, item) => {
            // Card mode short-circuits here — the LinkPicker hands the target
            // back without a refine step. Excerpt mode never lands here; it
            // routes through the refine screens which do their own pick.
            if (linkPickerOnPickRef.current) linkPickerOnPickRef.current(target, item);
            closeLinkPicker();
          } : null}
        />
      )}
      {linkRefineRequest && linkRefineRequest.kind === 'verse' && linkPickerSource && (
        <VersePickerScreen
          refineRequest={linkRefineRequest}
          sourceKey={linkPickerSource.key} sourceLabel={linkPickerSource.label}
          sourceStart={linkPickerSource.start} sourceEnd={linkPickerSource.end}
          sourceText={linkPickerSource.text}
          returnTargetInsteadOfLink={!!linkPickerMode}
          // Link mode: confirm passes new link object; back passes null.
          // Picker mode: confirm passes refined target → hand to onPick + close.
          onClose={(result) => {
            if (linkPickerMode) {
              if (result && linkPickerOnPickRef.current) linkPickerOnPickRef.current(result);
              if (result) { closeLinkPicker(); } else { setLinkRefineRequest(null); }
              return;
            }
            setLinkRefineRequest(null);
            if (result) setLastLinkCreated(result);
          }}
        />
      )}
      {linkRefineRequest && linkRefineRequest.kind === 'excerpt' && linkPickerSource && (
        <LetterExcerptPickerScreen
          refineRequest={linkRefineRequest}
          sourceKey={linkPickerSource.key} sourceLabel={linkPickerSource.label}
          sourceStart={linkPickerSource.start} sourceEnd={linkPickerSource.end}
          sourceText={linkPickerSource.text}
          returnTargetInsteadOfLink={!!linkPickerMode}
          onClose={(result) => {
            if (linkPickerMode) {
              if (result && linkPickerOnPickRef.current) linkPickerOnPickRef.current(result);
              if (result) { closeLinkPicker(); } else { setLinkRefineRequest(null); }
              return;
            }
            setLinkRefineRequest(null);
            if (result) setLastLinkCreated(result);
          }}
        />
      )}
      {noteSheetTarget && (
        <NoteSheet
          // key forces a remount whenever the target group OR the edit-mode
          // intent changes — otherwise the internal `useState(startInEditMode ?
          // 'edit' : 'read')` captures the first prop value and never updates,
          // so opening a fresh note in edit mode after reading another note
          // would silently land in read mode.
          key={noteSheetTarget.groupId + ':' + (noteSheetTarget.startInEditMode ? 'edit' : 'read')}
          groupId={noteSheetTarget.groupId}
          startInEditMode={noteSheetTarget.startInEditMode}
          onClose={closeNoteSheet}
          onOpenNotebookPicker={(gid) => setNotebookPickerTarget(gid)}
        />
      )}
      {notebookPickerTarget && (
        <NotebookPickerSheet
          groupId={notebookPickerTarget}
          onClose={() => setNotebookPickerTarget(null)}
        />
      )}
      {multiNotePayload && (
        <MultiNotePopover
          payload={multiNotePayload}
          onClose={() => setMultiNotePayload(null)}
          onPick={(gid) => { setMultiNotePayload(null); setNoteSheetTarget({ groupId: gid, startInEditMode: false }); }}
        />
      )}
      {bookmarkPopoverPayload && (
        <BookmarkPopover
          // BookmarkPopover's signature is ({ bkmIds, x, y, onClose,
          // onNavigate, onDeleteDone }) — pass the unpacked payload, not a
          // `payload` prop. (Pre-2026-05-20 this render passed `payload` +
          // `onNavigateToSource`, which the component never read, so the
          // popover silently returned null. Fixed: real props now.)
          bkmIds={bookmarkPopoverPayload.bkmIds}
          x={bookmarkPopoverPayload.x}
          y={bookmarkPopoverPayload.y}
          onNavigate={(bkm) => {
            // Resolve the bookmark's source hlKey to an endpoint, then route
            // through navigateToLink so the back-pill is wired. Mirrors the
            // BookmarkCreateSheet "Open Source" path below.
            const endpoint = (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(bkm.hlKey) : null;
            setBookmarkPopoverPayload(null);
            if (endpoint) navigateToLink(endpoint, { sourceLetterTitle: 'Bookmark' });
          }}
          onDeleteDone={() => {}}
          onClose={() => setBookmarkPopoverPayload(null)}
        />
      )}
      {/* Journal inbound sheet — triggered by tapping the journal chip in
          letter/chapter nav (or anywhere else that calls __openJournalInbound). */}
      {inboundJournalPayload && typeof JournalInboundSheet !== 'undefined' && (
        <JournalInboundSheet
          refKey={inboundJournalPayload.refKey}
          resourceLabel={inboundJournalPayload.label}
          onClose={() => setInboundJournalPayload(null)}
          onOpenEntry={(entry) => {
            setInboundJournalPayload(null);
            if (entry && entry.id) goJournalViewer(entry.id);
          }}
        />
      )}

      {/* BookmarkCreateSheet — pre-commit form for new bookmarks. Opens
          from SelectionToolbar's Bookmark action and from the chapter-
          bookmark NavButton (both via window.__bookmarkCreate). Saving
          commits to BookmarkStore; the inline icon re-applies via the
          store subscription in useDomAnnotationSync. */}
      {bookmarkCreatePending && (
        <BookmarkCreateSheet
          pending={bookmarkCreatePending}
          onCancel={() => setBookmarkCreatePending(null)}
          onConfirm={(bkm) => {
            if (!bkm || !bkm.hlKey) { setBookmarkCreatePending(null); return; }
            if (bkm.editId) {
              // EDIT mode — update existing record.
              BookmarkStore.update(bkm.editId, { label: bkm.label, thought: bkm.thought || '' });
            } else {
              // CREATE mode — insert new.
              BookmarkStore.add({
                id: (typeof bkmId === 'function') ? bkmId() : ('bkm_' + Date.now()),
                hlKey: bkm.hlKey,
                label: bkm.label,
                thought: bkm.thought || '',
                created: Date.now(),
                updated: Date.now()
              });
            }
            setBookmarkCreatePending(null);
          }}
          onDelete={(editId) => {
            if (editId && typeof BookmarkStore !== 'undefined') BookmarkStore.remove(editId);
            setBookmarkCreatePending(null);
          }}
          onOpen={(editId) => {
            if (!editId) return;
            const bkm = BookmarkStore.get(editId);
            if (!bkm) { setBookmarkCreatePending(null); return; }
            // Navigate to the bookmark's source. Mirror BookmarkPopover's nav path.
            const endpoint = (typeof _bookmarkSourceEndpoint === 'function') ? _bookmarkSourceEndpoint(bkm.hlKey) : null;
            setBookmarkCreatePending(null);
            if (endpoint) navigateToLink(endpoint, { sourceLetterTitle: 'Bookmark' });
          }}
        />
      )}
    </>
  );
}
