/* ═══════════════════════════════════════════════════════════════════════
   ModeToggle — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The "Study Notes" control on the Matthew Study Bible: PDF | Inline | Off.

   THREE SEGMENTS, ALWAYS ON SCREEN, ONE PRESSED (Corbin, 2026-09-11, via the
   Orchestrator). This used to be one button whose label was the CURRENT mode
   — it read "PDF" while you were in PDF mode and tapping it took you to
   Inline; hidden, it collapsed to a single "Show". On a touch screen there is
   no tooltip to explain that, and the 17:5x audit found it the one either-or
   control in the app that shows one label. Now the control is the same grammar
   the Scripture Web's "Scripture | My web" pair uses: every view is named, the
   pressed one (aria-pressed, the gold fill) is where the reader IS, and each
   segment names a VIEW — never an action like Show or Hide — and keeps the glyph
   the old pill drew for it (lines, pen, circle-slash; app.css sizes .mode-btn svg
   and lifts its opacity on the pressed one). Tapping a view while
   the notes are hidden turns them on in that view; Off hides them; tapping the
   pressed segment does nothing.

   `mode` ('pdf' | 'inline') and `showStudy` are per-tab fields (hooks/use-tabs)
   — the two callbacks write them; this component holds no state of its own.
   ═══════════════════════════════════════════════════════════════════════ */

export function ModeToggle({ mode, onChange, showStudy, onShowStudyChange }) {
  const isPdf = mode === 'pdf';
  const current = !showStudy ? 'off' : (isPdf ? 'pdf' : 'inline');
  const pick = (next) => {
    if (next === current) return;
    if (next === 'off') { onShowStudyChange(false); return; }
    if (!showStudy) onShowStudyChange(true);
    if (next !== (isPdf ? 'pdf' : 'inline')) onChange(next);
  };
  const seg = (id, label, title, glyph) => (
    <button
      type="button"
      className={'mode-btn' + (current === id ? ' active' : '')}
      aria-pressed={current === id}
      onClick={() => pick(id)}
      title={title}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{glyph}</svg>
      {label}
    </button>
  );
  // The caption floats over scripture with no other context — without it a
  // first-time reader can't tell what "PDF / Inline / Off" applies to
  // (tooltips don't exist on touch). It labels the group for a screen reader too.
  return (
    <div className="mode-toggle-wrap">
      <div className="mode-toggle-label" id="mode-toggle-caption">Study Notes</div>
      <div className="mode-toggle" role="group" aria-labelledby="mode-toggle-caption">
        {seg('pdf', 'PDF', 'Study notes as the PDF page', <path d="M2 6h20M2 12h20M2 18h12" />)}
        <div className="mode-divider" />
        {seg('inline', 'Inline', 'Study notes in the text', <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />)}
        <div className="mode-divider" />
        {seg('off', 'Off', 'No study notes, references, or further reading', <><circle cx="12" cy="12" r="9" /><line x1="4.5" y1="4.5" x2="19.5" y2="19.5" /></>)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INLINE NOTES COMPONENT
═══════════════════════════════════════════════════════════════ */
// Commentary cites (non-lookup scripture notes) may embed inline refs like
// "(Matthew 11:14)". Detect Book-Ch:Vs patterns and style them gold.
export function renderCommentaryCite(text) {
  if (!text) return text;
  // Matches "Matthew 11:14", "1 John 2:15-17", "Psalm 22:1", etc.
  const rx = /\b((?:[123]\s)?[A-Z][a-z]+(?:\s+[A-Za-z]+)*\s+\d+:\d+(?:[-,\s\d]+)?)\b/g;
  const parts = [];
  let last = 0,m;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<span key={m.index} className="inline-scrip-ref">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
