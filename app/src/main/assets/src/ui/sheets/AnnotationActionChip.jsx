/* ═══════════════════════════════════════════════════════════════════════
   AnnotationActionChip — Cluster D (esbuild bundle-d.js)
   r-mark (the UI pass, mock v2 readers): a tapped mark opens the selection's
   sheet docked at the foot: its words, the style switch, the ten colours, then
   Add note, Copy, Share and Remove. A style or colour tap applies and closes.
   ═══════════════════════════════════════════════════════════════════════ */

import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { uncoveredLine } from '../../renderer/mark-overlap.js';
import { snapshotGroups, offerUndoRemoved } from '../../utils/annotation-undo.js';
import { copyText as copyToClipboard, shareText } from '../../utils/copy-share.js';
import { UiIcon } from '../components/UiIcon.jsx';

const STYLES = [['highlight', 'Highlight', 'Highlighter'], ['underline', 'Underline', 'Underline'], ['squiggle', 'Squiggle underline', 'Squiggle']];

export function AnnotationActionChip({ chip, onClose, onNoteRequest }) {
  const [confirming, setConfirming] = React.useState(false);
  // Reset whenever a fresh chip opens (different group)
  const lastGroupRef = React.useRef(null);
  React.useEffect(() => {
    if (chip && chip.groupId !== lastGroupRef.current) {
      lastGroupRef.current = chip.groupId;
      setConfirming(false);
    }
  }, [chip]);
  // Same modal treatment its popover siblings got (MultiNotePopover,
  // BookmarkPopover): scrim + Escape already existed; this adds the
  // focus/semantics half. Must run before the early returns (hooks rule).
  const trapRef = useFocusTrap(!!chip);
  if (!chip) return null;
  const { hlKey, groupId } = chip;
  const ann = (AnnotationStore.get(hlKey) || []).find(h => h.groupId === groupId);
  if (!ann) return null;
  const kind = ann.kind || 'highlight';
  const kindLabel = kind === 'underline' ? 'underline' : kind === 'squiggle' ? 'squiggle' : 'highlight';
  // Note-ness is a NoteStore entry, not the kind.
  const isNote = typeof NoteStore !== 'undefined' && !!NoteStore.get(groupId);
  const segs = AnnotationStore.getByGroup ? AnnotationStore.getByGroup(groupId) : [];
  // Write-time normalize (see SelectionToolbar): old collapsed ann.text must not seed a fresh note's fullText.
  const words = normalizeExcerptDisplay((segs.length ? segs.map(s => s.ann.text || '') : [ann.text || '']).join(' … '));

  const remove = () => {
    const gone = snapshotGroups([groupId]);   // A06.6
    AnnotationStore.removeGroup(groupId);
    NoteStore.remove(groupId);
    onClose();
    offerUndoRemoved(gone, isNote ? 'Note removed' : kindLabel.charAt(0).toUpperCase() + kindLabel.slice(1) + ' removed');
  };

  const recolor = (color) => {
    AnnotationStore.recolorGroup(groupId, color);
    if (isNote) NoteStore.update(groupId, { color });
    onClose();
  };

  const restyle = (newKind) => {
    // Change the VISUAL style of an existing annotation. Note-ness is unchanged.
    AnnotationStore.convertGroup(groupId, newKind);
    // Mirror the NoteSheet: restyling a note updates the last-used note default.
    if (isNote && typeof NoteDefaultStore !== 'undefined') NoteDefaultStore.set(newKind, ann.color);
    onClose();
  };

  const toast = (m) => { if (typeof showToast === 'function') showToast(m); };
  const copy = () => { onClose(); copyToClipboard(words).then((r) => toast(r === 'copied' ? 'Copied' : 'Could not copy')); };
  const share = () => { onClose(); shareText(words).then((r) => { if (r === 'copied-instead') toast('Copied'); else if (r === 'failed') toast('Could not share'); }); };

  const convertToNote = () => {
    // Attach a note to this mark, keeping its style + colour; record it as the next note's default.
    const keys = [...new Set(segs.map(s => s.key))];
    NoteStore.set(groupId, { color: ann.color, fullText: words, keys, body: '' });
    if (typeof NoteDefaultStore !== 'undefined') {
      NoteDefaultStore.set(kind === 'note' ? 'highlight' : kind, ann.color);
    }
    onClose();
    // freshGroup=false — the mark existed BEFORE the note; discarding the
    // never-saved note must remove only the NoteStore record, not the mark.
    if (onNoteRequest) onNoteRequest(groupId, /*startInEditMode=*/true, /*freshGroup=*/false);
  };

  return (
    <>
      <div
        className="rd-sheet-scrim"
        aria-hidden="true"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="ann-chip rd-sheet"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${kindLabel} actions`}
        onClick={(e) => e.stopPropagation()}
      >
        {confirming ? (
          <ConfirmStrip
            // RC.11: a mark it covers comes back, so the question says so.
            question={[`Remove this ${kindLabel}?`, uncoveredLine([groupId], AnnotationStore)].filter(Boolean).join(' ')}
            yesLabel="Yes, remove"
            onCancel={() => setConfirming(false)}
            onConfirm={remove}
          />
        ) : (
          <>
            {words && <div className="rd-quote">{words}</div>}
            <div className="ui-seg rd-seg" role="group" aria-label="Style">
              {STYLES.map(([id, label, word]) => (
                <button key={id} type="button" className={'ui-seg-item sel-style-btn' + (id === 'highlight' ? '' : ' sel-style-btn-' + id) + (kind === id || (id === 'highlight' && kind === 'note') ? ' active' : '')}
                  onClick={() => restyle(id)} title={label} aria-label={label} aria-pressed={kind === id || (id === 'highlight' && kind === 'note')}>{word}</button>
              ))}
            </div>
            <div className="rd-colors">
              {HL_COLORS.map(c => (
                <button key={c} type="button" className={'sel-color-btn' + (ann.color === c ? ' active' : '')} data-color={c}
                  onClick={() => recolor(c)} title={c} aria-label={c} aria-pressed={ann.color === c} />
              ))}
            </div>
            {/* Destructive action LAST, in red, so a tap aimed at the common actions can't land on it. */}
            <div className="rd-tiles is-4">
              {!isNote && <button type="button" className="rd-tile ann-chip-btn" onClick={convertToNote} title="Add note" aria-haspopup="dialog"><UiIcon name="note" /><span>Add note</span></button>}
              <button type="button" className="rd-tile ann-chip-btn" onClick={copy} title="Copy"><UiIcon name="copy" /><span>Copy</span></button>
              <button type="button" className="rd-tile ann-chip-btn" onClick={share} title="Share"><UiIcon name="share" /><span>Share</span></button>
              <button type="button" className="rd-tile ann-chip-btn is-danger" onClick={() => setConfirming(true)} title="Remove"><UiIcon name="trash" /><span>Remove</span></button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
