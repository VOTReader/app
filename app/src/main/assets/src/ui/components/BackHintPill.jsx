/* ═══════════════════════════════════════════════════════════════════════
   BackHintPill — the "‹ Back to …" pill above a reading view
   ═══════════════════════════════════════════════════════════════════════
   Drawn by LetterView, WtlbEntryView, BibleChapterView and ChapterView (the
   four had the same markup, copied). The pill names where the back goes: a
   tap-through's source letter, or the search results (screen-routes'
   _readerBackHint, search200 UX B1).

   TWO CASES, ONE LABEL (Track D). Since FINAL1 (2026-11-11) the pill is a
   plain row in sentence case ("‹ Back to Matthew 1"); a place's TITLE keeps
   its own span so it can ellipsize, and a destination named by a word
   (`plain`: the results) reads whole in the lead.

   CHILDREN ride in the row after the pill: the reading views hang their
   MiniTitleBand there, so the band pins under the "Back to" row (B10 item 1).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{ backHint: { title: string, volumeLabel?: string | null, plain?: boolean } | null | undefined,
 *   onClick: () => void, children?: import('react').ReactNode }} props
 */
export function BackHintPill({ backHint, onClick, children }) {
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
      {children}
    </div>
  );
}
