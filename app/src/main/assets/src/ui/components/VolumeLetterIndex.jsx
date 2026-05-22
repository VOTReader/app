/* ═══════════════════════════════════════════════════════════════════════
   VolumeLetterIndex — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function VolumeLetterIndex({ volumeTitle, eyebrow, letters, preface, onSelect, onSelectPreface, currentLetter, isRead, markAsReadEnabled, columns }) {
  const currentRef = React.useRef(null);
  React.useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, []);
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
            {markAsReadEnabled && isRead(preface.id) && (
              <span className="read-check" style={{ marginLeft: '0.4rem' }}>{"✓"}</span>
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
              {markAsReadEnabled && isRead(letter.id) && (
                <span className="read-check" style={{ marginLeft: '0.4rem' }}>{"✓"}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
