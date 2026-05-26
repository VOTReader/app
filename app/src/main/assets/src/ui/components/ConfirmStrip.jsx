/* ═══════════════════════════════════════════════════════════════════════
   ConfirmStrip — Cluster D (esbuild bundle-d.js)
   ───────────────────────────────────────────────────────────────────────
   Standardized two-button delete/remove confirm strip. The "Q? [Cancel]
   [Yes, do it]" pattern used everywhere except the type-DELETE paths
   (journal entry, settings nuke) and the still-instant tab close.

   Wraps the long-standing .ann-chip-confirm CSS family — no new styles
   ship with the component. The base CSS already supplies padding 10px
   12px + min-width 220px; sites that want more padding (e.g. action
   sheets at 14px 12px) override via the `style` prop.

   Props:
     question    Required. String or ReactNode rendered in the question
                 slot.
     yesLabel    Optional. Defaults to "Yes, delete". Use "Yes, remove"
                 for non-permanent removals (link, highlight).
     onCancel    Required. Fires when Cancel is tapped.
     onConfirm   Required. Fires when the Yes button is tapped.
     className   Optional extra classes appended after "ann-chip-confirm".
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

export function ConfirmStrip({ question, yesLabel, onCancel, onConfirm, className, style }) {
  const cls = className ? 'ann-chip-confirm ' + className : 'ann-chip-confirm';
  return (
    <div className={cls} style={style}>
      <span className="ann-chip-confirm-q">{question}</span>
      <button
        className="ann-chip-confirm-btn ann-chip-confirm-cancel"
        onClick={onCancel}
      >Cancel</button>
      <button
        className="ann-chip-confirm-btn ann-chip-confirm-yes"
        onClick={onConfirm}
      >{yesLabel || 'Yes, delete'}</button>
    </div>
  );
}
