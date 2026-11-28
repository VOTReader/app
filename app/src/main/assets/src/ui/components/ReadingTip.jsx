/* ═══════════════════════════════════════════════════════════════════════
   ReadingTip — the one tip, at the end of a finished reading (newcomer, 2026-11-27)
   ═══════════════════════════════════════════════════════════════════════
   A reader who skipped the tour never learns the one gesture nothing else on screen reveals: press and hold a line
   to highlight it or write a note. So the first time they finish a reading, one line says so, under "Read / Undo"
   and above the footnotes: app ground, never over the text. Once: it stays on the page it came up on, and "Got it"
   or leaving that page ends it for good (AnnHintDismissedFlagStore, shared with the More menu's row). Only for a
   reader who never took the tour and has not yet highlighted, noted or bookmarked anything; and only in a session
   nothing else unasked has spoken in (utils/unasked.js). Wording cleared by the hub 2026-11-27 ("Tip", not "One tip").
   ═══════════════════════════════════════════════════════════════════════ */
import { useAnnotationHintWanted } from './AnnotationHint.jsx';
import { useUnasked } from '../../hooks/use-unasked.js';

/** The page the tip came up on this session; null until it has. */
let _tipUnit = /** @type {string | null} */ (null);
/** Tests only. */
export function _resetReadingTip() { _tipUnit = null; }

function _done() {
  const g = /** @type {any} */ (globalThis);
  try { if (g.AnnHintDismissedFlagStore) g.AnnHintDismissedFlagStore.set(); } catch (_e) { /* no store: it asks again */ }
}

/**
 * @param {{ unitKey: string, finished: boolean, inert?: boolean }} props
 */
export function ReadingTip({ unitKey, finished, inert = false }) {
  const g = /** @type {any} */ (globalThis);
  const hintWanted = useAnnotationHintWanted();
  let tourDone = true;
  try { tourDone = !g.TourDoneFlagStore || g.TourDoneFlagStore.is(); } catch (_e) { /* no store: no tip */ }
  const [gone, setGone] = React.useState(false);
  const here = _tipUnit == null || _tipUnit === unitKey;
  const wanted = !inert && !gone && finished && hintWanted && !tourDone && here;
  // This reading is finished even before its read mark is stored (the mark is written a moment after the tap).
  const show = useUnasked('tip', wanted, true, 1);
  React.useEffect(() => {
    if (!show) return undefined;
    _tipUnit = unitKey;
    return () => { _done(); };   // leaving the page it came up on: taught
  }, [show, unitKey]);
  if (!show) return null;
  return (
    <div className="tour-prompt tour-strip tour-inline reading-tip" role="note" aria-labelledby={'reading-tip-' + unitKey}>
      <p className="ui-label tour-prompt-kicker">Tip</p>
      <p className="tour-prompt-text" id={'reading-tip-' + unitKey}>
        <span className="tour-prompt-title">Press and hold any line</span>
        <span className="tour-prompt-meta">to highlight it, or to write a note beside it.</span>
      </p>
      <div className="tour-row">
        <button type="button" className="tour-btn quiet" onClick={() => { _done(); setGone(true); }}>Got it</button>
      </div>
    </div>
  );
}
