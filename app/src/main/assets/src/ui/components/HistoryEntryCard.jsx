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
  /* C2-C [C2]: the collection line used to END at 'Volume Two' — every letter
     row the registry could not resolve was labelled Volume Two on a screen
     whose whole job is telling you what you read. Resolve through the
     registry first (every row written since `volumeScreen` shipped carries
     it); legacy rows carry only the numeric `volume`, which is a RECORDED
     datum, not a guess, so 1 and 2 still name themselves. Anything left
     shows no collection line at all rather than a confident wrong one. */
  const _legacyVol = entry.volume === 1 ? 'Volume One' : entry.volume === 2 ? 'Volume Two' : '';
  const cardLabel = isStudy ?
  studyAbbrev(entry.studySlug, entry.studyTitle) :
  isLetter ? (_volCol ? _volCol.label : _legacyVol) : entry.bookTitle;
  const fallback = isLetter ? `Letter ${num}` : isStudy ? `Part ${num}` : `Chapter ${num}`;
  return (
    <button className="chapter-card-btn" onClick={() => onSelect(entry)}>
      <span className="chapter-card-num">{num}</span>
      <div className="chapter-card-divider" />
      <div className="chapter-card-info">
        {/* Absent, not empty: an unresolvable row drops the line instead of
            printing '' (or, for a chapter row with no bookTitle, 'undefined'). */}
        {cardLabel ? <div className="chapter-card-label">{cardLabel}</div> : null}
        <div className="chapter-card-title">{title || fallback}</div>
      </div>
      {chip}
      <div className="history-entry-time">{timeAgo(entry.ts)}</div>
    </button>
  );
}
