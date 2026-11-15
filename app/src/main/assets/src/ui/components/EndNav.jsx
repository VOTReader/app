/* EndNav: the two cards that end a letter, a chapter or an entry, Previous on the left and Next on the right.
   One part for LetterView, ChapterView, BibleChapterView and WtlbEntryView (vot-ui 11-15; each drew its own copy).
   A side with nowhere to go draws nothing: the other card takes the row (the grid's auto-fit tracks collapse), where
   the copies drew a dimmed card holding a dash that looked pressable and was not. */

/**
 * @typedef {{ label: string, title: any, onClick?: () => void, href?: string }} EndNavSide
 *   label  the small line ("Next letter", "Previous · Volume Two")
 *   title  the place's name
 *   href   a page outside the app (a letter not in the app yet); else onClick
 */

/** @param {{ side: EndNavSide, next: boolean }} props */
function EndNavCard({ side, next }) {
  const cls = 'bottom-nav-card' + (next ? ' next' : '');
  const body = (
    <>
      <div className="bottom-nav-label">{side.label}</div>
      <div className="bottom-nav-title">{side.title}</div>
    </>
  );
  if (side.href) return <a className={cls} href={side.href} target="_blank" rel="noopener noreferrer">{body}</a>;
  return <button type="button" className={cls} onClick={side.onClick}>{body}</button>;
}

/** @param {{ prev?: EndNavSide | null, next?: EndNavSide | null }} props */
export function EndNav({ prev = null, next = null }) {
  return (
    <div className="bottom-nav">
      {prev ? <EndNavCard side={prev} next={false} /> : null}
      {next ? <EndNavCard side={next} next /> : null}
    </div>
  );
}
