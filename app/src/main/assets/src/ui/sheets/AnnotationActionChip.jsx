/* ═══════════════════════════════════════════════════════════════════════
   AnnotationActionChip — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function AnnotationActionChip({ chip, setHlTick, onClose, onNoteRequest }) {
  const [mode, setMode] = React.useState('main'); // 'main' | 'confirm' | 'colors'
  // Reset mode whenever a fresh chip opens (different group)
  const lastGroupRef = React.useRef(null);
  React.useEffect(() => {
    if (chip && chip.groupId !== lastGroupRef.current) {
      lastGroupRef.current = chip.groupId;
      setMode('main');
    }
  }, [chip]);
  if (!chip) return null;
  const { x, y, hlKey, groupId } = chip;
  const ann = (AnnotationStore.get(hlKey) || []).find(h => h.groupId === groupId);
  if (!ann) return null;
  const kind = ann.kind || 'highlight';
  const kindLabel = kind === 'underline' ? 'underline' : 'highlight';

  // Width estimate by mode for viewport clamping
  const widthByMode = { main: 200, confirm: 280, colors: 320 };
  const cw = widthByMode[mode] || 200;
  const cx = Math.max(8, Math.min(x - cw / 2, window.innerWidth - cw - 8));
  const cy = Math.max(8, y + 10);

  const remove = () => {
    AnnotationStore.removeGroup(groupId);
    NoteStore.remove(groupId);
    setHlTick(t => t + 1);
    onClose();
  };

  const recolor = (color) => {
    AnnotationStore.recolorGroup(groupId, color);
    if (kind === 'note') NoteStore.update(groupId, { color });
    setHlTick(t => t + 1);
    onClose();
  };

  const convertToNote = () => {
    AnnotationStore.convertGroup(groupId, 'note');
    // Build note record from the group's segments
    const segs = AnnotationStore.getByGroup(groupId);
    const fullText = segs.map(s => s.ann.text || '').join(' … ');
    const keys = [...new Set(segs.map(s => s.key))];
    NoteStore.set(groupId, { color: ann.color, fullText, keys, body: '' });
    setHlTick(t => t + 1);
    onClose();
    if (onNoteRequest) onNoteRequest(groupId, /*startInEditMode=*/true);
  };

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 2999 }}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="ann-chip"
        style={{ position: 'fixed', left: cx, top: cy, zIndex: 3000 }}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === 'main' && (
          <>
            <button
              className="ann-chip-btn danger"
              onClick={() => setMode('confirm')}
              title="Remove"
            >
              <svg viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>Remove</span>
            </button>
            <button
              className="ann-chip-btn"
              onClick={() => setMode('colors')}
              title="Recolor"
            >
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
                <circle cx="8" cy="9" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="16" cy="9" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="17" cy="14" r="1.4" fill="currentColor" stroke="none" />
              </svg>
              <span>Color</span>
            </button>
            {kind !== 'note' && (
              <button
                className="ann-chip-btn"
                onClick={convertToNote}
                title="Convert to note"
              >
                <svg viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="16" y2="17" />
                </svg>
                <span>Note</span>
              </button>
            )}
          </>
        )}
        {mode === 'confirm' && (
          <ConfirmStrip
            question={`Remove this ${kindLabel}?`}
            yesLabel="Yes, remove"
            onCancel={() => setMode('main')}
            onConfirm={remove}
          />
        )}
        {mode === 'colors' && (
          <div className="ann-chip-colors">
            <button className="ann-chip-back" onClick={() => setMode('main')} title="Back">‹</button>
            {HL_COLORS.map(c => (
              <button
                key={c}
                className={'ann-chip-color-btn' + (ann.color === c ? ' active' : '')}
                data-color={c}
                onClick={() => recolor(c)}
                title={c}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
