/* ═══════════════════════════════════════════════════════════════════════
   HistoryEntryCard — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* `chip` is the shared reading chip (components/ReadingMinChip.jsx), passed
   in rather than derived here: the corpus lookup it needs belongs to the
   screen, which can resolve one book per render instead of one per row. */
import { timeAgo } from '../../utils/dates.js';
import { ListRow } from './UiParts.jsx';

export function HistoryEntryCard({ entry, onSelect, chip = null, onRemove = null }) {
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
  /* Mock v2 l-hist: one row per place (rule 12): the title, then one meta line "Volume One · Letter 1 · 40% read",
     the time at the right. An untitled row already says "Chapter 1" as its title, so it names no number twice; an
     unresolvable collection drops out of the line instead of printing '' (or 'undefined'). A day's repeats of a
     reading are one row (HistoryScreen folds them). Half-baked 23 (main 66daf0de7): no visit count, no time estimate;
     the chip is the tracker's "N% read" / "Read". */
  const numLabel = title ? fallback : null;
  const parts = [
    cardLabel ? <span key="l" className="history-entry-label">{cardLabel}</span> : null,
    numLabel ? <span key="n" className="history-entry-num">{numLabel}</span> : null,
    chip ? <React.Fragment key="c">{chip}</React.Fragment> : null,
  ].filter(Boolean);
  const meta = parts.length ? parts.flatMap((p, i) => (i ? [' \xB7 ', p] : [p])) : null;
  return (
    <ListRow noLead className="history-entry-card" title={title || fallback} meta={meta}
      value={timeAgo(entry.ts)} onClick={() => onSelect(entry)} chevron={false}
      remove={onRemove ? { label: 'Remove ' + (title || fallback) + ' from history', onClick: () => onRemove(title || fallback) } : null} />
  );
}
