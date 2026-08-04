/* ═══════════════════════════════════════════════════════════════════════
   VolumeLetterIndex — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Read marks are COUNT-aware (2026-08-03): a re-read letter shows ✓ ×N.
   Rendered as one shared element so every index surface stays identical. */
export function ReadCheck({ count }) {
  if (!count) return null;
  return (
    <span className="read-check" style={{ marginLeft: '0.4rem' }} aria-label={count > 1 ? `Read ${count} times` : 'Read'}>
      {"✓"}
      {count > 1 && <span className="read-check-count" aria-hidden="true">{"×" + count}</span>}
    </span>
  );
}

export function VolumeLetterIndex({ volumeTitle, eyebrow, letters, preface, onSelect, onSelectPreface, currentLetter, isRead, readCount, progressKeyFor, markAsReadEnabled, columns }) {
  const currentRef = React.useRef(null);
  React.useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, []);
  // "~N min" estimate per row, at the user's measured pace when one exists
  // (ReadingStatsStore, bundle-b) — 230-wpm default otherwise. Hidden when
  // the counters are absent or the item shape yields no words. Single-column
  // rows only: the two-col cards are centered compact stacks with no row end
  // to pin a chip to.
  const _wpm = (typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.measuredWpm === 'function') ? ReadingStatsStore.measuredWpm() : null;
  // Smart-resume chip ([26], 2026-08-03): an IN-PROGRESS item (the tracker
  // left a frontier) shows how far in and what remains — "62% · ~2 min left" —
  // instead of the cold total. progressKeyFor threads the SAME v1:<bid>:<cid>
  // key the tracker records under; absent (legacy caller) → cold chip only.
  const minChip = (item, itemId) => {
    if (typeof countItemWords !== 'function' || typeof readingMinutes !== 'function') return null;
    const words = countItemWords(item);
    if (words <= 0) return null;
    if (itemId != null && progressKeyFor
        && typeof ReadingStatsStore !== 'undefined' && typeof ReadingStatsStore.getProgress === 'function') {
      let p = null;
      try { p = ReadingStatsStore.getProgress(progressKeyFor(itemId)); } catch (_e) { /* stats optional */ }
      if (p && p.b > 0 && p.c && p.c.length > 0 && p.c.length < p.b) {
        const weighted = p.tw > 0 && p.w >= 0 && p.w < p.tw;
        const fraction = weighted ? p.w / p.tw : p.c.length / p.b;
        const pct = Math.min(99, Math.round(fraction * 100));
        const leftWords = weighted ? p.tw - p.w : Math.round(words * (1 - fraction));
        const left = readingMinutes(leftWords, _wpm);
        return <span className="idx-min-chip in-progress">{pct}% · ~{left} min left</span>;
      }
    }
    const m = readingMinutes(words, _wpm);
    return m > 0 ? <span className="idx-min-chip">~{m} min</span> : null;
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
      </div>
      <div className={`chapter-cards${columns === 2 ? " two-col" : ""}`}>
        {preface && (columns === 2 ? (
          <button className="chapter-card-btn" onClick={() => onSelectPreface && onSelectPreface(preface.id)}>
            <div className="two-col-inner">
              <div className="two-col-num">0</div>
              <div className="two-col-title">{preface.title}</div>
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
