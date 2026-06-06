/* ═══════════════════════════════════════════════════════════════════════
   SettingsRow — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function SettingsRow({ label, desc = null, checked, onToggle, disabled = false, disabledReason = null }) {
  // Compact layout (Settings Option B): label + toggle on a single line; the
  // (often long) description is hidden behind the ⓘ button and revealed on tap.
  const [showDesc, setShowDesc] = React.useState(false);
  return (
    <div className={`settings-row${disabled ? " settings-row-disabled" : ""}`}>
      <div className="settings-row-head">
        <span className="settings-row-label">{label}</span>
        {desc && (
          <button
            type="button"
            className="settings-info-btn"
            aria-label={showDesc ? "Hide description" : "Show description"}
            aria-expanded={showDesc}
            onClick={(e) => { e.stopPropagation(); setShowDesc((v) => !v); }}
          >i</button>
        )}
        <span className="settings-row-grow" />
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={checked}
            disabled={!!disabled}
            onChange={disabled ? undefined : onToggle}
          />
          <div className="settings-toggle-track" />
          <div className="settings-toggle-thumb" />
        </label>
      </div>
      {showDesc && desc && <div className="settings-row-desc">{desc}</div>}
      {disabled && disabledReason && (
        <div className="settings-row-disabled-hint">{disabledReason}</div>
      )}
    </div>
  );
}
