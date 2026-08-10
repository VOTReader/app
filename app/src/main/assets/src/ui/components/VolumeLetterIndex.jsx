/* ═══════════════════════════════════════════════════════════════════════
   VolumeLetterIndex — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayButton, AudioSectionChips } from './AudioPlayButton.jsx';
import { readingChipWpm, readingMinChip } from './ReadingMinChip.jsx';

/* Read marks are COUNT-aware (2026-08-03): a re-read letter shows ✓ ×N.
   Rendered as one shared element so every index surface stays identical. */
export function ReadCheck({ count }) {
  if (!count) return null;
  return (
    <span className="read-check" aria-label={count > 1 ? `Read ${count} times` : 'Read'}>
      {"✓"}
      {count > 1 && <span className="read-check-count" aria-hidden="true">{"×" + count}</span>}
    </span>
  );
}

export function VolumeLetterIndex({ volumeTitle, eyebrow, letters, preface, onSelect, onSelectPreface, currentLetter, isRead, readCount, progressKeyFor, markAsReadEnabled, columns, onPlayAll, sections, onPlaySection }) {
  const currentRef = React.useRef(null);
  React.useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, []);
  // "~N min" per row — or "N% · ~M min left" for an IN-PROGRESS item (the
  // tracker left a frontier inside it; [26] smart-resume). One shared chip
  // for every index surface: components/ReadingMinChip.jsx. progressKeyFor
  // threads the SAME v1:<bid>:<cid> key the tracker records under; absent
  // (legacy caller) → cold chip only.
  const _wpm = readingChipWpm();
  const minChip = (item, itemId) => readingMinChip(
    item, (itemId != null && progressKeyFor) ? progressKeyFor(itemId) : null, _wpm
  );
  const compactMeta = (item, itemId) => {
    const chip = minChip(item, itemId);
    const read = markAsReadEnabled && isRead(itemId)
      ? <ReadCheck count={readCount ? readCount(itemId) : 1} />
      : null;
    if (!chip && !read) return null;
    return <div className="two-col-meta">{chip}{read}</div>;
  };
  return (
    <div className="vol-index">
      <div className="vol-index-header">
        <div className="vol-index-eyebrow">{eyebrow || "The Volumes of Truth"}</div>
        <h1 className="vol-index-title">{volumeTitle}</h1>
        <div className="vol-index-ornament">
          <div className="vol-index-ornament-line" />
          <div className="vol-index-ornament-diamond" />
          <div className="vol-index-ornament-line r" />
        </div>
        {/* Streaming audio (2026-08-05): queue the whole collection like a
            Bandcamp album; WTLB additionally offers its Part/Section range
            compilations as chips. Props come from screen-routes' colIdxProps
            and are absent when the collection has no tracks. */}
        {onPlayAll && (
          <div className="vol-index-play-row">
            <AudioPlayButton variant="playall" label="Play All" onClick={onPlayAll} />
          </div>
        )}
        {sections && onPlaySection && (
          <AudioSectionChips sections={sections} onPlay={onPlaySection} />
        )}
      </div>
      <div className={`chapter-cards${columns === 2 ? " two-col" : ""}`}>
        {preface && (columns === 2 ? (
          <button className="chapter-card-btn" onClick={() => onSelectPreface && onSelectPreface(preface.id)}>
            <div className="two-col-inner">
              <div className="two-col-num">0</div>
              <div className="two-col-title">{preface.title}</div>
              {compactMeta(preface, preface.id)}
            </div>
          </button>
        ) : (
          <button className="chapter-card-btn" onClick={() => onSelectPreface && onSelectPreface(preface.id)}>
            <span className="chapter-card-num">0</span>
            <div className="chapter-card-divider" />
            <div className="chapter-card-info">
              <div className="chapter-card-label">Preface</div>
              <div className="chapter-card-title">{preface.title}</div>
            </div>
            {minChip(preface, preface.id)}
            {markAsReadEnabled && isRead(preface.id) && (
              <ReadCheck count={readCount ? readCount(preface.id) : 1} />
            )}
          </button>
        ))}

        {letters.map((letter) => {
          const isCurrent = letter.id === currentLetter;
          if (columns === 2) {
            return (
              <button
                key={letter.id}
                className={`chapter-card-btn${isCurrent ? " is-current" : ""}`}
                ref={isCurrent ? currentRef : null}
                onClick={() => onSelect(letter.id)}
              >
                <div className="two-col-inner">
                  <div className="two-col-num">{letter.num}</div>
                  <div className="two-col-title">{letter.title}</div>
                  {compactMeta(letter, letter.id)}
                </div>
              </button>
            );
          }
          return (
            <button
              key={letter.id}
              className={`chapter-card-btn${isCurrent ? " is-current" : ""}`}
              ref={isCurrent ? currentRef : null}
              onClick={() => onSelect(letter.id)}
            >
              <span className="chapter-card-num">{letter.num}</span>
              <div className="chapter-card-divider" />
              <div className="chapter-card-info">
                <div className="chapter-card-label">{letter.date}</div>
                <div className="chapter-card-title">{letter.title}</div>
              </div>
              {minChip(letter, letter.id)}
              {markAsReadEnabled && isRead(letter.id) && (
                <ReadCheck count={readCount ? readCount(letter.id) : 1} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
