/* ═══════════════════════════════════════════════════════════════════════
   NoteSheet — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { uncoveredLine } from '../../renderer/mark-overlap.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { shareText } from '../../utils/copy-share.js';
import { passageSourceFor } from '../../utils/passage-copy.js';
import { sharedText } from '../../utils/share-ending.js';
import { relativeDate } from '../../utils/dates.js';
import { UiIcon } from '../components/UiIcon.jsx';
import {
  readNoteDraft, writeNoteDraft, clearNoteDraft, noteDraftRecoverable, clearNoteDraftWhenSaved, NOTE_DRAFT_DELAY_MS,
} from '../../utils/note-draft.js';

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
  // dl4 (utils/note-draft.js): words typed here before a kill, a closed tab or a crash
  // come back in the editor, unsaved, as they were left.
  const [recovered] = React.useState(() => {
    const d = readNoteDraft(groupId);
    return noteDraftRecoverable(d, note) ? d : null;
  });
  const [mode, setMode] = React.useState(startInEditMode || recovered ? 'edit' : 'read');
  const [body, setBody] = React.useState(recovered ? recovered.body : (note ? note.body || '' : ''));
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [showColors, setShowColors] = React.useState(false);
  // Discard-gate for an edit-mode dismissal with unsaved text. Holds the
  // dismissal INTENT so confirming lands where the user was headed:
  //   'cancel' — the footer Cancel button (existing note → back to read mode)
  //   'close'  — backdrop / Escape / Android back (sheet closes entirely)
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(/** @type {null | 'cancel' | 'close'} */ (null));
  const textareaRef = React.useRef(null);
  // The textarea's focus → scroll-into-view delays, stopped when the sheet closes (leak hunt 2026-11-01).
  const focusScrollsRef = React.useRef(/** @type {Set<ReturnType<typeof setTimeout>>} */ (new Set()));
  React.useEffect(() => {
    const pending = focusScrollsRef.current;   // one Set for the sheet's life
    return () => { pending.forEach((t) => clearTimeout(t)); pending.clear(); };
  }, []);

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
  // ds2: the text being typed lives only here, so an app update waits until the edit ends.
  useUpdateHold(mode === 'edit', 'note');

  // dl4: the words being typed are written down (synchronously, in localStorage) a beat
  // after typing stops, when the page is hidden or left, and when the sheet goes away
  // without Save or Cancel. Refs, so the mount-only listeners read the latest words.
  const bodyRef = React.useRef(body); bodyRef.current = body;
  const modeRef = React.useRef(mode); modeRef.current = mode;
  const discardedRef = React.useRef(false);   // Cancel's discard or Delete: the words go on purpose
  const keepDraft = React.useCallback(() => {
    if (discardedRef.current || modeRef.current !== 'edit') return;
    const cur = NoteStore.get(groupId);
    if (!cur) return;
    // Unchanged words write nothing, unless a draft is already down: it follows the words,
    // so typing back to the saved text never leaves older words to be offered.
    if (bodyRef.current !== (cur.body || '') || readNoteDraft(groupId)) writeNoteDraft(groupId, bodyRef.current);
  }, [groupId]);
  React.useEffect(() => {
    // A draft no longer worth offering (saved since, or the same words) goes once the note
    // store's latest write is on disk. A Save whose write failed (a full device) left those
    // words in memory only, so the draft is then the one copy that outlives the app closing.
    if (!recovered && note) {
      const stale = readNoteDraft(groupId);
      if (stale) clearNoteDraftWhenSaved(NoteStore, groupId, stale.body);
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') keepDraft(); };
    window.addEventListener('pagehide', keepDraft);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', keepDraft);
      document.removeEventListener('visibilitychange', onVisibility);
      keepDraft();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: keepDraft reads refs; `recovered` and `note` are the opening values
  }, []);
  React.useEffect(() => { if (mode === 'edit') discardedRef.current = false; }, [mode]);
  React.useEffect(() => {
    if (mode !== 'edit') return undefined;
    const t = setTimeout(keepDraft, NOTE_DRAFT_DELAY_MS);
    return () => clearTimeout(t);
  }, [body, mode, keepDraft]);
  // [13] focus trap — Tab stays inside the sheet (mounted = open).
  const trapRef = useFocusTrap(true);

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

  // s29.2: saving an edit of a note that already had words goes back to reading it; a new note closes as before.
  const save = () => {
    const edited = !!(note.body || '').trim();
    // dl4: the words stay written down until the save that carries them is on disk.
    writeNoteDraft(groupId, body);
    NoteStore.update(groupId, { body });
    clearNoteDraftWhenSaved(NoteStore, groupId, body);
    if (edited) setMode('read'); else onClose();
  };

  /** @param {'cancel' | 'close'} intent */
  function performDiscard(intent) {
    discardedRef.current = true;   // the words go on purpose; editing again re-arms the draft (below)
    clearNoteDraft(groupId);
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
    if (confirmDelete) { setConfirmDelete(false); return; }
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

  // ds5 A06.1: the delete takes the note's mark with it, so the confirm says so, as the toolbar's
  // remove does. An icon-only note (a blank highlight) has no visible mark to name.
  // RC.11: and when that mark sat over an older one, the older one comes back, so it says that too.
  const deleteQuestion = [(curStyle === 'highlight' && color === 'blank')
    ? 'Delete this note?'
    : `Delete this note and its ${curStyle === 'highlight' ? 'highlight' : curStyle === 'underline' ? 'underline' : 'squiggle'}?`,
  uncoveredLine([groupId], AnnotationStore)].filter(Boolean).join(' ');

  const remove = () => {
    discardedRef.current = true;   // dl4: a deleted note keeps no draft
    clearNoteDraft(groupId);
    AnnotationStore.removeGroup(groupId);
    NoteStore.remove(groupId);
    onClose();
  };

  // A15: the outcome is reported, never swallowed. The note stays open on
  // screen, so a refusal points the reader at its text rather than at a
  // second sheet; a cancelled native share stays quiet.
  const share = () => {
    // n6-08: the passage travels with a link (since 2026-11-11 the link alone), as the
    // selection Share's does (A8); the link names the passage, never the
    // note, and the reader's own journal sends the words alone.
    // U07.2: the passage goes in quotes with its reference (Copy's: "John 3:16 (NKJV)") and the reader's words as
    // "My note:", so the note can't read as part of the verse.
    // share-fn (Corbin 2026-10-25): the link is the website's where the passage has a
    // page there, as the selection's Share sends, unless Share Includes says App Link.
    // SHARE1 (Corbin 2026-11-12): what follows is Settings > Sharing > When I share (utils/share-ending.js), named by
    // the note's first and last blocks ("John 3:16-18"); "My note:" sits between the quote and it.
    const keys = [...new Set(segs.map((s) => s.key))];
    const source = passageSourceFor(keys.length > 1 ? [keys[0], keys[keys.length - 1]] : keys, anchor.split(' … ').map((l) => l.split(/\s+/)));
    const text = sharedText(anchor, source, { action: 'share', note: note.body || '' });
    shareText(text).then((outcome) => {
      if (typeof showToast !== 'function') return;
      if (outcome === 'copied-instead') {
        showToast({ id: 'vot-toast-copy', className: 'vot-toast', text: 'Copied instead. Paste the note where you want to share it.' });
      } else if (outcome === 'failed') {
        showToast({ id: 'vot-toast-copy', className: 'vot-toast', text: 'Couldn’t share or copy. Select the note’s text to copy it by hand.', durationMs: 6000, ariaLive: 'assertive' });
      }
    });
  };


  // r-note / r-note-view (the UI pass, mock v2 readers): one bottom sheet. Writing: a title, the words as a
  // quote, the text area, "Colour" (style switch, blank + ten), a Notebook row, Cancel | Save. Reading: the
  // colour dot, "Note" and a close, the quote, the note, "when · notebook", then Edit / Notebook / Share /
  // Delete as four worded buttons (no menu inside a menu).
  const nbNames = (note.notebookIds || []).map(id => { const nb = NotebookStore.get(id); return nb ? nb.name : null; }).filter(Boolean);
  const openPicker = () => { onOpenNotebookPicker && onOpenNotebookPicker(groupId); };
  const styleBtn = (id, label, word) => (
    <button key={id} type="button" className={'ui-seg-item sel-style-btn' + (id === 'highlight' ? '' : ' sel-style-btn-' + id) + (curStyle === id ? ' active' : '')} onClick={() => setStyle(id)} aria-label={label} aria-pressed={curStyle === id}>{word}</button>
  );
  const colours = (
    <div className="rd-colors note-sheet-colors">
      {curStyle === 'highlight' && (
        <button type="button" className={'sel-color-btn' + (color === 'blank' ? ' active' : '')} data-color="blank"
          onClick={() => recolor('blank')} title="No color (icon only)" aria-label="No color (icon only)" aria-pressed={color === 'blank'} />
      )}
      {HL_COLORS.map(c => (
        <button key={c} type="button" className={'sel-color-btn sel-color-' + curStyle + (color === c ? ' active' : '')} data-color={c}
          onClick={() => recolor(c)} title={c} aria-label={c} aria-pressed={color === c} />
      ))}
    </div>
  );
  const when = (note.updated || note.created) ? relativeDate(note.updated || note.created) : '';
  const where = nbNames.length ? nbNames.join(', ') : 'Not in a notebook';

  return (
    <div className="note-sheet-overlay" onClick={requestClose}>
      <div className="note-sheet rd-form-sheet rd-note-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="note-sheet-title" onClick={e => e.stopPropagation()}>
        {mode === 'edit' ? (
          <>
            <div className="ui-sheet-head">
              <h2 className="ui-sheet-title" id="note-sheet-title">{note.body ? 'Edit note' : 'New note'}</h2>
            </div>
            <div className="rd-quote note-sheet-anchor">{truncatedAnchor}</div>
            <textarea
              ref={textareaRef}
              className="note-sheet-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your note…"
              aria-label="Note text"
              onFocus={() => {
                const t = setTimeout(() => {
                  focusScrollsRef.current.delete(t);
                  try { textareaRef.current && textareaRef.current.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() }); } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
                }, 220);
                focusScrollsRef.current.add(t);
              }}
            />
            <div className="rd-label">Colour</div>
            <div className="ui-seg rd-seg" role="group" aria-label="Style">
              {styleBtn('highlight', 'Highlight', 'Highlighter')}
              {styleBtn('underline', 'Underline', 'Underline')}
              {styleBtn('squiggle', 'Squiggle underline', 'Squiggle')}
            </div>
            {colours}
            <div className="ui-group is-inset rd-note-nb">
              <button type="button" className="ui-row is-one no-lead ui-row-press note-edit-nb-row" onClick={openPicker}>
                <span className="ui-row-title">Notebook</span>
                <span className={'ui-row-value' + (nbNames.length ? '' : ' is-none')}>{nbNames.length ? nbNames.join(', ') : 'Not in one'}</span>
                <UiIcon name="chev" size="sm" className="ui-row-chev" />
              </button>
            </div>
            {confirmingDiscard ? (
              <ConfirmStrip
                className="note-sheet-discard-confirm"
                question={freshUnsaved ? 'Discard this note?' : 'Discard changes?'}
                yesLabel="Yes, discard"
                onCancel={() => setConfirmingDiscard(null)}
                onConfirm={() => performDiscard(confirmingDiscard)}
              />
            ) : (
              <div className="ui-btn-row rd-foot">
                <button type="button" className="ui-btn note-sheet-secondary" onClick={() => requestCancel('cancel')}>Cancel</button>
                <button type="button" className="ui-btn is-primary note-sheet-save" onClick={save}>Save</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="rd-note-head">
              <button type="button" className="note-sheet-color-hit" onClick={() => setShowColors(v => !v)} title="Change color" aria-label="Change note color" aria-expanded={showColors}>
                <span className="note-sheet-color-dot sel-color-btn" data-color={color} aria-hidden="true" />
              </button>
              <h2 className="ui-sheet-title" id="note-sheet-title">Note</h2>
              <button type="button" className="rd-field-clear rd-note-close" onClick={requestClose} aria-label="Close"><UiIcon name="x" /></button>
            </div>
            {showColors && colours}
            <div className="rd-quote note-sheet-anchor">{truncatedAnchor}</div>
            {note.body
              ? <div className="note-sheet-body">{note.body}</div>
              : <button type="button" className="ui-btn is-text note-sheet-empty-btn" onClick={() => setMode('edit')}><UiIcon name="pen" size="sm" />Add note text</button>}
            <div className="note-sheet-date">{[when, where].filter(Boolean).join(' · ')}</div>
            {confirmDelete ? (
              <div className="note-sheet-menu">
                <ConfirmStrip question={deleteQuestion} onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
              </div>
            ) : (
              <div className="rd-tiles is-4">
                <button type="button" className="rd-tile" onClick={() => setMode('edit')}><UiIcon name="pen" /><span>Edit</span></button>
                <button type="button" className="rd-tile" onClick={openPicker} aria-haspopup="dialog"><UiIcon name="journal" /><span>Notebook</span></button>
                <button type="button" className="rd-tile" onClick={share}><UiIcon name="share" /><span>Share</span></button>
                <button type="button" className="rd-tile is-danger" onClick={() => setConfirmDelete(true)}><UiIcon name="trash" /><span>Delete</span></button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
