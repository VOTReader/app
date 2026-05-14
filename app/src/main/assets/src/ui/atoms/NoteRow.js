function NoteRow({ note, onTap }) {
  const sourceLabel = noteSourceLabel(note);
  const date = relativeDate(note.updated || note.created);
  const noteNbs = (note.notebookIds || []).map(id => NotebookStore.get(id)).filter(Boolean);
  const swatchBg = ({
    yellow: '#ffd700', green: '#76ff03', pink: '#ff4081', red: '#f44336',
    orange: '#ff9100', blue: '#2196f3', purple: '#ba68c8', teal: '#00bcd4',
    brown: '#8d6e63', gray: '#9e9e9e', cyan: '#00bcd4'
  })[note.color] || '#ffd700';
  return React.createElement("button", { className: "note-row", onClick: () => onTap(note) },
    React.createElement("span", { className: "note-row-swatch", style: { background: swatchBg } }),
    React.createElement("span", { className: "note-row-body" },
      React.createElement("span", { className: "note-row-source-line" },
        React.createElement("span", { className: "note-row-source" }, sourceLabel),
        date && React.createElement("span", { className: "note-row-date" }, date)
      ),
      note.body && React.createElement("span", { className: "note-row-preview" }, note.body),
      note.fullText && React.createElement("span", { className: "note-row-anchor" }, "“", note.fullText, "”"),
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
