/* ═══════════════════════════════════════════════════════════════════════
   MultiNotePopover — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function MultiNotePopover({ payload, onClose, onPick }) {
  if (!payload) return null;
  const { groupIds, x, y } = payload;
  const notes = groupIds.map(gid => NoteStore.get(gid)).filter(Boolean);
  if (notes.length === 0) return null;
  const popW = 320;
  const px = Math.max(8, Math.min(x - popW / 2, window.innerWidth - popW - 8));
  const py = Math.max(8, y + 12);
  return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "multinote-overlay", onClick: onClose }),
    React.createElement("div", { className: "multinote-popover", style: { left: px, top: py, width: popW } },
      React.createElement("div", { className: "multinote-header" }, notes.length, " notes here"),
      notes.map(n => {
        const swatchBg = ({
          yellow: '#ffd700', green: '#76ff03', pink: '#ff4081', red: '#f44336',
          orange: '#ff9100', blue: '#2196f3', purple: '#ba68c8', teal: '#00bcd4',
          brown: '#8d6e63', gray: '#9e9e9e', cyan: '#00bcd4'
        })[n.color] || '#ffd700';
        const noteNbs = (n.notebookIds || []).map(id => NotebookStore.get(id)).filter(Boolean);
        return React.createElement("button", {
          key: n.groupId,
          className: "multinote-row",
          onClick: () => onPick(n.groupId)
        },
          React.createElement("span", { className: "multinote-row-swatch", style: { background: swatchBg } }),
          React.createElement("span", { className: "multinote-row-body" },
            React.createElement("span", { className: "multinote-row-preview" }, n.body || (n.fullText ? "“" + n.fullText + "”" : 'Empty note')),
            React.createElement("span", { className: "multinote-row-meta" },
              relativeDate(n.updated || n.created),
              noteNbs.length > 0 && (' · ' + noteNbs.map(nb => nb.name).join(' · '))
            )
          )
        );
      })
    )
  );
}
