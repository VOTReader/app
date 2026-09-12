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
   segment names a VIEW — never an action like Show or Hide. Tapping a view while
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
  const seg = (id, label, title) => (
    <button
      type="button"
      className={'mode-btn' + (current === id ? ' active' : '')}
      aria-pressed={current === id}
      onClick={() => pick(id)}
      title={title}
    >{label}</button>
  );
  // The caption floats over scripture with no other context — without it a
  // first-time reader can't tell what "PDF / Inline / Off" applies to
  // (tooltips don't exist on touch). It labels the group for a screen reader too.
  return (
    <div className="mode-toggle-wrap">
      <div className="mode-toggle-label" id="mode-toggle-caption">Study Notes</div>
      <div className="mode-toggle" role="group" aria-labelledby="mode-toggle-caption">
        {seg('pdf', 'PDF', 'Study notes as the PDF page')}
        <div className="mode-divider" />
        {seg('inline', 'Inline', 'Study notes in the text')}
        <div className="mode-divider" />
        {seg('off', 'Off', 'No study notes, references, or further reading')}
      </div>
    </div>
  );
}
