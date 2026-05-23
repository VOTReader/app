/* ═══════════════════════════════════════════════════════════════════════
   MultiNotePopover — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function MultiNotePopover({ payload, onClose, onPick }) {
  if (!payload) return null;
  const { groupIds, x, y } = payload;
  const notes = groupIds.map(gid => NoteStore.get(gid)).filter(Boolean);
  if (notes.length === 0) return null;
  const popW = 320;
  const px = Math.max(8, Math.min(x - popW / 2, window.innerWidth - popW - 8));
  const py = Math.max(8, y + 12);
  return (
    <>
      <div className="multinote-overlay" onClick={onClose} />
      <div className="multinote-popover" style={{ left: px, top: py, width: popW }}>
        <div className="multinote-header">{notes.length} notes here</div>
        {notes.map(n => {
          const swatchBg = ({
            yellow: '#ffd700', green: '#76ff03', pink: '#ff4081', red: '#f44336',
            orange: '#ff9100', blue: '#2196f3', purple: '#ba68c8', teal: '#00bcd4',
            brown: '#8d6e63', gray: '#9e9e9e', cyan: '#00bcd4'
          })[n.color] || '#ffd700';
          const noteNbs = (n.notebookIds || []).map(id => NotebookStore.get(id)).filter(Boolean);
          return (
            <button
              key={n.groupId}
              className="multinote-row"
              onClick={() => onPick(n.groupId)}
            >
              <span className="multinote-row-swatch" style={{ background: swatchBg }} />
              <span className="multinote-row-body">
                <span className="multinote-row-preview">{n.body || (n.fullText ? "“" + n.fullText + "”" : 'Empty note')}</span>
                <span className="multinote-row-meta">
                  {relativeDate(n.updated || n.created)}
                  {noteNbs.length > 0 && (' · ' + noteNbs.map(nb => nb.name).join(' · '))}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
