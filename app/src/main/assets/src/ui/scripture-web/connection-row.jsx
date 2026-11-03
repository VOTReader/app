/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/connection-row — the one row every Scripture Web list draws.
   Cluster F (bundle-d)
   ═══════════════════════════════════════════════════════════════════════

   A connection row: a reference, a tag (its votes, its tier, where it
   starts), a one-line preview of the verse text (or a meta line, then the
   verse as `quote`: the chooser's rows), and the row's actions on
   the right ([Open] the verse in the reader, [Follow] the thread there).
   The docked panel (web-panel.jsx) and the no-WebGL list
   (WebFallbackList.jsx) both draw it (digest B1: "reuse the WFL card so the
   main screen and the fallback share one component"); `skin` picks the
   class set, because the fallback keeps its own theme-aware look (.swf-*)
   while the panel is pinned dark (.sw-row-*, spec 4.6).

   The row's main button does the row's own thing (choose that connection,
   open that verse); hover and keyboard focus anywhere on the row call
   `onLight` (the panel lights the row's thread on the canvas, A5) and
   leaving it calls `onLight(null)`.

   A WAY ON (`go`, 2026-11-03): the whole row is the one control, and it
   follows the thread to the verse it names: the reference, its votes, its
   words, and a chevron that says the row goes somewhere. `visited` marks a
   verse the reader has stood at on any of their paths (a small gold ring,
   named for a screen reader in the button's own name).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   title: string, tag?: string, text?: string, quote?: string, skin?: 'panel' | 'fallback',
 *   onMain?: () => void, mainLabel?: string,
 *   onOpen?: () => void, openLabel?: string,
 *   onFollow?: () => void, followLabel?: string,
 *   onLight?: (on: boolean) => void, active?: boolean, mainClass?: string,
 *   go?: boolean, visited?: boolean,
 * }} props
 */
export function ConnectionRow({ title, tag, text, quote, skin = 'panel', onMain, mainLabel, onOpen, openLabel,
  onFollow, followLabel, onLight, active, mainClass, go = false, visited = false }) {
  const fallback = skin === 'fallback';
  // a named row keeps its verse: the name replaces the button's words, so the preview is its
  // description (ideas audit s24.1)
  const textId = React.useId();
  const described = mainLabel && text ? textId : undefined;
  const c = fallback
    ? { li: undefined, main: 'swf-row', top: 'swf-row-top', ref: 'swf-ref', tag: 'swf-tier', text: 'swf-snip' }
    : { li: 'sw-row' + (active ? ' is-on' : '') + (go ? ' sw-row-go' : ''), main: 'sw-row-main', top: 'sw-row-top', ref: 'sw-row-ref', tag: 'sw-row-tag', text: 'sw-row-text' };
  // the chooser and the Nearby list keep their rows' old hooks (.sw-choice-row, .sw-choice-chapter)
  if (mainClass) c.main += ' ' + mainClass;
  const light = onLight ? {
    onMouseEnter: () => onLight(true), onMouseLeave: () => onLight(false),
    onFocus: () => onLight(true),
    onBlur: (/** @type {any} */ e) => { if (!e.currentTarget.contains(e.relatedTarget)) onLight(false); },
  } : {};
  if (go && !fallback) {
    return (
      <li className={c.li} {...light}>
        <button type="button" className={c.main} onClick={onMain} aria-label={mainLabel} aria-describedby={described}>
          <span className="sw-row-go-body">
            <span className={c.top}>
              <span className={c.ref}>{title}</span>
              {tag ? <span className={c.tag}>{tag}</span> : null}
            </span>
            {text != null ? <span className={c.text + ' sw-row-text-go'} id={described}>{text}</span> : null}
          </span>
          {visited ? <i className="sw-row-visited" aria-hidden="true" /> : null}
          <svg className="sw-row-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </li>
    );
  }
  return (
    <li className={c.li} {...light}>
      <button type="button" className={c.main} onClick={onMain} aria-label={mainLabel} aria-describedby={described}>
        <span className={c.top}>
          <span className={c.ref}>{title}</span>
          {tag ? <span className={c.tag}>{tag}</span> : null}
        </span>
        {text != null ? <span className={c.text} id={described}>{text}</span> : null}
        {quote ? <span className={c.text + ' sw-row-quote'}>{quote}</span> : null}
      </button>
      {(onOpen || onFollow) && (
        <span className="sw-row-actions">
          {onOpen && <button type="button" className="sw-row-btn sw-row-open" onClick={onOpen} aria-label={openLabel}>Open</button>}
          {onFollow && <button type="button" className="sw-row-btn sw-row-follow" onClick={onFollow} aria-label={followLabel}>Follow</button>}
        </span>
      )}
    </li>
  );
}
