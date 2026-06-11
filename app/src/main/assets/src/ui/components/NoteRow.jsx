/* ═══════════════════════════════════════════════════════════════════════
   NoteRow — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';

export function NoteRow({ note, onTap }) {
  const sourceLabel = noteSourceLabel(note);
  const date = relativeDate(note.updated || note.created);
  const noteNbs = (note.notebookIds || []).map(id => NotebookStore.get(id)).filter(Boolean);
  const swatchBg = ({
    yellow: '#ffd700', green: '#76ff03', pink: '#ff4081', red: '#f44336',
    orange: '#ff9100', blue: '#2196f3', purple: '#ba68c8', teal: '#00bcd4',
    brown: '#8d6e63', gray: '#9e9e9e', cyan: '#00bcd4'
  })[note.color] || '#ffd700';
  const Exp = typeof JrnExpandable !== 'undefined' ? JrnExpandable : null;
  const bodyText = note.body || '';
  const anchorText = normalizeExcerptDisplay(note.fullText);
  return (
    <div
      className="note-row"
      role="button"
      tabIndex={0}
      onClick={() => onTap(note)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(note); } }}
    >
      <span className="note-row-swatch" style={{ background: swatchBg }} />
      <span className="note-row-body">
        <span className="note-row-source-line">
          <span className="note-row-source">{sourceLabel}</span>
          {date && <span className="note-row-date">{date}</span>}
        </span>
        {bodyText && (Exp && bodyText.length > 160
          ? <Exp text={bodyText} threshold={160} className="note-row-preview note-row-preview-expandable" tapToToggle={true} />
          : <span className="note-row-preview">{bodyText}</span>)}
        {anchorText && (Exp && anchorText.length > 160
          ? <Exp text={"“" + anchorText + "”"} threshold={160} className="note-row-anchor note-row-anchor-expandable" tapToToggle={true} />
          : <span className="note-row-anchor">{"“"}{anchorText}{"”"}</span>)}
        {noteNbs.length > 0 && (
          <span className="note-row-tags">
            {noteNbs.slice(0, 2).map(nb => (
              <span key={nb.id} className="note-row-nb">
                <svg className="note-row-nb-icon" viewBox="0 0 24 24">
                  <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" />
                  <polyline points="15 4 15 9 20 9" />
                </svg>
                {nb.name}
              </span>
            ))}
            {noteNbs.length > 2 && <span className="note-row-nb">{"+"}{noteNbs.length - 2}</span>}
          </span>
        )}
      </span>
    </div>
  );
}
