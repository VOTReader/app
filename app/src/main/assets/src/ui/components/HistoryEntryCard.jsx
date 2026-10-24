/* ═══════════════════════════════════════════════════════════════════════
   HistoryEntryCard — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* `chip` is the shared reading chip (components/ReadingMinChip.jsx), passed
   in rather than derived here: the corpus lookup it needs belongs to the
   screen, which can resolve one book per render instead of one per row. */
import { timeAgo } from '../../utils/dates.js';

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
  /* n130 (A01.2/A07.10): the row used to be num | title | chip | time, four columns
     fighting for 375 px, so a long title clamped to a stub and the bare number read like a
     rank. Now the title has the full width and wraps at word boundaries, the number is named
     on the eyebrow beside the collection ("PSALMS · CHAPTER 23"), and progress, time and visits
     share one meta line under the title. An untitled row already says "Chapter 1" as its title,
     so it names no number twice. */
  const numLabel = title ? fallback : null;
  return (
    <button className="chapter-card-btn history-entry-card" onClick={() => onSelect(entry)}>
      <div className="chapter-card-info">
        {/* Absent, not empty: an unresolvable row drops the line instead of
            printing '' (or, for a chapter row with no bookTitle, 'undefined'). */}
        {cardLabel || numLabel ? (
          <div className="history-entry-eyebrow">
            {cardLabel ? <span className="chapter-card-label">{cardLabel}</span> : null}
            {numLabel ? <span className="history-entry-num">{numLabel}</span> : null}
          </div>
        ) : null}
        <div className="chapter-card-title">{title || fallback}</div>
        <div className="history-entry-meta">
          {chip}
          <span className="history-entry-time">{timeAgo(entry.ts)}</span>
          {/* A day's repeats of this reading are one row (HistoryScreen folds them); more than one
              visit says so beside the newest visit's time. Absent, not "1 visits". */}
          {entry.visits > 1 ? <span className="history-entry-visits">{entry.visits} visits</span> : null}
        </div>
      </div>
    </button>
  );
}
