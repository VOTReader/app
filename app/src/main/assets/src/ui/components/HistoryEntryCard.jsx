/* ═══════════════════════════════════════════════════════════════════════
   HistoryEntryCard — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* `chip` is the shared reading chip (components/ReadingMinChip.jsx), passed
   in rather than derived here: the corpus lookup it needs belongs to the
   screen, which can resolve one book per render instead of one per row. */
export function HistoryEntryCard({ entry, onSelect, chip = null }) {
  const isLetter = entry.type === 'letter';
  const isStudy = entry.type === 'study-chapter';
  const num = isLetter ? entry.letterNum : entry.chapterNum;
  const title = isLetter ? entry.letterTitle : entry.chapterTitle || null;
  const _volCol = entry.volumeScreen ? COL_BY_INDEX_SC.get(entry.volumeScreen) : null;
  const cardLabel = isStudy ?
  studyAbbrev(entry.studySlug, entry.studyTitle) :
  isLetter ? entry.volume === 1 ? 'Volume One' : _volCol ? _volCol.label : 'Volume Two' : entry.bookTitle;
  const fallback = isLetter ? `Letter ${num}` : isStudy ? `Part ${num}` : `Chapter ${num}`;
  return (
    <button className="chapter-card-btn" onClick={() => onSelect(entry)}>
      <span className="chapter-card-num">{num}</span>
      <div className="chapter-card-divider" />
      <div className="chapter-card-info">
        <div className="chapter-card-label">{cardLabel}</div>
        <div className="chapter-card-title">{title || fallback}</div>
      </div>
      {chip}
      <div className="history-entry-time">{timeAgo(entry.ts)}</div>
    </button>
  );
}
