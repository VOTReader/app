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
   and lifts its opacity on the pressed one; aria-hidden, so a screen reader hears the
   label and never an unlabelled image before it). Tapping a view while
   the notes are hidden turns them on in that view; Off hides them; tapping the
   pressed segment does nothing.

   `mode` ('pdf' | 'inline') and `showStudy` are per-tab fields (hooks/use-tabs)
   — the two callbacks write them; this component holds no state of its own.
   ═══════════════════════════════════════════════════════════════════════ */

import { Segmented } from './UiParts.jsx';

export function ModeToggle({ mode, onChange, showStudy, onShowStudyChange }) {
  const isPdf = mode === 'pdf';
  const current = !showStudy ? 'off' : (isPdf ? 'pdf' : 'inline');
  const pick = (/** @type {string} */ next) => {
    if (next === current) return;
    if (next === 'off') { onShowStudyChange(false); return; }
    if (!showStudy) onShowStudyChange(true);
    if (next !== (isPdf ? 'pdf' : 'inline')) onChange(next);
  };
  // r-study (W2h): under the title, in words, in the page (it floated over the Scripture as "PDF / Inline / Off").
  return (
    <div className="rd-study-switch">
      <div className="rd-study-label" aria-hidden="true">Study notes</div>
      <Segmented label="Study notes" value={current} onChange={pick}
        options={[{ id: 'inline', label: 'In the text' }, { id: 'pdf', label: 'As the page' }, { id: 'off', label: 'Off' }]} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INLINE NOTES COMPONENT
═══════════════════════════════════════════════════════════════ */
// Commentary cites (non-lookup scripture notes) may embed inline refs like
// "(Matthew 11:14)". Detect Book-Ch:Vs patterns and style them gold.
// `onRef`: they are gold in the class every tappable reference has, and did
// nothing when tapped; handed a way to open one, each is a tap target, as in
// render-text.jsx (reading-flow hunt, 2026-11-04).
export function renderCommentaryCite(text, onRef = null) {
  if (!text) return text;
  // Matches "Matthew 11:14", "1 John 2:15-17", "Psalm 22:1", "Revelation 21:9, 22:17", etc.
  // The tail takes a range or a comma's verse (or chapter:verse), never the number a
  // following book starts with: the old [-,\s\d]+ read "Ephesians 1:22, 1" and left
  // "Corinthians 12:13" (and dropped ":17" from "21:9, 22:17").
  const rx = /\b((?:[123]\s)?[A-Z][a-z]+(?:\s+[A-Za-z]+)*\s+\d+:\d+(?:\s*[-–]\s*\d+(?::\d+)?|\s*,\s*\d+(?::\d+)?(?!\s*[A-Za-z\d]))*)/g;
  const parts = [];
  let last = 0,m;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const ref = m[0];
    parts.push(onRef
      ? <a key={m.index} className="inline-scrip-ref" href="#" aria-haspopup="dialog" title={ref} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRef(ref); }}>{ref}</a>
      : <span key={m.index} className="inline-scrip-ref">{ref}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
