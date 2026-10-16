/* CouldNotOpen - a page with nothing to show (v2-gaps 39): "This <what> could not be opened.", and Try again when what it
   shows did not load (offline before it was ever kept, a bundle that never ran): main's routes offer Try again there
   (screen-routes.jsx _corpusView, _deadStudy). A page its loaded corpus does not have gets no Try again: asking again
   cannot help. */

/** @param {{ what: string, retry?: (() => void) | null }} props */
export function CouldNotOpen({ what, retry = null }) {
  return (
    <div className="empty">
      <div className="t">This {what} could not be opened.</div>
      {retry ? <button type="button" className="btn2" onClick={retry}>Try again</button> : null}
    </div>
  );
}
