/* ===================================================================
   Search helpers — currently just srchGroupKey (used by SearchScreen to bucket results by volume/collection)
   ===================================================================
   Global-scope module. Concatenates with index.html via <script src>.
   Bundled helpers (P5e):
   - srchGroupKey
   =================================================================== */


export function srchGroupKey(doc) {
  if (!doc) return 'other';
  const k = doc.kind;
  if (k === 'verse' || k === 'chapter-title' || k === 'heading') return doc.bookId === 'matthew' ? 'matthew' : 'bible';
  if (k === 'study-note' || k === 'cross-ref') return 'matthew-study';
  if (k === 'letter' || k === 'letter-title' || k === 'footnote') return doc.volumeId || 'letters';
  if (k === 'wtlb' || k === 'wtlb-title') return doc.volumeId || 'wtlb';
  if (k === 'blessed' || k === 'blessed-title') return 'blessed';
  if (k === 'holy-day' || k === 'holy-day-title') return 'holydays';
  if (k === 'bible-study') return 'bible-studies';
  return 'other';
}

