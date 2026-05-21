/* ═══════════════════════════════════════════════════════════════════════
   NoteRow — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

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
  const anchorText = note.fullText || '';
  return React.createElement("div", {
    className: "note-row",
    role: "button",
    tabIndex: 0,
    onClick: () => onTap(note),
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(note); } }
  },
    React.createElement("span", { className: "note-row-swatch", style: { background: swatchBg } }),
    React.createElement("span", { className: "note-row-body" },
      React.createElement("span", { className: "note-row-source-line" },
        React.createElement("span", { className: "note-row-source" }, sourceLabel),
        date && React.createElement("span", { className: "note-row-date" }, date)
      ),
      bodyText && (Exp && bodyText.length > 160
        ? React.createElement(Exp, { text: bodyText, threshold: 160, className: "note-row-preview note-row-preview-expandable", tapToToggle: true })
        : React.createElement("span", { className: "note-row-preview" }, bodyText)),
      anchorText && (Exp && anchorText.length > 160
        ? React.createElement(Exp, { text: "“" + anchorText + "”", threshold: 160, className: "note-row-anchor note-row-anchor-expandable", tapToToggle: true })
        : React.createElement("span", { className: "note-row-anchor" }, "“", anchorText, "”")),
      noteNbs.length > 0 && React.createElement("span", { className: "note-row-tags" },
        noteNbs.slice(0, 2).map(nb => React.createElement("span", { key: nb.id, className: "note-row-nb" },
          React.createElement("svg", { className: "note-row-nb-icon", viewBox: "0 0 24 24" },
            React.createElement("path", { d: "M4 4h11l5 5v11a1 1 0 0 1-1 1H4z" }),
            React.createElement("polyline", { points: "15 4 15 9 20 9" })
          ),
          nb.name
        )),
        noteNbs.length > 2 && React.createElement("span", { className: "note-row-nb" }, "+", noteNbs.length - 2)
      )
    )
  );
}
