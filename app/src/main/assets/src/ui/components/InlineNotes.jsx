/* ═══════════════════════════════════════════════════════════════════════
   InlineNotes — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function InlineNotes({ scriptures, votNotes, onScriptureClick, onVotLetterClick }) {
  if (!scriptures.length && !votNotes.length) return null;
  return (
    <div className="inline-notes">
      {scriptures.map((s, i) => {
        const hasVerse = !!MATTHEW_NKJV[s.cite];
        return hasVerse ? (
          <button key={`s${i}`} className="inline-note-scripture" onClick={() => onScriptureClick && onScriptureClick(s)}>
            <span className="inline-note-tag">{s.ref}</span>
            <span className="inline-note-cite">{s.cite}</span>
            <span className="inline-note-chevron">{"›"}</span>
          </button>
        ) : (
          <div key={`s${i}`} className="inline-note-scripture inline-note-plain">
            <span className="inline-note-tag">{s.ref}</span>
            <span className="inline-note-cite">{renderCommentaryCite(s.cite)}</span>
          </div>
        );

      })}
      {votNotes.map((n, i) => {
        const canTap = onVotLetterClick && !!resolveVotLetter(n.vol, n.letter);
        const hm = isHiddenManna(n);
        const badge = hm ? (
          <span className="inline-vot-hm" title="Hidden Manna — The Word of The Lord Spoken to Timothy">HM</span>
        ) : canTap ? (
          <span className="inline-vot-chevron">{"›"}</span>
        ) : null;
        const inner = (
          <>
            <div className="inline-vot-header">
              <span className="inline-vot-ref">{n.ref}</span>
              <span className="inline-vot-vol">{n.vol}</span>
              {badge}
            </div>
            <div className="inline-vot-letter">{"\""}{n.letter}{"\""}</div>
            {n.excerpt && <div className="inline-vot-excerpt">{n.excerpt}</div>}
          </>
        );

        return canTap ? (
          <button
            key={`v${i}`}
            className="inline-vot-note inline-vot-note-tappable"
            onClick={() => onVotLetterClick(n.vol, n.letter, n.excerpt)}
          >
            {inner}
          </button>
        ) : (
          <div key={`v${i}`} className="inline-vot-note">{inner}</div>
        );

      })}
    </div>
  );

}
