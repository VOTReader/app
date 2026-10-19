/* ═══════════════════════════════════════════════════════════════════════
   BackHintPill — the "‹ Back to …" pill above a reading view
   ═══════════════════════════════════════════════════════════════════════
   Drawn by LetterView, WtlbEntryView, BibleChapterView and ChapterView (the
   four had the same markup, copied). The pill names where the back goes: a
   tap-through's source letter, or the search results (screen-routes'
   _readerBackHint, search200 UX B1).

   TWO CASES, ONE LABEL (Track D). The lead ("‹ Back to") is Cinzel capitals;
   a place's TITLE sits after it in its own case, italic, since it is a real
   name ("Volume Two · The Last Trump"). A destination named by a word rather
   than a title (`plain`: the results) is no name to set apart: it reads whole
   in the lead's case, "‹ BACK TO RESULTS", like the app's other pills. In the
   title slot it read "BACK TO results".
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{ backHint: { title: string, volumeLabel?: string | null, plain?: boolean } | null | undefined,
 *   onClick: () => void }} props
 */
export function BackHintPill({ backHint, onClick }) {
  if (!backHint) return null;
  const place = backHint.volumeLabel ? backHint.volumeLabel + ' · ' + backHint.title : backHint.title;
  return (
    <div className="back-hint-row">
      <button className="back-hint-pill" onClick={onClick} aria-label={'Back to ' + place}>
        {backHint.plain
          ? <span className="back-hint-lead"><span className="back-hint-arrow">‹</span>Back to {place}</span>
          : <><span className="back-hint-lead"><span className="back-hint-arrow">‹</span>Back to</span>{' '}
            <span className="back-hint-title">{place}</span></>}
      </button>
    </div>
  );
}
