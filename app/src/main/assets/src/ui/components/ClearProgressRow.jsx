/* ═══════════════════════════════════════════════════════════════════════
   ClearProgressRow — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ClearProgressRow({ label, total, count, stage, onTap }) {
  if (count === 0) return (
    <div className="progress-row">
      <span className="progress-row-label">{label}</span>
      <span className="progress-row-tally">{"0 / "}{total}</span>
      <button className="settings-clear-btn" disabled>Clear</button>
    </div>
  );

  return (
    <div className="progress-row">
      <span className="progress-row-label">{label}</span>
      <span className="progress-row-tally">{count}{" / "}{total}</span>
      <button className={CLEAR_CLASSES[stage]} onClick={onTap}>{CLEAR_LABELS[stage]}</button>
    </div>
  );
}
