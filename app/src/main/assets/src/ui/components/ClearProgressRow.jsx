/* ═══════════════════════════════════════════════════════════════════════
   ClearProgressRow — Cluster D (esbuild bundle-d.js)
   ───────────────────────────────────────────────────────────────────────
   One row in the Mark-as-Read progress table. Renders label + tally +
   Clear button; on tap, replaces the row with a ConfirmStrip until the
   user cancels or confirms.

   Owns its own confirm state — the parent (SettingsScreen) just supplies
   the data + the action callback. Standardized via ConfirmStrip so
   "Clear" reads the same way every other delete/remove in the app does.

   Props:
     label    Display label for the book / item.
     total    Total items in the group (denominator).
     count    Items already read (numerator).
     onClear  Called when the user confirms the clear.
   ═══════════════════════════════════════════════════════════════════════ */

export function ClearProgressRow({ label, total, count, onClear }) {
  const [confirming, setConfirming] = React.useState(false);

  if (count === 0) return (
    <div className="progress-row">
      <span className="progress-row-label">{label}</span>
      <span className="progress-row-tally">{"0 / "}{total}</span>
      <button className="settings-clear-btn" disabled>Clear</button>
    </div>
  );

  if (confirming) return (
    <ConfirmStrip
      question={`Clear progress for “${label}”?`}
      yesLabel="Yes, clear"
      onCancel={() => setConfirming(false)}
      onConfirm={() => { onClear(); setConfirming(false); }}
    />
  );

  return (
    <div className="progress-row">
      <span className="progress-row-label">{label}</span>
      <span className="progress-row-tally">{count}{" / "}{total}</span>
      <button className="settings-clear-btn" onClick={() => setConfirming(true)}>Clear</button>
    </div>
  );
}
