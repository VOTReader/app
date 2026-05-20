/* ═══════════════════════════════════════════════════════════════════════
   HistoryEntryCard — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function HistoryEntryCard({ entry, onSelect }) {
  const isLetter = entry.type === 'letter';
  const isStudy = entry.type === 'study-chapter';
  const num = isLetter ? entry.letterNum : entry.chapterNum;
  const title = isLetter ? entry.letterTitle : entry.chapterTitle || null;
  const _volCol = entry.volumeScreen ? COL_BY_INDEX_SC.get(entry.volumeScreen) : null;
  const cardLabel = isStudy ?
  studyAbbrev(entry.studySlug, entry.studyTitle) :
  isLetter ? entry.volume === 1 ? 'Volume One' : _volCol ? _volCol.label : 'Volume Two' : entry.bookTitle;
  const fallback = isLetter ? `Letter ${num}` : isStudy ? `Part ${num}` : `Chapter ${num}`;
  return (/*#__PURE__*/
    React.createElement("button", { className: "chapter-card-btn", onClick: () => onSelect(entry) }, /*#__PURE__*/
    React.createElement("span", { className: "chapter-card-num" }, num), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-divider" }), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-info" }, /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-label" }, cardLabel), /*#__PURE__*/
    React.createElement("div", { className: "chapter-card-title" }, title || fallback)
    ), /*#__PURE__*/
    React.createElement("div", { className: "history-entry-time" }, timeAgo(entry.ts))
    ));

}
