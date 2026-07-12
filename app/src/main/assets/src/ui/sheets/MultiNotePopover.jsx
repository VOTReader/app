/* ═══════════════════════════════════════════════════════════════════════
   MultiNotePopover — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';

export function MultiNotePopover({ payload, onClose, onPick }) {
  const popRef = React.useRef(null);
  const popW = 320;
  const x = payload ? payload.x : 0;
  const y = payload ? payload.y : 0;
  const notes = React.useMemo(() => {
    const gids = payload ? payload.groupIds : [];
    return gids.map(gid => NoteStore.get(gid)).filter(Boolean);
  }, [payload]);
  // Computed placement — kept on-screen. The popover anchors below the tap
  // point by default, but flips ABOVE when it would overflow the bottom and
  // there is more room above, and caps its height with an internal scroll so
  // every note stays reachable (previously a point near the bottom of the
  // viewport pushed the lower rows off-screen with no way to scroll to them).
  const [pos, setPos] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!payload || notes.length === 0) return;
    const el = popRef.current;
    if (!el) return;
    const vh = window.innerHeight;
    const margin = 8;
    const gap = 12;
    const left = Math.max(margin, Math.min(x - popW / 2, window.innerWidth - popW - margin));
    const naturalH = el.scrollHeight; // full content height, ignoring any cap
    const spaceBelow = vh - (y + gap) - margin;
    const spaceAbove = y - gap - margin;
    let top, maxHeight;
    if (naturalH <= spaceBelow) {
      top = y + gap; maxHeight = naturalH;
    } else if (spaceAbove > spaceBelow) {
      maxHeight = Math.min(naturalH, spaceAbove);
      top = Math.max(margin, y - gap - maxHeight);
    } else {
      top = y + gap; maxHeight = spaceBelow;
    }
    setPos({ left, top, maxHeight });
  }, [payload, x, y, notes.length]);

  if (!payload) return null;
  if (notes.length === 0) return null;
  // First-paint placement (pre-measure): clamp below the point so the popover
  // never renders off-screen even for one frame; the layout effect refines it.
  const fallbackLeft = Math.max(8, Math.min(x - popW / 2, window.innerWidth - popW - 8));
  const fallbackTop = Math.max(8, y + 12);
  const style = pos
    ? { left: pos.left, top: pos.top, width: popW, maxHeight: pos.maxHeight, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }
    : { left: fallbackLeft, top: fallbackTop, width: popW, maxHeight: Math.max(120, window.innerHeight - fallbackTop - 8), overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' };
  return (
    <>
      <div className="multinote-overlay" onClick={onClose} />
      <div ref={popRef} className="multinote-popover" style={style}>
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
                <span className="multinote-row-preview">{n.body || (n.fullText ? "“" + normalizeExcerptDisplay(n.fullText) + "”" : 'Empty note')}</span>
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
