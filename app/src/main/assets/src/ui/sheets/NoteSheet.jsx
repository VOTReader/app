/* ═══════════════════════════════════════════════════════════════════════
   NoteSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';

/**
 * @param {{ groupId: any, startInEditMode: any, freshGroup?: any, onClose: any, onOpenNotebookPicker?: any }} props
 */
export function NoteSheet({ groupId, startInEditMode, freshGroup, onClose, onOpenNotebookPicker }) {
  // Subscribe to NoteStore + AnnotationStore mutations. Each store's _bump
  // triggers a re-render of this component via useSyncExternalStore.
  // The imperative DOM highlight layer re-applies off the same store
  // subscriptions (useDomAnnotationSync), so no manual refresh is needed.
  React.useSyncExternalStore(
    React.useCallback((cb) => NoteStore.subscribe(cb), []),
    () => NoteStore.getVersion()
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => AnnotationStore.subscribe(cb), []),
    () => AnnotationStore.getVersion()
  );
  const note = NoteStore.get(groupId);
  const segs = AnnotationStore.getByGroup(groupId);
  const [mode, setMode] = React.useState(startInEditMode ? 'edit' : 'read');
  const [body, setBody] = React.useState(note ? note.body || '' : '');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [showColors, setShowColors] = React.useState(false);
  // Discard-gate for an edit-mode dismissal with unsaved text. Holds the
  // dismissal INTENT so confirming lands where the user was headed:
  //   'cancel' — the footer Cancel button (existing note → back to read mode)
  //   'close'  — backdrop / Escape / Android back (sheet closes entirely)
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(/** @type {null | 'cancel' | 'close'} */ (null));
  const textareaRef = React.useRef(null);

  React.useEffect(() => {
    if (mode === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end so Edit-after-existing-content lands at the tail
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [mode]);

  // The sheet owns its OWN modal-registry entry (moved out of AppShellSheets
  // 2026-07-12): Escape / Android back must route through requestClose so an
  // edit-mode dismissal gets the same honest cancel/discard semantics as the
  // backdrop — a bare setNoteSheetTarget(null) used to strand a fresh
  // never-saved note group ("Save" looked cosmetic; owner-reported).
  useModalRegistry({ id: 'note-sheet', dismiss: () => requestClose() });

  if (!note || !segs.length) {
    // Note record went missing — close
    return null;
  }
  const color = note.color || 'yellow';
  const anchor = normalizeExcerptDisplay(note.fullText || segs.map(s => s.ann.text || '').join(' … '));
  const truncatedAnchor = anchor.length > 220 ? anchor.slice(0, 220) + '…' : anchor;

  // A "fresh" note = opened straight into edit mode with no saved body yet.
  // Discarding one removes the NoteStore record; if this flow also CREATED
  // the annotation group (freshGroup), the group goes too. When note-ness
  // was attached to a PRE-EXISTING mark, that mark survives the discard.
  const freshUnsaved = !!startInEditMode && !note.body;
  const dirty = body.trim() !== (note.body || '').trim();

  const save = () => {
    NoteStore.update(groupId, { body });
    onClose();
  };

  /** @param {'cancel' | 'close'} intent */
  function performDiscard(intent) {
    setConfirmingDiscard(null);
    setBody(note.body || '');
    if (freshUnsaved) {
      if (freshGroup) AnnotationStore.removeGroup(groupId);
      NoteStore.remove(groupId);
      onClose();
      return;
    }
    if (intent === 'close') { onClose(); return; }
    setMode('read');
  }

  /** @param {'cancel' | 'close'} intent */
  function requestCancel(intent) {
    if (dirty) { setConfirmingDiscard(intent); return; }
    performDiscard(intent);
  }

  // Single dismissal entry point — backdrop, Escape, Android back all land
  // here. Steps back through transient panels first, then applies the
  // edit-mode cancel semantics, and only then closes.
  function requestClose() {
    // Record vanished (render bailed to null before the consts above
    // initialized) — just close; nothing left to cancel or discard.
    if (!note || !segs.length) { onClose(); return; }
    if (confirmingDiscard) { setConfirmingDiscard(null); return; }
    if (menuOpen) { setMenuOpen(false); setConfirmDelete(false); setShowColors(false); return; }
    if (showColors) { setShowColors(false); return; }
    if (mode === 'edit') { requestCancel('close'); return; }
    onClose();
  }

  // The note's current visual style (legacy 'note' kind → 'highlight').
  const _segKind = segs[0] && segs[0].ann ? segs[0].ann.kind : 'highlight';
  const curStyle = (_segKind === 'underline' || _segKind === 'squiggle') ? _segKind : 'highlight';

  const recolor = (c) => {
    AnnotationStore.recolorGroup(groupId, c);
    NoteStore.update(groupId, { color: c });
    // Whatever you last set a note to becomes the default for the next note.
    if (typeof NoteDefaultStore !== 'undefined') NoteDefaultStore.set(curStyle, c);
    setShowColors(false);
    setMenuOpen(false);
  };

  // Switch the note's visual style. Squiggle/underline can't be blank, so a
  // blank color is promoted to yellow when leaving the highlight style.
  const setStyle = (style) => {
    AnnotationStore.convertGroup(groupId, style);
    let c = color;
    if (style !== 'highlight' && c === 'blank') {
      c = 'yellow';
      AnnotationStore.recolorGroup(groupId, c);
      NoteStore.update(groupId, { color: c });
    }
    if (typeof NoteDefaultStore !== 'undefined') NoteDefaultStore.set(style, c);
  };

  const remove = () => {
    AnnotationStore.removeGroup(groupId);
    NoteStore.remove(groupId);
    onClose();
  };

  const share = () => {
    const text = anchor + (note.body ? '\n\n' + note.body : '');
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard.writeText(text).catch(() => {});
    setMenuOpen(false);
  };

  // Blank notes are allowed — the body can be empty. (Pre-Q3.3f-dead a
  // `const canSave = true` lived here; the Save button never reads it.)
  // Tapping the header color dot opens the color picker — works in either
  // mode AND closes any other panel that's open (menu, delete confirm).
  const openColorPicker = () => {
    setShowColors(true);
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  return (
    <div className="note-sheet-overlay" onClick={requestClose}>
      <div className="note-sheet" onClick={e => e.stopPropagation()}>
        {/* Header: color dot (tappable) · "Note" · ⋯ menu (read mode only) */}
        <div className="note-sheet-header">
          <button
            className="note-sheet-color-dot ann-chip-color-btn"
            data-color={color}
            onClick={openColorPicker}
            title="Change color"
            aria-label="Change note color"
          />
          <div className="note-sheet-title">{mode === 'edit' ? (note.body ? 'Edit note' : 'New note') : 'Note'}</div>
          {mode === 'read' && (
            <button
              className="note-sheet-menu-btn"
              onClick={() => { setMenuOpen(v => !v); setShowColors(false); setConfirmDelete(false); }}
              aria-label="Options"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="12" cy="19" r="1.7" />
              </svg>
            </button>
          )}
        </div>
        {/* Color picker takes over the body area when opened — by tapping the
            header dot OR the ⋯ menu's "Change color" item. */}
        {showColors ? (
          <div className="note-sheet-menu-colors">
            <button className="ann-chip-back" onClick={() => setShowColors(false)} title="Back" aria-label="Back">‹</button>
            {curStyle === 'highlight' && (
              <button
                className={"ann-chip-color-btn" + (color === 'blank' ? ' active' : '')}
                data-color="blank"
                onClick={() => recolor('blank')}
                title="No color (icon only)"
              />
            )}
            {HL_COLORS.map(c => (
              <button
                key={c}
                className={"ann-chip-color-btn" + (color === c ? ' active' : '')}
                data-color={c}
                onClick={() => recolor(c)}
                title={c}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Anchor text (italic quote) */}
            <div className="note-sheet-anchor">“{truncatedAnchor}”</div>
            {/* Date row — read mode only. Shows when the note was last edited
                (or when it was created if never edited). Subtle Cinzel caps
                so it doesn't compete with the body content. */}
            {mode === 'read' && (note.updated || note.created) && (
              <div className="note-sheet-date">{relativeDate(note.updated || note.created)}</div>
            )}
            {/* Edit mode: style toggle + color row (mirrors the selection
                toolbar). Pick a style — Highlight / Underline / Squiggle — and
                a color; squiggle/underline are always a visible color, while
                Highlight also offers a blank (invisible) swatch for a note
                with no visual overhead. */}
            {mode === 'edit' && (
              <div className="note-edit-style-row">
                <button className={"sel-style-btn" + (curStyle === 'highlight' ? ' active' : '')} onClick={() => setStyle('highlight')} title="Highlight">A</button>
                <button className={"sel-style-btn sel-style-btn-underline" + (curStyle === 'underline' ? ' active' : '')} onClick={() => setStyle('underline')} title="Underline">A</button>
                <button className={"sel-style-btn sel-style-btn-squiggle" + (curStyle === 'squiggle' ? ' active' : '')} onClick={() => setStyle('squiggle')} title="Squiggle underline">A</button>
                <div className="sel-toolbar-divider" />
                <div className="sel-toolbar-colors">
                  {curStyle === 'highlight' && (
                    <button
                      className={"sel-color-btn" + (color === 'blank' ? ' active' : '')}
                      data-color="blank"
                      onClick={() => recolor('blank')}
                      title="No color (icon only)"
                    />
                  )}
                  {HL_COLORS.map(c => (
                    <button
                      key={c}
                      className={"sel-color-btn sel-color-" + curStyle + (color === c ? ' active' : '')}
                      data-color={c}
                      onClick={() => recolor(c)}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Notebook chips (only in read mode and only if any are assigned) */}
            {mode === 'read' && (note.notebookIds || []).length > 0 && (
              <div className="note-sheet-nb-chips">
                {(note.notebookIds || []).map(id => {
                  const nb = NotebookStore.get(id);
                  if (!nb) return null;
                  return (
                    <span key={id} className="note-sheet-nb-chip">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" />
                        <polyline points="15 4 15 9 20 9" />
                      </svg>
                      {nb.name}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Body — read mode displays it; edit mode shows textarea */}
            {mode === 'read' ? (
              note.body
                ? <div className="note-sheet-body">{note.body}</div>
                : (
                  <button className="note-sheet-empty-btn" onClick={() => setMode('edit')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" />
                    </svg>
                    Add note text
                  </button>
                )
            ) : (
              <textarea
                ref={textareaRef}
                className="note-sheet-textarea"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your note…"
                onFocus={() => {
                  setTimeout(() => {
                    try { textareaRef.current && textareaRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
                  }, 220);
                }}
              />
            )}
            {/* Edit mode: notebook assignment row — always visible so users
                can assign to a notebook during creation, not just after. */}
            {mode === 'edit' && (
              <button
                className="note-edit-nb-row"
                onClick={() => { onOpenNotebookPicker && onOpenNotebookPicker(groupId); }}
              >
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" />
                  <polyline points="15 4 15 9 20 9" />
                </svg>
                {(note.notebookIds || []).length > 0
                  ? ((note.notebookIds || []).map(id => { const nb = NotebookStore.get(id); return nb ? nb.name : null; }).filter(Boolean).join(', ') || "Add to notebook…")
                  : "Add to notebook…"}
              </button>
            )}
            {/* Read mode: no Edit footer — use ⋯ → Edit. Edit mode: Cancel + Save.
                Save is always enabled — blank notes are valid. A dismissal
                with unsaved text swaps the footer for a discard ConfirmStrip
                (typed words are never silently dropped). */}
            {mode === 'edit' && (
              confirmingDiscard ? (
                <ConfirmStrip
                  className="note-sheet-discard-confirm"
                  question={freshUnsaved ? 'Discard this note?' : 'Discard changes?'}
                  yesLabel="Yes, discard"
                  onCancel={() => setConfirmingDiscard(null)}
                  onConfirm={() => performDiscard(confirmingDiscard)}
                />
              ) : (
                <div className="note-sheet-footer">
                  <button className="note-sheet-secondary" onClick={() => requestCancel('cancel')}>Cancel</button>
                  <button className="note-sheet-save" onClick={save}>Save</button>
                </div>
              )
            )}
            {/* ⋯ menu panel (read mode only). Color sub-panel was hoisted above
                so the menu only carries the action items + delete confirm. */}
            {mode === 'read' && menuOpen && (
              <div className="note-sheet-menu">
                {confirmDelete ? (
                  <ConfirmStrip
                    question="Delete this note?"
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={remove}
                  />
                ) : (
                  <>
                    <button className="note-sheet-menu-item" onClick={() => { setMenuOpen(false); setMode('edit'); }}>Edit note</button>
                    <button className="note-sheet-menu-item" onClick={() => { setMenuOpen(false); openColorPicker(); }}>Change color</button>
                    <button
                      className="note-sheet-menu-item"
                      onClick={() => { setMenuOpen(false); onOpenNotebookPicker && onOpenNotebookPicker(groupId); }}
                    >
                      {((note.notebookIds || []).length > 0 ? "Manage notebooks…" : "Add to notebook…")}
                    </button>
                    <button className="note-sheet-menu-item" onClick={share}>Share</button>
                    <button className="note-sheet-menu-item danger" onClick={() => setConfirmDelete(true)}>Delete note</button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
