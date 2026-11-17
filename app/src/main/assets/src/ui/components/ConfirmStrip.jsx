/* ═══════════════════════════════════════════════════════════════════════
   ConfirmStrip — Cluster D (esbuild bundle-d.js)
   ───────────────────────────────────────────────────────────────────────
   Standardized two-button delete/remove confirm strip. The "Q? [Cancel]
   [Yes, do it]" pattern used everywhere except the type-DELETE paths
   (journal entry, settings nuke) and the still-instant tab close.

   The kit's one confirm (.ui-confirm, app.css "one confirm"): the question,
   any lines under it, then Cancel (a text button) and the act (a danger
   button, or the primary one for a go). It wraps: at large text the two
   buttons drop under the words instead of squeezing them. `card` draws it
   as its own surface card (a strip that stands alone in a list).

   Props:
     question    Required. String or ReactNode rendered in the question
                 slot.
     yesLabel    Optional. Defaults to "Yes, delete". Use "Yes, remove"
                 for non-permanent removals (link, highlight).
     onCancel    Required. Fires when Cancel is tapped.
     onConfirm   Required. Fires when the Yes button is tapped.
     cancelLabel Optional. Defaults to "Cancel".
     act         Optional. 'danger' (default) or 'go' (primary: nothing is lost).
     disabled    Optional. Disables the act button.
     lines       Optional. Lines under the question: strings, or { text, warn }.
     card        Optional. Its own surface card.
     label       Optional. Names the strip as a group for screen readers.
     back        Optional, default true. Back / Escape answers Cancel.
     focus       Optional, default true. Focus moves to Cancel when it opens.
     className   Optional extra classes appended after "ui-confirm".
     style       Optional inline style on the wrapping div.

   Usage:
     const [confirming, setConfirming] = React.useState(false);
     return confirming
       ? <ConfirmStrip
           question="Delete this bookmark?"
           onCancel={() => setConfirming(false)}
           onConfirm={() => { doDelete(); setConfirming(false); }}
         />
       : <button onClick={() => setConfirming(true)}>Delete</button>;
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{ question: any, yesLabel?: any, cancelLabel?: any, act?: 'danger' | 'go', disabled?: boolean,
 *   lines?: Array<any>, card?: boolean, label?: string, back?: boolean, focus?: boolean,
 *   onCancel: any, onConfirm: any, className?: any, style?: any }} props
 */
export function ConfirmStrip({ question, yesLabel, cancelLabel = 'Cancel', act = 'danger', disabled = false, lines = [],
  card = false, label, back = true, focus = true, onCancel, onConfirm, className, style }) {
  const cls = 'ui-confirm' + (card ? ' is-card' : '') + (className ? ' ' + className : '');
  // W1.5(a.2) — per-instance UNIQUE registry ID via React.useId(): two strips on screen at once (a list's row and its
  // sheet) must not share one Map entry, or unmounting the first drops the second's Back. `back` false keeps a strip
  // that never answered Back (the Downloads boxes) as it was.
  const _id = React.useId();
  useModalRegistry({ id: 'confirm-strip:' + _id, dismiss: onCancel, active: back });
  // n185: the strip replaces the button that opened it, so focus would fall to <body>. It moves to
  // Cancel, the safe answer; preventScroll because the strip sits where the reader just tapped.
  const cancelRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  React.useEffect(() => {
    const b = cancelRef.current;
    if (!focus || !b) return;
    try { b.focus({ preventScroll: true }); } catch (_e) { b.focus(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the strip opens; focus is fixed per site
  }, []);
  return (
    <div className={cls} style={style} role={label ? 'group' : undefined} aria-label={label}>
      <div className="ui-confirm-text">
        <p className="ui-confirm-q">{question}</p>
        {(lines || []).filter(Boolean).map((l, i) => (
          <p key={i} className={'ui-confirm-line' + (l && l.warn ? ' is-warn' : '')}>{l && l.text != null ? l.text : l}</p>
        ))}
      </div>
      <div className="ui-confirm-actions">
        <button ref={cancelRef} type="button" className="ui-btn is-small is-text ui-confirm-cancel" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" disabled={disabled} onClick={onConfirm}
          className={'ui-btn is-small ui-confirm-yes ' + (act === 'go' ? 'is-primary' : 'is-danger')}>{yesLabel || 'Yes, delete'}</button>
      </div>
    </div>
  );
}
