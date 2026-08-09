/* ═══════════════════════════════════════════════════════════════════════
   InlineNotes — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Annotation contract mirrors StudyPanels (2026-08-09): non-interactive
   study prose carries data-hl-key + data-hl-dom + StaticSubtree; tappable
   rows stay navigation chrome. `hlKeyBase` is the verse's own study key
   ('study:matthew-5:12') — suffixes keep these containers distinct from
   the verse text container that owns the bare key. */

export function InlineNotes({ scriptures, votNotes, onScriptureClick, onVotLetterClick, hlKeyBase }) {
  if (!scriptures.length && !votNotes.length) return null;
  const ann = (suffix) => hlKeyBase ? { 'data-hl-key': hlKeyBase + '-' + suffix, 'data-hl-dom': true } : {};
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
          <div key={hlKeyBase ? hlKeyBase + '-s' + i : `s${i}`} className="inline-note-scripture inline-note-plain" {...ann('s' + i)}>
            <StaticSubtree>
              <span className="inline-note-tag">{s.ref}</span>
              <span className="inline-note-cite">{renderCommentaryCite(s.cite)}</span>
            </StaticSubtree>
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
          <div key={hlKeyBase ? hlKeyBase + '-v' + i : `v${i}`} className="inline-vot-note" {...ann('v' + i)}>
            <StaticSubtree>{inner}</StaticSubtree>
          </div>
        );

      })}
    </div>
  );

}
