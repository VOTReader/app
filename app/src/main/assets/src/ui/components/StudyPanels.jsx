/* ═══════════════════════════════════════════════════════════════════════
   StudyPanels — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function StudyPanels({ scriptures, votNotes, onScriptureClick, onVotLetterClick }) {
  const hasScriptures = scriptures && scriptures.length > 0;
  const hasVot = votNotes && votNotes.length > 0;
  if (!hasScriptures && !hasVot) return null;
  return (
    <div className="study-panels">
      {hasScriptures && (
        <div className="study-panel-group">
          <div className="study-panel-group-title">Scripture References</div>
          <div className="scripture-refs">
            {scriptures.map((s, i) => {
              const hasVerse = !!MATTHEW_NKJV[s.cite];
              return hasVerse ? (
                <button key={i} className="scripture-ref" onClick={() => onScriptureClick && onScriptureClick(s)}>
                  <span className="scripture-ref-tag">{s.ref}</span>
                  <span className="scripture-ref-text">{s.cite}</span>
                  <span className="scripture-ref-chevron">{"›"}</span>
                </button>
              ) : (
                <div key={i} className="scripture-ref scripture-ref-note">
                  <span className="scripture-ref-tag">{s.ref}</span>
                  <span className="scripture-ref-text">{renderCommentaryCite(s.cite)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasVot && (
        <div className="study-panel-group">
          <div className="study-panel-group-title">Volumes of Truth Notes</div>
          <div className="vot-notes">
            {votNotes.map((n, i) => {
              const canTap = onVotLetterClick && !!resolveVotLetter(n.vol, n.letter);
              const hm = isHiddenManna(n);
              const badge = hm ? (
                <span className="vot-note-hm" title={"Hidden Manna — The Word of The Lord Spoken to Timothy"}>HM</span>
              ) : canTap ? (
                <span className="vot-note-chevron">{"›"}</span>
              ) : null;
              const inner = (
                <>
                  <div className="vot-note-header">
                    <span className="vot-note-ref">{n.ref}</span>
                    <span className="vot-note-vol">{n.vol}</span>
                    {badge}
                  </div>
                  <div className="vot-note-letter">"{n.letter}"</div>
                  {n.excerpt && <div className="vot-note-excerpt">{n.excerpt}</div>}
                </>
              );

              return canTap ? (
                <button key={i} className="vot-note vot-note-tappable" onClick={() => onVotLetterClick(n.vol, n.letter, n.excerpt)}>{inner}</button>
              ) : (
                <div key={i} className="vot-note">{inner}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
